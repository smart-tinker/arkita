import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, evaluateRelationship, getPresentation, CURRENT_PROFILE } from '../src/index.js';
import { testProfile, testQuery, testReference, synthetic } from './helpers.js';
const query = (sourceType, targetType, scope = 'direct') => ({ sourceType, relationshipType: 'Connect', targetType, scope });
const ref = { id: 'synthetic-test', version: 1 };

test('catalogue metadata alone cannot authorize source-backed composite relationship permission', () => {
  const q = { sourceType: 'Product', relationshipType: 'Association', targetType: 'DataObject', scope: 'direct' };
  const reference = { id: CURRENT_PROFILE.id, version: CURRENT_PROFILE.version };
  assert.deepEqual(evaluateRelationship(createRegistry([structuredClone(CURRENT_PROFILE)]), reference, q),
    { status: 'UNKNOWN', permissionClass: null, reason: 'rule-not-found', ruleId: null, sourceEvidence: null });
  const checked = evaluateRelationship(createRegistry([CURRENT_PROFILE]), reference, q);
  assert.equal(checked.status, 'ALLOWED'); assert.equal(checked.permissionClass, 'direct');
  assert.equal(checked.sourceEvidence.cell.letters, 'GOa');
});

test('synthetic directed decisions, absent triples and indirect scope stay distinct', () => {
  const registry = createRegistry([synthetic()]);
  assert.equal(evaluateRelationship(registry, ref, query('Alpha', 'Beta')).status, 'ALLOWED');
  assert.equal(evaluateRelationship(registry, ref, query('Beta', 'Alpha')).status, 'FORBIDDEN');
  assert.deepEqual(evaluateRelationship(registry, ref, query('Alpha', 'Gamma')), { status: 'UNKNOWN', permissionClass: null, reason: 'rule-not-found', ruleId: null, sourceEvidence: null });
  for (const scope of ['derived', 'nesting', 'inherited', '*', 'unverified', null, true, {}]) {
    assert.equal(evaluateRelationship(registry, ref, query('Alpha', 'Beta', scope)).reason, 'unsupported-scope');
  }
  const oneWay = synthetic(); oneWay.rules.pop();
  assert.equal(evaluateRelationship(createRegistry([oneWay]), ref, query('Beta', 'Alpha')).reason, 'rule-not-found');
});

test('missing or different profile identity/version never falls back', () => {
  const registry = createRegistry([CURRENT_PROFILE, synthetic()]);
  for (const reference of [null, {}, { id: ref.id }, { id: ref.id, version: '1' }, { ...ref, version: 2 }, { ...ref, id: 'Synthetic-test' }, { ...ref, id: 'missing' }, { ...ref, fallback: true }]) {
    assert.deepEqual(evaluateRelationship(registry, reference, query('Alpha', 'Beta')), { status: 'UNKNOWN', permissionClass: null, reason: 'profile-not-found', ruleId: null, sourceEvidence: null });
  }
  assert.equal(evaluateRelationship(createRegistry([]), testReference, testQuery).status, 'UNKNOWN');
});

test('missing types do not inherit behavior from similarly named or differently kinded types', () => {
  const registry = createRegistry([synthetic()]);
  for (const change of [{ sourceType: 'Missing' }, { targetType: 'Missing' }, { relationshipType: 'Missing' }, { sourceType: 'alpha' }, { sourceType: 'Connect' }, { relationshipType: 'Alpha' }]) {
    assert.equal(evaluateRelationship(registry, ref, { ...query('Alpha', 'Beta'), ...change }).reason, 'type-not-found');
  }
});

test('incomplete, extended, executable and wildcard queries are UNKNOWN without invoking accessors', () => {
  const registry = createRegistry([synthetic()]);
  let calls = 0;
  const getter = { ...query('Alpha', 'Beta'), get targetType() { calls++; return 'Beta'; } };
  const missingScope = query('Alpha', 'Beta'); delete missingScope.scope;
  for (const invalid of [null, {}, missingScope, { ...query('Alpha', 'Beta'), extra: true }, { ...query('Alpha', 'Beta'), sourceType: '*' }, getter, { ...query('Alpha', 'Beta'), targetType() { calls++; return 'Beta'; } }]) {
    assert.equal(evaluateRelationship(registry, ref, invalid).reason, 'invalid-relationship-query');
  }
  assert.equal(calls, 0);
});

