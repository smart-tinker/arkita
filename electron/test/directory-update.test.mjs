import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createNativeDirectory, readNativeDirectory, captureNativeDirectory, RECOVERY_MARKER, hash } from '../native-directory.mjs';
import { updateNativeDirectory, recoverNativeDirectory, inspectDirectoryRecovery, TRANSACTION_LIMITS } from '../directory-update.mjs';
import { createProject, exportFiles, LIMITS } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const injected = () => Object.assign(Error('injected interruption'), { code: 'EIO' });
const encode = serializeProjectFile;
const element = i => ({ id: fixtureId('el', i), type: 'Role', name: `Synthetic ${i}`, documentation: '', properties: [] });
const state = () => ({ ...createProject('Synthetic before'), elements: [element(1), element(2), element(3)] });
function after(before) { const next = structuredClone(before); next.project.name = 'Synthetic after'; next.elements = [{ ...element(1), name: 'Changed' }, element(3), element(4)]; return next; }
async function fixture(t, before = state()) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-update-test-')); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const saved = await createNativeDirectory(parent, encode(before)); return { parent, root: path.join(parent, saved.name), snapshot: saved.snapshot, before, after: after(before) };
}
const pending = p => path.basename(path.dirname(p)) === 'pending' && /^record-\d{4}\.json$/.test(path.basename(p));
const nativePath = (root, p) => p.startsWith(root + path.sep) && !path.basename(p).startsWith('.schemka-');
const completedMutation = (f, method, args) => method === 'link' && nativePath(f.root, args[1]) ||
  method === 'rename' && nativePath(f.root, args[0]) && !exportFiles(f.after).some(file => path.join(f.root, file.path) === args[0]);
const liveMutation = (root, method, args) => method === 'rename' && nativePath(root, args[0]) || method === 'link' && nativePath(root, args[1]);
const proxy = (handle, overrides) => new Proxy(handle, { get(target, key) { return overrides[key] ?? (typeof target[key] === 'function' ? target[key].bind(target) : target[key]); } });
async function interrupted(t, options = {}) {
  const f = await fixture(t); let changes = 0;
  const io = { ...fs, rename: async (...args) => { if (++changes === (options.at || 2)) throw injected(); return fs.rename(...args); } };
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), /injected interruption/);
  return { ...f, journal: await inspectDirectoryRecovery(f.root) };
}
async function recordBytes(root, model) { return Promise.all(exportFiles(model).map(async f => ({ path: f.path, content: await fs.readFile(path.join(root, f.path), 'utf8') }))); }
async function rewriteMetadata(journal, change) {
  const markerPath = path.join(journal.root, RECOVERY_MARKER), marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
  const headerPath = path.join(journal.tx, 'journal.json'), header = JSON.parse(await fs.readFile(headerPath, 'utf8'));
  const pagePath = path.join(journal.tx, 'page-0000.json'), page = JSON.parse(await fs.readFile(pagePath, 'utf8'));
  change({ marker, header, page });
  const pageBytes = Buffer.from(JSON.stringify(page)); await fs.writeFile(pagePath, pageBytes);
  header.pages[0] = { bytes: pageBytes.length, sha256: hash(pageBytes) };
  const headerBytes = Buffer.from(JSON.stringify(header)); await fs.writeFile(headerPath, headerBytes);
  marker.journal = hash(headerBytes); await fs.writeFile(markerPath, JSON.stringify(marker));
}

test('update/add/retire together and exact raw restore-before preserve unowned content and .git without traversal', async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'schemka.json'); await fs.writeFile(file, JSON.stringify(f.before.project, null, 4) + '\r\n');
  f.snapshot = await captureNativeDirectory(f.root); const rawBefore = f.snapshot.files;
  await fs.mkdir(path.join(f.root, '.git')); await fs.writeFile(path.join(f.root, '.git', 'sentinel'), 'git-original');
  await fs.mkdir(path.join(f.root, 'model/elements/unowned')); await fs.writeFile(path.join(f.root, 'model/elements/unowned', 'sentinel'), 'nested-original');
  await fs.writeFile(path.join(f.root, 'sentinel'), 'original');
  let mutated = false;
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), { ...fs, rename: async (...args) => { if (mutated) throw injected(); mutated = true; return fs.rename(...args); } }));
  await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
  const restored = await recoverNativeDirectory(f.root, 'before'); assert.deepEqual(restored.snapshot.files, rawBefore);
  const saved = await updateNativeDirectory(restored.snapshot, encode(f.after)); assert.deepEqual(saved.snapshot.files, exportFiles(f.after)); assert.match(saved.warning, /оставлены/);
  for (const [p, content] of [['.git/sentinel', 'git-original'], ['model/elements/unowned/sentinel', 'nested-original'], ['sentinel', 'original']]) assert.equal(await fs.readFile(path.join(f.root, p), 'utf8'), content);
});

