import { completeCurrentFixture } from '../fixtures/current-fixture.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, validateProject, CURRENT_CATALOG, exportFiles, importFiles } from '../src/index.js';
import { fixtureId as id } from '../fixtures/relationship-project.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { expectedEndpointDecision } from '../../schemka-model-ui/test/endpoint-oracle.js';
import { CURRENT_PROFILE, createRegistry, assessJunctions, assessRelationshipCreation, evaluateConceptRelationship } from '../../schemka-model-profiles/src/index.js';
const registry = createRegistry([CURRENT_PROFILE]);
const run = (s, c) => s.execute(c, s.revision);
function graph(types = ['ApplicationComponent', 'ApplicationComponent'], junctions = 0, edges = []) {
  const state = createProject('Creation policy');
  const named = (prefix, n, type) => ({ id: id(prefix, n), type, name: type, documentation: '', properties: {} });
  state.elements = types.map((t, i) => named('el', i + 1, t));
  state.junctions = Array.from({ length: junctions }, (_, i) => named('jct', i + 1, 'AndJunction'));
  const refs = [...state.elements.map(e => ({ kind: 'element', id: e.id })), ...state.junctions.map(e => ({ kind: 'junction', id: e.id }))];
  state.relationships = edges.map(([source, type, target, extra = {}], i) => ({ id: id('rel', i + 1), type, source: refs[source], target: refs[target], label: '', documentation: '', properties: {}, ...extra }));
  state.views = [{ view: { id: id('view', 1), name: 'Main', documentation: '', properties: {} }, occurrences: refs.map((concept, i) => ({ id: id('occ', i + 1), concept, bounds: { x: i * 100, y: 0, width: 50, height: 30 }, zIndex: i, parentOccurrenceId: null })), connections: [] }];
  return validateProject(completeCurrentFixture(state));
}
const command = (s, source, type, target, extra = {}) => ({ type: 'createRelationshipAndConnection', viewId: s.snapshot.views[0].view.id, source: { kind: 'occurrence', id: id('occ', source + 1) }, target: { kind: 'occurrence', id: id('occ', target + 1) }, relationshipType: type, label: '', ...extra });
const boundary = s => ({ snapshot: s.snapshot, files: s.exportFiles(), history: s.history, revision: s.revision });
function redoReady(s) { run(s, { type: 'renameProject', name: 'temporary' }); s.undo(s.revision); }
function reject(s, c, code = 'RELATIONSHIP_FORBIDDEN', rule = null) { redoReady(s); const before = boundary(s); assert.throws(() => run(s, c), e => e.code === code && (!rule || e.message.includes(rule))); assert.deepEqual(boundary(s), before); }
function accept(s, c) { const before = s.snapshot, history = s.history.undo; const result = run(s, c); const after = s.snapshot; assert.equal(after.relationships.length, before.relationships.length + 1); assert.equal(after.views[0].connections.length, before.views[0].connections.length + 1); assert.equal(s.history.undo, history + 1); s.undo(s.revision); assert.deepEqual(s.snapshot, before); s.redo(s.revision); assert.deepEqual(s.snapshot, after); return result; }

