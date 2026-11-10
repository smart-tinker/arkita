import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFragment, createStore, exportFiles, importFiles, validateProject } from '../src/index.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { fixtureId } from '../fixtures/relationship-project.js';
import { viewpointDefinition, viewpointId } from '../fixtures/viewpoint-project.js';
import { profileDefinition, profileId } from '../fixtures/customization-project.js';

const run = (store, command) => store.execute(command, store.revision);
const persisted = store => ({ files: store.exportFiles(), snapshot: store.snapshot, revision: store.revision, history: store.history });
const drawings = view => view.occurrences.map(item => ({ kind: 'occurrence', id: item.id }));
function fixture() {
  const state = conceptProject();
  // Avoid prohibited relationship-to-relationship terminals through junctions;
  // preserve supported anchored ends and cycles whose other end is an element.
  const excluded = new Set([7, 8, 9].map(n => fixtureId('rel', n)));
  state.relationships = state.relationships.filter(item => !excluded.has(item.id));
  state.views[0].connections = state.views[0].connections.filter(item => !excluded.has(item.relationshipId));
  state.relationships.find(item => item.id === fixtureId('rel', 12)).target = { kind: 'element', id: state.elements[0].id };
  state.views[0].connections.find(item => item.id === fixtureId('conn', 12)).target = { kind: 'occurrence', id: state.views[0].occurrences[0].id };
  for (const item of state.relationships) { delete item.sourceMultiplicity; delete item.targetMultiplicity; }
  for (const item of state.views[0].connections) item.labelPosition = { x: -0.1, y: 500 };
  const repeated = { ...structuredClone(state.views[0].occurrences[0]), id: fixtureId('occ', 99), bounds: { x: -100, y: -150, width: 120, height: 60 } };
  state.views[0].occurrences.push(repeated);
  state.views[0].connections.find(item => item.id === fixtureId('conn', 100)).source.id = repeated.id;
  state.elements[1].name = state.elements[0].name;
  return validateProject(state);
}
function pendingRedo(store) {
  run(store, { type: 'renameProject', name: 'Keep past' });
  run(store, { type: 'renameProject', name: 'Keep future' });
  store.undo(store.revision);
}
function command(state, selection = drawings(state.views[0]), mode = 'reuse') {
  return { type: 'pasteFragment', viewId: state.views[1].view.id, fragment: captureFragment(state, state.views[0].view.id, selection), mode, dx: 40, dy: -20 };
}
function rejects(store, cmd, code, revision = store.revision) {
  const before = persisted(store);
  assert.throws(() => store.execute(cmd, revision), code ? { code } : undefined);
  assert.deepEqual(persisted(store), before, 'Rejected paste preserves exact state and both histories');
}

test('capture is deeply immutable, detached and read-only; duplicate drawings of a concept are retained', () => {
  const state = fixture(), store = createStore(state); pendingRedo(store);
  const before = persisted(store), snapshot = captureFragment(store.snapshot, state.views[0].view.id, drawings(state.views[0]));
  assert.deepEqual(persisted(store), before);
  assert.equal(snapshot.occurrences.length, 5); assert.equal(snapshot.elements.length, 2);
  assert.equal(snapshot.connections.length, state.views[0].connections.length);
  assert.equal(snapshot.relationships.length, state.relationships.length);
  assert.ok(Object.isFrozen(snapshot.connections[0].routePoints[0].point));
  assert.throws(() => { snapshot.elements[0].name = 'Changed'; }, TypeError);
  state.elements[0].documentation = 'Changed outside store';
  assert.notEqual(snapshot.elements[0].documentation, state.elements[0].documentation);
});

test('external connections are omitted from automatic closure; explicitly selected external endpoints reject', () => {
  const state = fixture(), view = state.views[0], first = drawings(view)[0];
  const fragment = captureFragment(state, view.view.id, [first]);
  assert.equal(fragment.occurrences.length, 1); assert.equal(fragment.connections.length, 0);
  assert.throws(() => captureFragment(state, view.view.id, [first, { kind: 'connection', id: view.connections[0].id }]), { code: 'FRAGMENT_EXTERNAL' });
  assert.throws(() => captureFragment(state, view.view.id, [{ kind: 'connection', id: view.connections[0].id }]), { code: 'FRAGMENT_EXTERNAL' });
  for (const selection of [[], [first, first], [{ kind: 'element', id: state.elements[0].id }], [{ ...first, id: fixtureId('occ', 987) }]]) {
    assert.throws(() => captureFragment(state, view.view.id, selection));
  }
});

