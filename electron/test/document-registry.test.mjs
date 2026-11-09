import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createDocumentRegistry, launchFiles } from '../document-registry.mjs';
import { createFileService } from '../file-service.mjs';
import { APP_URL } from '../boundary.mjs';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function window() {
  const result = new EventEmitter(); result.webContents = { mainFrame: { url: APP_URL } }; result.focused = 0;
  result.isDestroyed = () => Boolean(result.closed); result.isMinimized = () => false; result.show = () => {}; result.focus = () => result.focused++;
  return result;
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-documents-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const picks = [], dialog = { showOpenDialog: async () => picks.shift(), showErrorBox() {} };
  let registry;
  async function create(initial) {
    const record = { window: window(), initial, git: { busy: false }, openBusy: false };
    record.files = createFileService({ window: record.window, dialog, assertDestination: file => registry.assertAvailable(file, record) });
    registry.register(record); return record;
  }
  registry = createDocumentRegistry({ create, dialog });
  async function write(name, state = createProject('Same name')) { const file = path.join(root, name); await fs.writeFile(file, serializeProjectFile(state)); return file; }
  return { root, registry, picks, create, write };
}
test('OS argv preserves spaces/cyrillic as one path and ignores switches and unrelated files', () => {
  const cwd = path.resolve('selected'), model = path.join(cwd, 'Моя модель.arkita');
  assert.deepEqual(launchFiles(['Arkita.exe', model, '--debug', path.join(cwd, 'readme.txt'), 'relative.arkita'], cwd), [model, path.join(cwd, 'relative.arkita')]);
});
test('equivalent paths/inodes focus the existing document while equal names and IDs in distinct files remain isolated', async t => {
  const f = await fixture(t), model = createProject('Same'), a = await f.write('Моя модель.arkita', model), b = await f.write('Other.arkita', model);
  assert.equal((await f.registry.open(a)).status, 'opened-window'); const first = f.registry.records[0];
  assert.equal((await f.registry.open(path.join(f.root, '.', 'Моя модель.arkita'))).status, 'focused');
  const link = path.join(f.root, 'hardlink.arkita'); await fs.link(a, link);
  assert.equal((await f.registry.open(link)).status, 'focused'); assert.equal(f.registry.records.length, 1);
  await fs.unlink(link); assert.equal((await f.registry.open(b)).status, 'opened-window');
  assert.equal(f.registry.records.length, 2); assert.notEqual(first.files, f.registry.records[1].files);
  const event = { sender: first.window.webContents, senderFrame: first.window.webContents.mainFrame };
  assert.equal(f.registry.resolve(event), first); assert.equal(f.registry.resolve({ ...event, senderFrame: { url: APP_URL } }), undefined);
  await assert.rejects(f.registry.assertAvailable(a, f.registry.records[1]), error => error.code === 'DOCUMENT_OPEN');
  await f.registry.assertAvailable(a, first);
  first.window.closed = true; first.window.emit('closed'); assert.equal(f.registry.records.length, 1);
  assert.equal((await f.registry.open(a)).status, 'opened-window');
});
test('invalid files and cancelled pick do not create windows; queued duplicate opens never create two writers', async t => {
  const f = await fixture(t), current = await f.create({ kind: 'new' }), good = await f.write('good.arkita'), bad = path.join(f.root, 'bad.arkita');
  await fs.writeFile(bad, '{broken'); await assert.rejects(f.registry.open(bad)); assert.equal(f.registry.records.length, 1);
  f.picks.push({ canceled: true }); assert.equal((await f.registry.pick(current)).status, 'cancelled');
  const results = await Promise.all([f.registry.open(good), f.registry.open(good)]);
  assert.deepEqual(results.map(result => result.status), ['opened-window', 'focused']); assert.equal(f.registry.records.length, 2);
});
test('a native picker remains owned by its original window and a busy document blocks overlapping native work', async t => {
  const f = await fixture(t), a = await f.create({ kind: 'new' }), b = await f.create({ kind: 'new' });
  a.git.busy = true; assert.equal((await f.registry.pick(a)).code, 'FILE_BUSY'); assert.equal((await f.registry.pick(b)).code, 'FILE_BUSY'); a.git.busy = false;
  const request = deferred(); f.picks.push(request.promise); const opened = f.registry.pick(a);
  assert.equal(a.openBusy, true); assert.equal((await f.registry.pick(b)).code, 'FILE_BUSY');
  request.resolve({ canceled: true }); assert.equal((await opened).status, 'cancelled'); assert.equal(a.openBusy, false);
});
