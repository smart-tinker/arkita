import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { production, setup, richLifecycleFixture, setStoredGeometry } from './app-test-fixture.js';
import { importedRelationship } from './imported-relationship.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';
import { notationElement } from '../src/notation.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { connectionGeometry } from '../src/connection-geometry.js';
import { nodeContourGeometry } from '../src/node-shapes.js';
import { beforeUnload, beginLayoutEdit, layoutHandle } from './notation-app-helpers.js';

test(`${production ? 'production' : 'source'} app: rejected saved-geometry changes preserve inline/dialog drafts and canvas/internal drag; selection and dirty undo/redo survive`, async t => {
  const h = await setup(t);
  const first = h.document.querySelector('#canvas .node');
  first.dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true }));
  const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = 'Keep this unsaved draft';
  assert.equal(h.pointer(h.$('stored-geometry'), 'pointerdown').defaultPrevented, true);
  h.$('stored-geometry').focus(); await Promise.resolve();
  assert.equal(h.document.activeElement, input);
  setStoredGeometry(h, true);
  assert.equal(h.$('stored-geometry').checked, false); assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(input.value, 'Keep this unsaved draft');
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(h.$('file-state').dataset.dirty, 'true');
  const dirtyHistory = h.$('history-state').textContent;
  setStoredGeometry(h, true); assert.equal(h.$('history-state').textContent, dirtyHistory); assert.equal(h.$('file-state').dataset.dirty, 'true');
  h.$('undo').click(); const undone = h.$('history-state').textContent;
  setStoredGeometry(h, false); assert.equal(h.$('redo').disabled, false); assert.equal(h.$('history-state').textContent, undone);
  h.$('redo').click(); assert.equal(h.$('file-state').dataset.dirty, 'true');
  h.$('create-node').click(); h.$('element-name').value = 'Keep creation draft'; setStoredGeometry(h, true);
  assert.equal(h.$('stored-geometry').checked, false); assert.equal(h.$('element-name').value, 'Keep creation draft'); assert.equal(h.$('edit-dialog').open, true); h.$('edit-dialog').close();
  const moving = h.document.querySelector('#canvas .node'), beforeTransform = moving.getAttribute('transform');
  h.pointer(moving, 'pointerdown', 100, 100);
  const originalClone = globalThis.structuredClone; let fullSnapshots = 0;
  globalThis.structuredClone = (value, ...options) => { if (value?.project?.metamodel && Array.isArray(value.elements) && Array.isArray(value.views)) fullSnapshots++; return originalClone(value, ...options); };
  try { h.pointer(h.$('canvas'), 'pointermove', 160, 130); h.pointer(h.$('canvas'), 'pointermove', 160, 130); }
  finally { globalThis.structuredClone = originalClone; }
  assert.equal(fullSnapshots, 0, 'Cached detached view and radius cache add no full snapshot clones to drag updates');
  assert.notEqual(moving.getAttribute('transform'), beforeTransform); const previewTransform = moving.getAttribute('transform');
  setStoredGeometry(h, true); assert.equal(h.$('stored-geometry').checked, false); assert.equal(moving.getAttribute('transform'), previewTransform);
  assert.equal(h.pointer(h.$('stored-geometry'), 'pointerdown', 0, 0, 2).defaultPrevented, true);
  assert.equal(moving.getAttribute('transform'), previewTransform);
  h.pointer(h.$('canvas'), 'pointerup', 160, 130);
  assert.equal(h.$('canvas').querySelector(`[data-id="${moving.dataset.id}"]`).getAttribute('transform'), previewTransform);
  setStoredGeometry(h, true); assert.ok(h.$('canvas').querySelector(`[data-id="${moving.dataset.id}"]`).classList.contains('selected'));
  // A pending palette drag also survives an attempted saved-geometry pointerdown. Cancel explicitly.
  h.pointer(h.$('create-node'), 'pointerdown', 20, 20, 3);
  assert.equal(h.pointer(h.$('stored-geometry'), 'pointerdown', 0, 0, 4).defaultPrevented, true);
  setStoredGeometry(h, false); assert.equal(h.$('stored-geometry').checked, true);
  h.pointer(h.$('create-node'), 'pointercancel', 20, 20, 3);
  setStoredGeometry(h, false); assert.equal(h.$('stored-geometry').checked, false);
});

test(`${production ? 'production' : 'source'} app: imported rounded corners and narrow self-loop use exact typed contours with stored geometry ON/OFF and fit, without altering JSON`, async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic contour regressions'));
  const run = command => store.execute(command, store.revision).created; const { viewId } = run({ type: 'createView', name: 'Imported bounds' });
  const add = (name, bounds) => run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name, bounds });
  const a = add('Corner source', { x: 0, y: 0, width: 200, height: 100 });
  const b = add('Corner target', { x: 400, y: 200, width: 200, height: 100 });
  const tiny = add('Narrow imported node', { x: 900, y: 300, width: 20, height: 20 });
  const state = store.snapshot;
  const link = (source, target, relationshipType) => importedRelationship(state, { viewId, relationshipType, source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId }, label: 'Synthetic edge' });
  const forward = link(a, b, 'Flow'), reverse = link(b, a, 'Realization'), loop = link(tiny, tiny, 'Flow');
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const values = id => h.$('canvas').querySelector(`[data-id="${id}"] .line`).getAttribute('d').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);
  const expected = [195.2, 97.6, 404.8, 202.4];
  for (const stored of [false, true, false]) {
    setStoredGeometry(h, stored);
    values(forward.connectionId).forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-7));
    values(reverse.connectionId).forEach((value, index) => assert.ok(Math.abs(value - expected[(index + 2) % 4]) < 1e-7));
    const points = values(loop.connectionId); assert.deepEqual(points.slice(0, 2), [920, 310]); assert.deepEqual(points.slice(-2), [910, 300]);
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (let index = 0; index < points.length; index += 2) { assert.ok(points[index] > x && points[index] < x + width); assert.ok(points[index + 1] > y && points[index + 1] < y + height); }
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
    assert.deepEqual(await h.download(), bytes);
  }
});

