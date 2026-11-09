import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CURRENT_CATALOG, CURRENT_METAMODEL, FORMAT_VERSION, createProject, createStore,
  exportFiles, importFiles, readProjectFiles,
} from '../schemka-model-core/src/index.js';
import {
  PROJECT_FILE_VERSION, serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid,
} from '../schemka-model-io/src/index.js';
import {
  CURRENT_PROFILE, createRegistry, evaluateConceptRelationship, assessProject, assessJunctions,
  getVerifiedConceptDecision, getVerifiedJunctionAssessment, getVerifiedJunctionIssue,
} from '../schemka-model-profiles/src/index.js';

import { metadataFixture, metadataV3Fixture } from '../schemka-model-core/fixtures/metadata-compatibility.js';

const capture = store => ({ state: store.snapshot, revision: store.revision, history: store.history, files: store.exportFiles() });
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const text = bytes => new TextDecoder().decode(bytes);
const occurrence = id => ({ kind: 'occurrence', id });
const registry = createRegistry([CURRENT_PROFILE]);
function fixture() {
  const store = createStore(createProject('Synthetic current v4 platform fixture'));
  const execute = command => store.execute(command, store.revision).created;
  const { viewId } = execute({ type: 'createView', name: 'Concepts and anchors' });
  const first = execute({ type: 'createElementAndOccurrence', viewId, elementType: 'Function', name: 'Source', bounds: { x: 0, y: 0, width: 120, height: 60 } });
  const last = execute({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Target', bounds: { x: 400, y: 0, width: 120, height: 60 } });
  const junction = execute({ type: 'createJunctionAndOccurrence', viewId, junctionType: 'AndJunction', name: 'Join', bounds: { x: 250, y: 20, width: 20, height: 20 } });
  const host = execute({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Realization', label: 'Incoming', source: occurrence(first.occurrenceId), target: occurrence(junction.occurrenceId) });
  execute({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Realization', label: 'Outgoing', source: occurrence(junction.occurrenceId), target: occurrence(last.occurrenceId) });
  execute({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association', label: 'Relationship endpoint', source: occurrence(first.occurrenceId), target: { kind: 'connection', id: host.connectionId, insertAnchor: { index: 0, point: { x: 200, y: 30 } } } });
  return { store, viewId, first, last, junction, host };
}

test('Current platform writes native v4/profile2 while published v2 evidence keeps its original identity', () => {
  const coverage = read('docs/ARCHIMATE-COVERAGE.json'), caps = read('platform/capabilities.json');
  assert.equal(FORMAT_VERSION, 4);
  assert.equal(PROJECT_FILE_VERSION, 1);
  assert.deepEqual(CURRENT_METAMODEL, { id: 'schemka-archimate4', version: 2 });
  assert.equal(CURRENT_CATALOG.elementTypes.length, 42);
  assert.equal(CURRENT_CATALOG.relationshipTypes.length, 15);
  assert.deepEqual(CURRENT_CATALOG.junctionTypes, ['AndJunction', 'OrJunction']);
  assert.ok(CURRENT_CATALOG.junctionTypes.every(id => !CURRENT_CATALOG.elementTypes.includes(id)));
  // Coverage evidence retains its published V2 baseline; capabilities are live.
  assert.equal(coverage.baseline.core_format_version, 2);
  assert.equal(caps.archimate.coreFormatVersion, FORMAT_VERSION);
  assert.equal(coverage.baseline.transport_envelope_version, PROJECT_FILE_VERSION);
  assert.equal(coverage.baseline.junction_count, 2);
  assert.equal(coverage.rows.length, 57); // Original B.5 element/relationship rows only.
  assert.equal(coverage.features.junctions.element_matrix_members, false);
  assert.equal(caps.archimate.profile, `${CURRENT_METAMODEL.id}@${CURRENT_METAMODEL.version}`);
  assert.equal(caps.archimate.legacyReader, true);
  assert.equal(caps.archimate.migrationConverter, true);
});

test('Envelope1 carries canonical core4/profile2, preserving typed concepts and anchors', () => {
  const { store } = fixture(), state = store.snapshot, before = store.exportFiles();
  const bytes = serializeProjectFile(state), envelope = JSON.parse(text(bytes));
  assert.equal(envelope.formatVersion, 1);
  const project = JSON.parse(envelope.files.find(file => file.path === 'schemka.json').content);
  assert.equal(project.formatVersion, 4);
  assert.deepEqual(project.metamodel, CURRENT_METAMODEL);
  assert.ok(Array.isArray(project.properties));
  assert.ok(envelope.files.some(file => file.path.startsWith('model/junctions/')));
  assert.equal(state.views[0].occurrences.filter(item => item.concept.kind === 'junction').length, 1);
  assert.equal(state.views[0].connections.filter(item => item.target.kind === 'connection').length, 1);
  assert.equal(state.views[0].connections.flatMap(item => item.routePoints).filter(item => item.kind === 'anchor').length, 1);
  assert.deepEqual(exportFiles(deserializeProjectFile(bytes)), exportFiles(state));
  assert.deepEqual(serializeProjectFile(deserializeProjectFile(bytes)), bytes);
  assert.deepEqual(exportFiles(importFiles([...exportFiles(state)].reverse())), exportFiles(state));
  assert.deepEqual(store.exportFiles(), before);
});

test('Unsupported identities and malformed version hybrids fail without replacing session or history', () => {
  const { store } = fixture();
  store.execute({ type: 'renameProject', name: 'Redo checkpoint' }, store.revision);
  store.undo(store.revision);
  const before = capture(store), envelope = JSON.parse(text(serializeProjectFile(store.snapshot)));
  const cases = [];
  function header(source, coreVersion, profileVersion, code) {
    const candidate = structuredClone(source), file = candidate.files.find(item => item.path === 'schemka.json');
    const project = JSON.parse(file.content); project.formatVersion = coreVersion; project.metamodel.version = profileVersion; file.content = JSON.stringify(project);
    cases.push({ name: `inner ${coreVersion}/profile ${profileVersion}`, candidate, code });
  }
  for (const [core, profile] of [[1, 1], [1, 2], [5, 2], [4, 1]]) header(envelope, core, profile, 'VERSION');
  // Supported reader versions do not make V4 records valid V2/V3 schemas.
  for (const core of [2, 3]) header(envelope, core, 2, 'SCHEMA');
  for (const [version, legacy] of [[2, metadataFixture()], [3, metadataV3Fixture()]]) {
    header(JSON.parse(text(legacy.bytes)), version, 1, 'VERSION');
    const candidate = JSON.parse(text(legacy.bytes)), file = candidate.files.find(item => item.path === 'schemka.json'), project = JSON.parse(file.content);
    project.unknownMetadata = ''; file.content = JSON.stringify(project); cases.push({ name: `closed legacy v${version} schema`, candidate, code: 'SCHEMA' });
  }
  const mapHybrid = structuredClone(envelope), mapFile = mapHybrid.files.find(item => item.path === 'schemka.json'), mapProject = JSON.parse(mapFile.content);
  mapProject.properties = {}; mapFile.content = JSON.stringify(mapProject); cases.push({ name: 'V4 header with legacy property map', candidate: mapHybrid, code: 'SCHEMA' });
  cases.push({ name: 'unsupported transport envelope', candidate: { ...envelope, formatVersion: 2 }, code: 'FILE_VERSION' });
  for (const { name, candidate, code } of cases) {
    assert.throws(() => loadProjectFile(store, JSON.stringify(candidate), store.revision), { code }, name);
    assert.deepEqual(capture(store), before, name);
  }
});

test('Captured native v2/v3 bytes migrate through the platform IO boundary without changing their source', () => {
  for (const [version, legacy] of [[2, metadataFixture()], [3, metadataV3Fixture()]]) {
    const original = structuredClone(legacy), project = JSON.parse(legacy.files.find(file => file.path === 'schemka.json').content);
    assert.equal(project.formatVersion, version); assert.deepEqual(project.metamodel, CURRENT_METAMODEL);
    const read = readProjectFiles(legacy.files), migrated = deserializeProjectFile(legacy.bytes);
    assert.equal(read.sourceVersion, version); assert.equal(migrated.project.formatVersion, 4); assert.equal(migrated.project.id, project.id);
    assert.deepEqual(exportFiles(migrated), exportFiles(read.state));
    for (const file of legacy.files.filter(item => item.path.startsWith('model/elements/'))) {
      const old = JSON.parse(file.content), current = migrated.elements.find(item => item.id === old.id);
      assert.equal(current.documentation, old.documentation);
      assert.deepEqual(current.properties, Object.entries(old.properties).map(([key, value]) => ({ key, value })));
    }
    const { store } = fixture(); store.execute({ type: 'renameProject', name: 'Redo retained on stale load' }, store.revision); store.undo(store.revision);
    const before = capture(store);
    assert.throws(() => loadProjectFile(store, legacy.bytes, store.revision - 1), { code: 'REVISION' }); assert.deepEqual(capture(store), before);
    loadProjectFile(store, legacy.bytes, store.revision); assert.equal(store.revision, before.revision + 1); assert.deepEqual(store.history, { undo: 0, redo: 0 }); assert.deepEqual(store.exportFiles(), exportFiles(migrated));
    const written = serializeProjectFile(store.snapshot), current = JSON.parse(text(written));
    assert.equal(current.formatVersion, 1); assert.equal(JSON.parse(current.files.find(file => file.path === 'schemka.json').content).formatVersion, 4);
    assert.deepEqual(serializeProjectFile(deserializeProjectFile(written)), written); assert.deepEqual(legacy, original);
  }
});

test('Typed view mapping and anchor ownership are validated across the native IO boundary', () => {
  const { store } = fixture(), state = store.snapshot;
  const host = state.views[0].connections.find(item => item.routePoints.some(point => point.kind === 'anchor'));
  const dependent = state.views[0].connections.find(item => item.target.kind === 'connection');
  const other = state.views[0].connections.find(item => item.id !== host.id && item.id !== dependent.id);
  const wrongHost = structuredClone(state);
  wrongHost.views[0].connections.find(item => item.id === dependent.id).target.id = other.id;
  assert.throws(() => serializeProjectFile(wrongHost), { code: 'REFERENCE' });
  const wrongConcept = structuredClone(state);
  wrongConcept.views[0].occurrences[0].concept.kind = 'junction';
  assert.throws(() => serializeProjectFile(wrongConcept), { code: 'REFERENCE' });
  const extra = structuredClone(state); extra.relationships[0].verified = true;
  assert.throws(() => serializeProjectFile(extra), { code: 'SCHEMA' });
});

test('Selected-view Mermaid refuses unsupported concept/anchor semantics without flattening or mutating', () => {
  const { store, viewId } = fixture(), before = store.exportFiles();
  assert.throws(() => exportMermaid(store.snapshot, viewId), { code: 'MERMAID_UNSUPPORTED' });
  assert.deepEqual(store.exportFiles(), before);
  const { viewId: emptyView } = store.execute({ type: 'createView', name: 'Ordinary empty view' }, store.revision).created;
  assert.match(exportMermaid(store.snapshot, emptyView), /^flowchart LR\n/);
});

test('Concept/junction source scope is separate, identity-authorized and never whole-model conformance', () => {
  const facts = read('docs/CONCEPT-ENDPOINTS.json'), boundaries = read('docs/INSTANCE-BOUNDARIES.json');
  assert.equal(facts.source.sha256, 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093');
  assert.deepEqual(facts.table_interpretation, { source: 'column', target: 'row', basis: 'concept-rule', permission_class: null,
    code_encoding: 'normalized-family-set-no-direct-derived-case-semantics', qualification: facts.table_interpretation.qualification });
  assert.equal(facts.independent_oracle.endpoint_fixture_sha256, 'b7d2d137a50a4662f16a67ef83df26f796a315758955f06f15d9e59653e21a68');
  assert.equal(facts.independent_oracle.graph_fixture_sha256, 'b33a40474486157102c6659b987bdea2b72beda46c5392eaf814790396984243');
  assert.equal(facts.ordinary_element_regression.reviewed_triples, 26460);
  assert.equal(facts.ordinary_element_regression.unknown, 8);
  assert.equal(boundaries.preserved_contract.ordinary_element_endpoint_decision_changes, false);
  for (const relationshipType of ['Aggregation', 'Composition']) for (const [source, target] of [
    [{ kind: 'junction', type: 'AndJunction' }, { kind: 'relationship', type: 'Flow' }],
    [{ kind: 'relationship', type: 'Flow' }, { kind: 'junction', type: 'OrJunction' }],
  ]) {
    const decision = evaluateConceptRelationship(registry, CURRENT_METAMODEL, { source, relationshipType, target, scope: 'direct' });
    assert.equal(decision.status, 'UNKNOWN');
    assert.equal(decision.reason, 'source-scope-unresolved');
    assert.equal(decision.permissionClass, null);
    assert.equal(decision.sourceEvidence.basis, 'concept-rule');
    assert.equal(getVerifiedConceptDecision(decision), decision);
    assert.equal(getVerifiedConceptDecision(structuredClone(decision)), null);
  }
  const { store } = fixture(), before = store.exportFiles();
  const report = assessProject(store.snapshot, registry), graph = assessJunctions(store.snapshot, registry);
  assert.equal(report.normative.status, 'UNKNOWN');
  assert.equal(graph.normative.status, 'UNKNOWN');
  assert.equal(getVerifiedJunctionAssessment(graph), graph);
  assert.equal(getVerifiedJunctionAssessment(structuredClone(graph)), null);
  assert.ok(graph.issues.length > 0);
  assert.equal(getVerifiedJunctionIssue(graph.issues[0]), graph.issues[0]);
  assert.equal(getVerifiedJunctionIssue(structuredClone(graph.issues[0])), null);
  assert.equal(assessJunctions(store.snapshot, createRegistry([structuredClone(CURRENT_PROFILE)])).status, 'UNKNOWN');
  assert.deepEqual(store.exportFiles(), before);
});