test('failure at every displacement/publication boundary allows explicit restore-before and finish-after; interrupted recovery is retryable', async t => {
  for (const side of ['before', 'after']) for (const phase of ['before', 'after']) for (let boundary = 1; boundary <= 6; boundary++) {
    const f = await fixture(t); let count = 0;
    async function mutation(method, ...args) {
      if (!liveMutation(f.root, method, args)) return fs[method](...args);
      const current = ++count;
      if (current === boundary && phase === 'before') throw injected();
      const result = await fs[method](...args);
      if (current === boundary && phase === 'after') throw injected();
      return result;
    }
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), { ...fs, rename: (...args) => mutation('rename', ...args), link: (...args) => mutation('link', ...args) }), /injected interruption/);
    const result = await recoverNativeDirectory(f.root, side); assert.deepEqual(result.snapshot.files, exportFiles(f[side]));
  }
  const f = await interrupted(t);
  await assert.rejects(recoverNativeDirectory(f.root, 'after', { ...fs, rename: async () => { throw injected(); } }));
  assert.deepEqual((await recoverNativeDirectory(f.root, 'after')).snapshot.files, exportFiles(f.after));
});

test('snapshot, manifest, marker and temporary open/write/sync/close failures close descriptors, retain evidence and never report saved', async t => {
  for (const target of ['snapshot', 'page', 'journal', 'marker', 'temporary']) for (const stage of ['open', 'writeFile', 'sync', 'close']) {
    const f = await fixture(t); let fired = false, handles = 0;
    const match = p => target === 'snapshot' ? path.basename(path.dirname(p)) === 'before' && path.basename(p) === 'record-0000.json'
      : target === 'page' ? /page-0000\.json$/.test(p) : target === 'journal' ? /journal\.json$/.test(p) : target === 'marker' ? p.endsWith(RECOVERY_MARKER) : pending(p);
    const io = { ...fs, open: async (p, flags, ...rest) => {
      const selected = !fired && (flags & constants.O_WRONLY) && match(p);
      if (selected && stage === 'open') { fired = true; throw injected(); }
      const handle = await fs.open(p, flags, ...rest); handles++;
      return proxy(handle, {
        writeFile: async bytes => { if (selected && stage === 'writeFile') { fired = true; await handle.writeFile(bytes.subarray(0, 1)); throw injected(); } await handle.writeFile(bytes); },
        sync: async () => { if (selected && stage === 'sync') { fired = true; throw injected(); } await handle.sync(); },
        close: async () => {
          const wasOpen = handle.fd !== -1;
          await handle.close(); if (wasOpen) handles--; // A retry after a reported close failure is idempotent.
          if (selected && stage === 'close' && !fired) { fired = true; throw injected(); }
        },
      });
    } };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), /injected interruption/, `${target}/${stage}`); assert.equal(fired, true, `${target}/${stage}`); assert.equal(handles, 0, `${target}/${stage}`);
    const txs = (await fs.readdir(f.parent)).filter(n => n.startsWith('.schemka-transaction-')); assert.equal(txs.length, 1);
    const present = await fs.lstat(path.join(f.root, RECOVERY_MARKER)).then(() => true, () => false);
    if (present) await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' }); else assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, f.snapshot.files);
  }
});

test('same-size third-state writes before staging or during temporary write never become accepted overwrite baselines', async t => {
  for (const stage of ['before-temp', 'during-temp']) {
    const f = await fixture(t); const target = path.join(f.root, `model/elements/${fixtureId('el', 1)}.json`); let changed = false;
    const external = (await fs.readFile(target, 'utf8')).replace('Synthetic 1', 'EXTERNAL  1');
    const io = { ...fs, open: async (p, flags, ...rest) => {
      const selected = !changed && pending(p);
      if (selected && stage === 'before-temp') { changed = true; await fs.writeFile(target, external); }
      const handle = await fs.open(p, flags, ...rest);
      return proxy(handle, { writeFile: async data => { await handle.writeFile(data); if (selected && stage === 'during-temp') { changed = true; await fs.writeFile(target, external); } } });
    } };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), { code: 'DIRECTORY_CHANGED' }); assert.equal(await fs.readFile(target, 'utf8'), external);
    await assert.rejects(recoverNativeDirectory(f.root, 'before'), { code: 'DIRECTORY_CHANGED' }); assert.equal(await fs.readFile(target, 'utf8'), external);
  }
});

test('external baseline modification, deletion or new canonical collision refuses before the first model mutation', async t => {
  for (const kind of ['modified', 'deleted', 'new']) {
    const f = await fixture(t), target = path.join(f.root, `model/elements/${fixtureId('el', kind === 'new' ? 4 : 1)}.json`);
    if (kind === 'deleted') await fs.unlink(target); else await fs.writeFile(target, JSON.stringify(kind === 'new' ? element(4) : { ...element(1), name: 'external' }));
    let writes = 0;
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), { ...fs, mkdir: async () => { writes++; throw Error('must not write'); }, open: async (p, flags, ...rest) => { if (flags & constants.O_WRONLY) writes++; return fs.open(p, flags, ...rest); } }));
    assert.equal(writes, 0);
  }
});