test('unverified profile evidence, rule evidence or rule scope prevents either local decision', () => {
  for (const status of ['ALLOWED', 'FORBIDDEN']) {
    for (const change of [p => { p.metadata.status = 'unverified'; }, p => { p.rules[0].evidence = 'unverified'; }, p => { p.rules[0].scope = 'unverified'; }]) {
      const p = synthetic(); p.rules[0].status = status; change(p);
      const result = evaluateRelationship(createRegistry([p]), ref, query('Alpha', 'Beta'));
      assert.equal(result.status, 'UNKNOWN');
      assert.equal(result.ruleId, 'alpha-beta');
      assert.match(result.reason, /^unverified-/);
    }
  }
});

test('returned decisions are detached frozen values, with no input mutation', () => {
  const registry = createRegistry([synthetic()]);
  const relationship = query('Alpha', 'Beta');
  const before = structuredClone({ ref, relationship });
  const result = evaluateRelationship(registry, ref, relationship);
  assert.ok(Object.isFrozen(result));
  assert.throws(() => { result.status = 'FORBIDDEN'; }, TypeError);
  assert.deepEqual({ ref, relationship }, before);
});

test('known presentations use only closed original box and open-arrow adapters', () => {
  const registry = createRegistry([testProfile()]);
  assert.deepEqual(getPresentation(registry, testReference, 'element', 'FixtureNode'), {
    status: 'KNOWN', label: 'Fixture Node', adapter: 'box', shape: 'box', marker: 'none', token: 'neutral', reason: 'built-in-adapter',
  });
  assert.deepEqual(getPresentation(registry, testReference, 'relationship', 'FixtureRelation'), {
    status: 'KNOWN', label: 'Fixture Relation', adapter: 'open-arrow', shape: 'line', marker: 'open-arrow', token: 'neutral', reason: 'built-in-adapter',
  });
});

test('unknown visuals are explicitly labeled safe fallbacks, not semantic permission', () => {
  const registry = createRegistry([testProfile()]);
  for (const [kind, type] of [['element', 'Alien'], ['relationship', 'Alien'], ['element', 'FixtureRelation'], ['relationship', 'FixtureNode'], ['element', null]]) {
    const result = getPresentation(registry, testReference, kind, type);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.token, 'unknown');
    assert.equal(result.label, `Unknown ${kind}`);
    assert.equal(result.reason, 'type-not-found');
    assert.ok(Object.isFrozen(result));
  }
  for (const reference of [{ ...testReference, version: 2 }, null]) {
    assert.equal(getPresentation(registry, reference, 'element', 'FixtureNode').reason, 'profile-not-found');
  }
  let calls = 0;
  assert.equal(getPresentation(registry, testReference, 'element', { toString() { calls++; return 'FixtureNode'; } }).status, 'UNKNOWN');
  assert.equal(calls, 0);
});

test('renderability is separate from forbidden, unverified and unassessed semantics', () => {
  const p = synthetic(); p.metadata.status = 'unverified';
  const registry = createRegistry([p]);
  assert.equal(evaluateRelationship(registry, ref, query('Beta', 'Alpha')).status, 'UNKNOWN');
  assert.equal(getPresentation(registry, ref, 'relationship', 'Connect').status, 'KNOWN');
  const verified = createRegistry([synthetic()]);
  assert.equal(evaluateRelationship(verified, ref, query('Beta', 'Alpha')).status, 'FORBIDDEN');
  assert.equal(getPresentation(verified, ref, 'element', 'Beta').status, 'KNOWN');
  assert.equal(getPresentation(verified, ref, 'element', 'Gamma').status, 'KNOWN');
});

test('API rejects spoofed registry methods and unknown presentation kinds', () => {
  let calls = 0;
  const spoof = { get() { calls++; return CURRENT_PROFILE; }, list() { calls++; return [CURRENT_PROFILE]; } };
  for (const registry of [spoof, null, undefined, 1]) {
    assert.throws(() => evaluateRelationship(registry, testReference, testQuery), { code: 'PROFILE_REGISTRY' });
    assert.throws(() => getPresentation(registry, testReference, 'element', 'FixtureNode'), { code: 'PROFILE_REGISTRY' });
  }
  assert.throws(() => getPresentation(createRegistry([]), testReference, 'html', 'FixtureNode'), { code: 'PROFILE_KIND' });
  assert.equal(calls, 0);
});

test('changing input metadata after registration cannot change evidence status', () => {
  const p = testProfile(); p.metadata.status = 'unverified';
  const registry = createRegistry([p]);
  p.metadata.status = 'local';
  assert.equal(evaluateRelationship(registry, testReference, testQuery).status, 'UNKNOWN');
});
