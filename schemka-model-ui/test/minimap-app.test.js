import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production, richLifecycleFixture } from './app-test-fixture.js';
import { createProject } from '../../schemka-model-core/src/index.js';
import { viewpointGraph } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const mode = production ? 'production' : 'source';
const rectangle = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewBox = element => {
  const [x, y, width, height] = element.getAttribute('viewBox').split(/\s+/).map(Number); return { x, y, width, height };
};
const frameBox = h => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(h.$('minimap-camera').getAttribute(key))]));
const near = (actual, expected) => { for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, `${key}: ${actual[key]} ≠ ${expected[key]}`); };
const key = (h, value, options = {}) => h.$('minimap').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options }));
const selectView = (h, id) => h.document.querySelector(`[data-view-scope="tree"][data-view-id="${id}"]`).click();

// Real preserveAspectRatio geometry, with deterministic clipping instead of jsdom's absent layout.
function metrics(h) {
  const canvas = h.$('canvas'), map = h.$('minimap'), scroll = h.$('canvas-scroll');
  let canvasRect = rectangle(130, 80, 800, 600), clipRect = rectangle(180, 110, 620, 310);
  canvas.getBoundingClientRect = () => canvasRect; scroll.getBoundingClientRect = () => clipRect;
  map.getBoundingClientRect = () => rectangle(400, 300, 240, 140);
  for (const svg of [canvas, map]) svg.getScreenCTM = () => {
    const box = viewBox(svg), rect = svg.getBoundingClientRect(), scale = Math.min(rect.width / box.width, rect.height / box.height);
    const e = rect.left + (rect.width - box.width * scale) / 2 - box.x * scale;
    const f = rect.top + (rect.height - box.height * scale) / 2 - box.y * scale;
    return { a: scale, b: 0, c: 0, d: scale, e, f,
      inverse: () => ({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -e / scale, f: -f / scale }) };
  };
  const screen = (point, matrix = map.getScreenCTM()) => ({ x: point.x * matrix.a + matrix.e, y: point.y * matrix.d + matrix.f });
  const visible = () => {
    const matrix = canvas.getScreenCTM(), left = Math.max(canvasRect.left, clipRect.left), top = Math.max(canvasRect.top, clipRect.top);
    return { x: (left - matrix.e) / matrix.a, y: (top - matrix.f) / matrix.d,
      width: (Math.min(canvasRect.right, clipRect.right) - left) / matrix.a,
      height: (Math.min(canvasRect.bottom, clipRect.bottom) - top) / matrix.d };
  };
  function startDrag(id = 7, dx = 350, dy = -140) {
    const visibleBox = visible(), center = { x: visibleBox.x + visibleBox.width / 2, y: visibleBox.y + visibleBox.height / 2 };
    const matrix = map.getScreenCTM(), start = screen(center, matrix), end = screen({ x: center.x + dx, y: center.y + dy }, matrix);
    h.pointer(h.$('minimap-camera'), 'pointerdown', start.x, start.y, id);
    h.pointer(map, 'pointermove', end.x, end.y, id);
    return { id, end };
  }
  return { visible, screen, startDrag,
    scroll() { canvasRect = rectangle(30, -50, 800, 600); scroll.dispatchEvent(new h.window.Event('scroll')); },
    resize() { clipRect = rectangle(180, 110, 430, 220); h.window.dispatchEvent(new h.window.Event('resize')); } };
}

async function largeView(h) {
  const fixture = richLifecycleFixture(), entry = fixture.state.views.find(item => item.view.id === fixture.viewId);
  Object.assign(entry.occurrences.find(item => item.id === fixture.a.occurrenceId).bounds, { x: -2400, y: -1500 });
  Object.assign(entry.occurrences.find(item => item.id === fixture.b.occurrenceId).bounds, { x: 5400, y: 2100 });
  await h.load(serializeProjectFile(fixture.state)); selectView(h, fixture.viewId); return fixture;
}

