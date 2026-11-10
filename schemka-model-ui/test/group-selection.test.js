import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, moveDrawingGeometry, applyDrawingGeometry } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { marqueeRectangle, marqueeDrawings } from '../src/drawing-selection.js';
import { inverseScreenPoint } from '../src/drag-drop.js';
import { createCurrentFixture } from './current-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';

const ref = item => ({ kind: 'occurrence', id: item.id });
function fixture() {
  const source = createCurrentFixture(), run = command => source.execute(command, source.revision).created;
  const first = source.snapshot.views[0], detail = source.snapshot.views[1];
  const third = run({ type: 'addOccurrence', viewId: first.view.id, concept: detail.occurrences[2].concept, bounds: { x: 620, y: 520, width: 210, height: 90 } });
  run({ type: 'addConnection', viewId: first.view.id, relationshipId: detail.connections[1].relationshipId, source: ref(first.occurrences[1]), target: { kind: 'occurrence', id: third.occurrenceId } });
  const view = source.snapshot.views[0], [a, b, outside] = view.occurrences, internal = view.connections[0], external = view.connections[1];
  const route = [{ kind: 'bend', point: { x: 320.1, y: 90.2 } }], labelPosition = { x: 330.1, y: 85.2 };
  run({ type: 'updateConnectionLayout', viewId: view.view.id, connectionId: internal.id, routePoints: route, labelPosition });
  run({ type: 'updateConnectionLayout', viewId: view.view.id, connectionId: external.id, routePoints: route, labelPosition });
  const { anchorId } = run({ type: 'insertConnectionAnchor', viewId: view.view.id, connectionId: internal.id, index: 1, point: { x: 330, y: 90 } });
  const higher = run({ type: 'createRelationshipAndConnection', viewId: view.view.id, relationshipType: 'Association', label: 'Internal relation endpoint',
    source: { kind: 'connection', id: internal.id, anchorId }, target: ref(a), routePoints: [{ kind: 'bend', point: { x: 200, y: 20 } }], labelPosition: { x: 205, y: 15 } });
  const outsideHost = run({ type: 'createRelationshipAndConnection', viewId: view.view.id, relationshipType: 'Association', label: 'External relation endpoint',
    source: { kind: 'connection', id: internal.id, anchorId }, target: ref(outside), routePoints: [{ kind: 'bend', point: { x: 450, y: 410 } }], labelPosition: { x: 445, y: 425 } });
  const store = createStore(source.snapshot), controller = createController(store);
  return { store, controller, session: createProjectSession(store), a, b, outside, internal, external, anchorId, higher, outsideHost };
}

test('typed multi-selection is session-only, detached, deduplicated, and has a stable controllable anchor', () => {
  const { controller: c, store, a, b, internal } = fixture(), bytes = store.exportFiles();
  c.select(ref(a)); c.toggleSelection(ref(b)); c.toggleSelection({ kind: 'connection', id: internal.id });
  assert.deepEqual(c.selection, ref(a)); assert.equal(c.selections.length, 3);
  const selection = c.selections; selection[0].id = b.id; selection.pop(); assert.equal(c.selections.length, 3); assert.deepEqual(c.selection, ref(a));
  c.selectMany([...c.selections, ref(a), { kind: 'element', id: a.id }, { kind: 'occurrence', id: internal.id }], ref(b));
  assert.equal(c.selections.length, 3); assert.deepEqual(c.selection, ref(b));
  c.toggleSelection(ref(b)); assert.deepEqual(c.selection, ref(a)); c.toggleSelection(ref(a)); assert.equal(c.selection.kind, 'connection');
  c.select(a.concept); assert.deepEqual(c.selection, a.concept); assert.deepEqual(c.selections, []);
  c.selectMany([ref(a), ref(b)]); c.switchView(store.snapshot.views[1].view.id); assert.deepEqual(c.selections, []); assert.equal(c.selection, null);
  assert.deepEqual(store.exportFiles(), bytes); assert.deepEqual(store.history, { undo: 0, redo: 0 });
});

