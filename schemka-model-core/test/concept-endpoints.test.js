import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, createProjectResolver, resolveConcept, resolveViewEndpoint, deletionImpact, drawingDeletionImpact, exportFiles, importFiles, validateProject, LIMITS } from '../src/index.js';
import { fixtureId as id } from '../fixtures/relationship-project.js';
import { conceptProject } from '../fixtures/concept-project.js';

const run = (store, command) => store.execute(command, store.revision);
const capture = store => ({ snapshot: store.snapshot, files: store.exportFiles(), history: store.history, revision: store.revision });
const viewId = id('view', 1), hostId = id('conn', 1), anchorId = id('anc', 1);
const occurrence = number => ({ kind: 'occurrence', id: id('occ', number) });
const host = (number = 1) => ({ kind: 'connection', id: id('conn', number), anchorId: id('anc', number) });
function failed(store, command, code) { const before = capture(store); assert.throws(() => run(store, command), { code }); assert.deepEqual(capture(store), before); }
function bothHistories(store) { run(store, { type: 'renameProject', name: 'Kept' }); run(store, { type: 'renameProject', name: 'Redo' }); store.undo(store.revision); }
const connection = (state, number) => state.views[0].connections.find(item => item.id === id('conn', number));
const relation = (state, number) => state.relationships.find(item => item.id === id('rel', number));

test('v2 roundtrip preserves every endpoint pair, raw text, order, repeated hosts and cyclic references', () => {
  const state = conceptProject(), before = structuredClone(state), files = exportFiles(state);
  assert.equal(new Set(state.relationships.slice(0, 9).map(item => `${item.source.kind}:${item.target.kind}`)).size, 9);
  assert.equal(state.project.formatVersion, 4); assert.equal(state.project.metamodel.version, 2);
  assert.equal(files.filter(file => file.path.startsWith('model/junctions/')).length, 2);
  assert.deepEqual(exportFiles(importFiles([...files].reverse())), files);
  const permuted = structuredClone(state); permuted.relationships.reverse(); permuted.views.reverse();
  for (const entry of permuted.views) { entry.connections.reverse(); entry.occurrences.reverse(); }
  assert.deepEqual(exportFiles(permuted), files); assert.deepEqual(state, before);
  assert.equal(relation(importFiles(files), 7).sourceMultiplicity, '');
  assert.equal(relation(importFiles(files), 7).targetMultiplicity, ' 0..*\r\n');
});

test('read-only resolvers are detached, freeze nested data, resolve chosen host and never follow cycles', () => {
  const state = conceptProject(), before = structuredClone(state), resolver = createProjectResolver(state);
  const resolved = resolver.resolveViewEndpoint(viewId, host(10));
  assert.equal(resolved.concept.kind, 'relationship'); assert.equal(resolved.record.id, id('rel', 10));
  assert.equal(resolved.point, resolved.anchor.point); assert.equal(resolved.connection.id, id('conn', 10));
  assert.throws(() => { resolved.point.x = 666; }, TypeError);
  assert.throws(() => { resolver.resolveConcept({ kind: 'junction', id: id('jct', 1) }).name = 'Mutated'; }, TypeError);
  assert.deepEqual(resolveViewEndpoint(state, viewId, host(100)).point, { x: 777, y: 888 });
  assert.equal(resolveConcept(state, { kind: 'junction', id: id('jct', 2) }).type, 'OrJunction');
  assert.deepEqual(resolver.resolveViewEndpoint(viewId, occurrence(3)).concept, { kind: 'junction', id: id('jct', 1) });
  state.junctions[0].name = 'Outside'; assert.notEqual(resolver.resolveConcept({ kind: 'junction', id: id('jct', 1) }).name, 'Outside');
  state.junctions[0].name = before.junctions[0].name; assert.deepEqual(state, before);
  for (const endpoint of [{ kind: 'connection', id: hostId, anchorId: id('anc', 100) }, { kind: 'relationship', id: id('rel', 1) }, { ...host(), extra: true }]) assert.throws(() => resolver.resolveViewEndpoint(viewId, endpoint));
  let invoked = false; const ref = {}; Object.defineProperty(ref, 'kind', { enumerable: true, get() { invoked = true; return 'element'; } });
  assert.throws(() => resolver.resolveConcept(ref), { code: 'JSON_VALUE' }); assert.equal(invoked, false);
});

