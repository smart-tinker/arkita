import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createProject, createStore, exportFiles, importFiles, validateProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';
import * as profiles from '../src/index.js';
const { assessProject, createRegistry, CURRENT_PROFILE } = profiles;

async function fixture() {
  const root = new URL('../../schemka-model-core/fixtures/two-views/', import.meta.url);
  const files = [];
  async function walk(relative = '') {
    for (const item of await readdir(new URL(relative, root), { withFileTypes: true })) {
      const path = relative + item.name;
      if (item.isDirectory()) await walk(path + '/');
      else files.push({ path, content: await readFile(new URL(path, root), 'utf8') });
    }
  }
  await walk();
  return importFiles(files);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('public API is explicit without a registry import/export or mutation API', () => {
  assert.deepEqual(Object.keys(profiles).sort(), ['CURRENT_PROFILE', 'PROFILE_LIMITS', 'ProfileError', 'assessMultiplicity', 'assessProject', 'assessRelationshipCreation', 'assessJunctions', 'createRegistry', 'evaluateRelationship', 'evaluateConceptRelationship', 'getVerifiedConceptDecision', 'getVerifiedJunctionAssessment', 'getVerifiedJunctionIssue', 'getPresentation', 'getVerifiedRelationshipDecision', 'getVerifiedRelationshipCoverage'].sort());
});

test('current typed fixture is assessed once per relationship, independently of occurrences', async () => {
  const state = await fixture();
  const report = assessProject(state, createRegistry([CURRENT_PROFILE]));
  assert.equal(report.localStatus, 'ALLOWED');
  assert.equal(report.verifiedDirect, state.relationships.length);
  assert.equal(report.verifiedDerived, 0);
  assert.deepEqual(report.profile, { id: 'schemka-archimate4', version: 2 });
  assert.deepEqual(report.counts, { ALLOWED: state.relationships.length, FORBIDDEN: 0, UNKNOWN: 0 });
  assert.equal(report.relationships.length, state.relationships.length);
  assert.deepEqual(report.relationships.map(item => item.relationshipId), state.relationships.map(item => item.id));
  assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.counts));
  assert.ok(Object.isFrozen(report.relationships[0]));
});

test('valid format does not imply a present profile or known semantics', async () => {
  const state = await fixture();
  assert.equal(validateProject(state), state);
  const report = assessProject(state, createRegistry([]));
  assert.equal(report.localStatus, 'UNKNOWN');
  assert.deepEqual(report.counts, { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: state.relationships.length });
  assert.ok(report.relationships.every(item => item.reason === 'profile-not-found'));
  const second = structuredClone(CURRENT_PROFILE); second.version = 3;
  assert.equal(assessProject(state, createRegistry([second])).localStatus, 'UNKNOWN');
});

test('local prohibition cannot rewrite core validity or canonical bytes', async () => {
  const state = await fixture();
  const p = structuredClone(CURRENT_PROFILE); p.rules = [{ id: 'synthetic-prohibition', sourceType: state.elements.find(e => e.id === state.relationships[0].source.id).type, relationshipType: state.relationships[0].type, targetType: state.elements.find(e => e.id === state.relationships[0].target.id).type, status: 'FORBIDDEN', scope: 'direct', evidence: 'local' }];
  const before = exportFiles(state);
  const report = assessProject(state, createRegistry([p]));
  assert.equal(report.localStatus, 'FORBIDDEN');
  assert.equal(report.counts.FORBIDDEN, state.relationships.length);
  assert.equal(report.normative.status, 'UNKNOWN');
  assert.equal(validateProject(state), state);
  assert.deepEqual(exportFiles(state), before);
});

test('absent rules, unverified evidence and empty projects remain UNKNOWN', async () => {
  const state = await fixture();
  const noRules = structuredClone(CURRENT_PROFILE); noRules.rules = [];
  assert.equal(assessProject(state, createRegistry([noRules])).localStatus, 'UNKNOWN');
  const unverified = structuredClone(CURRENT_PROFILE); unverified.metadata.status = 'unverified';
  const report = assessProject(state, createRegistry([unverified]));
  assert.equal(report.counts.UNKNOWN, state.relationships.length);
  assert.equal(report.normative.status, 'UNKNOWN');
  const empty = assessProject(createProject('Empty'), createRegistry([CURRENT_PROFILE]));
  assert.equal(empty.localStatus, 'UNKNOWN');
  assert.deepEqual(empty.counts, { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 });
});

