import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, richLifecycleFixture } from './app-test-fixture.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

function controls(h) {
  const canvas = h.$('canvas');
  const group = id => canvas.querySelector(`[data-kind="occurrence"][data-id="${id}"]`);
  const pointer = (target, type, x = 100, y = 100, shiftKey = false, pointerId = 1) => {
    const event = new h.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, isPrimary: true, pointerId, clientX: x, clientY: y, shiftKey }); target.dispatchEvent(event); return event;
  };
  const key = (target, value, options = {}) => { const event = new h.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; };
  const selected = () => [...canvas.querySelectorAll('.selected[data-kind]')].map(item => `${item.dataset.kind}:${item.dataset.id}`).filter((value, index, all) => all.indexOf(value) === index).sort();
  return { canvas, group, pointer, key, selected };
}
async function ready(t, adjust = () => {}) {
  const h = await setup(t), data = richLifecycleFixture(); adjust(data);
  await h.load(serializeProjectFile(data.state));
  h.$('views').querySelector(`[data-view-id="${data.viewId}"]`).click();
  return { h, data, ...controls(h) };
}

test('app group move keeps typed selection and anchor visible, previews together, and commits one undoable view-only command', async t => {
  const { h, data, canvas, group, pointer, selected } = await ready(t), bytes = await h.download();
  pointer(group(data.a.occurrenceId), 'pointerdown'); pointer(canvas, 'pointerup');
  pointer(group(data.b.occurrenceId), 'pointerdown', 100, 100, true);
  assert.equal(selected().length, 2); assert.ok(group(data.a.occurrenceId).classList.contains('selection-anchor')); assert.ok(canvas.querySelector('.selection-anchor-outline'));
  assert.match(h.$('selection-summary').textContent, /Выбрано: 2/);
  pointer(group(data.b.occurrenceId), 'pointerdown');
  assert.ok(group(data.b.occurrenceId).classList.contains('selection-anchor')); assert.equal(selected().length, 2);
  pointer(canvas, 'pointermove', 130, 110); pointer(canvas, 'pointermove', 160, 125);
  assert.equal(h.$('undo').disabled, true); assert.match(group(data.a.occurrenceId).getAttribute('transform'), /translate\(100.1 105.2\)/);
  pointer(canvas, 'pointerup', 160, 125); assert.equal(selected().length, 2); assert.match(h.$('history-state').textContent, /1 действий/);
  const afterBytes = await h.download(), after = deserializeProjectFile(afterBytes), before = deserializeProjectFile(bytes);
  const beforeView = before.views.find(entry => entry.view.id === data.viewId), afterView = after.views.find(entry => entry.view.id === data.viewId);
  for (const id of [data.a.occurrenceId, data.b.occurrenceId]) {
    const old = beforeView.occurrences.find(item => item.id === id), now = afterView.occurrences.find(item => item.id === id);
    assert.deepEqual(now.bounds, { ...old.bounds, x: Math.round((old.bounds.x + 60) * 10) / 10, y: Math.round((old.bounds.y + 25) * 10) / 10 });
  }
  const route = afterView.connections.find(item => item.id === data.relation.connectionId);
  assert.deepEqual(route.routePoints[0].point, { x: 340.1, y: 50.2 }); assert.deepEqual(route.labelPosition, { x: 360.5, y: 43.2 });
  assert.deepEqual(after.views.filter(entry => entry.view.id !== data.viewId), before.views.filter(entry => entry.view.id !== data.viewId));
  assert.deepEqual(after.elements, before.elements); assert.deepEqual(after.relationships, before.relationships);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), afterBytes);
});

test('app marquee uses transformed negative coordinates, complete containment, Shift addition, and no model command', async t => {
  const { h, data, canvas, group, pointer, selected } = await ready(t, data => {
    const view = data.state.views.find(entry => entry.view.id === data.viewId);
    view.occurrences.find(item => item.id === data.a.occurrenceId).bounds = { x: -180, y: -80, width: 100, height: 60 };
    view.occurrences.find(item => item.id === data.b.occurrenceId).bounds = { x: -40, y: 40, width: 100, height: 60 }; view.connections = [];
  });
  const bytes = await h.download();
  canvas.setAttribute('viewBox', '-200 -100 900 640');
  canvas.getScreenCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 400, f: 200, inverse() { return { a: .5, b: 0, c: 0, d: .5, e: -200, f: -100 }; } });
  pointer(canvas, 'pointerdown', 500, 500); pointer(canvas, 'pointermove', 20, 20);
  assert.ok(canvas.querySelector('.selection-marquee')); assert.equal(selected().length, 0, 'preview is not committed selection');
  pointer(canvas, 'pointerup', 20, 20);
  assert.deepEqual(selected(), [`occurrence:${data.a.occurrenceId}`]); assert.equal(canvas.querySelector('.selection-marquee'), null);
  pointer(group(data.b.occurrenceId), 'pointerdown', 400, 300, true); assert.equal(selected().length, 2);
  pointer(group(data.a.occurrenceId), 'pointerdown', 100, 100, true); assert.deepEqual(selected(), [`occurrence:${data.b.occurrenceId}`]);
  pointer(canvas, 'pointerdown', 20, 20, true); pointer(canvas, 'pointerup', 500, 500, true);
  assert.equal(selected().length, 2); assert.ok(group(data.b.occurrenceId).classList.contains('selection-anchor'));
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('undo').disabled, true);
});