const pathNumbers = path => path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi).map(Number);

test(`${production ? 'production' : 'source'} app: stored routes display on open with exact labels, fit, shared hit geometry and byte-safe movement`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), state = fixture.state;
  const entry = state.views.find(item => item.view.id === fixture.viewId);
  const route = entry.connections.find(item => item.id === fixture.relation.connectionId);
  route.labelPosition = { x: 1600.5, y: -350.2 };
  const labelOnly = { ...structuredClone(route), id: 'conn-00000000-0000-4000-8000-000000000001', routePoints: [], labelPosition: { x: -1300.1, y: 900.2 } };
  entry.connections.push(labelOnly);
  const selfRelation = { id: 'rel-00000000-0000-4000-8000-000000000001', type: 'Flow', source: { kind: 'element', id: fixture.a.elementId }, target: { kind: 'element', id: fixture.a.elementId }, label: 'Degenerate stored loop', documentation: '', properties: propertyEntries({}) };
  state.relationships.push(selfRelation);
  const self = { id: 'conn-00000000-0000-4000-8000-000000000002', relationshipId: selfRelation.id, source: { kind: 'occurrence', id: fixture.a.occurrenceId }, target: { kind: 'occurrence', id: fixture.a.occurrenceId },
    routePoints: ([{ x: 150.1, y: 125.2 }, { x: 150.1, y: 125.2 }]).map(point => ({ kind: 'bend', point })), labelPosition: null, style: {} };
  entry.connections.push(self);
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const group = id => h.$('canvas').querySelector(`[data-id="${id}"]`);
  const path = id => group(id).querySelector('.line').getAttribute('d');
  assert.equal(h.$('stored-geometry').checked, true); assert.equal(h.$('canvas').dataset.geometry, 'schemka-stored-geometry@2');
  assert.equal(Number(group(route.id).querySelector('text').getAttribute('x')), route.labelPosition.x);
  setStoredGeometry(h, false); const automatic = path(route.id);
  assert.equal(h.$('stored-geometry').checked, false); assert.equal(h.$('canvas').dataset.geometry, 'automatic');
  assert.notEqual(Number(group(route.id).querySelector('text').getAttribute('x')), route.labelPosition.x);
  assert.match(h.$('stored-geometry-hint').textContent, /Точки — абсолютная ломаная.*Локальная интерпретация v2, не правило ArchiMate.*при открытии модели сохранённые маршруты и подписи показываются автоматически, если они заданы/);
  assert.match(h.$('stored-geometry-hint').title, /Локальное отображение.*не изменяет JSON.*пустой или полностью скрытый.*Обход препятствий не выполняется/);
  h.$('stored-geometry').click();
  assert.equal(h.$('canvas').dataset.geometry, 'schemka-stored-geometry@2');
  assert.notEqual(path(route.id), automatic); assert.match(path(route.id), /L 280\.1 25\.2 L 310 28/);
  assert.equal(group(route.id).dataset.routeMode, 'stored-polyline');
  assert.equal(group(self.id).dataset.routeMode, 'automatic-fallback'); assert.equal(group(self.id).dataset.routeFallback, 'no-visible-route');
  assert.match(h.$('stored-geometry-status').textContent, /сохранённых ломаных 1; заданных подписей 2; автоматических замен 1/);
  const captionBBox = h.window.SVGElement.prototype.getBBox;
  for (const theme of ['light', 'dark']) {
    h.change('theme-mode', theme);
    for (const connection of [route, labelOnly]) {
      const item = group(connection.id), text = item.querySelector('text');
      assert.equal(item.querySelector('.hit').getAttribute('d'), item.querySelector('.line').getAttribute('d'));
      assert.equal(Number(text.getAttribute('x')), connection.labelPosition.x); assert.equal(Number(text.getAttribute('y')), connection.labelPosition.y);
      assert.equal(text.getAttribute('text-anchor'), 'middle');
    }
    // Hidden canvases may expose no usable text box. A nonempty label with a
    // zero measurement must use conservative text extents, not anchor-only fit.
    h.window.SVGElement.prototype.getBBox = function () { return this.matches('.node-type,.node-title') ? captionBBox.call(this) : { x: 0, y: 0, width: 0, height: 0 }; };
    h.$('fit-button').click();
    const zeroFit = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const connection of [route, labelOnly]) {
      const text = group(connection.id).querySelector('text');
      const halfWidth = (Array.from(text.textContent).length * 22 + 8) / 2;
      assert.ok(zeroFit[0] < connection.labelPosition.x - halfWidth);
      assert.ok(zeroFit[0] + zeroFit[2] > connection.labelPosition.x + halfWidth);
    }
    // Exercise the actual SVG measurement route without asserting browser fonts
    // in jsdom. The deliberately wide measured label must be fully fitted.
    h.window.SVGElement.prototype.getBBox = function () {
      if (this.matches('.node-type,.node-title')) return captionBBox.call(this);
      const x = Number(this.getAttribute('x')), y = Number(this.getAttribute('y'));
      return { x: x - 600, y: y - 12, width: 1200, height: 18 };
    };
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const connection of [route, labelOnly]) {
      const point = connection.labelPosition;
      assert.ok(x < point.x - 604 && x + width > point.x + 604); assert.ok(y < point.y - 16 && y + height > point.y + 10);
    }
    const points = pathNumbers(path(route.id));
    for (let i = 0; i < points.length; i += 2) { assert.ok(points[i] > x && points[i] < x + width); assert.ok(points[i + 1] > y && points[i + 1] < y + height); }
  }
  group(route.id).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  const editor = group(route.id).querySelector('foreignObject');
  assert.equal(Number(editor.getAttribute('x')), route.labelPosition.x - 110);
  assert.equal(Number(editor.getAttribute('y')), route.labelPosition.y - 14);
  h.document.querySelector('.inline-editor input').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const beforeMove = path(route.id), moving = group(fixture.a.occurrenceId);
  h.pointer(moving, 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 123, 119);
  const preview = path(route.id); assert.notEqual(preview, beforeMove); assert.match(preview, /L 280\.1 25\.2 L 310 28/);
  assert.equal(Number(group(route.id).querySelector('text').getAttribute('x')), route.labelPosition.x);
  h.pointer(h.$('canvas'), 'pointerup', 123, 119);
  const moved = deserializeProjectFile(await h.download()), expected = structuredClone(state);
  Object.assign(expected.views.find(item => item.view.id === fixture.viewId).occurrences.find(item => item.id === fixture.a.occurrenceId).bounds, { x: 63.1, y: 99.2 });
  // A self-loop is internal even in a one-occurrence selection; external routes remain fixed.
  expected.views.find(item => item.view.id === fixture.viewId).connections.find(item => item.id === self.id).routePoints
    .forEach(route => { route.point = { x: 173.1, y: 144.2 }; });
  assert.deepEqual(moved, deserializeProjectFile(serializeProjectFile(expected)));
  h.$('undo').click(); assert.equal(path(route.id), beforeMove); assert.deepEqual(await h.download(), bytes);
  // Rendering preferences have no undo entries; redo still restores the move.
  h.$('stored-geometry').click(); assert.equal(path(route.id), automatic); assert.equal(h.$('redo').disabled, false);
  h.$('redo').click(); h.$('undo').click(); setStoredGeometry(h, true);
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), bytes);
  await h.load(bytes); assert.equal(h.$('stored-geometry').checked, true); assert.equal(h.$('canvas').dataset.geometry, 'schemka-stored-geometry@2');
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  assert.equal(path(route.id), beforeMove); assert.equal(Number(group(route.id).querySelector('text').getAttribute('x')), route.labelPosition.x);
});