test('reuse remaps every drawing and named anchor once while preserving all concept IDs and raw text', () => {
  const state = fixture(), store = createStore(state), cmd = command(state), before = persisted(store);
  const result = run(store, cmd), after = store.snapshot, copy = after.views[1];
  assert.deepEqual(after.elements, before.snapshot.elements); assert.deepEqual(after.junctions, before.snapshot.junctions);
  assert.deepEqual(after.relationships, before.snapshot.relationships); assert.deepEqual(after.views[0], before.snapshot.views[0]);
  assert.equal(copy.occurrences.length, 5); assert.equal(copy.connections.length, state.views[0].connections.length);
  assert.deepEqual(result.created.relationshipIds, []);
  const occurrenceIds = new Map(cmd.fragment.occurrences.map((item, i) => [item.id, result.created.occurrenceIds[i]]));
  const connectionIds = new Map(cmd.fragment.connections.map((item, i) => [item.id, result.created.connectionIds[i]]));
  const anchors = new Map(cmd.fragment.connections.flatMap((item, i) => item.routePoints.flatMap((point, n) => point.kind === 'anchor' ? [[point.id, copy.connections[i].routePoints[n].id]] : [])));
  for (const [i, original] of cmd.fragment.occurrences.entries()) assert.deepEqual(copy.occurrences[i], {
    ...original, id: occurrenceIds.get(original.id), bounds: { ...original.bounds, x: original.bounds.x + 40, y: original.bounds.y - 20 },
  });
  for (const [i, original] of cmd.fragment.connections.entries()) {
    const actual = copy.connections[i]; assert.equal(actual.relationshipId, original.relationshipId);
    for (const end of ['source', 'target']) assert.deepEqual(actual[end], original[end].kind === 'occurrence'
      ? { kind: 'occurrence', id: occurrenceIds.get(original[end].id) }
      : { kind: 'connection', id: connectionIds.get(original[end].id), anchorId: anchors.get(original[end].anchorId) });
    assert.deepEqual(actual.labelPosition, { x: 39.9, y: 480 });
    for (const [j, point] of original.routePoints.entries()) assert.deepEqual(actual.routePoints[j].point,
      { x: Math.round((point.point.x + 40) * 10) / 10, y: Math.round((point.point.y - 20) * 10) / 10 });
  }
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
  const files = store.exportFiles(); assert.deepEqual(exportFiles(importFiles(files)), files);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), files);
  const second = run(store, cmd);
  assert.ok(second.created.occurrenceIds.every(id => !result.created.occurrenceIds.includes(id)));
  validateProject(store.snapshot);
});

test('clone uses a single typed ID map for shared drawings, junctions, cyclic relationships and anchored connections', () => {
  const state = fixture(), store = createStore(state), cmd = command(state, undefined, 'clone');
  const result = run(store, cmd), after = store.snapshot, copy = after.views[1];
  assert.equal(result.created.elementIds.length, 2); assert.equal(result.created.junctionIds.length, 2);
  assert.equal(result.created.relationshipIds.length, state.relationships.length);
  const maps = Object.fromEntries([['element', 'elements'], ['junction', 'junctions'], ['relationship', 'relationships']].map(([kind, collection]) =>
    [kind, new Map(cmd.fragment[collection].map((item, i) => [item.id, result.created[`${kind}Ids`][i]]))]));
  for (const [kind, collection] of [['element', 'elements'], ['junction', 'junctions'], ['relationship', 'relationships']]) {
    for (const item of cmd.fragment[collection]) {
      const actual = after[collection].find(record => record.id === maps[kind].get(item.id));
      const expected = { ...item, id: maps[kind].get(item.id) };
      if (kind === 'relationship') for (const end of ['source', 'target']) expected[end] = { kind: item[end].kind, id: maps[item[end].kind].get(item[end].id) };
      assert.deepEqual(actual, expected);
    }
  }
  const firstConcept = maps.element.get(state.elements[0].id);
  assert.equal(copy.occurrences.filter(item => item.concept.id === firstConcept).length, 2);
  assert.equal(new Set(after.elements.map(item => item.id)).size, 4, 'Equal names never merge IDs');
  assert.deepEqual(after.views[0], state.views[0]);
  const files = store.exportFiles(); assert.deepEqual(exportFiles(importFiles(files)), files);
  store.undo(store.revision); assert.deepEqual(store.snapshot, state);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), files);
});

