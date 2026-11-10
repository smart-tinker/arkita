import { completeCurrentFixture } from '../fixtures/current-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, createStore, exportFiles, importFiles, validateProject, LIMITS, CURRENT_CATALOG,
} from '../src/index.js';

const run = (store, command) => store.execute(command, store.revision);
const id = (prefix, number) => `${prefix}-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const capture = store => ({ snapshot: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history });
const layout = () => ({
  routePoints: ([{ x: -1000000, y: 1000000 }, { x: 12.3, y: -45.6 }, { x: 0, y: 0 }, { x: 12.3, y: -45.6 }]).map(point => ({ kind: 'bend', point })),
  labelPosition: { x: -8.9, y: 1000000 },
});
function synthetic() {
  const state = createProject('Synthetic layout project');
  state.project.id = id('prj', 1);
  state.elements = [...CURRENT_CATALOG.elementTypes, 'ApplicationComponent'].map((type, index) => ({
    id: id('el', index + 1), type, name: `Synthetic ${type}`, documentation: 'Kept document 漢字 🙂',
    properties: { '10': 'ten', '2': 'two', text: '<plain & text>\n' },
  }));
  const relationship = (number, type, targetId = state.elements.at(-1).id) => ({
    id: id('rel', number), type, source: { kind: 'element', id: state.elements[0].id },
    target: { kind: 'element', id: targetId }, label: `Kept label ${number}`, documentation: '', properties: { sample: 'Synthetic only' },
  });
  state.relationships = CURRENT_CATALOG.relationshipTypes.map((type, index) => relationship(index + 1, type));
  state.relationships.push(relationship(100, 'Association'), relationship(101, 'Association', state.elements[0].id));
  state.views = [1, 2, 3].map(number => {
    const occurrences = number === 3 ? [] : state.elements.map((element, index) => ({
      id: id('occ', number * 100 + index), concept: { kind: 'element', id: element.id },
      bounds: { x: index * 150 + 0.1, y: number * -80 - 0.2, width: 120.3, height: 60.4 },
      parentOccurrenceId: null, zIndex: index - 1,
    }));
    const connections = number === 3 ? [] : state.relationships.map((item, index) => ({
      id: id('conn', number * 100 + index), relationshipId: item.id,
      source: { kind: 'occurrence', id: occurrences[0].id },
      target: { kind: 'occurrence', id: item.target.id === state.elements[0].id ? occurrences[0].id : occurrences.at(-1).id },
      routePoints: ([{ x: number + 0.1, y: -2.3 }, { x: 4.5, y: number }]).map(point => ({ kind: 'bend', point })),
      labelPosition: { x: 6.7, y: number + 0.8 },
    }));
    // A second drawing of the same model relationship must remain independent.
    if (number !== 3) connections.push({ ...structuredClone(connections[0]), id: id('conn', number * 100 + 50) });
    return { view: { id: id('view', number), name: `View ${number}`, documentation: 'Preserve every view', properties: {} }, occurrences, connections };
  });
  return validateProject(completeCurrentFixture(state));
}
function commandFor(store, changes = {}) {
  const entry = store.snapshot.views[0];
  return { type: 'updateConnectionLayout', viewId: entry.view.id, connectionId: entry.connections[0].id, ...layout(), ...changes };
}
function bothHistories(store) {
  run(store, { type: 'renameProject', name: 'Keep this edit' });
  run(store, { type: 'renameProject', name: 'Keep this redo' });
  store.undo(store.revision);
  assert.deepEqual(store.history, { undo: 1, redo: 1 });
}
function unchanged(store, command, code, baseRevision = store.revision) {
  const before = capture(store);
  assert.throws(() => store.execute(command, baseRevision), { name: 'SchemkaError', code });
  assert.deepEqual(capture(store), before);
}

test('updateConnectionLayout is view-scoped, byte-exact and reversible for the current catalogue', () => {
    const initial = synthetic(), store = createStore(initial), before = capture(store);
    const command = commandFor(store);
    const result = run(store, command);
    const expected = structuredClone(initial);
    Object.assign(expected.views[0].connections[0], layout());
    assert.deepEqual(result, { command: command.type, created: {}, affectedViewIds: [command.viewId], revision: 1 });
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    const afterFiles = store.exportFiles();
    assert.deepEqual(afterFiles.map(file => file.path), before.files.map(file => file.path));
    assert.deepEqual(afterFiles.filter((file, index) => file.content !== before.files[index].content).map(file => file.path),
      [`views/${command.viewId}/connections/${command.connectionId}.json`]);
    assert.deepEqual(exportFiles(importFiles(afterFiles)), afterFiles);
    const reopened = createStore(importFiles(afterFiles));
    assert.deepEqual(reopened.exportFiles(), afterFiles);
    assert.deepEqual(reopened.snapshot.project.metamodel, initial.project.metamodel);

    assert.deepEqual(store.undo(1), { ...result, revision: 2, action: 'undo' });
    assert.deepEqual(store.snapshot, initial);
    assert.deepEqual(store.exportFiles(), before.files);
    assert.deepEqual(store.history, { undo: 0, redo: 1 });
    assert.deepEqual(store.redo(2), { ...result, revision: 3, action: 'redo' });
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(store.exportFiles(), afterFiles);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
});

test('layout reset accepts [] and null, independently preserves either field, and uses one history step each time', () => {
  const store = createStore(synthetic());
  const before = capture(store);
  const previous = store.snapshot.views[0].connections[0];
  run(store, commandFor(store, { routePoints: [], labelPosition: previous.labelPosition }));
  assert.deepEqual(store.snapshot.views[0].connections[0], { ...previous, routePoints: ([] ).map(point => ({ kind: 'bend', point }))});
  run(store, commandFor(store, { routePoints: previous.routePoints, labelPosition: null }));
  assert.deepEqual(store.snapshot.views[0].connections[0], { ...previous, labelPosition: null });
  run(store, commandFor(store, { routePoints: [], labelPosition: null }));
  const reset = capture(store);
  assert.deepEqual(store.snapshot.views[0].connections[0], { ...previous, routePoints: [], labelPosition: null });
  assert.deepEqual(store.history, { undo: 3, redo: 0 });
  assert.deepEqual(exportFiles(importFiles(reset.files)), reset.files);
  for (let i = 0; i < 3; i++) store.undo(store.revision);
  assert.deepEqual(store.snapshot, before.snapshot);
  assert.deepEqual(store.exportFiles(), before.files);
  for (let i = 0; i < 3; i++) store.redo(store.revision);
  assert.deepEqual(store.exportFiles(), reset.files);
});

test('exactly 128 ordered routePoints and coordinate boundaries are accepted without simplification', () => {
  const store = createStore(synthetic());
  assert.equal(LIMITS.routePoints, 128);
  const routePoints = Array.from({ length: LIMITS.routePoints }, (_, index) => ({ kind: 'bend', point: {
    x: index % 2 ? LIMITS.coordinate : -LIMITS.coordinate, y: index % 3 ? 0.1 : -0.1,
  } }));
  const command = commandFor(store, { routePoints, labelPosition: { x: LIMITS.coordinate, y: -LIMITS.coordinate } });
  run(store, command);
  assert.deepEqual(store.snapshot.views[0].connections[0].routePoints, routePoints);
  assert.deepEqual(store.snapshot.views[0].connections[0].labelPosition, command.labelPosition);
  assert.deepEqual(exportFiles(importFiles(store.exportFiles())), store.exportFiles());
  unchanged(store, { ...command, routePoints: ([...routePoints, { x: 0, y: 0 }] ).map(point => ({ kind: 'bend', point }))}, 'LIMIT');
});

test('malformed layout shapes, extra fields and invalid geometry preserve state, revision and both history stacks', () => {
  const store = createStore(synthetic());
  bothHistories(store);
  const command = commandFor(store);
  for (const key of ['viewId', 'connectionId', 'routePoints', 'labelPosition']) {
    const missing = { ...command }; delete missing[key];
    unchanged(store, missing, 'SCHEMA');
    unchanged(store, { ...command, [key]: undefined }, 'JSON_VALUE');
  }
  for (const extra of [
    { id: id('conn', 999) }, { relationshipId: id('rel', 100) }, { source: { kind: 'occurrence', id: id('occ', 101)  }},
    { target: { kind: 'occurrence', id: id('occ', 100)  }}, { label: 'Must not change' }, { properties: {} }, { extra: true },
  ]) unchanged(store, { ...command, ...extra }, 'SCHEMA');
  for (const routePoints of [null, false, 0, '', {}, { x: 1, y: 2 }]) unchanged(store, { ...command, routePoints }, 'SCHEMA');
  for (const point of [null, false, 0, '', [], {}, { x: 1 }, { y: 2 }, { x: 1, y: 2, z: 3 }]) {
    unchanged(store, { ...command, routePoints: ([point] ).map(point => ({ kind: 'bend', point }))}, 'SCHEMA');
    if (point !== null) unchanged(store, { ...command, labelPosition: point }, 'SCHEMA');
  }
  for (const coordinate of [null, false, true, '1', [], {}, 0.01, -0.01, 1000000.1, -1000000.1]) {
    for (const axis of ['x', 'y']) {
      const point = { x: 0, y: 0, [axis]: coordinate };
      unchanged(store, { ...command, routePoints: ([{ x: 1, y: 2 }, point] ).map(point => ({ kind: 'bend', point }))}, 'GEOMETRY');
      unchanged(store, { ...command, labelPosition: point }, 'GEOMETRY');
    }
  }
  for (const coordinate of [NaN, Infinity, -Infinity, -0, undefined]) {
    unchanged(store, { ...command, routePoints: ([{ x: coordinate, y: 1 }] ).map(point => ({ kind: 'bend', point }))}, 'JSON_VALUE');
    unchanged(store, { ...command, labelPosition: { x: 1, y: coordinate } }, 'JSON_VALUE');
  }
  unchanged(store, { ...command, routePoints: (Array.from({ length: LIMITS.routePoints + 1 }, () => ({ x: 1, y: 2 })) ).map(point => ({ kind: 'bend', point }))}, 'LIMIT');
  assert.equal(store.redo(store.revision).action, 'redo');
  assert.equal(store.snapshot.project.name, 'Keep this redo');
});

test('missing or cross-view references and stale revisions fail atomically without consuming redo', () => {
  const store = createStore(synthetic());
  bothHistories(store);
  const command = commandFor(store), state = store.snapshot;
  for (const viewId of [id('view', 999), state.project.id, null, false, 1, {}, []]) unchanged(store, { ...command, viewId }, 'REFERENCE');
  for (const connectionId of [id('conn', 999), state.relationships[0].id, null, false, 1, {}, []]) {
    unchanged(store, { ...command, connectionId }, 'REFERENCE');
  }
  unchanged(store, { ...command, viewId: state.views[1].view.id }, 'REFERENCE');
  unchanged(store, { ...command, connectionId: state.views[1].connections[0].id }, 'REFERENCE');
  unchanged(store, { ...command, viewId: state.views[2].view.id }, 'REFERENCE');
  for (const baseRevision of [0, 2, 4, undefined, null, -1, 0.5, NaN, Infinity, '3']) {
    const before = capture(store);
    assert.throws(() => store.execute(command, baseRevision), { name: 'SchemkaError', code: 'REVISION' });
    assert.deepEqual(capture(store), before);
  }
  store.redo(store.revision);
  assert.equal(store.snapshot.project.name, 'Keep this redo');
});

test('layout commands isolate caller input, returned results and snapshots; successful edits clear redo', () => {
  const initial = synthetic(), store = createStore(initial);
  bothHistories(store);
  const command = commandFor(store), result = run(store, command), after = capture(store);
  assert.deepEqual(store.history, { undo: 2, redo: 0 });
  command.routePoints[0].point.x = 123;
  command.routePoints.push({ x: 1, y: 2 });
  command.labelPosition.y = 456;
  initial.views[0].connections[0].routePoints[0].point.x = 789;
  result.affectedViewIds.push(initial.views[1].view.id);
  result.created.connectionId = 'external';
  const exposed = store.snapshot;
  exposed.views[0].connections[0].routePoints[1].point.x = 999;
  exposed.views[0].connections[0].labelPosition.x = 999;
  assert.deepEqual(capture(store), after);
  store.undo(store.revision);
  store.redo(store.revision);
  assert.deepEqual(store.exportFiles(), after.files);
  const unchangedLayout = store.snapshot.views[0].connections[0];
  run(store, commandFor(store, { routePoints: unchangedLayout.routePoints, labelPosition: unchangedLayout.labelPosition }));
  assert.deepEqual(store.exportFiles(), after.files);
  assert.deepEqual(store.history, { undo: 3, redo: 0 });
});

test('self-loop layout editing preserves endpoints and needs no UUID allocation', () => {
  const store = createStore(synthetic());
  const before = store.snapshot, entry = before.views[0];
  const loop = entry.connections.find(item => item.source.id === item.target.id);
  const command = commandFor(store, { connectionId: loop.id });
  const crypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const result = run(store, command);
    const expected = structuredClone(before);
    Object.assign(expected.views[0].connections.find(item => item.id === loop.id), layout());
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(result.created, {});
    store.undo(store.revision);
    assert.deepEqual(store.snapshot, before);
    store.redo(store.revision);
    assert.deepEqual(store.snapshot, expected);
  } finally { Object.defineProperty(globalThis, 'crypto', crypto); }
});
