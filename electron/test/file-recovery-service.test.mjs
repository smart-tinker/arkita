import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_URL } from '../boundary.mjs';
import { createFileService, prepareFileOpen } from '../file-service.mjs';
import { atomicWrite, readProjectSnapshot, writeBoundProject, recoverProjectFile } from '../project-files.mjs';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const failure = () => Object.assign(Error('injected write interruption'), { code: 'EIO' });
const encode = state => Buffer.from(serializeProjectFile(state));
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-file-recovery-ui-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'model.arkita'), before = createProject('Before'), after = structuredClone(before);
  after.project.name = 'After!'; await fs.writeFile(file, encode(before));
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  let selected = file, destination = path.join(root, 'saved.arkita'), choice = async () => 0;
  const prompts = [], errors = [];
  const service = createFileService({ window, dialog: {
    showOpenDialog: async () => ({ canceled: selected === null, filePaths: selected ? [selected] : [] }),
    showSaveDialog: async () => ({ canceled: destination === null, filePath: destination }),
    showMessageBox: async (_window, dialog) => { prompts.push(dialog); return { response: await choice(dialog) }; },
    showErrorBox: (...args) => errors.push(args),
  }, ...options });
  return { root, file, before, after, window, event, service, prompts, errors, token: randomUUID(),
    select(value) { selected = value; }, saveAt(value) { destination = value; }, choose(fn) { choice = fn; } };
}
async function bind(f) {
  const result = await f.service.open(f.event, f.token); assert.equal(result.status, 'opened');
  const token = randomUUID(), ack = f.service.documentChanged(f.event, f.token, token, result.candidate);
  assert.equal(ack.status, 'bound'); f.token = token; return ack.directory.file;
}
async function interrupt(f, { external = null, target = f.file, raw = null, phase = 'before-move' } = {}) {
  let error, fired = false;
  const io = { ...fs, rename: async (from, to) => {
    if (from === target && !fired) {
      fired = true;
      if (external) { await fs.writeFile(from, external); return fs.rename(from, to); }
      if (phase === 'before-move') throw failure();
    }
    return fs.rename(from, to);
  }, link: async (from, to) => {
    const result = await fs.link(from, to);
    if (to === target && phase === 'after-publish') { fired = true; throw failure(); }
    return result;
  } };
  await assert.rejects(atomicWrite(target, raw ?? encode(f.after), io), value => { error = value; return true; });
  assert.equal(fired, true); assert.equal(error.recoveryRequired, true);
  return error;
}
function assertPrivate(result, root) {
  assert.doesNotMatch(JSON.stringify(result), new RegExp(root));
  for (const key of ['path', 'snapshot', 'transactionPath', 'recoveryMarkerPath', 'target', 'tx']) assert.equal(Object.hasOwn(result, key), false, key);
}

test('native recovery cancellation preserves bytes, marker and current binding without proposing a replacement', async t => {
  const f = await fixture(t), binding = await bind(f), error = await interrupt(f);
  const marker = await fs.readFile(error.recoveryMarkerPath);
  f.select(error.recoveryMarkerPath);
  const result = await f.service.open(f.event, f.token);
  assert.equal(result.status, 'cancelled'); assert.deepEqual(result.directory.file, binding);
  assert.equal(Object.hasOwn(result, 'candidate'), false); assertPrivate(result, f.root);
  assert.deepEqual(await fs.readFile(f.file), encode(f.before)); assert.deepEqual(await fs.readFile(error.recoveryMarkerPath), marker);
  assert.equal(f.prompts.length, 1); assert.equal(f.prompts[0].defaultId, 0); assert.equal(f.prompts[0].cancelId, 0);
  assert.deepEqual(f.prompts[0].buttons, ['Отмена', 'Вернуть до сохранения', 'Завершить сохранение']);
  assert.match(f.prompts[0].detail, /Открытая модель и история сохраняются/);
});

