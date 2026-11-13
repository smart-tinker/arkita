import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { directoryBoundary, atomicWrite, readProjectSnapshot, writeBoundProject, inspectProjectFileRecovery, recoverProjectFile } from '../project-files.mjs';
import { createNativeDirectory, readNativeDirectory, RECOVERY_MARKER } from '../native-directory.mjs';
import { updateNativeDirectory, recoverNativeDirectory, inspectDirectoryRecovery } from '../directory-update.mjs';
import { createProject, exportFiles } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';

const encode = state => Buffer.from(serializeProjectFile(state));
const failure = () => Object.assign(Error('injected I/O interruption'), { code: 'EIO' });
const proxy = (handle, overrides) => new Proxy(handle, { get(target, key) { return overrides[key] ?? (typeof target[key] === 'function' ? target[key].bind(target) : target[key]); } });
async function fixture(t, native = false) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-preserved-'))); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const before = createProject('Before'), after = structuredClone(before); after.project.name = 'After!';
  if (native) {
    before.elements = [{ id: fixtureId('el', 1), type: 'Role', name: 'Before', documentation: '', properties: [] }];
    after.elements = [{ ...before.elements[0], name: 'After!' }];
    const created = await createNativeDirectory(parent, encode(before)), root = path.join(parent, created.name), file = path.join(root, exportFiles(before).find(file => file.path.startsWith('model/')).path);
    return { parent, root, file, before, after, snapshot: created.snapshot, write: io => updateNativeDirectory(created.snapshot, encode(after), io) };
  }
  const file = path.join(parent, 'model.arkita'); await fs.writeFile(file, encode(before));
  const { snapshot } = await readProjectSnapshot(file);
  return { parent, file, before, after, snapshot, write: io => writeBoundProject(snapshot, encode(after), io) };
}
async function marker(f) { return path.join(f.parent, (await fs.readdir(f.parent)).find(name => name.startsWith('arkita-recovery-'))); }
async function captured(error) {
  const root = path.join(error.transactionPath, 'displaced'), names = await fs.readdir(root);
  return Promise.all(names.map(async name => ({ path: path.join(root, name), bytes: await fs.readFile(path.join(root, name)) })));
}
async function rejected(action) { let error; await assert.rejects(action, value => { error = value; return true; }); return error; }

for (const native of [false, true]) for (const edit of ['in-place', 'replacement']) test(`${native ? 'native' : 'single file'} last-check ${edit} edit is displaced intact and never acknowledged`, async t => {
  const f = await fixture(t, native), baseline = await fs.readFile(f.file), external = Buffer.from(baseline.toString().replace('Before', 'Other!'));
  let fired = false;
  const io = { ...fs, rename: async (from, to) => {
    if (!fired && (from === f.file || to === f.file)) {
      fired = true;
      if (edit === 'in-place') await fs.writeFile(f.file, external);
      else { const foreign = f.file + '.external'; await fs.writeFile(foreign, external); await fs.rename(foreign, f.file); }
    }
    return fs.rename(from, to);
  } };
  const error = await rejected(() => f.write(io)); assert.equal(fired, true);
  assert.ok(['FILE_CHANGED', 'DIRECTORY_CHANGED'].includes(error.code));
  const archives = await captured(error); assert.equal(archives.length, 1); assert.deepEqual(archives[0].bytes, external);
  await assert.rejects(fs.lstat(f.file), { code: 'ENOENT' });
  if (native) {
    await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
    const recovered = await recoverNativeDirectory(f.root, 'before'); assert.deepEqual(recovered.snapshot.files, exportFiles(f.before));
  } else {
    await assert.rejects(readProjectSnapshot(f.file), { code: 'FILE_RECOVERY' });
    const selected = await marker(f), inspected = await inspectProjectFileRecovery(selected);
    assert.equal(inspected.external.length, 1); assert.deepEqual(inspected.external[0].bytes, external);
    await recoverProjectFile(selected, 'displaced'); assert.deepEqual(await fs.readFile(f.file), external);
  }
  assert.deepEqual(await fs.readFile(archives[0].path), external, 'explicit recovery retains captured external evidence');
});

