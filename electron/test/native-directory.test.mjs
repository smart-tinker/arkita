import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { createNativeDirectory, readNativeDirectory, INCOMPLETE_MARKER, RECOVERY_MARKER, DIRECTORY_LIMITS } from '../native-directory.mjs';
import { createProject, createStore, exportFiles, LIMITS } from '../../schemka-model-core/src/index.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { createProjectSession } from '../../schemka-model-ui/src/project-session.js';
const bytes = () => serializeProjectFile(createProject('Synthetic directory'));
const injected = () => Object.assign(Error('injected failure'), { code: 'EIO' });
async function fixture(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-directory-test-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
async function saved(t, state = createProject('Synthetic directory')) { const dir = await fixture(t), result = await createNativeDirectory(dir, serializeProjectFile(state)); return { dir, root: path.join(dir, result.name), state }; }
async function rawTree(root, state) { return Promise.all(exportFiles(state).map(async f => ({ path: f.path, content: await fs.readFile(path.join(root, f.path), 'utf8') }))); }
function wrapped(io, wrap) { return { ...io, open: async (...args) => wrap(await io.open(...args), ...args) }; }
function handleProxy(handle, methods) { return new Proxy(handle, { get(target, key) { return methods[key] ?? (typeof target[key] === 'function' ? target[key].bind(target) : target[key]); } }); }

test('fresh canonical directory roundtrip preserves every rich record byte, IDs, profiles, anchors and raw multiplicity; save preserves history', async t => {
  const parent = await fixture(t), state = customizationProject({ amount: { type: 'Currency', default: { amount: '-123.4500', currency: 'USD' } } });
  const store = createStore(state), session = createProjectSession(store);
  store.execute({ type: 'renameProject', name: 'Saved synthetic rich model' }, store.revision);
  const ticket = session.prepareSave(), history = store.history;
  const result = await createNativeDirectory(parent, ticket.bytes), root = path.join(parent, result.name);
  assert.equal(session.dirty, true); session.completeSave(ticket); assert.equal(session.dirty, false); assert.deepEqual(store.history, history);
  assert.deepEqual(await rawTree(root, store.snapshot), exportFiles(store.snapshot));
  assert.deepEqual(exportFiles(deserializeProjectFile((await readNativeDirectory(root)).bytes)), exportFiles(store.snapshot));
  await assert.rejects(fs.lstat(path.join(root, INCOMPLETE_MARKER)), { code: 'ENOENT' });
});

test('exclusive fresh child never writes existing empty/populated directories, symlinks, files or .git', async t => {
  const parent = await fixture(t);
  await fs.mkdir(path.join(parent, 'empty')); await fs.mkdir(path.join(parent, '.git')); await fs.writeFile(path.join(parent, '.git', 'sentinel'), 'git');
  await fs.writeFile(path.join(parent, 'file'), 'untouched'); await fs.symlink(path.join(parent, 'empty'), path.join(parent, 'link'));
  const first = await createNativeDirectory(parent, bytes()), second = await createNativeDirectory(parent, bytes()); assert.notEqual(first.name, second.name);
  assert.deepEqual(await fs.readdir(path.join(parent, 'empty')), []); assert.equal(await fs.readFile(path.join(parent, '.git', 'sentinel'), 'utf8'), 'git'); assert.equal(await fs.readFile(path.join(parent, 'file'), 'utf8'), 'untouched');
  await assert.rejects(createNativeDirectory(path.join(parent, 'link'), bytes()), { code: 'DIRECTORY_TYPE' });
  await assert.rejects(createNativeDirectory(path.join(parent, 'file'), bytes()), { code: 'DIRECTORY_TYPE' });
});

test('injected marker/model open, write, sync, close, mkdir, readback and marker removal failures retain incomplete child and retry creates another', async t => {
  const parent = await fixture(t);
  for (const stage of ['mkdtemp', 'marker-open', 'marker-writeFile', 'marker-sync', 'marker-close', 'mkdir', 'model-open', 'model-writeFile', 'model-sync', 'model-close', 'readback', 'unlink']) {
    const state = customizationProject(); let root, thrown = false, handles = 0;
    let io = { ...fs, mkdtemp: async prefix => { if (stage === 'mkdtemp') throw injected(); return root = await fs.mkdtemp(prefix); },
      mkdir: async (...args) => { if (stage === 'mkdir') throw injected(); return fs.mkdir(...args); },
      opendir: async (...args) => { if (stage === 'readback' && root && args[0] === root) throw injected(); return fs.opendir(...args); },
      unlink: async (...args) => { if (stage === 'unlink') throw injected(); return fs.unlink(...args); } };
    io = wrapped(io, (handle, target, flags) => {
      const writing = Boolean(flags & constants.O_WRONLY), kind = path.basename(target) === INCOMPLETE_MARKER ? 'marker' : 'model'; handles++;
      return handleProxy(handle, {
        writeFile: async data => { if (writing && stage === `${kind}-writeFile`) { await handle.writeFile(data.subarray(0, 1)); throw injected(); } await handle.writeFile(data); },
        sync: async () => { if (stage === `${kind}-sync`) throw injected(); await handle.sync(); },
        close: async () => { await handle.close(); handles--; if (writing && stage === `${kind}-close` && !thrown) { thrown = true; throw injected(); } },
      });
    });
    const open = io.open; io.open = async (target, flags, ...rest) => { const kind = path.basename(target) === INCOMPLETE_MARKER ? 'marker' : 'model'; if ((flags & constants.O_WRONLY) && stage === `${kind}-open`) throw injected(); return open(target, flags, ...rest); };
    await assert.rejects(createNativeDirectory(parent, serializeProjectFile(state), io), /injected failure/, stage); assert.equal(handles, 0, stage);
    if (root) { assert.ok((await fs.lstat(root)).isDirectory()); await assert.rejects(readNativeDirectory(root)); const retry = await createNativeDirectory(parent, bytes()); assert.notEqual(path.basename(root), retry.name); }
  }
});

test('any reserved marker presence blocks open and identifies its kind, including malformed, oversized, nonregular, alias and symlink', async t => {
  for (const name of [INCOMPLETE_MARKER, RECOVERY_MARKER, INCOMPLETE_MARKER.toUpperCase(), RECOVERY_MARKER.toUpperCase()]) {
    const { root } = await saved(t); const marker = path.join(root, name);
    const incomplete = { code: 'DIRECTORY_INCOMPLETE', incompleteMarker: name.toLowerCase() };
    for (const payload of ['', '{', '{"version":1,"version":1}', 'x'.repeat(DIRECTORY_LIMITS.markerBytes + 1)]) {
      await fs.writeFile(marker, payload); await assert.rejects(readNativeDirectory(root), incomplete);
    }
    await fs.unlink(marker); await fs.mkdir(marker); await assert.rejects(readNativeDirectory(root), incomplete); await fs.rmdir(marker);
    await fs.symlink(path.join(root, 'missing'), marker); await assert.rejects(readNativeDirectory(root), incomplete);
  }
});

test('reader ignores unowned root/nested content and .git without traversing; rejects native aliases, malformed paths, missing view and symlinks', async t => {
  const { root, state } = await saved(t, customizationProject());
  for (const relative of ['.git', 'unowned', 'model/elements/notes']) await fs.symlink('/definitely-unavailable-synthetic', path.join(root, relative));
  await fs.writeFile(path.join(root, 'readme.txt'), 'unowned');
  const io = { ...fs, opendir: async target => { assert.ok(!/(\.git|unowned|notes)$/.test(target)); return fs.opendir(target); } };
  assert.deepEqual(exportFiles(deserializeProjectFile((await readNativeDirectory(root, io)).bytes)), exportFiles(state));
  for (const relative of ['SCHEMKA.JSON', 'model/ELEMENTS', 'model/elements/el-bad.json', 'views/view-bad']) {
    await fs.writeFile(path.join(root, relative), '{}'); await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_PATH' }); await fs.unlink(path.join(root, relative));
  }
  const header = path.join(root, `views/${state.views[0].view.id}/view.json`); await fs.rename(header, `${header}.backup`);
  await assert.rejects(readNativeDirectory(root), { code: 'REFERENCE' }); await fs.rename(`${header}.backup`, header);
  const record = path.join(root, 'schemka.json'); await fs.rename(record, `${record}.backup`); await fs.symlink(`${record}.backup`, record);
  await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_TYPE' });
});

test('bounded reader rejects invalid UTF8, BOM, JSON, duplicate keys, depth, size and record count before import', async t => {
  const { root } = await saved(t); const file = path.join(root, 'schemka.json'), original = await fs.readFile(file);
  for (const content of [Buffer.from([0xff]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]), '{', '{"x":1,"x":2}', '['.repeat(26) + '0' + ']'.repeat(26)]) { await fs.writeFile(file, content); await assert.rejects(readNativeDirectory(root)); }
  const handle = await fs.open(file, 'w'); await handle.truncate(LIMITS.fileBytes + 1); await handle.close(); await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_LIMIT' });
  await fs.writeFile(file, original); await fs.mkdir(path.join(root, 'model/elements'), { recursive: true });
  for (let i = 0; i < LIMITS.files; i++) await fs.writeFile(path.join(root, `model/elements/${fixtureId('el', i + 1)}.json`), '{}');
  await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_LIMIT' });
});

