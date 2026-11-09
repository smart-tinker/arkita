import { production, setup, setStoredGeometry } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

for (const types of [['AndJunction', 'OrJunction'], ['OrJunction', 'AndJunction']]) test(`${production ? 'production' : 'source'} app: automatic junction placement ${types.join('/')} avoids seed bodies and all reuse paths`, async t => {
  const h = await setup(t), initial = deserializeProjectFile(await h.download());
  const initialView = initial.views.find(v => v.view.name === 'Обзор системы');
  let previous = await h.download(), createdId;
  async function verifyNew() {
    const before = deserializeProjectFile(previous), saved = await h.download(), state = deserializeProjectFile(saved);
    const prior = before.views.find(v => v.view.id === initialView.view.id), current = state.views.find(v => v.view.id === initialView.view.id);
    const created = current.occurrences.find(o => !prior.occurrences.some(p => p.id === o.id)); assert.ok(created);
    assert.equal(created.concept.kind, 'junction'); assert.equal(created.bounds.width, 36); assert.equal(created.bounds.height, 36);
    const a = created.bounds;
    for (const old of prior.occurrences) {
      const b = old.bounds;
      assert.ok(a.x + a.width + 12 <= b.x || b.x + b.width + 12 <= a.x || a.y + a.height + 12 <= b.y || b.y + b.height + 12 <= a.y, 'Independent rectangle assertion: junction body has twelve-unit clearance');
      assert.deepEqual(current.occurrences.find(o => o.id === old.id), old, 'No existing geometry, ID, zIndex or containment change');
    }
    assert.deepEqual(state.relationships, before.relationships); assert.deepEqual(current.connections, prior.connections);
    const group = h.$('canvas').querySelector(`[data-id="${created.id}"]`);
    assert.ok(group.classList.contains('junction')); assert.equal(group.getAttribute('aria-pressed'), 'true');
    assert.ok(group.querySelector('circle.junction-hit'));
    h.pointer(group, 'pointerdown', a.x + 18, a.y + 18); h.pointer(h.$('canvas'), 'pointerup', a.x + 18, a.y + 18);
    assert.equal(h.$('canvas').querySelector(`[data-id="${created.id}"]`).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await h.download(), saved, 'Selection alone does not move or change history');
    h.$('undo').click(); assert.deepEqual(await h.download(), previous);
    h.$('redo').click(); assert.deepEqual(await h.download(), saved, 'Redo retains created native IDs and bounds');
    previous = saved; createdId = created.concept.id;
    h.$('canvas').querySelector(`[data-id="${created.id}"]`).dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  for (const type of types) {
    h.$(`create-${type.toLowerCase()}`).click(); h.$('element-name').value = `Placement ${type}`;
    h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    await verifyNew();
  }
  h.$('tree-common').querySelector(`[data-add-junction-id="${createdId}"]`).click(); await verifyNew();
  [...h.$('inspector-content').querySelectorAll('button')].find(b => b.textContent === 'Добавить экземпляр в этот вид').click(); await verifyNew();
  const selected = h.$('canvas').querySelector('.junction.selected');
  selected.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 300, clientY: 100 }));
  h.$('context-menu').querySelector('[data-context-action="reuse-element"]').click(); await verifyNew();
  await h.load(previous); assert.deepEqual(await h.download(), previous, 'Native reopening retains automatic bounds without re-placement');
});

test(`${production ? 'production' : 'source'} app: covered junction placement area keeps draft, native bytes and both histories unchanged`, async t => {
  const h = await setup(t), store = createStore(createProject('Covered automatic area'));
  const run = c => store.execute(c, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Covered' });
  run({ type: 'createElementAndOccurrence', viewId, elementType: 'Grouping', name: 'Imported full-area rectangle', bounds: { x: -10, y: -10, width: 920, height: 660 } });
  const { junctionId } = run({ type: 'createJunctionAndOccurrence', viewId, junctionType: 'AndJunction', name: 'Explicit overlapping junction', bounds: { x: 200, y: 150, width: 36, height: 36 } });
  await h.load(serializeProjectFile(store.snapshot));
  h.$('project-name').click(); const rename = h.document.querySelector('.inline-editor input'); rename.value = 'Temporary rename';
  rename.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  h.$('undo').click(); const bytes = await h.download(), history = h.$('history-state').textContent;
  assert.equal(h.$('redo').disabled, false);
  h.$('create-orjunction').click(); h.$('element-name').value = 'Retained junction draft';
  for (let i = 0; i < 2; i++) h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('edit-dialog').open, true); assert.equal(h.$('element-name').value, 'Retained junction draft');
  assert.match(h.$('edit-error').textContent, /автоматического размещения 900 × 640/); assert.match(h.$('edit-error').textContent, /перетащите/);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
  h.$('edit-dialog').close(); assert.deepEqual(await h.download(), bytes);
  h.$('tree-common').querySelector(`[data-add-junction-id="${junctionId}"]`).click(); assert.match(h.$('status').textContent, /Нет свободного места/);
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('redo').disabled, false);
  h.$('tree-common').querySelector(`[data-junction-id="${junctionId}"]`).click();
  [...h.$('inspector-content').querySelectorAll('button')].find(b => b.textContent === 'Добавить экземпляр в этот вид').click();
  assert.match(h.$('status').textContent, /Нет свободного места/); assert.deepEqual(await h.download(), bytes);
  const group = h.$('canvas').querySelector('.junction'); group.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 300, clientY: 100 }));
  h.$('context-menu').querySelector('[data-context-action="reuse-element"]').click(); assert.match(h.$('status').textContent, /Нет свободного места/);
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('redo').disabled, false);
});

test(`${production ? 'production' : 'source'} app: tiny imported element accent retains automatic junction clearance with saved geometry ON/OFF`, async t => {
  const h = await setup(t), store = createStore(createProject('Tiny typed accent'));
  const { viewId } = store.execute({ type: 'createView', name: 'Tiny geometry' }, store.revision).created;
  store.execute({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Tiny imported width', bounds: { x: 167.9, y: 100, width: 0.1, height: 100 } }, store.revision);
  const seed = serializeProjectFile(store.snapshot);
  for (const stored of [false, true]) {
    await h.load(seed); setStoredGeometry(h, stored);
    const accent = h.$('canvas').querySelector('.node-accent'); assert.equal(accent.getAttribute('width'), '4');
    h.$('create-andjunction').click(); h.$('element-name').value = 'Clear of accent';
    h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    const saved = await h.download(), current = deserializeProjectFile(saved).views[0];
    const created = current.occurrences.find(o => o.concept.kind === 'junction');
    assert.ok(Math.round(created.bounds.x * 10) >= 1679 + Number(accent.getAttribute('width')) * 10 + 120);
    assert.equal(created.bounds.y, 118); assert.equal(h.$('canvas').querySelector('.junction').getAttribute('aria-pressed'), 'true');
    setStoredGeometry(h, !stored); assert.deepEqual(await h.download(), saved);
  }
});
