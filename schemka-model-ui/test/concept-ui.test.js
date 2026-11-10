import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createStore, CURRENT_CATALOG, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';
import { createController } from '../src/controller.js';
import { installTypedActions } from '../src/typed-actions.js';
import { endpointChoices, choiceConcept } from '../src/endpoint-choices.js';
import { contextActions } from '../src/context-actions.js';
import { renameTarget, renameCommand } from '../src/rename.js';
import { installInternalDrag, allowedDragTypes } from '../src/drag-drop.js';
import { installMultiplicityEditor } from '../src/multiplicity-editor.js';
import { installPaletteActions } from '../src/palette-actions.js';
import { connectionGeometry, nearestRoutePoint, routePointAt } from '../src/connection-geometry.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const anchors = state => state.views.flatMap(view => view.connections.flatMap(connection => connection.routePoints.filter(point => point.kind === 'anchor')));
const occurrenceEnd = id => ({ kind: 'occurrence', id });
function displayedPlan(connection, view) {
  const geometry = connectionGeometry(connection, view.occurrences, item => item.concept.kind === 'junction' ? 'circle' : 0, true, view.connections);
  const nearest = nearestRoutePoint(geometry, routePointAt(geometry));
  return { index: nearest.afterIndex + 1, point: nearest.point };
}
function setup(t, options = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { pretendToBeVisual: true, virtualConsole });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id);
  const store = createStore(options.state || conceptProject()), commands = [], attempts = [], reports = [], previews = [];
  const instrumented = Object.create(store);
  let failExecute = false, failRender = false, failFocus = false;
  Object.defineProperty(instrumented, 'execute', { value(command, revision) {
    attempts.push({ command: clone(command), revision });
    if (failExecute) throw new Error('Synthetic command failure');
    const result = store.execute(command, revision); commands.push(clone(command)); return result;
  } });
  const model = createController(instrumented);
  const emit = (target, type, fields = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event); assert.deepEqual(errors, [], 'DOM event handlers must not throw'); return event;
  };
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => { dialog.removeAttribute('open'); emit(dialog, 'close'); };
  }
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
  const render = () => { if (failRender) throw new Error('Synthetic render failure'); };
  const openDialog = id => $(id).showModal();
  const ui = installTypedActions({ document, model, openDialog, render,
    nextBounds: options.nextBounds || (kind => ({ x: 100, y: 200, width: kind === 'junction' ? 36 : 210, height: kind === 'junction' ? 36 : 90 })), panel() {},
    focusSelected() { if (failFocus) throw new Error('Synthetic focus failure'); }, status: message => reports.push(message),
    anchorPlanFor: options.anchorPlanFor || displayedPlan, previewEndpoints: (view, endpoints) => previews.push(clone({ viewId: view?.view.id, endpoints })),
  });
  const multiplicity = installMultiplicityEditor({ document, model, openDialog, render, status: message => reports.push(message) });
  const capture = () => ({ bytes: Buffer.from(serializeProjectFile(store.snapshot)), revision: store.revision, history: store.history });
  const choose = (end, key) => { $(`link-${end}`).value = key; emit($(`link-${end}`), 'change'); };
  return { dom, window, document, $, emit, store, model, ui, multiplicity, commands, attempts, reports, previews, capture, choose,
    submit: form => emit($(form), 'submit'), cancel: id => $(id).querySelector('[data-close]').click(),
    set failExecute(value) { failExecute = value; }, set failRender(value) { failRender = value; }, set failFocus(value) { failFocus = value; } };
}