const invalidCases = [
  ['missing junction array', state => { delete state.junctions; }, 'SCHEMA'],
  ['unknown junction type', state => { state.junctions[0].type = 'Junction'; }, 'TYPE'],
  ['junction is not element', state => { state.junctions[0].type = 'Grouping'; }, 'TYPE'],
  ['junction ID prefix', state => { state.junctions[0].id = id('el', 20); }, 'ID'],
  ['duplicate junction', state => state.junctions.push(structuredClone(state.junctions[0])), 'DUPLICATE_ID'],
  ['wrong model reference kind', state => { relation(state, 2).target.kind = 'element'; }, 'REFERENCE'],
  ['missing relationship reference', state => { relation(state, 5).target.id = id('rel', 99); }, 'REFERENCE'],
  ['relationship cannot be occurrence', state => { state.views[0].occurrences[0].concept = { kind: 'relationship', id: id('rel', 1) }; }, 'REFERENCE'],
  ['legacy occurrence field', state => { state.views[0].occurrences[0].elementId = id('el', 1); }, 'SCHEMA'],
  ['legacy connection field', state => { connection(state, 1).bendpoints = []; }, 'SCHEMA'],
  ['missing host', state => { connection(state, 5).target.id = id('conn', 99); }, 'REFERENCE'],
  ['wrong host anchor', state => { connection(state, 5).target.anchorId = id('anc', 100); }, 'REFERENCE'],
  ['wrong model host', state => { connection(state, 5).target = host(2); }, 'REFERENCE'],
  ['missing anchor', state => { connection(state, 5).target.anchorId = id('anc', 99); }, 'REFERENCE'],
  ['foreign view host', state => { state.views[1].connections.push(state.views[0].connections.pop()); connection(state, 5).target = host(100); }, 'REFERENCE'],
  ['duplicate anchor', state => { connection(state, 2).routePoints[1].id = anchorId; }, 'DUPLICATE_ID'],
  ['invalid anchor prefix', state => { connection(state, 1).routePoints[1].id = id('conn', 99); }, 'ID'],
  ['bend cannot own ID', state => { connection(state, 1).routePoints[0].id = id('anc', 99); }, 'SCHEMA'],
  ['unknown route kind', state => { connection(state, 1).routePoints[0].kind = 'curve'; }, 'SCHEMA'],
  ['route point extra field', state => { connection(state, 1).routePoints[0].t = 0.5; }, 'SCHEMA'],
  ['raw point shape', state => { connection(state, 1).routePoints[0] = { x: 0, y: 0 }; }, 'SCHEMA'],
  ['anchor grid', state => { connection(state, 1).routePoints[1].point.x = 0.01; }, 'GEOMETRY'],
  ['invalid role', state => { relation(state, 2).junctionRole = 'transit'; }, 'SCHEMA'],
  ['null role', state => { relation(state, 2).junctionRole = null; }, 'SCHEMA'],
  ['unknown reference field', state => { relation(state, 1).source.trusted = true; }, 'SCHEMA'],
];
for (const [label, mutate, code] of invalidCases) test(`strict v2 graph rejects ${label} without mutation`, () => {
  const state = conceptProject(); mutate(state); const before = structuredClone(state);
  assert.throws(() => validateProject(state), { code }); assert.throws(() => exportFiles(state), { code }); assert.deepEqual(state, before);
});