test('root and native/snapshot/transaction ancestor swaps fail closed and preserve outside sentinels', async t => {
  for (const which of ['native', 'snapshot', 'transaction', 'root']) {
    const f = await fixture(t); let swapped = false;
    const outside = path.join(f.parent, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'sentinel'), 'outside');
    const io = { ...fs, open: async (p, flags, ...rest) => {
      if (!swapped && (flags & constants.O_WRONLY) && (which === 'snapshot' ? path.basename(path.dirname(p)) === 'before' : pending(p))) {
        swapped = true;
        const victim = which === 'native' ? path.join(f.root, 'model/elements') : which === 'root' ? f.root : which === 'transaction' ? (await fs.readdir(f.parent)).filter(n => n.startsWith('.schemka-transaction-')).map(n => path.join(f.parent, n))[0] : path.dirname(p);
        await fs.rename(victim, `${victim}-original`); await fs.symlink(outside, victim);
      }
      return fs.open(p, flags, ...rest);
    } };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io)); assert.equal(swapped, true); assert.equal(await fs.readFile(path.join(outside, 'sentinel'), 'utf8'), 'outside');
    // A portable last-check/open race can create only an exclusive temporary file, never overwrite the sentinel.
  }
});

test('malformed marker/header/pages, unknown fields/states, forged completion and path/absence/hash inventories reject before mutation', async t => {
  const mutations = [
    ({ marker }) => { marker.version = 1; }, ({ marker }) => { marker.transaction = '../escape'; },
    ({ marker }) => { marker.root.name = 'another-root'; }, ({ header }) => { header.operation = 'completed'; },
    ({ header }) => { header.completed = true; }, ({ page }) => { page.entries.push(page.entries[0]); },
    ...['/absolute', '../escape', '.git/config', 'SCHEMKA.JSON'].map(value => ({ page }) => { page.entries[0].path = value; }),
    ({ page }) => { page.entries[0].before.sha256 = '0'.repeat(64); },
    ({ page }) => { page.entries[0].before.bytes = 0; }, ({ page }) => { page.entries[0].before = null; page.entries[0].after = null; },
    ({ page }) => { page.entries[0].before = false; },
  ];
  for (const change of mutations) {
    const f = await interrupted(t); await rewriteMetadata(f.journal, change); let mutations = 0;
    await assert.rejects(recoverNativeDirectory(f.root, 'after', { ...fs, rename: async () => { mutations++; }, unlink: async () => { mutations++; } })); assert.equal(mutations, 0);
  }
  for (const target of [RECOVERY_MARKER, 'journal.json', 'page-0000.json']) for (const payload of ['', '{', '{"version":1,"version":1}', 'x'.repeat(LIMITS.fileBytes + 1)]) {
    const f = await interrupted(t); await fs.writeFile(path.join(target === RECOVERY_MARKER ? f.root : f.journal.tx, target), payload);
    await assert.rejects(recoverNativeDirectory(f.root, 'before'));
  }
});

test('missing/extra/altered snapshots and symlinked metadata refuse; new live native file outside union prevents all recovery writes', async t => {
  for (const mutation of ['missing', 'extra', 'altered', 'symlink-marker', 'symlink-page', 'symlink-snapshot', 'new-live']) {
    const f = await interrupted(t), snapshotFile = path.join(f.journal.tx, 'before/record-0000.json');
    if (mutation === 'missing') await fs.unlink(snapshotFile);
    else if (mutation === 'extra') await fs.writeFile(path.join(f.journal.tx, 'before/unknown.txt'), 'extra');
    else if (mutation === 'altered') await fs.writeFile(snapshotFile, JSON.stringify({ ...f.before.project, name: 'Changed snapshot' }));
    else if (mutation.startsWith('symlink')) {
      const target = mutation === 'symlink-marker' ? path.join(f.root, RECOVERY_MARKER) : mutation === 'symlink-page' ? path.join(f.journal.tx, 'page-0000.json') : snapshotFile;
      await fs.rename(target, `${target}.original`); await fs.symlink(`${target}.original`, target);
    } else await fs.writeFile(path.join(f.root, `model/elements/${fixtureId('el', 99)}.json`), JSON.stringify(element(99)));
    let writes = 0; await assert.rejects(recoverNativeDirectory(f.root, 'before', { ...fs, rename: async () => { writes++; }, unlink: async () => { writes++; } })); assert.equal(writes, 0, mutation);
  }
});

