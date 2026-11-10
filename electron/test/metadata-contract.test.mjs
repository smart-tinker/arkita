import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_URL } from '../boundary.mjs';
import { createFileService } from '../file-service.mjs';
import { createNativeDirectory, readNativeDirectory } from '../native-directory.mjs';
import { updateNativeDirectory } from '../directory-update.mjs';
import { readProjectSnapshot, writeBoundProject } from '../project-files.mjs';
import { createStore, importFiles, exportFiles } from '../../schemka-model-core/src/index.js';
import { incompatibleMetadata, metadataEnvelope, metadataFixture, metadataV3Fixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';
import { serializeProjectFile, readProjectFile } from '../../schemka-model-io/src/project-file.js';
import { createProjectSession } from '../../schemka-model-ui/src/project-session.js';

async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-metadata-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir;
}
const selectedFile = bytes => new File([bytes], 'metadata-v2.arkita');
const capture = (store, session) => ({ files: store.exportFiles(), history: store.history, revision: store.revision, dirty: session.dirty, token: session.documentToken });

test('metadata contract: v2 file opens dirty, refuses source overwrite and saves a separate current copy before normal bound writes', async t => {
  const dir = await temporary(t), original = metadataFixture(), target = path.join(dir, 'old-model.schemka.json'), incoming = path.join(dir, 'incoming.arkita');
  await fs.writeFile(target, original.bytes);
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const copy = path.join(dir, 'upgraded.arkita');
  let selected = target, saveTarget = target, saveDialogs = 0;
  const service = createFileService({ window, dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [selected] }),
    showSaveDialog: async () => { saveDialogs++; return { canceled: false, filePath: saveTarget }; },
  } });
  const store = createStore(importFiles(original.files)), session = createProjectSession(store);
  const opened = await service.open(event, session.documentToken), previous = session.documentToken;
  assert.equal(opened.status, 'opened'); await session.loadFile(session.beginLoad(), selectedFile(opened.bytes));
  let bound = service.documentChanged(event, previous, session.documentToken, opened.candidate);
  assert.equal(bound.status, 'bound'); assert.equal(bound.directory.file.name, 'old-model.schemka.json');
  assert.equal(bound.directory.file.requiresSaveAs, true); assert.equal(session.requiresSaveAs, true); assert.equal(session.dirty, true);
  const concept = { kind: 'element', id: store.snapshot.elements[0].id };
  store.execute({ type: 'updateConceptDocumentation', concept, documentation: 'Saved\r\n🧭' }, store.revision);
  const ticket = session.prepareSave(), history = store.history;
  assert.equal((await service.saveCurrentProject(event, ticket.bytes, session.documentToken)).code, 'VERSION_SAVE_AS');
  assert.equal((await service.saveProject(event, ticket.bytes, session.documentToken)).code, 'FILE_OWNED');
  assert.deepEqual(await fs.readFile(target), Buffer.from(original.bytes)); assert.equal(session.dirty, true);
  saveTarget = copy;
  const saved = await service.saveProject(event, ticket.bytes, session.documentToken); assert.equal(saved.status, 'saved');
  session.completeSave(ticket, { saveAs: true });
  bound = service.documentChanged(event, session.documentToken, session.documentToken, saved.candidate);
  assert.equal(bound.directory.file.requiresSaveAs, false); assert.equal(session.dirty, false); assert.deepEqual(store.history, history);
  assert.deepEqual(await fs.readFile(copy), Buffer.from(ticket.bytes)); assert.deepEqual(await fs.readFile(target), Buffer.from(original.bytes)); assert.equal(saveDialogs, 2);
  store.undo(store.revision); store.redo(store.revision); assert.equal(session.dirty, false);
  store.execute({ type: 'renameProject', name: 'Unsaved past' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Unsaved future' }, store.revision); store.undo(store.revision);
  const before = capture(store, session), savedBytes = await fs.readFile(copy);
  selected = incoming;
  for (const { name, files, code } of incompatibleMetadata()) {
    const bytes = metadataEnvelope(files); await fs.writeFile(incoming, bytes);
    const candidate = await service.open(event, session.documentToken); assert.equal(candidate.status, 'error'); assert.equal(candidate.code, code);
    await assert.rejects(session.loadFile(session.beginLoad(), selectedFile(bytes)), { code }, name);
    assert.deepEqual(capture(store, session), before, name);
    for (const method of ['saveProject', 'saveCurrentProject', 'saveDirectory']) {
      const refused = await service[method](event, bytes, session.documentToken);
      assert.equal(refused.status, 'error', name); assert.equal(refused.code, code, name);
      assert.equal(refused.directory.file.id, bound.directory.file.id, name);
      assert.ok(refused.message.length > 0, name);
    }
    assert.deepEqual(await fs.readFile(copy), savedBytes, name); assert.deepEqual(await fs.readFile(target), Buffer.from(original.bytes), name); assert.deepEqual(await fs.readFile(incoming), Buffer.from(bytes), name);
  }
  assert.equal(saveDialogs, 2); assert.deepEqual((await fs.readdir(dir)).filter(name => !name.startsWith('.schemka-transaction-')).sort(), ['incoming.arkita', 'old-model.schemka.json', 'upgraded.arkita']);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Unsaved future');
});