test(`${mode} minimap covers the drawn world and moves the clipped camera by click, frame drag and arrows without model/history changes`, async t => {
  const h = await setup(t), fixture = await largeView(h), layout = metrics(h), canvas = h.$('canvas'), map = h.$('minimap');
  const before = await h.download(), history = h.$('history-state').textContent;
  assert.equal(h.$('minimap-panel').hidden, true); assert.equal(h.$('minimap-drawing').children.length, 0);
  h.$('minimap-toggle').click(); assert.equal(h.document.activeElement, map);
  assert.equal(h.$('minimap-toggle').getAttribute('aria-expanded'), 'true');
  const world = viewBox(map); assert.ok(world.x <= -2400 && world.y <= -1500 && world.x + world.width >= 5590.5 && world.y + world.height >= 2185);
  near(frameBox(h), layout.visible()); assert.notDeepEqual(frameBox(h), viewBox(canvas), 'Camera includes actual clipping/letterboxing');
  const target = { x: -2300, y: -1450 }, point = layout.screen(target), size = viewBox(canvas);
  h.pointer(map, 'pointerdown', point.x, point.y, 11); h.pointer(map, 'pointerup', point.x, point.y, 11);
  let visible = layout.visible(); near({ x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 }, target);
  near(viewBox(canvas), { width: size.width, height: size.height }); near(frameBox(h), visible);
  const start = viewBox(canvas), drag = layout.startDrag(12, 1700, -600);
  h.pointer(map, 'pointerup', drag.end.x, drag.end.y, drag.id);
  near(viewBox(canvas), { x: start.x + 1700, y: start.y - 600, width: start.width, height: start.height });
  assert.equal(map.hasPointerCapture(12), false);
  const arrowStart = viewBox(canvas); visible = layout.visible(); key(h, 'ArrowRight'); key(h, 'ArrowUp', { shiftKey: true });
  near(viewBox(canvas), { x: arrowStart.x + visible.width * .1, y: arrowStart.y - visible.height * .5 });
  h.$('zoom-in').click(); near(frameBox(h), layout.visible()); assert.ok(viewBox(canvas).width < start.width);
  layout.scroll(); near(frameBox(h), layout.visible()); layout.resize(); near(frameBox(h), layout.visible());
  h.$('fit-button').click(); near(frameBox(h), layout.visible()); assert.ok(viewBox(canvas).width > 7500);
  selectView(h, fixture.otherViewId); near(frameBox(h), layout.visible()); assert.equal(h.$('minimap-drawing').querySelectorAll('g.node').length, 2);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, 'false');
  assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true); assert.deepEqual(await h.download(), before);
});

test(`${mode} minimap cancellation, view/load boundaries and disposal restore cameras and reject stale pointers`, async t => {
  const h = await setup(t), fixture = await largeView(h), layout = metrics(h), canvas = h.$('canvas'), map = h.$('minimap');
  const before = await h.download(); h.$('minimap-toggle').click();
  for (const [index, boundary] of ['escape', 'pointercancel', 'lostpointercapture', 'blur', 'resize', 'close'].entries()) {
    const start = canvas.getAttribute('viewBox'), drag = layout.startDrag(30 + index);
    assert.notEqual(canvas.getAttribute('viewBox'), start); assert.equal(map.hasPointerCapture(drag.id), true);
    if (boundary === 'escape') key(h, 'Escape');
    else if (['pointercancel', 'lostpointercapture'].includes(boundary)) h.pointer(map, boundary, drag.end.x, drag.end.y, drag.id);
    else if (boundary === 'close') h.$('minimap-close').click();
    else h.window.dispatchEvent(new h.window.Event(boundary));
    assert.equal(canvas.getAttribute('viewBox'), start, boundary); assert.equal(map.hasPointerCapture(drag.id), false, boundary);
    h.pointer(map, 'pointermove', 999, 999, drag.id); h.pointer(map, 'pointerup', 999, 999, drag.id);
    assert.equal(canvas.getAttribute('viewBox'), start, `${boundary}: late events`);
    if (boundary === 'close') h.$('minimap-toggle').click();
  }
  const original = canvas.getAttribute('viewBox'), drag = layout.startDrag(50);
  selectView(h, fixture.otherViewId); const other = canvas.getAttribute('viewBox');
  h.pointer(map, 'pointermove', 999, 999, drag.id); h.pointer(map, 'pointerup', 999, 999, drag.id);
  assert.equal(canvas.getAttribute('viewBox'), other); selectView(h, fixture.viewId); assert.equal(canvas.getAttribute('viewBox'), original);
  layout.startDrag(51); await h.load(before); selectView(h, fixture.viewId);
  const loaded = canvas.getAttribute('viewBox'); h.pointer(map, 'pointermove', 999, 999, 51); h.pointer(map, 'pointerup', 999, 999, 51);
  assert.equal(canvas.getAttribute('viewBox'), loaded); assert.deepEqual(await h.download(), before);
  layout.startDrag(52); h.window.dispatchEvent(new h.window.Event('pagehide'));
  assert.equal(canvas.getAttribute('viewBox'), loaded); assert.equal(map.hasPointerCapture(52), false); assert.equal(h.$('minimap-panel').hidden, true);
  h.pointer(map, 'pointermove', 999, 999, 52); h.$('minimap-toggle').click(); assert.equal(canvas.getAttribute('viewBox'), loaded);
  assert.equal(h.$('minimap-panel').hidden, true, 'Disposed listeners cannot reopen or navigate');
});

