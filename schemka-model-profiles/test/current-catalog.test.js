import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CURRENT_METAMODEL, CURRENT_CATALOG, createProject, exportFiles, LIMITS } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { CURRENT_PROFILE, createRegistry, evaluateRelationship, assessProject, getPresentation, getVerifiedRelationshipDecision, getVerifiedRelationshipCoverage } from '../src/index.js';

import { expectedEndpoint, endpointFixture } from './endpoint-fixture.js';

test('current descriptor exactly matches membership and keeps source authority outside local rule data', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  assert.deepEqual(CURRENT_PROFILE.elementTypes.map(item => item.id), CURRENT_CATALOG.elementTypes);
  assert.deepEqual(CURRENT_PROFILE.relationshipTypes.map(item => item.id), CURRENT_CATALOG.relationshipTypes);
  assert.deepEqual(CURRENT_PROFILE.rules, []);
  assert.equal(registry.list().length, 1);
  for (const [kind, types] of [['element', CURRENT_CATALOG.elementTypes], ['relationship', CURRENT_CATALOG.relationshipTypes]]) {
    for (const type of types) {
      const presentation = getPresentation(registry, CURRENT_METAMODEL, kind, type);
      assert.equal(presentation.status, 'KNOWN'); assert.equal(presentation.token, 'neutral');
      assert.equal(presentation.adapter, kind === 'element' ? 'box' : 'open-arrow');
      assert.ok(Object.isFrozen(presentation));
    }
  }
});

test('all 26460 ordered triples have exactly 4443 direct, 2935 derived, 19074 forbidden and 8 unknown results', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  const base = createProject('Exhaustive current catalogue');
  base.elements = CURRENT_CATALOG.elementTypes.map((type, index) => ({ id: fixtureId('el', index + 1), type, name: '', documentation: '', properties: [] }));
  const totals = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  let total = 0, verifiedDirect = 0, verifiedDerived = 0, batch = [], expectedResults = [];
  function flush() {
    const state = { ...base, relationships: batch };
    const before = exportFiles(state);
    assert.ok(before.length <= LIMITS.files);
    const report = assessProject(state, registry);
    const expectedCounts = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
    for (const item of expectedResults) expectedCounts[item.status]++;
    assert.deepEqual(report.counts, expectedCounts);
    assert.equal(report.localStatus, expectedCounts.FORBIDDEN ? 'FORBIDDEN' : expectedCounts.UNKNOWN ? 'UNKNOWN' : 'ALLOWED');
    assert.equal(report.verifiedDirect, expectedResults.filter(item => item.permissionClass === 'direct').length);
    assert.equal(report.verifiedDerived, expectedResults.filter(item => item.permissionClass === 'derived').length);
    assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
    assert.deepEqual(report.relationships, expectedResults);
    for (const result of report.relationships) {
      assert.equal(getVerifiedRelationshipDecision(result) !== null, Boolean(result.sourceEvidence));
      assert.equal(report.normative.status, 'UNKNOWN');
    }
    assert.deepEqual(exportFiles(state), before); batch = []; expectedResults = [];
  }
  for (const source of base.elements) for (const relationshipType of CURRENT_CATALOG.relationshipTypes) for (const target of base.elements) {
    const expected = expectedEndpoint(source.type, relationshipType, target.type);
    const result = evaluateRelationship(registry, CURRENT_METAMODEL, {
      sourceType: source.type, relationshipType, targetType: target.type, scope: 'direct',
    });
    assert.deepEqual(result, expected);
    assert.equal(getVerifiedRelationshipDecision(result) !== null, Boolean(expected.sourceEvidence));
    totals[result.status]++;
    if (result.permissionClass === 'direct') verifiedDirect++;
    if (result.permissionClass === 'derived') verifiedDerived++;
    const relationshipId = fixtureId('rel', ++total);
    expectedResults.push({ relationshipId, ...result });
    batch.push({ id: relationshipId, type: relationshipType, source: { kind: 'element', id: source.id }, target: { kind: 'element', id: target.id }, label: '', documentation: '', properties: [] });
    if (batch.length === 1800) flush();
  }
  if (batch.length) flush();
  assert.equal(total, 26460); assert.equal(LIMITS.files, 8192);
  assert.deepEqual(totals, { ALLOWED: 7378, FORBIDDEN: 19074, UNKNOWN: 8 });
  assert.equal(verifiedDirect, 4443); assert.equal(verifiedDerived, 2935);
});

