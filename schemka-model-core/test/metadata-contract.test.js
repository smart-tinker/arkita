import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStore, exportFiles, importFiles, readProjectFiles, normalizeProject, mergeProjectFiles, validateProject, validateProjectV2 } from '../src/index.js';
import { incompatibleMetadata, metadataFixture, metadataV2State, metadataV3Fixture } from '../fixtures/metadata-compatibility.js';

const capture = store => ({ files: store.exportFiles(), revision: store.revision, history: store.history });
const run = (store, command) => store.execute(command, store.revision);

test('metadata contract: fixed pre-extension v2 migrates only approved empty fields and keeps every original byte untouched', () => {
  const { bytes, files } = metadataFixture(), before = structuredClone(files);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '94a7d4db59e6a34ba2d0b1160848163cf900fd07fff85f751f1c5efcdf7e2838');
  const legacy = metadataV2State(); assert.equal(validateProjectV2(legacy), legacy);
  assert.equal(legacy.project.formatVersion, 2); assert.equal(Object.hasOwn(legacy.project, 'documentation'), false);
  const prepared = readProjectFiles(files), state = prepared.state, element = state.elements[0];
  const property = key => element.properties.find(row => row.key === key)?.value;
  assert.equal(prepared.sourceVersion, 2); assert.equal(state.project.formatVersion, 4); assert.equal(state.project.metamodel.version, 2);
  assert.deepEqual(Object.keys(state.project).sort(), ['documentation', 'format', 'formatVersion', 'id', 'metamodel', 'name', 'properties']);
  assert.equal(state.relationships[0].documentation, '');
  assert.ok(state.views.every(entry => Object.keys(entry.view.properties).length === 0));
  assert.equal(element.documentation, ' \r\n<script>inert()</script>\r\t日本語 😀 e\u0301 ');
  assert.equal(property(''), ''); assert.equal(property(' raw '), ' \r\n\t\u0000\ud800 ');
  assert.equal(property('é'), 'NFC key'); assert.equal(property('e\u0301'), 'NFD key');
  assert.equal(property('Owner'), 'case A'); assert.equal(property('owner'), 'case B');
  assert.equal(state.elements[1].name, ''); assert.equal(state.elements[1].documentation, '');
  assert.equal(state.relationships[0].label, ''); assert.equal(state.views[1].view.documentation, '');
  const expected = exportFiles(importFiles(metadataV3Fixture().files));
  assert.deepEqual(exportFiles(state), expected); assert.deepEqual(files, before);
  assert.deepEqual(normalizeProject(legacy), state); assert.deepEqual(legacy, metadataV2State());
  assert.equal(readProjectFiles(metadataV3Fixture().files).sourceVersion, 3);
  for (let repeat = 0; repeat < 3; repeat++) assert.deepEqual(exportFiles(importFiles(exportFiles(state))), expected);
});