test('native delete boundary moves the actual externally edited record into retained evidence', async t => {
  const f = await fixture(t, true); f.after.elements = [];
  const external = Buffer.from((await fs.readFile(f.file, 'utf8')).replace('Before', 'Other!')); let fired = false;
  const io = { ...fs, rename: async (from, to) => {
    if (from === f.file) { fired = true; await fs.writeFile(f.file, external); } return fs.rename(from, to);
  }, unlink: async target => { if (target === f.file) { fired = true; await fs.writeFile(f.file, external); } return fs.unlink(target); } };
  const error = await rejected(() => f.write(io)); assert.equal(fired, true);
  assert.ok((await captured(error)).some(file => file.bytes.equals(external)));
  const restored = await recoverNativeDirectory(f.root, 'after'); assert.deepEqual(restored.snapshot.files, exportFiles(f.after));
  assert.ok((await captured(error)).some(file => file.bytes.equals(external)));
});

for (const native of [false, true]) test(`${native ? 'native' : 'single file'} exclusive publication preserves a competing new destination`, async t => {
  const f = await fixture(t, native), external = Buffer.from('external-created-after-displacement'); let fired = false;
  const io = { ...fs, link: async (from, to) => { if (to === f.file) { fired = true; await fs.writeFile(to, external); } return fs.link(from, to); } };
  const error = await rejected(() => f.write(io)); assert.equal(fired, true);
  assert.deepEqual(await fs.readFile(f.file), external);
  assert.ok((await captured(error)).some(file => file.bytes.equals(native ? Buffer.from(exportFiles(f.before).find(file => file.path.startsWith('model/')).content) : encode(f.before))));
  const recovering = native ? () => recoverNativeDirectory(f.root, 'before') : async () => recoverProjectFile(await marker(f), 'before');
  await assert.rejects(recovering); assert.deepEqual(await fs.readFile(f.file), external);
});

for (const native of [false, true]) test(`${native ? 'native' : 'single file'} retains a displaced inode changed through an already-open external handle`, async t => {
  const f = await fixture(t, native), bytes = await fs.readFile(f.file), external = Buffer.from(bytes.toString().replace('Before', 'Other!'));
  const held = await fs.open(f.file, 'r+'); t.after(() => held.close()); let fired = false;
  const io = { ...fs, link: async (from, to) => {
    const result = await fs.link(from, to);
    if (to === f.file) { fired = true; await held.write(external, 0, external.length, 0); await held.sync(); }
    return result;
  } };
  const error = await rejected(() => f.write(io)); assert.equal(fired, true);
  assert.ok((await captured(error)).some(file => file.bytes.equals(external)));
  assert.ok((await fs.readFile(f.file)).includes('After!'), 'publication used a separate inode');
});

for (const native of [false, true]) test(`${native ? 'native' : 'single file'} unsupported hardlinks refuse before any displacement and previous snapshot can be reopened`, async t => {
  const f = await fixture(t, native), bytes = await fs.readFile(f.file); let moves = 0;
  const io = { ...fs, link: async () => { throw Object.assign(Error('hardlinks unavailable'), { code: 'EOPNOTSUPP' }); }, rename: async (...args) => { moves++; return fs.rename(...args); } };
  const error = await rejected(() => f.write(io)); assert.equal(error.code, 'FILE_ATOMIC_UNSUPPORTED'); assert.equal(moves, 0); assert.equal(error.recoveryRequired, true);
  assert.deepEqual(await fs.readFile(f.file), bytes);
  if (native) { await recoverNativeDirectory(f.root, 'before', io); assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.before)); }
  else { await recoverProjectFile(await marker(f), 'before', io); assert.deepEqual((await readProjectSnapshot(f.file)).bytes, new Uint8Array(bytes)); }
});

