import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { atomicWrite, readProjectSnapshot, writeBoundProject, recoverProjectFile } from '../project-files.mjs';
import { createDocumentPreferences } from '../document-preferences.mjs';

const encode = state => Buffer.from(serializeProjectFile(state));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-completed-file-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'model.arkita'), state = createProject('Before');
  await fs.writeFile(file, encode(state));
  const preferences = createDocumentPreferences(path.join(root, 'profile'));
  let id;
  const backup = async (source, input) => {
    const expected = Buffer.from(input); id = await preferences.backup(source, expected);
    return id ? async () => Buffer.from((await preferences.readBackup(id)).bytes).equals(expected) : undefined;
  };
  return { root, file, state, preferences, backup,
    backupPath: () => path.join(root, 'profile', 'backups', `${id}.arkita`),
    journals: async () => (await fs.readdir(root)).filter(name => name.startsWith('.schemka-transaction-')) };
}

test('first Save As removes its live completed journal only after finalization', async t => {
  const f = await fixture(t), target = path.join(f.root, 'new.arkita'), bytes = encode(f.state);
  const result = await atomicWrite(target, bytes);
  assert.equal((await f.journals()).length, 1);
  await result.finalize(); await result.finalize();
  assert.deepEqual(await fs.readFile(target), bytes);
  assert.deepEqual(await f.journals(), []);
  assert.equal(result.warning, undefined); assert.equal(result.transactionPath, undefined);
});

test('repeated bound saves retain bounded readable backups, not duplicate journals or changes to old evidence', async t => {
  const f = await fixture(t), old = path.join(f.root, '.schemka-transaction-old-evidence');
  await fs.mkdir(old); await fs.writeFile(path.join(old, 'unique.bin'), 'old external bytes');
  let snapshot = (await readProjectSnapshot(f.file)).snapshot;
  for (let i = 0; i < 12; i++) {
    const before = await fs.readFile(f.file); f.state.project.name = `Revision ${i}`;
    const result = await writeBoundProject(snapshot, encode(f.state), fs, { backup: f.backup });
    snapshot = result.snapshot;
    assert.equal(result.warning, undefined);
    assert.deepEqual(await fs.readFile(f.backupPath()), before);
    assert.deepEqual(await f.journals(), [path.basename(old)]);
  }
  assert.equal((await f.preferences.status()).backups.length, 5);
  assert.deepEqual(await fs.readFile(f.file), encode(f.state));
  assert.equal(await fs.readFile(path.join(old, 'unique.bin'), 'utf8'), 'old external bytes');
});

test('disabled backups preserve the only previous version and report retained evidence', async t => {
  const f = await fixture(t); await f.preferences.set({ backupEnabled: false });
  const before = await fs.readFile(f.file); f.state.project.name = 'After';
  const result = await writeBoundProject((await readProjectSnapshot(f.file)).snapshot, encode(f.state), fs, { backup: f.backup });
  assert.match(result.warning, /каталоге восстановления/);
  const [journal] = await f.journals();
  assert.deepEqual(await fs.readFile(path.join(f.root, journal, 'before.bin')), before);
});

for (const mutation of ['backup-missing', 'backup-changed', 'unknown-entry', 'changed-copy', 'hardlink', 'replaced-directory', 'changed-target']) {
  test(`finalization preserves uncertain evidence after ${mutation}`, async t => {
    const f = await fixture(t), before = await fs.readFile(f.file); f.state.project.name = 'After';
    const result = await atomicWrite(f.file, encode(f.state), fs, null, { backup: f.backup });
    const tx = result.transactionPath;
    if (mutation === 'backup-missing') await fs.unlink(f.backupPath());
    if (mutation === 'backup-changed') await fs.writeFile(f.backupPath(), encode(f.state));
    if (mutation === 'unknown-entry') await fs.writeFile(path.join(tx, 'unknown.bin'), 'unique');
    if (mutation === 'changed-copy') await fs.writeFile(path.join(tx, 'after.bin'), 'unique replacement');
    if (mutation === 'hardlink') await fs.link(path.join(tx, 'before.bin'), path.join(f.root, 'external-link'));
    if (mutation === 'replaced-directory') {
      await fs.rename(tx, tx + '-original'); await fs.mkdir(tx); await fs.writeFile(path.join(tx, 'sentinel'), 'outside');
    }
    if (mutation === 'changed-target') await fs.writeFile(f.file, 'external target');
    await result.finalize();
    assert.match(result.warning, /очистка не подтверждена/);
    assert.equal(result.transactionPath, tx);
    const kept = mutation === 'replaced-directory' ? tx + '-original' : tx;
    assert.deepEqual(await fs.readFile(path.join(kept, 'before.bin')), before);
    if (mutation === 'unknown-entry') assert.equal(await fs.readFile(path.join(tx, 'unknown.bin'), 'utf8'), 'unique');
    if (mutation === 'changed-copy') assert.equal(await fs.readFile(path.join(tx, 'after.bin'), 'utf8'), 'unique replacement');
    if (mutation === 'replaced-directory') assert.equal(await fs.readFile(path.join(tx, 'sentinel'), 'utf8'), 'outside');
    assert.deepEqual(await fs.readFile(f.file), mutation === 'changed-target' ? Buffer.from('external target') : encode(f.state));
  });
}

test('cleanup I/O failure keeps saved bytes and a warning instead of failing the save', async t => {
  const f = await fixture(t); f.state.project.name = 'After';
  let fired = false;
  const io = { ...fs, unlink: async target => {
    if (path.basename(target) === 'before.bin') { fired = true; throw Object.assign(Error('cleanup denied'), { code: 'EACCES' }); }
    return fs.unlink(target);
  } };
  const result = await writeBoundProject((await readProjectSnapshot(f.file)).snapshot, encode(f.state), io, { backup: f.backup });
  assert.equal(fired, true); assert.match(result.warning, /очистка не подтверждена/);
  assert.deepEqual(Buffer.from(result.bytes), encode(f.state));
  assert.deepEqual(await fs.readFile(f.file), encode(f.state));
});

test('late external replacement after marker removal prevents cleanup and preserves both snapshots', async t => {
  const f = await fixture(t), before = encode(f.state); f.state.project.name = 'After';
  let error;
  await assert.rejects(writeBoundProject((await readProjectSnapshot(f.file)).snapshot, encode(f.state), { ...fs,
    unlink: async target => {
      await fs.unlink(target);
      if (path.basename(target).startsWith('arkita-recovery-')) await fs.writeFile(f.file, 'late external bytes');
    } }, { backup: f.backup }), value => { error = value; return value.code === 'FILE_CHANGED'; });
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'before.bin')), before);
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'after.bin')), encode(f.state));
  assert.equal(await fs.readFile(f.file, 'utf8'), 'late external bytes');
});

test('interrupted write and explicit recovery retain evidence without any finalizer', async t => {
  const f = await fixture(t), before = encode(f.state); f.state.project.name = 'After';
  let error;
  await assert.rejects(atomicWrite(f.file, encode(f.state), { ...fs, rename: async () => { throw Error('interrupted'); } }, null,
    { backup: f.backup }), value => { error = value; return true; });
  const recovered = await recoverProjectFile(error.recoveryMarkerPath, 'after');
  assert.equal(recovered.finalize, undefined);
  assert.deepEqual(await fs.readFile(path.join(error.transactionPath, 'before.bin')), before);
  assert.deepEqual(await fs.readFile(f.file), encode(f.state));
});
