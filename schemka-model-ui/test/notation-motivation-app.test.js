import { production, setup, richLifecycleFixture, setStoredGeometry, assertFittedCaption } from './app-test-fixture.js';
import { importedRelationship } from './imported-relationship.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { notationElement, notationBox } from '../src/notation.js';
import { connectionGeometry } from '../src/connection-geometry.js';

for (const type of ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement']) for (const [width, height] of [[220, 90], [120, 55]]) test(`${production ? 'production' : 'source'} app: ${type} ${width}x${height} Motivation octagon shares canvas/palette/legend while saved routes, anchors, full captions, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  Object.assign(fixture.state.elements.find(e => e.id === fixture.a.elementId), { type, name: 'Order processing queue and scheduled dispatch' });
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  Object.assign(initialView.occurrences.find(o => o.id === fixture.a.occurrenceId).bounds, { width, height });
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  const state = store.snapshot;
  // Imported synthetic geometry exercises display without bypassing creation policy.
  importedRelationship(state, { viewId: fixture.viewId, relationshipType: 'Flow', label: `${type} self loop`, source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } });
  for (const [source, target] of [[fixture.a, fixture.b], [fixture.b, fixture.a]]) importedRelationship(state, { viewId: fixture.viewId, relationshipType: 'Flow', label: 'Automatic direction', source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId } });
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  assert.equal(h.$('canvas').querySelector('img,script'), null);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const glyph = root.querySelector(`.${type.toLowerCase()}-glyph`); assert.ok(glyph);
    assert.equal(glyph.getAttribute('pointer-events'), 'none'); assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.children.length, { Stakeholder: 2, Driver: 6, Assessment: 2, Goal: 3, Outcome: 5, Principle: 3, Requirement: 1 }[type]);
    const expectedBox = notationBox(h.document, notationElement(CURRENT_METAMODEL, type), { width, height });
    assert.equal(glyph.innerHTML, expectedBox.querySelector(`.${type.toLowerCase()}-glyph`).innerHTML);
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').tagName, 'polygon');
    assert.equal(root.querySelectorAll('rect:not(.node-detail):not(.node-accent)').length, 0); return glyph;
  };
  assertFittedCaption(get(), type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, state.elements.find(e => e.id === occurrence.concept.id).name);
  assert.match(get().querySelector('.node-type').textContent, / · \d{2}$/);
  assert.equal(get().querySelectorAll('.node-title').length, height === 55 ? 1 : 2);
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Independent pre-badge octagon token for this occurrence; all other shapes remain rectangles.
      const expected = connectionGeometry(connection, view.occurrences, o => o.id === occurrence.id ? 'octagon' : 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
      assert.equal(group.querySelector('.line').getAttribute('marker-end'), 'url(#notation-canvas-closed)');

    }
  };
  for (const theme of ['light', 'dark']) for (const saved of [false, true]) {
    h.change('theme-mode', theme); setStoredGeometry(h, saved); sharedGlyph(get()); sharedGlyph(h.$(`create-${type.toLowerCase()}`));
    h.$('help-button').click(); sharedGlyph(h.$('notation-legend-items').querySelector(`[data-legend-type="${type}"]`)); h.$('help-dialog').close();
    checkRoutes(saved); assert.deepEqual(text(), originalText);
    assert.equal(get().getAttribute('role'), 'button'); assert.equal(get().getAttribute('tabindex'), '0'); assert.ok(get().getAttribute('aria-label').startsWith(`${type}:`));
    get().focus(); assert.equal(h.document.activeElement, get());
    get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(get().getAttribute('aria-pressed'), 'true'); assert.ok(get().classList.contains('selected')); sharedGlyph(get());
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const o of view.occurrences) {
      assert.ok(x <= o.bounds.x && x + width >= o.bounds.x + o.bounds.width);
      assert.ok(y <= o.bounds.y && y + height >= o.bounds.y + o.bounds.height);
    }
    assert.equal(h.$('canvas').querySelector('.view-anchor-mark').getAttribute('cx'), '300');
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  }
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119);
  assert.ok(get().classList.contains('dragging')); sharedGlyph(get()); assert.deepEqual(text(), originalText);
  h.pointer(h.$('canvas'), 'pointerup', 123, 119);
  assert.equal(h.$('file-state').dataset.dirty, 'true');
  const moved = await h.download(), expected = structuredClone(state);
  Object.assign(expected.views.find(v => v.view.id === fixture.viewId).occurrences.find(o => o.id === occurrence.id).bounds, { x: 63.1, y: 99.2 });
  assert.deepEqual(deserializeProjectFile(moved), deserializeProjectFile(serializeProjectFile(expected)), 'Only the moved occurrence coordinates change; endpoints, anchors and model semantics are retained');
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); checkRoutes(true);
  const redoHistory = h.$('history-state').textContent;
  h.change('theme-mode', 'light'); setStoredGeometry(h, false); h.$('fit-button').click();
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('history-state').textContent, redoHistory); assert.deepEqual(await h.download(), bytes); checkRoutes(false);
  h.$('redo').click(); assert.deepEqual(await h.download(), moved); sharedGlyph(get()); assert.deepEqual(text(), originalText);
  await h.load(moved); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); sharedGlyph(get()); assert.deepEqual(text(), originalText); assert.deepEqual(await h.download(), moved);
  assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true); assert.equal(h.$('file-state').dataset.dirty, 'false');
});

for (const [width, height] of [[120, 55], [220, 90]]) test(`${production ? 'production' : 'source'} app: all seven Motivation captions retain centered 95–101 indices, Unicode literal text and bounded name rows at ${width}x${height}`, async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic Motivation caption matrix')), types = ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement'];
  const { viewId } = store.execute({ type: 'createView', name: 'Caption matrix' }, store.revision).created;
  const longName = 'Обработка заявок 日本語 <img> и очередь сообщений';
  for (const type of types) store.execute({ type: 'createElementAndOccurrence', viewId, elementType: type, name: longName, bounds: { x: 40, y: 80, width, height } }, store.revision);
  const state = store.snapshot, view = state.views[0], templates = view.occurrences;
  view.occurrences = Array.from({ length: 101 }, (_, index) => ({ ...structuredClone(templates[index < 94 ? 0 : index - 94]), id: `occ-00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, bounds: { x: 40 + index * 250, y: 80, width, height } }));
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  for (const [i, type] of types.entries()) {
    const node = h.$('canvas').querySelector(`[data-id="${view.occurrences[94 + i].id}"]`), caption = node.querySelector('.node-type');
    assertFittedCaption(node, type, { width, height }, 95 + i, longName);
    assert.equal(node.querySelectorAll('.node-title').length, height === 55 ? 1 : 2);
    for (const text of node.querySelectorAll('.node-type,.node-title')) assert.equal(text.getAttribute('text-anchor'), 'middle');
    assert.equal(node.querySelector('img,script,foreignObject'), null);
    h.$('help-button').click(); const legend = h.$('notation-legend-items').querySelector(`[data-legend-type="${type}"] .legend-type`); assert.equal(legend.getAttribute('x'), '84.5'); assert.equal(legend.getAttribute('y'), '18'); assert.equal(legend.getAttribute('text-anchor'), 'middle'); h.$('help-dialog').close();
    assert.equal(h.$(`create-${type.toLowerCase()}`).querySelector('svg').getAttribute('viewBox'), '0 0 44 28');
  }
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('undo').disabled, true);
});