for (const type of ['AndJunction', 'OrJunction']) test(`${type} uses its own catalogue and one typed, undoable junction creation`, t => {
  const h = setup(t), before = h.store.snapshot, captured = h.capture();
  assert.equal(CURRENT_CATALOG.elementTypes.length, 42); assert.equal(CURRENT_CATALOG.elementTypes.includes(type), false);
  h.$(`create-${type.toLowerCase()}`).click();
  assert.equal(h.$('edit-dialog').open, true); assert.deepEqual(h.capture(), captured);
  h.$('element-name').value = `  ${type} <img src=x>  `;
  h.submit('edit-form'); h.submit('edit-form');
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type, 'createJunctionAndOccurrence');
  assert.equal(h.commands[0].junctionType, type); assert.deepEqual(h.commands[0].bounds, { x: 100, y: 200, width: 36, height: 36 });
  const state = h.store.snapshot, junction = state.junctions.at(-1), occurrence = state.views[0].occurrences.at(-1);
  assert.equal(junction.name, `  ${type} <img src=x>  `); assert.equal(h.document.querySelector('img'), null);
  assert.deepEqual(occurrence.concept, { kind: 'junction', id: junction.id }); assert.deepEqual(state.elements, before.elements);
  assert.deepEqual(h.model.selection, { kind: 'occurrence', id: occurrence.id }); assert.equal(h.store.history.undo, 1);
  h.model.undo(); assert.deepEqual(h.store.snapshot, before); h.model.redo(); assert.deepEqual(h.store.snapshot, state);
});

test('junction creation Cancel, stale revision and render failure never repeat or create abandoned records', t => {
  for (const mode of ['cancel', 'stale', 'render']) {
    const h = setup(t), before = h.capture(); h.ui.openEdit('AndJunction'); h.$('element-name').value = 'New junction';
    if (mode === 'cancel') { h.cancel('edit-dialog'); h.submit('edit-form'); assert.deepEqual(h.capture(), before); }
    if (mode === 'stale') {
      h.model.execute({ type: 'renameProject', name: 'New revision' }); const changed = h.capture();
      h.submit('edit-form'); h.submit('edit-form'); assert.deepEqual(h.capture(), changed); assert.match(h.$('edit-error').textContent, /изменилась/);
    }
    if (mode === 'render') {
      h.failRender = true; h.submit('edit-form'); h.submit('edit-form');
      assert.equal(h.commands.length, 1); assert.equal(h.store.snapshot.junctions.length, 3); assert.match(h.reports.at(-1), /уже созданы/);
    }
  }
});

test('junction palette search is separate from the unchanged element catalogue', t => {
  const h = setup(t), palette = installPaletteActions({ document: h.document, model: h.model }), before = h.capture();
  palette.refresh();
  assert.match(h.$('palette-results').textContent, /Элементы: 42 из 42/); assert.match(h.$('palette-results').textContent, /Junctions: 2 из 2/);
  h.$('palette-search').value = 'Or Junction'; h.emit(h.$('palette-search'), 'input');
  assert.equal(h.$('create-orjunction').hidden, false); assert.equal(h.$('create-andjunction').hidden, true);
  assert.equal(h.$('create-service').hidden, true); assert.deepEqual(h.capture(), before);
});

test('junction context resolves exact concept kind for rename, reuse and properties', t => {
  const h = setup(t), state = h.store.snapshot, occurrence = state.views[0].occurrences.find(item => item.concept.kind === 'junction');
  const calls = [], callbacks = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  h.model.select({ kind: 'element', id: state.elements[1].id });
  const actions = contextActions({ kind: 'occurrence', id: occurrence.id }, h.model, callbacks);
  actions.find(item => item.id === 'rename').action();
  assert.deepEqual(calls.at(-1).slice(0, 3), ['rename', 'junction', occurrence.concept.id]);
  actions.find(item => item.id === 'reuse-element').action(); assert.deepEqual(calls.at(-1), ['addOccurrence', occurrence.concept]);
  actions.find(item => item.id === 'properties').action(); assert.deepEqual(calls.at(-1), ['openProperties', occurrenceEnd(occurrence.id)]);
  assert.equal(actions.some(item => item.id.startsWith('relation-')),false);
  const target = renameTarget(state, occurrence.concept), command = renameCommand(state, occurrence.concept, 'Renamed shared junction');
  assert.equal(target.command('x').type, 'renameJunction'); assert.equal(command.junctionId, occurrence.concept.id);
  h.model.execute(command);
  h.model.execute({ type: 'addOccurrence', viewId: h.model.viewId, concept: occurrence.concept, bounds: { x: 10, y: 20, width: 36, height: 36 } });
  assert.equal(h.store.snapshot.junctions.length, state.junctions.length);
  assert.equal(h.model.view.occurrences.filter(item => item.concept.id === occurrence.concept.id).length, 2);
  assert.equal(h.store.snapshot.junctions.find(item => item.id === occurrence.concept.id).name, 'Renamed shared junction');
});

