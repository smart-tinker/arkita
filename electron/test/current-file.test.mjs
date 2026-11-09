import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_URL } from '../boundary.mjs';
import { createFileService } from '../file-service.mjs';
import { readProjectSnapshot, writeBoundProject } from '../project-files.mjs';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-current-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'model.arkita'), state = createProject('Initial'), bytes = serializeProjectFile(state);
  await fs.writeFile(file, bytes);
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  let selected = file, destination = file, saves = 0;
  const service = createFileService({ window, dialog: {
    showOpenDialog: async (_window, opts) => { assert.deepEqual(opts.filters.map(f => f.extensions), [['arkita'], ['json']]); return { canceled: selected === null, filePaths: selected ? [selected] : [] }; },
    showSaveDialog: async (_window, opts) => { saves++; assert.match(opts.defaultPath, /\.arkita$/); assert.deepEqual(opts.filters[0].extensions, ['arkita']); return { canceled: destination === null, filePath: destination }; },
    showErrorBox() {},
  }, ...options });
  return { dir, file, bytes, state, service, event, token: randomUUID(), select(value) { selected = value; }, saveAt(value) { destination = value; }, get saves() { return saves; } };
}
async function open(f) {
  const opened = await f.service.open(f.event, f.token); assert.equal(opened.status, 'opened'); assert.equal(opened.directory.file, null);
  assert.equal('snapshot' in opened, false); assert.equal('path' in opened, false);
  const current = randomUUID(), ack = f.service.documentChanged(f.event, f.token, current, opened.candidate);
  assert.equal(ack.status, 'bound'); assert.equal(ack.directory.file.name, path.basename(f.file)); assert.equal((await f.service.documentLocation(f.event, current)).path, f.file); assert.equal(ack.directory.binding, null); f.token = current;
  return ack;
}
test('open binds only committed file; normal Save uses no picker and preserves model IDs', async t => {
  const f = await fixture(t); await open(f);
  f.state.project.name = 'Edited'; const bytes = serializeProjectFile(f.state);
  const saved = await f.service.saveCurrentProject(f.event, bytes, f.token);
  assert.equal(saved.status, 'saved'); assert.equal(f.saves, 0); assert.deepEqual(await fs.readFile(f.file), Buffer.from(bytes));
  assert.deepEqual(deserializeProjectFile(await fs.readFile(f.file)), f.state); assert.equal(saved.directory.file.blocked, false);
  f.state.project.name = 'Edited again'; assert.equal((await f.service.saveCurrentProject(f.event, serializeProjectFile(f.state), f.token)).status, 'saved');
});
test('formatted legacy file retains raw baseline; edit, deletion and identity replacement block Save', async t => {
  for (const change of ['edit', 'delete', 'replace']) {
    const f = await fixture(t); const formatted = JSON.stringify(JSON.parse(Buffer.from(f.bytes).toString()), null, 4); await fs.writeFile(f.file, formatted); await open(f);
    if (change === 'edit') await fs.writeFile(f.file, 'external edit');
    if (change === 'delete') await fs.unlink(f.file);
    if (change === 'replace') { await fs.rename(f.file, f.file + '.previous'); await fs.writeFile(f.file, formatted); }
    const result = await f.service.saveCurrentProject(f.event, f.bytes, f.token);
    assert.equal(result.status, 'error'); assert.equal(result.code, 'FILE_CHANGED'); assert.equal(result.directory.file.blocked, true);
    if (change === 'edit') assert.equal(await fs.readFile(f.file, 'utf8'), 'external edit');
    if (change === 'delete') await assert.rejects(fs.stat(f.file), { code: 'ENOENT' });
    if (change === 'replace') assert.equal(await fs.readFile(f.file, 'utf8'), formatted);
  }
  const f = await fixture(t); await fs.writeFile(f.file, JSON.stringify(JSON.parse(Buffer.from(f.bytes).toString()), null, 4)); await open(f);
  assert.equal((await f.service.saveCurrentProject(f.event, f.bytes, f.token)).status, 'saved');
});
test('cancelled/uncommitted file selection and Save As cannot retarget current Save; New detaches', async t => {
  const f = await fixture(t); await open(f); const other = path.join(f.dir, 'other.schemka.json'); await fs.writeFile(other, f.bytes);
  f.select(other); const selected = await f.service.open(f.event, f.token); assert.equal(selected.status, 'opened');
  f.select(null); assert.equal((await f.service.open(f.event, f.token)).status, 'cancelled');
  f.saveAt(null); assert.equal((await f.service.saveProject(f.event, f.bytes, f.token)).status, 'cancelled');
  f.state.project.name = 'Still original'; const edited = serializeProjectFile(f.state);
  assert.equal((await f.service.saveCurrentProject(f.event, edited, f.token)).status, 'saved');
  assert.deepEqual(await fs.readFile(other), Buffer.from(f.bytes));
  const newer = randomUUID(); assert.equal(f.service.documentChanged(f.event, f.token, newer).status, 'detached'); f.token = newer;
  assert.equal((await f.service.saveCurrentProject(f.event, edited, newer)).code, 'FILE_SESSION');
});
test('Save As binds only after acknowledgment and old binding remains until then', async t => {
  const f = await fixture(t); await open(f); const copy = path.join(f.dir, 'copy.arkita'); f.saveAt(copy);
  const saved = await f.service.saveProject(f.event, f.bytes, f.token); assert.equal(saved.status, 'saved'); assert.equal(saved.directory.file.name, 'model.arkita');
  const ack = f.service.documentChanged(f.event, f.token, f.token, saved.candidate); assert.equal(ack.directory.file.name, 'copy.arkita');
  f.state.project.name = 'Copy edit'; const edited = serializeProjectFile(f.state); assert.equal((await f.service.saveCurrentProject(f.event, edited, f.token)).status, 'saved');
  assert.deepEqual(await fs.readFile(f.file), Buffer.from(f.bytes)); assert.deepEqual(await fs.readFile(copy), Buffer.from(edited));
});
test('late open cannot bind a new document; current save completion stays detached', async t => {
  const opened = deferred(), release = deferred(); let delay = true;
  const f = await fixture(t, { readFileSnapshot: async file => { const result = await readProjectSnapshot(file); if (delay) { opened.resolve(); await release.promise; } return result; } });
  const opening = f.service.open(f.event, f.token); await opened.promise;
  const newer = randomUUID(); f.service.documentChanged(f.event, f.token, newer); f.token = newer; release.resolve();
  const result = await opening; assert.equal(result.candidate, null); assert.equal(result.directory.file, null);
  delay = false; await open(f);
  const writing = deferred(), finish = deferred();
  const g = await fixture(t, { writeCurrentFile: async (...args) => { const saved = await writeBoundProject(...args); writing.resolve(); await finish.promise; return saved; } }); await open(g);
  const saving = g.service.saveCurrentProject(g.event, g.bytes, g.token); await writing.promise;
  const next = randomUUID(); g.service.documentChanged(g.event, g.token, next); finish.resolve();
  const completed = await saving; assert.equal(completed.status, 'saved'); assert.equal(completed.directory.file, null);
});
test('bound snapshot rejects symlinks and an ancestor replacement even if bytes are unchanged', async t => {
  const f = await fixture(t), linked = path.join(f.dir, 'alias.arkita'); await fs.symlink(f.file, linked);
  await assert.rejects(readProjectSnapshot(linked), { code: 'FILE_TYPE' });
  const folder = path.join(f.dir, 'folder'); await fs.mkdir(folder); const file = path.join(folder, 'model.arkita'); await fs.writeFile(file, f.bytes);
  const { snapshot } = await readProjectSnapshot(file); await fs.rename(folder, folder + '-old'); await fs.mkdir(folder); await fs.writeFile(file, f.bytes);
  await assert.rejects(writeBoundProject(snapshot, f.bytes), { code: 'DIRECTORY_CHANGED' }); assert.deepEqual(await fs.readFile(file), Buffer.from(f.bytes));
});