test('v1 headers and unsupported versions fail clearly before open replaces state or history', () => {
  const store = createStore(conceptProject()); bothHistories(store);
  for (const version of [1, 0, 5, '2', null]) {
    const files = store.exportFiles(), root = files.find(file => file.path === 'schemka.json');
    const project = JSON.parse(root.content); project.formatVersion = version; root.content = JSON.stringify(project);
    const before = capture(store); assert.throws(() => store.load(files, store.revision), { code: 'VERSION' }); assert.deepEqual(capture(store), before);
  }
  const legacy = createProject('Old'); legacy.project.formatVersion = 1; delete legacy.junctions;
  assert.throws(() => validateProject(legacy), { code: 'VERSION' });
});

test('junction creation, reuse, rename, type changes and roles are single undoable commands', () => {
  const store = createStore(conceptProject()), initial = capture(store);
  const created = run(store, { type: 'createJunctionAndOccurrence', viewId, junctionType: 'AndJunction', name: 'New', bounds: { x: 1, y: 2, width: 30, height: 40 }, documentation: 'Kept', properties: [{ key: 'x', value: '' }], zIndex: -1 }).created;
  run(store, { type: 'addOccurrence', viewId: id('view', 2), concept: { kind: 'junction', id: created.junctionId }, bounds: { x: 5, y: 6, width: 24, height: 24 } });
  assert.deepEqual(run(store, { type: 'renameJunction', junctionId: created.junctionId, name: 'Renamed' }).affectedViewIds, [viewId, id('view', 2)]);
  run(store, { type: 'updateJunctionType', junctionId: created.junctionId, junctionType: 'OrJunction' });
  assert.equal(store.snapshot.junctions.at(-1).type, 'OrJunction');
  run(store, { type: 'updateRelationshipJunctionRole', relationshipId: id('rel', 2), junctionRole: 'container' });
  assert.equal(relation(store.snapshot, 2).junctionRole, 'container'); // Semantic applicability is advisory.
  run(store, { type: 'updateRelationshipJunctionRole', relationshipId: id('rel', 2), junctionRole: null });
  assert.ok(!Object.hasOwn(relation(store.snapshot, 2), 'junctionRole'));
  const final = store.exportFiles(); for (let i = 0; i < 6; i++) store.undo(store.revision);
  assert.deepEqual(store.exportFiles(), initial.files); for (let i = 0; i < 6; i++) store.redo(store.revision); assert.deepEqual(store.exportFiles(), final);
  failed(store, { type: 'updateJunctionType', junctionId: created.junctionId, junctionType: 'Grouping' }, 'TYPE');
});

test('atomic anchor insertion plus creation/reuse has exact host choice and leaves no orphan on failure', () => {
  const store = createStore(conceptProject()); bothHistories(store);
  const command = { type: 'createRelationshipAndConnection', viewId, source: occurrence(1), target: { kind: 'connection', id: id('conn', 100), insertAnchor: { index: 0, point: { x: 101.1, y: -202.2 } } }, relationshipType: 'Association', label: 'Attached', sourceMultiplicity: '', targetMultiplicity: 'raw' };
  for (const change of [{ relationshipType: 'NoType' }, { targetMultiplicity: false }, { source: occurrence(999) }]) failed(store, { ...command, ...change }, change.relationshipType ? 'TYPE' : change.source ? 'REFERENCE' : 'SCHEMA');
  const before = store.exportFiles(), revision = store.revision, result = run(store, command), after = store.exportFiles();
  assert.equal(result.revision, revision + 1); assert.equal(result.created.anchorIds.length, 1);
  const created = store.snapshot.views[0].connections.at(-1); assert.equal(created.target.id, id('conn', 100)); assert.equal(created.target.anchorId, result.created.anchorIds[0]);
  assert.equal(store.snapshot.relationships.at(-1).target.id, id('rel', 1));
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  assert.throws(() => store.execute(command, revision), { code: 'REVISION' }); assert.deepEqual(store.exportFiles(), after);
  const reused = run(store, { type: 'addConnection', viewId, relationshipId: result.created.relationshipId, source: occurrence(1), target: { kind: 'connection', id: hostId, insertAnchor: { index: 2, point: { x: 50, y: 60 } } } });
  assert.equal(reused.created.anchorIds.length, 1); assert.equal(store.snapshot.relationships.length, 13);
  failed(store, { type: 'addConnection', viewId, relationshipId: id('rel', 1), source: occurrence(1), target: command.target }, 'REFERENCE');
});

