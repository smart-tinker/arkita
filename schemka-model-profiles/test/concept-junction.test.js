import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, exportFiles, validateProject, normalizeProject, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { CURRENT_PROFILE, createRegistry, evaluateRelationship, evaluateConceptRelationship, getVerifiedConceptDecision, assessProject, assessJunctions, getVerifiedJunctionAssessment, getVerifiedJunctionIssue } from '../src/index.js';

const endpoints = JSON.parse(readFileSync(new URL('./fixtures/concept-endpoints.json', import.meta.url)));
const graphs = JSON.parse(readFileSync(new URL('./fixtures/junction-graphs.json', import.meta.url)));
// Keep the captured v2 evidence unchanged; prepare its state through the same pure reader conversion.
for (const example of graphs.cases) example.state = normalizeProject(example.state);
const registry = createRegistry([CURRENT_PROFILE]);
const immutable = value => { if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); } return value; };
const sorted = values => [...values].sort();
const rules = {
  'same-family': 'junction-same-family', 'transit-degree': 'junction-degree',
  'minimum-distinct-relationships': 'junction-minimum-distinct', 'incoming-required': 'junction-incoming', 'outgoing-required': 'junction-outgoing',
  'terminal-permission': 'junction-terminal-permission', 'terminal-coverage': 'junction-terminal-coverage',
  'local-endpoint': 'junction-local-port', 'container-exception': 'junction-container-role',
  'multiplicity-applicability': 'junction-multiplicity-applicability', 'qualifier-compatibility': 'junction-qualifier-compatibility',
};

test('6448 independently source-reviewed concept queries preserve classifications and raw table absence', () => {
  assert.equal(endpoints.independentOracleSha256, 'b7d2d137a50a4662f16a67ef83df26f796a315758955f06f15d9e59653e21a68');
  assert.equal(endpoints.rows.length, 6448);
  const counts = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  for (const [sk, st, relationshipType, tk, tt, status, semanticRule, refs, fact] of endpoints.rows) {
    const query = immutable({ source: { kind: sk, type: st }, relationshipType, target: { kind: tk, type: tt }, scope: 'direct' });
    const name = JSON.stringify(query), result = evaluateConceptRelationship(registry, CURRENT_METAMODEL, query);
    assert.equal(result.status, status, name); assert.equal(result.permissionClass, null, name); counts[result.status]++;
    if (fact) {
      const trusted = getVerifiedConceptDecision(result); assert.equal(trusted, result, name);
      assert.equal(trusted.sourceEvidence.basis, 'concept-rule');
      assert.equal(trusted.sourceEvidence.sha256, endpoints.sourceSha256);
      assert.equal(trusted.sourceEvidence.table.pdfPage, 164);
      assert.equal(trusted.sourceEvidence.cell.letters.includes(trusted.sourceEvidence.family.tableCode), fact.b6FamilyListed, name);
      if (semanticRule === 'unresolved-junction-aggregation-family') {
        assert.equal(result.reason, 'source-scope-unresolved'); assert.ok(result.sourceEvidence.qualification);
      }
      for (const ref of refs) assert.ok(endpoints.locators[ref], ref);
      if (fact.eligibilityWitness) assert.equal(evaluateRelationship(registry, CURRENT_METAMODEL, { ...fact.eligibilityWitness, scope: 'direct' }).status, 'ALLOWED');
    } else assert.equal(getVerifiedConceptDecision(result), null);
  }
  assert.deepEqual(counts, { ALLOWED: 687, FORBIDDEN: 5293, UNKNOWN: 468 });
});