test('entry cap uses bounded streaming traversal, without allocating an unbounded directory listing', async t => {
  const { root } = await saved(t); let reads = 0, closed = false;
  const io = { ...fs, opendir: async () => ({ read: async () => { reads++; return { name: 'ignored' }; }, close: async () => { closed = true; } }) };
  await assert.rejects(readNativeDirectory(root, io), { code: 'DIRECTORY_LIMIT' }); assert.equal(reads, DIRECTORY_LIMITS.entries + 1); assert.equal(closed, true);
});

test('same-size write after read, replaced file/root/ancestor and new canonical record invalidate observation', async t => {
  for (const kind of ['bytes', 'file', 'root', 'ancestor', 'new-record']) {
    const { root, state } = await saved(t, customizationProject()); const file = path.join(root, 'schemka.json'); let changed = false;
    const io = wrapped(fs, (handle, target, flags) => handleProxy(handle, { close: async () => {
      await handle.close(); if (target !== file || changed || (flags & constants.O_WRONLY)) return; changed = true;
      if (kind === 'bytes') { const raw = await fs.readFile(file, 'utf8'); await fs.writeFile(file, raw.replace('Synthetic', 'Alteredxx')); }
      else if (kind === 'file') { await fs.rename(file, `${file}.old`); await fs.writeFile(file, JSON.stringify(state.project)); }
      else if (kind === 'root') { await fs.rename(root, `${root}-old`); await fs.mkdir(root); }
      else if (kind === 'ancestor') { await fs.rename(path.join(root, 'model'), path.join(root, 'model-old')); await fs.symlink(path.join(root, 'model-old'), path.join(root, 'model')); }
      else { const record = { ...state.elements[0], id: fixtureId('el', 1000) }; await fs.writeFile(path.join(root, `model/elements/${record.id}.json`), JSON.stringify(record)); }
    } }));
    await assert.rejects(readNativeDirectory(root, io), undefined, kind); assert.equal(changed, true);
  }
});

