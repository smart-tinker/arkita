import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createNativeDirectory, captureNativeDirectory, readNativeDirectory, RECOVERY_MARKER, hash } from '../native-directory.mjs';
import { updateNativeDirectory, recoverNativeDirectory } from '../directory-update.mjs';
import { createProject, exportFiles } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const injected = code => Object.assign(Error(`marker fault ${code}`), { code });
const proxy = (handle, overrides) => new Proxy(handle, { get(target, key) { return overrides[key] ?? (typeof target[key] === 'function' ? target[key].bind(target) : target[key]); } });
const encode = serializeProjectFile;
async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-marker-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const before = createProject('Marker before');
  before.elements = [1, 2].map(i => ({ id: fixtureId('el', i), type: 'Role', name: `Role ${i}`, documentation: '', properties: [] }));
  const saved = await createNativeDirectory(parent, encode(before)), root = path.join(parent, saved.name);
  const untouched = `model/elements/${fixtureId('el', 2)}.json`;
  await fs.writeFile(path.join(root, untouched), JSON.stringify(before.elements[1], null, 3) + '\r\n');
  const snapshot = await captureNativeDirectory(root), after = structuredClone(before);
  after.project.name = 'Marker after'; after.elements[0].name = 'Changed role';
  return { parent, root, before, after, snapshot, untouched, marker: path.join(root, RECOVERY_MARKER) };
}
async function payload(f) {
  return Promise.all(f.snapshot.files.map(async file => ({ path: file.path, content: await fs.readFile(path.join(f.root, file.path), 'utf8') })));
}
async function updateFailure(f, io) {
  let error;
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), e => { error = e; return e.code === 'ENOSPC' || e.code === 'EIO'; });
  return error;
}
async function assertJournalIntact(tx) {
  const headerBytes = await fs.readFile(path.join(tx, 'journal.json'));
  const header = JSON.parse(headerBytes);
  assert.equal(header.version, 3);
  for (const [i, description] of header.pages.entries()) {
    const pageBytes = await fs.readFile(path.join(tx, `page-${String(i).padStart(4, '0')}.json`));
    assert.equal(pageBytes.length, description.bytes); assert.equal(hash(pageBytes), description.sha256);
    const page = JSON.parse(pageBytes);
    for (const [index, entry] of page.entries.entries()) for (const side of ['before', 'after']) {
      if (!entry[side] || JSON.stringify(entry.before) === JSON.stringify(entry.after)) continue;
      const copy = await fs.readFile(path.join(tx, side, `record-${String(i * 128 + index).padStart(4, '0')}.json`));
      assert.equal(copy.length, entry[side].bytes); assert.equal(hash(copy), entry[side].sha256);
    }
  }
}

test('partial marker ENOSPC abort leaves raw payload reopenable and the same bound snapshot retryable', async t => {
  const f = await fixture(t); let hits = 0, payloadMutations = 0;
  const io = { ...fs,
    rename: async (...args) => { payloadMutations++; return fs.rename(...args); },
    unlink: async target => { if (target !== f.marker) payloadMutations++; return fs.unlink(target); },
    open: async (target, flags, ...rest) => {
      const handle = await fs.open(target, flags, ...rest);
      if (target !== f.marker || !(flags & constants.O_WRONLY)) return handle;
      return proxy(handle, { writeFile: async bytes => { hits++; await handle.writeFile(bytes.subarray(0, 1)); throw injected('ENOSPC'); } });
    }
  };
  const error = await updateFailure(f, io);
  assert.equal(hits, 1); assert.equal(payloadMutations, 0);
  assert.deepEqual(await payload(f), f.snapshot.files);
  await assertJournalIntact(error.transactionPath);
  assert.equal(error.recoveryRequired, false, 'a pre-payload owned-marker abort must not quarantine unchanged data');
  await assert.rejects(fs.lstat(f.marker), { code: 'ENOENT' });
  for (let i = 0; i < 2; i++) assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, f.snapshot.files);
  const saved = await updateNativeDirectory(f.snapshot, encode(f.after));
  const expected = exportFiles(f.after).map(file => file.path === f.untouched ? f.snapshot.files.find(raw => raw.path === file.path) : file);
  assert.deepEqual(saved.snapshot.files, expected);
  assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, expected);
});