function checkOracle(example, report) {
  assert.equal(report.normative.status, example.expected.overallNormative, example.id);
  assert.equal(report.complete, true, example.id);
  if (example.expected.junctionReportStatus) assert.equal(report.status, example.expected.junctionReportStatus, example.id);
  const resolve = symbol => example.symbols[symbol].id;
  for (const expected of example.expected.checks) {
    const label = example.id + ' / ' + expected.semanticRule;
    const candidates = report.issues.filter(issue => issue.ruleId === rules[expected.semanticRule]);
    const matching = candidates.filter(issue => issue.status === expected.status && (!expected.end || issue.end === expected.end));
    assert.ok(matching.length, label);
    for (const j of expected.junctions || []) assert.ok(matching.some(issue => issue.junctionIds.includes(resolve(j))), label + ' subject ' + j);
    for (const r of expected.relationships || []) assert.ok(matching.some(issue => issue.relationshipIds.includes(resolve(r))), label + ' relationship ' + r);
    for (const [source, target] of expected.pairs || []) {
      const pair = matching.find(issue => issue.source?.id === resolve(source) && issue.target?.id === resolve(target));
      assert.ok(pair, label + ' pair ' + source + '/' + target);
      if (expected.terminalPermissionClass) assert.equal(pair.permissionClass, expected.terminalPermissionClass, label);
    }
    for (const [source, target] of expected.forbiddenSubstitutePairs || []) assert.ok(!candidates.some(issue => issue.source?.id === resolve(source) && issue.target?.id === resolve(target)), label);
    for (const source of expected.excludedTerminalSources || []) assert.ok(!candidates.some(issue => issue.source?.id === resolve(source)), label);
    if (expected.uniquePairCount !== undefined) assert.equal(candidates.length, expected.uniquePairCount, label);
    if (expected.reasonClass) assert.ok(matching.some(issue => issue.reason === expected.reasonClass), label);
    if (expected.family) assert.ok(matching.some(issue => issue.families?.includes(expected.family)), label);
    if (expected.families) assert.deepEqual(sorted(matching[0].families), sorted(expected.families), label);
    for (const j of expected.junctions || []) {
      const issue = matching.find(row => row.junctionIds.includes(resolve(j)));
      if (expected.distinct !== undefined) assert.equal(issue.degree?.distinct ?? issue.count, expected.distinct, label);
      if (expected.distinctPerJunction !== undefined) assert.equal(issue.degree.distinct, expected.distinctPerJunction, label);
      if (expected.incoming !== undefined) assert.equal(issue.degree.incoming, expected.incoming, label);
      if (expected.outgoing !== undefined) assert.equal(issue.degree.outgoing, expected.outgoing, label);
      if (expected.missing === 'incoming-terminal' || expected.missing === 'both-terminals') assert.equal(issue.incomingTerminal, false, label);
      if (expected.missing === 'outgoing-terminal' || expected.missing === 'both-terminals') assert.equal(issue.outgoingTerminal, false, label);
    }
  }
}

test('38 independently specified native graphs pass all 89 scoped checks without mutation or view dependence', () => {
  assert.equal(graphs.independentOracleSha256, 'b33a40474486157102c6659b987bdea2b72beda46c5392eaf814790396984243');
  assert.equal(graphs.cases.length, 38);
  assert.equal(graphs.cases.reduce((n, c) => n + c.expected.checks.length, 0), 89);
  for (const example of graphs.cases) {
    const state = immutable(structuredClone(example.state)); validateProject(state);
    const files = exportFiles(state), bytes = serializeProjectFile(state);
    const report = assessJunctions(state, registry); checkOracle(example, report);
    assert.equal(getVerifiedJunctionAssessment(report), report);
    for (const issue of report.issues) { assert.equal(getVerifiedJunctionIssue(issue), issue); assert.ok(Object.isFrozen(issue)); }
    const permutation = structuredClone(state); permutation.elements.reverse(); permutation.junctions.reverse(); permutation.relationships.reverse();
    assert.deepEqual(assessJunctions(permutation, registry), report, example.id + ' collection-order independence');
    assert.deepEqual(assessJunctions(deserializeProjectFile(bytes), registry), report, example.id + ' native roundtrip');
    assert.deepEqual(exportFiles(state), files); assert.deepEqual(serializeProjectFile(state), bytes);
    const store = createStore(state); store.execute({ type: 'renameProject', name: 'Redo preserved' }, store.revision); store.undo(store.revision);
    const before = { files: store.exportFiles(), revision: store.revision, history: store.history };
    assert.deepEqual(assessProject(store.snapshot, registry).junctionAssessment, report);
    assert.deepEqual({ files: store.exportFiles(), revision: store.revision, history: store.history }, before);
  }
});

