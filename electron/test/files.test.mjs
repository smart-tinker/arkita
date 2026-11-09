import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite, projectBytes, readProject, directoryBoundary, recoverProjectFile } from '../project-files.mjs';
import { createStore } from '../../schemka-model-core/src/index.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { createProjectSession } from '../../schemka-model-ui/src/project-session.js';
import { createBlankModel } from '../../schemka-model-ui/src/demo.js';
import { PROJECT_FILE_LIMITS, serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const bytes = () => serializeProjectFile(createBlankModel().snapshot);
async function fixture(t) { const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-files-'))); t.after(() => fs.rm(dir, { recursive: true, force: true })); return { dir, file: path.join(dir, 'test.schemka.json') }; }
const fail = code => Object.assign(new Error(`injected ${code}`), { code });
const proxy = (handle, overrides) => new Proxy(handle, { get(target, key) { return overrides[key] ?? (typeof target[key] === 'function' ? target[key].bind(target) : target[key]); } });
const ordinaryEntries = async dir => (await fs.readdir(dir)).filter(name => !name.startsWith('.schemka-transaction-'));

test('directory verification checks every known ancestor once and detects a regular replacement without a validity cache', async t => {
  const { dir } = await fixture(t), child = path.join(dir, 'child'), nested = path.join(child, 'nested');
  await fs.mkdir(nested, { recursive: true });
  const observed = [];
  const guard = await directoryBoundary(dir, { ...fs, lstat: async (...args) => { observed.push(args[0]); return fs.lstat(...args); } });
  await guard.check(nested); const expected = [...new Set(observed)]; observed.length = 0;
  await guard.verify(); assert.deepEqual(observed, expected);
  await fs.rename(child, `${child}-original`); await fs.mkdir(nested, { recursive: true });
  await assert.rejects(guard.verify(), { code: 'DIRECTORY_CHANGED' });
});

test('real filesystem + session: open/edit/atomic save/reopen keeps IDs, raw strings, typed profiles and exact values', async t => {
  const { file, dir } = await fixture(t);
  const store = createStore(customizationProject({ currency: { type: 'Currency', default: { amount: '-123.4500', currency: 'USD' } } }));
  const session = createProjectSession(store);
  const save = async () => { const ticket = session.prepareSave(); await atomicWrite(file, ticket.bytes); session.completeSave(ticket); };
  const reopen = async () => { const result = await readProject(file); await session.loadFile(session.beginLoad(),
    { name: result.name, size: result.bytes.length, arrayBuffer: async () => result.bytes.slice().buffer }); };
  await save(); await reopen(); assert.equal(session.dirty, false);
  store.execute({ type: 'renameProject', name: 'Synthetic edited model' }, store.revision); assert.equal(session.dirty, true);
  const saved = serializeProjectFile(store.snapshot), expected = store.snapshot;
  await save(); assert.equal(session.dirty, false);
  assert.deepEqual((await readProject(file)).bytes, saved);
  store.execute({ type: 'renameProject', name: 'Unsaved later edit' }, store.revision);
  await reopen(); assert.deepEqual(store.snapshot, expected); assert.equal(session.dirty, false);
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
  assert.equal(store.snapshot.customizationProfiles[0].attributes.currency.default.amount, '-123.4500');
  assert.deepEqual(await ordinaryEntries(dir), ['test.schemka.json']);
});
test('bounded reads reject empty, oversized and nonregular files; malformed bytes fail codec without writes', async t => {
  const { file, dir } = await fixture(t);
  await fs.writeFile(file, ''); await assert.rejects(readProject(file), { code: 'FILE_SIZE' });
  const handle = await fs.open(file, 'w'); await handle.truncate(PROJECT_FILE_LIMITS.bytes + 1); await handle.close();
  await assert.rejects(readProject(file), { code: 'FILE_SIZE' });
  await assert.rejects(readProject(dir), { code: 'FILE_TYPE' });
  assert.throws(() => projectBytes(new Uint8Array()), { code: 'FILE_SIZE' });
  assert.throws(() => projectBytes('path'), { code: 'FILE_SIZE' });
  assert.throws(() => projectBytes(new Uint8Array(PROJECT_FILE_LIMITS.bytes + 1)), { code: 'FILE_SIZE' });
  await fs.writeFile(file, '{bad'); const invalid = await readProject(file);
  assert.throws(() => projectBytes(invalid.bytes)); assert.equal(await fs.readFile(file, 'utf8'), '{bad');
});
test('read detects growth/truncation and always closes the file handle', async () => {
  for (const actual of [1, 3]) {
    let closed = false;
    const io = { open: async () => ({ stat: async () => ({ isFile: () => true, size: 2, mtimeMs: 1, ctimeMs: 1 }),
      read: async (_buffer, offset) => ({ bytesRead: offset ? 0 : actual }), close: async () => { closed = true; } }) };
    await assert.rejects(readProject('main-only', io), { code: 'FILE_CHANGED' }); assert.equal(closed, true);
  }
});
test('partial write, sync, close and displacement failure preserve destination bytes and explicit recovery copies', async t => {
  for (const stage of ['writeFile', 'sync', 'close', 'rename']) {
    const { file, dir } = await fixture(t);
    await fs.writeFile(file, 'original'); let thrown = false;
    const io = { ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      if (!(args[1] & constants.O_WRONLY) || !args[0].endsWith(path.join('pending', 'file.bin'))) return handle;
      return proxy(handle, { writeFile: async data => { if (stage === 'writeFile') { await handle.writeFile(data.subarray(0, 8)); throw fail('ENOSPC'); } await handle.writeFile(data); },
        sync: async () => { if (stage === 'sync') throw fail('EIO'); await handle.sync(); },
        close: async () => { await handle.close(); if (stage === 'close' && !thrown) { thrown = true; throw fail('EIO'); } } });
    }, rename: async (...args) => { if (stage === 'rename') throw fail('EACCES'); return fs.rename(...args); } };
    let failed;
    await assert.rejects(atomicWrite(file, bytes(), io), error => { failed = error; return /injected/.test(error.message); });
    assert.equal(await fs.readFile(file, 'utf8'), 'original');
    assert.ok(failed.transactionPath); assert.ok((await fs.lstat(failed.recoveryMarkerPath)).isFile());
    await recoverProjectFile(failed.recoveryMarkerPath, 'before');
    assert.deepEqual(await ordinaryEntries(dir), ['test.schemka.json']);
  }
});
test('create failure never unlinks an unowned path; probe cleanup failure identifies recoverable evidence', async t => {
  const { file, dir } = await fixture(t); await fs.writeFile(file, 'original'); let unlinked = false;
  await assert.rejects(atomicWrite(file, bytes(), { ...fs, open: async () => { throw fail('EACCES'); }, unlink: async () => { unlinked = true; } }));
  assert.equal(unlinked, false);
  let error;
  await assert.rejects(atomicWrite(file, bytes(), { ...fs, rename: async () => { throw fail('EACCES'); }, unlink: async () => { throw fail('EACCES'); } }), value => { error = value; return value.code === 'EACCES'; });
  assert.equal(await fs.readFile(file, 'utf8'), 'original'); assert.ok(error.transactionPath); assert.ok(error.recoveryMarkerPath);
  await recoverProjectFile(error.recoveryMarkerPath, 'before'); assert.deepEqual(await ordinaryEntries(dir), ['test.schemka.json']);
});
test('changed destination and symlink are not overwritten', async t => {
  const { file, dir } = await fixture(t); await fs.writeFile(file, 'original'); let calls = 0;
  const io = { ...fs, lstat: async (target, options) => { if (target === file && ++calls === 2) await fs.writeFile(file, 'external update'); return fs.lstat(target, options); } };
  await assert.rejects(atomicWrite(file, bytes(), io), { code: 'FILE_CHANGED' });
  assert.equal(await fs.readFile(file, 'utf8'), 'external update');
  const link = path.join(dir, 'link'); await fs.symlink(file, link);
  await assert.rejects(atomicWrite(link, bytes()), { code: 'FILE_TYPE' }); assert.equal(await fs.readFile(file, 'utf8'), 'external update');
});

test('R1: ancestor identity swaps during export staging preserve protected targets and retain the original recovery data', async t => {
  const { dir } = await fixture(t);
  for (const kind of ['symlink', 'directory']) {
    const parent = path.join(dir, `safe-${kind}`), moved = `${parent}-original`, protectedRoot = path.join(dir, `protected-${kind}`);
    await fs.mkdir(parent); await fs.mkdir(protectedRoot); await fs.writeFile(path.join(protectedRoot, 'target'), 'protected'); let changed = false;
    const io = { ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      if (!(args[1] & constants.O_WRONLY) || !args[0].endsWith(path.join('pending', 'file.bin'))) return handle;
      return proxy(handle, { writeFile: async data => {
        await handle.writeFile(data); if (changed) return; changed = true; await fs.rename(parent, moved);
        if (kind === 'symlink') await fs.symlink(protectedRoot, parent); else { await fs.mkdir(parent); await fs.writeFile(path.join(parent, 'target'), 'replacement-directory'); }
      } });
    } };
    await assert.rejects(atomicWrite(path.join(parent, 'target'), bytes(), io)); assert.equal(changed, true);
    assert.equal(await fs.readFile(path.join(protectedRoot, 'target'), 'utf8'), 'protected');
    assert.ok((await fs.readdir(moved)).some(name => name.startsWith('.schemka-transaction-')));
    if (kind === 'directory') assert.equal(await fs.readFile(path.join(parent, 'target'), 'utf8'), 'replacement-directory');
  }
});