test('metadata contract: native directory save/update/open retains metadata and raw empty Unicode keys', async t => {
  const parent = await temporary(t), original = metadataFixture();
  const saved = await createNativeDirectory(parent, original.bytes), root = path.join(parent, saved.name);
  const store = createStore(importFiles(original.files)), session = createProjectSession(store);
  const initial = await readNativeDirectory(root); assert.deepEqual(initial.bytes, serializeProjectFile(importFiles(original.files)));
  assert.equal(initial.snapshot.sourceVersion, 4);
  const concept = { kind: 'relationship', id: store.snapshot.relationships[0].id };
  store.execute({ type: 'updateConceptProperties', concept, properties: [{ key: '', value: '' }, { key: 'é', value: 'NFC' }, { key: 'e\u0301', value: 'NFD' }, { key: 'raw', value: ' \r\n\ud800 🧭 ' }] }, store.revision);
  const ticket = session.prepareSave(), history = store.history;
  const updated = await updateNativeDirectory(initial.snapshot, ticket.bytes); session.completeSave(ticket);
  assert.deepEqual(updated.snapshot.files.map(({ path, content }) => ({ path, content })), store.exportFiles());
  assert.deepEqual(store.history, history); assert.equal(session.dirty, false);
  const reopened = await readNativeDirectory(root); assert.deepEqual(reopened.bytes, ticket.bytes);
  await session.loadFile(session.beginLoad(), selectedFile(reopened.bytes));
  assert.deepEqual(serializeProjectFile(store.snapshot), ticket.bytes); assert.deepEqual(store.history, { undo: 0, redo: 0 });
  assert.deepEqual(store.snapshot.views, importFiles(original.files).views);
});

test('metadata contract: incompatible directory reads and writes preserve every source record without partial migration', async t => {
  const parent = await temporary(t), original = metadataFixture();
  const saved = await createNativeDirectory(parent, original.bytes), root = path.join(parent, saved.name);
  const migrated = importFiles(original.files), canonical = { files: exportFiles(migrated), bytes: serializeProjectFile(migrated) };
  const inventory = async files => Promise.all(files.map(async item => ({ path: item.path, content: await fs.readFile(path.join(root, item.path), 'utf8') })));
  const writeRecords = async files => { for (const file of files) await fs.writeFile(path.join(root, file.path), file.content); };
  for (const { name, files, code } of incompatibleMetadata()) {
    const bytes = metadataEnvelope(files), children = await fs.readdir(parent);
    await assert.rejects(createNativeDirectory(parent, bytes), { code }, name);
    await assert.rejects(updateNativeDirectory(saved.snapshot, bytes), { code }, name);
    assert.deepEqual(await fs.readdir(parent), children, name); assert.deepEqual(await inventory(canonical.files), canonical.files, name);
    await writeRecords(files); const before = await inventory(files);
    await assert.rejects(readNativeDirectory(root), { code }, name);
    assert.deepEqual(await inventory(files), before, name); assert.deepEqual(await fs.readdir(parent), children, name);
    await writeRecords(canonical.files);
  }
  assert.deepEqual((await readNativeDirectory(root)).bytes, canonical.bytes);
});