test('endpoint choices retain exact host drawing and anchor IDs for repeated relationship drawings', t => {
  const h = setup(t), state = h.store.snapshot, view = state.views[0], host = view.connections[0], repeated = view.connections.at(-1);
  const choices = endpointChoices(state, view, { concept: { kind: 'relationship', id: host.relationshipId }, anchorPlanFor: displayedPlan });
  assert.equal(choices.length, 4); assert.equal(new Set(choices.map(item => item.key)).size, 4);
  for (const drawing of [host, repeated]) {
    const anchor = drawing.routePoints.find(item => item.kind === 'anchor'), choice = choices.find(item => item.key === `${drawing.id}:${anchor.id}`);
    assert.deepEqual(choice.endpoint, { kind: 'connection', id: drawing.id, anchorId: anchor.id });
    assert.deepEqual(choiceConcept(view, choice.endpoint), { kind: 'relationship', id: host.relationshipId });
    assert.match(choice.label, new RegExp(drawing.id.slice(-8))); assert.match(choice.label, new RegExp(anchor.id.slice(-8)));
  }
  assert.equal(choices.some(item => item.endpoint.kind === 'occurrence'), false);
});

test('new relationship chooses the requested repeated host anchor without allocating another anchor', t => {
  const h = setup(t), before = h.store.snapshot, view = before.views[0], host = view.connections.at(-1), anchor = host.routePoints[0];
  h.ui.openLink('Association'); h.choose('source', view.occurrences[0].id); h.choose('target', `${host.id}:${anchor.id}`);
  h.submit('link-form'); h.submit('link-form');
  assert.equal(h.commands.length, 1); assert.deepEqual(h.commands[0].target, { kind: 'connection', id: host.id, anchorId: anchor.id });
  const state = h.store.snapshot, relationship = state.relationships.at(-1), connection = state.views[0].connections.at(-1);
  assert.deepEqual(relationship.target, { kind: 'relationship', id: host.relationshipId }); assert.deepEqual(connection.target, h.commands[0].target);
  assert.equal(anchors(state).length, anchors(before).length);
  h.model.undo(); assert.deepEqual(h.store.snapshot, before); h.model.redo(); assert.deepEqual(h.store.snapshot, state);
});

test('reusing a relationship filters endpoints by concept while retaining multiple host and anchor choices', t => {
  const h = setup(t), before = h.store.snapshot, relation = before.relationships[4], repeated = before.views[0].connections.at(-1);
  h.ui.openLink(null, { relationshipId: relation.id });
  assert.equal(h.$('link-mode').value, 'reuse');
  assert.deepEqual([...h.$('link-source').options].map(item => item.value), [before.views[0].occurrences[0].id]);
  assert.ok([...h.$('link-target').options].some(item => item.value === `${repeated.id}:${repeated.routePoints[0].id}`));
  h.choose('target', `${repeated.id}:${repeated.routePoints[0].id}`); h.submit('link-form'); h.submit('link-form');
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type, 'addConnection'); assert.equal(h.commands[0].relationshipId, relation.id);
  assert.equal(h.store.snapshot.relationships.length, before.relationships.length);
  assert.equal(h.model.view.connections.at(-1).target.id, repeated.id);
});