for (const stage of ['empty-write', 'sync', 'close']) test(`${stage} marker failure abort preserves reopen and retry`, async t => {
  const f = await fixture(t); let hits = 0, markerHandle, mutations = 0;
  const io = { ...fs,
    rename: async (...args) => { mutations++; return fs.rename(...args); },
    unlink: async target => { if (target !== f.marker) mutations++; return fs.unlink(target); },
    open: async (target, flags, ...rest) => {
      const handle = await fs.open(target, flags, ...rest);
      if (target !== f.marker || !(flags & constants.O_WRONLY)) return handle;
      markerHandle = handle;
      return proxy(handle, {
        writeFile: async bytes => { if (stage === 'empty-write') { hits++; throw injected('ENOSPC'); } await handle.writeFile(bytes); },
        sync: async () => { if (stage === 'sync') { hits++; throw injected('EIO'); } await handle.sync(); },
        close: async () => { await handle.close(); if (stage === 'close' && !hits) { hits++; throw injected('EIO'); } }
      });
    }
  };
  const error = await updateFailure(f, io);
  assert.equal(hits, 1); assert.equal(mutations, 0); assert.equal(markerHandle.fd, -1);
  assert.deepEqual(await payload(f), f.snapshot.files); await assertJournalIntact(error.transactionPath);
  assert.equal(error.recoveryRequired, false);
  await assert.rejects(fs.lstat(f.marker), { code: 'ENOENT' });
  for (let i = 0; i < 2; i++) assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, f.snapshot.files);
  const saved = await updateNativeDirectory(f.snapshot, encode(f.after));
  assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, saved.snapshot.files);
});

test('existing malformed and unknown-version markers remain quarantined without cleanup or payload writes', async t => {
  for (const bytes of ['', '{', JSON.stringify({ version: 999, operation: 'unknown' })]) {
    const f = await fixture(t); await fs.writeFile(f.marker, bytes); let writes = 0;
    const io = { ...fs, unlink: async () => { writes++; throw Error('must not clean unknown marker'); },
      open: async (target, flags, ...rest) => { if (flags & constants.O_WRONLY) writes++; return fs.open(target, flags, ...rest); } };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), { code: 'DIRECTORY_INCOMPLETE' });
    for (const side of ['before', 'after']) await assert.rejects(recoverNativeDirectory(f.root, side, io));
    assert.equal(writes, 0); assert.equal(await fs.readFile(f.marker, 'utf8'), bytes);
    assert.deepEqual(await payload(f), f.snapshot.files);
  }
});

test('marker collision at exclusive creation retains the foreign file and complete journal', async t => {
  const f = await fixture(t); let hits = 0, unlinks = 0, error;
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), { ...fs,
    unlink: async target => { unlinks++; return fs.unlink(target); },
    open: async (target, flags, ...rest) => {
      if (target === f.marker && flags & constants.O_WRONLY) { hits++; await fs.writeFile(target, 'foreign malformed marker'); }
      return fs.open(target, flags, ...rest);
    }
  }), e => { error = e; return e.code === 'EEXIST'; });
  assert.equal(hits, 1); assert.equal(unlinks, 0); assert.equal(error.recoveryRequired, true);
  assert.equal(await fs.readFile(f.marker, 'utf8'), 'foreign malformed marker');
  assert.deepEqual(await payload(f), f.snapshot.files); await assertJournalIntact(error.transactionPath);
});