test('marker replacement before final verification is retained and never acknowledged or unlinked', async t => {
  const parent = await fixture(t); let root, scans = 0;
  const io = { ...fs, mkdtemp: async prefix => root = await fs.mkdtemp(prefix), opendir: async target => {
    if (target === root && ++scans === 2) { await fs.rename(path.join(root, INCOMPLETE_MARKER), path.join(root, 'original-marker')); await fs.writeFile(path.join(root, INCOMPLETE_MARKER), 'external-marker'); }
    return fs.opendir(target);
  } };
  await assert.rejects(createNativeDirectory(parent, bytes(), io), { code: 'DIRECTORY_CHANGED' }); assert.equal(await fs.readFile(path.join(root, INCOMPLETE_MARKER), 'utf8'), 'external-marker');
});

test('late marker/native addition after the second scan is caught by final inventory; reserved parent cannot receive rescue', async t => {
  for (const kind of ['marker', 'record']) {
    const { root, state } = await saved(t, customizationProject()); let reads = 0, changed = false;
    const file = path.join(root, 'schemka.json');
    const io = wrapped(fs, (handle, target) => handleProxy(handle, { close: async () => {
      await handle.close(); if (target !== file || ++reads !== 2) return; changed = true;
      if (kind === 'marker') await fs.writeFile(path.join(root, RECOVERY_MARKER), '');
      else await fs.writeFile(path.join(root, `model/elements/${fixtureId('el', 900)}.json`), JSON.stringify({ ...state.elements[0], id: fixtureId('el', 900) }));
    } }));
    await assert.rejects(readNativeDirectory(root, io)); assert.equal(changed, true);
  }
  const { root } = await saved(t); await fs.writeFile(path.join(root, RECOVERY_MARKER), 'bad'); await fs.mkdir(path.join(root, 'child'));
  await assert.rejects(createNativeDirectory(path.join(root, 'child'), bytes()), { code: 'DIRECTORY_INCOMPLETE' });
});

test('aggregate raw byte budget, invalid references and native directories in file positions are rejected', async t => {
  const { root, state } = await saved(t, customizationProject());
  const files = exportFiles(state);
  for (const file of files) await fs.writeFile(path.join(root, file.path), file.content.padEnd(LIMITS.fileBytes, ' '));
  await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_LIMIT' });
  for (const file of files) await fs.writeFile(path.join(root, file.path), file.content);
  const relative = `model/relationships/${state.relationships[0].id}.json`;
  await fs.writeFile(path.join(root, relative), JSON.stringify({ ...state.relationships[0], source: { kind: 'element', id: fixtureId('el', 999) } }));
  await assert.rejects(readNativeDirectory(root), { code: 'REFERENCE' });
  await fs.unlink(path.join(root, relative)); await fs.mkdir(path.join(root, relative));
  await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_TYPE' });
});