test('a clicked-host insertion plan survives endpoint refresh and commits anchor plus relationship atomically', t => {
  const h = setup(t), before = h.store.snapshot, host = before.views[0].connections[0];
  const sourceEndpoint = { kind: 'connection', id: host.id, insertAnchor: { index: 1, point: { x: 111.1, y: -222.2 } } };
  h.ui.openLink('Association', { sourceEndpoint }); h.ui.fillEndpoints();
  h.choose('target', before.views[0].occurrences[1].id);
  assert.equal(h.$('link-source').value, `${host.id}:new`); assert.match(h.$('link-anchor-note').textContent, /111\.1; -222\.2/);
  assert.deepEqual(h.store.snapshot, before); assert.ok(h.previews.at(-1).endpoints[0].insertAnchor);
  h.submit('link-form'); h.submit('link-form');
  assert.equal(h.commands.length, 1); assert.deepEqual(h.commands[0].source, sourceEndpoint);
  const state = h.store.snapshot, updated = state.views[0].connections[0], connection = state.views[0].connections.at(-1);
  assert.equal(updated.routePoints[1].kind, 'anchor'); assert.deepEqual(updated.routePoints[1].point, sourceEndpoint.insertAnchor.point);
  assert.deepEqual(connection.source, { kind: 'connection', id: host.id, anchorId: updated.routePoints[1].id });
  assert.equal(anchors(state).length, anchors(before).length + 1); assert.equal(h.store.revision, 1);
  h.model.undo(); assert.deepEqual(h.store.snapshot, before); h.model.redo(); assert.deepEqual(h.store.snapshot, state);
});

test('two plans on one host use sequential source-then-target indices while preserving stored route order', t => {
  const h = setup(t, { anchorPlanFor: () => ({ index: 1, point: { x: 333.3, y: 444.4 } }) });
  const before = h.store.snapshot, host = before.views[0].connections[0];
  const sourceEndpoint = { kind: 'connection', id: host.id, insertAnchor: { index: 1, point: { x: 111.1, y: 222.2 } } };
  h.ui.openLink(null, { relationshipId: before.relationships[8].id, sourceEndpoint }); h.choose('target', `${host.id}:new`);
  assert.equal(h.$('link-assessment').dataset.assessment, 'FORBIDDEN'); assert.equal(h.$('link-submit').disabled, false);
  h.submit('link-form'); h.submit('link-form');
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].source.insertAnchor.index, 1); assert.equal(h.commands[0].target.insertAnchor.index, 2);
  const state = h.store.snapshot, route = state.views[0].connections[0].routePoints, connection = state.views[0].connections.at(-1);
  assert.deepEqual(route.map(item => item.point), [host.routePoints[0].point, { x: 111.1, y: 222.2 }, { x: 333.3, y: 444.4 }, ...host.routePoints.slice(1).map(item => item.point)]);
  assert.equal(connection.source.anchorId, route[1].id); assert.equal(connection.target.anchorId, route[2].id); assert.notEqual(route[1].id, route[2].id);
  h.model.undo(); assert.deepEqual(h.store.snapshot, before); h.model.redo(); assert.deepEqual(h.store.snapshot, state);
});

test('new-anchor Cancel, stale revision, execution failure and postcommit UI failures leave no orphan or duplicate anchors', t => {
  for (const mode of ['cancel', 'stale', 'execute', 'render', 'focus']) {
    const h = setup(t), before = h.store.snapshot, host = before.views[0].connections[0];
    h.ui.openLink('Association', { sourceEndpoint: { kind: 'connection', id: host.id, insertAnchor: { index: 0, point: { x: 77, y: 88 } } } });
    h.choose('target', before.views[0].occurrences[1].id);
    if (mode === 'cancel') { h.cancel('link-dialog'); h.submit('link-form'); assert.deepEqual(h.store.snapshot, before); assert.deepEqual(h.previews.at(-1).endpoints, []); }
    if (mode === 'stale') {
      h.model.execute({ type: 'renameProject', name: 'Stale pending attachment' }); const changed = h.capture();
      h.submit('link-form'); h.submit('link-form'); assert.deepEqual(h.capture(), changed); assert.match(h.$('link-note').textContent, /изменилась/);
    }
    if (mode === 'execute') {
      h.failExecute = true; h.submit('link-form'); assert.deepEqual(h.store.snapshot, before); assert.equal(h.commands.length, 0);
      h.failExecute = false; h.submit('link-form'); h.submit('link-form'); assert.equal(h.commands.length, 1);
    }
    if (mode === 'render' || mode === 'focus') {
      h.failRender = mode === 'render'; h.failFocus = mode === 'focus'; h.submit('link-form'); h.submit('link-form');
      assert.equal(h.commands.length, 1); assert.match(h.reports.at(-1), /уже созданы/);
    }
    const state = h.store.snapshot, committed = ['execute', 'render', 'focus'].includes(mode);
    assert.equal(anchors(state).length, anchors(before).length + (committed ? 1 : 0));
    assert.equal(state.relationships.length, before.relationships.length + (committed ? 1 : 0));
    if (committed) { const endpoint = state.views[0].connections.at(-1).source;
      assert.ok(state.views[0].connections[0].routePoints.some(item => item.kind === 'anchor' && item.id === endpoint.anchorId)); }
  }
});

