import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, importFiles, exportFiles } from '../../schemka-model-core/src/index.js';
import { incompatibleMetadata, metadataEnvelope, metadataFixture, metadataV3Fixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';
import { createProjectSession } from '../src/project-session.js';

const capture = (store, session) => ({ files: store.exportFiles(), history: store.history, revision: store.revision, dirty: session.dirty, token: session.documentToken });
const file = bytes => new File([bytes], 'metadata-v2.arkita', { type: 'application/json' });

test('metadata contract: failed session imports preserve dirty baseline, token, both histories and pending save', async () => {
  const store = createStore(importFiles(metadataFixture().files)), session = createProjectSession(store);
  for (const name of ['Past', 'Future']) store.execute({ type: 'renameProject', name }, store.revision);
  store.undo(store.revision);
  const before = capture(store, session), pending = session.prepareSave();
  assert.equal(before.dirty, true); assert.deepEqual(before.history, { undo: 1, redo: 1 });
  for (const { name, files, code } of incompatibleMetadata()) {
    const bytes = metadataEnvelope(files), input = bytes.slice();
    await assert.rejects(session.loadFile(session.beginLoad(), file(bytes)), { code }, name);
    assert.deepEqual(capture(store, session), before, name); assert.deepEqual(bytes, input, name);
  }
  assert.equal(session.completeSave(pending).dirty, false);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future'); assert.equal(session.dirty, true);
  await session.loadFile(session.beginLoad(), file(metadataFixture().bytes));
  assert.deepEqual(store.exportFiles(), exportFiles(importFiles(metadataV3Fixture().files))); assert.deepEqual(store.history, { undo: 0, redo: 0 });
  assert.equal(session.dirty, true); assert.equal(session.requiresSaveAs, true); assert.notEqual(session.documentToken, before.token);
});

test('metadata contract: native-v2 reopen, metadata command and snapshot undo share exact canonical session bytes', async () => {
  const { bytes, files } = metadataFixture(), store = createStore(importFiles(files)), session = createProjectSession(store);
  await session.loadFile(session.beginLoad(), file(bytes));
  const token = session.documentToken; assert.deepEqual(session.prepareSave().bytes, serializeProjectFile(importFiles(metadataV3Fixture().files)));
  assert.equal(session.dirty, true); assert.equal(session.requiresSaveAs, true);
  const concept = { kind: 'junction', id: store.snapshot.junctions[0].id };
  store.execute({ type: 'updateConceptProperties', concept, properties: propertyEntries({ '': '', 'e\u0301': 'Новый текст\r\n🧭' }) }, store.revision);
  assert.equal(session.dirty, true); assert.equal(session.documentToken, token);
  const edited = session.prepareSave(); store.undo(store.revision); assert.equal(session.dirty, true);
  store.redo(store.revision); assert.equal(session.matchesProject(edited.bytes), true);
  assert.throws(() => session.completeSave(edited), { code: 'VERSION_SAVE_AS' });
  assert.equal(session.dirty, true); assert.equal(session.requiresSaveAs, true);
  session.completeSave(edited, { saveAs: true }); assert.equal(session.dirty, false); assert.equal(session.requiresSaveAs, false);
  store.execute({ type: 'applyProjectSnapshot', files }, store.revision); assert.equal(session.dirty, true);
  store.undo(store.revision); assert.equal(session.dirty, false); assert.equal(session.documentToken, token);
  assert.equal(session.matchesProject(edited.bytes), true);
});

test('metadata contract: cancelled and stale v2 reads preserve prior migration state, histories, token and pending Save As', async () => {
  for (const migrated of [false, true]) for (const mode of ['cancelled', 'stale']) {
    const store = createStore(importFiles(metadataV3Fixture().files)), session = createProjectSession(store);
    if (migrated) await session.loadFile(session.beginLoad(), file(metadataFixture().bytes));
    store.execute({ type: 'renameProject', name: 'Past' }, store.revision); store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision);
    const pending = session.prepareSave(), bytes = metadataFixture().bytes, ticket = session.beginLoad();
    let finish; const reader = new Promise(resolve => { finish = resolve; });
    const opening = session.loadFile(ticket, { name: 'old.arkita', size: bytes.length, arrayBuffer: () => reader });
    if (mode === 'cancelled') assert.equal(session.cancelLoad(ticket), true);
    else store.execute({ type: 'renameProject', name: 'Newer state' }, store.revision);
    const before = capture(store, session), flag = session.requiresSaveAs;
    finish(bytes.slice().buffer); await assert.rejects(opening, { code: 'SESSION_STALE' });
    assert.deepEqual(capture(store, session), before); assert.equal(session.requiresSaveAs, flag);
    const completed = session.completeSave(pending, { saveAs: migrated });
    assert.equal(session.requiresSaveAs, false); assert.equal(completed.dirty, mode === 'stale');
  }
});
