import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDocumentPreferences } from '../document-preferences.mjs';
import { atomicWrite, readProjectSnapshot, writeBoundProject } from '../project-files.mjs';
import { createFileService } from '../file-service.mjs';
import { createNativeDirectory, readNativeDirectory } from '../native-directory.mjs';
import { updateNativeDirectory } from '../directory-update.mjs';
import { APP_URL } from '../boundary.mjs';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const bytes = name => serializeProjectFile(createProject(name));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-lifecycle-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const token = () => randomUUID();
function owner() { const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }; return { window, event: { sender: window.webContents, senderFrame: window.webContents.mainFrame } }; }
test('MRU stores canonical distinct paths, limit/disabled and settings survive a fresh service', async t => {
  const root = await fixture(t), data = path.join(root, 'app'); await fs.mkdir(path.join(root, 'a')); await fs.mkdir(path.join(root, 'b'));
  const a = path.join(root, 'a', 'one.arkita'), b = path.join(root, 'b', 'one.arkita'); await fs.writeFile(a, bytes('a')); await fs.writeFile(b, bytes('b'));
  const prefs = createDocumentPreferences(data); await prefs.remember(a); await prefs.remember(b); await prefs.remember(a);
  let state = await createDocumentPreferences(data).status(); assert.deepEqual(state.recent.map(x => x.path), [a, b]); assert.equal(state.recent[0].name, state.recent[1].name); assert.notEqual(state.recent[0].id, state.recent[1].id);
  await prefs.set({ ...state.settings, recentLimit: 1, openViews: 'none', backupEnabled: true }); assert.equal((await prefs.status()).recent.length, 1);
  await assert.rejects(() => prefs.recent('caller-path'), { code: 'DOCUMENT_RECENT' }); await assert.rejects(() => prefs.set({ recentLimit: 10000 }), { code: 'DOCUMENT_SETTINGS' });
  state = await createDocumentPreferences(data).status(); assert.equal(state.settings.openViews, 'none'); assert.equal(state.settings.backupEnabled, true);
  await prefs.set({ ...state.settings, recentLimit: 0 }); await prefs.remember(b); assert.equal((await prefs.status()).recent.length, 0);
});
test('backup preserves previous readable bytes, rotates, and an external conflict or failed backup never writes the model', async t => {
  const root = await fixture(t), source = path.join(root, 'Модель.arkita'), first = bytes('first'), second = bytes('second'); await fs.writeFile(source, first);
  const prefs = createDocumentPreferences(path.join(root, 'app')); const settings = (await prefs.status()).settings; await prefs.set({ ...settings, backupEnabled: true, backupLimit: 2 });
  let opened = await readProjectSnapshot(source); await writeBoundProject(opened.snapshot, second, fs, { backup: prefs.backup });
  let list = (await prefs.status()).backups; assert.equal(list.length, 1); assert.deepEqual((await prefs.readBackup(list[0].id)).bytes, first);
  await atomicWrite(source, bytes('third'), fs, null, { backup: prefs.backup }); await atomicWrite(source, bytes('fourth'), fs, null, { backup: prefs.backup });
  list = (await prefs.status()).backups; assert.equal(list.length, 2); assert.equal((await fs.readdir(path.join(root, 'app', 'backups'))).length, 2);
  opened = await readProjectSnapshot(source); await fs.writeFile(source, bytes('external')); const external = await fs.readFile(source); let calls = 0;
  await assert.rejects(() => writeBoundProject(opened.snapshot, first, fs, { backup: async () => { calls++; } }), { code: 'FILE_CHANGED' }); assert.equal(calls, 0); assert.deepEqual(await fs.readFile(source), external);
  await assert.rejects(() => atomicWrite(source, first, fs, null, { backup: async () => { throw Object.assign(Error('backup disk full'), { code: 'ENOSPC' }); } }), { code: 'ENOSPC' }); assert.deepEqual(await fs.readFile(source), external);
});
test('backup restore Save As protects source and other windows, preserves current binding and rejects stale dialog completion', async t => {
  const root = await fixture(t), source = path.join(root, 'source.arkita'), recovery = path.join(root, 'recovered.arkita'); await fs.writeFile(source, bytes('source'));
  const { window, event } = owner(); let selected = source, held, release, current = token();
  const service = createFileService({ window, dialog: { showSaveDialog: async () => { if (held) await held; return { canceled: false, filePath: selected }; } }, assertDestination: async target => { if (target.endsWith('other.arkita')) throw Object.assign(Error('open elsewhere'), { code: 'DOCUMENT_OPEN' }); } });
  service.documentChanged(event, current, current);
  assert.equal((await service.saveRecoveryCopy(event, bytes('old'), 'recovered.arkita', source, current)).code, 'FILE_OWNED');
  selected = path.join(root, 'other.arkita'); assert.equal((await service.saveRecoveryCopy(event, bytes('old'), 'recovered.arkita', source, current)).code, 'DOCUMENT_OPEN');
  selected = recovery; const result = await service.saveRecoveryCopy(event, bytes('old'), 'recovered.arkita', source, current); assert.equal(result.status, 'saved'); assert.equal(result.candidate, undefined); assert.equal(service.location, null); assert.equal(service.documentToken, current);
  selected = path.join(root, 'stale.arkita'); held = new Promise(r => release = r); const saving = service.saveRecoveryCopy(event, bytes('old'), 'recovered.arkita', source, current); await new Promise(r => setImmediate(r)); service.documentChanged(event, current, token()); release(); assert.equal((await saving).code, 'DIRECTORY_SESSION'); await assert.rejects(() => fs.stat(selected), { code: 'ENOENT' });
});
test('external exchange validates names/format before picker, rejects overlap/stale, uses fresh destinations and never rebinds model', async t => {
  const root = await fixture(t), input = path.join(root, 'input.csv'), output = path.join(root, 'output.csv'); await fs.writeFile(input, 'id,name\n1,one\n');
  const { window, event } = owner(), current = token(); let selected = output, calls = 0, delayed, release;
  const service = createFileService({ window, dialog: { showOpenDialog: async () => { calls++; return { canceled: false, filePaths: [input] }; }, showSaveDialog: async () => { calls++; if (delayed) await delayed; return { canceled: false, filePath: selected }; } } }); service.documentChanged(event, current, current);
  let result = await service.readExternalFiles(event, 'csv', current); assert.equal(result.status, 'opened'); assert.equal(result.files[0].name, 'input.csv'); assert.equal(service.location, null);
  const records = [{ name: 'output.csv', bytes: new TextEncoder().encode('id,name\n2,two\n') }];
  const before = calls; assert.equal((await service.saveExternalFiles(event, 'csv', [{ ...records[0], name: '../model.arkita' }], current)).code, 'EXTERNAL_NAME'); assert.equal(calls, before);
  result = await service.saveExternalFiles(event, 'csv', records, current); assert.equal(result.status, 'saved'); assert.equal(service.location, null); assert.deepEqual(await fs.readFile(output), Buffer.from(records[0].bytes));
  assert.equal((await service.saveExternalFiles(event, 'csv', records, current)).code, 'EEXIST');
  selected = path.join(root, 'stale.csv'); delayed = new Promise(r => release = r); const saving = service.saveExternalFiles(event, 'csv', records, current); await new Promise(r => setImmediate(r)); assert.equal((await service.readExternalFiles(event, 'csv', current)).code, 'FILE_BUSY'); service.documentChanged(event, current, token()); release(); assert.equal((await saving).code, 'DIRECTORY_SESSION'); await assert.rejects(() => fs.stat(selected), { code: 'ENOENT' });
});