test('marker replacement/removal failure retains original evidence; completed disk after marker removal reopens without renderer acknowledgment', async t => {
  for (const kind of ['replace', 'unlink-failure']) {
    const f = await fixture(t); let count = 0;
    const io = { ...fs, unlink: async target => {
      if (!target.endsWith(RECOVERY_MARKER)) return fs.unlink(target);
      throw injected();
    }, rename: async (...args) => {
      const result = await fs.rename(...args);
      if (kind === 'replace' && ++count === 3) { await fs.rename(path.join(f.root, RECOVERY_MARKER), path.join(f.root, 'original-marker')); await fs.writeFile(path.join(f.root, RECOVERY_MARKER), 'replacement'); }
      return result;
    } };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io));
    await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
    if (kind === 'replace') assert.equal(await fs.readFile(path.join(f.root, RECOVERY_MARKER), 'utf8'), 'replacement');
    else assert.deepEqual((await recoverNativeDirectory(f.root, 'before')).snapshot.files, exportFiles(f.before));
  }
  const f = await fixture(t); await updateNativeDirectory(f.snapshot, encode(f.after));
  assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
});

test('recovery checks original expected state again during staging and before deletion, preserving third-state bytes', async t => {
  for (const action of ['write', 'delete']) {
    const f = await interrupted(t, { at: 1 }); let altered = false;
    const relative = `model/elements/${fixtureId('el', action === 'write' ? 1 : 2)}.json`, target = path.join(f.root, relative);
    const external = JSON.stringify({ ...element(action === 'write' ? 1 : 2), name: 'external recovery edit' });
    const io = { ...fs, open: async (p, flags, ...rest) => {
      const handle = await fs.open(p, flags, ...rest);
      return proxy(handle, { close: async () => {
        await handle.close();
        if (!altered && (action === 'write' ? pending(p) && (flags & constants.O_WRONLY) : p === target && !(flags & constants.O_WRONLY))) { altered = true; await fs.writeFile(target, external); }
      } });
    } };
    await assert.rejects(recoverNativeDirectory(f.root, 'after', io)); assert.equal(altered, true); assert.equal(await fs.readFile(target, 'utf8'), external);
  }
});

test('maximum native file inventories use bounded pages and a full disjoint update bounds file reads while measuring metadata cost', {
  timeout: 1500000, skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'capacity test runs in Extended CI' : false,
}, async t => {
  const before = createProject('Maximum synthetic'); before.elements = Array.from({ length: LIMITS.files - 1 }, (_, i) => element(i + 1));
  function fillBudget(model) {
    const initial = exportFiles(model).reduce((n, file) => n + Buffer.byteLength(file.content), 0);
    const length = Math.floor((LIMITS.totalBytes - initial - 1024) / model.elements.length);
    model.elements.forEach(item => { item.documentation = 'x'.repeat(length); });
    return exportFiles(model).reduce((n, file) => n + Buffer.byteLength(file.content), 0);
  }
  const beforeBytes = fillBudget(before), f = await fixture(t, before), next = structuredClone(before);
  next.elements = Array.from({ length: LIMITS.files - 1 }, (_, i) => element(LIMITS.files + i));
  const afterBytes = fillBudget(next); assert.ok(beforeBytes > LIMITS.totalBytes * .99); assert.ok(afterBytes > LIMITS.totalBytes * .99);
  let opens = 0, lstats = 0, interruptedLargeIndex = false;
  const io = { ...fs, lstat: async (...args) => { lstats++; return fs.lstat(...args); }, open: async (p, flags, ...args) => {
    opens++; const handle = await fs.open(p, flags, ...args);
    if (interruptedLargeIndex || !(flags & constants.O_WRONLY) || path.basename(path.dirname(p)) !== 'pending' || path.basename(p) !== 'record-10000.json') return handle;
    return proxy(handle, { writeFile: async bytes => { interruptedLargeIndex = true; await handle.writeFile(bytes.subarray(0, 1)); throw injected(); } });
  } };
  t.diagnostic('maximum inventory: capturing before snapshot');
  f.snapshot = await captureNativeDirectory(f.root, io); opens = lstats = 0;
  t.diagnostic('maximum inventory: snapshot captured; running disjoint update');
  const start = performance.now();
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(next), io), /injected interruption/);
  t.diagnostic('maximum inventory: update interrupted; validating and recovering journal');
  assert.equal(interruptedLargeIndex, true, 'exercise an actual five-digit pending record in the maximum journal');
  const transaction = path.join(f.parent, (await fs.readdir(f.parent)).find(name => name.startsWith('.schemka-transaction-')));
  const pendingFile = path.join(transaction, 'pending', 'record-10000.json'), noncanonical = path.join(transaction, 'pending', 'record-00001.json');
  await fs.rename(pendingFile, noncanonical);
  await assert.rejects(inspectDirectoryRecovery(f.root), { code: 'DIRECTORY_CHANGED' });
  await fs.rename(noncanonical, pendingFile);
  const result = await recoverNativeDirectory(f.root, 'after', io);
  const counts = { opens, lstats, ms: Math.round(performance.now() - start) };
  assert.deepEqual(result.snapshot.files, exportFiles(next));
  const header = JSON.parse(await fs.readFile(path.join(result.transaction, 'journal.json'), 'utf8'));
  assert.equal(header.pages.length, TRANSACTION_LIMITS.pages); assert.ok(header.pages.every(page => page.bytes <= LIMITS.fileBytes)); assert.ok(counts.opens < LIMITS.files * 60, `${counts.opens} file opens exceeds linear bound`);
  let journalBytes = 0;
  for (const name of await fs.readdir(result.transaction)) {
    if (['before', 'after', 'pending', 'displaced'].includes(name)) for (const file of await fs.readdir(path.join(result.transaction, name))) journalBytes += (await fs.stat(path.join(result.transaction, name, file))).size;
    else journalBytes += (await fs.stat(path.join(result.transaction, name))).size;
  }
  assert.ok(journalBytes < TRANSACTION_LIMITS.bytes);
  t.diagnostic(`${LIMITS.files}-before + ${LIMITS.files}-after, ${2 * LIMITS.files - 1}-union paths, M=${2 * LIMITS.files - 2}, ${header.pages.length} bounded pages; raw bytes before=${beforeBytes}, after=${afterBytes}, journal=${journalBytes}; fully counted ${JSON.stringify(counts)}`);

});