test('relationship drawing properties retain the clicked host without planning new anchors', t => {
  const h = setup(t), connection = h.model.view.connections.at(-1), point = { x: 777, y: 888 }, calls = [];
  const actions = new Proxy({}, { get: (_, name) => name === 'anchorPlan' ? () => { assert.fail('Properties must not plan a new anchor'); }
    : (...args) => calls.push([name, ...args]) });
  contextActions({ kind: 'connection', id: connection.id, point }, h.model, actions).find(item => item.id === 'properties').action();
  assert.deepEqual(calls.at(-1), ['openProperties', { kind: 'connection', id: connection.id }]);
});

for (const raw of ['', ' 0..*\r\n', '<img src=x>\rraw']) test(`junction multiplicity preserves imported ${JSON.stringify(raw)}, disables Set and allows explicit Remove`, t => {
  const state = conceptProject(), relation = state.relationships[2]; relation.sourceMultiplicity = raw; relation.targetMultiplicity = '1';
  const h = setup(t, { state }), before = h.capture();
  assert.equal(h.multiplicity.open(relation.id), true);
  assert.equal(h.$('multiplicity-source-value').disabled, true); assert.equal(h.$('multiplicity-source-set').disabled, true);
  assert.equal(h.$('multiplicity-source-remove').disabled, false); assert.match(h.$('multiplicity-source-diagnostic').textContent, /неприменима/);
  assert.equal(h.document.querySelector('img'), null);
  h.$('multiplicity-source-value').value = 'programmatic forbidden replacement'; h.emit(h.$('multiplicity-source-value'), 'input');
  h.submit('multiplicity-form'); assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
  h.multiplicity.open(relation.id); h.$('multiplicity-target-value').value = '*'; h.emit(h.$('multiplicity-target-value'), 'input'); h.submit('multiplicity-form');
  assert.equal(h.store.snapshot.relationships.find(item => item.id === relation.id).sourceMultiplicity, raw);
  assert.deepEqual(h.commands.at(-1), { type: 'updateRelationshipMultiplicity', relationshipId: relation.id, targetMultiplicity: '*' });
  h.multiplicity.open(relation.id); h.$('multiplicity-source-remove').click(); assert.equal(h.$('multiplicity-source-set').disabled, true);
  h.submit('multiplicity-form'); h.submit('multiplicity-form');
  assert.equal(Object.hasOwn(h.store.snapshot.relationships.find(item => item.id === relation.id), 'sourceMultiplicity'), false);
  assert.deepEqual(h.commands.at(-1), { type: 'updateRelationshipMultiplicity', relationshipId: relation.id, sourceMultiplicity: null });
  h.model.undo(); assert.equal(h.store.snapshot.relationships.find(item => item.id === relation.id).sourceMultiplicity, raw);
});

test('an absent junction multiplicity cannot be materialized by Set or a synthetic submit', t => {
  const state = conceptProject(), relation = state.relationships[2]; delete relation.sourceMultiplicity;
  const h = setup(t, { state }), before = h.capture(); h.multiplicity.open(relation.id);
  h.$('multiplicity-source-set').click(); h.emit(h.$('multiplicity-source-set'), 'click');
  h.$('multiplicity-source-value').value = '*'; h.submit('multiplicity-form');
  assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
});

