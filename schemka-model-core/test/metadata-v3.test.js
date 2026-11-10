import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, importFiles, LIMITS, metadataRecord, normalizeProject, mergeProjectFiles, validateProject, validateProjectV2 } from '../src/index.js';
import { byteLength, canonicalJSON } from '../src/json.js';
import { metadataFixture, metadataV2State, metadataV3Fixture } from '../fixtures/metadata-compatibility.js';
import { fixtureId } from '../fixtures/relationship-project.js';

const capture = store => ({ files: store.exportFiles(), revision: store.revision, history: store.history });
const execute = (store, command) => store.execute(command, store.revision);
const owners = state => [{ kind: 'project', id: state.project.id }, ...['element', 'junction', 'relationship'].map(kind => ({ kind, id: state[`${kind}s`][0].id })), { kind: 'view', id: state.views[0].view.id }];

test('v3 defaults and every metadata owner use one atomic exact-value command with undo/redo', () => {
  const fresh = createProject(''); assert.equal(fresh.project.formatVersion, 4); assert.equal(fresh.project.documentation, ''); assert.deepEqual(fresh.project.properties, []);
  const store = createStore(importFiles(metadataFixture().files));
  for (const owner of owners(store.snapshot)) {
    const before = capture(store), expected = store.snapshot;
    const documentation = ` \r\n${owner.kind}\r<svg onload="inert"> 日本語 🧭 \ud800 `;
    const properties = Object.entries({ '': '', 'documentation': 'ordinary custom value', '  raw\r\n': ' \r\n\ud800 ', 'é': 'NFC', 'e\u0301': 'NFD', Owner: 'case A', owner: 'case B' }).map(([key, value]) => ({ key, value }));
    Object.assign(metadataRecord(expected, owner), { documentation, properties });
    const result = execute(store, { type: 'updateMetadata', owner, documentation, properties });
    assert.deepEqual(store.snapshot, expected); assert.equal(store.history.undo, before.history.undo + 1);
    if (owner.kind === 'project') assert.deepEqual(result.affectedViewIds, expected.views.map(entry => entry.view.id).sort());
    if (owner.kind === 'view') assert.deepEqual(result.affectedViewIds, [owner.id]);
    const after = capture(store); store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
    store.redo(store.revision); assert.deepEqual(store.exportFiles(), after.files);
    assert.deepEqual(exportFiles(importFiles(after.files)), after.files);
  }
});