test('R1: a replaced pending path is never removed and the original destination remains untouched', async t => {
  const { dir, file } = await fixture(t); await fs.writeFile(file, 'original'); let replacement;
  const io = { ...fs, open: async (...args) => {
    const handle = await fs.open(...args);
    if (!(args[1] & constants.O_WRONLY) || !args[0].endsWith(path.join('pending', 'file.bin'))) return handle;
    replacement = args[0];
    return proxy(handle, { writeFile: async data => {
      await handle.writeFile(data); await fs.rename(replacement, `${replacement}.original`); await fs.writeFile(replacement, 'external-temp'); throw fail('EIO');
    } });
  } };
  await assert.rejects(atomicWrite(file, bytes(), io), { code: 'EIO' }); assert.equal(await fs.readFile(file, 'utf8'), 'original'); assert.equal(await fs.readFile(replacement, 'utf8'), 'external-temp');
});

test('documentation: temporary native file save/edit/reopen preserves exact shared text, profiles, geometry and session history', async t => {
  const { file, dir } = await fixture(t), initial = customizationProject({ raw: { type: 'String', default: 'exact\r\nprofile' } });
  const store = createStore(initial), session = createProjectSession(store);
  const save = async () => { const ticket = session.prepareSave(); await atomicWrite(file, ticket.bytes); session.completeSave(ticket); return ticket.bytes; };
  const reopen = async () => { const opened = await readProject(file); await session.loadFile(session.beginLoad(), { name: opened.name, size: opened.bytes.length, arrayBuffer: async () => opened.bytes.slice().buffer }); };
  const originalBytes = await save(); await reopen(); assert.deepEqual(serializeProjectFile(store.snapshot), originalBytes);
  const expected = store.snapshot;
  for (const kind of ['element', 'junction']) {
    const concept = { kind, id: expected[`${kind}s`][0].id }, documentation = ` \r\n${kind}\r<script>inert()</script> 日本語 😀 `;
    store.execute({ type: 'updateConceptDocumentation', concept, documentation }, store.revision); expected[`${kind}s`][0].documentation = documentation;
  }
  assert.deepEqual(store.snapshot, expected); assert.equal(session.dirty, true); assert.deepEqual(store.history, { undo: 2, redo: 0 });
  const bytes = await save(); assert.deepEqual((await readProject(file)).bytes, bytes); assert.equal(session.dirty, false);
  store.undo(store.revision); assert.equal(session.dirty, true); store.redo(store.revision); assert.equal(session.dirty, false);
  await reopen(); assert.deepEqual(store.snapshot, expected); assert.deepEqual(store.history, { undo: 0, redo: 0 }); assert.equal(session.dirty, false);
  assert.deepEqual(serializeProjectFile(store.snapshot), bytes); assert.deepEqual(await ordinaryEntries(dir), ['test.schemka.json']);
  assert.deepEqual(store.snapshot.views, initial.views); assert.deepEqual(store.snapshot.relationships, initial.relationships);
});