test(`${production ? 'production' : 'source'} app: stored-geometry changes preserve active drafts, gestures, imports and clipboard; failed replacements retain opt-in`, async t => {
  const h = await setup(t), bytes = await h.download(); setStoredGeometry(h, true);
  const rejectToggle = () => {
    assert.equal(beforeUnload(h), true, 'Transient input/import/copy remains protected without product navigation');
    assert.equal(h.pointer(h.$('stored-geometry'), 'pointerdown', 0, 0, 12).defaultPrevented, true);
    h.$('stored-geometry').click(); assert.equal(h.$('stored-geometry').checked, true);
    setStoredGeometry(h, false); assert.equal(h.$('stored-geometry').checked, true);
  };
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Preserved draft';
  rejectToggle(); h.$('stored-geometry').focus(); await Promise.resolve();
  assert.equal(h.document.activeElement, input); assert.equal(input.value, 'Preserved draft');
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  h.$('create-node').click(); h.$('element-name').value = 'Preserved creation'; rejectToggle();
  assert.equal(h.$('element-name').value, 'Preserved creation'); h.$('edit-dialog').close();
  const moving = h.$('canvas').querySelector('.node'); h.pointer(moving, 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 120, 110);
  const transform = moving.getAttribute('transform'); rejectToggle(); assert.equal(moving.getAttribute('transform'), transform);
  h.pointer(h.$('canvas'), 'pointercancel', 120, 110);
  h.pointer(h.$('create-node'), 'pointerdown', 20, 20, 3); rejectToggle(); h.pointer(h.$('create-node'), 'pointercancel', 20, 20, 3);
  let resolveRead;
  h.$('file-button').click();
  Object.defineProperty(h.$('project-file'), 'files', { configurable: true, value: [{ name: 'Pending synthetic', size: bytes.length, arrayBuffer: () => new Promise(resolve => { resolveRead = resolve; }) }] });
  h.$('project-file').dispatchEvent(new h.window.Event('change', { bubbles: true })); rejectToggle();
  h.$('load-project').click(); rejectToggle(); h.$('cancel-load').click(); resolveRead(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.$('stored-geometry').checked, true);
  const invalid = new Blob(['invalid']); Object.defineProperty(invalid, 'name', { value: 'Invalid synthetic' });
  Object.defineProperty(h.$('project-file'), 'files', { configurable: true, value: [invalid] });
  h.$('project-file').dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('load-project').click();
  for (let i = 0; i < 40 && !h.$('file-feedback').textContent.includes('Файл не открыт'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.match(h.$('file-feedback').textContent, /Файл не открыт/); assert.equal(h.$('stored-geometry').checked, true);
  let resolveCopy;
  Object.defineProperty(h.window.navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise(resolve => { resolveCopy = resolve; }) } });
  h.$('copy-mermaid').click(); rejectToggle(); resolveCopy(); await new Promise(resolve => setImmediate(resolve)); h.$('file-dialog').close();
  assert.equal(h.$('stored-geometry').checked, true); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
  assert.deepEqual(await h.download(), bytes);
  await h.load(bytes); assert.equal(h.$('stored-geometry').checked, false);
});