test('all nominal types: independently allowed/forbidden ordinary commands in both directions', () => {
  for (const type of CURRENT_CATALOG.relationshipTypes) {
    for (const wanted of ['ALLOWED', 'FORBIDDEN']) {
      let pair;
      for (const a of CURRENT_CATALOG.elementTypes) { for (const b of CURRENT_CATALOG.elementTypes) { if (expectedEndpointDecision(a, type, b).status === wanted) { pair = [a, b]; break; } } if (pair) break; }
      if (!pair) continue;
      for (const [a, b] of [pair, [...pair].reverse()]) {
        const s = createStore(graph([a, b])), c = command(s, 0, type, 1);
        if (expectedEndpointDecision(a, type, b).status === 'FORBIDDEN') reject(s, c); else accept(s, c);
      }
    }
  }
});
for (const a of ['Product', 'Plateau']) for (const b of ['Deliverable', 'WorkPackage']) for (const type of ['Aggregation', 'Composition']) test(`UNKNOWN remains creatable: ${a}/${type}/${b}`, () => {
  assert.equal(expectedEndpointDecision(a, type, b).status, 'UNKNOWN'); const s = createStore(graph([a, b])); accept(s, command(s, 0, type, 1));
});
test('self links and parallel records have no invented uniqueness or cycle prohibition', () => { const s = createStore(graph()); for (let n = 0; n < 2; n++) accept(s, command(s, 0, 'Association', 0)); });
test('new endpoint FORBIDDEN rejects even if an identical imported relationship exists', () => { const s = createStore(graph(['Service', 'Process'], 0, [[0, 'Realization', 1]])); reject(s, command(s, 0, 'Realization', 1)); });
test('private authority ignores model properties and rejects every public bypass shape', () => {
  const state = graph(['Service', 'Process']); state.elements[0].properties = [{ key: 'allowed', value: 'true' }, { key: 'status', value: 'ALLOWED' }, { key: 'sourceEvidence', value: 'forged' }];
  const s = createStore(state), c = command(s, 0, 'Realization', 1); reject(s, c);
  for (const key of ['force', 'allowed', 'profile', 'skipValidation', 'restore', 'workLimit']) reject(s, { ...c, [key]: true }, 'SCHEMA');
  reject(s, { ...c, source: { ...c.source, type: 'Process' } }, 'SCHEMA');
  const staged = graph(['Service', 'Process'], 0, [[0, 'Realization', 1]]);
  assert.equal(assessRelationshipCreation(staged, createRegistry([structuredClone(CURRENT_PROFILE)]), id('rel', 1)), null);
  assert.equal(assessRelationshipCreation(staged, registry, id('rel', 1)).status, 'FORBIDDEN');
});
test('incomplete junction first incoming/outgoing and degree failures do not veto creation', () => {
  for (const [source, target] of [[0, 2], [2, 1]]) { const s = createStore(graph(['Process', 'Process'], 1)); accept(s, command(s, source, 'Flow', target)); assert.equal(assessJunctions(s.snapshot, registry).status, 'FAIL'); }
  const s = createStore(graph(['Process', 'Process'], 1)); accept(s, command(s, 0, 'Flow', 2)); accept(s, command(s, 2, 'Flow', 1)); accept(s, command(s, 0, 'Flow', 2));
});
const conceptOracle = JSON.parse(readFileSync(new URL('../../schemka-model-profiles/test/fixtures/concept-endpoints.json', import.meta.url)));
const endpointOracle = JSON.parse(readFileSync(new URL('../../schemka-model-profiles/test/fixtures/endpoint-cells.json', import.meta.url)));
function exactCell(source, target, letters, printed, pdf) {
  const cell = endpointOracle.cells.find(item => item.source === source && item.target === target);
  assert.equal(cell?.letters, letters); assert.equal(cell.printed_page, printed); assert.equal(cell.pdf_page, pdf);
}
function assertPermittedPorts(state, edges) {
  const refs = [...state.elements.map(e => ({ kind: 'element', type: e.type })), ...state.junctions.map(e => ({ kind: 'junction', type: e.type }))];
  for (const [source, type, target] of edges) {
    const a = refs[source], b = refs[target];
    const row = conceptOracle.rows.find(([sk, st, rt, tk, tt]) => sk === a.kind && st === a.type && rt === type && tk === b.kind && tt === b.type);
    if (row) assert.equal(row[5], 'ALLOWED', `${a.type}/${type}/${b.type} independently permitted port`);
    else {
      // Sparse B.6 examples omit these ports; use the pinned B.5 witnesses
      // and the same oriented eligibility rule as the 2,520-port oracle test.
      assert.equal(type, 'Realization');
      if (a.kind === 'element' && a.type === 'Process' && b.kind === 'junction') exactCell('Process', 'Service', 'ORftv', 142, 160);
      else { assert.equal(a.kind, 'junction'); assert.equal(b.type, 'Function'); exactCell('Deliverable', 'Function', 'OR', 145, 163); }
    }
    assert.equal(evaluateConceptRelationship(registry, state.project.metamodel, { source: a, relationshipType: type, target: b, scope: 'direct' }).status, 'ALLOWED');
  }
}
test('focused terminal proof blocks valid local ports with new first, middle or last edge in both stored directions', () => {
  for (const types of [['Function', 'Process'], ['Process', 'Function']]) for (const missing of [0, 1, 2]) {
    const edges = [[0, 'Realization', 2], [2, 'Realization', 3], [3, 'Realization', 1]];
    const added = edges[missing], state = graph(types, 2, edges.filter((_, i) => i !== missing));
    assert.equal(expectedEndpointDecision(types[0], 'Realization', types[1]).status, 'FORBIDDEN');
    if (types[0] === 'Process') exactCell('Process', 'Function', 'FGOTv', 142, 160);
    assertPermittedPorts(state, edges);
    const s = createStore(state); reject(s, command(s, ...added), 'RELATIONSHIP_FORBIDDEN', 'junction-terminal-permission');
  }
});
test('alternative focused forbidden path cannot be suppressed by an older witness', () => {
  for (const reverse of [false, true]) {
    const edges = [[0, 'Realization', 2], [2, 'Realization', 1], [0, 'Realization', 3], [4, 'Realization', 1]];
    const state = graph(['Function', 'Process'], 3, edges);
    assertPermittedPorts(state, [...edges, [3, 'Realization', 4]]);
    if (reverse) { state.relationships.reverse(); state.junctions.reverse(); state.elements.reverse(); }
    const s = createStore(state); reject(s, command(s, 3, 'Realization', 4), 'RELATIONSHIP_FORBIDDEN', 'junction-terminal-permission');
  }
});
test('unrelated imported failures and terminal-less cycles are not creation vetoes', () => {
  const s = createStore(graph(['ApplicationComponent', 'DataObject', 'Process'], 2, [[0, 'Serving', 3], [3, 'Serving', 1], [3, 'Flow', 4], [4, 'Flow', 3]]));
  accept(s, command(s, 2, 'Association', 2));
});
test('definite incompatible family blocks; normalized qualifiers and aggregation/composition stay uncertain', () => {
  const s = createStore(graph(['Process', 'Process'], 1, [[0, 'Flow', 2]])); reject(s, command(s, 2, 'Triggering', 1));
  for (const type of ['Composition', 'Aggregation']) { const q = createStore(graph(['Grouping', 'Grouping'], 1, [[0, 'Aggregation', 2]])); accept(q, command(q, 2, type, 1)); }
  const q = createStore(graph(['ApplicationComponent', 'DataObject'], 1, [[0, 'ReadAccess', 2]])); accept(q, command(q, 2, 'WriteAccess', 1));
});
test('role and junction multiplicity failures are attributable; unresolved container does not inherit unrelated family failure', () => {
  let s = createStore(graph(['Grouping', 'Process'], 1)); accept(s, command(s, 0, 'Aggregation', 2, { junctionRole: 'container' }));
  s = createStore(graph(['Grouping', 'Process'], 1, [[1, 'Flow', 2], [2, 'Triggering', 1]])); accept(s, command(s, 0, 'Composition', 2, { junctionRole: 'container' }));
  s = createStore(graph(['Grouping', 'Process'], 1)); reject(s, command(s, 0, 'Association', 1, { junctionRole: 'container' }));
  for (const [source, target, field] of [[0, 2, 'targetMultiplicity'], [2, 1, 'sourceMultiplicity']]) { s = createStore(graph(['Process', 'Process'], 1)); reject(s, command(s, source, 'Flow', target, { [field]: '' })); }
});
test('all nine concept endpoint pairs use actual staged concepts; imported-invalid anchor rejection is atomic', () => {
  const state = conceptProject(); state.relationships = state.relationships.slice(0, 1); state.views[0].connections = state.views[0].connections.slice(0, 1); const s = createStore(state), viewId = state.views[0].view.id;
  const endpoints = [{ kind: 'occurrence', id: id('occ', 1) }, { kind: 'occurrence', id: id('occ', 3) }, { kind: 'connection', id: id('conn', 1), anchorId: id('anc', 1) }];
  for (const a of endpoints) for (const b of endpoints) {
    const s = createStore(state);
    const c = { type: 'createRelationshipAndConnection', viewId, source: a, target: b, relationshipType: 'Association', label: '' };
    if (a.kind === 'connection' && b.kind === 'connection') reject(s, c); else accept(s, c);
  }
  for (const ends of [[endpoints[2], endpoints[2]], [{ kind: 'connection', id: id('conn', 1), insertAnchor: { index: 0, point: { x: 0, y: 0 } } }, endpoints[2]], [{ kind: 'connection', id: id('conn', 1), insertAnchor: { index: 0, point: { x: 0, y: 0 } } }, { kind: 'connection', id: id('conn', 1), insertAnchor: { index: 1, point: { x: 1, y: 1 } } }]]) reject(s, { type: 'createRelationshipAndConnection', viewId, source: ends[0], target: ends[1], relationshipType: 'Association', label: '' });
});
test('import, reuse, duplicate and history restoration preserve invalid records; annotation updates remain diagnostic', () => {
  const state = conceptProject(), s = createStore(importFiles(exportFiles(state))), before = s.exportFiles();
  assert.deepEqual(before, exportFiles(state));
  const connection = state.views[0].connections[8];
  run(s, { type: 'addConnection', viewId: state.views[0].view.id, relationshipId: connection.relationshipId, source: connection.source, target: connection.target });
  run(s, { type: 'duplicateView', viewId: state.views[0].view.id, name: 'Copy' });
  const snapshot = s.snapshot; run(s, { type: 'deleteRelationshipFromModel', relationshipId: connection.relationshipId }); s.undo(s.revision); assert.deepEqual(s.snapshot, snapshot);
  run(s, { type: 'updateRelationshipJunctionRole', relationshipId: id('rel', 1), junctionRole: 'container' });
  run(s, { type: 'updateRelationshipMultiplicity', relationshipId: id('rel', 2), targetMultiplicity: 'raw invalid' });
  assert.equal(assessJunctions(s.snapshot, registry).status, 'FAIL');
  s.load(before, s.revision); assert.deepEqual(s.exportFiles(), before); assert.deepEqual(s.history, { undo: 0, redo: 0 });
});
test('stale revision and structural type errors retain their own codes and exact history', () => {
  const s = createStore(graph(['Service', 'Process'])), c = command(s, 0, 'Realization', 1); redoReady(s); const before = boundary(s);
  assert.throws(() => s.execute(c, -1), e => e.code === 'REVISION'); assert.deepEqual(boundary(s), before);
  reject(s, { ...c, relationshipType: 'Invented' }, 'TYPE');
});