test('late Save As cannot bind a new document', async t => {
  const started = deferred(), finish = deferred(); let hold = false;
  const f = await fixture(t, { readFileSnapshot: async file => { const result = await readProjectSnapshot(file); if (hold) { started.resolve(); await finish.promise; } return result; } });
  await open(f); hold = true; f.saveAt(path.join(f.dir, 'copy.arkita'));
  const saving = f.service.saveProject(f.event, f.bytes, f.token); await started.promise;
  const newer = randomUUID(); f.service.documentChanged(f.event, f.token, newer); finish.resolve();
  const saved = await saving; assert.equal(saved.status, 'saved'); assert.equal(saved.candidate, null); assert.equal(saved.directory.file, null);
});
test('failed bound write preserves binding for retry; failed readback reports conflict without adopting external bytes', async t => {
  let fail = true;
  const f = await fixture(t, { writeCurrentFile: async (...args) => { if (fail) throw Object.assign(Error('disk full'), { code: 'ENOSPC' }); return writeBoundProject(...args); } });
  const ack = await open(f), failed = await f.service.saveCurrentProject(f.event, f.bytes, f.token);
  assert.equal(failed.status, 'error'); assert.equal(failed.code, 'ENOSPC'); assert.equal(failed.directory.file.id, ack.directory.file.id); assert.equal(failed.directory.file.blocked, false);
  fail = false; assert.equal((await f.service.saveCurrentProject(f.event, f.bytes, f.token)).status, 'saved');
  let changed = false;
  const g = await fixture(t, { writeCurrentFile: (snapshot, bytes) => writeBoundProject(snapshot, bytes, { ...fs, link: async (from, to) => {
    await fs.link(from, to); if (to === snapshot.path) { changed = true; await fs.writeFile(to, 'external after write'); }
  } }) }); await open(g);
  g.state.project.name = 'Trigger a real write';
  const result = await g.service.saveCurrentProject(g.event, serializeProjectFile(g.state), g.token); assert.equal(result.status, 'error'); assert.equal(result.code, 'FILE_CHANGED'); assert.equal(result.directory.file.blocked, true); assert.equal(changed, true);
  assert.equal(await fs.readFile(g.file, 'utf8'), 'external after write');
});