test(`${production ? 'production' : 'source'} app: raw route and label editing survives exact rich-file save and fresh-session reimport`, async t => {
  const fixture = richLifecycleFixture(), entry = fixture.state.views.find(item => item.view.id === fixture.viewId);
  const route = entry.connections.find(item => item.id === fixture.relation.connectionId);
  route.routePoints.unshift({ kind: 'bend', point: { x: 150.1, y: 125.2 } }, { kind: 'bend', point: { x: 150.1, y: 125.2 } });
  const baseline = Buffer.from(serializeProjectFile(fixture.state)), expected = structuredClone(fixture.state);
  const edited = expected.views.find(item => item.view.id === fixture.viewId).connections.find(item => item.id === route.id);
  let saved;
  await t.test('edit raw duplicate bend, label, insertion and deletion with independent undoable resets', async phase => {
    const h = await setup(phase); await h.load(baseline);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
    const group = () => h.$('canvas').querySelector(`[data-id="${route.id}"]`);
    h.pointer(group(), 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
    assert.equal(h.$('stored-geometry').checked, true); setStoredGeometry(h, false);
    assert.equal(h.$('layout-edit-toggle').disabled, true);
    setStoredGeometry(h, true); assert.equal(h.$('layout-edit-toggle').disabled, false);
    beginLayoutEdit(h, route.id);
    assert.equal(h.$('canvas').lastElementChild.classList.contains('connection-layout-handles'), true);
    assert.equal(h.$('layout-point-select').options.length, 5);
    const beforeUnload = () => { const event = new h.window.Event('beforeunload', { cancelable: true }); h.window.dispatchEvent(event); return event.defaultPrevented; };
    assert.equal(beforeUnload(), false, 'Idle edit handles do not block a clean session');
    assert.deepEqual(await h.download(), baseline);
    const beforePath = group().querySelector('.line').getAttribute('d');
    h.pointer(layoutHandle(h, 1), 'pointerdown', 150.1, 125.2);
    h.pointer(h.$('canvas'), 'pointermove', 180.3, 84.9);
    assert.equal(layoutHandle(h, 0).getAttribute('transform'), 'translate(150.1 125.2)');
    assert.equal(layoutHandle(h, 1).getAttribute('transform'), 'translate(180.3 84.9)');
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
    h.pointer(h.$('canvas'), 'pointerup', 180.3, 84.9);
    edited.routePoints[1].point = { x: 180.3, y: 84.9 };
    assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.match(h.$('history-state').textContent, /1 действий/);
    h.$('undo').click(); assert.equal(group().querySelector('.line').getAttribute('d'), beforePath);
    assert.deepEqual(await h.download(), baseline); h.$('redo').click();
    const label = group().querySelector('text'); assert.ok(label.classList.contains('layout-edit-label'));
    h.pointer(label, 'pointerdown', 320.5, 21.2); h.pointer(h.$('canvas'), 'pointerup', 330.5, 1.2);
    edited.labelPosition = { x: 310.5, y: -1.8 };
    assert.equal(Number(group().querySelector('text').getAttribute('x')), 310.5);
    assert.equal(Number(group().querySelector('text').getAttribute('y')), -1.8);
    h.change('layout-point-select', '1'); h.$('layout-add-point').click();
    assert.equal(beforeUnload(), true); h.pointer(h.$('canvas'), 'pointerdown', -25.25, 450.44); h.pointer(h.$('canvas'), 'pointerup', -25.25, 450.44);
    assert.equal(h.$('layout-point-select').value, '2'); assert.equal(h.$('layout-point-select').options.length, 6);
    h.$('layout-edit-toggle').focus();
    const inserted = layoutHandle(h, 2); h.pointer(inserted, 'pointerdown', -25.2, 450.4); h.pointer(h.$('canvas'), 'pointerup', -25.2, 450.4);
    assert.equal(h.document.activeElement, inserted, 'A no-move handle selection receives keyboard focus');
    h.document.activeElement.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    assert.equal(h.$('delete-dialog').open, false); assert.equal(h.$('layout-point-select').options.length, 5);
    assert.equal(h.document.activeElement, h.$('layout-point-select'));
    h.$('layout-reset-label').click(); assert.equal(h.$('layout-reset-label').disabled, true); h.$('undo').click();
    h.$('layout-reset-route').click(); assert.equal(h.$('layout-reset-route').disabled, true); h.$('undo').click();
    assert.equal(h.$('redo').disabled, false);
    h.$('layout-edit-toggle').click(); h.$('layout-edit-toggle').click();
    assert.equal(h.$('redo').disabled, false, 'Entering and leaving edit mode preserves redo');
    setStoredGeometry(h, false); assert.equal(h.$('layout-edit-toggle').disabled, true); assert.equal(h.$('canvas').querySelectorAll('.layout-handle').length, 0);
    setStoredGeometry(h, true); assert.equal(h.$('layout-edit-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal((await h.download('download-mermaid')).toString(), exportMermaid(fixture.state, fixture.viewId));
    saved = await h.download();
    assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
    assert.deepEqual(deserializeProjectFile(saved).views.find(item => item.view.id === fixture.otherViewId), fixture.state.views.find(item => item.view.id === fixture.otherViewId));
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click();
    assert.equal(h.$('canvas').querySelectorAll('.layout-handle').length, 0);
  });
  await t.test('fresh session restores saved display, keeps editing off and every model field exact', async phase => {
    const h = await setup(phase); await h.load(saved);
    assert.equal(h.$('stored-geometry').checked, true); assert.equal(h.$('canvas').querySelectorAll('.layout-handle').length, 0);
    assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true);
    assert.deepEqual(await h.download(), saved);
    for (const view of expected.views) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
      assert.equal((await h.download('download-mermaid')).toString(), exportMermaid(expected, view.view.id));
    }
    assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
  });
});

test(`${production ? 'production' : 'source'} app: layout gestures respect inline, modal, file, viewport, saved-geometry and native unload boundaries`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state));
  await h.load(bytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); beginLayoutEdit(h, fixture.relation.connectionId);
  const group = () => h.$('canvas').querySelector(`[data-id="${fixture.relation.connectionId}"]`);
  const key = (target, value) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  const start = () => { beginLayoutEdit(h, fixture.relation.connectionId); h.pointer(layoutHandle(h, 0), 'pointerdown', 280.1, 25.2); h.pointer(h.$('canvas'), 'pointermove', 305.1, 55.2); };
  const lateRelease = () => h.pointer(h.$('canvas'), 'pointerup', 305.1, 55.2);
  // Genuine double-click remains shared relationship rename even while edit controls are visible.
  group().querySelector('text').dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }));
  const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = 'Keep this inline draft';
  assert.equal(h.pointer(layoutHandle(h, 0), 'pointerdown').defaultPrevented, true);
  assert.equal(h.pointer(h.$('layout-reset-route'), 'pointerdown').defaultPrevented, true); h.$('layout-reset-route').click();
  lateRelease(); assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(input.value, 'Keep this inline draft'); key(input, 'Escape');
  const automaticHistory = h.$('history-state').textContent;
  // A palette drag owns its pointer; layout handles must not cancel or replace it.
  h.pointer(h.$('create-node'), 'pointerdown', 20, 20, 33);
  assert.equal(h.pointer(layoutHandle(h, 0), 'pointerdown', 280.1, 25.2, 34).defaultPrevented, true);
  assert.equal(h.pointer(h.$('stored-geometry'), 'pointerdown', 0, 0, 35).defaultPrevented, true);
  key(h.$('canvas'), 'Escape');
  h.pointer(h.$('canvas'), 'pointerup', 300, 100, 34);
  assert.equal(h.$('history-state').textContent, automaticHistory);
  start(); const preview = group().querySelector('.line').getAttribute('d');
  setStoredGeometry(h, false);
  assert.equal(h.$('stored-geometry').checked, true); assert.equal(group().querySelector('.line').getAttribute('d'), preview);
  assert.equal(beforeUnload(h), true, 'An uncommitted layout gesture retains native unload protection');
  assert.equal(group().querySelector('.line').getAttribute('d'), preview, 'Unload protection must not cancel the gesture');
  key(h.$('canvas'), 'Escape'); lateRelease(); assert.equal(h.$('history-state').textContent, automaticHistory);
  assert.equal(beforeUnload(h), false, 'Idle handles do not block a clean session');
  for (const action of [() => h.$('fit-button').click(), () => h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })), () => h.$('help-button').click(),
    () => h.window.dispatchEvent(new h.window.Event('resize')), () => group().dispatchEvent(new h.window.MouseEvent('contextmenu', { button: 2, clientX: 300, clientY: 50, bubbles: true, cancelable: true })), () => h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click()]) {
    start(); action(); lateRelease();
    h.$('help-dialog').close(); if (!h.$('context-menu').hidden) key(h.$('context-menu'), 'Escape');
    assert.equal(h.$('history-state').textContent, automaticHistory); assert.equal(h.$('file-state').dataset.dirty, 'false');
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  }
  start(); h.$('file-button').click(); lateRelease(); assert.equal(h.$('file-state').dataset.dirty, 'false');
  const savedHandle = layoutHandle(h, 0);
  let resolveRead; Object.defineProperty(h.$('project-file'), 'files', { configurable: true, value: [{ name: 'Pending synthetic', size: bytes.length, arrayBuffer: () => new Promise(resolve => { resolveRead = resolve; }) }] });
  h.$('project-file').dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('load-project').click();
  h.pointer(savedHandle, 'pointerdown'); lateRelease(); h.$('layout-reset-route').click();
  assert.equal(h.$('history-state').textContent, automaticHistory);
  h.$('cancel-load').click(); resolveRead(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); await new Promise(resolve => setImmediate(resolve));
  let resolveCopy; Object.defineProperty(h.window.navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise(resolve => { resolveCopy = resolve; }) } });
  h.$('copy-mermaid').click(); h.pointer(savedHandle, 'pointerdown'); lateRelease(); h.$('layout-reset-route').click();
  resolveCopy(); await new Promise(resolve => setImmediate(resolve)); h.$('file-dialog').close();
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('redo').disabled, true);
  await h.load(bytes); assert.equal(h.$('stored-geometry').checked, true); assert.equal(h.$('canvas').querySelectorAll('.layout-handle').length, 0);
});