test('actual child-process termination after one native replacement leaves detected, recoverable before/after copies', async t => {
  const { spawn } = await import('node:child_process');
  for (const side of ['before', 'after']) {
    const f = await fixture(t);
    const script = `import * as fs from 'node:fs/promises';
      import {captureNativeDirectory} from ${JSON.stringify(new URL('../native-directory.mjs', import.meta.url).href)};
      import {updateNativeDirectory} from ${JSON.stringify(new URL('../directory-update.mjs', import.meta.url).href)};
      import {serializeProjectFile} from ${JSON.stringify(new URL('../../schemka-model-io/src/project-file.js', import.meta.url).href)};
      const snapshot=await captureNativeDirectory(process.argv[1]); const next=structuredClone(snapshot.state);next.project.name='Process terminated after mutation';
      next.elements[0].name='Changed by synthetic child';
      await updateNativeDirectory(snapshot,serializeProjectFile(next),{...fs,rename:async(...args)=>{await fs.rename(...args);process.exit(86);}});`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, f.root], { stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = '';
    child.stderr.on('data', bytes => stderr += bytes.toString());
    const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(exit, 86, stderr);
    await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
    const recovered = await recoverNativeDirectory(f.root, side);
    assert.equal(recovered.snapshot.state.project.name, side === 'before' ? f.before.project.name : 'Process terminated after mutation');
  }
});

test('R3 revised boundary: an earlier completed-path edit is preserved and final verification refuses update and recovery', async t => {
  for (const operation of ['update', 'recovery']) {
    const f = operation === 'update' ? await fixture(t) : await interrupted(t, { at: 1 });
    const target = path.join(f.root, `model/elements/${fixtureId('el', 1)}.json`); let external = false, laterMutations = 0;
    const deleted = path.join(f.root, `model/elements/${fixtureId('el', 2)}.json`);
    const io = { ...fs, link: async (...args) => { if (external && nativePath(f.root, args[1])) laterMutations++; return fs.link(...args); }, rename: async (...args) => {
      const result = await fs.rename(...args);
      if (args[0] === deleted) { await fs.writeFile(target, 'external-prior-record'); external = true; }
      return result;
    } };
    await assert.rejects(operation === 'update' ? updateNativeDirectory(f.snapshot, encode(f.after), io) : recoverNativeDirectory(f.root, 'after', io), { code: 'DIRECTORY_CHANGED' });
    assert.equal(external, true); assert.equal(laterMutations, 2); assert.equal(await fs.readFile(target, 'utf8'), 'external-prior-record');
    assert.ok((await fs.lstat(path.join(f.root, RECOVERY_MARKER))).isFile());
  }
});

test('final full-verification failures and post-marker-removal lost acknowledgment distinguish blocked roots from complete disk state', async t => {
  for (const stage of ['before-final-read', 'after-final-read', 'lost-ack']) {
    const f = await fixture(t); let mutations = 0, finalScans = 0, verified = false, fired = false;
    const io = { ...fs, rename: async (...args) => { const result = await fs.rename(...args); if (completedMutation(f, 'rename', args)) mutations++; return result; },
      link: async (...args) => { const result = await fs.link(...args); if (completedMutation(f, 'link', args)) mutations++; return result; },
      unlink: async p => { const result = await fs.unlink(p); if (p.endsWith(RECOVERY_MARKER) && stage === 'lost-ack') { fired = true; throw injected(); } return result; },
      opendir: async p => {
        if (p === f.root && mutations === 4) { finalScans++; if (stage === 'before-final-read' && finalScans === 2) { fired = true; throw injected(); } }
        const dir = await fs.opendir(p); return { read: () => dir.read(), close: async () => { await dir.close(); if (p === f.root && finalScans === 3) verified = true; } };
      },
      open: async (p, flags, ...rest) => { if (stage === 'after-final-read' && verified && p.endsWith(RECOVERY_MARKER) && !(flags & constants.O_WRONLY)) { fired = true; throw injected(); } return fs.open(p, flags, ...rest); },
    };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), /injected interruption/); assert.equal(fired, true, stage);
    if (stage === 'lost-ack') assert.deepEqual((await readNativeDirectory(f.root)).snapshot.files, exportFiles(f.after));
    else { await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' }); assert.deepEqual((await recoverNativeDirectory(f.root, 'before')).snapshot.files, exportFiles(f.before)); }
  }
});