test('native external SVG export accepts only bounded static UTF8 and uses fresh protected save with exact token', async t => {
 const root = await fixture(t), { window, event } = owner(), documentToken = token(), output = path.join(root, 'Схема.svg'); let pickers = 0;
 const service = createFileService({ window, dialog: { showSaveDialog: async () => { pickers++; return { filePath: output }; } } });
 const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><text x="1" y="20">Схема</text></svg>', records = [{ name: 'Схема.svg', bytes: Buffer.from(svg) }];
 const result = await service.saveExternalFiles(event, 'svg', records, documentToken); assert.equal(result.status, 'saved', result.message); assert.equal(await fs.readFile(output, 'utf8'), svg); assert.equal(pickers, 1);
 assert.equal((await service.saveExternalFiles(event, 'svg', records, documentToken)).code, 'EEXIST'); assert.equal(await fs.readFile(output, 'utf8'), svg);
 const before = pickers;
 for (const bytes of [Buffer.from('<svg onload="evil()"/>'), Buffer.from([0xff]), Buffer.alloc(16 * 1024 * 1024 + 1)]) assert.equal((await service.saveExternalFiles(event, 'svg', [{ name: 'Unsafe.svg', bytes }], documentToken)).status, 'error'); assert.equal(pickers, before);
 assert.equal((await service.saveExternalFiles(event, 'svg', records, token())).status, 'error'); assert.equal(pickers, before); assert.equal((await service.readExternalFiles(event, 'svg', documentToken)).status, 'error');
});