const pressFocusedKey = (h, key, options = {}) => {
  const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  h.document.activeElement.dispatchEvent(event); return event;
};

test(`${production ? 'production' : 'source'} app: keyboard handles keep actual focus through repeated steps and undo, then roundtrip rich data in a fresh session`, async t => {
  const fixture = richLifecycleFixture(), route = fixture.state.views.find(view => view.view.id === fixture.viewId).connections.find(connection => connection.id === fixture.relation.connectionId);
  route.routePoints.unshift({ kind: 'bend', point: { x: 150.1, y: 125.2 } }, { kind: 'bend', point: { x: 150.1, y: 125.2 } }); route.labelPosition = null;
  const bytes = Buffer.from(serializeProjectFile(fixture.state)), expected = structuredClone(fixture.state);
  const edited = expected.views.find(view => view.view.id === fixture.viewId).connections.find(connection => connection.id === route.id);
  let saved;
  await t.test('focused raw bend and automatic label receive local steps without moving nodes or other views', async phase => {
    const h = await setup(phase); await h.load(bytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); beginLayoutEdit(h, route.id);
    assert.match(h.document.querySelector('.layout-editor-controls .inspector-note').textContent, /стрелками на 10 единиц; Shift: 1/);
    h.pointer(layoutHandle(h, 1), 'pointerdown', 150.1, 125.2); h.pointer(h.$('canvas'), 'pointerup', 150.1, 125.2);
    assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.match(h.document.activeElement.getAttribute('aria-label'), /Стрелки: 10 единиц; Shift: 1/);
    for (const key of ['q', 'Enter', ' ']) assert.equal(pressFocusedKey(h, key).defaultPrevented, false);
    assert.equal(h.$('undo').disabled, true);
    assert.equal(pressFocusedKey(h, 'F2').defaultPrevented, true, 'Existing F2 relationship rename still owns that key');
    const renameInput = h.document.querySelector('.inline-editor input'); assert.ok(renameInput);
    renameInput.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.equal(h.$('undo').disabled, true);
    const initial = h.document.activeElement;
    assert.equal(pressFocusedKey(h, 'ArrowRight').defaultPrevented, true);
    assert.notEqual(h.document.activeElement, initial, 'The rerendered replacement handle, rather than a detached node, gets focus');
    assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.equal(h.$('layout-point-select').value, '1');
    assert.equal(pressFocusedKey(h, 'ArrowUp', { shiftKey: true }).defaultPrevented, true);
    assert.equal(pressFocusedKey(h, 'ArrowDown', { repeat: true }).defaultPrevented, true);
    edited.routePoints[1].point = { x: 160.1, y: 134.2 };
    assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.equal(layoutHandle(h, 0).getAttribute('transform'), 'translate(150.1 125.2)');
    assert.equal(layoutHandle(h, 1).getAttribute('transform'), 'translate(160.1 134.2)'); assert.match(h.$('history-state').textContent, /3 действий/);
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229, isComposing: false }]) {
      assert.equal(pressFocusedKey(h, 'ArrowRight', options).defaultPrevented, false); assert.equal(layoutHandle(h, 1).getAttribute('transform'), 'translate(160.1 134.2)');
    }
    pressFocusedKey(h, 'z', { ctrlKey: true });
    assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.equal(layoutHandle(h, 1).getAttribute('transform'), 'translate(160.1 124.2)');
    pressFocusedKey(h, 'y', { ctrlKey: true });
    assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.equal(layoutHandle(h, 1).getAttribute('transform'), 'translate(160.1 134.2)');
    const label = h.$('canvas').querySelector('[data-layout-kind="label"]'); label.focus();
    const text = h.$('canvas').querySelector(`[data-id="${route.id}"] text`), x = Number(text.getAttribute('x')), y = Number(text.getAttribute('y'));
    assert.match(label.getAttribute('aria-label'), /Стрелки: 10 единиц; Shift: 1/);
    pressFocusedKey(h, 'ArrowLeft');
    edited.labelPosition = { x: Math.round((x - 10) * 10) / 10, y: Math.round(y * 10) / 10 };
    assert.equal(h.document.activeElement, h.$('canvas').querySelector('[data-layout-kind="label"]'));
    pressFocusedKey(h, 'ArrowUp', { shiftKey: true }); edited.labelPosition.y = Math.round((edited.labelPosition.y - 1) * 10) / 10;
    assert.equal(h.document.activeElement.dataset.layoutKind, 'label');
    assert.equal((await h.download('download-mermaid')).toString(), exportMermaid(fixture.state, fixture.viewId));
    saved = await h.download(); assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
    assert.deepEqual(deserializeProjectFile(saved).views.find(view => view.view.id === fixture.otherViewId), fixture.state.views.find(view => view.view.id === fixture.otherViewId));
  });
  await t.test('fresh app reopens exact coordinates with saved display on and editing off', async phase => {
    const h = await setup(phase); await h.load(saved);
    assert.equal(h.$('stored-geometry').checked, true); assert.equal(h.$('canvas').querySelectorAll('.layout-handle').length, 0);
    assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true); assert.equal(h.$('file-state').dataset.dirty, 'false');
    assert.deepEqual(await h.download(), saved); assert.deepEqual(deserializeProjectFile(saved), deserializeProjectFile(serializeProjectFile(expected)));
  });
});

