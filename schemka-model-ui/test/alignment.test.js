import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, alignDrawingGeometry } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { createCurrentFixture } from './current-fixture.js';

const ref = item => ({ kind: 'occurrence', id: item.id });
function fixture() {
  const source = createCurrentFixture(), viewId = source.snapshot.views[0].view.id;
  const junction = source.execute({ type: 'createJunctionAndOccurrence', viewId, junctionType: 'AndJunction', name: 'Selected junction', bounds: { x: 330, y: 150, width: 24, height: 24 } }, source.revision).created.occurrenceId;
  const state = source.snapshot, view = state.views[0], [anchor, other] = view.occurrences;
  anchor.bounds = { x: -10.1, y: 20.2, width: 100.1, height: 60.1 };
  other.bounds = { x: 210.3, y: -40.4, width: 70.2, height: 30.2 };
  const c = createController(createStore(state)); c.selectMany(view.occurrences.map(ref), ref(anchor));
  return { c, state, viewId, anchor, other, junction: view.occurrences.find(item => item.id === junction) };
}

test('six alignments and three size operations preserve the anchor, typed identities, concepts and other views with one exact Undo/Redo', async t => {
  const expected = { left: [{ x: -10.1 }, { x: -10.1 }], 'center-x': [{ x: 4.9 }, { x: 28 }], right: [{ x: 19.8 }, { x: 66 }],
    top: [{ y: 20.2 }, { y: 20.2 }], 'center-y': [{ y: 35.2 }, { y: 38.3 }], bottom: [{ y: 50.1 }, { y: 56.3 }],
    width: [{ width: 100.1 }, { width: 100.1 }], height: [{ height: 60.1 }, { height: 60.1 }], size: [{ width: 100.1, height: 60.1 }, { width: 100.1, height: 60.1 }] };
  for (const [operation, bounds] of Object.entries(expected)) await t.test(operation, () => {
    const { c, state, anchor, other, junction } = fixture(), session = createProjectSession(c.store), before = c.store.exportFiles();
    assert.ok(c.alignSelection(operation)); assert.equal(c.store.history.undo, 1); assert.equal(session.dirty, true);
    const after = c.store.snapshot;
    assert.deepEqual(c.view.occurrences.find(item => item.id === anchor.id), anchor);
    for (const [index, item] of [other, junction].entries()) assert.deepEqual(c.view.occurrences.find(value => value.id === item.id), { ...item, bounds: { ...item.bounds, ...bounds[index] } });
    for (const key of ['project', 'elements', 'junctions', 'relationships']) assert.deepEqual(after[key], state[key]);
    assert.deepEqual(after.views[1], state.views[1]); assert.deepEqual(c.selection, ref(anchor)); assert.equal(c.selections.length, 3);
    const afterFiles = c.store.exportFiles(); c.undo(); assert.deepEqual(c.store.exportFiles(), before); assert.equal(session.dirty, false);
    c.redo(); assert.deepEqual(c.store.exportFiles(), afterFiles);
    const restored = createStore(state); restored.load(afterFiles, restored.revision); assert.deepEqual(restored.exportFiles(), afterFiles);
  });
});

test('centering rounds integer tenths deterministically across positive and negative half-grid positions without negative zero', () => {
  const { state, anchor, other } = fixture(), view = state.views[0];
  for (const [x, width, otherWidth, expected] of [[-110.1, 100.1, 70.2, -95.1], [-.1, .1, .2, -.1], [1.4, .2, .1, 1.5], [-.1, .2, .1, 0]]) {
    anchor.bounds = { x, y: x, width, height: width }; other.bounds = { x: 50, y: 50, width: otherWidth, height: otherWidth };
    const result = alignDrawingGeometry(view, [ref(anchor), ref(other)], ref(anchor), 'center-x');
    const next = result.occurrences[0].bounds.x;
    const anchorCenter = anchor.bounds.x + anchor.bounds.width / 2, center = next + other.bounds.width / 2;
    assert.ok(Math.abs(center - anchorCenter) <= .0500000001); assert.equal(Math.round(next * 10) / 10, next); assert.equal(Object.is(next, -0), false);
    assert.equal(next, expected);
  }
  anchor.bounds = { x: -10.1, y: -20.1, width: .1, height: .1 }; other.bounds = { x: 1, y: 1, width: .2, height: .2 };
  assert.equal(alignDrawingGeometry(view, [ref(anchor), ref(other)], ref(anchor), 'center-x').occurrences[0].bounds.x, -10.1);
  assert.equal(alignDrawingGeometry(view, [ref(anchor), ref(other)], ref(anchor), 'center-y').occurrences[0].bounds.y, -20.1);
});

