import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { fixtureId as id } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { assertSvgExport } from '../src/svg-export.js';
import { CSP } from '../../electron/boundary.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const file of ['index.html', 'style.css', 'src/app.js', 'src/model-analysis-ui.js', 'src/model-analysis-graph.js', 'src/model-analysis-worker.js', 'src/context-hints-ui.js']) assert.deepEqual(await readFile(path.join(root, 'dist/model', file)), await readFile(path.join(root, 'schemka-model-ui', file)));
const output = process.env.ARKITA_ANALYSIS_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'arkita-analysis-results-'));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), 'arkita-analysis-chrome-'));
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
let context; const report = { checks: [], errors: [], consoleErrors: [], requests: [] };
try {
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', data => { output += data; const url = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (url) resolve(url[0]); });
    server.on('error', reject); server.on('exit', code => reject(Error(`Server exited: ${code}`)));
  });
  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    chromiumSandbox: process.env.ARKITA_CHROMIUM_SANDBOX !== '0', viewport: { width: 1440, height: 960 }, acceptDownloads: true,
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  // Enforce the Desktop asset policy in Chrome, remapping only its local protocol/path.
  // The actual schemka: custom protocol still belongs to native-platform acceptance.
  const policy = CSP.replaceAll('schemka://app/', `${origin}/`).replaceAll('/schemka-model-ui/src/', '/model/src/');
  await context.route(`${origin}/**`, async route => {
    const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(10000);
  const graphReady = async () => {
    await page.waitForFunction(() => document.getElementById('model-analysis-panel').dataset.analysisBuilding === 'false');
    assert.doesNotMatch(await page.locator('#analysis-feedback').textContent(), /Построение не завершено|Не удалось запустить/, JSON.stringify(report.consoleErrors));
  };
  page.on('pageerror', error => report.errors.push(error.message)); page.on('request', request => { if (!request.url().startsWith(origin) && !/^(blob:|data:)/.test(request.url())) report.requests.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => report.consoleErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(origin + '/model/'); await page.locator('#canvas .node').first().waitFor();
  const menu = async (label, command) => { await page.locator('.app-menu > summary').filter({ hasText: new RegExp(`^${label}$`) }).click(); await page.locator(`[data-command="${command}"]`).click(); };
  const state = conceptProject(); state.elements[0].name = 'Связи модели <script> 🙂 日本語';
  await menu('Файл', 'file-button'); await page.locator('#project-file').setInputFiles({ name: 'analysis.arkita', mimeType: 'application/json', buffer: Buffer.from(serializeProjectFile(state)) });
  await page.locator('#load-project').click(); await page.locator('#file-dialog').waitFor({ state: 'hidden' });
  const baseline = await page.locator('#history-state').textContent();
  const select = (kind, value) => page.locator(`[data-${kind}-id="${id(kind === 'element' ? 'el' : kind === 'junction' ? 'jct' : 'rel', value)}"]`).click();
  await select('element', 1); await menu('Справка', 'context-hints-toggle');
  assert.match(await page.locator('#context-hints-title').textContent(), /Связи модели <script> 🙂 日本語/);
  assert.equal(await page.locator('#context-hints-title').evaluate(node => node === document.activeElement), true);
  await page.locator('#context-hints-pin').click(); const hint = await page.locator('#context-hints-title').textContent();
  await select('element', 2); assert.equal(await page.locator('#context-hints-title').textContent(), hint);
  await page.locator('#context-hints-pin').click(); assert.match(await page.locator('#context-hints-identity').textContent(), new RegExp(id('el', 2)));
  await page.locator('#create-role').focus(); assert.equal(await page.locator('#context-hints-identity').textContent(), 'Элемент · Role');
  await select('element', 2); assert.match(await page.locator('#context-hints-identity').textContent(), new RegExp(id('el', 2)));
  await page.locator('#context-hints-pin').click(); await page.locator('#create-collaboration').focus(); await select('element', 2);
  await page.locator('#context-hints-pin').click(); assert.match(await page.locator('#context-hints-identity').textContent(), new RegExp(id('el', 2)));
  await page.locator('#project-name').click(); await page.locator('.inline-editor input').fill('Черновик подсказок');
  await page.locator('#context-hints-pin').click(); assert.equal(await page.locator('.inline-editor input').inputValue(), 'Черновик подсказок');
  assert.equal(await page.locator('.inline-editor input').evaluate(node => node === document.activeElement), true);
  await page.locator('.inline-editor input').press('Escape'); await page.locator('#context-hints-close').click();
  assert.equal(await page.locator('#history-state').textContent(), baseline); assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
  report.checks.push('real-selection-hints-pin-unpin-literal-content-keyboard-focus-same-id-reselect-and-draft-protection');
  await select('element', 1); await page.locator('#model-analysis-button').click(); await graphReady();
  assert.equal(await page.locator('#model-analysis-panel').isVisible(), true);
  await page.locator('#analysis-pin').click(); await select('element', 2); await graphReady(); assert.match(await page.locator('#analysis-root').textContent(), /Связи модели/);
  await page.locator(`[data-analysis-result-id="${id('rel', 1)}"]`).click(); await graphReady(); assert.match(await page.locator('#analysis-root').textContent(), /Link 1/);
  await page.locator('#analysis-back').click(); await graphReady(); assert.match(await page.locator('#analysis-root').textContent(), /Связи модели/);
  report.checks.push('nonmodal-selection-pin-neighbor-back');
  const cancellation = await page.evaluate(() => {
    const graph = document.getElementById('analysis-graph').outerHTML, depth = document.getElementById('analysis-depth'), prior = depth.value;
    depth.value = '8'; depth.dispatchEvent(new Event('change', { bubbles: true }));
    const started = document.getElementById('model-analysis-panel').dataset.analysisBuilding === 'true';
    const cancelVisible = !document.getElementById('analysis-cancel-build').hidden;
    document.getElementById('analysis-cancel-build').click();
    return { started, cancelVisible, depthRestored: depth.value === prior, graphRestored: document.getElementById('analysis-graph').outerHTML === graph,
      stopped: document.getElementById('model-analysis-panel').dataset.analysisBuilding === 'false', feedback: document.getElementById('analysis-feedback').textContent };
  });
  assert.equal(cancellation.started, true); assert.equal(cancellation.cancelVisible, true); assert.equal(cancellation.stopped, true);
  assert.equal(cancellation.depthRestored, true); assert.equal(cancellation.graphRestored, true); assert.match(cancellation.feedback, /Построение отменено/);
  report.cancellation = cancellation; report.workerPolicy = policy.split(';').find(rule => rule.trim().startsWith('worker-src')).trim();
  report.checks.push('actual-module-worker-cancel-preserves-completed-graph-and-controls-under-desktop-policy');
  await page.locator('#analysis-depth').selectOption('8'); await page.locator('#analysis-orthogonal').check(); await page.locator('#analysis-layout-direction').selectOption('rows'); await graphReady();
  const measure = await page.locator('#analysis-graph text').evaluateAll(nodes => nodes.map(node => { const box = node.getBBox(); return { text: node.textContent, x: box.x, width: box.width, right: box.x + box.width }; }));
  assert.ok(measure.length); assert.ok(measure.every(box => box.x >= 9.9 && box.right <= 210.1), JSON.stringify(measure));
  for (const theme of ['light', 'dark']) {
    await page.locator('#theme-mode').selectOption(theme);
    await page.waitForFunction(() => document.querySelector('#analysis-graph text').getAttribute('fill') === getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
    await page.screenshot({ path: path.join(output, `analysis-${theme}.png`) });
  }
  report.checks.push('depth-cycles-orthogonal-rows-real-text-metrics-theme-refresh');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#analysis-export').click(); const download = await downloadPromise;
  await download.saveAs(path.join(output, 'analysis.svg')); const svg = await readFile(path.join(output, 'analysis.svg'), 'utf8'); assert.equal(assertSvgExport(svg), svg);
  assert.match(svg, /Связи модели &lt;script&gt; 🙂 日本語/); report.svgBytes = Buffer.byteLength(svg);
  await page.locator('#analysis-copy').click(); await page.waitForFunction(() => document.getElementById('analysis-feedback').textContent.startsWith('Изображение'));
  report.clipboardFeedback = await page.locator('#analysis-feedback').textContent(); assert.match(report.clipboardFeedback, /скопировано/);
  const clipboard = await page.evaluate(async () => { const items = await navigator.clipboard.read(); const png = await items[0].getType('image/png'); return { types: items[0].types, bytes: png.size }; });
  assert.ok(clipboard.bytes > 0); assert.ok(clipboard.types.includes('image/png')); report.clipboard = clipboard;
  assert.equal(await page.locator('#history-state').textContent(), baseline); assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
  report.checks.push('actual-svg-download-and-browser-image-clipboard-readback-no-mutation');
  await page.setViewportSize({ width: 1000, height: 700 }); const box = await page.locator('#model-analysis-panel').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 1001, JSON.stringify(box));
  await page.screenshot({ path: path.join(output, 'analysis-1000x700.png') }); report.checks.push('narrow-dock-without-fourth-grid-column');
  await menu('Справка', 'context-hints-toggle'); const hintsBox = await page.locator('#context-hints-panel').boundingBox();
  assert.ok(hintsBox.x >= 0 && hintsBox.y >= 0 && hintsBox.x + hintsBox.width <= 1000 && hintsBox.y + hintsBox.height <= 700, JSON.stringify(hintsBox));
  await page.screenshot({ path: path.join(output, 'context-hints-1000x700.png') }); await page.locator('#context-hints-close').click();
  report.checks.push('context-hints-fit-narrow-workspace-without-panel-layout-change');
  await page.setViewportSize({ width: 1440, height: 960 }); await select('relationship', 11); await page.locator('#analysis-pin').click(); await page.locator('#analysis-depth').selectOption('0'); await graphReady();
  await page.locator('#analysis-generate').click(); await page.locator('#analysis-generation-relationships').selectOption('selected'); assert.equal(await page.locator('#analysis-generation-details li').count(), 3);
  await page.locator('#analysis-generation-name').fill('Generated cyclic relation view'); await page.locator('#analysis-generation-submit').click(); await page.locator('#analysis-generation-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#views > button').count(), 3); assert.equal(await page.locator('#canvas g.connection').count(), 2);
  await menu('Файл', 'file-button'); const modelDownloadPromise = page.waitForEvent('download'); await page.locator('#save-project').click(); const modelDownload = await modelDownloadPromise;
  await modelDownload.saveAs(path.join(output, 'generated.arkita')); const saved = deserializeProjectFile(await readFile(path.join(output, 'generated.arkita'), 'utf8'));
  const generated = saved.views.find(entry => entry.view.name === 'Generated cyclic relation view'); assert.equal(generated.connections.length, 2); assert.equal(generated.occurrences.length, 2); assert.equal(saved.relationships.length, state.relationships.length);
  await page.locator('#file-dialog [data-close]').click(); await page.locator('#undo').click(); assert.equal(await page.locator('#views > button').count(), 2); await page.locator('#redo').click(); assert.equal(await page.locator('#views > button').count(), 3);
  report.checks.push('real-generation-preview-native-roundtrip-one-undo-redo');
  const historyBeforePreferences = await page.locator('#history-state').textContent();
  await page.locator('#analysis-quality > summary').click(); await page.locator('input[data-analysis-rule][value="relationships"]').uncheck();
  const fresh = await context.newPage(); fresh.on('pageerror', error => report.errors.push(error.message));
  await fresh.goto(origin + '/model/'); await fresh.locator('#canvas .node').first().waitFor();
  assert.equal(await fresh.locator('input[data-analysis-rule][value="relationships"]').isChecked(), false);
  await fresh.locator('#model-analysis-button').click(); await fresh.locator('#analysis-quality > summary').click(); await fresh.locator('#analysis-quality-reset').click();
  await fresh.reload(); await fresh.locator('#canvas .node').first().waitFor();
  assert.equal(await fresh.locator('input[data-analysis-rule]:checked').count(), 5);
  assert.equal(await page.locator('#history-state').textContent(), historyBeforePreferences);
  await fresh.close(); report.checks.push('real-fresh-session-rule-preferences-and-default-reset');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.requests, []); report.browser = context.browser().version(); report.ok = true;
} finally {
  await context?.close(); server.kill('SIGTERM'); await rm(profile, { recursive: true, force: true });
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, ...report }));
}
