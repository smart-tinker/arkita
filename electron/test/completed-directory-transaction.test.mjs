import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createNativeDirectory, captureNativeDirectory, readNativeDirectory, RECOVERY_MARKER } from '../native-directory.mjs';
import { updateNativeDirectory, recoverNativeDirectory } from '../directory-update.mjs';
import { createProject, exportFiles } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const encode = serializeProjectFile;
const injected = () => Object.assign(Error('injected failure'), { code: 'EIO' });
async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-completed-directory-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const before = createProject('Before');
  before.elements = [1, 2].map(i => ({ id: fixtureId('el', i), type: 'Role', name: `Role ${i}`, documentation: '', properties: [] }));
  const after = structuredClone(before); after.project.name = 'After';
  after.elements = [{ ...before.elements[0], name: 'Changed role' }, { ...before.elements[1], id: fixtureId('el', 3) }];
  const saved = await createNativeDirectory(parent, encode(before)), root = path.join(parent, saved.name);
  const backupPath = path.join(parent, 'backup.arkita');
  const backup = async (source, bytes) => {
    assert.equal(source, root); const expected = Buffer.from(bytes);
    await fs.writeFile(backupPath, expected);
    return async () => (await fs.readFile(backupPath)).equals(expected);
  };
  return { parent, root, before, after, snapshot: saved.snapshot, backupPath, backup };
}
const transactions = async parent => (await fs.readdir(parent)).filter(name => name.startsWith('.schemka-transaction-'));
async function tree(root) {
  const files = {};
  async function visit(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name); else files[name] = await fs.readFile(path.join(root, name), 'utf8');
    }
  }
  await visit(''); return files;
}

test('verified backups permit repeated native saves without accumulating completed journals', async t => {
  const f = await fixture(t); let snapshot = f.snapshot, previous = f.before;
  const old = '.schemka-transaction-00000000-0000-4000-8000-000000000001';
  await fs.mkdir(path.join(f.parent, old)); await fs.writeFile(path.join(f.parent, old, 'evidence'), 'historical bytes');
  for (let i = 0; i < 8; i++) {
    const next = structuredClone(i ? previous : f.after); next.project.name = `Save ${i}`;
    const result = await updateNativeDirectory(snapshot, encode(next), fs, { backup: f.backup });
    assert.equal(typeof result.finalize, 'function'); assert.equal((await transactions(f.parent)).length, 2);
    assert.deepEqual(await fs.readFile(f.backupPath), Buffer.from(encode(previous)));
    await result.finalize(); await result.finalize();
    assert.equal(result.warning, undefined); assert.equal(result.transaction, undefined);
    assert.deepEqual(await transactions(f.parent), [old]);
    assert.equal(await fs.readFile(path.join(f.parent, old, 'evidence'), 'utf8'), 'historical bytes');
    await assert.rejects(fs.lstat(path.join(f.root, RECOVERY_MARKER)), { code: 'ENOENT' });
    snapshot = (await readNativeDirectory(f.root)).snapshot;
    assert.deepEqual(snapshot.files, exportFiles(next)); previous = next;
  }
});

test('absent backup proof and disabled backups retain completed journals', async t => {
  for (const backup of [undefined, async () => undefined]) {
    const f = await fixture(t), result = await updateNativeDirectory(f.snapshot, encode(f.after), fs, { backup });
    assert.equal(result.finalize, undefined); assert.match(result.warning, /оставлены/);
    assert.equal((await transactions(f.parent)).length, 1);
    assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
  }
});

test('a changed or unreadable backup refuses cleanup without turning the saved model into a failure', async t => {
  for (const change of ['changed', 'missing']) {
    const f = await fixture(t), result = await updateNativeDirectory(f.snapshot, encode(f.after), fs, { backup: f.backup });
    const original = await tree(result.transaction);
    if (change === 'changed') await fs.writeFile(f.backupPath, 'external'); else await fs.unlink(f.backupPath);
    await result.finalize();
    assert.match(result.warning, /очистка не подтверждена/); assert.deepEqual(await tree(result.transaction), original);
    assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
  }
});