for (const pinned of [false, true]) test(`app marquee updates analysis and hints while preserving pin, history and model (${pinned ? 'pinned' : 'following'})`, async t => {
  const { h, data, canvas, group, pointer, key, selected } = await ready(t), bytes = await h.download();
  key(group(data.a.occurrenceId), 'Enter'); key(canvas, 'ArrowRight'); h.$('undo').click();
  const history = () => [h.$('history-state').textContent, h.$('file-state').dataset.dirty, h.$('undo').disabled, h.$('redo').disabled];
  const before = history(); assert.equal(h.$('redo').disabled, false);
  h.$('model-analysis-button').click(); h.$('context-hints-toggle').click();
  const shows = id => {
    assert.ok(h.$('analysis-root').textContent.includes(id), 'Analysis follows the selected concept');
    assert.ok(h.$('context-hints-identity').textContent.includes(id), 'Hints follow the selected concept');
  };
  shows(data.a.elementId);
  if (pinned) { h.$('analysis-pin').click(); h.$('context-hints-pin').click(); }
  pointer(canvas, 'pointerdown', 350, 70); pointer(canvas, 'pointermove', 560, 175);
  shows(data.a.elementId); // A marquee preview is not a committed selection.
  pointer(canvas, 'pointerup', 560, 175);
  assert.deepEqual(selected(), [`occurrence:${data.b.occurrenceId}`]);
  shows(pinned ? data.a.elementId : data.b.elementId);
  if (pinned) { h.$('analysis-pin').click(); h.$('context-hints-pin').click(); shows(data.b.elementId); }
  h.$('create-role').focus(); assert.equal(h.$('context-hints-identity').textContent, 'Элемент · Role');
  pointer(canvas, 'pointerdown', 350, 70); pointer(canvas, 'pointerup', 560, 175);
  shows(data.b.elementId); // Re-selecting the same concept also replaces a tool hint.
  pointer(canvas, 'pointerdown', 700, 300); pointer(canvas, 'pointerup', 750, 350);
  assert.deepEqual(selected(), []); assert.match(h.$('analysis-root').textContent, /Выберите элемент/);
  assert.equal(h.$('analysis-generate').disabled, true);
  assert.ok(h.$('context-hints-identity').textContent.includes(data.viewId));
  assert.deepEqual(history(), before); assert.deepEqual(await h.download(), bytes);
});

test('app group gestures cancel on Escape, lost capture, blur, pointercancel and outside release without clearing redo', async t => {
  const { h, data, canvas, group, pointer, key, selected } = await ready(t), bytes = await h.download();
  key(group(data.a.occurrenceId), 'Enter'); key(group(data.b.occurrenceId), 'Enter', { shiftKey: true });
  key(canvas, 'ArrowRight'); h.$('undo').click(); assert.equal(h.$('redo').disabled, false);
  const beforeSelected = selected();
  const cancellations = [() => key(canvas, 'Escape'), () => canvas.dispatchEvent(new h.window.Event('lostpointercapture')),
    () => h.window.dispatchEvent(new h.window.Event('blur')), () => pointer(canvas, 'pointercancel'), () => pointer(canvas, 'pointerup', 950, 400)];
  for (const cancel of cancellations) {
    pointer(group(data.a.occurrenceId), 'pointerdown'); pointer(canvas, 'pointermove', 140, 120); cancel(); pointer(canvas, 'pointerup', 140, 120);
    assert.deepEqual(selected(), beforeSelected); assert.equal(canvas.querySelector('.dragging'), null); assert.equal(h.$('redo').disabled, false);
    assert.deepEqual(await h.download(), bytes);
    pointer(canvas, 'pointerdown', 10, 10); pointer(canvas, 'pointermove', 800, 500); cancel(); pointer(canvas, 'pointerup', 800, 500);
    assert.deepEqual(selected(), beforeSelected); assert.equal(canvas.querySelector('.selection-marquee'), null); assert.equal(h.$('redo').disabled, false);
  }
  assert.deepEqual(await h.download(), bytes);
});