test('native reopen is canonical for junctions, repeated drawings, raw text and cyclic anchors; Mermaid refuses clearly', t => {
  const h = setup(t), before = h.capture(), state = h.store.snapshot;
  const bytes = serializeProjectFile(state), reopened = deserializeProjectFile(bytes);
  assert.deepEqual(reopened, state); assert.deepEqual(serializeProjectFile(reopened), bytes);
  const fresh = createStore(conceptProject()); loadProjectFile(fresh, bytes, fresh.revision);
  assert.deepEqual(fresh.snapshot, state);
  assert.throws(() => exportMermaid(state, state.views[0].view.id), error => error.code === 'MERMAID_UNSUPPORTED' && /native Schemka/.test(error.message));
  assert.deepEqual(h.capture(), before);
});

function dragHarness(h, t) {
  const canvas = h.$('canvas');
  const ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
  canvas.getScreenCTM = () => ctm;
  canvas.getBoundingClientRect = () => ({ left: 100, top: 100, right: 900, bottom: 700 });
  canvas.getClientRects = () => [canvas.getBoundingClientRect()];
  Object.defineProperty(canvas, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: 1000, height: 800 } } });
  h.document.elementFromPoint = () => canvas;
  h.window.Element.prototype.setPointerCapture = function (id) { this.capturedId = id; };
  h.window.Element.prototype.hasPointerCapture = function (id) { return this.capturedId === id; };
  h.window.Element.prototype.releasePointerCapture = function () { this.capturedId = null; };
  // jsdom has no CSS layout boxes; the real clipping policy remains exercised by
  // the established drag suite. Here only those unavailable layout reads vary.
  h.window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', overflow: 'visible' });
  const drag = installInternalDrag({ document: h.document, window: h.window, canvas, model: h.model, status: message => h.reports.push(message) });
  t.after(() => drag.destroy());
  const pointer = (target, type, x, y) => h.emit(target, type, { button: 0, buttons: 1, pointerId: 17, isPrimary: true, clientX: x, clientY: y });
  return { drag, move: source => { pointer(source, 'pointerdown', 20, 20); pointer(canvas, 'pointermove', 300, 250); },
    release: () => pointer(canvas, 'pointerup', 300, 250) };
}

for (const type of ['AndJunction', 'OrJunction']) test(`${type} palette dragging commits one junction and generic tree dragging reuses its concept`, t => {
  const h = setup(t), drag = dragHarness(h, t), before = h.store.snapshot;
  assert.ok(allowedDragTypes(CURRENT_METAMODEL).includes(type));
  drag.move(h.$(`create-${type.toLowerCase()}`)); assert.deepEqual(h.store.snapshot, before);
  drag.release(); drag.release();
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type, 'createJunctionAndOccurrence'); assert.equal(h.commands[0].junctionType, type);
  assert.deepEqual(h.commands[0].bounds, { x: 282, y: 232, width: 36, height: 36 });
  const junction = h.store.snapshot.junctions.at(-1), source = h.document.createElement('button'); source.dataset.dragJunctionId = junction.id; h.document.body.append(source);
  drag.move(source); drag.release(); drag.release();
  assert.equal(h.commands.length, 2); assert.equal(h.commands[1].type, 'addOccurrence');
  assert.deepEqual(h.commands[1].concept, { kind: 'junction', id: junction.id }); assert.equal(h.store.snapshot.junctions.length, before.junctions.length + 1);
  assert.equal(h.model.view.occurrences.filter(item => item.concept.id === junction.id).length, 2);
});

test('junction drag cancellation and stale revisions never create an occurrence', t => {
  for (const mode of ['cancel', 'stale']) {
    const h = setup(t), drag = dragHarness(h, t); drag.move(h.$('create-andjunction'));
    if (mode === 'cancel') drag.drag.cancel(); else h.model.execute({ type: 'renameProject', name: 'Changed during junction drag' });
    const before = h.capture(); drag.release(); drag.release(); assert.deepEqual(h.capture(), before);
    assert.equal(h.store.snapshot.junctions.length, 2);
  }
});

