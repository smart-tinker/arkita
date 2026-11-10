import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metadataFixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';
import { metadataRecord } from '../../schemka-model-core/src/index.js';
import { readProjectFile } from '../../schemka-model-io/src/project-file.js';
import { CSP } from '../../electron/boundary.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const file of ['index.html', 'style.css', 'src/app.js', 'src/workspace-ui.js', 'src/metadata-ui.js', 'src/file-actions.js', 'src/model-analysis-ui.js', 'src/model-analysis-worker.js', 'src/context-hints-ui.js', 'src/minimap.js']) {
  assert.deepEqual(await readFile(path.join(root, 'dist/model', file)), await readFile(path.join(root, 'schemka-model-ui', file)));
}
const output = process.env.ARKITA_INTEGRATION_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'arkita-integration-results-'));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), 'arkita-integration-chrome-'));
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
const report = { checks: [], errors: [], consoleErrors: [], requests: [] }; let context, page;
try {
  const origin = await new Promise((resolve, reject) => {
    let log = '';
    server.stdout.on('data', data => { log += data; const url = log.match(/http:\/\/127\.0\.0\.1:\d+/); if (url) resolve(url[0]); });
    server.on('error', reject); server.on('exit', code => reject(Error(`Server exited: ${code}`)));
  });
  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    chromiumSandbox: process.env.ARKITA_CHROMIUM_SANDBOX !== '0', viewport: { width: 1440, height: 960 }, acceptDownloads: true,
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
  const policy = CSP.replaceAll('schemka://app/', `${origin}/`).replaceAll('/schemka-model-ui/src/', '/model/src/');
  await context.route(`${origin}/**`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  report.workerPolicy = policy.split(';').find(value => value.trim().startsWith('worker-src')).trim();
  page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => report.consoleErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => { if (!request.url().startsWith(origin) && !/^(blob:|data:)/.test(request.url())) report.requests.push(request.url()); });
  await page.goto(origin + '/model/'); await page.locator('#canvas .node').first().waitFor();
  const menu = async (label, command) => {
    await page.locator('.app-menu > summary').filter({ hasText: new RegExp(`^${label}$`) }).click();
    await page.locator(`.app-menu [data-command="${command}"]`).click();
  };
  const history = () => page.locator('#history-state').textContent();
  const graphReady = async () => {
    await page.waitForFunction(() => document.getElementById('model-analysis-panel').dataset.analysisBuilding === 'false');
    assert.doesNotMatch(await page.locator('#analysis-feedback').textContent(), /Построение не завершено|Не удалось запустить/);
    assert.ok(await page.locator('#analysis-graph [data-analysis-id]').count() > 0);
  };
  async function download(name) {
    const pending = page.waitForEvent('download'); await menu('Файл', 'save-as'); const result = await pending;
    const target = path.join(output, name); await result.saveAs(target);
    await page.locator('#file-dialog [data-close]').click(); return readFile(target);
  }
  const original = metadataFixture(), source = path.join(output, 'source-v2.arkita'), expected = readProjectFile(original.bytes).state;
  await writeFile(source, original.bytes);
  await menu('Файл', 'file-button'); await page.locator('#project-file').setInputFiles(source); await page.locator('#load-project').click();
  await page.locator('#file-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'true');
  assert.match(await page.locator('#file-state').textContent(), /сохраните отдельную копию/);
  const viewId = await page.locator('#view-tabs [aria-selected="true"]').getAttribute('data-view-id');
  const owners = [{ kind: 'project', id: expected.project.id }, { kind: 'view', id: viewId }, { kind: 'relationship', id: expected.relationships[0].id }];
  async function ownerEditor(owner, field) {
    if (owner.kind === 'relationship') {
      await page.locator(`[data-relationship-id="${owner.id}"]`).click(); await menu('Правка', 'inspector-button');
      await page.locator(field === 'documentation' ? '[data-inspector-action="documentation"]' : '#object-properties-edit').click();
    } else {
      await menu('Модель', owner.kind === 'project' ? 'project-metadata' : 'view-metadata');
      await page.locator(`#metadata-${field}`).click();
    }
  }
  for (const owner of owners) {
    const value = `Документация ${owner.kind}\n<script>literal()</script> 日本語 🧭`;
    await ownerEditor(owner, 'documentation'); await page.locator('#documentation-value').fill(value);
    await page.locator('#documentation-form button[type="submit"]').click(); await page.locator('#documentation-dialog').waitFor({ state: 'hidden' });
    metadataRecord(expected, owner).documentation = value;
    await ownerEditor(owner, 'properties'); await page.locator('#object-property-add').click();
    const row = page.locator('#object-properties-fields .property-row').last();
    await row.locator('[name="name"]').fill('Integration 🧭'); await row.locator('[name="value"]').fill('exact <img src=x> e\u0301');
    await page.locator('#object-properties-form button[type="submit"]').click(); await page.locator('#object-properties-dialog').waitFor({ state: 'hidden' });
    metadataRecord(expected, owner).properties['Integration 🧭'] = 'exact <img src=x> e\u0301';
  }
  const upgraded = await download('upgraded.arkita'), read = readProjectFile(upgraded);
  assert.equal(read.sourceVersion, 3); assert.deepEqual(read.state, expected);
  assert.deepEqual(await readFile(source), Buffer.from(original.bytes));
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
  report.checks.push('actual-v2-file-load-project-view-relationship-metadata-separate-v3-copy-source-bytes-retained');
  const baseline = await history(); report.metadataHistory = baseline;

  await page.locator(`[data-element-id="${expected.elements[0].id}"]`).click();
  await page.locator('#model-analysis-button').click(); await graphReady();
  await menu('Вид', 'minimap-toggle'); await page.locator('#minimap').waitFor();
  await menu('Справка', 'context-hints-toggle'); await page.screenshot({ path: path.join(output, 'integrated-desktop.png') });
  await page.locator('#project-name').click(); const rename = page.locator('.inline-editor input'); await rename.fill('Сохранить этот черновик');
  for (const control of [page.locator('#help-button'), page.locator('#model-analysis-button'), page.locator('#context-hints-pin'), page.locator('#minimap-toggle'), page.locator('#minimap-close'), page.locator('.app-menu > summary').filter({ hasText: /^Вид$/ })]) {
    await control.click(); assert.equal(await rename.inputValue(), 'Сохранить этот черновик');
    assert.equal(await rename.evaluate(input => input === document.activeElement), true);
  }
  await page.locator('#minimap').click({ position: { x: 10, y: 10 } }); assert.equal(await rename.inputValue(), 'Сохранить этот черновик');
  assert.equal(await rename.evaluate(input => input === document.activeElement), true);
  assert.equal(await history(), baseline); assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
  await rename.press('Escape'); await page.locator('#context-hints-close').click();
  report.checks.push('real-worker-minimap-hints-and-workspace-controls-preserve-one-inline-draft-and-history');

  await page.setViewportSize({ width: 700, height: 850 });
  const layoutBounds = await page.evaluate(() => {
    const footer = document.querySelector('.statusbar').getBoundingClientRect(), analysis = document.getElementById('model-analysis-panel').getBoundingClientRect(), scroll = document.getElementById('canvas-scroll').getBoundingClientRect();
    const save = document.querySelector('.document-actions [data-command="save"]'), text = document.createRange(); text.selectNodeContents(save);
    return { footerBottom: footer.bottom, analysisBottom: analysis.bottom, canvasHeight: scroll.height, height: innerHeight,
      saveWidth: save.getBoundingClientRect().width, saveTextWidth: text.getBoundingClientRect().width };
  });
  assert.ok(layoutBounds.footerBottom <= layoutBounds.height + 1 && layoutBounds.analysisBottom <= layoutBounds.height && layoutBounds.canvasHeight > 0, JSON.stringify(layoutBounds));
  assert.ok(layoutBounds.saveWidth > layoutBounds.saveTextWidth, 'The Save label must fit its mobile button');
  report.mobileBounds = layoutBounds;
  async function assertPanel(name) {
    const value = await page.evaluate(() => ({ panel: document.body.dataset.mobilePanel,
      pressed: [...document.querySelectorAll('[data-panel]')].filter(item => item.getAttribute('aria-pressed') === 'true').map(item => item.dataset.panel),
      visible: [['catalog', '.catalog'], ['canvas', '.canvas-panel'], ['inspector', '.toolbox']].filter(([, selector]) => document.querySelector(selector).getClientRects().length > 0).map(([name]) => name) }));
    assert.deepEqual(value, { panel: name, pressed: [name], visible: [name] });
  }
  for (const [name, setting] of [['catalog', 'catalog'], ['inspector', 'palette']]) {
    await page.locator(`[data-panel="${name}"]`).click(); await assertPanel(name);
    await menu('Вид', `workspace-toggle-${setting}`); await assertPanel('canvas');
    await page.locator(`[data-panel="${name}"]`).click(); await assertPanel(name);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem('arkita.workspace.v1'))[key], setting), true);
  }
  await menu('Вид', 'workspace-button'); await page.locator('#workspace-palette').uncheck(); await page.locator('#workspace-form button[type="submit"]').click();
  await page.locator('#workspace-dialog').waitFor({ state: 'hidden' }); await assertPanel('canvas');
  report.checks.push('700px-hide-active-panel-falls-back-visible-canvas-mobile-tabs-reveal-and-persist-exact-aria-state');

  await page.evaluate(() => {
    window.arkitaIntegrationCloseCount = 0;
    document.getElementById('help-dialog').addEventListener('close', () => window.arkitaIntegrationCloseCount++);
  });
  const targets = ['new', 'palette-search', 'smart-link-dialog', 'new-view', 'undo', 'file-button']; report.tutorialFocus = [];
  for (const [index, target] of targets.entries()) {
    const before = await page.evaluate(() => window.arkitaIntegrationCloseCount);
    await menu('Справка', 'tutorial-button'); await page.locator('#help-tutorial li button').nth(index).click();
    await page.waitForFunction(before => window.arkitaIntegrationCloseCount > before, before);
    const active = await page.evaluate(() => ({ id: document.activeElement.id, command: document.activeElement.dataset.command, visible: document.activeElement.getClientRects().length > 0 }));
    assert.ok(active.visible && (active.id === target || active.command === target), `${target}: ${JSON.stringify(active)}`); report.tutorialFocus.push(active);
    if (target === 'palette-search') await assertPanel('inspector');
    if (target === 'new-view') await assertPanel('canvas');
  }
  assert.equal(await history(), baseline);
  report.checks.push('all-six-tutorial-focus-handoffs-after-real-queued-dialog-close-without-executing-commands');

  await ownerEditor(owners[0], 'documentation'); const draft = page.locator('#documentation-value'); await draft.fill('Сохранить незавершённую документацию');
  await draft.press('F1'); await page.locator('#help-dialog').waitFor();
  assert.match(await page.locator('#help-article').textContent(), /Документация и свойства/);
  await page.locator('[data-help-topic="tutorial"]').click(); const beforeClose = await page.evaluate(() => window.arkitaIntegrationCloseCount);
  await page.locator('#help-tutorial li button').nth(1).click(); await page.waitForFunction(before => window.arkitaIntegrationCloseCount > before, beforeClose);
  assert.equal(await page.locator('#documentation-dialog').isVisible(), true); assert.equal(await draft.inputValue(), 'Сохранить незавершённую документацию');
  assert.equal(await draft.evaluate(input => input === document.activeElement), true);
  await draft.press('Escape'); await page.locator('#documentation-dialog').waitFor({ state: 'hidden' });
  report.checks.push('nested-offline-help-tutorial-return-preserves-the-active-metadata-draft');

  await menu('Вид', 'workspace-toggle-catalog');
  await page.evaluate(() => {
    window.arkitaIntegrationSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'arkita.workspace.v1') throw new DOMException('quota', 'QuotaExceededError'); return window.arkitaIntegrationSetItem.call(this, key, value); };
  });
  await menu('Вид', 'workspace-reset'); assert.match(await page.locator('#status').textContent(), /сохранить их между запусками не удалось/);
  const preferences = await page.evaluate(() => ({ applied: document.body.dataset.workspaceCatalog, saved: JSON.parse(localStorage.getItem('arkita.workspace.v1')).catalog }));
  assert.deepEqual(preferences, { applied: 'true', saved: false });
  await page.evaluate(() => { Storage.prototype.setItem = window.arkitaIntegrationSetItem; });
  await page.screenshot({ path: path.join(output, 'integrated-700px.png') }); await assertPanel('canvas');
  assert.equal(await history(), baseline); assert.deepEqual(await download('after-workspace.arkita'), upgraded);
  report.checks.push('real-storage-failure-retains-warning-defaults-apply-in-window-model-bytes-remain-exact');

  await graphReady(); await page.locator('#analysis-generate').click(); await page.locator('#analysis-generation-name').fill('Integration v3 generated');
  await page.locator('#analysis-generation-submit').click(); await page.locator('#analysis-generation-dialog').waitFor({ state: 'hidden' });
  const generatedBytes = await download('generated-v3.arkita'), generated = readProjectFile(generatedBytes);
  const view = generated.state.views.find(entry => entry.view.name === 'Integration v3 generated');
  assert.equal(generated.sourceVersion, 3); assert.deepEqual(view.view.properties, {}); assert.equal(view.view.documentation, '');
  assert.deepEqual(generated.state.elements, expected.elements); assert.deepEqual(generated.state.relationships, expected.relationships);
  await page.locator('#undo').click(); assert.equal(await history(), baseline); assert.deepEqual(await download('undo-generated.arkita'), upgraded);
  await page.locator('#redo').click(); assert.deepEqual(await download('redo-generated.arkita'), generatedBytes);
  assert.deepEqual(await readFile(source), Buffer.from(original.bytes));
  report.checks.push('generated-view-has-v3-metadata-reuses-edited-concepts-one-undo-and-exact-redo-native-files');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.requests, []);
  report.browser = await context.browser().version(); report.ok = true;
} catch (error) {
  report.ok = false; report.failure = error.stack || String(error);
  if (page) await page.screenshot({ path: path.join(output, 'integration-failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2));
  if (context) await context.close(); server.kill(); await rm(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ output, ...report }));
}