test(`${production ? 'production' : 'source'} app: keyboard limit no-ops retain redo, while pointer/add previews cancel without accidental nudges`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), route = fixture.state.views.find(view => view.view.id === fixture.viewId).connections.find(connection => connection.id === fixture.relation.connectionId);
  route.routePoints[0].point = { x: 1000000, y: -1000000 }; route.labelPosition = { x: -1000000, y: 1000000 };
  const bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); beginLayoutEdit(h, route.id);
  layoutHandle(h, 0).focus(); pressFocusedKey(h, 'ArrowLeft'); pressFocusedKey(h, 'z', { ctrlKey: true });
  const history = h.$('history-state').textContent;
  for (const [kind, keys] of [['bend', ['ArrowRight', 'ArrowUp']], ['label', ['ArrowLeft', 'ArrowDown']]]) {
    (kind === 'bend' ? layoutHandle(h, 0) : h.$('canvas').querySelector('[data-layout-kind="label"]')).focus();
    for (const key of keys) { assert.equal(pressFocusedKey(h, key).defaultPrevented, true); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false); }
  }
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), bytes);
  const nodeTransforms = () => [...h.$('canvas').querySelectorAll('.node')].map(node => node.getAttribute('transform'));
  const nodes = nodeTransforms();
  h.pointer(layoutHandle(h, 1), 'pointerdown', 310, 28); h.pointer(h.$('canvas'), 'pointermove', 340, 48);
  assert.equal(pressFocusedKey(h, 'ArrowRight').defaultPrevented, true); h.pointer(h.$('canvas'), 'pointerup', 340, 48);
  assert.equal(h.document.activeElement, layoutHandle(h, 1)); assert.equal(layoutHandle(h, 1).getAttribute('transform'), 'translate(310 28)');
  h.$('layout-add-point').click(); layoutHandle(h, 1).focus(); assert.equal(pressFocusedKey(h, 'ArrowDown').defaultPrevented, true);
  assert.equal(h.$('canvas').classList.contains('layout-add-armed'), false); h.pointer(h.$('canvas'), 'pointerup', 400, 400);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false); assert.deepEqual(nodeTransforms(), nodes);
  h.$('layout-point-select').focus(); assert.equal(pressFocusedKey(h, 'ArrowDown').defaultPrevented, false);
  h.$('help-button').click(); layoutHandle(h, 1).focus(); assert.equal(pressFocusedKey(h, 'ArrowRight').defaultPrevented, true); h.$('help-dialog').close();
  assert.equal(h.$('history-state').textContent, history); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} app: Equipment/Facility corrected rectangular silhouette drives automatic/manual anchors, hit path, preview movement, rename and fit in both themes`, async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic box contours')), run = command => store.execute(command, store.revision).created; const { viewId } = run({ type: 'createView', name: 'Box contour' });
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Equipment', name: 'Equipment', bounds: { x: 100, y: 100, width: 120, height: 60 } });
  const b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Facility', name: 'Facility', bounds: { x: 400, y: 250, width: 120, height: 60 } });
  const link = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Flow', source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: b.occurrenceId }, label: 'Rectangle route', routePoints: ([{ x: 205, y: 145 }, { x: 240, y: 180 }, { x: 370, y: 220 }, { x: 410, y: 260 }]).map(point => ({ kind: 'bend', point })), labelPosition: { x: 300, y: 200 } });
  const self = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Realization', source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: a.occurrenceId }, label: 'Self loop' });
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const group = id => h.$('canvas').querySelector(`[data-id="${id}"]`), path = id => group(id).querySelector('.line').getAttribute('d');
  const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} ≈ ${expected}`);
  setStoredGeometry(h, false); const auto = pathNumbers(path(link.connectionId)); close(auto[0], 220); close(auto[1], 160); close(auto[2], 400); close(auto[3], 250);
  for (const id of [a.occurrenceId, b.occurrenceId]) { assert.equal(group(id).querySelectorAll('rect.node-box').length, 1); assert.equal(group(id).querySelector('.node-box').getAttribute('rx'), '0'); assert.equal(group(id).querySelector('polygon.node-box'), null); }
  const selfPoints = pathNumbers(path(self.connectionId)); assert.deepEqual(selfPoints.slice(0, 2), [220, 130]); assert.deepEqual(selfPoints.slice(-2), [160, 100]);
  setStoredGeometry(h, true);
  for (const theme of ['light', 'dark']) {
    h.change('theme-mode', theme); const points = pathNumbers(path(link.connectionId)); close(points[0], 220); close(points[1], 160); close(points.at(-2), 400); close(points.at(-1), 250);
    assert.equal(group(link.connectionId).querySelector('.hit').getAttribute('d'), path(link.connectionId));
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (let i = 0; i < points.length; i += 2) { assert.ok(points[i] >= x && points[i] <= x + width); assert.ok(points[i + 1] >= y && points[i + 1] <= y + height); }
  }
  group(link.connectionId).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(group(link.connectionId).querySelector('foreignObject').getAttribute('x'), '190'); h.document.querySelector('.inline-editor input').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const before = path(link.connectionId); h.pointer(group(a.occurrenceId), 'pointerdown', 120, 120); h.pointer(h.$('canvas'), 'pointermove', 140, 140);
  assert.notEqual(path(link.connectionId), before); h.pointer(h.$('canvas'), 'pointercancel'); assert.equal(path(link.connectionId), before);
  setStoredGeometry(h, false); assert.equal(h.$('canvas').querySelectorAll('rect.node-box').length, 2); assert.notEqual(path(link.connectionId), before);
  setStoredGeometry(h, true); assert.equal(path(link.connectionId), before); assert.equal(h.$('undo').disabled, true); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} app: all five typed contours share painted geometry, automatic and stored routes, self loops and Fit`, async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic contour wiring')), run = command => store.execute(command, store.revision).created; const { viewId } = run({ type: 'createView', name: 'Five original outlines' });
  const created = [], imported = [];
  for (const [index, elementType] of ['Grouping', 'Goal', 'Meaning', 'Value', 'Deliverable'].entries()) {
    const y = 100 + index * 400, bounds = { x: 100, y, width: 120, height: 100 };
    const a = run({ type: 'createElementAndOccurrence', viewId, elementType, name: `Synthetic ${elementType}`, bounds });
    const b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Location', name: 'Target', bounds: { x: 400, y: y + 200, width: 120, height: 100 } });
    const bends = [{ x: 120, y: y + 30 }, { x: 120, y: y + 30 }, { x: 270, y: y - 50 }, { x: 380, y: y + 170 }, { x: 420, y: y + 230 }];
    const linkInput = { viewId, relationshipType: 'Flow', source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: b.occurrenceId }, label: `Stored ${elementType}`, routePoints: (bends).map(point => ({ kind: 'bend', point })), labelPosition: { x: 300, y: y + 100 } };
    const reverseInput = { viewId, relationshipType: 'Association', source: { kind: 'occurrence', id: b.occurrenceId }, target: { kind: 'occurrence', id: a.occurrenceId }, label: 'Reverse' };
    const selfInput = { viewId, relationshipType: 'Realization', source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: a.occurrenceId }, label: 'Self' };
    imported.push({ a, b, linkInput, reverseInput, selfInput, elementType, bounds });
  }
  const state = store.snapshot;
  for (const { linkInput, reverseInput, selfInput, ...item } of imported) created.push({ ...item, link: importedRelationship(state, linkInput), reverse: importedRelationship(state, reverseInput), self: importedRelationship(state, selfInput) });
  const bytes = Buffer.from(serializeProjectFile(state)), view = state.views[0]; await h.load(bytes);
  const group = id => h.$('canvas').querySelector(`[data-id="${id}"]`);
  const path = id => group(id).querySelector('.line').getAttribute('d');
  const contourFor = occurrence => {
    const type = state.elements.find(element => element.id === occurrence.concept.id).type, appearance = notationElement(state.project.metamodel, type);
    return appearance.contour ?? appearance.radius;
  };
  for (const item of created) {
    const node = group(item.a.occurrenceId), appearance = notationElement(state.project.metamodel, item.elementType);
    const geometry = nodeContourGeometry({ width: 120, height: 100 }, appearance.contour), box = node.querySelector('.node-box');
    if (geometry.outline) assert.equal(box.getAttribute('points'), geometry.outline.map(point => `${point.x},${point.y}`).join(' '));
    else for (const [key, value] of Object.entries(geometry.ellipse)) assert.equal(Number(box.getAttribute(key)), value);
    assert.equal(node.querySelector('rect.node-box'), null);
    assert.equal(node.querySelector('.node-title').getAttribute('text-anchor'), 'middle');
    assert.match(path(item.self.connectionId), / L /); assert.doesNotMatch(path(item.self.connectionId), / C /);
  }
  for (const stored of [false, true]) {
    setStoredGeometry(h, stored);
    for (const theme of ['light', 'dark']) {
      h.change('theme-mode', theme);
      for (const connection of view.connections) {
        const geometry = connectionGeometry(connection, view.occurrences, contourFor, stored);
        assert.equal(path(connection.id), geometry.d); assert.equal(group(connection.id).querySelector('.hit').getAttribute('d'), geometry.d);
        assert.equal(Number(group(connection.id).querySelector('text').getAttribute('x')), geometry.x);
        assert.equal(Number(group(connection.id).querySelector('text').getAttribute('y')), geometry.y);
      }
    }
    h.$('fit-button').click(); const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(' ').map(Number);
    for (const connection of view.connections) {
      const values = pathNumbers(path(connection.id));
      for (let index = 0; index < values.length; index += 2) { assert.ok(values[index] >= x && values[index] <= x + width); assert.ok(values[index + 1] >= y && values[index + 1] <= y + height); }
    }
  }
  const first = created[0], before = path(first.link.connectionId);
  group(first.link.connectionId).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(group(first.link.connectionId).querySelector('foreignObject').getAttribute('x'), '190');
  h.document.querySelector('.inline-editor input').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  h.pointer(group(first.a.occurrenceId), 'pointerdown', 160, 150); h.pointer(h.$('canvas'), 'pointermove', 180, 170);
  assert.notEqual(path(first.link.connectionId), before); h.pointer(h.$('canvas'), 'pointercancel'); assert.equal(path(first.link.connectionId), before);
  assert.equal(h.$('undo').disabled, true); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} app: automatic Folder rays clear the raised tab while stored routes retain their first visible notch exit`, async t => {
  const h = await setup(t), store = createStore(createProject('Synthetic concave ray')), run = command => store.execute(command, store.revision).created; const { viewId } = run({ type: 'createView', name: 'Folder notch' });
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Grouping', name: 'Folder', bounds: { x: 0, y: 0, width: 100, height: 100 } });
  const b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Location', name: 'Target', bounds: { x: 24, y: -51, width: 2, height: 2 } });
  const connections = [];
  for (const [source, target] of [[a, b], [b, a]]) connections.push(run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Flow', source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId }, label: 'Concave exit', routePoints: ([{ x: 25, y: -50 }]).map(point => ({ kind: 'bend', point }))}));
  const bytes = Buffer.from(serializeProjectFile(store.snapshot)); await h.load(bytes);
  const path = item => h.$('canvas').querySelector(`[data-id="${item.connectionId}"] .line`).getAttribute('d');
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
  const verify = (expected, stored) => {
    setStoredGeometry(h, stored);
    connections.forEach((item, index) => {
      const numbers = pathNumbers(path(item)), terminal = index === 0 ? numbers.slice(0, 2) : numbers.slice(-2);
      terminal.forEach((value, coordinate) => close(value, expected[coordinate]));
    });
  };
  verify([37.5, 0], false); verify([42.5, 20], true); verify([37.5, 0], false);
  assert.equal(h.$('undo').disabled, true); assert.deepEqual(await h.download(), bytes);
});