test('aligned or equal-size no-op leaves dirty baseline, revision and both history branches unchanged', () => {
  const { c } = fixture(); c.alignSelection('width'); c.execute({ type: 'renameProject', name: 'Temporary' }); c.undo();
  const session = createProjectSession(c.store), before = c.store.exportFiles(), history = c.store.history, revision = c.store.revision;
  assert.equal(c.alignSelection('width'), null); assert.equal(c.alignSelection('width'), null);
  assert.deepEqual(c.store.exportFiles(), before); assert.deepEqual(c.store.history, history); assert.equal(c.store.revision, revision); assert.equal(session.dirty, false);
});

test('one out-of-range result rejects the entire group, including otherwise valid members and redo', () => {
  const { state, anchor, other, junction, viewId } = fixture(); anchor.bounds.x = 1000000; anchor.bounds.width = 1000000;
  other.bounds.width = .1; junction.bounds.width = 1000000;
  const c = createController(createStore(state)); c.selectMany(state.views[0].occurrences.map(ref), ref(anchor));
  c.execute({ type: 'renameProject', name: 'Temporary' }); c.undo();
  const before = c.store.exportFiles(), history = c.store.history, revision = c.store.revision;
  assert.throws(() => c.alignSelection('right'), error => error.code === 'GEOMETRY');
  assert.deepEqual(c.store.exportFiles(), before); assert.deepEqual(c.store.history, history); assert.equal(c.store.revision, revision);
  for (const fields of [{ anchor: { kind: 'connection', id: state.views[0].connections[0].id } }, { anchor: { kind: 'occurrence', id: 'missing' } }, { drawings: [ref(other)] }, { drawings: [ref(anchor), ref(other), ref(other)] }, { operation: 'distribute' }]) {
    assert.throws(() => c.store.execute({ type: 'alignDrawings', viewId, drawings: c.selections, anchor: ref(anchor), operation: 'left', ...fields }, revision));
    assert.deepEqual(c.store.exportFiles(), before); assert.deepEqual(c.store.history, history);
  }
  c.execute({ type: 'renameProject', name: 'Concurrent' }); const concurrent = c.store.exportFiles();
  assert.throws(() => c.store.execute({ type: 'alignDrawings', viewId, drawings: c.selections, anchor: ref(anchor), operation: 'left' }, revision), error => error.code === 'REVISION');
  assert.deepEqual(c.store.exportFiles(), concurrent);
});

test('selected connections stay selected while same-delta internal routes follow alignment and unequal endpoints retain manual geometry', () => {
  const { state, anchor, other, junction, viewId } = fixture(); other.bounds.x = 210.3; junction.bounds.x = 210.3;
  const store = createStore(state), newLink = store.execute({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association', label: 'Between moved members', source: ref(other), target: ref(junction),
    routePoints: [{ kind: 'bend', point: { x: 330.1, y: 10.2 } }], labelPosition: { x: 300, y: 20 } }, store.revision).created.connectionId;
  const c = createController(createStore(store.snapshot)), before = c.view;
  c.selectMany([...before.occurrences.map(ref), { kind: 'connection', id: newLink }], ref(anchor)); c.alignSelection('left');
  const translated = c.view.connections.find(item => item.id === newLink);
  assert.deepEqual(translated.routePoints[0].point, { x: 109.7, y: 10.2 }); assert.deepEqual(translated.labelPosition, { x: 79.6, y: 20 });
  assert.deepEqual(c.view.connections.find(item => item.id !== newLink), before.connections.find(item => item.id !== newLink)); assert.equal(c.selections.length, 4);
  c.undo(); c.alignSelection('center-x');
  assert.deepEqual(c.view.connections, before.connections, 'Different width-dependent deltas do not translate manual routes');
});

