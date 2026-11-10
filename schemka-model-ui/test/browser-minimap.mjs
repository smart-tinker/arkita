import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../../schemka-model-core/src/index.js';
import { viewpointGraph } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
for (const file of ['index.html', 'style.css', 'src/app.js', 'src/viewport.js', 'src/minimap.js']) assert.deepEqual(await readFile(path.join(root, 'dist/model', file)), await readFile(path.join(root, 'schemka-model-ui', file)));
const output = process.env.ARKITA_MINIMAP_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'arkita-minimap-results-'));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), 'arkita-minimap-chrome-'));
const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
let context; const report = { checks: [], errors: [], requests: [] };
const near = (actual, expected, tolerance = .01) => { for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) <= tolerance, `${key}: ${actual[key]} ≠ ${expected[key]}`); };
try {
  const origin = await new Promise((resolve, reject) => {
    let text = '';
    server.stdout.on('data', data => { text += data; const url = text.match(/http:\/\/127\.0\.0\.1:\d+/); if (url) resolve(url[0]); });
    server.on('error', reject); server.on('exit', code => reject(Error(`Server exited: ${code}`)));
  });
  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    chromiumSandbox: process.env.ARKITA_CHROMIUM_SANDBOX !== '0', viewport: { width: 1440, height: 960 }, acceptDownloads: true,
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
  const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin) && !/^(blob:|data:)/.test(request.url())) report.requests.push(request.url()); });
  await page.goto(origin + '/model/'); await page.locator('#canvas .node').first().waitFor();
  const menu = async (label, command) => { await page.locator('.app-menu > summary').filter({ hasText: new RegExp(`^${label}$`) }).click(); await page.locator(`[data-command="${command}"]`).click(); };
  const fixture = viewpointGraph({ relationships: { R: ['WriteAccess', 'A', 'D'], S: ['Association', 'A', 'X'] },
    selection: { elementTypes: ['ApplicationComponent', 'DataObject'], junctionTypes: [], relationshipTypes: ['WriteAccess', 'Association'] } });
  Object.assign(fixture.state.views[0].occurrences[0].bounds, { x: -2400, y: -1600 });
  Object.assign(fixture.state.views[0].occurrences[1].bounds, { x: 7600, y: 2600 });
  Object.assign(fixture.state.views[0].occurrences[2].bounds, { x: 30000, y: 20000 });
  fixture.state.elements[0].name = 'Left <script> 日本語'; fixture.state.elements[1].name = 'Right'; fixture.state.elements[2].name = 'Hidden device';
  const store = createStore(fixture.state), otherId = fixture.state.views[1].view.id, firstId = fixture.state.views[0].view.id;
  for (const [index, symbol] of ['A', 'D'].entries()) store.execute({ type: 'addOccurrence', viewId: otherId, concept: fixture.refs[symbol], bounds: { x: 100 + index * 300, y: 120 + index * 170, width: 180, height: 90 } }, store.revision);
  const bytes = Buffer.from(serializeProjectFile(store.snapshot));
  await menu('Файл', 'file-button'); await page.locator('#project-file').setInputFiles({ name: 'minimap.arkita', mimeType: 'application/json', buffer: bytes });
  await page.locator('#load-project').click(); await page.locator('#file-dialog').waitFor({ state: 'hidden' });
  const baseline = await page.locator('#history-state').textContent();
  await menu('Вид', 'minimap-toggle'); await page.locator('#minimap').waitFor();
  assert.equal(await page.locator('#minimap-drawing g.node').count(), 2); assert.equal(await page.locator('#minimap-drawing g.connection').count(), 1);
  assert.equal(await page.locator('#minimap-drawing [data-id],#minimap-drawing [tabindex],#minimap-drawing [role],#minimap-drawing .hit').count(), 0);
  const snapshot = await page.locator('#minimap').evaluate(map => {
    const box = map.viewBox.baseVal, drawing = map.querySelector('#minimap-drawing'), measured = drawing.getBBox();
    const ids = [...document.querySelectorAll('[id]')].map(item => item.id);
    const refs = [...drawing.querySelectorAll('*')].flatMap(item => [...item.attributes].flatMap(attr => [...attr.value.matchAll(/url\(#([^)]+)\)/g)].map(match => match[1])));
    return { world: { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height },
      measured: { x: measured.x, y: measured.y, right: measured.x + measured.width, bottom: measured.y + measured.height },
      unique: new Set(ids).size === ids.length, refsLocal: refs.length > 0 && refs.every(id => drawing.querySelector(`[id="${id}"]`)), text: drawing.textContent };
  });
  assert.ok(snapshot.unique && snapshot.refsLocal); assert.doesNotMatch(snapshot.text, /Hidden device/);
  assert.ok(snapshot.world.x <= snapshot.measured.x && snapshot.world.y <= snapshot.measured.y && snapshot.world.right >= snapshot.measured.right && snapshot.world.bottom >= snapshot.measured.bottom);
  assert.ok(snapshot.world.right < 15000, 'Excluded drawings never enlarge the minimap'); report.snapshot = snapshot;
  report.checks.push('projected-world-real-svg-bounds-inert-clones-local-markers');

  const box = () => page.locator('#canvas').evaluate(svg => { const box = svg.viewBox.baseVal; return { x: box.x, y: box.y, width: box.width, height: box.height }; });
  const camera = () => page.locator('#minimap-camera').evaluate(frame => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(frame.getAttribute(key))])));
  const point = value => page.locator('#minimap').evaluate((map, point) => { const value = new DOMPoint(point.x, point.y).matrixTransform(map.getScreenCTM()); return { x: value.x, y: value.y }; }, value);
  async function assertFrame() {
    const values = await page.evaluate(() => {
      const canvas = document.getElementById('canvas'), scroll = document.getElementById('canvas-scroll'), frame = document.getElementById('minimap-camera');
      const rect = canvas.getBoundingClientRect(), clip = scroll.getBoundingClientRect(), matrix = canvas.getScreenCTM(), style = getComputedStyle(scroll);
      const border = Object.fromEntries(['Left', 'Right', 'Top', 'Bottom'].map(side => [side, parseFloat(style[`border${side}Width`])]));
      const verticalBar = Math.max(0, scroll.offsetWidth - scroll.clientWidth - border.Left - border.Right);
      const horizontalBar = Math.max(0, scroll.offsetHeight - scroll.clientHeight - border.Top - border.Bottom);
      const start = new DOMPoint(Number(frame.getAttribute('x')), Number(frame.getAttribute('y'))).matrixTransform(matrix);
      const end = new DOMPoint(Number(frame.getAttribute('x')) + Number(frame.getAttribute('width')), Number(frame.getAttribute('y')) + Number(frame.getAttribute('height'))).matrixTransform(matrix);
      return { actual: { left: start.x, top: start.y, right: end.x, bottom: end.y }, expected: {
        left: Math.max(rect.left, clip.left + border.Left), top: Math.max(rect.top, clip.top + border.Top),
        right: Math.min(rect.right, clip.right - border.Right - verticalBar), bottom: Math.min(rect.bottom, clip.bottom - border.Bottom - horizontalBar) } };
    });
    // client/offset metrics round to integers; physical CSS borders retain fractional layout.
    near(values.actual, values.expected, .1);
  }
  await assertFrame();
  for (const kind of ['project', 'element']) {
    if (kind === 'project') await page.locator('#project-name').click();
    else await page.locator(`[data-element-id="${fixture.ids.A}"]`).first().press('F2');
    const input = page.locator('.inline-editor input'), draft = `Uncommitted ${kind} draft`, cameraBefore = await box();
    await input.fill(draft);
    for (const control of [page.locator('#minimap'), page.locator('#minimap-toggle'), page.locator('#minimap-close'), page.locator('.app-menu > summary').filter({ hasText: /^Вид$/ })]) {
      await control.click(); assert.equal(await input.inputValue(), draft);
      assert.equal(await input.evaluate(input => document.activeElement === input), true); near(await box(), cameraBefore);
      assert.equal(await page.locator('#minimap-panel').isVisible(), true); assert.equal(await page.locator('#history-state').textContent(), baseline);
    }
    await page.locator('[data-command="minimap-toggle"]').evaluate(button => button.click());
    assert.equal(await input.inputValue(), draft); assert.equal(await input.evaluate(input => document.activeElement === input), true);
    await input.press('Escape');
  }
  report.checks.push('native-project-element-draft-focus-and-camera-preserved-by-minimap-guards');
  const destination = { x: -2340, y: -1570 }, click = await point(destination), initial = await box();
  await page.mouse.click(click.x, click.y);
  let visible = await camera(); near({ x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 }, destination, 2);
  near(await box(), { width: initial.width, height: initial.height }); await assertFrame();
  async function drag(dx, dy) {
    const frame = await camera(), center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    const start = await point(center), end = await point({ x: center.x + dx, y: center.y + dy });
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 });
  }
  const prior = await box(); await drag(1700, -600); await page.mouse.up();
  near(await box(), { x: prior.x + 1700, y: prior.y - 600, width: prior.width, height: prior.height }, 2); await assertFrame();
  visible = await camera(); const keyboardBefore = await box(); await page.locator('#minimap').press('ArrowRight'); await page.locator('#minimap').press('Shift+ArrowDown');
  near(await box(), { x: keyboardBefore.x + visible.width * .1, y: keyboardBefore.y + visible.height * .5 }, .02);
  const cancelled = await box(); await drag(1000, 500); await page.keyboard.press('Escape'); await page.mouse.up(); near(await box(), cancelled);
  assert.equal(await page.locator('#minimap-panel').isVisible(), true); report.checks.push('native-click-recenter-frame-drag-arrows-and-escape-rollback');
  for (const control of ['zoom-in', 'zoom-out', 'zoom-value', 'fit-button']) { await page.locator(`#${control}`).click(); await assertFrame(); }
  report.checks.push('zoom-reset-and-fit-camera-synchronization');

  for (const theme of ['light', 'dark']) {
    await page.locator('#theme-mode').selectOption(theme); await page.screenshot({ path: path.join(output, `minimap-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1000, height: 620 }); await page.waitForTimeout(50); await assertFrame();
  const layout = await page.evaluate(() => {
    const panel = document.getElementById('minimap-panel').getBoundingClientRect(), stage = document.querySelector('.canvas-stage').getBoundingClientRect();
    const canvas = document.getElementById('canvas').getBoundingClientRect(), scroll = document.getElementById('canvas-scroll');
    return { panel: { x: panel.x, y: panel.y, right: panel.right, bottom: panel.bottom }, stage: { x: stage.x, y: stage.y, right: stage.right, bottom: stage.bottom }, canvasHeight: canvas.height, visibleHeight: scroll.clientHeight };
  });
  assert.ok(layout.canvasHeight > layout.visibleHeight, 'Exercise the clipped min-height SVG, not only viewBox-sized canvases');
  assert.ok(layout.panel.x >= layout.stage.x && layout.panel.right <= layout.stage.right && layout.panel.y >= layout.stage.y && layout.panel.bottom <= layout.stage.bottom, JSON.stringify(layout));
  await page.locator(`#view-tabs [data-view-id="${otherId}"]`).click(); await assertFrame();
  await page.locator('#canvas-scroll').evaluate(scroll => { scroll.scrollTop = 120; scroll.scrollLeft = 90; }); await page.waitForTimeout(50); await assertFrame();
  const scrolled = await page.locator('#canvas-scroll').evaluate(scroll => ({ x: scroll.scrollLeft, y: scroll.scrollTop }));
  assert.ok(scrolled.x > 0 && scrolled.y > 0, 'Exercise native scrolling in both axes'); report.scrolled = scrolled;
  await page.screenshot({ path: path.join(output, 'minimap-clipped-1000x620.png') }); report.layout = layout;
  report.checks.push('resize-clipped-scroll-camera-and-floating-panel-bounds');
  await page.setViewportSize({ width: 1440, height: 960 }); await page.waitForTimeout(50);
  await page.locator(`#view-tabs [data-view-id="${otherId}"]`).click(); await assertFrame(); assert.equal(await page.locator('#minimap-drawing g.node').count(), 2);
  await page.locator('#zoom-in').click(); const otherCamera = await box();
  await page.locator(`#view-tabs [data-view-id="${firstId}"]`).click(); const firstCamera = await box();
  await drag(900, 400); await page.locator(`#view-tabs [data-view-id="${otherId}"]`).evaluate(button => button.click());
  await page.mouse.move(700, 500); await page.mouse.up(); near(await box(), otherCamera);
  await page.locator(`#view-tabs [data-view-id="${firstId}"]`).click(); near(await box(), firstCamera); await assertFrame();
  report.checks.push('independent-view-cameras-and-stale-native-capture-boundary');

  assert.equal(await page.locator('#history-state').textContent(), baseline); assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
  assert.equal(await page.locator('#undo').isDisabled(), true); assert.equal(await page.locator('#redo').isDisabled(), true);
  await menu('Файл', 'file-button'); const pending = page.waitForEvent('download'); await page.locator('#save-project').click(); const download = await pending;
  const saved = path.join(output, 'unchanged.arkita'); await download.saveAs(saved); assert.deepEqual(await readFile(saved), bytes);
  report.checks.push('native-model-byte-equality-clean-session-and-unchanged-undo-redo');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); report.browser = context.browser().version(); report.ok = true;
} finally {
  await context?.close(); server.kill('SIGTERM'); await rm(profile, { recursive: true, force: true });
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, ...report }));
}
