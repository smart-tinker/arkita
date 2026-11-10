import { production, setup, richLifecycleFixture, setStoredGeometry, assertFittedCaption } from './app-test-fixture.js';
import { importedRelationship } from './imported-relationship.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { notationElement, notationBox } from '../src/notation.js';
import { connectionGeometry } from '../src/connection-geometry.js';

for (const type of ['Plateau', 'Equipment', 'Facility']) for (const [width, height] of [[220, 90], [120, 55]]) test(`${production ? 'production' : 'source'} app: ${type} ${width}x${height} corrected rectangle shares canvas/palette/legend while saved routes, anchors, full captions, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  Object.assign(fixture.state.elements.find(e => e.id === fixture.a.elementId), { type, name: '<img src=x> 日本語' });
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  Object.assign(initialView.occurrences.find(o => o.id === fixture.a.occurrenceId).bounds, { width, height });
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  store.execute({ type: 'createRelationshipAndConnection', viewId: fixture.viewId, relationshipType: 'Flow', label: `${type} self loop`, source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } }, store.revision);
  const state = store.snapshot;
  for (const [source, target] of [[fixture.a, fixture.b], [fixture.b, fixture.a]]) importedRelationship(state, { viewId: fixture.viewId, relationshipType: 'Flow', label: 'Automatic direction', source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId } });
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  assert.equal(h.$('canvas').querySelector('img,script'), null);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const glyph = root.querySelector(`.${type.toLowerCase()}-glyph`); assert.ok(glyph);
    assert.equal(glyph.getAttribute('pointer-events'), 'none'); assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.children.length, type === 'Plateau' ? 3 : type === 'Equipment' ? 4 : 1);
    const expectedBox = notationBox(h.document, notationElement(CURRENT_METAMODEL, type), { width, height });
    assert.equal(glyph.innerHTML, expectedBox.querySelector(`.${type.toLowerCase()}-glyph`).innerHTML);
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').tagName, 'rect');
    assert.equal(root.querySelector('.node-box').getAttribute('rx'), '0'); return glyph;
  };
  assertFittedCaption(get(), type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, state.elements.find(e => e.id === occurrence.concept.id).name);
  assert.match(get().querySelector('.node-type').textContent, / · \d{2}$/);
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Rectangle route reference plus independent endpoint oracle below; the former cuboid is intentionally different.
      const expected = connectionGeometry(connection, view.occurrences, () => 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
      assert.equal(group.querySelector('.line').getAttribute('marker-end'), 'url(#notation-canvas-closed)');
      if (!connection.routePoints.length && connection.source.id !== connection.target.id) {
        const from = view.occurrences.find(o => o.id === connection.source.id).bounds, to = view.occurrences.find(o => o.id === connection.target.id).bounds;
        const endpoint = (r, other) => { const x = r.x + r.width / 2, y = r.y + r.height / 2, dx = other.x + other.width / 2 - x, dy = other.y + other.height / 2 - y, f = Math.min(dx ? r.width / 2 / Math.abs(dx) : Infinity, dy ? r.height / 2 / Math.abs(dy) : Infinity); return [x + f * dx, y + f * dy]; };
        const numbers = group.querySelector('.line').getAttribute('d').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
        [...endpoint(from, to), ...endpoint(to, from)].forEach((value, index) => assert.ok(Math.abs(numbers[index] - value) < 1e-7));
      }
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

for (const type of ['Role', 'Collaboration', 'Path', 'Location', 'BusinessActor']) for (const [width, height] of [[220, 90], [120, 55]]) test(`${production ? 'production' : 'source'} app: ${type} ${width}x${height} structure rectangle shares canvas/palette/legend while saved routes, anchors, full captions, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  Object.assign(fixture.state.elements.find(e => e.id === fixture.a.elementId), { type, name: 'Order processing queue and scheduled dispatch' });
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  Object.assign(initialView.occurrences.find(o => o.id === fixture.a.occurrenceId).bounds, { width, height });
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  store.execute({ type: 'createRelationshipAndConnection', viewId: fixture.viewId, relationshipType: 'Flow', label: `${type} self loop`, source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } }, store.revision);
  const state = store.snapshot;
  for (const [source, target] of [[fixture.a, fixture.b], [fixture.b, fixture.a]]) importedRelationship(state, { viewId: fixture.viewId, relationshipType: 'Flow', label: 'Automatic direction', source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId } });
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  assert.equal(h.$('canvas').querySelector('img,script'), null);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const glyph = root.querySelector(`.${type.toLowerCase()}-glyph`); assert.ok(glyph);
    assert.equal(glyph.getAttribute('pointer-events'), 'none'); assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.children.length, { Role: 2, Collaboration: 2, Path: 4, Location: 1, BusinessActor: 4 }[type]);
    const expectedBox = notationBox(h.document, notationElement(CURRENT_METAMODEL, type), { width, height });
    assert.equal(glyph.innerHTML, expectedBox.querySelector(`.${type.toLowerCase()}-glyph`).innerHTML);
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').tagName, 'rect');
    assert.equal(root.querySelector('.node-box').getAttribute('rx'), '0'); return glyph;
  };
  assertFittedCaption(get(), type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, state.elements.find(e => e.id === occurrence.concept.id).name);
  assert.match(get().querySelector('.node-type').textContent, / · \d{2}$/);
  assert.equal(get().querySelectorAll('.node-title').length, height === 55 ? 1 : 2);
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Independent pre-badge rectangle route reference and endpoint oracle.
      const expected = connectionGeometry(connection, view.occurrences, () => 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
      assert.equal(group.querySelector('.line').getAttribute('marker-end'), 'url(#notation-canvas-closed)');
      if (!connection.routePoints.length && connection.source.id !== connection.target.id) {
        const from = view.occurrences.find(o => o.id === connection.source.id).bounds, to = view.occurrences.find(o => o.id === connection.target.id).bounds;
        const endpoint = (r, other) => { const x = r.x + r.width / 2, y = r.y + r.height / 2, dx = other.x + other.width / 2 - x, dy = other.y + other.height / 2 - y, f = Math.min(dx ? r.width / 2 / Math.abs(dx) : Infinity, dy ? r.height / 2 / Math.abs(dy) : Infinity); return [x + f * dx, y + f * dy]; };
        const numbers = group.querySelector('.line').getAttribute('d').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
        [...endpoint(from, to), ...endpoint(to, from)].forEach((value, index) => assert.ok(Math.abs(numbers[index] - value) < 1e-7));
      }
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