test('descriptive source/license claims never authorize normative conformance', async () => {
  const p = structuredClone(CURRENT_PROFILE);
  p.metadata.source = 'This description claims verified normative conformance';
  p.metadata.license = 'This description claims permission for all materials';
  const report = assessProject(await fixture(), createRegistry([p]));
  assert.equal(report.localStatus, 'UNKNOWN');
  assert.equal(report.normative.status, 'UNKNOWN');
});

test('core validation happens first and profiles cannot widen the supported persisted schema', async () => {
  const state = await fixture();
  for (const [change, code] of [
    [s => { s.project.metamodel = { id: 'synthetic-test', version: 1 }; }, 'VERSION'],
    [s => { s.project.metamodel.version = 1; }, 'VERSION'],
    [s => { s.elements[0].type = 'Alpha'; }, 'TYPE'],
    [s => { s.relationships[0].type = 'Connect'; }, 'TYPE'],
    [s => { s.relationships[0].source.id = s.project.id; }, 'REFERENCE'],
    [s => { s.extra = true; }, 'SCHEMA'],
  ]) {
    const invalid = structuredClone(state); change(invalid);
    const before = JSON.stringify(invalid);
    assert.throws(() => assessProject(invalid, createRegistry([CURRENT_PROFILE])), { name: 'SchemkaError', code });
    assert.equal(JSON.stringify(invalid), before);
    assert.throws(() => assessProject(invalid, null), { name: 'SchemkaError', code });
  }
  assert.throws(() => assessProject(state, null), { code: 'PROFILE_REGISTRY' });
});

