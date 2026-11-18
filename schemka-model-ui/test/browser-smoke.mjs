import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { openFileDialog } from './browser-files.mjs';

class BlockedError extends Error {}

async function run() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new BlockedError('Playwright is not installed. Run npm ci --ignore-scripts, then npm exec playwright install chromium.');
  }

  const server = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit']
  });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Renderer server did not become ready within 10 seconds.')), 10_000);
      server.stdout.setEncoding('utf8');
      server.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/schemka-model-ui\/index\.html/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Renderer server exited before ready (${code}).`)); });
    });

    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new BlockedError(`Chromium runtime is unavailable: ${error.message}. Run npm exec playwright install chromium and install the documented Linux system dependencies.`);
    }
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10_000);
    const pageErrors = [], failedRequests = [], watch = target => {
      target.on('pageerror', error => pageErrors.push(error.message));
      target.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
      target.on('requestfailed', request => failedRequests.push(request.url()));
      target.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
    };
    watch(page);

    const saveThroughBrowser = async () => {
      await openFileDialog(page);
      const pending = page.waitForEvent('download');
      await page.locator('#save-project').click();
      const download = await pending;
      const bytes = await readFile(await download.path());
      await page.locator('#file-dialog [data-close]').click();
      return bytes;
    };

    await page.goto(url);
    await page.locator('#canvas .node').first().waitFor();
    await page.waitForFunction(() => document.querySelector('#file-state')?.dataset.dirty === 'false');
    assert.equal(await page.locator('#file-state').textContent(), 'Учебный пример · файл не скачан');

    const initialBytes = await saveThroughBrowser();
    const initial = deserializeProjectFile(initialBytes);
    assert.equal(initial.views.length, 2, 'synthetic demo starts with two views');
    assert.ok(initial.relationships.length > 0, 'synthetic demo contains relationships');
    const firstConcepts = new Set(initial.views[0].occurrences.map(item => item.concept.id));
    assert.ok(initial.views[1].occurrences.some(item => firstConcepts.has(item.concept.id)), 'both views share a concept');
    const initialViewIds = initial.views.map(item => item.view.id);
    const initialHistory = await page.locator('#history-state').textContent();

    await page.locator('#new-view').click();
    await page.locator('#new-view-name').fill('Cancelled view');
    await page.keyboard.press('Escape');
    await page.locator('#view-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.id === 'new-view');
    assert.equal(await page.locator('.view-tab').count(), 1);
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.equal(await page.locator('#history-state').textContent(), initialHistory);

    await page.locator('#new-view').click();
    await page.locator('#new-view-name').fill('Browser smoke view');
    await page.locator('#view-submit').click();
    const addExisting = page.locator('.tree-add-element').first();
    await addExisting.waitFor({ state: 'visible' });
    await addExisting.click();
    assert.equal(await page.locator('.view-tab').count(), 2);

    const savedBytes = await saveThroughBrowser();
    const saved = deserializeProjectFile(savedBytes);
    assert.equal(saved.views.length, 3);
    assert.deepEqual(saved.views.filter(item => initialViewIds.includes(item.view.id)), initial.views);
    assert.deepEqual(saved.elements, initial.elements, 'adding a shared occurrence does not duplicate concepts');
    assert.deepEqual(saved.relationships, initial.relationships, 'existing relationships retain their IDs and data');
    const newView = saved.views.find(item => !initialViewIds.includes(item.view.id));
    assert.ok(newView, 'new view has a stable ID');
    assert.equal(newView.occurrences.length, 1);
    assert.ok(initial.elements.some(item => item.id === newView.occurrences[0].concept.id), 'new view reuses an existing concept ID');

    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'browser-smoke.arkita', mimeType: 'application/json', buffer: savedBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.view-tab').count(), 1);
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');

    const reopenedBytes = await saveThroughBrowser();
    assert.deepEqual(reopenedBytes, savedBytes, 'browser save → open → save preserves exact model bytes');

    const incoming = createStore(createProject('Incoming scope model'));
    const sourceProjectId = incoming.snapshot.project.id;
    const sourceFolderId = incoming.execute({ type: 'createFolder', name: 'Incoming-only folder' }, incoming.revision).created.folderId;
    const scopeBytes = serializeProjectFile(incoming.snapshot), scopePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    scopePage.setDefaultTimeout(10_000); watch(scopePage);
    await scopePage.addInitScript(bytes => { window.schemkaDesktop = { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'scope.arkita', bytes: Uint8Array.from(bytes) }] }) }; }, Array.from(scopeBytes));
    await scopePage.goto(url); await scopePage.locator('#canvas .node').first().waitFor();
    const scopeHistory = await scopePage.locator('#history-state').textContent();
    await scopePage.locator('.app-menu summary').first().click(); await scopePage.locator('#interchange-button').click(); await scopePage.locator('#interchange-action').selectOption('native');
    await scopePage.locator('#interchange-folders').uncheck(); await scopePage.locator('#interchange-prepare').click();
    const scopeReport = scopePage.locator('#interchange-report'), scopeText = await scopeReport.textContent();
    assert.match(scopeText, /Сохранённые записи целевой модели/); assert.match(scopeText, /Пропущенные входящие записи/);
    assert.match(scopeText, /Incoming scope model/); assert.match(scopeText, /Incoming-only folder/);
    assert.ok(scopeText.includes(sourceProjectId)); assert.ok(scopeText.includes(sourceFolderId)); assert.match(scopeText, /целевой записи нет/);
    assert.equal(await scopePage.locator('#interchange-apply').isDisabled(), true, 'scope-only identical import stays a no-op');
    const summary = scopeReport.locator('details > summary'); await summary.focus(); await scopePage.keyboard.press('Enter');
    assert.equal(await scopeReport.locator('details').getAttribute('open'), '');
    assert.equal(await scopePage.evaluate(() => document.activeElement?.tagName.toLowerCase()), 'summary', 'keyboard expansion keeps focus on the scope control');
    const applyButton = scopePage.locator('#interchange-apply'); await applyButton.evaluate(element => element.scrollIntoView({ block: 'nearest' }));
    const applyRect = await applyButton.evaluate(element => { const button = element.getBoundingClientRect(), dialog = document.querySelector('#interchange-dialog').getBoundingClientRect(); return { top: button.top, bottom: button.bottom, dialogTop: dialog.top, dialogBottom: dialog.bottom }; });
    assert.ok(applyRect.top >= applyRect.dialogTop && applyRect.bottom <= applyRect.dialogBottom, 'preview scroll keeps dialog actions reachable');
    await scopePage.keyboard.press('Escape'); await scopePage.locator('#interchange-dialog').waitFor({ state: 'hidden' });
    assert.equal(await scopePage.locator('#history-state').textContent(), scopeHistory); assert.equal(await scopePage.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.deepEqual(pageErrors, [], 'renderer reports no uncaught errors');
    assert.deepEqual(failedRequests, [], 'renderer reports no failed or HTTP error requests');
    console.log(`PASS: browser renderer smoke · Chromium ${browser.version()} · shared model, native scope details, keyboard/focus, save/reopen`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
  }
}

try {
  await run();
} catch (error) {
  const blocked = error instanceof BlockedError;
  console.error(`${blocked ? 'BLOCKED' : 'FAIL'}: ${error.message}`);
  if (!blocked && error.stack) console.error(error.stack);
  process.exitCode = blocked ? 2 : 1;
}
