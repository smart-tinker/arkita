import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, CURRENT_PROFILE, PROFILE_LIMITS, ProfileError } from '../src/index.js';
import { testProfile, testReference, heavyProfile, synthetic } from './helpers.js';

const rejects = (profile, code) => assert.throws(() => createRegistry([profile]), code ? { name: 'ProfileError', code } : ProfileError);

function allFrozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(allFrozen);
  }
}

test('explicit registry has exact identity and immutable detached descriptors', () => {
  const input = testProfile();
  const registry = createRegistry([input]);
  assert.ok(Object.isFrozen(registry));
  allFrozen(registry.list());
  allFrozen(CURRENT_PROFILE);
  allFrozen(PROFILE_LIMITS);
  assert.deepEqual(registry.get(testReference), testProfile());
  assert.notEqual(registry.get(testReference), input);
  assert.equal(registry.get({ id: 'synthetic-fixture', version: 2 }), undefined);
  assert.equal(registry.get({ id: 'SYNTHETIC-FIXTURE', version: 1 }), undefined);
  input.label = 'Changed later';
  input.rules[0].status = 'FORBIDDEN';
  input.elementTypes.length = 0;
  assert.equal(registry.get(testReference).label, 'Synthetic fixture');
  assert.equal(registry.get(testReference).rules[0].status, 'ALLOWED');
  assert.throws(() => registry.list().pop(), TypeError);
  assert.throws(() => { registry.get(testReference).metadata.status = 'unverified'; }, TypeError);
});

test('no implicit profile; empty registry is valid and versioned profiles remain distinct', () => {
  assert.throws(() => createRegistry(), { code: 'PROFILE_SCHEMA' });
  assert.throws(() => createRegistry({}), { code: 'PROFILE_SCHEMA' });
  const empty = createRegistry([]);
  assert.deepEqual(empty.list(), []);
  assert.equal(empty.get(testReference), undefined);
  const second = testProfile(); second.version = 2;
  const registry = createRegistry([testProfile(), second]);
  assert.equal(registry.list().length, 2);
  assert.equal(registry.get({ id: second.id, version: 2 }).version, 2);
});

test('same profile identity and version cannot shadow an earlier registration', () => {
  assert.throws(() => createRegistry([testProfile(), testProfile()]), { code: 'PROFILE_DUPLICATE' });
});

test('duplicate IDs and exact directed triples fail even for identical decisions', () => {
  const variants = [
    p => p.elementTypes.push(structuredClone(p.elementTypes[0])),
    p => p.relationshipTypes.push(structuredClone(p.relationshipTypes[0])),
    p => { p.relationshipTypes[0].id = p.elementTypes[0].id; },
    p => p.rules.push(structuredClone(p.rules[0])),
    p => p.rules.push({ ...p.rules[0], id: 'another-rule' }),
    p => p.rules.push({ ...p.rules[0], id: 'conflicting-rule', status: 'FORBIDDEN' }),
    p => p.rules.push({ ...p.rules[0], id: 'unknown-scope', scope: 'unverified' }),
  ];
  for (const change of variants) { const p = testProfile(); change(p); rejects(p, 'PROFILE_DUPLICATE'); }
});

test('dangling references and references to the wrong kind fail', () => {
  for (const [key, value] of [['sourceType', 'Missing'], ['targetType', 'Missing'], ['relationshipType', 'Missing'], ['sourceType', 'FixtureRelation'], ['relationshipType', 'FixtureNode']]) {
    const p = testProfile(); p.rules[0][key] = value; rejects(p, 'PROFILE_REFERENCE');
  }
});

test('strict field schema rejects missing and extra fields at every descriptor level', () => {
  const locations = [p => p, p => p.metadata, p => p.elementTypes[0], p => p.relationshipTypes[0], p => p.elementTypes[0].presentation, p => p.relationshipTypes[0].presentation, p => p.rules[0]];
  for (const get of locations) {
    const extra = testProfile(); get(extra).extra = true; rejects(extra, 'PROFILE_SCHEMA');
    const missing = testProfile(); delete get(missing)[Object.keys(get(missing))[0]]; rejects(missing, 'PROFILE_SCHEMA');
  }
  for (const key of ['elementTypes', 'relationshipTypes', 'rules']) { const p = testProfile(); p[key] = {}; rejects(p, 'PROFILE_SCHEMA'); }
});