test('reports preserve frozen state, revision, undo/redo and canonical project bytes', async () => {
  const store = createStore(await fixture());
  const element = store.snapshot.elements[0];
  store.execute({ type: 'renameElement', elementId: element.id, name: 'Local edit' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Undo next' }, store.revision);
  store.undo(store.revision);
  const snapshot = freeze(store.snapshot);
  const before = { snapshot, revision: store.revision, history: store.history, files: store.exportFiles(), bytes: serializeProjectFile(snapshot) };
  const registry = createRegistry([CURRENT_PROFILE]);
  for (let i = 0; i < 3; i++) assessProject(snapshot, registry);
  assert.deepEqual(store.snapshot, before.snapshot);
  assert.equal(store.revision, before.revision);
  assert.deepEqual(store.history, before.history);
  assert.deepEqual(store.exportFiles(), before.files);
  assert.deepEqual(serializeProjectFile(snapshot), before.bytes);
  store.redo(store.revision);
  assert.equal(store.snapshot.project.name, 'Undo next');
  assert.equal(store.snapshot.elements.find(item => item.id === element.id).name, 'Local edit');
});

test('current IO and Mermaid projections remain byte-identical across assessments', async () => {
  const original = await fixture();
  const files = exportFiles(original);
  const bytes = serializeProjectFile(original);
  const projections = original.views.map(entry => exportMermaid(original, entry.view.id));
  const roundtrip = deserializeProjectFile(bytes);
  const registry = createRegistry([CURRENT_PROFILE]);
  assert.deepEqual(assessProject(roundtrip, registry), assessProject(original, registry));
  assert.deepEqual(exportFiles(roundtrip), files);
  assert.deepEqual(serializeProjectFile(roundtrip), bytes);
  assert.deepEqual(exportFiles(importFiles(files)), files);
  assert.deepEqual(roundtrip.views.map(entry => exportMermaid(roundtrip, entry.view.id)), projections);
  assert.deepEqual(Object.keys(roundtrip).sort(), ['assets', 'elements', 'folders', 'junctions', 'project', 'relationships', 'views']);
});

// Original scope regression cases; source locators: docs/INSTANCE-BOUNDARIES.json.
// Structural acceptance and endpoint ALLOWED never assert instance conformance.
test('instance topology does not widen bounded endpoint assessment', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  const fixtureId = (prefix, index) => `${prefix}-00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  const cases = [];
  for (const type of ['Composition', 'Specialization']) {
    cases.push({ name: `${type} self-link`, type, edges: [[0, 0]] });
    cases.push({ name: `${type} two-node cycle`, type, edges: [[0, 1], [1, 0]] });
    cases.push({ name: `${type} three-node cycle`, type, edges: [[0, 1], [1, 2], [2, 0]] });
  }
  cases.push(
    { name: 'multiple Composition owners', type: 'Composition', edges: [[0, 2], [1, 2]], multiplicity: true },
    { name: 'parallel Composition records', type: 'Composition', edges: [[0, 1], [0, 1]], multiplicity: true },
    { name: 'forbidden cross-type Specialization', type: 'Specialization', types: ['Process', 'Function'], edges: [[0, 1]], endpointStatus: 'FORBIDDEN' },
    { name: 'allowed cross-type Specialization', type: 'Specialization', types: ['Artifact', 'DataObject'], edges: [[0, 1]] },
  );
  for (const example of cases) {
    const initial = createProject(example.name);
    initial.elements = (example.types || ['Process', 'Process', 'Process']).map((type, index) => ({
      id: fixtureId('el', index), type, name: '', documentation: '', properties: [],
    }));
    initial.relationships = example.edges.map(([source, target], index) => ({
      id: fixtureId('rel', index), type: example.type,
      source: { kind: 'element', id: initial.elements[source].id },
      target: { kind: 'element', id: initial.elements[target].id }, label: '', documentation: '', properties: [],
      ...(example.multiplicity ? { sourceMultiplicity: '1', targetMultiplicity: '1' } : {}),
    }));
    const store = createStore(initial);
    store.execute({ type: 'renameProject', name: `${example.name}: retained` }, store.revision);
    store.execute({ type: 'renameProject', name: `${example.name}: redo` }, store.revision);
    store.undo(store.revision);
    const snapshot = freeze(store.snapshot);
    const before = { snapshot, revision: store.revision, history: store.history, files: store.exportFiles(), bytes: serializeProjectFile(snapshot) };
    assert.equal(validateProject(snapshot), snapshot, example.name);
    const report = assessProject(snapshot, registry);
    const elements = new Map(snapshot.elements.map(element => [element.id, element]));
    const expectedRows = snapshot.relationships.map(relationship => ({
      relationshipId: relationship.id,
      ...profiles.evaluateRelationship(registry, snapshot.project.metamodel, {
        sourceType: elements.get(relationship.source.id).type, relationshipType: relationship.type,
        targetType: elements.get(relationship.target.id).type, scope: 'direct',
      }),
    }));
    assert.deepEqual(report.relationships, expectedRows, example.name);
    assert.ok(report.relationships.every(row => row.status === (example.endpointStatus || 'ALLOWED')), example.name);
    assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' }, example.name);
    assert.deepEqual(exportFiles(importFiles(before.files)), before.files, example.name);
    assert.deepEqual(serializeProjectFile(deserializeProjectFile(before.bytes)), before.bytes, example.name);
    assert.deepEqual(store.snapshot, before.snapshot, example.name);
    assert.equal(store.revision, before.revision, example.name);
    assert.deepEqual(store.history, before.history, example.name);
    assert.deepEqual(store.exportFiles(), before.files, example.name);
    assert.deepEqual(serializeProjectFile(snapshot), before.bytes, example.name);
    store.redo(store.revision);
    assert.equal(store.snapshot.project.name, `${example.name}: redo`, example.name);
  }
});

test('repeated drawings do not count as additional model relationships', async () => {
  const store = createStore(await fixture()), registry = createRegistry([CURRENT_PROFILE]);
  const relationship = store.snapshot.relationships[0];
  store.execute({ type: 'updateRelationshipMultiplicity', relationshipId: relationship.id,
    sourceMultiplicity: '1', targetMultiplicity: '1' }, store.revision);
  function check(expectedRelationships, expectedDrawings) {
    const snapshot = freeze(store.snapshot);
    const before = { snapshot, revision: store.revision, history: store.history, files: store.exportFiles(), bytes: serializeProjectFile(snapshot) };
    assert.equal(snapshot.relationships.length, expectedRelationships);
    assert.equal(snapshot.views.reduce((count, entry) => count + entry.connections.length, 0), expectedDrawings);
    const report = assessProject(snapshot, registry);
    assert.deepEqual(report.relationships.map(row => row.relationshipId), snapshot.relationships.map(item => item.id));
    assert.deepEqual(report.counts, { ALLOWED: expectedRelationships, FORBIDDEN: 0, UNKNOWN: 0 });
    assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
    assert.deepEqual(store.snapshot, before.snapshot);
    assert.equal(store.revision, before.revision);
    assert.deepEqual(store.history, before.history);
    assert.deepEqual(store.exportFiles(), before.files);
    assert.deepEqual(serializeProjectFile(deserializeProjectFile(before.bytes)), before.bytes);
  }
  check(1, 2);
  for (const entry of store.snapshot.views) {
    const connection = entry.connections[0];
    for (let i = 0; i < 2; i++) store.execute({ type: 'addConnection', viewId: entry.view.id, relationshipId: relationship.id,
      source: connection.source, target: connection.target }, store.revision);
  }
  check(1, 6);
  const entry = store.snapshot.views[0], connection = entry.connections[0];
  const created = store.execute({ type: 'createRelationshipAndConnection', viewId: entry.view.id,
    source: connection.source, target: connection.target,
    relationshipType: relationship.type, label: relationship.label }, store.revision).created;
  store.execute({ type: 'updateRelationshipMultiplicity', relationshipId: created.relationshipId,
    sourceMultiplicity: '1', targetMultiplicity: '1' }, store.revision);
  const second = store.snapshot.relationships.find(item => item.id === created.relationshipId);
  assert.notEqual(second.id, relationship.id);
  assert.deepEqual(second.source, relationship.source);
  assert.deepEqual(second.target, relationship.target);
  check(2, 7);
});

test('wrong-kind endpoint IDs, misplaced junction types and invalid nesting fail structurally before assessment', async () => {
  const initial = await fixture(), registry = createRegistry([CURRENT_PROFILE]);
  const cases = [];
  for (const end of ['source', 'target']) for (const kind of ['relationship', 'junction']) {
    cases.push({ name: `${end} ${kind} endpoint`, code: 'REFERENCE', change(state) {
      state.relationships[0][end] = { kind, id: state.elements[0].id };
    } });
  }
  for (const type of ['Junction', 'AndJunction', 'OrJunction']) {
    cases.push({ name: `${type} element`, code: 'TYPE', change(state) { state.elements[0].type = type; } });
    for (const key of ['sourceType', 'targetType']) {
      const result = profiles.evaluateRelationship(registry, initial.project.metamodel, {
        sourceType: 'Process', relationshipType: 'Association', targetType: 'Process', scope: 'direct', [key]: type,
      });
      assert.equal(result.status, 'UNKNOWN');
      assert.equal(result.reason, 'type-not-found');
    }
  }
  cases.push({ name: 'legacy nesting field in V4', code: 'SCHEMA', change(state) {
    state.views[0].occurrences[0].parentOccurrenceId = state.views[0].occurrences[1].id;
  } }, { name: 'wrong-kind drawing parent', code: 'REFERENCE', change(state) {
    state.views[0].occurrences[0].parent = { kind: 'occurrence', id: state.elements[0].id };
  } }, { name: 'cyclic occurrence nesting', code: 'REFERENCE', change(state) {
    const [first, second] = state.views[0].occurrences;
    first.parent = { kind: 'occurrence', id: second.id }; second.parent = { kind: 'occurrence', id: first.id };
  } });
  for (const example of cases) {
    const invalid = structuredClone(initial); example.change(invalid); freeze(invalid);
    const before = JSON.stringify(invalid);
    assert.throws(() => validateProject(invalid), { name: 'SchemkaError', code: example.code }, example.name);
    assert.throws(() => assessProject(invalid, registry), { name: 'SchemkaError', code: example.code }, example.name);
    // Even a bad registry is not reached: these are format errors, not normative FORBIDDEN.
    assert.throws(() => assessProject(invalid, null), { name: 'SchemkaError', code: example.code }, example.name);
    assert.equal(JSON.stringify(invalid), before, example.name);
  }
});

test('valid V4 drawing nesting does not change endpoint decisions or confer normative authority', async () => {
  const state = await fixture(), registry = createRegistry([CURRENT_PROFILE]), original = assessProject(state, registry);
  state.views[0].occurrences[0].parent = { kind: 'occurrence', id: state.views[0].occurrences[1].id };
  validateProject(state); const before = exportFiles(state); freeze(state);
  assert.deepEqual(assessProject(state, registry), original);
  assert.equal(original.normative.status, 'UNKNOWN'); assert.deepEqual(exportFiles(state), before);
});

test('runtime imports only relative modules without platform APIs, execution or network calls', async () => {
  const root = new URL('../src/', import.meta.url);
  for (const name of await readdir(root)) {
    const source = await readFile(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /\b(?:Buffer|process|require)\b|['"]node:|\b(?:document|window|localStorage)\s*\.|\bfetch\s*\(|\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(/, name);
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) assert.match(match[1], /^\.\.?\//, name);
  }
  assert.equal(CURRENT_PROFILE.elementTypes.length, 42);
  assert.equal(CURRENT_PROFILE.relationshipTypes.length, 15);
  assert.deepEqual(CURRENT_PROFILE.rules, []);
});