test('group drag translates internal routes, anchors, labels and higher-order endpoints once; external geometry and other views stay exact', () => {
  const { controller: c, store, session, a, b, internal, external, higher, outsideHost } = fixture();
  const before = store.snapshot, files = store.exportFiles(); c.selectMany([ref(a), ref(b)]);
  c.beginDrag(a.id);
  for (let i = 1; i <= 30; i++) c.previewDrag(i + .04, -i - .06);
  assert.deepEqual(store.exportFiles(), files); assert.equal(session.dirty, false);
  const preview = c.previewView, previewCopy = c.previewView; previewCopy.occurrences[0].bounds.x = 999;
  assert.notDeepEqual(c.previewView, previewCopy);
  c.commitDrag(); assert.deepEqual(c.view, preview); assert.equal(store.history.undo, 1); assert.equal(session.dirty, true);
  const now = store.snapshot;
  for (const occurrence of [a, b]) {
    const after = c.view.occurrences.find(item => item.id === occurrence.id);
    assert.deepEqual(after, { ...occurrence, bounds: { ...occurrence.bounds, x: occurrence.bounds.x + 30, y: Math.round((occurrence.bounds.y - 30.1) * 10) / 10 } });
  }
  for (const id of [internal.id, higher.connectionId]) {
    const old = before.views[0].connections.find(item => item.id === id), after = now.views[0].connections.find(item => item.id === id);
    assert.deepEqual(after, { ...old, routePoints: old.routePoints.map(point => ({ ...point, point: { x: Math.round((point.point.x + 30) * 10) / 10, y: Math.round((point.point.y - 30.1) * 10) / 10 } })), labelPosition: { x: Math.round((old.labelPosition.x + 30) * 10) / 10, y: Math.round((old.labelPosition.y - 30.1) * 10) / 10 } });
  }
  for (const id of [external.id, outsideHost.connectionId]) assert.deepEqual(now.views[0].connections.find(item => item.id === id), before.views[0].connections.find(item => item.id === id));
  for (const key of ['project', 'elements', 'junctions', 'relationships']) assert.deepEqual(now[key], before[key]);
  assert.deepEqual(now.views[1], before.views[1]);
  c.undo(); assert.deepEqual(store.exportFiles(), files); assert.equal(session.dirty, false); c.redo(); assert.deepEqual(store.snapshot, now);
  const restored = createStore(before); restored.load(store.exportFiles(), restored.revision); assert.deepEqual(restored.exportFiles(), store.exportFiles());
});

test('geometry overflow, invalid group members and route overflow reject the whole command without clearing redo', () => {
  const { controller: c, store, a, b, internal } = fixture();
  c.moveSelection(0, 0); c.selectMany([ref(a), ref(b)]); c.moveSelection(10, 0); c.undo();
  const unchanged = store.exportFiles(), history = store.history, revision = store.revision;
  for (const fields of [{ dx: 1000000, dy: 0 }, { dx: Infinity, dy: 0 }, { dx: .01, dy: 0 }, { dx: -0, dy: 0 }, { drawings: [ref(a), ref(a)] }, { drawings: [ref(a), { kind: 'occurrence', id: 'missing' }] }, { drawings: [ref(a), { kind: 'connection', id: a.id }] }]) {
    assert.throws(() => store.execute({ type: 'moveDrawings', viewId: c.viewId, drawings: [ref(a), ref(b)], dx: 10, dy: 0, ...fields }, store.revision));
    assert.deepEqual(store.exportFiles(), unchanged); assert.deepEqual(store.history, history); assert.equal(store.revision, revision);
  }
  c.beginDrag(a.id); assert.throws(() => c.previewDrag(1000000, 0)); assert.equal(c.commitDrag(), null);
  c.beginDrag(a.id); c.previewDrag(0, 0); assert.equal(c.commitDrag(), null); assert.deepEqual(store.history, history);
  const state = store.snapshot; state.views[0].connections.find(item => item.id === internal.id).routePoints[0].point.x = 1000000;
  const limitStore = createStore(state), limit = createController(limitStore); limit.selectMany([ref(a), ref(b)]);
  assert.throws(() => limit.moveSelection(.1, 0), error => error.code === 'GEOMETRY'); assert.deepEqual(limitStore.snapshot, state); assert.deepEqual(limitStore.history, { undo: 0, redo: 0 });
});

