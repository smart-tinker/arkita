import { production, setup, richLifecycleFixture, setStoredGeometry, assertFittedCaption } from './app-test-fixture.js';
import { importedRelationship } from './imported-relationship.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { connectionGeometry } from '../src/connection-geometry.js';

for (const type of ['Service', 'Process', 'Function', 'Event']) test(`${production ? 'production' : 'source'} app: ${type} keeps rounded routes, anchors, full text and bytes through themes, states, shared previews and history`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), state = fixture.state;
  const name = 'Order processing queue and scheduled dispatch';
  Object.assign(state.elements.find(e => e.id === fixture.a.elementId), { type, name });
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  Object.assign(occurrence.bounds, { width: 120, height: 55 });
  view.connections[0].routePoints.push({ kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  importedRelationship(state, { viewId: fixture.viewId, relationshipType: 'Flow', label: 'Retained self loop', source: { kind: 'occurrence', id: occurrence.id }, target: { kind: 'occurrence', id: occurrence.id } });
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const originalText = [...get().querySelectorAll('text')].map(n => n.outerHTML);
  assertFittedCaption(get(), type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, name);
  assert.equal(get().querySelectorAll('.node-title').length, 1);
  assert.ok(get().querySelector('.node-title').textContent.endsWith('…'));
  const shared = root => {
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').getAttribute('rx'), '12');
    const glyph = root.querySelector(`.${type.toLowerCase()}-glyph`); assert.ok(glyph); assert.equal(glyph.children.length, 1);
    assert.equal(glyph.getAttribute('aria-hidden'), 'true'); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(glyph.innerHTML, get().querySelector(`.${type.toLowerCase()}-glyph`).innerHTML);
  };
  for (const theme of ['light', 'dark']) for (const saved of [false, true]) {
    h.change('theme-mode', theme); setStoredGeometry(h, saved); shared(get()); shared(h.$(`create-${type.toLowerCase()}`));
    h.$('help-button').click(); shared(h.$('notation-legend-items').querySelector(`[data-legend-type="${type}"]`)); h.$('help-dialog').close();
    for (const c of view.connections) {
      const reference = connectionGeometry(c, view.occurrences, o => o.id === occurrence.id ? 12 : 0, saved, view.connections), group = h.$('canvas').querySelector(`[data-id="${c.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), reference.d); assert.equal(group.querySelector('.hit').getAttribute('d'), reference.d);
    }
    get().focus(); assert.equal(h.document.activeElement, get()); get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(get().getAttribute('aria-pressed'), 'true'); shared(get()); h.$('fit-button').click();
    assert.deepEqual([...get().querySelectorAll('text')].map(n => n.outerHTML), originalText);
    assert.equal(h.$('canvas').querySelector('.view-anchor-mark').getAttribute('cx'), '300');
    assert.equal(h.$('history-state').textContent, history); assert.deepEqual(await h.download(), bytes);
  }
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119); assert.ok(get().classList.contains('dragging')); shared(get());
  h.pointer(h.$('canvas'), 'pointercancel'); assert.deepEqual(await h.download(), bytes);
  get().dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  const input = h.document.querySelector('.inline-editor input'); input.value = 'Temporary change'; input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const changed = await h.download(); h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), changed);
  await h.load(bytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); shared(get());
  assert.deepEqual([...get().querySelectorAll('text')].map(n => n.outerHTML), originalText); assert.deepEqual(await h.download(), bytes);
});