test('regular native ancestor replacement before delete in update/recovery preserves the replacement and all remaining evidence', async t => {
  for (const operation of ['update', 'recovery']) {
    const f = operation === 'update' ? await fixture(t) : await interrupted(t, { at: 1 });
    const parent = path.join(f.root, 'model/elements'), target = path.join(parent, `${fixtureId('el', 2)}.json`); let mutated = false, swapped = false, deletes = 0;
    const io = { ...fs, rename: async (...args) => { if (args[0] === target) deletes++; const result = await fs.rename(...args); mutated = true; return result; }, unlink: async (...args) => { if (args[0] === target) deletes++; return fs.unlink(...args); },
      open: async (p, flags, ...rest) => {
        if (mutated && !swapped && p === target && !(flags & constants.O_WRONLY)) { swapped = true; await fs.rename(parent, `${parent}-original`); await fs.mkdir(parent); await fs.writeFile(target, 'external-directory-target'); }
        return fs.open(p, flags, ...rest);
      } };
    await assert.rejects(operation === 'update' ? updateNativeDirectory(f.snapshot, encode(f.after), io) : recoverNativeDirectory(f.root, 'after', io));
    assert.equal(swapped, true); assert.equal(deletes, 0); assert.equal(await fs.readFile(target, 'utf8'), 'external-directory-target');
    assert.ok((await fs.lstat(path.join(f.root, RECOVERY_MARKER))).isFile()); assert.ok((await fs.readdir(f.parent)).some(n => n.startsWith('.schemka-transaction-')));
  }
});

test('a new target created as an empty file during staging is not equivalent to recorded absence', async t => {
  const f = await fixture(t), target = path.join(f.root, `model/elements/${fixtureId('el', 4)}.json`); let staged = false;
  const io = { ...fs, open: async (p, flags, ...rest) => {
    const handle = await fs.open(p, flags, ...rest), isNewTarget = pending(p) && (flags & constants.O_WRONLY) && path.basename(p) === 'record-0003.json';
    return proxy(handle, { writeFile: async bytes => { await handle.writeFile(bytes); if (isNewTarget) { staged = true; await fs.writeFile(target, ''); } } });
  } };
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io), { code: 'DIRECTORY_CHANGED' }); assert.equal(staged, true); assert.equal((await fs.stat(target)).size, 0);
  await assert.rejects(recoverNativeDirectory(f.root, 'after')); assert.equal((await fs.stat(target)).size, 0);
});

test('near-final regular transaction ancestor replacement cannot authorize marker removal', async t => {
  const f = await fixture(t); let mutations = 0, finalScans = 0, verified = false, swapped = false;
  const io = { ...fs, rename: async (...args) => { const result = await fs.rename(...args); if (completedMutation(f, 'rename', args)) mutations++; return result; },
    link: async (...args) => { const result = await fs.link(...args); if (completedMutation(f, 'link', args)) mutations++; return result; },
    unlink: async p => { if (p.endsWith(RECOVERY_MARKER)) throw Error('must not remove marker'); return fs.unlink(p); },
    opendir: async p => { if (p === f.root && mutations === 4) finalScans++; const dir = await fs.opendir(p); return { read: () => dir.read(), close: async () => { await dir.close(); if (p === f.root && finalScans === 3) verified = true; } }; },
    lstat: async (p, ...args) => { if (verified && !swapped && /^\.schemka-transaction-/.test(path.basename(p))) { swapped = true; await fs.rename(p, `${p}-original`); await fs.mkdir(p); } return fs.lstat(p, ...args); } };
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io)); assert.equal(swapped, true); assert.ok((await fs.lstat(path.join(f.root, RECOVERY_MARKER))).isFile());
});

test('directory-rich scaling is measured separately from bounded file reads, without an overall linear-work claim', async t => {
  const samples = [];
  for (const count of [16, 32, 64]) {
    const before = createProject(`Synthetic ${count} views`); before.views = Array.from({ length: count }, (_, i) => ({ view: { id: fixtureId('view', i + 1), name: `Before ${i}`, documentation: '', properties: [] }, occurrences: [], connections: [], visualNodes: [], visualConnectors: [] }));
    const f = await fixture(t, before), next = structuredClone(before); next.views.forEach(entry => entry.view.name = 'After');
    let lstats = 0, opens = 0;
    const io = { ...fs, lstat: async (...args) => { lstats++; return fs.lstat(...args); }, open: async (...args) => { opens++; return fs.open(...args); } };
    f.snapshot = await captureNativeDirectory(f.root, io); lstats = opens = 0;
    const start = performance.now(), result = await updateNativeDirectory(f.snapshot, encode(next), io);
    const counts = { lstats, opens, ms: Math.round(performance.now() - start) };
    assert.deepEqual(result.snapshot.files, exportFiles(next)); samples.push({ views: count, files: count + 1, ...counts });
  }
  t.diagnostic(`Directory-rich metadata/read costs: ${JSON.stringify(samples)}. No processed-path sweeps; counts include the recaptured guard, with no global linear-work claim.`);
});