test('clone shares explicit customization definitions and rejects changed definitions or values', () => {
  const state = fixture(); state.customizationProfiles = [{ id: profileId, ...profileDefinition({ text: { type: 'String', default: '🙂' } }) }];
  state.elements[0].profileApplications = [{ profileId, values: { text: '' } }];
  const cmd = command(state, undefined, 'clone'), store = createStore(state);
  const result = run(store, cmd);
  assert.deepEqual(store.snapshot.customizationProfiles, state.customizationProfiles);
  const copied = store.snapshot.elements.find(item => item.id === result.created.elementIds[0]);
  assert.deepEqual(copied.profileApplications, state.elements[0].profileApplications);
  const definition = { ...state.customizationProfiles[0], name: 'Changed definition' }; delete definition.id;
  run(store, { type: 'updateCustomizationProfile', profileId, definition }); pendingRedo(store);
  rejects(store, cmd, 'FRAGMENT_STALE');
});

test('changed or removed source records reject reuse and clone without restoring old data', () => {
  for (const mode of ['reuse', 'clone']) for (const change of [
    s => run(s, { type: 'renameElement', elementId: s.snapshot.elements[0].id, name: 'Changed' }),
    s => run(s, { type: 'moveOccurrence', viewId: s.snapshot.views[0].view.id, occurrenceId: s.snapshot.views[0].occurrences[0].id, x: 123, y: 0 }),
    s => run(s, { type: 'removeOccurrence', viewId: s.snapshot.views[0].view.id, occurrenceId: s.snapshot.views[0].occurrences[0].id }),
    s => run(s, { type: 'renameRelationship', relationshipId: s.snapshot.relationships[0].id, label: 'Changed' }),
  ]) {
    const state = fixture(), store = createStore(state), cmd = command(state, undefined, mode);
    change(store); pendingRedo(store); rejects(store, cmd, 'FRAGMENT_STALE');
  }
});

test('invalid mode, geometry, typed refs, extra fields, project, budget and stale revision reject atomically', () => {
  const state = fixture(), store = createStore(state), cmd = command(state); pendingRedo(store);
  for (const patch of [{ mode: 'cut' }, { dx: NaN }, { dx: 1000000 }, { dy: -1000000 }, { viewId: 'missing' }, { extra: true }]) rejects(store, { ...cmd, ...patch });
  for (const mutate of [
    f => { f.version = 3; }, f => { f.projectId = fixtureId('prj', 99); },
    f => { f.connections[0].source.kind = 'connection'; }, f => { f.elements[0].name = 'Forged'; },
    f => { f.occurrences.push(structuredClone(f.occurrences[0])); }, f => { f.occurrences[0].bounds.width = -1; },
    f => { f.connections[0].routePoints = Array.from({ length: 129 }, () => ({ kind: 'bend', point: { x: 0, y: 0 } })); },
  ]) { const fragment = structuredClone(cmd.fragment); mutate(fragment); rejects(store, { ...cmd, fragment }); }
  rejects(store, cmd, 'REVISION', store.revision - 1);
});

test('viewpoints exclude hidden copy inputs and refuse a partly hidden paste as one transaction', () => {
  const state = fixture(), cmd = command(state); state.viewpoints = [{ id: viewpointId, ...viewpointDefinition() }];
  state.views[1].view.viewpointId = viewpointId;
  const store = createStore(state); pendingRedo(store);
  rejects(store, cmd, 'FRAGMENT_VIEWPOINT'); rejects(store, { ...cmd, mode: 'clone' }, 'FRAGMENT_VIEWPOINT');
  state.views[0].view.viewpointId = viewpointId;
  assert.throws(() => captureFragment(state, state.views[0].view.id, drawings(state.views[0])), { code: 'FRAGMENT_SELECTION' });
});

test('reuse retains an imported forbidden relationship; clone cannot bypass the normal creation gate', () => {
  const state = fixture(); state.elements[0].type = 'Service'; state.elements[1].type = 'Process';
  state.relationships[0].type = 'Realization';
  const store = createStore(state), cmd = command(state); pendingRedo(store);
  rejects(store, { ...cmd, mode: 'clone' }, 'RELATIONSHIP_FORBIDDEN');
  run(store, cmd); assert.equal(store.snapshot.relationships[0].type, 'Realization');
});

test('a single translation may span the full coordinate domain while final geometry remains bounded', () => {
  const state = fixture(); state.views[0].occurrences[0].bounds.x = -1000000;
  const cmd = command(state, [{ kind: 'occurrence', id: state.views[0].occurrences[0].id }]); cmd.dx = 2000000; cmd.dy = 0;
  const store = createStore(state), result = run(store, cmd);
  assert.equal(store.snapshot.views[1].occurrences.find(item => item.id === result.created.occurrenceIds[0]).bounds.x, 1000000);
  const another = createStore(state); pendingRedo(another);
  rejects(another, { ...cmd, dx: 2000000.1 }, 'GEOMETRY');
  rejects(another, { ...cmd, dx: -0 }, 'JSON_VALUE');
});