for (const replacement of ['new-identity', 'in-place-foreign-bytes']) test(`${replacement} after partial marker error is never removed`, async t => {
  const f = await fixture(t); let hits = 0, unlinks = 0;
  const error = await updateFailure(f, { ...fs,
    unlink: async target => { unlinks++; return fs.unlink(target); },
    open: async (target, flags, ...rest) => {
      const handle = await fs.open(target, flags, ...rest);
      if (target !== f.marker || !(flags & constants.O_WRONLY)) return handle;
      return proxy(handle, { writeFile: async bytes => {
        hits++; await handle.writeFile(bytes.subarray(0, 1));
        if (replacement === 'new-identity') await fs.rename(target, path.join(f.root, 'owned-marker-retained'));
        await fs.writeFile(target, 'foreign malformed marker');
        throw injected('ENOSPC');
      } });
    }
  });
  assert.equal(hits, 1); assert.equal(unlinks, 0); assert.equal(error.recoveryRequired, true);
  assert.equal(await fs.readFile(f.marker, 'utf8'), 'foreign malformed marker');
  if (replacement === 'new-identity') assert.equal(await fs.readFile(path.join(f.root, 'owned-marker-retained'), 'utf8'), '{');
  assert.deepEqual(await payload(f), f.snapshot.files);
  await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
});

test('abort cleanup failure retains marker and preserves the original ENOSPC', async t => {
  const f = await fixture(t); let hits = 0, cleanupAttempts = 0;
  const error = await updateFailure(f, { ...fs,
    unlink: async target => { assert.equal(target, f.marker); cleanupAttempts++; throw injected('EACCES'); },
    open: async (target, flags, ...rest) => {
      const handle = await fs.open(target, flags, ...rest);
      if (target !== f.marker || !(flags & constants.O_WRONLY)) return handle;
      return proxy(handle, { writeFile: async bytes => { hits++; await handle.writeFile(bytes.subarray(0, 1)); throw injected('ENOSPC'); } });
    }
  });
  assert.equal(hits, 1); assert.equal(cleanupAttempts, 1); assert.equal(error.code, 'ENOSPC'); assert.equal(error.recoveryRequired, true);
  assert.equal(await fs.readFile(f.marker, 'utf8'), '{'); assert.deepEqual(await payload(f), f.snapshot.files);
  await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
});

for (const side of ['before', 'after']) test(`uncertain marker close retains evidence for explicit recovery ${side}`, async t => {
  const f = await fixture(t); let closeAttempts = 0, markerHandle;
  const error = await updateFailure(f, { ...fs, open: async (target, flags, ...rest) => {
    const handle = await fs.open(target, flags, ...rest);
    if (target !== f.marker || !(flags & constants.O_WRONLY)) return handle;
    markerHandle = handle; t.after(() => handle.close());
    return proxy(handle, { close: async () => { closeAttempts++; throw injected('EIO'); } });
  } });
  assert.equal(closeAttempts, 2); assert.notEqual(markerHandle.fd, -1); assert.equal(error.recoveryRequired, true);
  assert.deepEqual(await payload(f), f.snapshot.files); await assertJournalIntact(error.transactionPath);
  await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
  await markerHandle.close();
  const recovered = await recoverNativeDirectory(f.root, side);
  assert.deepEqual(exportFiles(recovered.snapshot.state), exportFiles(f[side]));
  for (let i = 0; i < 2; i++) assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, recovered.snapshot.files);
});

for (const side of ['before', 'after']) test(`complete marker plus payload EIO retains explicit recovery ${side}`, async t => {
  const f = await fixture(t); let hits = 0;
  const error = await updateFailure(f, { ...fs, rename: async (...args) => {
    const result = await fs.rename(...args); if (!hits) { hits++; throw injected('EIO'); } return result;
  } });
  assert.equal(hits, 1); assert.equal(error.recoveryRequired, true); await assertJournalIntact(error.transactionPath);
  await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
  const recovered = await recoverNativeDirectory(f.root, side);
  assert.deepEqual(exportFiles(recovered.snapshot.state), exportFiles(f[side]));
  assert.equal(await fs.readFile(path.join(f.root, f.untouched), 'utf8'), f.snapshot.files.find(file => file.path === f.untouched).content);
  for (let i = 0; i < 2; i++) assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, recovered.snapshot.files);
  const retried = await updateNativeDirectory(recovered.snapshot, encode(f.after));
  assert.deepEqual(exportFiles(retried.snapshot.state), exportFiles(f.after));
});
