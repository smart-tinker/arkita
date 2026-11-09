import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, importFiles, exportFiles } from '../../schemka-model-core/src/index.js';
import { incompatibleMetadata, metadataEnvelope, metadataFixture, metadataV3Fixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';
import { deserializeProjectFile, readProjectFile, loadProjectFile, serializeProjectFile, serializeNativeFiles } from '../src/project-file.js';

const capture = store => ({ files: store.exportFiles(), revision: store.revision, history: store.history });

test('metadata contract: transport v1/native v2 bytes migrate once, retain exact text and preserve original transport records', () => {
  const { bytes, files } = metadataFixture(), store = createStore(importFiles(files));
  const legacyV3 = metadataV3Fixture(), expected = { bytes: serializeProjectFile(importFiles(legacyV3.files)), files: exportFiles(importFiles(legacyV3.files)) };
  assert.deepEqual(serializeProjectFile(deserializeProjectFile(bytes)), expected.bytes);
  assert.equal(readProjectFile(bytes).sourceVersion, 2); assert.equal(readProjectFile(legacyV3.bytes).sourceVersion, 3);
  assert.deepEqual(serializeNativeFiles(files), bytes);
  store.execute({ type: 'renameProject', name: 'Pending' }, store.revision); store.undo(store.revision);
  const revision = store.revision;
  loadProjectFile(store, bytes, revision);
  assert.deepEqual(store.exportFiles(), expected.files); assert.equal(store.revision, revision + 1);
  assert.deepEqual(store.history, { undo: 0, redo: 0 }); assert.deepEqual(serializeProjectFile(store.snapshot), expected.bytes);
  const envelope = JSON.parse(new TextDecoder().decode(bytes));
  envelope.files.reverse(); for (const file of envelope.files) file.content = JSON.stringify(JSON.parse(file.content), null, 4);
  assert.deepEqual(serializeProjectFile(deserializeProjectFile(JSON.stringify(envelope))), expected.bytes);
  assert.deepEqual(bytes, metadataFixture().bytes); assert.deepEqual(files, metadataFixture().files);
});

test('metadata contract: incompatible inner records and future envelope fail before replacement with a specific reason', () => {
  const store = createStore(importFiles(metadataFixture().files));
  for (const name of ['Past', 'Future']) store.execute({ type: 'renameProject', name }, store.revision);
  store.undo(store.revision); const before = capture(store);
  for (const { name, files, code } of incompatibleMetadata()) {
    const bytes = metadataEnvelope(files), input = bytes.slice();
    assert.throws(() => deserializeProjectFile(bytes), { code }, name);
    assert.throws(() => loadProjectFile(store, bytes, store.revision), error => error.code === code &&
      (code !== 'VERSION' || /Unsupported.*(?:version|metamodel)/i.test(error.message)), name);
    assert.deepEqual(capture(store), before, name); assert.deepEqual(bytes, input, name);
  }
  const futureEnvelope = JSON.parse(new TextDecoder().decode(metadataFixture().bytes)); futureEnvelope.formatVersion = 2;
  assert.throws(() => loadProjectFile(store, JSON.stringify(futureEnvelope), store.revision), { code: 'FILE_VERSION' });
  assert.deepEqual(capture(store), before); store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});