for (const side of ['before', 'after']) for (const phase of ['before-move', 'after-move', 'before-publish', 'after-publish', 'after-unlink']) test(`single-file interruption ${phase} is explicitly recoverable to ${side}`, async t => {
  const f = await fixture(t); let fired = false;
  const io = { ...fs, rename: async (from, to) => {
    if (from === f.file && phase === 'before-move') { fired = true; throw failure(); }
    const result = await fs.rename(from, to); if (from === f.file && phase === 'after-move') { fired = true; throw failure(); } return result;
  }, link: async (from, to) => {
    if (to === f.file && phase === 'before-publish') { fired = true; throw failure(); }
    const result = await fs.link(from, to); if (to === f.file && phase === 'after-publish') { fired = true; throw failure(); } return result;
  }, unlink: async target => {
    const result = await fs.unlink(target); if (phase === 'after-unlink' && target.endsWith(path.join('pending', 'file.bin'))) { fired = true; throw failure(); } return result;
  } };
  const error = await rejected(() => f.write(io)); assert.equal(error.recoveryRequired, true); assert.equal(fired, true); await assert.rejects(readProjectSnapshot(f.file), { code: 'FILE_RECOVERY', recoveryRequired: true });
  await recoverProjectFile(await marker(f), side); assert.deepEqual(await fs.readFile(f.file), encode(f[side]));
  assert.deepEqual((await readProjectSnapshot(f.file)).bytes, new Uint8Array(encode(f[side])));
});