test('analysis exhaustion remains incomplete UNKNOWN and retains definite failures', () => {
  const valid = graphs.cases.find(c => c.id === 'many-in-many-out').state;
  for (const workLimit of [0, 1, 3]) {
    const report = assessJunctions(valid, registry, { workLimit });
    assert.equal(report.complete, false); assert.equal(report.status, 'UNKNOWN');
    assert.ok(report.issues.some(i => i.reason === 'analysis-limit'));
    assert.equal(Object.hasOwn(report.work, 'unevaluatedPairs'), false);
  }
  const invalid = graphs.cases.find(c => c.id === 'mixed-base-families').state;
  const report = assessJunctions(invalid, registry, { workLimit: 0 });
  assert.equal(report.complete, false); assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some(i => i.ruleId === 'junction-same-family' && i.status === 'FAIL'));
  const terminalFailure = assessJunctions(graphs.cases.find(c => c.id === 'valid-local-ports-invalid-terminal').state, registry, { workLimit: 2 });
  assert.equal(terminalFailure.complete, false); assert.equal(terminalFailure.status, 'FAIL');
  assert.ok(terminalFailure.issues.some(i => i.ruleId === 'junction-terminal-permission' && i.status === 'FAIL'));
  for (const options of [null, { workLimit: -1 }, { workLimit: 1.5 }, { workLimit: 500001 }, { extra: true }]) assert.throws(() => assessJunctions(valid, registry, options));
});

test('2520 oriented element/junction port checks follow independent B.5 eligibility facts and the B.6 footnote', () => {
  const matrix = JSON.parse(readFileSync(new URL('./fixtures/endpoint-cells.json', import.meta.url)));
  const families = { Composition: 'g', Aggregation: 'g', Assignment: 'i', Realization: 'r', Serving: 'v', Access: 'a', ReadAccess: 'a', WriteAccess: 'a', ReadWriteAccess: 'a', Influence: 'n', Association: 'o', DirectedAssociation: 'o', Triggering: 't', Flow: 'f', Specialization: 's' };
  let count = 0;
  for (const element of CURRENT_PROFILE.elementTypes) for (const junction of CURRENT_PROFILE.junctionTypes) for (const [type, letter] of Object.entries(families)) for (const role of ['source', 'target']) {
    const eligible = matrix.cells.some(cell => cell[role] === element.id && cell.letters.toLowerCase().includes(letter));
    const expected = letter === 'g' ? 'UNKNOWN' : letter === 's' ? 'FORBIDDEN' : eligible || (role === 'source' && element.id === 'Grouping') ? 'ALLOWED' : 'FORBIDDEN';
    const e = { kind: 'element', type: element.id }, j = { kind: 'junction', type: junction.id };
    const result = evaluateConceptRelationship(registry, CURRENT_METAMODEL, { source: role === 'source' ? e : j, relationshipType: type, target: role === 'target' ? e : j, scope: 'direct' });
    assert.equal(result.status, expected, [element.id, type, junction.id, role].join('/')); count++;
  }
  assert.equal(count, 2520);
});

test('model graph diagnostics ignore repeated, duplicated and removed view drawings', () => {
  const store = createStore(conceptProject()), before = assessJunctions(store.snapshot, registry);
  store.execute({ type: 'duplicateView', viewId: store.snapshot.views[0].view.id, name: 'More drawings' }, store.revision);
  assert.deepEqual(assessJunctions(store.snapshot, registry), before);
  const view = store.snapshot.views[0], connection = view.connections[0];
  store.execute({ type: 'removeConnection', viewId: view.view.id, connectionId: connection.id }, store.revision);
  assert.deepEqual(assessJunctions(store.snapshot, registry), before);
  const withoutViews = store.snapshot; withoutViews.views = [];
  assert.deepEqual(assessJunctions(withoutViews, registry), before);
  store.undo(store.revision); store.undo(store.revision);
  assert.deepEqual(assessJunctions(store.snapshot, registry), before);
});