test('cancel, stale revision, selection replacement and project replacement cannot commit a late group preview', () => {
  const { controller: c, store, a, b } = fixture(); c.selectMany([ref(a), ref(b)]);
  const before = store.exportFiles(); c.beginDrag(a.id); c.previewDrag(15, 5); c.cancelDrag(); assert.equal(c.commitDrag(), null); assert.deepEqual(store.exportFiles(), before);
  c.beginDrag(a.id); c.previewDrag(15, 5); store.execute({ type: 'renameElement', elementId: a.concept.id, name: 'Concurrent edit' }, store.revision);
  const concurrent = store.exportFiles(); assert.throws(() => c.commitDrag(), error => error.code === 'REVISION'); assert.deepEqual(store.exportFiles(), concurrent); assert.equal(store.history.undo, 1);
  c.beginDrag(a.id); c.previewDrag(15, 5); c.select(a.concept); assert.equal(c.commitDrag(), null);
  c.selectMany([ref(a), ref(b)]); c.beginDrag(a.id); c.previewDrag(15, 5); store.load(before, store.revision); c.afterLoad(); assert.equal(c.commitDrag(), null); assert.deepEqual(c.selections, []);
});

test('visible connection scope preserves excluded routes and occurrence deletion sanitizes the remaining group', () => {
  const { controller: c, store, a, b } = fixture(), view = c.view;
  const patch = moveDrawingGeometry(view, [ref(a), ref(b)], 10, 5, []), next = structuredClone(view); applyDrawingGeometry(next, patch);
  assert.deepEqual(next.connections, view.connections);
  const revision = store.revision; assert.throws(() => store.execute({ type: 'moveDrawings', viewId: c.viewId, drawings: [ref(a)], dx: 10, dy: 0, connectionIds: ['missing'] }, revision)); assert.equal(store.revision, revision);
  c.selectMany([ref(a), ref(b)]); c.execute({ type: 'removeOccurrence', viewId: c.viewId, occurrenceId: a.id });
  assert.deepEqual(c.selections, [ref(b)]); assert.deepEqual(c.selection, ref(b));
  c.select({ kind: 'connection', id: c.view.connections[0].id }); assert.equal(c.moveSelection(10, 0), null);
});

test('marquee uses complete geometry in either direction and supports transformed negative model coordinates', () => {
  const start = inverseScreenPoint({ a: 2, b: 0, c: 0, d: 2, e: 400, f: 200, inverse() { return { a: .5, b: 0, c: 0, d: .5, e: -200, f: -100 }; } }, 20, 20);
  const end = { x: -20, y: 80 }, rectangle = marqueeRectangle(end, start);
  assert.deepEqual(rectangle, { x: -190, y: -90, width: 170, height: 170 });
  const view = { occurrences: [{ id: 'inside', bounds: { x: -180, y: -80, width: 100, height: 50 } }, { id: 'crossing', bounds: { x: -30, y: 0, width: 50, height: 20 } }, { id: 'edge', bounds: { x: -30, y: 70, width: 10, height: 10 } }], connections: [{ id: 'route-inside' }, { id: 'route-crossing' }] };
  const select = marqueeDrawings(view, rectangle, connection => ({ x: -100, y: 0, width: connection.id === 'route-inside' ? 50 : 100, height: 10 }));
  assert.deepEqual(select, [{ kind: 'occurrence', id: 'edge' }, { kind: 'occurrence', id: 'inside' }, { kind: 'connection', id: 'route-inside' }]);
  assert.deepEqual(marqueeDrawings(view, marqueeRectangle(start, start), () => ({})), []); assert.equal(marqueeRectangle(start, { x: NaN, y: 0 }), null);
});