for (const side of ['before', 'after', 'displaced']) test(`native recovery ${side} restores exact bytes and binds only after model acknowledgment`, async t => {
  const f = await fixture(t), binding = await bind(f), external = encode({ ...f.before, project: { ...f.before.project, name: 'External' } });
  const error = await interrupt(f, side === 'displaced' ? { external } : {});
  f.select(side === 'after' ? error.recoveryMarkerPath : f.file);
  f.choose(dialog => dialog.buttons.indexOf(side === 'before' ? 'Вернуть до сохранения' : side === 'after' ? 'Завершить сохранение' : 'Вернуть внешнюю версию'));
  const result = await f.service.open(f.event, f.token), bytes = side === 'displaced' ? external : encode(f[side]);
  assert.equal(result.status, 'opened'); assert.equal(result.recovered, true); assert.ok(result.candidate);
  assert.equal(result.directory.file.id, binding.id); assert.match(result.warning, /каталоге восстановления/); assertPrivate(result, f.root);
  assert.deepEqual(Buffer.from(result.bytes), bytes); assert.deepEqual(await fs.readFile(f.file), bytes);
  await assert.rejects(fs.lstat(error.recoveryMarkerPath), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'before.bin')), encode(f.before));
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'after.bin')), encode(f.after));
  const current = randomUUID(), ack = f.service.documentChanged(f.event, f.token, current, result.candidate);
  assert.equal(ack.status, 'bound'); assert.notEqual(ack.directory.file.id, binding.id); assert.equal(ack.directory.file.blocked, false);
});

test('new-file recovery offers only the existing intended snapshot and then proposes a model', async t => {
  const f = await fixture(t), target = path.join(f.root, 'new.arkita');
  const error = await interrupt(f, { target, phase: 'after-publish' }); f.select(error.recoveryMarkerPath);
  f.choose(dialog => { assert.deepEqual(dialog.buttons, ['Отмена', 'Завершить сохранение']); return 1; });
  const result = await f.service.open(f.event, f.token);
  assert.equal(result.status, 'opened'); assert.equal(result.name, 'new.arkita'); assert.equal(result.directory.file, null);
  assert.deepEqual(await fs.readFile(target), encode(f.after));
});

test('stale document and dead sender prevent the chosen recovery mutation after the native dialog', async t => {
  for (const stale of ['document', 'sender']) {
    let recoveries = 0;
    const f = await fixture(t, { recoverFile: async (...args) => { recoveries++; return recoverProjectFile(...args); } });
    await bind(f); const error = await interrupt(f), marker = await fs.readFile(error.recoveryMarkerPath), shown = deferred(), finish = deferred();
    f.choose(async () => { shown.resolve(); return finish.promise; });
    const pending = f.service.open(f.event, f.token); await shown.promise;
    if (stale === 'document') f.service.documentChanged(f.event, f.token, randomUUID()); else f.window.isDestroyed = () => true;
    finish.resolve(2); const result = await pending;
    assert.equal(result.code, stale === 'document' ? 'DIRECTORY_SESSION' : 'IPC_SENDER'); assert.equal(recoveries, 0);
    assert.deepEqual(await fs.readFile(f.file), encode(f.before)); assert.deepEqual(await fs.readFile(error.recoveryMarkerPath), marker);
  }
});

test('invalid or changed recovery evidence never proposes a model or retargets its binding', async t => {
  for (const phase of ['before-dialog', 'during-dialog']) {
    const f = await fixture(t), binding = await bind(f), error = await interrupt(f);
    const damage = () => fs.writeFile(path.join(error.transactionPath, 'after.bin'), 'damaged evidence');
    if (phase === 'before-dialog') await damage(); else f.choose(async () => { await damage(); return 2; });
    const result = await f.service.open(f.event, f.token);
    assert.equal(result.status, 'error'); assert.equal(Object.hasOwn(result, 'candidate'), false); assert.equal(result.directory.file.id, binding.id);
    assert.equal(f.prompts.length, phase === 'before-dialog' ? 0 : 1); assert.deepEqual(await fs.readFile(f.file), encode(f.before));
    await fs.stat(error.recoveryMarkerPath);
  }
});