test('anchor move, reset, deletion with atomic rebind and alternate-host endpoint reuse preserve integrity', () => {
  const store = createStore(conceptProject()), before = store.exportFiles();
  const inserted = run(store, { type: 'insertConnectionAnchor', viewId, connectionId: hostId, index: 0, point: { x: 30, y: 40 } }).created.anchorId;
  run(store, { type: 'moveConnectionAnchor', viewId, connectionId: hostId, anchorId, point: { x: -10.1, y: -20.2 } });
  assert.deepEqual(resolveViewEndpoint(store.snapshot, viewId, host()).point, { x: -10.1, y: -20.2 });
  const points = connection(store.snapshot, 1).routePoints.filter(point => point.kind === 'anchor');
  run(store, { type: 'resetConnectionLayout', viewId, connectionId: hostId });
  assert.deepEqual(connection(store.snapshot, 1).routePoints, points); assert.equal(connection(store.snapshot, 1).labelPosition, null);
  failed(store, { type: 'removeConnectionAnchor', viewId, connectionId: hostId, anchorId }, 'REFERENCE');
  failed(store, { type: 'updateConnectionLayout', viewId, connectionId: hostId, routePoints: [], labelPosition: null }, 'REFERENCE');
  run(store, { type: 'removeConnectionAnchor', viewId, connectionId: hostId, anchorId, replacement: { kind: 'connection', id: hostId, anchorId: inserted } });
  for (const item of store.snapshot.views[0].connections) for (const ref of [item.source, item.target]) if (ref.kind === 'connection' && ref.id === hostId) assert.equal(ref.anchorId, inserted);
  run(store, { type: 'rebindConnectionEndpoint', viewId, connectionId: id('conn', 5), end: 'target', endpoint: host(100) });
  assert.deepEqual(connection(store.snapshot, 5).target, host(100));
  failed(store, { type: 'rebindConnectionEndpoint', viewId, connectionId: id('conn', 5), end: 'target', endpoint: host(2) }, 'REFERENCE');
  failed(store, { type: 'removeConnectionAnchor', viewId, connectionId: hostId, anchorId: inserted, replacement: host(2) }, 'REFERENCE');
  const final = store.exportFiles(); for (let i = 0; i < 5; i++) store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
  for (let i = 0; i < 5; i++) store.redo(store.revision); assert.deepEqual(store.exportFiles(), final);
});

test('model deletion fixed point removes transitive relationship references without unrelated concepts', () => {
  for (const target of [{ kind: 'element', id: id('el', 1) }, { kind: 'junction', id: id('jct', 1) }, { kind: 'relationship', id: id('rel', 1) }, { kind: 'relationship', id: id('rel', 11) }]) {
    const state = conceptProject(), store = createStore(state), before = store.exportFiles(), impact = deletionImpact(state, target);
    assert.ok(Object.isFrozen(impact)); assert.ok(Object.isFrozen(impact.relationshipIds));
    for (const values of Object.values(impact)) assert.deepEqual(values, [...new Set(values)].sort());
    const result = run(store, { type: `delete${target.kind[0].toUpperCase()}${target.kind.slice(1)}FromModel`, [`${target.kind}Id`]: target.id });
    assert.deepEqual(result.impact, impact);
    const after = store.snapshot;
    for (const [collection, key] of [['elements', 'elementIds'], ['junctions', 'junctionIds'], ['relationships', 'relationshipIds']]) assert.deepEqual(state[collection].filter(item => !after[collection].some(other => other.id === item.id)).map(item => item.id).sort(), impact[key]);
    assert.deepEqual(state.views.flatMap(entry => entry.connections).filter(item => !after.views.some(entry => entry.connections.some(other => other.id === item.id))).map(item => item.id).sort(), impact.connectionIds);
    assert.ok(after.elements.some(item => item.id === id('el', 2))); assert.ok(after.junctions.some(item => item.id === id('jct', 2)));
    if (target.id === id('rel', 11)) assert.deepEqual(impact.relationshipIds, [id('rel', 11), id('rel', 12)]);
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
  }
});