test('metadata contract: every incompatible record refuses import, load and snapshot application before either history changes', () => {
  const store = createStore(importFiles(metadataFixture().files));
  run(store, { type: 'renameProject', name: 'Past' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const before = capture(store); assert.deepEqual(before.history, { undo: 1, redo: 1 });
  for (const { name, files, code } of incompatibleMetadata()) {
    const input = structuredClone(files), error = { code };
    assert.throws(() => importFiles(files), error, name);
    assert.throws(() => store.load(files, store.revision), error, name);
    assert.throws(() => run(store, { type: 'applyProjectSnapshot', files }), error, name);
    assert.deepEqual(capture(store), before, name); assert.deepEqual(files, input, name);
  }
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});

test('metadata contract: existing documentation and unique property commands retain all other owners through undo/redo', () => {
  const store = createStore(importFiles(metadataFixture().files)), initial = store.exportFiles();
  for (const kind of ['element', 'junction', 'relationship']) {
    const item = store.snapshot[`${kind}s`][0], before = store.snapshot;
    const concept = { kind, id: item.id }, properties = [...item.properties, { key: 'новое свойство 🧭', value: ' \r\n<inert>\ud800 ' }];
    run(store, { type: 'updateConceptProperties', concept, properties });
    before[`${kind}s`][0].properties = properties; assert.deepEqual(store.snapshot, before);
  }
  for (const kind of ['element', 'junction']) {
    const concept = { kind, id: store.snapshot[`${kind}s`][0].id };
    run(store, { type: 'updateConceptDocumentation', concept, documentation: '' });
  }
  const after = store.exportFiles(); assert.deepEqual(store.history, { undo: 5, redo: 0 });
  for (let i = 0; i < 5; i++) store.undo(store.revision);
  assert.deepEqual(store.exportFiles(), initial);
  for (let i = 0; i < 5; i++) store.redo(store.revision);
  assert.deepEqual(store.exportFiles(), after); assert.deepEqual(exportFiles(importFiles(after)), after);
  const before = capture(store);
  assert.throws(() => run(store, { type: 'updateConceptProperties', concept: { kind: 'element', id: store.snapshot.elements[0].id }, properties: [['owner', 'one'], ['owner', 'two']] }), { code: 'SCHEMA' });
  assert.deepEqual(capture(store), before);
});

test('metadata contract: same-record metadata conflicts remain explicit; choices preserve entire records', () => {
  const base = importFiles(metadataFixture().files), local = structuredClone(base), remote = structuredClone(base);
  local.elements[0].documentation = 'Local\r\n'; remote.elements[0].properties.find(row => row.key === 'owner').value = 'Remote 🧭';
  remote.views[0].view.documentation = 'Unrelated view text';
  const inputs = [base, local, remote].map(exportFiles), path = `model/elements/${base.elements[0].id}.json`;
  const result = mergeProjectFiles(...inputs);
  assert.equal(result.files, null); assert.equal(result.structuralError, null);
  assert.deepEqual(result.conflicts.map(item => item.path), [path]);
  for (const side of ['local', 'remote']) {
    const resolved = mergeProjectFiles(...inputs, { records: { [path]: side } });
    const expected = structuredClone(side === 'local' ? local : remote); expected.views[0].view.documentation = remote.views[0].view.documentation;
    assert.deepEqual(resolved.files, exportFiles(expected)); assert.equal(resolved.structuralError, null);
    const store = createStore(base); run(store, { type: 'applyProjectSnapshot', files: resolved.files });
    assert.deepEqual(store.history, { undo: 1, redo: 0 }); store.undo(store.revision); assert.deepEqual(store.exportFiles(), inputs[0]);
    store.redo(store.revision); assert.deepEqual(store.exportFiles(), resolved.files);
  }
  assert.deepEqual([base, local, remote].map(exportFiles), inputs);
});

test('metadata contract: Git validates all three inputs even for a whole-side choice and returns no partial upgrade', () => {
  const base = metadataFixture().files;
  for (const { name, files, code } of incompatibleMetadata()) for (const side of [0, 1, 2]) {
    const inputs = [base, base, base]; inputs[side] = files; const before = structuredClone(inputs);
    for (const resolution of [{}, { whole: 'local' }, { whole: 'remote' }]) assert.throws(() => mergeProjectFiles(...inputs, resolution), { code }, `${name}, side ${side}`);
    assert.deepEqual(inputs, before);
  }
});

test('metadata contract: required empty strings differ from absent fields; v2 budgets apply without coercion', () => {
  const state = importFiles(metadataFixture().files);
  state.project.name = ''; state.views[0].view.name = ''; state.views[0].view.documentation = '';
  state.elements[0].documentation = '🧭'.repeat(4096);
  assert.doesNotThrow(() => validateProject(state));
  for (const edit of [
    candidate => { delete candidate.elements[1].documentation; },
    candidate => { candidate.elements[0].documentation += 'x'; },
    candidate => { candidate.junctions[0].properties = { boolean: false }; },
    candidate => { candidate.relationships[0].properties = Object.fromEntries(Array.from({ length: 65 }, (_, n) => [`key${n}`, ''])); },
  ]) {
    const candidate = structuredClone(state); edit(candidate); const before = structuredClone(candidate);
    assert.throws(() => validateProject(candidate)); assert.deepEqual(candidate, before);
  }
});
