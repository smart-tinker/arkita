import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deserializeProjectFile } from '../../schemka-model-io/src/index.js';
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
    const [{ createStore }, { serializeProjectFile }] = await Promise.all([
      import('../../schemka-model-core/src/index.js'),
      import('../../schemka-model-io/src/index.js')
    ]);
    const imageStore = createStore(initial), runImageCommand = command => imageStore.execute(command, imageStore.revision);
    const originalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123456"/></svg>';
    const sharedAssetId = runImageCommand({ type: 'createAsset', name: 'Shared.svg', mediaType: 'image/svg+xml', data: Buffer.from(originalSvg).toString('base64') }).created.assetId;
    const sharedDrawings = initial.views.slice(0, 2).map(({ view }, index) => ({
      viewId: view.id,
      drawingId: runImageCommand({ type: 'createVisualNode', viewId: view.id, kind: 'image', assetId: sharedAssetId, bounds: { x: 100 + index * 120, y: 100, width: 100, height: 80 } }).created.visualNodeId
    }));
    const imageFixtureBytes = Buffer.from(serializeProjectFile(imageStore.snapshot));
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'shared-image.arkita', mimeType: 'application/json', buffer: imageFixtureBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });

    await page.locator('#visual-assets-button').click();
    await page.locator(`#visual-replace-asset-${sharedAssetId}`).click();
    const replacementSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#abcdef"/></svg>';
    await page.locator(`#visual-replace-file-${sharedAssetId}`).setInputFiles({ name: 'Replacement.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(replacementSvg) });
    await page.locator('#visual-apply').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#visual-apply').textContent(), 'Заменить для всех использований');
    await page.locator('#visual-apply').click();
    await page.locator('#visual-cancel').click();
    await page.locator('#visual-dialog').waitFor({ state: 'hidden' });

    const replacedBytes = await saveThroughBrowser();
    const replaced = deserializeProjectFile(replacedBytes), asset = replaced.assets.find(item => item.id === sharedAssetId);
    assert.deepEqual({ id: asset?.id, name: asset?.name, mediaType: asset?.mediaType, data: asset?.data }, {
      id: sharedAssetId, name: 'Shared.svg', mediaType: 'image/svg+xml', data: Buffer.from(replacementSvg).toString('base64')
    });
    for (const { viewId, drawingId } of sharedDrawings) {
      const drawing = replaced.views.find(entry => entry.view.id === viewId)?.visualNodes.find(item => item.id === drawingId);
      assert.equal(drawing?.assetId, sharedAssetId, 'both original drawings still reference the same asset ID');
    }
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'shared-image.arkita', mimeType: 'application/json', buffer: replacedBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await saveThroughBrowser(), replacedBytes, 'ordinary Save → Open → Save preserves the replaced shared image bytes, ID and references');
    assert.deepEqual(pageErrors, [], 'renderer reports no uncaught errors');
    assert.deepEqual(failedRequests, [], 'renderer reports no failed or HTTP error requests');
    console.log(`PASS: browser renderer smoke · Chromium ${browser.version()} · 2-view shared model, Cancel/focus, create, browser save/reopen`);
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
