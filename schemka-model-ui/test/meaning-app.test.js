import test from 'node:test';
import assert from 'node:assert/strict';
import { importedRelationship } from './imported-relationship.js';
import { createProject, createStore, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { notationElement, notationBox } from '../src/notation.js';
import { connectionGeometry } from '../src/connection-geometry.js';
import { production, setup, richLifecycleFixture, setStoredGeometry, assertFittedCaption } from './app-test-fixture.js';

// Separate file bounds test-only ESM app-instance retention; assertions and production lifecycle are unchanged.
for (const type of ['Meaning']) for (const [width, height] of [[220, 90], [120, 55], [210, 90]]) test(`${production ? 'production' : 'source'} app: ${type} ${width}x${height} Meaning cloud and detached satellites shares canvas/palette/legend while saved routes, anchors, full captions, Fit and native history remain intact`, async t => {
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
    const glyph = root.querySelector('.notation-meaning'); assert.ok(glyph);
    assert.equal(glyph.children.length, 3); assert.equal(glyph.querySelectorAll('.meaning-bubble').length, 2);
    for (const bubble of glyph.querySelectorAll('.meaning-bubble')) { assert.equal(bubble.getAttribute('pointer-events'), 'none'); assert.equal(bubble.getAttribute('aria-hidden'), 'true'); }
    const bounds = root.id === 'create-meaning' ? { width:38,height:20 } : root.hasAttribute('data-legend-type') ? { width:169,height:28 } : { width,height };
    const expectedBox = notationBox(h.document, notationElement(CURRENT_METAMODEL, type), bounds);
    assert.equal(glyph.outerHTML, expectedBox.outerHTML); assert.equal(root.querySelectorAll('.node-box').length, 1);
    assert.equal(root.querySelector('.node-box').tagName, 'polygon'); assert.equal(root.querySelector('.node-box').getAttribute('points').split(' ').length, 96);
    return glyph;
  };
  assertFittedCaption(get(), type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, state.elements.find(e => e.id === occurrence.concept.id).name);
  assert.match(get().querySelector('.node-type').textContent, / · \d{2}$/);
  assert.equal(get().querySelectorAll('.node-title').length, height === 55 ? 1 : 2);
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Original Meaning cloud contour; satellites never participate in routing.
      const expected = connectionGeometry(connection, view.occurrences, o => o.id === occurrence.id ? 'cloud' : 0, saved, view.connections);
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
  // JSDOM does not hit-test. Dispatch on the canvas, the expected pointer-inert satellite backdrop target.
  // Actual pointer-device hit acceptance remains a separate native/browser check.
  for (const bubble of get().querySelectorAll('.meaning-bubble')) {
    const x = occurrence.bounds.x + Number(bubble.getAttribute('cx')), y = occurrence.bounds.y + Number(bubble.getAttribute('cy'));
    h.pointer(h.$('canvas'), 'pointerdown', x, y); h.pointer(h.$('canvas'), 'pointermove', x + 20, y + 20); h.pointer(h.$('canvas'), 'pointerup', x + 20, y + 20);
    assert.equal(h.$('canvas').querySelector('.dragging'), null); assert.deepEqual(await h.download(), bytes);
    h.$('smart-link-tool').click(); h.pointer(h.$('canvas'), 'pointerdown', x, y);
    assert.equal(h.$('canvas').querySelector('.smart-link-preview'), null); assert.equal(h.$('canvas').hasPointerCapture(1), false); assert.deepEqual(await h.download(), bytes);
  }
  h.$('smart-link-tool').click(); h.pointer(get().querySelector('.node-box'), 'pointerdown', occurrence.bounds.x + width/2, occurrence.bounds.y + height/2);
  assert.ok(h.$('canvas').querySelector('.smart-link-preview')); h.pointer(h.$('canvas'), 'pointercancel'); assert.deepEqual(await h.download(), bytes);
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 106, 104); h.pointer(h.$('canvas'), 'pointercancel');
  assert.deepEqual(await h.download(), bytes); assert.deepEqual(text(), originalText);
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

for (const [width, height] of [[120,55],[220,90],[210,90]]) test(`${production ? 'production' : 'source'} app: Meaning full caption, bounded literal Unicode name rows and native labels at ${width}x${height}`, async t => {
  const h=await setup(t),store=createStore(createProject('Meaning literal text')),viewId=store.execute({type:'createView',name:'Meaning labels'},store.revision).created.viewId;
  const name='Обработка e\u0301 日本語 <img onerror=alert(1)> & <script>';
  store.execute({type:'createElementAndOccurrence',viewId,elementType:'Meaning',name,bounds:{x:40,y:80,width,height}},store.revision);
  const bytes=Buffer.from(serializeProjectFile(store.snapshot));await h.load(bytes);const node=h.$('canvas').querySelector('[data-kind="occurrence"]'),caption=node.querySelector('.node-type'),names=[...node.querySelectorAll('.node-title')];
  assertFittedCaption(node, 'Meaning', { width, height }, 1, name);
  assert.equal(names.length,height===55?1:2);
  for (const text of [caption,...names]) assert.equal(text.getAttribute('text-anchor'),'middle');
  assert.equal(node.querySelector('img,script,foreignObject'),null);assert.ok(node.getAttribute('aria-label').includes(name));assert.ok(node.querySelector('title').textContent.includes(name));assert.ok(h.document.body.textContent.includes(name));assert.deepEqual(await h.download(),bytes);
});