test(`${mode} minimap clones only the visible projection with local marker IDs, no editor targets and safe empty/no-view states`, async t => {
  const h = await setup(t), fixture = viewpointGraph({ relationships: { R: ['WriteAccess', 'A', 'D'], S: ['Association', 'A', 'X'] },
    selection: { elementTypes: ['ApplicationComponent', 'DataObject'], junctionTypes: [], relationshipTypes: ['WriteAccess', 'Association'] } });
  await h.load(serializeProjectFile(fixture.state)); metrics(h);
  const canvas = h.$('canvas'), node = canvas.querySelector('g.node');
  node.setAttribute('onpointerdown', 'window.unwanted = true');
  const snapshots = []; node.addEventListener('pointerdown', () => snapshots.push('source'));
  h.$('minimap-toggle').click(); const drawing = h.$('minimap-drawing');
  assert.equal(canvas.querySelectorAll('g.node').length, 2); assert.equal(fixture.state.views[0].occurrences.length, 3);
  assert.equal(drawing.querySelectorAll('g.node').length, 2); assert.equal(drawing.querySelectorAll('g.connection').length, 1);
  assert.equal(drawing.querySelector('[data-id],[data-kind],[tabindex],[role],[onpointerdown],.hit,.selected'), null);
  assert.deepEqual([...drawing.querySelectorAll('g.node')].map(item => item.textContent), [...canvas.querySelectorAll('g.node')].map(item => item.textContent));
  const ids = [...h.document.querySelectorAll('[id]')].map(item => item.id); assert.equal(new Set(ids).size, ids.length);
  const urls = [...drawing.querySelectorAll('*')].flatMap(item => [...item.attributes].flatMap(attr => [...attr.value.matchAll(/url\(#([^)]+)\)/g)].map(match => match[1])));
  assert.ok(urls.length > 0); for (const id of urls) assert.ok(drawing.querySelector(`[id="${id}"]`), id);
  h.pointer(drawing.querySelector('g.node'), 'pointerdown', 100, 100, 61); h.pointer(h.$('minimap'), 'pointercancel', 100, 100, 61);
  assert.deepEqual(snapshots, []); assert.equal(h.window.unwanted, undefined);
  selectView(h, fixture.state.views[1].view.id); assert.equal(drawing.querySelectorAll('g.node,g.connection').length, 0);
  assert.equal(h.$('minimap-empty').hidden, false); assert.ok(Object.values(viewBox(h.$('minimap'))).every(Number.isFinite));
  await h.load(serializeProjectFile(createProject('No views')));
  assert.equal(h.$('minimap-toggle').disabled, true); assert.equal(h.$('minimap-panel').hidden, true); assert.equal(drawing.children.length, 0);
});

test(`${mode} minimap controls protect project and element rename drafts before outside-pointer cancellation`, async t => {
  const h = await setup(t); await largeView(h); const layout = metrics(h), canvas = h.$('canvas');
  const bytes = await h.download(), history = h.$('history-state').textContent; h.$('minimap-toggle').click();
  const start = canvas.getAttribute('viewBox'), point = layout.screen({ x: -2300, y: -1400 });
  for (const kind of ['project', 'element']) {
    if (kind === 'project') h.$('project-name').click();
    else canvas.querySelector('g.node').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = `Uncommitted ${kind} draft`;
    input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    for (const target of [h.$('minimap'), h.$('minimap-toggle'), h.$('minimap-close'), h.document.querySelector('[data-command="minimap-toggle"]')]) {
      const event = h.pointer(target, 'pointerdown', point.x, point.y, 71);
      target.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, cancelable: true })); await Promise.resolve();
      assert.equal(event.defaultPrevented, true); assert.equal(input.isConnected, true, `${kind}: ${target.id || target.dataset.command}`);
      assert.equal(h.document.activeElement, input); assert.equal(input.value, `Uncommitted ${kind} draft`);
      assert.equal(canvas.getAttribute('viewBox'), start); assert.equal(h.$('minimap-panel').hidden, false);
      assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, 'false');
    }
    input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
  assert.deepEqual(await h.download(), bytes);
});
