import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { readTemplate } from '../../schemka-model-io/src/templates.js';
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

    const templateMenu = page.locator('.app-menu').filter({ has: page.locator('#templates-button') });
    if (!(await templateMenu.evaluate(menu => menu.open))) await templateMenu.locator(':scope > summary').click();
    await page.locator('#templates-button').click();
    await page.locator('#templates-dialog').waitFor({ state: 'visible' });
    await page.getByText('Сохранить и изменить шаблон', { exact: true }).click();
    await page.locator('#template-name').fill('Browser smoke template');
    const keyViewId = initialViewIds[1];
    await page.locator('#template-key-view').selectOption(keyViewId);
    await page.locator('#template-save-current').click();

    const templateLibraryBytes = await page.evaluate(() => localStorage.getItem('arkita.templates.v1'));
    assert.ok(templateLibraryBytes, 'saved template is present in the local library');
    const templateLibrary = JSON.parse(templateLibraryBytes);
    assert.equal(templateLibrary.templates.length, 1);
    const savedTemplate = readTemplate(templateLibrary.templates[0]);
    assert.equal(savedTemplate.metadata.keyViewId, keyViewId);
    assert.deepEqual(savedTemplate.snapshot.views.map(item => item.view.id), initialViewIds);

    const previewView = page.locator('#template-preview-view');
    const preview = page.locator('#template-preview');
    const previewSnapshot = async () => {
      const source = await preview.getAttribute('src');
      assert.ok(source?.startsWith('data:image/svg+xml;charset=utf-8,'));
      return page.evaluate(encoded => {
        const svg = new DOMParser().parseFromString(decodeURIComponent(encoded), 'image/svg+xml').documentElement;
        return {
          title: svg.children[0]?.localName === 'title' ? svg.children[0].textContent : null,
          transforms: Array.from(svg.querySelectorAll(':scope > g[transform]')).map(group => group.getAttribute('transform')),
          text: Array.from(svg.querySelectorAll('text')).map(item => item.textContent).join(' ')
        };
      }, source.slice(source.indexOf(',') + 1));
    };
    const detailOnly = initial.views[1].occurrences.find(item =>
      !initial.views[0].occurrences.some(other => other.concept.id === item.concept.id)
    );
    assert.ok(detailOnly, 'synthetic detail view has a unique concept');
    const detailConcept = initial.elements.find(item => item.id === detailOnly.concept.id);
    assert.ok(detailConcept);
    const detailLabel = detailOnly.text ?? detailOnly.name ?? detailConcept.name;
    assert.ok(detailLabel, 'detail-only concept has visible text');
    const firstView = savedTemplate.snapshot.views.find(item => item.view.id === initialViewIds[0]);
    const detailView = savedTemplate.snapshot.views.find(item => item.view.id === initialViewIds[1]);
    assert.ok(firstView && detailView);
    const firstBounds = firstView.occurrences[0].bounds;
    const detailBounds = detailView.occurrences.find(item => item.concept.id === detailOnly.concept.id).bounds;
    const firstTransform = 'translate(' + firstBounds.x + ' ' + firstBounds.y + ')';
    const detailTransform = 'translate(' + detailBounds.x + ' ' + detailBounds.y + ')';
    assert.deepEqual(
      await previewView.locator('option').evaluateAll(options => options.map(option => option.value)),
      initialViewIds
    );
    assert.equal(await previewView.inputValue(), keyViewId, 'key view ID selects the initial preview');
    assert.equal(await preview.getAttribute('alt'), 'Предпросмотр: ' + initial.views[1].view.name);
    const keyViewSVG = await previewSnapshot();
    assert.equal(keyViewSVG.title, initial.views[1].view.name, 'decoded SVG root title follows the key view');
    assert.ok(keyViewSVG.transforms.includes(detailTransform), 'detail preview SVG includes its drawing group geometry');
    assert.ok(keyViewSVG.text.includes(detailLabel), 'detail preview SVG renders its unique concept');

    const previewPanel = await previewView.locator('xpath=ancestor::details[1]').boundingBox();
    const title = await page.locator('#templates-title').boundingBox();
    assert.ok(previewPanel && title, 'preview panel and dialog title are visible');
    const outside = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
    assert.ok(
      outside.x < previewPanel.x || outside.x > previewPanel.x + previewPanel.width ||
        outside.y < previewPanel.y || outside.y > previewPanel.y + previewPanel.height,
      'keyboard navigation is exercised with the pointer outside the preview panel'
    );

    await previewView.focus();
    await page.mouse.move(outside.x, outside.y);
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(viewId => document.querySelector('#template-preview-view')?.value === viewId, initialViewIds[0]);
    assert.equal(await preview.getAttribute('alt'), 'Предпросмотр: ' + initial.views[0].view.name);
    const firstViewSVG = await previewSnapshot();
    assert.equal(firstViewSVG.title, initial.views[0].view.name, 'decoded SVG root title follows the selected view');
    assert.ok(firstViewSVG.transforms.includes(firstTransform), 'first-view SVG includes its drawing group geometry');
    assert.ok(!firstViewSVG.text.includes(detailLabel), 'first-view SVG excludes the detail-only concept');
    assert.notDeepEqual(firstViewSVG, keyViewSVG, 'view selection changes rendered SVG content');

    const previewSize = page.locator('#template-preview-size');
    const widthBefore = await preview.evaluate(image => image.width);
    await previewSize.focus();
    await page.mouse.move(outside.x, outside.y);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(width => document.querySelector('#template-preview')?.width === width, widthBefore + 1);

    await page.locator('#templates-close').click();
    await page.locator('#templates-dialog').waitFor({ state: 'hidden' });
    if (await templateMenu.evaluate(menu => menu.open)) await templateMenu.locator(':scope > summary').click();
    assert.deepEqual(await saveThroughBrowser(), initialBytes, 'template preview leaves model bytes unchanged');
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.equal(await page.locator('#history-state').textContent(), initialHistory);

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
    assert.deepEqual(pageErrors, [], 'renderer reports no uncaught errors');
    assert.deepEqual(failedRequests, [], 'renderer reports no failed or HTTP error requests');
    console.log(`PASS: browser renderer smoke · Chromium ${browser.version()} · template key-view keyboard SVG geometry, 2-view shared model, Cancel/focus, create, browser save/reopen`);
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