test('v3 metadata rejects wrong owners, missing fields, malformed values and hostile keys without changing either history', () => {
  const store = createStore(importFiles(metadataV3Fixture().files));
  execute(store, { type: 'renameProject', name: 'Past' }); execute(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const before = capture(store), owner = owners(store.snapshot)[0];
  for (const command of [
    { type: 'updateMetadata', owner }, { type: 'updateMetadata', owner, documentation: '' },
    { type: 'updateMetadata', owner, documentation: null }, { type: 'updateMetadata', owner, documentation: 'x'.repeat(8193) },
    { type: 'updateMetadata', owner, properties: [['owner', 'one'], ['owner', 'two']] },
    { type: 'updateMetadata', owner, properties: { boolean: false } },
    { type: 'updateMetadata', owner, properties: JSON.parse('{"__proto__":"unsafe"}') },
    { type: 'updateMetadata', owner: { kind: 'view', id: owner.id }, documentation: 'wrong owner' },
    { type: 'updateMetadata', owner: { kind: 'occurrence', id: store.snapshot.views[0].occurrences[0].id }, documentation: 'drawing metadata' },
    { type: 'updateMetadata', owner: { ...owner, arbitrary: true }, documentation: 'extra field' },
    { type: 'updateMetadata', owner, documentation: 'x', ignored: true },
  ]) { assert.throws(() => execute(store, command)); assert.deepEqual(capture(store), before); }
  let read = false; const command = { type: 'updateMetadata', owner };
  Object.defineProperty(command, 'properties', { enumerable: true, get() { read = true; return {}; } });
  assert.throws(() => execute(store, command), { code: 'JSON_VALUE' }); assert.equal(read, false); assert.deepEqual(capture(store), before);
  assert.throws(() => store.execute({ type: 'updateMetadata', owner, documentation: 'stale' }, store.revision - 1), { code: 'REVISION' });
  assert.deepEqual(capture(store), before); store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
  for (const reference of owners(store.snapshot)) for (const field of ['documentation', 'properties']) {
    const invalid = store.snapshot; delete metadataRecord(invalid, reference)[field];
    assert.throws(() => validateProject(invalid), { code: 'SCHEMA' }, `${reference.kind}.${field}`);
  }
});

test('migration is strict and detached: forged v2 metadata never becomes a valid v3 candidate', () => {
  const source = metadataV2State(), before = structuredClone(source);
  assert.equal(validateProjectV2(source), source);
  const output = normalizeProject(source); assert.deepEqual(exportFiles(output), exportFiles(importFiles(metadataV3Fixture().files))); assert.deepEqual(source, before);
  output.elements[0].properties.find(row => row.key === 'owner').value = 'detached'; assert.deepEqual(source, before);
  for (const [kind, field] of [['project', 'documentation'], ['project', 'properties'], ['relationship', 'documentation'], ['view', 'properties']]) {
    const forged = structuredClone(source), owner = owners(forged).find(item => item.kind === kind);
    metadataRecord(forged, owner)[field] = field === 'properties' ? {} : '';
    const exact = structuredClone(forged); assert.throws(() => normalizeProject(forged), { code: 'SCHEMA' }); assert.deepEqual(forged, exact);
  }
  assert.throws(() => createStore(source), { code: 'VERSION' });
});

test('migration rejects the exact v2 file-byte boundary when required empty metadata would exceed it', () => {
  const state = metadataV2State(), relationship = state.relationships[0];
  relationship.properties = Object.fromEntries(Array.from({ length: 31 }, (_, index) => [`key${index}`, 'x'.repeat(LIMITS.string)]));
  relationship.properties.padding = '';
  const remaining = LIMITS.fileBytes - byteLength(canonicalJSON(relationship)); assert.ok(remaining > 0 && remaining <= LIMITS.string);
  relationship.properties.padding = 'x'.repeat(remaining);
  assert.equal(byteLength(canonicalJSON(relationship)), LIMITS.fileBytes); validateProjectV2(state);
  const before = structuredClone(state); assert.throws(() => normalizeProject(state), { code: 'LIMIT' }); assert.deepEqual(state, before);
});

test('migration rejects the total canonical budget after adding empty fields without cutting records', () => {
  const state = metadataV2State(), template = structuredClone(state.relationships[0]);
  template.properties = Object.fromEntries(Array.from({ length: 31 }, (_, index) => [`key${index}`, 'x'.repeat(LIMITS.string)]));
  const large = Array.from({ length: 32 }, (_, index) => ({ ...structuredClone(template), id: fixtureId('rel', 100 + index) }));
  state.relationships.push(...large);
  const total = () => {
    let sum = byteLength(canonicalJSON(state.project));
    for (const record of [...state.elements, ...state.junctions, ...state.relationships]) sum += byteLength(canonicalJSON(record));
    for (const entry of state.views) for (const record of [entry.view, ...entry.occurrences, ...entry.connections]) sum += byteLength(canonicalJSON(record));
    return sum;
  };
  // All records individually fit. Fill additional ordinary properties until the whole input is exact.
  const last = { ...structuredClone(template), id: fixtureId('rel', 999), properties: {} }; state.relationships.push(last);
  for (let i = 0; i < 64 && total() < LIMITS.totalBytes; i++) {
    last.properties[`pad${i}`] = '';
    const remaining = LIMITS.totalBytes - total(); assert.ok(remaining >= 0);
    last.properties[`pad${i}`] = 'x'.repeat(Math.min(remaining, LIMITS.string));
  }
  assert.equal(total(), LIMITS.totalBytes); validateProjectV2(state);
  assert.throws(() => normalizeProject(state), { code: 'LIMIT' });
});

test('Git normalizes v2 base and remote with v3 local before whole-record comparisons, without rewriting any input', () => {
  const base = metadataFixture().files, local = importFiles(base);
  local.project.documentation = 'Local model documentation'; local.views[0].view.properties = [{ key: 'scope', value: 'Local view' }];
  const remote = structuredClone(base), elementFile = remote.find(file => file.path.startsWith('model/elements/'));
  const element = JSON.parse(elementFile.content); element.documentation = 'Remote existing field'; elementFile.content = canonicalJSON(element);
  const inputs = [base, exportFiles(local), remote], exact = structuredClone(inputs);
  const result = mergeProjectFiles(...inputs); assert.equal(result.structuralError, null); assert.deepEqual(result.conflicts, []);
  const expected = structuredClone(local); expected.elements.find(item => item.id === element.id).documentation = element.documentation;
  assert.deepEqual(result.files, exportFiles(expected)); assert.deepEqual(inputs, exact);
  for (const kind of ['project', 'relationship', 'view']) {
    const left = importFiles(base), right = importFiles(base), owner = owners(left).find(item => item.kind === kind);
    metadataRecord(left, owner).documentation = 'left'; metadataRecord(right, owner).properties = [{ key: 'right', value: 'value' }];
    const merge = mergeProjectFiles(base, exportFiles(left), exportFiles(right));
    assert.equal(merge.files, null); assert.equal(merge.conflicts.length, 1);
  }
});