test('unknown adapters, tokens, decisions, evidence, wildcard IDs and malformed versions fail', () => {
  const changes = [
    p => { p.elementTypes[0].presentation.adapter = 'svg'; },
    p => { p.elementTypes[0].presentation.adapter = 'open-arrow'; },
    p => { p.relationshipTypes[0].presentation.adapter = 'box'; },
    p => { p.relationshipTypes[0].presentation.token = 'url(https://example.invalid/image)'; },
    p => { p.elementTypes[0].presentation.path = 'M0 0L1 1'; },
    p => { p.rules[0].status = 'UNKNOWN'; },
    p => { p.rules[0].status = 'allowed'; },
    p => { p.rules[0].scope = 'derived'; },
    p => { p.rules[0].evidence = 'normative'; },
    p => { p.metadata.status = 'verified'; },
    p => { p.rules[0].sourceType = '*'; },
    p => { p.id = 'constructor'; },
    p => { p.elementTypes[0].id = 'prototype'; },
    p => { p.label = '<svg onload=alert(1)>'; },
    p => { p.metadata.source = '\nsource'; },
    p => { p.metadata.license = ''; },
    p => { p.label = ' '.repeat(4); },
  ];
  for (const change of changes) { const p = testProfile(); change(p); rejects(p); }
  for (const version of ['1', 0, -1, 1.5, NaN, Infinity, -0, null, PROFILE_LIMITS.version + 1]) {
    const p = testProfile(); p.version = version; rejects(p);
  }
});

test('functions, symbols, accessors and hidden properties are rejected without invoking getters', () => {
  let calls = 0;
  const getter = testProfile();
  Object.defineProperty(getter.metadata, 'source', { enumerable: true, get() { calls++; return 'source'; } });
  rejects(getter, 'PROFILE_DATA');
  const hidden = testProfile(); Object.defineProperty(hidden, 'hidden', { value: 'secret' }); rejects(hidden, 'PROFILE_DATA');
  const symbol = testProfile(); symbol[Symbol('extra')] = 'symbol'; rejects(symbol, 'PROFILE_DATA');
  for (const value of [() => {}, undefined, 1n, Symbol('value')]) { const p = testProfile(); p.label = value; rejects(p, 'PROFILE_DATA'); }
  const profiles = [testProfile()];
  Object.defineProperty(profiles, '0', { enumerable: true, get() { calls++; return testProfile(); } });
  assert.throws(() => createRegistry(profiles), { code: 'PROFILE_DATA' });
  assert.equal(calls, 0);
});

test('unsafe object keys, inherited data, cycles and non-plain objects fail', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const p = testProfile(); Object.defineProperty(p.metadata, key, { value: true, enumerable: true }); rejects(p, 'PROFILE_DATA');
  }
  const inherited = Object.assign(Object.create({ extra: true }), testProfile()); rejects(inherited, 'PROFILE_DATA');
  for (const value of [new Date(), new Map(), new Set(), /x/, new Uint8Array([1])]) { const p = testProfile(); p.metadata = value; rejects(p, 'PROFILE_DATA'); }
  const cyclic = testProfile(); cyclic.metadata.source = cyclic; rejects(cyclic, 'PROFILE_DATA');
  const p = testProfile(); p.metadata = Object.assign(Object.create(null), p.metadata);
  assert.equal(createRegistry([p]).get(testReference).metadata.status, 'local');
});

test('sparse, extended, inherited and hidden array entries fail', () => {
  for (const modify of [
    array => { array.length = 2; },
    array => { array.extra = true; },
    array => { Object.defineProperty(array, '0', { enumerable: false }); },
    array => { Object.setPrototypeOf(array, Object.create(Array.prototype)); },
    array => { delete array[0]; array.extra = testProfile(); },
    array => { array[Symbol('extra')] = true; },
  ]) {
    const profiles = [testProfile()]; modify(profiles); assert.throws(() => createRegistry(profiles), ProfileError);
    const p = testProfile(); modify(p.rules); rejects(p);
  }
});

