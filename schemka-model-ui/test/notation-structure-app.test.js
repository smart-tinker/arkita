import { production, setup, richLifecycleFixture, setStoredGeometry, assertFittedCaption } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { connectionGeometry } from '../src/connection-geometry.js';
import { fixture } from './notation-app-helpers.js';

test(`${production ? 'production' : 'source'} app: Device badge is shared by canvas, palette and legend without changing routes, Fit, bytes or history`, async t => {
  const h = await setup(t), state = fixture(); await h.load(serializeProjectFile(state));
  const device = state.elements.find(e => e.type === 'Device'), occurrence = state.views.find(v => v.view.id === h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId).occurrences.find(o => o.concept.id === device.id);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`);
  const bytes = await h.download(), history = h.$('history-state').textContent;
  const paths = () => [...h.$('canvas').querySelectorAll('.connection .line')].map(p => p.getAttribute('d'));
  const automatic = paths();
  const sharedGlyph = root => {
    const glyph = root.querySelector('.device-glyph'); assert.ok(glyph); assert.equal(glyph.getAttribute('pointer-events'), 'none');
    assert.equal(glyph.querySelector('rect').getAttribute('rx'), '1.5'); assert.equal(glyph.querySelector('polygon').getAttribute('points'), '5,13 15,13 19,16 1,16');
    assert.equal(root.querySelector('.node-box').tagName, 'rect'); return glyph;
  };
  sharedGlyph(get()); sharedGlyph(h.$('create-device'));
  h.$('help-button').click(); sharedGlyph(h.$('notation-legend-items').querySelector('[data-legend-type="Device"]')); h.$('help-dialog').close();
  for (const theme of ['light', 'dark']) for (const saved of [false, true]) {
    h.change('theme-mode', theme); setStoredGeometry(h, saved); sharedGlyph(get());
    assert.deepEqual(paths(), automatic); h.$('fit-button').click();
    const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    assert.ok(x <= occurrence.bounds.x && x + width >= occurrence.bounds.x + occurrence.bounds.width);
    assert.ok(y <= occurrence.bounds.y && y + height >= occurrence.bounds.y + occurrence.bounds.height);
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  }
  get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(get().getAttribute('aria-pressed'), 'true');
  get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  const moved = await h.download(); assert.notDeepEqual(moved, bytes); sharedGlyph(get());
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); assert.deepEqual(paths(), automatic);
  h.$('redo').click(); assert.deepEqual(await h.download(), moved); sharedGlyph(get());
});

test(`${production ? 'production' : 'source'} app: Node cuboid shares canvas/palette/legend while rectangle routes, anchors, text, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  fixture.state.elements.find(e => e.id === fixture.a.elementId).type = 'Node';
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  store.execute({ type: 'createRelationshipAndConnection', viewId: fixture.viewId, relationshipType: 'Flow', label: 'Node self loop', source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } }, store.revision);
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const glyph = root.querySelector('.node-glyph'); assert.ok(glyph);
    assert.equal(glyph.getAttribute('pointer-events'), 'none'); assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.querySelector('polygon.node-detail').getAttribute('points'), '2,4 4,2 18,2 18,12 16,14 2,14');
    assert.deepEqual([...glyph.querySelectorAll('polyline.node-detail')].map(p => p.getAttribute('points')), ['2,4 16,4', '16,4 18,2', '16,4 16,14']);
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').tagName, 'rect');
    assert.equal(root.querySelector('.node-box').getAttribute('rx'), '0'); return glyph;
  };
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Independent pre-badge rectangle baseline, without deriving a contour from notationElement.
      const expected = connectionGeometry(connection, view.occurrences, () => 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
    }
  };
  for (const theme of ['light', 'dark']) for (const saved of [false, true]) {
    h.change('theme-mode', theme); setStoredGeometry(h, saved); sharedGlyph(get()); sharedGlyph(h.$('create-node'));
    h.$('help-button').click(); sharedGlyph(h.$('notation-legend-items').querySelector('[data-legend-type="Node"]')); h.$('help-dialog').close();
    checkRoutes(saved); assert.deepEqual(text(), originalText);
    assert.equal(get().getAttribute('role'), 'button'); assert.equal(get().getAttribute('tabindex'), '0'); assert.match(get().getAttribute('aria-label'), /^Node:/);
    get().focus(); assert.equal(h.document.activeElement, get());
    get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(get().getAttribute('aria-pressed'), 'true'); assert.ok(get().classList.contains('selected')); sharedGlyph(get());
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const o of view.occurrences) {
      assert.ok(x <= o.bounds.x && x + width >= o.bounds.x + o.bounds.width);
      assert.ok(y <= o.bounds.y && y + height >= o.bounds.y + o.bounds.height);
    }
    assert.equal(h.$('canvas').querySelector('.view-anchor-mark').getAttribute('cx'), '300');
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  }
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119);
  assert.ok(get().classList.contains('dragging')); sharedGlyph(get()); assert.deepEqual(text(), originalText);
  h.pointer(h.$('canvas'), 'pointerup', 123, 119);
  const moved = await h.download(), expected = structuredClone(state);
  Object.assign(expected.views.find(v => v.view.id === fixture.viewId).occurrences.find(o => o.id === occurrence.id).bounds, { x: 63.1, y: 99.2 });
  assert.deepEqual(deserializeProjectFile(moved), deserializeProjectFile(serializeProjectFile(expected)), 'Only the moved occurrence coordinates change; endpoints, anchors and model semantics are retained');
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); checkRoutes(true);
  const redoHistory = h.$('history-state').textContent;
  h.change('theme-mode', 'light'); setStoredGeometry(h, false); h.$('fit-button').click();
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('history-state').textContent, redoHistory); assert.deepEqual(await h.download(), bytes); checkRoutes(false);
  h.$('redo').click(); assert.deepEqual(await h.download(), moved); sharedGlyph(get()); assert.deepEqual(text(), originalText);
});