for (const phase of ['move', 'publish', 'probe']) for (const side of ['before', 'after']) test(`actual child-process exit at ${phase} leaves single-file recovery usable for ${side}`, async t => {
  const f = await fixture(t);
  const script = `import * as fs from 'node:fs/promises';
    import {readProjectSnapshot,writeBoundProject} from ${JSON.stringify(new URL('../project-files.mjs', import.meta.url).href)};
    import {deserializeProjectFile,serializeProjectFile} from ${JSON.stringify(new URL('../../schemka-model-io/src/project-file.js', import.meta.url).href)};
    const file=process.argv[1], phase=process.argv[2], opened=await readProjectSnapshot(file), state=deserializeProjectFile(opened.bytes); state.project.name='After!';
    await writeBoundProject(opened.snapshot,serializeProjectFile(state),{...fs,
      rename:async(...args)=>{const value=await fs.rename(...args);if(phase==='move'&&args[0]===file)process.exit(86);return value;},
      link:async(...args)=>{const value=await fs.link(...args);if(phase==='publish'&&args[1]===file||phase==='probe'&&args[1].includes('.schemka-link-'))process.exit(86);return value;}});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, f.file, phase], { stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = '';
  child.stderr.on('data', value => { stderr += value.toString(); });
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(exit, 86, stderr);
  await recoverProjectFile(await marker(f), side); assert.deepEqual(await fs.readFile(f.file), encode(f[side]));
});

test('new file interrupted after publication has a discoverable marker and complete intended recovery copy', async t => {
  const f = await fixture(t), target = path.join(f.parent, 'new.arkita'); let fired = false;
  const error = await rejected(() => atomicWrite(target, encode(f.after), { ...fs, link: async (from, to) => {
    const result = await fs.link(from, to); if (to === target) { fired = true; throw failure(); } return result;
  } }));
  assert.equal(fired, true); const inspected = await inspectProjectFileRecovery(error.recoveryMarkerPath); assert.equal(inspected.before, null);
  await recoverProjectFile(error.recoveryMarkerPath, 'after'); assert.deepEqual((await readProjectSnapshot(target)).bytes, new Uint8Array(encode(f.after)));
});

test('single-file marker/header/copies and path identities remain authoritative before recovery writes', async t => {
  for (const damage of ['header', 'after', 'unknown', 'symlink', 'parent', 'marker-link', 'header-link']) {
    const f = await fixture(t);
    const error = await rejected(() => f.write({ ...fs, rename: async () => { throw failure(); } }));
    if (damage === 'header') await fs.writeFile(path.join(error.transactionPath, 'journal.json'), '{}');
    if (damage === 'after') await fs.writeFile(path.join(error.transactionPath, 'after.bin'), 'foreign bytes');
    if (damage === 'unknown') await fs.writeFile(path.join(error.transactionPath, 'unexpected'), 'foreign bytes');
    if (damage === 'symlink') {
      const file = path.join(error.transactionPath, 'before.bin'); await fs.rename(file, `${file}-real`); await fs.symlink(`${file}-real`, file);
    }
    if (damage === 'parent') {
      await fs.rename(error.transactionPath, `${error.transactionPath}-original`); await fs.mkdir(error.transactionPath);
    }
    if (damage === 'marker-link' || damage === 'header-link') await fs.link(damage === 'marker-link' ? error.recoveryMarkerPath : path.join(error.transactionPath, 'journal.json'), path.join(f.parent, 'foreign-link'));
    let mutations = 0;
    await assert.rejects(recoverProjectFile(error.recoveryMarkerPath, 'after', { ...fs, rename: async () => mutations++, link: async () => mutations++, unlink: async () => mutations++ }));
    assert.equal(mutations, 0, damage); assert.deepEqual(await fs.readFile(f.file), encode(f.before));
  }
});

test('single-file canonical-path adapter binds the real basename and shares the recovery marker across aliases', async t => {
  const f = await fixture(t), alias = path.join(f.parent, 'MODEL~1.ARK');
  const resolveAlias = target => target === alias ? f.file : target;
  const io = { ...fs, lstat: (target, ...rest) => fs.lstat(resolveAlias(target), ...rest), realpath: (target, ...rest) => fs.realpath(resolveAlias(target), ...rest) };
  const selected = await readProjectSnapshot(alias, io);
  assert.equal(selected.snapshot.path, f.file); assert.equal(selected.name, path.basename(f.file));
  let moved = false;
  const error = await rejected(() => writeBoundProject(selected.snapshot, encode(f.after), { ...io, rename: async (from, to) => {
    assert.equal(from, f.file); moved = true; await fs.rename(from, to); throw failure();
  } }));
  assert.equal(moved, true);
  await assert.rejects(readProjectSnapshot(f.file), { code: 'FILE_RECOVERY' });
  await assert.rejects(writeBoundProject(selected.snapshot, encode(f.after), io), { code: 'FILE_RECOVERY' });
  await recoverProjectFile(error.recoveryMarkerPath, 'before');
  assert.deepEqual((await readProjectSnapshot(alias, io)).bytes, new Uint8Array(encode(f.before)));
  assert.equal((await fs.readdir(f.parent)).includes(path.basename(alias)), false, 'saving does not replace a long name with the selected short spelling');
});

test('Windows casing and extended file aliases retain a shared canonical recovery target', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t);
  for (const alias of [f.file.toUpperCase(), path.toNamespacedPath(f.file)]) {
    const selected = await readProjectSnapshot(alias);
    assert.equal(selected.snapshot.path, await fs.realpath(f.file));
    const error = await rejected(() => writeBoundProject(selected.snapshot, encode(f.after), { ...fs, rename: async (from, to) => { await fs.rename(from, to); throw failure(); } }));
    await assert.rejects(readProjectSnapshot(f.file), { code: 'FILE_RECOVERY' });
    await recoverProjectFile(error.recoveryMarkerPath, 'before');
    assert.deepEqual((await readProjectSnapshot(alias)).bytes, new Uint8Array(encode(f.before)));
  }
});

test('single-file recovery marker names cannot become ordinary export destinations', async t => {
  const f = await fixture(t), target = path.join(f.parent, `arkita-recovery-${'a'.repeat(64)}.json`);
  await assert.rejects(atomicWrite(target, encode(f.after)), { code: 'FILE_RESERVED' });
  await assert.rejects(fs.lstat(target), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(f.parent), [path.basename(f.file)]);
});

for (const native of [false, true]) test(`${native ? 'native' : 'single file'} captures empty external bytes without treating them as absence`, async t => {
  const f = await fixture(t, native); let fired = false;
  const error = await rejected(() => f.write({ ...fs, rename: async (from, to) => {
    if (from === f.file && !fired) { fired = true; await fs.writeFile(from, ''); } return fs.rename(from, to);
  } }));
  assert.equal(fired, true); assert.ok((await captured(error)).some(file => file.bytes.length === 0));
  if (native) await recoverNativeDirectory(f.root, 'before');
  else await recoverProjectFile(error.recoveryMarkerPath, 'before');
  assert.ok((await captured(error)).some(file => file.bytes.length === 0), 'recovery retains the actual empty external file');
});

test('single-file partial marker write aborts only its owned prefix before any source displacement', async t => {
  const f = await fixture(t); let fired = false, moves = 0;
  const error = await rejected(() => f.write({ ...fs, rename: async (...args) => { moves++; return fs.rename(...args); },
    open: async (target, flags, ...rest) => {
      const handle = await fs.open(target, flags, ...rest);
      if (!(flags & constants.O_WRONLY) || !path.basename(target).startsWith('arkita-recovery-')) return handle;
      return proxy(handle, { writeFile: async bytes => { fired = true; await handle.writeFile(bytes.subarray(0, 5)); throw failure(); } });
    } }));
  assert.equal(fired, true); assert.equal(moves, 0); assert.ok(error.transactionPath); assert.equal(error.recoveryRequired, false);
  assert.deepEqual((await readProjectSnapshot(f.file)).bytes, new Uint8Array(encode(f.before)));
  assert.equal((await fs.readdir(f.parent)).some(name => name.startsWith('arkita-recovery-')), false);
});

test('single-file failed readback retains the completed journal location without adopting the external version', async t => {
  const f = await fixture(t), external = encode({ ...f.before, project: { ...f.before.project, name: 'External after completion' } }); let fired = false;
  const error = await rejected(() => f.write({ ...fs, unlink: async target => {
    await fs.unlink(target);
    if (path.basename(target).startsWith('arkita-recovery-')) { fired = true; await fs.writeFile(f.file, external); }
  } }));
  assert.equal(fired, true); assert.equal(error.code, 'FILE_CHANGED'); assert.ok(error.transactionPath);
  assert.deepEqual(await fs.readFile(f.file), external);
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'before.bin')), encode(f.before));
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'after.bin')), encode(f.after));
  assert.equal((await fs.readdir(f.parent)).some(name => name.startsWith('arkita-recovery-')), false);
});

test('native previous delta journal remains recoverable with bounded retained evidence extension', async t => {
  const f = await fixture(t, true);
  const error = await rejected(() => f.write({ ...fs, rename: async () => { throw failure(); } }));
  const journal = await inspectDirectoryRecovery(f.root);
  // A v2 interruption has no displaced/pending files; preserve the immutable delta payloads.
  await fs.rm(path.join(error.transactionPath, 'pending'), { recursive: true }); await fs.rm(path.join(error.transactionPath, 'displaced'), { recursive: true });
  const headerPath = path.join(error.transactionPath, 'journal.json'), markerPath = path.join(f.root, RECOVERY_MARKER);
  const header = JSON.parse(await fs.readFile(headerPath, 'utf8')), mark = JSON.parse(await fs.readFile(markerPath, 'utf8'));
  header.version = mark.version = 2; const bytes = Buffer.from(JSON.stringify(header) + '\n');
  const { createHash } = await import('node:crypto'); mark.journal = createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(headerPath, bytes); await fs.writeFile(markerPath, JSON.stringify(mark) + '\n');
  assert.equal(journal.before.state.project.id, f.before.project.id);
  const recovered = await recoverNativeDirectory(f.root, 'after'); assert.deepEqual(recovered.snapshot.files, exportFiles(f.after));
});


test('Windows extended drive root retains ancestor no-follow checks and detects replaced parent identity', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), selected = path.toNamespacedPath(f.parent), root = path.parse(selected).root, observed = [];
  let changed = false;
  const io = { ...fs, lstat: async (target, ...args) => {
    observed.push(target); const stat = await fs.lstat(target, ...args);
    return changed && target === selected ? proxy(stat, { ino: stat.ino + 1n }) : stat;
  } };
  const guard = await directoryBoundary(selected, io);
  assert.ok(observed.includes(root.slice(4)), 'drive root is still checked by ordinary absolute spelling');
  assert.ok(!observed.includes(root), 'do not pass the extended root to the Electron fs wrapper');
  for (let ancestor = selected; ancestor !== root; ancestor = path.dirname(ancestor)) assert.ok(observed.includes(ancestor), `ancestor checked without following links: ${ancestor}`);
  await guard.verify(); changed = true; await assert.rejects(guard.verify(), { code: 'DIRECTORY_CHANGED' });
  await assert.rejects(directoryBoundary(selected, { ...fs, lstat: async (target, ...args) => {
    const stat = await fs.lstat(target, ...args); return target === selected ? proxy(stat, { isSymbolicLink: () => true }) : stat;
  } }), { code: 'DIRECTORY_TYPE' });
  assert.deepEqual(await fs.readFile(f.file), encode(f.before));
});