test('recovered non-model bytes or a subsequent read failure report disk success without replacing the open model', async t => {
  for (const kind of ['svg', 'read-error']) {
    let failRead = false;
    const f = await fixture(t, { readFileSnapshot: async file => { if (failRead) throw failure(); return readProjectSnapshot(file); },
      recoverFile: async (...args) => { const result = await recoverProjectFile(...args); failRead = kind === 'read-error'; return result; } });
    const binding = await bind(f), target = kind === 'svg' ? path.join(f.root, 'view.svg') : f.file;
    if (kind === 'svg') await fs.writeFile(target, '<svg>Before</svg>');
    const raw = kind === 'svg' ? Buffer.from('<svg>After</svg>') : encode(f.after);
    const error = await interrupt(f, { target, raw }); f.select(error.recoveryMarkerPath); f.choose(() => 2);
    const result = await f.service.open(f.event, f.token);
    assert.equal(result.status, 'recovered'); assert.match(result.message, /восстановлен на диске, но не открыт/);
    assert.equal(Object.hasOwn(result, 'bytes'), false); assert.equal(Object.hasOwn(result, 'candidate'), false); assertPrivate(result, f.root);
    assert.equal(result.directory.file.id, binding.id); assert.deepEqual(await fs.readFile(target), raw);
    await assert.rejects(fs.lstat(error.recoveryMarkerPath), { code: 'ENOENT' });
    assert.deepEqual(f.errors, []);
  }
});

test('a marked EIO blocks retries while new-file saves clean only their own completed journals', async t => {
  const f = await fixture(t, { writeCurrentFile: (snapshot, bytes) => writeBoundProject(snapshot, bytes, { ...fs,
    rename: async () => { throw failure(); } }) });
  const binding = await bind(f), failed = await f.service.saveCurrentProject(f.event, encode(f.after), f.token);
  assert.equal(failed.code, 'EIO'); assert.equal(failed.directory.file.blocked, true); assert.equal(failed.directory.file.id, binding.id);
  assert.ok(f.errors[0][1].includes(f.root)); assertPrivate(failed, f.root);
  const retry = await f.service.saveCurrentProject(f.event, encode(f.after), f.token); assert.equal(retry.code, 'FILE_CHANGED');
  const saved = await f.service.saveProject(f.event, encode(f.after), f.token); assert.equal(saved.status, 'saved'); assert.equal(saved.warning, undefined); assertPrivate(saved, f.root);
  f.saveAt(path.join(f.root, 'view.mmd'));
  assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR\nA-->B')).warning, undefined);
  f.saveAt(path.join(f.root, 'view.svg'));
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
  assert.equal((await f.service.saveSvg(f.event, svg)).warning, undefined);
  assert.equal((await fs.readdir(f.root)).filter(name => name.startsWith('.schemka-transaction-')).length, 1, 'failed save evidence remains');
});

for (const apply of [false, true]) test(`parentless startup recovery ${apply ? 'applies' : 'cancels'} without creating a placeholder document`, async t => {
  const f = await fixture(t), error = await interrupt(f), marker = await fs.readFile(error.recoveryMarkerPath);
  let prompts = 0;
  const result = await prepareFileOpen(f.file, { dialog: { showMessageBox: async (...args) => {
    assert.equal(args.length, 1, 'no fabricated parent window'); prompts++;
    const [options] = args; assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0);
    assert.deepEqual(options.buttons, ['Отмена', 'Вернуть до сохранения', 'Завершить сохранение']);
    return { response: apply ? 2 : 0 };
  } } });
  assert.equal(prompts, 1); assert.equal(result.status, apply ? 'opened' : 'cancelled');
  if (apply) {
    assert.equal(result.recovered, true); assert.match(result.warning, /каталоге восстановления/);
    assert.deepEqual(Buffer.from(result.prepared.bytes), encode(f.after));
    assert.equal(result.prepared.snapshot.path, f.file);
    await assert.rejects(fs.lstat(error.recoveryMarkerPath), { code: 'ENOENT' });
  } else {
    assert.equal(Object.hasOwn(result, 'prepared'), false);
    assert.deepEqual(await fs.readFile(error.recoveryMarkerPath), marker);
  }
  assert.deepEqual(await fs.readFile(f.file), encode(apply ? f.after : f.before));
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'before.bin')), encode(f.before));
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'after.bin')), encode(f.after));
});