test('original identity alone grants new concept and graph authority; forged copies and getters cannot spoof it', () => {
  const query = { source: { kind: 'element', type: 'Grouping' }, relationshipType: 'Composition', target: { kind: 'relationship', type: 'Flow' }, scope: 'direct' };
  const decision = evaluateConceptRelationship(registry, CURRENT_METAMODEL, query);
  const graph = graphs.cases[0].state, report = assessJunctions(graph, registry), issue = report.issues[0];
  let calls = 0;
  for (const [recognize, original] of [[getVerifiedConceptDecision, decision], [getVerifiedJunctionAssessment, report], [getVerifiedJunctionIssue, issue]]) {
    assert.equal(recognize(original), original);
    for (const fake of [structuredClone(original), { ...original }, new Proxy(original, { get() { calls++; throw Error('read'); } }), { get status() { calls++; return 'ALLOWED'; } }, null, undefined, 1, 'ALLOWED']) assert.equal(recognize(fake), null);
  }
  assert.equal(calls, 0);
  for (const descriptor of [structuredClone(CURRENT_PROFILE), registry.get(CURRENT_METAMODEL), ...registry.list()]) {
    const copied = createRegistry([descriptor]);
    const result = evaluateConceptRelationship(copied, CURRENT_METAMODEL, query);
    assert.equal(result.status, 'UNKNOWN'); assert.equal(getVerifiedConceptDecision(result), null);
    const graphResult = assessJunctions(graph, copied);
    assert.equal(graphResult.status, 'UNKNOWN'); assert.equal(getVerifiedJunctionAssessment(graphResult), null);
    assert.deepEqual(graphResult.issues, []);
  }
  const getter = { ...query, get source() { calls++; return query.source; } };
  assert.equal(evaluateConceptRelationship(registry, CURRENT_METAMODEL, getter).status, 'UNKNOWN'); assert.equal(calls, 0);
});

test('mixed aggregation/composition does not derive junction type equivalence from shared permission code', () => {
  const state = structuredClone(graphs.cases.find(c => c.id === 'one-in-one-out-is-two').state);
  state.relationships[0].type = 'Aggregation'; state.relationships[1].type = 'Composition';
  const report = assessJunctions(state, registry);
  assert.equal(report.issues.find(i => i.ruleId === 'junction-same-family').status, 'UNKNOWN');
});

test('assessments detach every report object without freezing or changing mutable caller descriptors', () => {
  const objects = root => {
    const found = new Set(), pending = [root];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== 'object' || found.has(value)) continue;
      found.add(value); pending.push(...Object.values(value));
    }
    return found;
  };
  const cases = [...graphs.cases, { id: 'all-endpoint-kinds-and-cyclic-drawings', state: conceptProject() }];
  for (const example of cases) for (const assess of [assessJunctions, assessProject, state => assessJunctions(state, registry, { workLimit: 2 })]) {
    const state = structuredClone(example.state), before = structuredClone(state);
    const callerObjects = objects(state);
    const attributes = [...callerObjects].map(value => ({
      value, descriptors: Object.getOwnPropertyDescriptors(value), frozen: Object.isFrozen(value),
      sealed: Object.isSealed(value), extensible: Object.isExtensible(value),
    }));
    const report = assess(state, registry);
    assert.deepEqual(state, before, example.id);
    for (const prior of attributes) {
      assert.deepEqual(Object.getOwnPropertyDescriptors(prior.value), prior.descriptors, example.id);
      assert.equal(Object.isFrozen(prior.value), prior.frozen, example.id);
      assert.equal(Object.isSealed(prior.value), prior.sealed, example.id);
      assert.equal(Object.isExtensible(prior.value), prior.extensible, example.id);
    }
    for (const value of objects(report)) assert.ok(!callerObjects.has(value), example.id + ': report aliases caller data');
    for (const relationship of state.relationships) {
      relationship.source.id = relationship.source.id;
      relationship.target.id = relationship.target.id;
    }
  }
});