test('metadata contract: an existing v2 directory is never updated in place; source records survive separate current Save As', async t => {
  const parent = await temporary(t), original = metadataFixture(), root = path.join(parent, 'existing-v2');
  for (const file of original.files) { const target = path.join(root, file.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.content); }
  const opened = await readNativeDirectory(root);
  assert.equal(opened.snapshot.sourceVersion, 2); assert.equal(opened.snapshot.state.project.formatVersion, 4);
  assert.equal(readProjectFile(opened.bytes).sourceVersion, 2); assert.deepEqual(opened.bytes, original.bytes);
  const bytes = serializeProjectFile(opened.snapshot.state);
  await assert.rejects(updateNativeDirectory(opened.snapshot, bytes), { code: 'VERSION_SAVE_AS' });
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: null, senderFrame: null };
  event.sender = window.webContents; event.senderFrame = window.webContents.mainFrame;
  let selected = root;
  const service = createFileService({ window, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selected] }) } });
  const previous = crypto.randomUUID(), current = crypto.randomUUID(), candidate = await service.openDirectory(event, previous);
  assert.equal(candidate.status, 'opened'); assert.equal(readProjectFile(candidate.bytes).sourceVersion, 2);
  const bound = service.documentChanged(event, previous, current, candidate.candidate); assert.equal(bound.directory.binding.requiresSaveAs, true);
  assert.equal((await service.saveBoundDirectory(event, bytes, current)).code, 'VERSION_SAVE_AS');
  selected = parent;
  const saved = await service.saveDirectory(event, bytes, current); assert.equal(saved.status, 'saved');
  const rebound = service.documentChanged(event, current, current, saved.candidate); assert.equal(rebound.directory.binding.requiresSaveAs, false);
  assert.notEqual(path.join(parent, saved.name), root); assert.equal((await readNativeDirectory(path.join(parent, saved.name))).snapshot.sourceVersion, 4);
  for (const file of original.files) assert.equal(await fs.readFile(path.join(root, file.path), 'utf8'), file.content);
  assert.deepEqual((await readNativeDirectory(root)).bytes, original.bytes);
});

test('metadata contract: v2 Save As protects source inode aliases and a renamed source, including direct bound writes', async t => {
  for (const mode of ['hardlink', 'renamed']) {
    const dir = await temporary(t), original = metadataFixture(), target = path.join(dir, 'source.arkita'), alias = path.join(dir, 'other.arkita');
    await fs.writeFile(target, original.bytes);
    const snapshot = (await readProjectSnapshot(target)).snapshot;
    await assert.rejects(writeBoundProject(snapshot, metadataV3Fixture().bytes), { code: 'VERSION_SAVE_AS' });
    assert.deepEqual(await fs.readFile(target), Buffer.from(original.bytes));
    const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: null, senderFrame: null };
    event.sender = window.webContents; event.senderFrame = window.webContents.mainFrame;
    const service = createFileService({ window, dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [target] }),
      showSaveDialog: async () => { await fs[mode === 'hardlink' ? 'link' : 'rename'](target, alias); return { canceled: false, filePath: alias }; },
    } });
    const previous = crypto.randomUUID(), current = crypto.randomUUID(), opened = await service.open(event, previous);
    const bound = service.documentChanged(event, previous, current, opened.candidate); assert.equal(bound.status, 'bound');
    const refused = await service.saveProject(event, metadataV3Fixture().bytes, current);
    assert.equal(refused.code, 'FILE_OWNED'); assert.equal(refused.directory.file.id, bound.directory.file.id); assert.equal(refused.directory.file.requiresSaveAs, true);
    assert.deepEqual(await fs.readFile(alias), Buffer.from(original.bytes));
    if (mode === 'hardlink') assert.deepEqual(await fs.readFile(target), Buffer.from(original.bytes));
  }
});

test('metadata contract: a v2 directory source record moved outside its root cannot become a Save As or export target', async t => {
  const parent = await temporary(t), original = metadataFixture(), root = path.join(parent, 'source'), alias = path.join(parent, 'moved-source.arkita');
  for (const file of original.files) { const target = path.join(root, file.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.content); }
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const service = createFileService({ window, dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [root] }),
    showSaveDialog: async () => ({ canceled: false, filePath: alias }),
  } });
  const previous = crypto.randomUUID(), current = crypto.randomUUID(), opened = await service.openDirectory(event, previous);
  const bound = service.documentChanged(event, previous, current, opened.candidate);
  assert.equal(bound.directory.binding.requiresSaveAs, true);
  await fs.rename(path.join(root, 'schemka.json'), alias);
  const result = await service.saveProject(event, metadataV3Fixture().bytes, current); assert.equal(result.code, 'DIRECTORY_OWNED');
  assert.equal(result.directory.binding.id, bound.directory.binding.id);
  assert.equal((await service.saveMermaid(event, 'flowchart LR\nA-->B')).code, 'DIRECTORY_OWNED');
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
  assert.equal((await service.saveSvg(event, svg)).code, 'DIRECTORY_OWNED');
  assert.equal(await fs.readFile(alias, 'utf8'), original.files.find(file => file.path === 'schemka.json').content);
});