test('near-final recorded snapshot bytes and inventory remain authoritative after semantic validation is reused', async t => {
  for (const kind of ['rewrite', 'delete', 'add']) {
    const f = await fixture(t); let mutations = 0, changed = false, markerRemoved = false;
    const io = { ...fs,
      rename: async (...args) => { const value = await fs.rename(...args); if (completedMutation(f, 'rename', args)) mutations++; return value; },
      link: async (...args) => { const value = await fs.link(...args); if (completedMutation(f, 'link', args)) mutations++; return value; },
      unlink: async p => { if (p.endsWith(RECOVERY_MARKER)) markerRemoved = true; return fs.unlink(p); },
      open: async (p, flags, ...rest) => {
        const handle = await fs.open(p, flags, ...rest);
        return proxy(handle, { close: async () => {
          await handle.close();
          if (!changed && mutations === 4 && path.basename(path.dirname(p)) === 'before' && path.basename(p) === 'record-0000.json' && !(flags & constants.O_WRONLY)) {
            changed = true;
            if (kind === 'rewrite') await fs.writeFile(p, JSON.stringify({ ...f.before.project, name: 'external snapshot edit' }));
            else if (kind === 'delete') await fs.unlink(p);
            else await fs.writeFile(path.join(path.dirname(p), 'unexpected.json'), '{}');
          }
        } });
      },
    };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), io));
    assert.equal(changed, true); assert.equal(markerRemoved, false);
    await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
  }
});

test('delta zero-change saves only verify; one-record saves preserve untouched raw formatting and copy only the changed record', async t => {
  const f = await fixture(t);
  for (const file of f.snapshot.files) await fs.writeFile(path.join(f.root, file.path), JSON.stringify(JSON.parse(file.content), null, 4) + '\r\n');
  f.snapshot = await captureNativeDirectory(f.root);
  let writes = 0;
  const noWrites = { ...fs, mkdir: async () => { writes++; throw Error('unexpected mkdir'); }, rename: async () => { writes++; throw Error('unexpected rename'); }, unlink: async () => { writes++; throw Error('unexpected unlink'); }, open: async (p, flags, ...rest) => { if (flags & constants.O_WRONLY) { writes++; throw Error('unexpected write'); } return fs.open(p, flags, ...rest); } };
  assert.deepEqual((await updateNativeDirectory(f.snapshot, encode(f.before), noWrites)).snapshot.files, f.snapshot.files);
  assert.equal(writes, 0); assert.deepEqual(await fs.readdir(f.parent), [path.basename(f.root)]);
  const next = structuredClone(f.before); next.elements[0].name = 'Only one changed';
  const untouched = f.snapshot.files.filter(file => !file.path.includes(fixtureId('el', 1)));
  const saved = await updateNativeDirectory(f.snapshot, encode(next));
  for (const file of untouched) assert.equal(await fs.readFile(path.join(f.root, file.path), 'utf8'), file.content);
  assert.deepEqual(exportFiles(saved.snapshot.state), exportFiles(next));
  assert.deepEqual(await fs.readdir(path.join(saved.transaction, 'before')), ['record-0000.json']);
  assert.deepEqual(await fs.readdir(path.join(saved.transaction, 'after')), ['record-0000.json']);
  assert.equal(await fs.readFile(path.join(saved.transaction, 'before/record-0000.json'), 'utf8'), f.snapshot.files[0].content);
  const header = JSON.parse(await fs.readFile(path.join(saved.transaction, 'journal.json'), 'utf8'));
  assert.deepEqual([header.version, header.operation], [3, 'delta-update']);
});

test('rich delta update and both recovery choices retain every ID, typed property, anchor and raw multiplicity', async t => {
  const { customizationProject } = await import('../../schemka-model-core/fixtures/customization-project.js');
  for (const side of ['before', 'after']) {
    const before = customizationProject({ amount: { type: 'Currency', default: { amount: '-123.4500', currency: 'USD' } } });
    const f = await fixture(t, before), next = structuredClone(before); next.elements[0].name = 'Delta rich element'; next.views[0].view.name = 'Delta rich view';
    let mutations = 0;
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(next), { ...fs, rename: async (...args) => { const result = await fs.rename(...args); if (++mutations === 1) throw injected(); return result; } }));
    assert.deepEqual((await recoverNativeDirectory(f.root, side)).snapshot.files, exportFiles(side === 'before' ? before : next));
  }
});