test('non-canonical native bytes stay in the journal even when their canonical envelope backup is valid', async t => {
  const f = await fixture(t), target = path.join(f.root, 'schemka.json');
  const raw = JSON.stringify(JSON.parse(await fs.readFile(target, 'utf8')), null, 4) + '\r\n';
  await fs.writeFile(target, raw); f.snapshot = await captureNativeDirectory(f.root);
  const result = await updateNativeDirectory(f.snapshot, encode(f.after), fs, { backup: f.backup });
  const original = await tree(result.transaction); await result.finalize();
  assert.match(result.warning, /очистка не подтверждена/); assert.deepEqual(await tree(result.transaction), original);
  assert.ok(Object.values(original).includes(raw));
});

test('unknown files, replaced directories and unique displaced bytes prevent all cleanup', async t => {
  for (const change of ['unknown', 'identity', 'displaced']) {
    const f = await fixture(t), result = await updateNativeDirectory(f.snapshot, encode(f.after), fs, { backup: f.backup });
    const tx = result.transaction;
    if (change === 'unknown') await fs.writeFile(path.join(tx, 'unknown.txt'), 'unique user data');
    else if (change === 'identity') {
      const old = `${tx}-original-before`; await fs.rename(path.join(tx, 'before'), old);
      await fs.mkdir(path.join(tx, 'before'));
      for (const name of await fs.readdir(old)) await fs.copyFile(path.join(old, name), path.join(tx, 'before', name));
    } else {
      const name = (await fs.readdir(path.join(tx, 'displaced')))[0];
      await fs.writeFile(path.join(tx, 'displaced', name), 'unique external bytes');
    }
    const original = await tree(tx); await result.finalize();
    assert.match(result.warning, /очистка не подтверждена/); assert.deepEqual(await tree(tx), original);
    assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
  }
});

test('a new marker or changed saved model blocks completed-journal cleanup', async t => {
  for (const change of ['marker', 'model']) {
    const f = await fixture(t), result = await updateNativeDirectory(f.snapshot, encode(f.after), fs, { backup: f.backup });
    const original = await tree(result.transaction);
    const target = path.join(f.root, change === 'marker' ? RECOVERY_MARKER : 'schemka.json');
    await fs.writeFile(target, change === 'marker' ? 'new operation' : JSON.stringify({ ...f.after.project, name: 'External' }));
    await result.finalize();
    assert.match(result.warning, /очистка не подтверждена/); assert.deepEqual(await tree(result.transaction), original);
  }
});

test('cleanup IO failure keeps the successful save and retained warning', async t => {
  for (const failAt of [1, 2]) {
    const f = await fixture(t); let attempts = 0, cleanup = false;
    const io = { ...fs, unlink: async target => {
      if (cleanup && target.includes(`${path.sep}.schemka-transaction-`) && ++attempts === failAt) throw injected();
      return fs.unlink(target);
    } };
    const result = await updateNativeDirectory(f.snapshot, encode(f.after), io, { backup: f.backup });
    const original = await tree(result.transaction); cleanup = true; await result.finalize();
    assert.equal(attempts, failAt); assert.match(result.warning, /очистка не подтверждена/);
    const remaining = await tree(result.transaction);
    assert.equal(Object.keys(original).length - Object.keys(remaining).length, failAt - 1);
    for (const [name, content] of Object.entries(remaining)) assert.equal(content, original[name]);
    assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
  }
});

test('recovery retains its evidence and never exposes the live-save finalizer', async t => {
  const f = await fixture(t);
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), { ...fs, rename: async () => { throw injected(); } }, { backup: f.backup }), /injected failure/);
  const result = await recoverNativeDirectory(f.root, 'after');
  assert.equal(result.finalize, undefined); assert.match(result.warning, /оставлены/);
  assert.equal((await transactions(f.parent)).length, 1);
  assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
});