test('a full contextual host blocks its missing new-anchor source until an explicit available attachment is chosen', t => {
  const state = conceptProject(), host = state.views[0].connections[0];
  while (host.routePoints.length < 128) host.routePoints.push({ kind: 'bend', point: { x: 400, y: 400 } });
  const h = setup(t, { state }), before = h.capture(), anchor = host.routePoints.find(point => point.kind === 'anchor');
  const sourceEndpoint = { kind: 'connection', id: host.id, insertAnchor: { index: 0, point: { x: 100, y: 100 } } };
  h.ui.openLink('Association', { sourceEndpoint });
  assert.equal(h.$('link-source').value, ''); assert.equal(h.$('link-submit').disabled, true);
  assert.match(h.$('link-note').textContent, /Выбранный источник.*недоступен/);
  h.submit('link-form'); h.submit('link-form'); h.ui.fillEndpoints();
  assert.equal(h.$('link-source').value, ''); assert.equal(h.$('link-submit').disabled, true); assert.deepEqual(h.capture(), before);
  h.choose('source', `${host.id}:${anchor.id}`); assert.equal(h.$('link-submit').disabled, false);
  h.ui.fillEndpoints(); assert.equal(h.$('link-source').value, `${host.id}:${anchor.id}`);
  h.submit('link-form'); h.submit('link-form');
  assert.equal(h.commands.length, 1); assert.deepEqual(h.commands[0].source, { kind: 'connection', id: host.id, anchorId: anchor.id });
  assert.equal(anchors(h.store.snapshot).length, anchors(state).length);
  h.model.undo(); assert.deepEqual(h.store.snapshot, state);
  h.ui.openLink('Association', { sourceEndpoint }); h.cancel('link-dialog');
  h.ui.openLink('Association'); assert.equal(h.$('link-submit').disabled, false); assert.notEqual(h.$('link-source').value, '');
  h.cancel('link-dialog');
  h.ui.openLink('Association', { sourceEndpoint: { kind: 'connection', id: host.id, anchorId: anchor.id } });
  assert.equal(h.$('link-source').value, `${host.id}:${anchor.id}`); assert.equal(h.$('link-submit').disabled, false);
});

test('two new endpoint anchors cannot overflow one 127-point host and leave a partial anchor', t => {
  const state = conceptProject(), host = state.views[0].connections[0];
  while (host.routePoints.length < 127) host.routePoints.push({ kind: 'bend', point: { x: 400, y: 400 } });
  const h = setup(t, { state }), before = h.capture();
  h.ui.openLink(null, { relationshipId: state.relationships[8].id }); h.choose('source', `${host.id}:new`); h.choose('target', `${host.id}:new`);
  assert.equal(h.$('link-submit').disabled, true); assert.match(h.$('link-note').textContent, /не хватает места.*128/);
  h.submit('link-form'); h.submit('link-form'); assert.deepEqual(h.capture(), before); assert.equal(h.attempts.length, 0);
  h.choose('target', `${host.id}:${host.routePoints.find(point => point.kind === 'anchor').id}`);
  assert.equal(h.$('link-submit').disabled, false); h.submit('link-form');
  assert.equal(h.commands.length, 1); assert.equal(h.store.snapshot.views[0].connections[0].routePoints.length, 128);
  h.model.undo(); assert.deepEqual(h.store.snapshot, state);
});

for (const type of ['AndJunction', 'OrJunction']) test(`${type} explicit placement bypasses automatic search and keeps the exact caller bounds`, t => {
  const h = setup(t, { nextBounds() { throw new Error('Automatic placement must not run'); } });
  const bounds = { x: -5.1, y: 10.2, width: 36, height: 36 };
  h.ui.openEdit(type, bounds); h.$('element-name').value = 'Explicit synthetic placement'; h.submit('edit-form');
  assert.equal(h.commands.length, 1); assert.deepEqual(h.commands[0].bounds, bounds);
  assert.equal(h.$('edit-dialog').open, false);
});