test('backups are enabled on first use and an existing opt-out survives restart', async t => {
  const root = await fixture(t), data = path.join(root, 'new-app'), source = path.join(root, 'source.arkita'), before = bytes('Before'); await fs.writeFile(source, before);
  const prefs = createDocumentPreferences(data); assert.equal((await prefs.status()).settings.backupEnabled, true);
  const id = await prefs.backup(source, before); assert.deepEqual((await prefs.readBackup(id)).bytes, before);
  const reopened = createDocumentPreferences(data), state = await reopened.status(); assert.equal(state.backups.length, 1); assert.equal(state.settings.backupEnabled, true);
  await reopened.set({ ...state.settings, backupEnabled: false }); const disabled = createDocumentPreferences(data);
  assert.equal((await disabled.status()).settings.backupEnabled, false); await disabled.backup(source, bytes('Skipped')); assert.equal((await disabled.status()).backups.length, 1);
});

test('native directory backup is a complete standalone file and recovery leaves directory and current binding intact', async t => {
  const root = await fixture(t), before = createProject('Directory before'), after = structuredClone(before); after.project.name = 'Directory after';
  const created = await createNativeDirectory(root, serializeProjectFile(before)), source = path.join(root, created.name), prefs = createDocumentPreferences(path.join(root, 'app'));
  const updated = await updateNativeDirectory(created.snapshot, serializeProjectFile(after), fs, { backup: prefs.backup });
  const [item] = (await createDocumentPreferences(path.join(root, 'app')).status()).backups, copy = await prefs.readBackup(item.id); assert.equal(item.sourcePath, source); assert.deepEqual(copy.bytes, serializeProjectFile(before));
  const { window, event } = owner(), initial = token(), current = token(), recovery = path.join(root, copy.name);
  const service = createFileService({ window, dialog: { showSaveDialog: async () => ({ filePath: recovery }) } });
  const opened = await service.openPrepared(event, { bytes: serializeProjectFile(after), snapshot: updated.snapshot }, initial, 'directory'); assert.equal(service.documentChanged(event, initial, current, opened.candidate).status, 'bound');
  const binding = service.location; assert.equal((await service.saveRecoveryCopy(event, copy.bytes, copy.name, copy.sourcePath, current)).status, 'saved');
  assert.deepEqual(await fs.readFile(recovery), Buffer.from(serializeProjectFile(before))); assert.deepEqual((await readNativeDirectory(source)).snapshot.files, updated.snapshot.files); assert.deepEqual(service.location, binding); assert.equal(service.documentToken, current);
});

test('backup reader rejects hardlinks and identity replacement during no-follow read', async t => {
  const root = await fixture(t), data = path.join(root, 'app'), source = path.join(root, 'source.arkita'); await fs.writeFile(source, bytes('Source'));
  const backup = bytes('Backup'), prefs = createDocumentPreferences(data), id = await prefs.backup(source, backup), selected = path.join(data, 'backups', `${id}.arkita`), alias = path.join(root, 'linked.arkita');
  await fs.link(selected, alias); await assert.rejects(() => prefs.readBackup(id), { code: 'BACKUP_STORAGE' }); await fs.unlink(alias);
  let replaced = false; const io = { ...fs, open: async (target, ...args) => {
    if (target === selected && !replaced) { replaced = true; await fs.rename(selected, selected + '.original'); await fs.writeFile(selected, bytes('Replacement')); }
    return fs.open(target, ...args);
  } };
  await assert.rejects(() => createDocumentPreferences(data, io).readBackup(id), { code: 'DIRECTORY_CHANGED' }); assert.equal(replaced, true); assert.deepEqual(await fs.readFile(selected + '.original'), Buffer.from(backup));
});

