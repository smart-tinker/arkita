import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectDirectoryRecovery, recoverNativeDirectory, updateNativeDirectory } from '../directory-update.mjs';
import { readNativeDirectory, RECOVERY_MARKER, hash } from '../native-directory.mjs';
import { serializeProjectFile, readProjectFile } from '../../schemka-model-io/src/project-file.js';

// Captured from d075e67's real writer, not a current journal with its version changed.
const released = JSON.parse(await fs.readFile(new URL('./fixtures/native-v2-recovery-0.5.1.json', import.meta.url), 'utf8'));
const json = value => JSON.stringify(value) + '\n';
const stamp = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
async function fixture(t, partial = false, edit = null) {
  const source = structuredClone(released), marker = JSON.parse(source.marker);
  assert.equal(source.sourceCommit, 'd075e67c7ca6e7720f537102e245a59f53808b32');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-legacy-recovery-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'model'), tx = path.join(parent, `.schemka-transaction-${marker.transaction}`);
  await fs.mkdir(root); await fs.mkdir(tx);
  const headerFile = source.journal.find(file => file.path === 'journal.json'), header = JSON.parse(headerFile.content);
  const pageFile = source.journal.find(file => file.path === 'page-0000.json'), page = JSON.parse(pageFile.content);
  if (edit) {
    const index = page.entries.findIndex(entry => entry.path === edit.path);
    const copy = source.journal.find(file => file.path === `after/record-${String(index).padStart(4, '0')}.json`);
    copy.content = edit.change(copy.content);
    page.entries[index].after = { bytes: Buffer.byteLength(copy.content), sha256: hash(copy.content) };
    pageFile.content = json(page);
    header.pages[0] = { bytes: Buffer.byteLength(pageFile.content), sha256: hash(pageFile.content) };
  }
  // Only machine-owned identities change; released record payloads stay byte-exact.
  header.root = marker.root = { name: path.basename(root), ...stamp(await fs.lstat(root, { bigint: true })) };
  marker.directory = stamp(await fs.lstat(tx, { bigint: true }));
  headerFile.content = json(header); marker.journal = hash(headerFile.content);
  for (const [base, files] of [[root, source.before], [tx, source.journal]]) for (const file of files) {
    const target = path.join(base, file.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.content);
  }
  if (partial) {
    const entry = page.entries.find(entry => entry.path.startsWith('model/relationships/'));
    await fs.writeFile(path.join(root, entry.path), source.after.find(file => file.path === entry.path).content);
  }
  await fs.writeFile(path.join(root, RECOVERY_MARKER), json(marker));
  return { root, tx, source };
}
async function live(f) { return Promise.all(f.source.before.map(async file => ({ path: file.path, content: await fs.readFile(path.join(f.root, file.path), 'utf8') }))); }
async function assertRecovered(f, side, result) {
  assert.deepEqual(result.snapshot.files, f.source[side]);
  assert.deepEqual(await live(f), f.source[side]);
  const opened = await readNativeDirectory(f.root);
  assert.equal(opened.snapshot.sourceVersion, 2);
  assert.equal(readProjectFile(opened.bytes).sourceVersion, 2);
  assert.equal(opened.snapshot.state.project.formatVersion, 4);
  await assert.rejects(fs.lstat(path.join(f.root, RECOVERY_MARKER)), { code: 'ENOENT' });
  for (const file of f.source.journal) assert.equal(await fs.readFile(path.join(f.tx, file.path), 'utf8'), file.content);
  await assert.rejects(updateNativeDirectory(opened.snapshot, serializeProjectFile(opened.snapshot.state)), { code: 'VERSION_SAVE_AS' });
}

for (const partial of [false, true]) for (const side of ['before', 'after']) test(`released native-v2 journal recovers exact ${side} bytes with partial=${partial}`, async t => {
  const f = await fixture(t, partial), journal = await inspectDirectoryRecovery(f.root);
  assert.equal(journal.version, 2);
  assert.deepEqual(journal.before.files, f.source.before); assert.deepEqual(journal.after.files, f.source.after);
  await assertRecovered(f, side, await recoverNativeDirectory(f.root, side));
});

for (const side of ['before', 'after']) test(`released native-v2 recovery can be interrupted again and resumed to ${side}`, async t => {
  const f = await fixture(t);
  let moved = false;
  await assert.rejects(recoverNativeDirectory(f.root, 'after', { ...fs, rename: async (...args) => {
    await fs.rename(...args); moved = true; throw Object.assign(Error('interrupted recovery'), { code: 'EIO' });
  } }), { code: 'EIO' });
  assert.equal(moved, true);
  await assertRecovered(f, side, await recoverNativeDirectory(f.root, side));
});

for (const select of [file => file.path === 'schemka.json', file => file.path.startsWith('model/relationships/'), file => file.path.endsWith('/view.json')]) {
  const record = released.after.find(select);
  test(`released native-v2 journal refuses noncanonical changed ${record.path} even with matching hashes`, async t => {
    const f = await fixture(t, false, { path: record.path, change: content => JSON.stringify(JSON.parse(content)) });
    const before = await live(f);
    await assert.rejects(recoverNativeDirectory(f.root, 'after'), { code: 'DIRECTORY_CHANGED' });
    assert.deepEqual(await live(f), before);
    assert.ok(await fs.lstat(path.join(f.root, RECOVERY_MARKER)));
  });
}

test('released native-v2 journal refuses an unversioned v3 field even with matching hashes', async t => {
  const file = released.after.find(item => item.path.endsWith('/view.json'));
  const f = await fixture(t, false, { path: file.path, change: content => json({ ...JSON.parse(content), properties: {} }) });
  const before = await live(f);
  await assert.rejects(recoverNativeDirectory(f.root, 'after'), { code: 'SCHEMA' });
  assert.deepEqual(await live(f), before);
});