test(`${production ? 'production' : 'source'} app: geometry OFF exposes only anchor writes and the label handle follows displayed geometry`, async t => {
  const { conceptProject } = await import('../../schemka-model-core/fixtures/concept-project.js');
  for (const labelPosition of [null, { x: 1234, y: 5678 }]) await t.test(labelPosition ? 'hidden explicit label' : 'automatic label with hidden bends', async phase => {
    const h = await setup(phase), state = conceptProject(), host = state.views[0].connections[0]; host.labelPosition = labelPosition;
    await h.load(serializeProjectFile(state)); setStoredGeometry(h, false); const bytes = await h.download();
    const group = () => h.$('canvas').querySelector(`.connection[data-id="${host.id}"]`);
    h.pointer(group(), 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup'); h.$('layout-edit-toggle').click();
    const label = () => group().querySelector('.relationship-label'), handle = () => h.$('canvas').querySelector('[data-layout-kind="label"]');
    const rendered = () => `translate(${label().getAttribute('x')} ${label().getAttribute('y')})`;
    assert.equal(h.$('stored-geometry').checked, false); assert.equal(handle().getAttribute('transform'), rendered());
    assert.equal(handle().getAttribute('aria-disabled'), 'true'); assert.equal(h.$('canvas').querySelectorAll('[data-layout-kind="bend"]').length, 0);
    for (const id of ['layout-add-point', 'layout-delete-point', 'layout-reset-route', 'layout-reset-label']) { assert.equal(h.$(id).disabled, true); h.$(id).click(); }
    for (const key of ['ArrowRight', 'Delete', 'Backspace']) { handle().focus(); handle().dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }
    h.pointer(handle(), 'pointerdown', 0, 0); h.pointer(h.$('canvas'), 'pointermove', 40, 50); h.pointer(h.$('canvas'), 'pointerup', 40, 50);
    assert.equal(handle().getAttribute('transform'), rendered()); assert.match(h.$('status').textContent, /только закреплённые якоря/);
    assert.deepEqual(await h.download(), bytes);
    const anchor = host.routePoints.find(point => point.kind === 'anchor'), target = () => h.$('canvas').querySelector('[data-layout-kind="anchor"]');
    h.pointer(target(), 'pointerdown', anchor.point.x, anchor.point.y); h.pointer(h.$('canvas'), 'pointermove', anchor.point.x + 40, anchor.point.y + 50);
    assert.equal(handle().getAttribute('transform'), rendered());
    h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    h.pointer(h.$('canvas'), 'pointerup', anchor.point.x + 40, anchor.point.y + 50); assert.deepEqual(await h.download(), bytes);
    h.pointer(target(), 'pointerdown', anchor.point.x, anchor.point.y); h.pointer(h.$('canvas'), 'pointermove', anchor.point.x + 40, anchor.point.y + 50); h.pointer(h.$('canvas'), 'pointerup', anchor.point.x + 40, anchor.point.y + 50);
    const committed = deserializeProjectFile(await h.download()), expected = structuredClone(state); expected.views[0].connections[0].routePoints.find(point => point.id === anchor.id).point = { x: anchor.point.x + 40, y: anchor.point.y + 50 };
    assert.deepEqual(serializeProjectFile(committed), serializeProjectFile(expected));
    assert.equal(handle().getAttribute('transform'), rendered());
    h.$('fit-button').click(); assert.equal(handle().getAttribute('transform'), rendered());
    h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
    h.$('stored-geometry').click(); h.pointer(group(), 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
    if (!h.$('canvas').querySelector('[data-layout-kind="label"]')) h.$('layout-edit-toggle').click();
    assert.equal(handle().getAttribute('aria-disabled'), 'false'); assert.equal(handle().getAttribute('transform'), rendered());
    assert.ok(h.$('canvas').querySelector('[data-layout-kind="bend"]'));
  });
});