test(`${production ? 'production' : 'source'} app: Grouping dashes share canvas/palette/legend while folder routes, anchors, text, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  Object.assign(fixture.state.elements.find(e => e.id === fixture.a.elementId), { type: 'Grouping', name: '<img src=x> 日本語' });
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  store.execute({ type: 'createRelationshipAndConnection', viewId: fixture.viewId, relationshipType: 'Flow', label: 'Grouping self loop', source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } }, store.revision);
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  assert.equal(h.$('canvas').querySelector('img,script'), null);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const outline = root.querySelector('polygon.node-box'), divider = root.querySelector('line.grouping-divider');
    assert.ok(outline); assert.ok(divider); assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelectorAll('rect.node-box').length, 0);
    assert.equal(outline.getAttribute('stroke-dasharray'), '7 5'); assert.equal(divider.getAttribute('stroke-dasharray'), '7 5');
    assert.equal(divider.getAttribute('pointer-events'), 'none'); assert.equal(divider.getAttribute('aria-hidden'), 'true');
    const points = outline.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number));
    const width = points[3][0], height = points[4][1];
    assert.deepEqual(points, [[0, 0], [width * .4, 0], [width * .4, height * .2], [width, height * .2], [width, height], [0, height]]);
    assert.deepEqual(['x1', 'x2', 'y1', 'y2'].map(key => Number(divider.getAttribute(key))), [0, width * .4, height * .2, height * .2]);
    return divider;
  };
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  for (const item of get().querySelectorAll('.node-title,.node-type')) { assert.equal(item.getAttribute('text-anchor'), 'middle'); assert.equal(Number(item.getAttribute('x')), 110); }
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Independent pre-correction contour tokens; dashed decorations do not participate in routing.
      const expected = connectionGeometry(connection, view.occurrences, o => o.concept.id === fixture.a.elementId ? 'folder' : 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
    }
  };
  for (const theme of ['light', 'dark']) for (const saved of [false, true]) {
    h.change('theme-mode', theme); setStoredGeometry(h, saved); sharedGlyph(get()); sharedGlyph(h.$('create-grouping'));
    h.$('help-button').click(); sharedGlyph(h.$('notation-legend-items').querySelector('[data-legend-type="Grouping"]')); h.$('help-dialog').close();
    checkRoutes(saved); assert.deepEqual(text(), originalText);
    assert.equal(get().getAttribute('role'), 'button'); assert.equal(get().getAttribute('tabindex'), '0'); assert.match(get().getAttribute('aria-label'), /^Grouping:/);
    get().focus(); assert.equal(h.document.activeElement, get());
    get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(get().getAttribute('aria-pressed'), 'true'); assert.ok(get().classList.contains('selected')); sharedGlyph(get());
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const o of view.occurrences) {
      assert.ok(x <= o.bounds.x && x + width >= o.bounds.x + o.bounds.width);
      assert.ok(y <= o.bounds.y && y + height >= o.bounds.y + o.bounds.height);
    }
    assert.equal(h.$('canvas').querySelector('.view-anchor-mark').getAttribute('cx'), '300');
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  }
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119);
  assert.ok(get().classList.contains('dragging')); sharedGlyph(get()); assert.deepEqual(text(), originalText);
  h.pointer(h.$('canvas'), 'pointerup', 123, 119);
  const moved = await h.download(), expected = structuredClone(state);
  Object.assign(expected.views.find(v => v.view.id === fixture.viewId).occurrences.find(o => o.id === occurrence.id).bounds, { x: 63.1, y: 99.2 });
  assert.deepEqual(deserializeProjectFile(moved), deserializeProjectFile(serializeProjectFile(expected)), 'Only the moved occurrence coordinates change; endpoints, anchors and model semantics are retained');
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); checkRoutes(true);
  const redoHistory = h.$('history-state').textContent;
  h.change('theme-mode', 'light'); setStoredGeometry(h, false); h.$('fit-button').click();
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('history-state').textContent, redoHistory); assert.deepEqual(await h.download(), bytes); checkRoutes(false);
  h.$('redo').click(); assert.deepEqual(await h.download(), moved); sharedGlyph(get()); assert.deepEqual(text(), originalText);
});

test(`${production ? 'production' : 'source'} app: ApplicationComponent badge shares canvas/palette/legend while rectangle routes, anchors, text, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  Object.assign(fixture.state.elements.find(e => e.id === fixture.a.elementId), { type: 'ApplicationComponent', name: '<img src=x> 日本語' });
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  store.execute({ type: 'createRelationshipAndConnection', viewId: fixture.viewId, relationshipType: 'Flow', label: 'ApplicationComponent self loop', source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } }, store.revision);
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  assert.equal(h.$('canvas').querySelector('img,script'), null);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const glyph = root.querySelector('.component-glyph'); assert.ok(glyph);
    assert.equal(glyph.getAttribute('pointer-events'), 'none'); assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.querySelector('path.node-detail').getAttribute('d'), 'M6 2.5 V1 H18 V10 H6 V8.5 M6 4.5 V6.5');
    assert.deepEqual([...glyph.querySelectorAll('rect.node-detail')].map(tab => ['x', 'y', 'width', 'height'].map(key => Number(tab.getAttribute(key)))), [[2, 2.5, 8, 2], [2, 6.5, 8, 2]]);
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').tagName, 'rect');
    assert.equal(root.querySelector('.node-box').getAttribute('rx'), '0'); return glyph;
  };
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Independent pre-badge rectangle baseline, without deriving a contour from notationElement.
      const expected = connectionGeometry(connection, view.occurrences, () => 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
    }
  };
  for (const theme of ['light', 'dark']) for (const saved of [false, true]) {
    h.change('theme-mode', theme); setStoredGeometry(h, saved); sharedGlyph(get()); sharedGlyph(h.$('create-applicationcomponent'));
    h.$('help-button').click(); sharedGlyph(h.$('notation-legend-items').querySelector('[data-legend-type="ApplicationComponent"]')); h.$('help-dialog').close();
    checkRoutes(saved); assert.deepEqual(text(), originalText);
    assert.equal(get().getAttribute('role'), 'button'); assert.equal(get().getAttribute('tabindex'), '0'); assert.match(get().getAttribute('aria-label'), /^ApplicationComponent:/);
    get().focus(); assert.equal(h.document.activeElement, get());
    get().dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(get().getAttribute('aria-pressed'), 'true'); assert.ok(get().classList.contains('selected')); sharedGlyph(get());
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const o of view.occurrences) {
      assert.ok(x <= o.bounds.x && x + width >= o.bounds.x + o.bounds.width);
      assert.ok(y <= o.bounds.y && y + height >= o.bounds.y + o.bounds.height);
    }
    assert.equal(h.$('canvas').querySelector('.view-anchor-mark').getAttribute('cx'), '300');
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  }
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119);
  assert.ok(get().classList.contains('dragging')); sharedGlyph(get()); assert.deepEqual(text(), originalText);
  h.pointer(h.$('canvas'), 'pointerup', 123, 119);
  const moved = await h.download(), expected = structuredClone(state);
  Object.assign(expected.views.find(v => v.view.id === fixture.viewId).occurrences.find(o => o.id === occurrence.id).bounds, { x: 63.1, y: 99.2 });
  assert.deepEqual(deserializeProjectFile(moved), deserializeProjectFile(serializeProjectFile(expected)), 'Only the moved occurrence coordinates change; endpoints, anchors and model semantics are retained');
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); checkRoutes(true);
  const redoHistory = h.$('history-state').textContent;
  h.change('theme-mode', 'light'); setStoredGeometry(h, false); h.$('fit-button').click();
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('history-state').textContent, redoHistory); assert.deepEqual(await h.download(), bytes); checkRoutes(false);
  h.$('redo').click(); assert.deepEqual(await h.download(), moved); sharedGlyph(get()); assert.deepEqual(text(), originalText);
});