test('verified coverage is deeply frozen and counted from actual checked pairs and relationship IDs', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  const coverage = getVerifiedRelationshipCoverage(registry, CURRENT_METAMODEL);
  const sources = new Set(endpointFixture.cells.map(cell => cell.source));
  const targets = new Set(endpointFixture.cells.map(cell => cell.target));
  const pairCount = new Set(endpointFixture.cells.map(cell => JSON.stringify([cell.source, cell.target]))).size;
  assert.deepEqual(coverage, {
    sourceTypeIds: CURRENT_CATALOG.elementTypes.filter(type => sources.has(type)),
    targetTypeIds: CURRENT_CATALOG.elementTypes.filter(type => targets.has(type)),
    relationshipTypeIds: CURRENT_CATALOG.relationshipTypes,
    excludedTypeIds: CURRENT_CATALOG.elementTypes.filter(type => !sources.has(type) && !targets.has(type)),
    verifiedPairCount: pairCount, reviewedTripleCount: 26460, verifiedTripleCount: 26452, sourceUnresolvedTripleCount: 8, unknownTripleCount: 8, totalTripleCount: 26460,
  });
  assert.equal(pairCount, 1764); assert.equal(coverage.sourceTypeIds.length, 42); assert.equal(coverage.targetTypeIds.length, 42);
  assert.deepEqual(coverage.excludedTypeIds, []);
  let checked = 0;
  for (const sourceType of CURRENT_CATALOG.elementTypes) for (const relationshipType of coverage.relationshipTypeIds) for (const targetType of CURRENT_CATALOG.elementTypes) {
    const result = evaluateRelationship(registry, CURRENT_METAMODEL, { sourceType, relationshipType, targetType, scope: 'direct' });
    if (getVerifiedRelationshipDecision(result) && result.status !== 'UNKNOWN') checked++;
  }
  assert.equal(checked, coverage.verifiedTripleCount);
  assert.equal(coverage.unknownTripleCount, coverage.totalTripleCount - checked);
  assert.ok(Object.isFrozen(coverage));
  for (const key of ['sourceTypeIds', 'targetTypeIds', 'relationshipTypeIds', 'excludedTypeIds']) {
    assert.ok(Object.isFrozen(coverage[key])); assert.throws(() => coverage[key].push('Forged'), TypeError);
  }
  assert.throws(() => { coverage.verifiedPairCount = 1; }, TypeError);
  assert.equal(getVerifiedRelationshipCoverage(registry, { ...CURRENT_METAMODEL }), coverage);
  assert.equal(getVerifiedRelationshipDecision(coverage), null);
});

test('coverage lookup requires original profile authority and exact inert references, without reading spoofed registry methods', () => {
  const registry = createRegistry([CURRENT_PROFILE]);
  const local = structuredClone(CURRENT_PROFILE);
  local.rules = [{ id: 'local-test-rule', sourceType: 'ApplicationComponent', relationshipType: 'Access', targetType: 'DataObject', scope: 'direct', status: 'ALLOWED', evidence: 'local' }];
  for (const descriptor of [structuredClone(CURRENT_PROFILE), { ...CURRENT_PROFILE }, registry.get(CURRENT_METAMODEL), ...registry.list(), local]) {
    assert.equal(getVerifiedRelationshipCoverage(createRegistry([descriptor]), CURRENT_METAMODEL), null);
  }
  assert.equal(getVerifiedRelationshipCoverage(createRegistry([]), CURRENT_METAMODEL), null);
  let calls = 0;
  const getter = { version: 1, get id() { calls++; return CURRENT_METAMODEL.id; } };
  for (const reference of [null, {}, CURRENT_PROFILE, { ...CURRENT_METAMODEL, version: 1 }, { ...CURRENT_METAMODEL, id: 'missing' }, { ...CURRENT_METAMODEL, verifiedPairCount: 1764 }, getter]) {
    assert.equal(getVerifiedRelationshipCoverage(registry, reference), null);
  }
  const forged = { get() { calls++; return CURRENT_PROFILE; }, list() { calls++; return [CURRENT_PROFILE]; } };
  for (const value of [forged, null, undefined, 0]) assert.throws(() => getVerifiedRelationshipCoverage(value, CURRENT_METAMODEL), { code: 'PROFILE_REGISTRY' });
  assert.equal(calls, 0);
});


test('all 21660 previous decisions and 1444 source locators retain their exact baseline hashes without a duplicate fixture', () => {
  const added = new Set(['Grouping', 'Location', 'Product', 'Plateau']);
  const cells = endpointFixture.cells.filter(cell => !added.has(cell.source) && !added.has(cell.target))
    .sort((a, b) => `${a.source}/${a.target}`.localeCompare(`${b.source}/${b.target}`));
  assert.equal(cells.length, 1444);
  assert.equal(createHash('sha256').update(JSON.stringify(cells)).digest('hex'), 'e3c1dc191e41fe7eeb9c1873286f82acabc19d0907cdccd74461f6d948791b3c');
  const registry = createRegistry([CURRENT_PROFILE]), hash = createHash('sha256');
  const counts = { direct: 0, derived: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  for (const cell of cells) for (const relationshipType of CURRENT_CATALOG.relationshipTypes) {
    const result = evaluateRelationship(registry, CURRENT_METAMODEL, { sourceType: cell.source, relationshipType, targetType: cell.target, scope: 'direct' });
    hash.update(JSON.stringify(result) + '\n'); counts[result.permissionClass ?? result.status]++;
  }
  assert.equal(hash.digest('hex'), 'e20e37932698b58b077d200b3370165f14513b6a60601b6cf151d843ae9e6bf5');
  assert.deepEqual(counts, { direct: 3506, derived: 1965, FORBIDDEN: 16189, UNKNOWN: 0 });
});