test('drawing deletion closes cycles locally, retains models and never reattaches to an alternate host', () => {
  for (const target of [{ viewId, kind: 'connection', id: hostId }, { viewId, kind: 'connection', id: id('conn', 11) }, { viewId, kind: 'occurrence', id: id('occ', 1) }]) {
    const state = conceptProject(), store = createStore(state), impact = drawingDeletionImpact(state, target);
    const result = run(store, { type: target.kind === 'connection' ? 'removeConnection' : 'removeOccurrence', viewId, [`${target.kind}Id`]: target.id });
    assert.deepEqual(result.impact, impact); assert.deepEqual(store.snapshot.relationships, state.relationships); assert.deepEqual(store.snapshot.junctions, state.junctions); assert.deepEqual(store.snapshot.elements, state.elements);
    if (target.id === hostId) { assert.ok(!connection(store.snapshot, 5)); assert.ok(connection(store.snapshot, 100)); }
    if (target.id === id('conn', 11)) assert.deepEqual(impact.connectionIds, [id('conn', 11), id('conn', 12)]);
    assert.deepEqual(impact.anchorIds, state.views[0].connections.filter(item => impact.connectionIds.includes(item.id)).flatMap(item => item.routePoints.filter(point => point.kind === 'anchor').map(point => point.id)).sort());
    store.undo(store.revision); assert.deepEqual(store.snapshot, state);
  }
});

test('duplicateView preallocates all drawing and anchor IDs before remapping self and mutual cycles', () => {
  const state = conceptProject(), store = createStore(state), original = state.views[0];
  const result = run(store, { type: 'duplicateView', viewId, name: 'Cyclic copy' }), copy = store.snapshot.views.at(-1);
  assert.equal(copy.view.id, result.created.viewId); assert.deepEqual(store.snapshot.relationships, state.relationships);
  const occurrenceMap = new Map(original.occurrences.map((item, i) => [item.id, copy.occurrences[i].id]));
  const connectionMap = new Map(original.connections.map((item, i) => [item.id, copy.connections[i].id]));
  const anchorMap = new Map(original.connections.flatMap((item, i) => item.routePoints.flatMap((point, j) => point.kind === 'anchor' ? [[point.id, copy.connections[i].routePoints[j].id]] : [])));
  for (const map of [occurrenceMap, connectionMap, anchorMap]) for (const [oldId, newId] of map) assert.notEqual(oldId, newId);
  for (let i = 0; i < original.connections.length; i++) {
    const a = original.connections[i], b = copy.connections[i]; assert.equal(a.relationshipId, b.relationshipId);
    assert.deepEqual(a.routePoints.map(point => point.point), b.routePoints.map(point => point.point));
    for (const end of ['source', 'target']) assert.deepEqual(b[end], a[end].kind === 'occurrence' ? { kind: 'occurrence', id: occurrenceMap.get(a[end].id) } : { kind: 'connection', id: connectionMap.get(a[end].id), anchorId: anchorMap.get(a[end].anchorId) });
  }
  const files = store.exportFiles(); assert.deepEqual(exportFiles(importFiles(files)), files); store.undo(store.revision); assert.deepEqual(store.snapshot, state); store.redo(store.revision); assert.deepEqual(store.exportFiles(), files);
});