for (const type of ['BusinessInterface', 'ApplicationInterface', 'TechnologyInterface']) test(`${production ? 'production' : 'source'} app: ${type} interface badge shares canvas/palette/legend while rectangle routes, anchors, text, Fit and native history remain intact`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  Object.assign(fixture.state.elements.find(e => e.id === fixture.a.elementId), { type, name: '<img src=x> 日本語' });
  const initialView = fixture.state.views.find(v => v.view.id === fixture.viewId);
  initialView.connections[0].routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000001', point: { x: 300, y: 10 } });
  const store = createStore(fixture.state);
  store.execute({ type: 'createRelationshipAndConnection', viewId: fixture.viewId, relationshipType: 'Flow', label: `${type} self loop`, source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId } }, store.revision);
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const view = state.views.find(v => v.view.id === fixture.viewId), occurrence = view.occurrences.find(o => o.id === fixture.a.occurrenceId);
  assert.equal(h.$('canvas').querySelector('img,script'), null);
  const get = () => h.$('canvas').querySelector(`[data-id="${occurrence.id}"]`), history = h.$('history-state').textContent;
  const sharedGlyph = root => {
    const glyph = root.querySelector('.interface-glyph'); assert.ok(glyph);
    assert.equal(glyph.getAttribute('pointer-events'), 'none'); assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(glyph.children.length, 2);
    const circle = glyph.querySelector('circle.node-detail'), stem = glyph.querySelector('line.node-detail');
    assert.ok(circle); assert.ok(stem);
    assert.deepEqual(['cx', 'cy', 'r'].map(key => Number(circle.getAttribute(key))), [13, 4.5, 3.5]);
    assert.deepEqual(['x1', 'x2', 'y1', 'y2'].map(key => Number(stem.getAttribute(key))), [2, 9.5, 4.5, 4.5]);
    assert.equal(root.querySelectorAll('.node-box').length, 1); assert.equal(root.querySelector('.node-box').tagName, 'rect');
    assert.equal(root.querySelector('.node-box').getAttribute('rx'), '0'); return glyph;
  };
  assertFittedCaption(get(), type, occurrence.bounds, view.occurrences.indexOf(occurrence) + 1, state.elements.find(e => e.id === occurrence.concept.id).name);
  assert.match(get().querySelector('.node-type').textContent, / · \d{2}$/);
  const text = () => [...get().querySelectorAll('text')].map(item => item.outerHTML), originalText = text();
  const checkRoutes = saved => {
    for (const connection of view.connections) {
      // Independent pre-badge rectangle baseline, without deriving a contour from notationElement.
      const expected = connectionGeometry(connection, view.occurrences, () => 0, saved, view.connections);
      const group = h.$('canvas').querySelector(`[data-id="${connection.id}"]`);
      assert.equal(group.querySelector('.line').getAttribute('d'), expected.d); assert.equal(group.querySelector('.hit').getAttribute('d'), expected.d);
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
    assert.deepEqual(await h.download(), bytes); assert.equal(h.$('history-state').textContent, history);
  }
  h.pointer(get(), 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119);
  assert.ok(get().classList.contains('dragging')); sharedGlyph(get()); assert.deepEqual(text(), originalText);
  h.pointer(h.$('canvas'), 'pointerup', 123, 119);
  const moved = await h.download(), expected = structuredClone(state);
  Object.assign(expected.views.find(v => v.view.id === fixture.viewId).occurrences.find(o => o.id === occurrence.id).bounds, { x: 63.1, y: 99.2 });
  assert.deepEqual(deserializeProjectFile(moved), deserializeProjectFile(serializeProjectFile(expected)), 'Only the moved occurrence coordinates change; endpoints, anchors and model semantics are retained');
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); checkRoutes(true);
  const redoHistory = h.$('history-state').textContent;
  h.change('theme-mode', 'light'); setStoredGeometry(h, false); h.$('fit-button').click();
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('history-state').textContent, redoHistory); assert.deepEqual(await h.download(), bytes); checkRoutes(false);
  h.$('redo').click(); assert.deepEqual(await h.download(), moved); sharedGlyph(get()); assert.deepEqual(text(), originalText);
});