test('R2: bounded ancestor scans block differently cased incomplete/recovery markers, including malformed, directory and link entries', async t => {
  for (const marker of [INCOMPLETE_MARKER.toUpperCase(), '.ScHeMkA-ReCoVeRy.JsOn']) for (const kind of ['empty', 'malformed', 'directory', 'link']) {
    const parent = await fixture(t), root = path.join(parent, 'marked'); await fs.mkdir(root); await fs.mkdir(path.join(root, 'descendant'));
    const target = path.join(root, marker);
    if (kind === 'directory') await fs.mkdir(target); else if (kind === 'link') await fs.symlink(path.join(root, 'missing'), target); else await fs.writeFile(target, kind === 'empty' ? '' : '{bad');
    for (const selected of [root, path.join(root, 'descendant')]) {
      await assert.rejects(createNativeDirectory(selected, bytes()), { code: 'DIRECTORY_INCOMPLETE' }); assert.deepEqual(await fs.readdir(path.join(root, 'descendant')), []);
    }
    assert.deepEqual((await fs.readdir(root)).sort(), [marker, 'descendant'].sort());
  }
});

test('fresh ancestry marker enumeration has a streaming entry cap and cannot create a child after exhaustion', async t => {
  const parent = await fixture(t); let entries = 0, closed = false, writes = 0;
  const io = { ...fs, opendir: async () => ({ read: async () => { entries++; return { name: 'unowned' }; }, close: async () => { closed = true; } }), mkdtemp: async () => { writes++; throw Error('must not write'); } };
  await assert.rejects(createNativeDirectory(parent, bytes(), io), { code: 'DIRECTORY_LIMIT' }); assert.equal(entries, DIRECTORY_LIMITS.entries + 1); assert.equal(closed, true); assert.equal(writes, 0);
});


test('fresh save checks nanosecond marker identity per write and hashes full metadata only at bounded verification boundaries', async t => {
  const parent = await fixture(t), state = createProject('Marker scaling');
  state.elements = Array.from({ length: 300 }, (_, i) => ({ id: fixtureId('el', i + 1), type: 'Role', name: `Role ${i}`, documentation: '', properties: [] }));
  let reads = 0;
  const io = wrapped(fs, (handle, target, flags) => handleProxy(handle, { read: async (...args) => {
    if (path.basename(target) === INCOMPLETE_MARKER && !(flags & constants.O_WRONLY)) reads++;
    return handle.read(...args);
  } }));
  const result = await createNativeDirectory(parent, serializeProjectFile(state), io);
  assert.deepEqual(result.snapshot.files, exportFiles(state));
  assert.ok(reads < 40, `full marker reads must not scale with ${state.elements.length} records: ${reads}`);
});

test('same-size marker edits during a fresh write fail closed even if the original mtime is restored', async t => {
  for (const restoreMtime of [false, true]) {
    const parent = await fixture(t), state = customizationProject(); let root, altered = false, retained;
    const io = wrapped({ ...fs, mkdtemp: async prefix => root = await fs.mkdtemp(prefix) }, (handle, target, flags) => handleProxy(handle, { writeFile: async bytes => {
      await handle.writeFile(bytes);
      if (altered || !(flags & constants.O_WRONLY) || path.basename(target) === INCOMPLETE_MARKER) return;
      altered = true;
      const marker = path.join(root, INCOMPLETE_MARKER), stat = await fs.stat(marker), original = await fs.readFile(marker, 'utf8');
      retained = original.replace('fresh-save', 'other-save'); assert.equal(Buffer.byteLength(retained), Buffer.byteLength(original));
      await fs.writeFile(marker, retained);
      if (restoreMtime) await fs.utimes(marker, stat.atime, stat.mtime);
    } }));
    await assert.rejects(createNativeDirectory(parent, serializeProjectFile(state), io), { code: 'DIRECTORY_CHANGED' });
    assert.equal(altered, true); assert.equal(await fs.readFile(path.join(root, INCOMPLETE_MARKER), 'utf8'), retained);
    await assert.rejects(readNativeDirectory(root), { code: 'DIRECTORY_INCOMPLETE' });
    assert.ok((await fs.readdir(root)).length > 1, 'written records and marker remain available for inspection');
  }
});