test('route budget counts bends and anchors together and anchor entity budget is separate from files', () => {
  const state = conceptProject(), hostConnection = connection(state, 1);
  hostConnection.routePoints = [hostConnection.routePoints[1], ...Array.from({ length: LIMITS.routePoints - 1 }, () => ({ kind: 'bend', point: { x: 0, y: 0 } }))];
  validateProject(state); hostConnection.routePoints.push({ kind: 'bend', point: { x: 0, y: 0 } }); assert.throws(() => validateProject(state), { code: 'LIMIT' });
  const many = conceptProject(); many.relationships = many.relationships.slice(0, 1); many.views[0].connections = []; many.views[0].occurrences = many.views[0].occurrences.slice(0, 2);
  const connections = Math.ceil(LIMITS.entities / (LIMITS.routePoints + 1));
  const ordinaryEntities = 1 + many.elements.length + many.junctions.length + many.relationships.length + many.views.length + many.views[0].occurrences.length + connections;
  let remaining = LIMITS.entities - ordinaryEntities, next = 1000;
  for (let i = 0; i < connections; i++) { const count = Math.min(LIMITS.routePoints, remaining); remaining -= count;
    many.views[0].connections.push({ id: id('conn', i + 1), relationshipId: id('rel', 1), source: occurrence(1), target: occurrence(2), labelPosition: null, style: {},
      routePoints: Array.from({ length: count }, () => ({ kind: 'anchor', id: id('anc', next++), point: { x: 0, y: 0 } })) });
  }
  assert.equal(remaining, 0); validateProject(many); assert.ok(exportFiles(many).length < LIMITS.files);
  const store = createStore(many); bothHistories(store);
  failed(store, { type: 'insertConnectionAnchor', viewId, connectionId: many.views[0].connections.at(-1).id, index: 0, point: { x: 0, y: 0 } }, 'LIMIT');
  many.views[0].connections.at(-1).routePoints.push({ kind: 'anchor', id: id('anc', next++), point: { x: 0, y: 0 } }); assert.throws(() => validateProject(many), { code: 'LIMIT' });
});