test('self and mutual connection cycles follow their moving occurrence endpoints, while cycles with an external occurrence stay fixed', () => {
  const state = conceptProject(), c = createController(createStore(state)), before = c.view;
  c.selectMany(before.occurrences.map(ref)); c.moveSelection(10, -5);
  for (const connection of c.view.connections) {
    const prior = before.connections.find(item => item.id === connection.id);
    assert.deepEqual(connection.routePoints, prior.routePoints.map(route => ({ ...route, point: { x: Math.round((route.point.x + 10) * 10) / 10, y: Math.round((route.point.y - 5) * 10) / 10 } })));
    assert.deepEqual(connection.labelPosition, { x: 9.9, y: 999995 });
  }
  c.undo(); assert.deepEqual(c.store.snapshot, state);
  c.selectMany(before.occurrences.slice(0, 2).map(ref)); c.moveSelection(10, -5);
  const moved = c.view.connections.find(item => item.id.endsWith('000000000010'));
  assert.deepEqual(moved.labelPosition, { x: 9.9, y: 999995 }, 'self-cycle is internally anchored');
  for (const suffix of ['000000000011', '000000000012']) {
    const old = before.connections.find(item => item.id.endsWith(suffix));
    assert.deepEqual(c.view.connections.find(item => item.id === old.id), old, 'mutual cycle depends on the unselected junction occurrence');
  }
});

test('two occurrences of the same concept move independently of every other occurrence and retain typed identity', () => {
  const { store, a, b } = fixture(), viewId = store.snapshot.views[0].view.id;
  const added = store.execute({ type: 'addOccurrence', viewId, concept: a.concept, bounds: { x: -110, y: -40, width: 150, height: 90 } }, store.revision).created.occurrenceId;
  const c = createController(createStore(store.snapshot)), before = c.store.snapshot;
  c.selectMany([ref(a), { kind: 'occurrence', id: added }]); c.moveSelection(-10, 5);
  assert.equal(c.selections.length, 2); assert.equal(c.view.occurrences.find(item => item.id === added).bounds.x, -120);
  assert.equal(c.view.occurrences.find(item => item.id === a.id).bounds.x, a.bounds.x - 10);
  assert.deepEqual(c.view.occurrences.find(item => item.id === b.id), before.views[0].occurrences.find(item => item.id === b.id));
  assert.deepEqual(c.store.snapshot.elements, before.elements); assert.deepEqual(c.store.snapshot.views[1], before.views[1]); assert.equal(c.store.history.undo, 1);
});

test('viewpoint changes sanitize every selected drawing and prevent hidden manual routes from following a visible group', () => {
  const { controller: c, store, a, b, internal } = fixture();
  const definition = { name: 'Visible objects only', documentation: '', stakeholders: ['Architect'], concerns: ['Objects'], purpose: ['informing'], content: ['overview'],
    selection: { elementTypes: ['Service', 'Process'], junctionTypes: [], relationshipTypes: [] }, representation: { kind: 'diagram', notation: 'archimate', labels: 'name-and-type' } };
  const id = c.execute({ type: 'createViewpoint', definition }).created.viewpointId;
  c.selectMany([ref(a), ref(b), { kind: 'connection', id: internal.id }], ref(b));
  c.execute({ type: 'setViewpoint', viewId: c.viewId, viewpointId: id });
  assert.deepEqual(c.selections, [ref(a), ref(b)]); assert.deepEqual(c.selection, ref(b));
  const before = store.snapshot.views[0].connections; c.moveSelection(10, 0); assert.deepEqual(store.snapshot.views[0].connections, before);
  c.beginDrag(a.id); c.previewDrag(10, 5);
  store.execute({ type: 'updateViewpoint', viewpointId: id, definition: { ...definition, selection: { ...definition.selection, elementTypes: ['Service'] } } }, store.revision);
  c.sanitizeSelection(); assert.deepEqual(c.selections, [ref(a)]); assert.deepEqual(c.selection, ref(a)); assert.equal(c.drag, null); assert.equal(c.commitDrag(), null);
  assert.throws(() => c.execute({ type: 'moveDrawings', viewId: c.viewId, drawings: [ref(a), ref(b)], dx: 5, dy: 0 }));
});
