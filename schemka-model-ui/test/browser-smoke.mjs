import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { openFileDialog } from './browser-files.mjs';

class BlockedError extends Error {}

function canvasFixture() {
  const store = createStore(createProject('Canvas browser smoke'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Canvas' });
  const block = run({
    type: 'createVisualNode', viewId, kind: 'note', name: 'Instruction block', text: 'Card',
    instruction: '**Purpose**\n\n<script>window.canvasPwned = true</script>',
    bounds: { x: 40, y: 40, width: 220, height: 120 }
  }).visualNodeId;
  const target = run({
    type: 'createVisualNode', viewId, kind: 'group', name: 'Target',
    bounds: { x: 440, y: 40, width: 220, height: 120 }
  }).visualNodeId;
  run({
    type: 'createVisualConnector', viewId, name: 'Source label',
    properties: [{ key: 'owner', value: 'Team A' }],
    source: { kind: 'visualNode', id: block }, target: { kind: 'visualNode', id: target },
    style: { labelTemplate: '${name} · ${property:owner}' }
  });
  return { block, bytes: Buffer.from(serializeProjectFile(store.snapshot)) };
}

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
    const pageErrors = [], failedRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
    page.on('requestfailed', request => failedRequests.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });

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

    const canvas = canvasFixture();
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'canvas-smoke.arkita', mimeType: 'application/json', buffer: canvas.bytes });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    const line = page.locator('[data-kind="visualConnector"]');
    await line.waitFor();
    assert.equal(await line.locator('.relationship-label').textContent(), 'Source label · Team A');
    await page.locator('#visual-tools > summary').click();
    await line.focus();
    await page.keyboard.press('Enter');
    assert.equal(await line.getAttribute('aria-pressed'), 'true', 'keyboard selection exposes the drawing actions');
    assert.equal(await page.locator('#visual-style').isEnabled(), true, 'selection enables drawing style actions');
    await page.locator('#visual-style').click();
    const template = page.locator('#visual-labelTemplate');
    await template.fill('${missing}');
    assert.match(await page.locator('#visual-label-template-diagnostic').textContent(), /Неизвестное поле/);
    await page.locator('#visual-apply').click();
    assert.equal(await line.locator('.relationship-label').textContent(), 'Source label');
    assert.match(await line.getAttribute('aria-description'), /Неизвестное поле/);
    await page.locator('#undo').click();
    assert.equal(await line.locator('.relationship-label').textContent(), 'Source label · Team A');

    const block = page.locator(`[data-kind="visualNode"][data-id="${canvas.block}"]`);
    await page.evaluate(() => document.activeElement?.blur());
    let tabCount = 0;
    for (; tabCount < 160; tabCount++) {
      await page.keyboard.press('Tab');
      if (await block.evaluate(item => item === document.activeElement)) break;
    }
    assert.ok(tabCount < 160, 'Tab traversal reaches the Canvas instruction block');
    assert.equal(await page.locator('#context-hints-panel').isVisible(), false, 'hints start closed in the fresh browser profile');
    await page.keyboard.press('Enter');
    assert.equal(await block.getAttribute('aria-pressed'), 'true');
    const instruction = page.locator('#context-hints-instruction');
    assert.equal(await instruction.isVisible(), true);
    assert.equal(await block.evaluate(item => item === document.activeElement), true, 'showing the instruction preserves keyboard focus');
    assert.match(await instruction.textContent(), /Purpose/);
    assert.ok(await instruction.locator('strong').count());
    assert.equal(await instruction.locator('script').count(), 0);
    assert.equal(await page.evaluate(() => window.canvasPwned), undefined);
    assert.deepEqual(await saveThroughBrowser(), canvas.bytes, 'Canvas hints and Undo leave portable model bytes intact');
    assert.deepEqual(deserializeProjectFile(canvas.bytes).views[0].visualNodes.find(item => item.id === canvas.block).instruction, '**Purpose**\n\n<script>window.canvasPwned = true</script>');

    assert.deepEqual(pageErrors, [], 'renderer reports no uncaught errors');
    assert.deepEqual(failedRequests, [], 'renderer reports no failed or HTTP error requests');
    console.log(`PASS: browser renderer smoke · Chromium ${browser.version()} · shared views, Cancel/focus, browser save/reopen, Canvas template diagnostics and keyboard hints`);
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