test('references are exact data records and never trigger caller accessors or coercion', () => {
  const registry = createRegistry([testProfile()]);
  let calls = 0;
  const bad = { version: 1, get id() { calls++; return 'synthetic-fixture'; } };
  for (const ref of [null, undefined, {}, { id: 'synthetic-fixture' }, { ...testReference, version: '1' }, { ...testReference, extra: true }, bad, { ...testReference, toString() { calls++; return 'synthetic-fixture'; } }]) {
    assert.equal(registry.get(ref), undefined);
  }
  assert.equal(calls, 0);
});

test('profile, catalog, rule, string, key and field budgets are enforced', () => {
  assert.throws(() => createRegistry(Array.from({ length: PROFILE_LIMITS.profiles + 1 }, testProfile)), { code: 'PROFILE_LIMIT' });
  const types = testProfile(); types.elementTypes = Array.from({ length: PROFILE_LIMITS.typesPerKind + 1 }, (_, i) => ({ ...types.elementTypes[0], id: `Type${i}` })); rejects(types, 'PROFILE_LIMIT');
  const rules = testProfile(); rules.rules = Array(PROFILE_LIMITS.rules + 1).fill(rules.rules[0]); rejects(rules, 'PROFILE_LIMIT');
  const string = testProfile(); string.label = 'x'.repeat(PROFILE_LIMITS.string + 1); rejects(string, 'PROFILE_LIMIT');
  const key = testProfile(); key['k'.repeat(PROFILE_LIMITS.identifier + 1)] = 1; rejects(key, 'PROFILE_LIMIT');
  const fields = testProfile(); fields.metadata = Object.fromEntries(Array.from({ length: PROFILE_LIMITS.fields + 1 }, (_, i) => [`key${i}`, 'value'])); rejects(fields, 'PROFILE_LIMIT');
  const label = testProfile(); label.label = 'x'.repeat(PROFILE_LIMITS.label + 1); rejects(label, 'PROFILE_SCHEMA');
  const id = testProfile(); id.id = 'x'.repeat(PROFILE_LIMITS.identifier + 1); rejects(id, 'PROFILE_SCHEMA');
});

test('nesting, node, individual byte and aggregate byte budgets are enforced', () => {
  const deep = testProfile(); let cursor = deep.metadata;
  for (let i = 0; i < PROFILE_LIMITS.depth + 1; i++) { cursor.nested = {}; cursor = cursor.nested; }
  rejects(deep, 'PROFILE_LIMIT');
  const many = testProfile(); many.metadata.extra = Array(4096).fill(Array(13).fill(0)); rejects(many, 'PROFILE_LIMIT');
  rejects(heavyProfile('too-large', 64, 96), 'PROFILE_LIMIT');
  const heavy = heavyProfile();
  const size = new TextEncoder().encode(JSON.stringify(heavy)).byteLength;
  assert.ok(size < PROFILE_LIMITS.descriptorBytes);
  const number = Math.floor(PROFILE_LIMITS.registryBytes / size) + 1;
  assert.ok(number <= PROFILE_LIMITS.profiles);
  assert.throws(() => createRegistry(Array.from({ length: number }, (_, i) => ({ ...heavy, id: `large${i}` }))), { code: 'PROFILE_LIMIT' });
});

test('legitimate collection boundaries remain usable and no normative metadata fields exist', () => {
  const profiles = Array.from({ length: PROFILE_LIMITS.profiles }, (_, i) => ({ ...testProfile(), id: `profile${i}` }));
  assert.equal(createRegistry(profiles).list().length, PROFILE_LIMITS.profiles);
  const many = synthetic();
  many.elementTypes = Array.from({ length: PROFILE_LIMITS.typesPerKind }, (_, i) => ({ ...many.elementTypes[0], id: `Type${i}` }));
  many.rules = [];
  assert.equal(createRegistry([many]).list()[0].elementTypes.length, PROFILE_LIMITS.typesPerKind);
  const claim = testProfile(); claim.metadata.conformant = true; rejects(claim, 'PROFILE_SCHEMA');
});