test('app keyboard selection, group arrows, deletion preview and search navigation preserve clear command scope', async t => {
  const { h, data, canvas, group, pointer, key, selected } = await ready(t), bytes = await h.download();
  key(group(data.a.occurrenceId), 'Enter'); key(group(data.b.occurrenceId), ' ', { code: 'Space', shiftKey: true });
  assert.equal(selected().length, 2); assert.equal(canvas.classList.contains('pan-ready'), false);
  key(canvas, 'Delete'); assert.equal(h.$('delete-dialog').open, true, h.$('status').textContent); assert.match(h.$('delete-impact').textContent, /Выбрано: 2/); h.$('delete-dialog').close(); assert.deepEqual(await h.download(), bytes);
  key(canvas, 'ArrowRight', { ctrlKey: true }); key(canvas, 'ArrowRight', { isComposing: true }); assert.equal(h.$('undo').disabled, true);
  key(canvas, 'ArrowRight', { shiftKey: true }); assert.match(h.$('history-state').textContent, /1 действий/); h.$('undo').click();
  assert.deepEqual(await h.download(), bytes);
  const connection = canvas.querySelector(`[data-kind="connection"][data-id="${data.relation.connectionId}"]`);
  pointer(connection, 'pointerdown', 200, 100, true); assert.equal(selected().length, 3);
  h.$('model-search').value = data.a.elementId; h.$('model-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  const result = h.$('model-search-results').querySelector('button'); assert.ok(result); result.click();
  assert.deepEqual(selected(), [`occurrence:${data.a.occurrenceId}`]); assert.equal(h.$('selection-summary').textContent, ''); assert.equal(h.document.querySelector('dialog[open]'), null);
  const current = h.$('model-search-results').querySelector(`[data-search-id="${data.a.elementId}"]`); current.focus();
  current.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 300 }));
  const properties = h.$('context-menu').querySelector('[data-context-action="properties"]'); assert.ok(properties); properties.click();
  assert.equal(selected().length, 0); assert.equal(h.$('inspector-panel').open, true); assert.equal(h.$('inspector-content').querySelector('.object-name').dataset.renameId, data.a.elementId);
  h.$('inspector-close').click(); assert.deepEqual(await h.download(), bytes); assert.equal(h.$('redo').disabled, false);
});

test('app view navigation cancels a pending group preview and clears selection before a delayed release', async t => {
  const { h, data, canvas, group, pointer, key, selected } = await ready(t), bytes = await h.download();
  key(group(data.a.occurrenceId), 'Enter'); key(group(data.b.occurrenceId), 'Enter', { shiftKey: true });
  pointer(group(data.a.occurrenceId), 'pointerdown'); pointer(canvas, 'pointermove', 140, 120);
  h.$('views').querySelector(`[data-view-id="${data.otherViewId}"]`).click(); pointer(canvas, 'pointerup', 140, 120);
  assert.deepEqual(selected(), []); assert.equal(h.$('selection-summary').textContent, ''); assert.equal(h.$('undo').disabled, true);
  assert.deepEqual(await h.download(), bytes);
});


test('mixed drawing Delete previews dependencies, cancellation keeps bytes and confirm uses one Undo across the whole selection', async t => {
  const { createStore } = await import('../../schemka-model-core/src/index.js');
  const data = richLifecycleFixture(), store = createStore(data.state), viewId = data.viewId;
  const visualNodeId = store.execute({ type: 'createVisualNode', viewId, kind: 'group', name: 'Selected group', bounds: { x: 600, y: 300, width: 300, height: 200 } }, store.revision).created.visualNodeId;
  const childId = store.execute({ type: 'createVisualNode', viewId, kind: 'note', parent: { kind: 'visualNode', id: visualNodeId }, text: 'Retained note', bounds: { x: 630, y: 330, width: 100, height: 60 } }, store.revision).created.visualNodeId;
  store.execute({ type: 'createVisualConnector', viewId, source: { kind: 'visualNode', id: visualNodeId }, target: { kind: 'visualNode', id: childId }, routePoints: [], labelPosition: null }, store.revision);
  const h = await setup(t); await h.load(serializeProjectFile(store.snapshot)); h.$('views').querySelector(`[data-view-id="${viewId}"]`).click();
  const c = controls(h), bytes = await h.download(), before = deserializeProjectFile(bytes);
  c.key(c.group(data.a.occurrenceId), 'Enter');
  c.key(c.canvas.querySelector(`[data-kind="visualNode"][data-id="${visualNodeId}"]`), 'Enter', { shiftKey: true });
  assert.equal(c.selected().length, 2); c.key(c.canvas, 'Delete'); assert.equal(h.$('delete-dialog').open, true); assert.match(h.$('delete-impact').textContent, /Визуальных линий: 1/);
  h.$('delete-dialog').close(); assert.deepEqual(await h.download(), bytes); assert.equal(h.$('undo').disabled, true);
  c.key(c.canvas, 'Delete'); h.$('delete-confirm').click(); assert.equal(h.$('delete-dialog').open, false, h.$('status').textContent); assert.match(h.$('history-state').textContent, /1 действий/);
  const afterBytes = await h.download(), after = deserializeProjectFile(afterBytes), entry = after.views.find(item => item.view.id === viewId);
  assert.equal(entry.occurrences.some(item => item.id === data.a.occurrenceId), false); assert.equal(entry.visualNodes.some(item => item.id === visualNodeId), false);
  assert.equal(entry.visualConnectors.length, 0); assert.deepEqual(entry.visualNodes.find(item => item.id === childId).bounds, { x: 630, y: 330, width: 100, height: 60 }); assert.equal(entry.visualNodes.find(item => item.id === childId).parent, null);
  for (const collection of ['elements', 'junctions', 'relationships']) assert.deepEqual(after[collection], before[collection]); assert.deepEqual(after.views.filter(item => item.view.id !== viewId), before.views.filter(item => item.view.id !== viewId));
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), afterBytes);
});