function nestedFixture() {
  const store = createStore(createProject('Nested alignment')), run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Nested' });
  const parent = { kind: 'occurrence', id: run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Parent', bounds: { x: 200, y: 200, width: 120, height: 80 } }).occurrenceId };
  const child = { kind: 'visualNode', id: run({ type: 'createVisualNode', viewId, kind: 'group', name: 'Child', parent, bounds: { x: 220, y: 220, width: 100, height: 60 } }).visualNodeId };
  const grandchild = { kind: 'occurrence', id: run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Grandchild', parent: child, bounds: { x: 230, y: 230, width: 50, height: 30 } }).occurrenceId };
  const leaf = { kind: 'visualNode', id: run({ type: 'createVisualNode', viewId, kind: 'note', text: 'Leaf', parent: grandchild, bounds: { x: 235, y: 235, width: 20, height: 10 } }).visualNodeId };
  const anchor = { kind: 'occurrence', id: run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Anchor', bounds: { x: 0, y: 0, width: 120, height: 80 } }).occurrenceId };
  const line = (source, target) => run({ type: 'createVisualConnector', viewId, source, target, routePoints: [{ kind: 'bend', point: { x: 225, y: 225 } }], labelPosition: { x: 226, y: 226 } }).visualConnectorId;
  const internal = line(child, grandchild), external = line(parent, child);
  return { state: store.snapshot, parent, child, grandchild, leaf, anchor, internal, external };
}
const drawing = (view, ref) => view[ref.kind === 'occurrence' ? 'occurrences' : 'visualNodes'].find(item => item.id === ref.id);

test('nested alignment follows the nearest selected parent independent of selection order, with exact Undo/Redo', async t => {
  for (const [operation, axis, childPosition] of [['left', 'x', 0], ['center-x', 'x', 10], ['right', 'x', 20], ['top', 'y', 0], ['center-y', 'y', 10], ['bottom', 'y', 20]]) await t.test(operation, () => {
    const f = nestedFixture(), beforeView = f.state.views[0];
    let expectedFiles;
    for (const selection of [[f.parent, f.child, f.anchor], [f.child, f.parent, f.anchor]]) {
      const c = createController(createStore(f.state)), before = c.store.exportFiles();
      c.selectMany(selection, f.anchor); c.alignSelection(operation);
      assert.equal(drawing(c.view, f.parent).bounds[axis], 0);
      assert.equal(drawing(c.view, f.child).bounds[axis], childPosition);
      assert.equal(drawing(c.view, f.grandchild).bounds[axis], childPosition + 10);
      assert.equal(drawing(c.view, f.leaf).bounds[axis], childPosition + 15);
      assert.deepEqual(drawing(c.view, f.anchor), drawing(beforeView, f.anchor));
      const line = c.view.visualConnectors.find(item => item.id === f.internal);
      assert.deepEqual(line.routePoints[0].point, { x: 225, y: 225, [axis]: childPosition + 5 });
      assert.deepEqual(line.labelPosition, { x: 226, y: 226, [axis]: childPosition + 6 });
      const external = structuredClone(beforeView.visualConnectors.find(item => item.id === f.external));
      if (childPosition === 20) { external.routePoints[0].point[axis] -= 200; external.labelPosition[axis] -= 200; }
      assert.deepEqual(c.view.visualConnectors.find(item => item.id === f.external), external);
      assert.deepEqual(c.store.snapshot.elements, f.state.elements);
      const after = c.store.exportFiles();
      if (expectedFiles) assert.deepEqual(after, expectedFiles); else expectedFiles = after;
      assert.equal(c.store.history.undo, 1); c.undo(); assert.deepEqual(c.store.exportFiles(), before);
      c.redo(); assert.deepEqual(c.store.exportFiles(), after);
    }
  });
});

test('a selected nested anchor and its locked descendants stay fixed when an ancestor aligns to it', () => {
  const f = nestedFixture(), entry = f.state.views[0];
  drawing(entry, f.child).locked = true; drawing(entry, f.grandchild).locked = true;
  const c = createController(createStore(f.state)), before = c.store.exportFiles();
  c.selectMany([f.parent, f.child], f.child); c.alignSelection('left');
  assert.equal(drawing(c.view, f.parent).bounds.x, 220);
  for (const ref of [f.child, f.grandchild, f.leaf, f.anchor]) assert.deepEqual(drawing(c.view, ref), drawing(entry, ref));
  assert.deepEqual(c.view.visualConnectors, entry.visualConnectors);
  const after = c.store.exportFiles(); assert.equal(c.store.history.undo, 1);
  c.undo(); assert.deepEqual(c.store.exportFiles(), before); c.redo(); assert.deepEqual(c.store.exportFiles(), after);
});

test('a locked carried descendant rejects nested alignment atomically and retains the redo branch', () => {
  const f = nestedFixture(); drawing(f.state.views[0], f.grandchild).locked = true;
  const c = createController(createStore(f.state)); c.execute({ type: 'renameProject', name: 'Temporary' }); c.undo();
  c.selectMany([f.parent, f.child, f.anchor], f.anchor);
  const before = c.store.exportFiles(), history = c.store.history, revision = c.store.revision;
  assert.throws(() => c.alignSelection('left'), { code: 'DRAWING_LOCKED' });
  assert.deepEqual(c.store.exportFiles(), before); assert.deepEqual(c.store.history, history); assert.equal(c.store.revision, revision);
});