test('anchor command shape, insertion position and resource failures preserve both histories', () => {
  const store = createStore(conceptProject()); bothHistories(store);
  const base = { type: 'insertConnectionAnchor', viewId, connectionId: hostId, index: 0, point: { x: 0, y: 0 } };
  for (const index of [-1, 0.5, 4, '0', null]) failed(store, { ...base, index }, 'GEOMETRY');
  for (const point of [{ x: 0.01, y: 0 }, { x: 0, y: 1000000.1 }, { x: '0', y: 0 }]) failed(store, { ...base, point }, 'GEOMETRY');
  failed(store, { ...base, point: { x: 0, y: 0, extra: 1 } }, 'SCHEMA');
  failed(store, { ...base, connectionId: id('conn', 99) }, 'REFERENCE');
  failed(store, { type: 'moveConnectionAnchor', viewId, connectionId: hostId, anchorId: id('anc', 100), point: { x: 0, y: 0 } }, 'REFERENCE');
  failed(store, { type: 'rebindConnectionEndpoint', viewId, connectionId: hostId, end: 'wrong', endpoint: occurrence(1) }, 'SCHEMA');
  failed(store, { type: 'updateRelationshipJunctionRole', relationshipId: id('rel', 1), junctionRole: false }, 'SCHEMA');
  const state = conceptProject(), full = connection(state, 1);
  full.routePoints = [full.routePoints[1], ...Array.from({ length: 127 }, () => ({ kind: 'bend', point: { x: 0, y: 0 } }))];
  const fullStore = createStore(state); bothHistories(fullStore); failed(fullStore, { ...base, index: 128 }, 'LIMIT');
  failed(fullStore, { type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association', label: '', source: occurrence(1), target: { kind: 'connection', id: hostId, insertAnchor: { index: 128, point: { x: 0, y: 0 } } } }, 'LIMIT');
});

test('imported relationship reuse preserves atomic double-insertion order and shared anchors', () => {
  const store = createStore(conceptProject()), before = store.exportFiles();
  const result = run(store, { type: 'addConnection', viewId, relationshipId: id('rel', 9),
    source: { kind: 'connection', id: hostId, insertAnchor: { index: 0, point: { x: 1, y: 2 } } },
    target: { kind: 'connection', id: hostId, insertAnchor: { index: 1, point: { x: 3, y: 4 } } } });
  assert.equal(result.created.anchorIds.length, 2); assert.deepEqual(connection(store.snapshot, 1).routePoints.slice(0, 2).map(point => point.id), result.created.anchorIds);
  const created = store.snapshot.views[0].connections.at(-1); assert.equal(created.source.anchorId, result.created.anchorIds[0]); assert.equal(created.target.anchorId, result.created.anchorIds[1]);
  run(store, { type: 'rebindConnectionEndpoint', viewId, connectionId: created.id, end: 'target', endpoint: created.source });
  const same = store.snapshot.views[0].connections.at(-1); assert.deepEqual(same.source, same.target);
  run(store, { type: 'removeConnectionAnchor', viewId, connectionId: hostId, anchorId: result.created.anchorIds[1] });
  for (let i = 0; i < 3; i++) store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
});

test('pinned anchors remain fixed on node movement and input aliasing cannot couple later edits', () => {
  const store = createStore(conceptProject()), point = { x: 22.2, y: 33.3 };
  const routePoints = [{ kind: 'anchor', id: anchorId, point }, { kind: 'bend', point }, { kind: 'bend', point }];
  run(store, { type: 'updateConnectionLayout', viewId, connectionId: hostId, routePoints, labelPosition: point });
  const fixed = structuredClone(connection(store.snapshot, 1)); point.x = 999;
  run(store, { type: 'moveOccurrence', viewId, occurrenceId: id('occ', 1), x: 500, y: 600 });
  assert.deepEqual(connection(store.snapshot, 1), fixed);
  run(store, { type: 'moveConnectionAnchor', viewId, connectionId: hostId, anchorId, point: { x: 1, y: 2 } });
  assert.deepEqual(connection(store.snapshot, 1).routePoints[1].point, { x: 22.2, y: 33.3 });
  assert.deepEqual(connection(store.snapshot, 1).labelPosition, { x: 22.2, y: 33.3 });
});

test('legacy command fields are rejected rather than aliased into the canonical API', () => {
  const store = createStore(conceptProject()); bothHistories(store);
  for (const command of [
    { type: 'addOccurrence', viewId, elementId: id('el', 1), bounds: { x: 0, y: 0, width: 10, height: 10 } },
    { type: 'createRelationshipAndConnection', viewId, sourceOccurrenceId: id('occ', 1), targetOccurrenceId: id('occ', 2), relationshipType: 'Association', label: '' },
    { type: 'addConnection', viewId, relationshipId: id('rel', 1), sourceOccurrenceId: id('occ', 1), targetOccurrenceId: id('occ', 2) },
    { type: 'updateConnectionLayout', viewId, connectionId: hostId, bendpoints: [], labelPosition: null },
  ]) failed(store, command, 'SCHEMA');
  assert.equal(Object.hasOwn(LIMITS, 'bendpoints'), false);
});

test('junction paths keep exact ID-directory allowlisting, duplicate keys and duplicate-path defenses', () => {
  const files = exportFiles(conceptProject()), file = files.find(item => item.path.startsWith('model/junctions/'));
  for (const path of [file.path.replace('model/junctions/', 'model/junctions/../'), file.path.replace('model/', 'arbitrary/'), file.path.replace('.json', '.JSON')]) {
    assert.throws(() => importFiles(files.map(item => item === file ? { ...item, path } : item)), { code: 'PATH' });
  }
  assert.throws(() => importFiles([...files, file]), { code: 'DUPLICATE_PATH' });
  assert.throws(() => importFiles(files.map(item => item === file ? { ...item, path: `model/junctions/${id('jct', 99)}.json` } : item)), { code: 'PATH_ID' });
  assert.throws(() => importFiles(files.map(item => item === file ? { ...item, content: item.content.replace('"name":', '"name": "duplicate", "name":') } : item)), { code: 'DUPLICATE_KEY' });
});