test('untouched records changed, removed or added during staging, mutation or final observation are never acknowledged or reconstructed', async t => {
  for (const stage of ['staging', 'mutation', 'final']) for (const kind of ['rewrite', 'delete', 'add']) {
    const f = await fixture(t), next = structuredClone(f.before); next.elements[0].name = 'One intended change';
    const target = path.join(f.root, `model/elements/${fixtureId('el', kind === 'add' ? 99 : 3)}.json`);
    const external = JSON.stringify({ ...element(kind === 'add' ? 99 : 3), name: 'External untouched record' });
    let fired = false, mutations = 0;
    const change = async () => { if (fired) return; fired = true; if (kind === 'delete') await fs.unlink(target); else await fs.writeFile(target, external); };
    const io = { ...fs,
      open: async (p, flags, ...rest) => { if (stage === 'staging' && (flags & constants.O_WRONLY) && path.basename(path.dirname(p)) === 'before') await change(); return fs.open(p, flags, ...rest); },
      rename: async (...args) => { const result = await fs.rename(...args); mutations++; if (stage === 'mutation') await change(); return result; },
      opendir: async p => { if (stage === 'final' && mutations && p === f.root) await change(); return fs.opendir(p); },
    };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(next), io), { code: 'DIRECTORY_CHANGED' }); assert.equal(fired, true);
    assert.ok((await fs.lstat(path.join(f.root, RECOVERY_MARKER))).isFile());
    for (const side of ['before', 'after']) {
      let writes = 0;
      await assert.rejects(recoverNativeDirectory(f.root, side, { ...fs, rename: async () => writes++, unlink: async () => writes++ })); assert.equal(writes, 0);
    }
    if (kind === 'delete') await assert.rejects(fs.lstat(target), { code: 'ENOENT' }); else assert.equal(await fs.readFile(target, 'utf8'), external);
  }
});

test('untrusted delta paths never select copy read locations and reconstructed path/ID mismatches refuse before writes', async t => {
  const mutations = [
    ...['../../outside', '/outside', '.git/config', 'SCHEMKA.JSON', `model/elements/${fixtureId('el', 0)}.json`].map(value => ({ page }) => { page.entries[0].path = value; }),
    ({ page }) => { page.entries.push({ ...page.entries[0] }); },
    ({ header }) => { header.pages = Array(33).fill(header.pages[0]); },
    ({ page }) => { page.entries[0].before.bytes = LIMITS.fileBytes + 1; },
    ({ page }) => { page.entries[0].after = page.entries[0].before; },
  ];
  for (const mutate of mutations) {
    const f = await interrupted(t); await rewriteMetadata(f.journal, mutate); let writes = 0, reads = 0;
    const io = { ...fs, open: async (p, ...rest) => { assert.ok(p.startsWith(f.root + path.sep) || p.startsWith(f.journal.tx + path.sep), `outside read: ${p}`); reads++; return fs.open(p, ...rest); }, rename: async () => writes++, unlink: async () => writes++ };
    await assert.rejects(recoverNativeDirectory(f.root, 'after', io)); assert.equal(writes, 0); assert.ok(reads > 0);
  }
});

test('unsupported previous full-copy journal format refuses explicitly without deleting evidence', async t => {
  const f = await interrupted(t); await rewriteMetadata(f.journal, ({ marker, header }) => { marker.version = header.version = 1; marker.operation = header.operation = 'update'; });
  const marker = await fs.readFile(path.join(f.root, RECOVERY_MARKER)), entries = await fs.readdir(f.journal.tx);
  await assert.rejects(recoverNativeDirectory(f.root, 'before'), { code: 'DIRECTORY_RECOVERY_VERSION' });
  assert.deepEqual(await fs.readFile(path.join(f.root, RECOVERY_MARKER)), marker); assert.deepEqual(await fs.readdir(f.journal.tx), entries);
});

test('each recovery mutation boundary can itself be interrupted before or after, with either explicit choice retryable', async t => {
  for (const side of ['before', 'after']) for (const phase of ['before', 'after']) for (let boundary = 1; boundary <= 6; boundary++) {
    const f = await fixture(t);
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(f.after), { ...fs, ...(side === 'before' ? { unlink: async p => { if (p.endsWith(RECOVERY_MARKER)) throw injected(); return fs.unlink(p); } } : { rename: async () => { throw injected(); } }) }));
    let mutations = 0;
    const action = async (method, ...args) => {
      if (!liveMutation(f.root, method, args)) return fs[method](...args);
      const selected = ++mutations === boundary;
      if (selected && phase === 'before') throw injected();
      const result = await fs[method](...args); if (selected && phase === 'after') throw injected(); return result;
    };
    await assert.rejects(recoverNativeDirectory(f.root, side, { ...fs, rename: (...args) => action('rename', ...args), link: (...args) => action('link', ...args) }), /injected interruption/);
    assert.deepEqual((await recoverNativeDirectory(f.root, side)).snapshot.files, exportFiles(f[side]));
  }
});
