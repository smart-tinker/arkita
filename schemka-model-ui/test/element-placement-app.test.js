import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

const mode = production ? 'production' : 'source';
const box = h => { const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(/\s+/).map(Number); return { x, y, width, height }; };
function seed() {
  const store = createStore(createProject('Placement regression'));
  const { viewId } = store.execute({ type: 'createView', name: 'View' }, store.revision).created;
  return { store, viewId };
}
function create(h, name) {
  h.$('create-applicationcomponent').click(); h.$('element-name').value = name;
  h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
}
function visibleSeparate(occurrences, camera) {
  for (const [index, item] of occurrences.entries()) {
    const a = item.bounds;
    assert.ok(a.x >= camera.x && a.y >= camera.y && a.x + a.width <= camera.x + camera.width && a.y + a.height <= camera.y + camera.height);
    for (const old of occurrences.slice(0, index)) {
      const b = old.bounds;
      assert.ok(a.x + a.width + 12 <= b.x || b.x + b.width + 12 <= a.x || a.y + a.height + 12 <= b.y || b.y + b.height + 12 <= a.y);
    }
  }
}

test(`${mode} eight palette creations and tree/inspector/context reuse stay visible, separate and undoable`, async t => {
  const h = await setup(t), { store } = seed(); await h.load(serializeProjectFile(store.snapshot));
  for (let i = 0; i < 8; i++) { create(h, `Element ${i + 1}`); assert.equal(h.$('edit-dialog').open, false, h.$('edit-error').textContent); }
  let bytes = await h.download(), state = deserializeProjectFile(bytes);
  assert.equal(state.elements.length, 8); assert.equal(state.views[0].occurrences.length, 8);
  visibleSeparate(state.views[0].occurrences, box(h));
  const selected = h.$('canvas').querySelector('.node.selected'), elementId = selected.dataset.renameId;
  const paths = [
    () => h.document.querySelector(`[data-add-element-id="${elementId}"]`).click(),
    () => [...h.$('inspector-content').querySelectorAll('button')].find(button => button.textContent === 'Добавить экземпляр в этот вид').click(),
    () => {
      h.$('canvas').querySelector('.node.selected').dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 300, clientY: 100 }));
      h.$('context-menu').querySelector('[data-context-action="reuse-element"]').click();
    },
  ];
  for (const reuse of paths) {
    const before = state; reuse(); const next = await h.download(); state = deserializeProjectFile(next);
    assert.deepEqual(state.elements, before.elements);
    assert.equal(state.views[0].occurrences.length, before.views[0].occurrences.length + 1);
    for (const old of before.views[0].occurrences) assert.deepEqual(state.views[0].occurrences.find(item => item.id === old.id), old);
    visibleSeparate(state.views[0].occurrences, box(h));
    h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
    h.$('redo').click(); assert.deepEqual(await h.download(), next);
    bytes = next;
    const created = state.views[0].occurrences.find(item => !before.views[0].occurrences.some(old => old.id === item.id));
    h.$('canvas').querySelector(`[data-id="${created.id}"]`).dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
});

test(`${mode} creating after pan and zoom uses the remembered camera instead of the initial canvas`, async t => {
  const h = await setup(t), { store } = seed(); await h.load(serializeProjectFile(store.snapshot));
  h.$('canvas').dispatchEvent(new h.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 5000, deltaY: -3000 }));
  h.$('zoom-in').click(); const camera = box(h);
  create(h, 'Visible new element'); assert.equal(h.$('edit-dialog').open, false, h.$('edit-error').textContent);
  assert.deepEqual(box(h), camera);
  const state = deserializeProjectFile(await h.download()); assert.equal(state.elements.length, 1);
  visibleSeparate(state.views[0].occurrences, camera);
});

test(`${mode} a full camera reveals the nearest free creation and keeps existing geometry with exact Undo/Redo`, async t => {
  const h = await setup(t), { store, viewId } = seed();
  store.execute({ type: 'createElementAndOccurrence', viewId, elementType: 'Grouping', name: 'Full area', bounds: { x: -10, y: -10, width: 920, height: 660 } }, store.revision);
  await h.load(serializeProjectFile(store.snapshot));
  const bytes = await h.download(), before = deserializeProjectFile(bytes), camera = box(h);
  create(h, 'Retained draft');
  assert.equal(h.$('edit-dialog').open, false, h.$('edit-error').textContent);
  assert.notDeepEqual(box(h), camera);
  const saved = await h.download(), state = deserializeProjectFile(saved), old = before.views[0].occurrences[0];
  const created = state.views[0].occurrences.find(item => item.id !== old.id);
  assert.equal(state.elements.find(item => item.id === created.concept.id).name, 'Retained draft');
  assert.deepEqual(state.views[0].occurrences.find(item => item.id === old.id), old);
  visibleSeparate([created], box(h));
  const a = created.bounds, b = old.bounds;
  assert.ok(a.x + a.width + 12 <= b.x || b.x + b.width + 12 <= a.x || a.y + a.height + 12 <= b.y || b.y + b.height + 12 <= a.y);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
  h.$('redo').click(); assert.deepEqual(await h.download(), saved);
});

test(`${mode} maximum zoom expands only after a successful creation without re-entering its name`, async t => {
  const h = await setup(t), { store } = seed(); await h.load(serializeProjectFile(store.snapshot));
  const bytes = await h.download();
  for (let i = 0; i < 8; i++) h.$('zoom-in').click();
  const camera = box(h); assert.equal(camera.width, 180);
  create(h, 'x'.repeat(8193));
  assert.equal(h.$('edit-dialog').open, true); assert.ok(h.$('edit-error').textContent);
  assert.deepEqual(box(h), camera, 'A rejected command cannot move the camera');
  assert.equal(h.$('undo').disabled, true);
  h.$('element-name').value = 'Создано без повторного открытия';
  h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('edit-dialog').open, false, h.$('edit-error').textContent);
  const after = box(h); assert.ok(after.width >= 258);
  assert.ok(Math.abs(after.height / after.width - camera.height / camera.width) < 1e-12);
  const saved = await h.download(), state = deserializeProjectFile(saved);
  assert.equal(state.elements.length, 1); assert.equal(state.elements[0].name, 'Создано без повторного открытия');
  visibleSeparate(state.views[0].occurrences, after);
  assert.match(h.$('history-state').textContent, /1 действий/);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
  h.$('redo').click(); assert.deepEqual(await h.download(), saved);
});