test('recovery requires a new destination, preserves existing files and cancellation, and rejects linked paths', async t => {
  const root = await fixture(t), source = path.join(root, 'source.arkita'), existing = path.join(root, 'existing.arkita'), alias = path.join(root, 'source-link.arkita'); const sourceBytes = bytes('Source'); await fs.writeFile(source, sourceBytes); await fs.writeFile(existing, 'unrelated bytes');
  const { window, event } = owner(), current = token(); let selected = existing;
  const service = createFileService({ window, dialog: { showSaveDialog: async (_window, options) => { assert.equal(options.title, 'Восстановить в новый файл'); return { canceled: selected === null, filePath: selected }; } } }); service.documentChanged(event, current, current);
  assert.equal((await service.saveRecoveryCopy(event, bytes('Backup'), 'copy.arkita', source, current)).code, 'FILE_EXISTS'); assert.equal(await fs.readFile(existing, 'utf8'), 'unrelated bytes');
  selected = null; assert.equal((await service.saveRecoveryCopy(event, bytes('Backup'), 'copy.arkita', source, current)).status, 'cancelled');
  await fs.link(source, alias); selected = alias; assert.equal((await service.saveRecoveryCopy(event, bytes('Backup'), 'copy.arkita', source, current)).code, 'FILE_OWNED'); await fs.unlink(alias);
  const parent = path.join(root, 'destination'); await fs.mkdir(parent); const linked = path.join(root, 'linked-parent'); await fs.symlink(parent, linked, process.platform === 'win32' ? 'junction' : 'dir'); selected = path.join(linked, 'copy.arkita');
  assert.equal((await service.saveRecoveryCopy(event, bytes('Backup'), 'copy.arkita', source, current)).code, 'DIRECTORY_TYPE'); await assert.rejects(() => fs.stat(path.join(parent, 'copy.arkita')), { code: 'ENOENT' }); assert.deepEqual(await fs.readFile(source), Buffer.from(sourceBytes));
});

test('fresh-only publication never overwrites a destination created after the picker checks', async t => {
  const root = await fixture(t), target = path.join(root, 'racing.arkita'), external = Buffer.from('external writer'); let raced = false;
  const io = { ...fs, link: async (from, to) => { if (to === target) { raced = true; await fs.writeFile(target, external); } return fs.link(from, to); } };
  await assert.rejects(() => atomicWrite(target, bytes('Backup'), io, null, { freshOnly: true }), { code: 'FILE_CHANGED' }); assert.equal(raced, true); assert.deepEqual(await fs.readFile(target), external);
});


test('recovery protects owned namespaces of a closed source directory with no binding or another open file', async t => {
  const root = await fixture(t), state = createProject('Closed directory'); state.elements.push({ id: `el-${token()}`, type: 'Role', name: 'Element', documentation: '', properties: [] });
  const encoded = serializeProjectFile(state), created = await createNativeDirectory(root, encoded), source = created.snapshot.guard.root;
  const collection = path.join(source, 'model', 'elements'), originalInventory = await fs.readdir(collection), forbidden = path.join(collection, `el-${token()}.arkita`);
  const other = path.join(root, 'other.arkita'), otherBytes = bytes('Open elsewhere in this window'); await fs.writeFile(other, otherBytes);
  const { window, event } = owner(); let selected = forbidden, current = token();
  const service = createFileService({ window, dialog: { showSaveDialog: async () => ({ filePath: selected }) } }); service.documentChanged(event, current, current);
  for (const bound of [false, true]) {
    if (bound) { const prepared = await readProjectSnapshot(other), opened = await service.openPrepared(event, prepared, current), next = token(); assert.equal(service.documentChanged(event, current, next, opened.candidate).status, 'bound'); current = next; }
    const binding = service.location, result = await service.saveRecoveryCopy(event, encoded, 'recovered.arkita', source, current);
    assert.equal(result.code, 'DIRECTORY_OWNED'); await assert.rejects(() => fs.stat(forbidden), { code: 'ENOENT' }); assert.deepEqual(await fs.readdir(collection), originalInventory);
    assert.deepEqual((await readNativeDirectory(source)).snapshot.files, created.snapshot.files); assert.deepEqual(service.location, binding); assert.deepEqual(await fs.readFile(other), Buffer.from(otherBytes));
  }
  const outside = path.join(root, 'separate-restored.arkita'); selected = outside;
  assert.equal((await service.saveRecoveryCopy(event, encoded, 'recovered.arkita', source, current)).status, 'saved'); assert.deepEqual(await fs.readFile(outside), Buffer.from(encoded));
  const closedFile = path.join(root, 'closed-file.arkita'), closedBytes = bytes('Closed file'); await fs.writeFile(closedFile, closedBytes); selected = path.join(root, 'closed-file-restored.arkita');
  assert.equal((await service.saveRecoveryCopy(event, closedBytes, 'recovered.arkita', closedFile, current)).status, 'saved'); assert.deepEqual(await fs.readFile(closedFile), Buffer.from(closedBytes)); assert.deepEqual(await fs.readFile(selected), Buffer.from(closedBytes));
});
