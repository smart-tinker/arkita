import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FORMAT_VERSION, exportFiles, importFiles, readProjectFiles, LIMITS } from '../schemka-model-core/src/index.js';
import { canonicalJSON, parseJSON, record } from '../schemka-model-core/src/json.js';
import { deserializeProjectFile, serializeProjectFile } from '../schemka-model-io/src/project-file.js';
import { projectBytes } from './project-files.mjs';
import { readEvidence, verifyEvidence, preservingReplace, clearPending, sameContentStamp } from './preserved-write.mjs';
import { removeCompletedTransaction } from './completed-transaction.mjs';
import { boundaries, readRegular, exclusiveFile, observe, verifiedRead,
  RECOVERY_MARKER, hash, sameFile, sameIdentity, sameFiles } from './native-directory.mjs';

const metadataBytes = LIMITS.files * 2 * 384 + LIMITS.fileBytes;
export const TRANSACTION_LIMITS = Object.freeze({ bytes: LIMITS.totalBytes * 4 + metadataBytes + LIMITS.fileBytes,
  pages: Math.ceil(LIMITS.files * 2 / 128), entriesPerPage: 128, metadataBytes,
  retainedFiles: LIMITS.files * 2, retainedBytes: LIMITS.totalBytes * 2 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const changed = () => fail('DIRECTORY_CHANGED', 'Каталог или данные восстановления изменились. Запись остановлена; сохранённые копии оставлены.');
const json = value => Buffer.from(JSON.stringify(value) + '\n');
const stamp = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const descriptor = file => file ? { bytes: Buffer.byteLength(file.content), sha256: hash(file.content) } : null;
const pageName = i => `page-${String(i).padStart(4, '0')}.json`;
const sort = items => items.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
function inventory(before, after) {
  const b = new Map(before.map(f => [f.path, f])), a = new Map(after.map(f => [f.path, f]));
  return [...new Set([...b.keys(), ...a.keys()])].sort().map(p => ({ path: p, before: descriptor(b.get(p)), after: descriptor(a.get(p)) }));
}
function checkedRecord(value, required) { record(value, required); return value; }
function checkStamp(value) { checkedRecord(value, ['dev', 'ino']); if (!/^\d{1,32}$/.test(value.dev) || !/^\d{1,32}$/.test(value.ino)) changed(); }
function checkDescriptor(value) {
  checkedRecord(value, ['bytes', 'sha256']);
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > LIMITS.fileBytes || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) changed();
}
function decode(bytes) {
  if (bytes.length > LIMITS.fileBytes || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) changed();
  return parseJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function ownedFile(target, bytes, guard, io) {
  const stat = await exclusiveFile(target, bytes, guard, io);
  return { target, bytes, stat };
}
async function verifyOwned(file, guard, io) {
  const current = await readRegular(file.target, file.bytes.length, guard, io);
  if (!sameFile(file.stat, current.stat) || !file.bytes.equals(current.bytes)) changed();
}
async function installRecoveryMarker(journal, io) {
  const { root, rootGuard: guard, markerBytes: bytes } = journal, target = path.join(root, RECOVERY_MARKER);
  let handle, owned, closed = false;
  try {
    await guard.check(root);
    handle = await io.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    owned = await handle.stat({ bigint: true });
    await guard.check(root);
    await handle.writeFile(bytes);
    await handle.sync();
    owned = await handle.stat({ bigint: true });
    await handle.close(); closed = true;
    await guard.check(root);
    if (!sameFile(owned, await io.lstat(target, { bigint: true }))) changed();
    return { target, bytes, stat: owned };
  } catch (error) {
    if (handle && !closed) {
      try { owned = await handle.stat({ bigint: true }); } catch { /* Keep the last handle-owned identity. */ }
      try { await handle.close(); closed = true; } catch { /* An uncertain close retains the guard. */ }
    }
    // No payload mutation is possible until this function returns. Abort only
    // our exclusive file, never a replacement or unrelated malformed marker.
    if (owned && closed) try {
      await guard.verify();
      const current = await io.lstat(target, { bigint: true });
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || !sameFile(owned, current)) changed();
      if (current.size > 0n) {
        const partial = await readRegular(target, bytes.length, guard, io);
        if (!sameFile(owned, partial.stat) || !bytes.subarray(0, partial.bytes.length).equals(partial.bytes)) changed();
      }
      await guard.check(root);
      if (!sameFile(owned, await io.lstat(target, { bigint: true }))) changed();
      // The supported single-writer contract still has a last-check/unlink race.
      await io.unlink(target);
    } catch { /* Failed ownership checks or cleanup retain recovery evidence. */ }
    throw error;
  }
}
async function ensureDirectories(root, relative, guard, io, created) {
  let current = root;
  for (const part of relative.split('/').slice(0, -1)) {
    const next = path.join(current, part);
    await guard.check(current);
    try { await guard.check(next); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await guard.check(current); await io.mkdir(next); await guard.check(next); created?.add(next);
    }
    current = next;
  }
}
async function exactTree(root, files, guard, io, identities, directories = []) {
  const expectedFiles = new Set(files.map(f => f.path)), expectedDirectories = new Set(['', ...directories]);
  const expectedStats = new Map(files.map((f, i) => [f.path, identities[i]]));
  const seenFiles = new Set(), seenDirectories = new Set();
  for (const file of files) { let p = path.posix.dirname(file.path); while (p !== '.') { expectedDirectories.add(p); p = path.posix.dirname(p); } }
  let count = 0;
  async function walk(relative) {
    seenDirectories.add(relative);
    await guard.check(path.join(root, relative)); const dir = await io.opendir(path.join(root, relative));
    try {
      while (true) {
        const entry = await dir.read(); if (!entry) break;
        if (++count > LIMITS.files * 4 + TRANSACTION_LIMITS.pages + 10) changed();
        const p = relative ? `${relative}/${entry.name}` : entry.name;
        if (expectedDirectories.has(p)) { if (!entry.isDirectory() || entry.isSymbolicLink()) changed(); await walk(p); }
        else {
          if (!expectedFiles.has(p) || !entry.isFile() || entry.isSymbolicLink()) changed();
          const stat = await io.lstat(path.join(root, p), { bigint: true });
          if (!stat.isFile() || stat.isSymbolicLink() || !sameFile(expectedStats.get(p), stat)) changed();
          seenFiles.add(p);
        }
      }
    } finally { await dir.close(); }
  }
  await walk('');
  if (seenFiles.size !== expectedFiles.size || seenDirectories.size !== expectedDirectories.size) changed();
}
const copyName = i => `record-${String(i).padStart(4, '0')}.json`;
const isDelta = entry => !equal(entry.before, entry.after);
function checkInventory(entries) {
  if (!entries.length || entries.length > LIMITS.files * 2 || !entries.some(isDelta)) changed();
  let previous = '', payload = 0;
  const counts = { before: 0, after: 0 }, bytes = { before: 0, after: 0 };
  for (const entry of entries) {
    checkedRecord(entry, ['path', 'before', 'after']);
    if (typeof entry.path !== 'string' || entry.path.length > 256 || entry.path <= previous || !entry.before && !entry.after) changed();
    previous = entry.path;
    for (const side of ['before', 'after']) {
      if (entry[side] === null) continue;
      checkDescriptor(entry[side]);
      if (++counts[side] > LIMITS.files || (bytes[side] += entry[side].bytes) > LIMITS.totalBytes) changed();
      if (isDelta(entry)) payload += entry[side].bytes;
    }
  }
  if (!counts.before || !counts.after) changed();
  return payload;
}
async function createJournal(snapshot, afterFiles, io) {
  const root = snapshot.guard.root, parent = path.dirname(root), transaction = randomUUID();
  const tx = path.join(parent, `.schemka-transaction-${transaction}`);
  const entries = inventory(snapshot.files, afterFiles), payload = checkInventory(entries);
  await snapshot.guard.verify(); await io.mkdir(tx);
  try {
    const guard = await boundaries(tx, io), rootStat = await io.lstat(root, { bigint: true }), txStat = await io.lstat(tx, { bigint: true });
    const association = { name: path.basename(root), ...stamp(rootStat) }, owned = [], copies = [];
    for (const [side, files] of [['before', snapshot.files], ['after', afterFiles]]) {
      const target = path.join(tx, side), contents = new Map(files.map(f => [f.path, f.content]));
      await guard.check(tx); await io.mkdir(target); await guard.check(target);
      for (const [i, entry] of entries.entries()) if (isDelta(entry) && entry[side]) {
        await snapshot.guard.check(root);
        const copy = await ownedFile(path.join(target, copyName(i)), Buffer.from(contents.get(entry.path)), guard, io);
        owned.push(copy); (copies[i] ??= {})[side] = copy;
      }
    }
    const pages = []; let metadataBytes = 0;
    for (let start = 0; start < entries.length; start += TRANSACTION_LIMITS.entriesPerPage) {
      const bytes = json({ entries: entries.slice(start, start + TRANSACTION_LIMITS.entriesPerPage) });
      if (bytes.length > LIMITS.fileBytes || pages.length >= TRANSACTION_LIMITS.pages) changed();
      metadataBytes += bytes.length;
      owned.push(await ownedFile(path.join(tx, pageName(pages.length)), bytes, guard, io)); pages.push({ bytes: bytes.length, sha256: hash(bytes) });
    }
    for (const name of ['pending', 'displaced']) { await guard.check(tx); await io.mkdir(path.join(tx, name)); await guard.check(path.join(tx, name)); }
    const header = json({ version: 3, operation: 'delta-update', transaction, root: association, pages });
    metadataBytes += header.length;
    if (metadataBytes > TRANSACTION_LIMITS.metadataBytes || payload + metadataBytes > TRANSACTION_LIMITS.bytes) fail('DIRECTORY_LIMIT', 'Превышен бюджет транзакции модели.');
    owned.push(await ownedFile(path.join(tx, 'journal.json'), header, guard, io));
    const markerBytes = json({ version: 3, operation: 'delta-update', transaction, root: association, directory: stamp(txStat), journal: hash(header) });
    return { root, rootGuard: snapshot.guard, tx, guard, owned, copies, entries, markerBytes, version: 3,
      pending: new Map(), retained: [], retainedBytes: 0, evidenceDirectories: ['pending', 'displaced'],
      before: { files: snapshot.files }, after: { files: afterFiles } };
  } catch (error) { error.transactionPath = tx; throw error; }
}

/** Payload paths are fixed indices, never untrusted native paths. Full reconstruction validates IDs/paths before writes. */
export async function inspectDirectoryRecovery(root, io = fs) {
  const rootGuard = await boundaries(root, io), rootStat = await io.lstat(root, { bigint: true });
  const markerFile = await readRegular(path.join(root, RECOVERY_MARKER), 4096, rootGuard, io);
  const markerData = checkedRecord(decode(markerFile.bytes), ['version', 'operation', 'transaction', 'root', 'directory', 'journal']);
  if (![2, 3].includes(markerData.version) || markerData.operation !== 'delta-update') fail('DIRECTORY_RECOVERY_VERSION', 'Этот формат журнала восстановления не поддерживается. Маркер и копии сохранены.');
  if (!UUID.test(markerData.transaction) || !/^[0-9a-f]{64}$/.test(markerData.journal)) changed();
  checkedRecord(markerData.root, ['name', 'dev', 'ino']); checkStamp(markerData.directory);
  if (!equal(markerData.root, { name: path.basename(root), ...stamp(rootStat) })) changed();
  const tx = path.join(path.dirname(root), `.schemka-transaction-${markerData.transaction}`), guard = await boundaries(tx, io);
  if (!equal(markerData.directory, stamp(await io.lstat(tx, { bigint: true })))) changed();
  const journalFile = await readRegular(path.join(tx, 'journal.json'), LIMITS.fileBytes, guard, io);
  if (hash(journalFile.bytes) !== markerData.journal) changed();
  const header = checkedRecord(decode(journalFile.bytes), ['version', 'operation', 'transaction', 'root', 'pages']);
  if (header.version !== markerData.version || header.operation !== 'delta-update' || header.transaction !== markerData.transaction || !equal(header.root, markerData.root) || !Array.isArray(header.pages) || !header.pages.length || header.pages.length > TRANSACTION_LIMITS.pages) changed();
  const owned = [{ target: path.join(tx, 'journal.json'), ...journalFile }], entries = [], copies = [];
  let metadataBytes = journalFile.bytes.length;
  for (const [i, description] of header.pages.entries()) {
    checkDescriptor(description);
    const file = await readRegular(path.join(tx, pageName(i)), description.bytes, guard, io);
    if (file.bytes.length !== description.bytes || hash(file.bytes) !== description.sha256) changed();
    metadataBytes += file.bytes.length; if (metadataBytes > TRANSACTION_LIMITS.metadataBytes) changed();
    const page = checkedRecord(decode(file.bytes), ['entries']);
    if (!Array.isArray(page.entries) || !page.entries.length || page.entries.length > TRANSACTION_LIMITS.entriesPerPage || i < header.pages.length - 1 && page.entries.length !== TRANSACTION_LIMITS.entriesPerPage) changed();
    entries.push(...page.entries); owned.push({ target: path.join(tx, pageName(i)), ...file });
  }
  const payload = checkInventory(entries);
  if (payload + metadataBytes > TRANSACTION_LIMITS.bytes) changed();
  for (const side of ['before', 'after']) {
    await guard.check(path.join(tx, side));
    for (const [i, entry] of entries.entries()) if (isDelta(entry) && entry[side]) {
      const target = path.join(tx, side, copyName(i)), file = await readRegular(target, entry[side].bytes, guard, io);
      if (file.bytes.length !== entry[side].bytes || hash(file.bytes) !== entry[side].sha256) changed();
      const copy = { target, ...file }; owned.push(copy); (copies[i] ??= {})[side] = copy;
    }
  }
  const marker = { name: RECOVERY_MARKER, stat: markerFile.stat, hash: hash(markerFile.bytes) };
  const journal = { root, rootGuard, tx, guard, owned, copies, entries, marker, version: markerData.version,
    markerFile: { target: path.join(root, RECOVERY_MARKER), ...markerFile }, pending: new Map(), retained: [], retainedBytes: 0, evidenceDirectories: [] };
  await readRetained(journal, io);
  await verifyJournal(journal, io);
  const live = await observe(rootGuard, io, marker), present = liveMap(live), union = new Map(entries.map(e => [e.path, e]));
  for (const file of live.files) {
    const entry = union.get(file.path), value = descriptor(file);
    if (!entry || !equal(value, entry.before) && !equal(value, entry.after)) changed();
  }
  for (const [i, entry] of entries.entries()) if (!present.has(entry.path) && entry.before !== null && entry.after !== null &&
      !journal.retained.some(file => file.index === i)) changed();
  for (const side of ['before', 'after']) {
    const files = entries.flatMap((entry, i) => {
      if (!entry[side]) return [];
      const content = isDelta(entry) ? new TextDecoder('utf-8', { fatal: true }).decode(copies[i][side].bytes) : present.get(entry.path)?.content;
      if (content === undefined) changed();
      return [{ path: entry.path, content }];
    });
    journal[side] = { files, state: importFiles(files) };
  }
  if (journal.before.state.project.id !== journal.after.state.project.id || !equal(entries, inventory(journal.before.files, journal.after.files))) changed();
  // Recovery restores source-version bytes; importFiles has already validated and migrated only the detached state.
  const canonical = files => new Map(files.map(file => [file.path, canonicalJSON(parseJSON(file.content))]));
  const canonicalBefore = canonical(journal.before.files), canonicalAfter = canonical(journal.after.files);
  const after = new Map(journal.after.files.map(f => [f.path, f.content]));
  for (const entry of entries) {
    if (isDelta(entry) !== (canonicalBefore.get(entry.path) !== canonicalAfter.get(entry.path))) changed();
    if (isDelta(entry) && entry.after && after.get(entry.path) !== canonicalAfter.get(entry.path)) changed();
  }
  const second = await observe(rootGuard, io, marker);
  if (!sameFiles(live.files, second.files) || live.identities.some((s, i) => !sameFile(s, second.identities[i]))) changed();
  await rootGuard.verify(); await verifyJournal(journal, io);
  journal.expected = present;
  return journal;
}
async function verifyJournal(journal, io) {
  await journal.rootGuard.verify(); await journal.guard.verify();
  if (journal.markerFile) await verifyOwned(journal.markerFile, journal.rootGuard, io);
  for (const file of journal.owned) await verifyOwned(file, journal.guard, io);
  const evidence = [...journal.pending.values(), ...journal.retained];
  for (const file of evidence) await verifyEvidence(file, journal.guard, io);
  const allFiles = [...journal.owned, ...evidence];
  const files = allFiles.map(file => ({ path: path.relative(journal.tx, file.target).split(path.sep).join('/') }));
  // Include empty payload directories in the exact inventory as well.
  await exactTree(journal.tx, files, journal.guard, io, allFiles.map(f => f.stat), ['before', 'after', ...journal.evidenceDirectories]);
  await journal.guard.verify();
}
async function readRetained(journal, io) {
  for (const name of ['pending', 'displaced']) {
    const root = path.join(journal.tx, name);
    try { await journal.guard.check(root); }
    catch (error) { if (error.code === 'ENOENT' && journal.version === 2) continue; throw error; }
    journal.evidenceDirectories.push(name);
    const directory = await io.opendir(root); let count = 0;
    try {
      for (let entry; (entry = await directory.read()); ) {
        if (++count > TRANSACTION_LIMITS.retainedFiles) fail('DIRECTORY_LIMIT', 'Слишком много сохранённых файлов. Копии оставлены для проверки.');
        const match = name === 'pending' ? /^record-(\d{4,5})\.json$/.exec(entry.name)
          : /^record-(\d{4,5})-([0-9a-f-]{36})\.json$/.exec(entry.name);
        if (!match || name === 'displaced' && !UUID.test(match[2])) changed();
        const index = Number(match[1]), declared = journal.entries[index];
        if (match[1] !== String(index).padStart(4, '0') || !declared || !isDelta(declared) || !entry.isFile() || entry.isSymbolicLink()) changed();
        const file = { ...await readEvidence(path.join(root, entry.name), LIMITS.fileBytes, journal.guard, io), index };
        if (name === 'pending') {
          if (journal.pending.size) changed();
          if (!Object.values(journal.copies[index]).some(copy => file.bytes.equals(copy.bytes.subarray(0, file.bytes.length)))) changed();
          journal.pending.set(index, file);
        } else {
          if (file.stat.nlink !== 1n || (journal.retainedBytes += file.bytes.length) > TRANSACTION_LIMITS.retainedBytes) changed();
          journal.retained.push(file);
        }
      }
    } finally { await directory.close(); }
  }
}
function liveMap(snapshot) { return new Map(snapshot.files.map((file, i) => [file.path, { ...file, stat: snapshot.identities[i] }])); }
async function verifyExpected(root, relative, expected, guard, io) {
  const target = path.join(root, relative); await guard.check(path.dirname(target));
  if (!expected) {
    try { await io.lstat(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    changed();
  }
  const actual = await readRegular(target, LIMITS.fileBytes, guard, io);
  if (!sameFile(expected.stat, actual.stat) || !Buffer.from(expected.content).equals(actual.bytes)) changed();
}
async function replaceExpected(journal, index, relative, desired, expected, io, checkCopies) {
  const { root, rootGuard: guard } = journal, target = path.join(root, relative);
  await ensureDirectories(root, relative, guard, io);
  await verifyExpected(root, relative, expected, guard, io);
  if (expected && (journal.retained.length >= TRANSACTION_LIMITS.retainedFiles || journal.retainedBytes + Buffer.byteLength(expected.content) > TRANSACTION_LIMITS.retainedBytes)) {
    fail('DIRECTORY_LIMIT', 'Достигнут предел сохранённых вытесненных файлов. Копии оставлены; сохраните модель в новый каталог.');
  }
  const actual = await preservingReplace({ target, targetGuard: guard, guard: journal.guard, io,
    stagePath: path.join(journal.tx, 'pending', copyName(index)),
    archivePath: path.join(journal.tx, 'displaced', `record-${String(index).padStart(4, '0')}-${randomUUID()}.json`),
    desired: desired ? Buffer.from(desired.content) : null, expected: expected ? { stat: expected.stat, bytes: Buffer.from(expected.content) } : null,
    limit: LIMITS.fileBytes, code: 'DIRECTORY_CHANGED',
    verify: async () => { await verifyOwned(journal.markerFile, guard, io); await checkCopies(); },
    onStage: file => { if (file) journal.pending.set(index, { ...file, index }); else journal.pending.delete(index); },
    onCaptured: file => { journal.retained.push({ ...file, index }); journal.retainedBytes += file.bytes.length; },
  });
  return actual ? { ...desired, stat: actual.stat } : null;
}
async function applyJournal(journal, side, expected, io) {
  for (const name of ['pending', 'displaced']) if (!journal.evidenceDirectories.includes(name)) {
    await journal.guard.check(journal.tx); await io.mkdir(path.join(journal.tx, name));
    await journal.guard.check(path.join(journal.tx, name)); journal.evidenceDirectories.push(name);
  }
  for (const [index, file] of journal.pending) {
    const target = path.join(journal.root, journal.entries[index].path), before = expected.get(journal.entries[index].path);
    await clearPending(file, target, Object.values(journal.copies[index]).map(copy => copy.bytes), journal.guard, journal.rootGuard, io);
    if (before) {
      const current = await readRegular(target, LIMITS.fileBytes, journal.rootGuard, io);
      if (!sameContentStamp(before.stat, current.stat) || !Buffer.from(before.content).equals(current.bytes)) changed();
      before.stat = current.stat;
    }
    journal.pending.delete(index);
  }
  const desired = new Map(journal[side].files.map(f => [f.path, f]));
  for (const [i, entry] of journal.entries.entries()) {
    if (!isDelta(entry)) continue;
    const before = expected.get(entry.path), after = desired.get(entry.path);
    if (before?.content === after?.content) continue;
    const checkCopies = async () => {
      await journal.guard.check(journal.tx);
      for (const copy of Object.values(journal.copies[i])) await verifyOwned(copy, journal.guard, io);
    };
    await checkCopies();
    const written = await replaceExpected(journal, i, entry.path, after, before, io, checkCopies);
    if (written) expected.set(entry.path, written); else expected.delete(entry.path);
  }
  const files = sort([...expected.values()]);
  const snapshot = await verifiedRead(journal.rootGuard, io, journal.marker, { files, identities: files.map(f => f.stat) });
  if (!sameFiles(snapshot.files, journal[side].files) || !sameFiles(snapshot.files, files) || files.some((f, i) => !sameFile(f.stat, snapshot.identities[i]))) changed();
  await verifyJournal(journal, io); await verifyOwned(journal.markerFile, journal.rootGuard, io);
  await io.unlink(journal.markerFile.target);
  return { snapshot, warning: 'Дельта-копии и фактически вытесненные файлы оставлены рядом с каталогом; неизменённые записи в них не входят.', transaction: journal.tx };
}

export async function updateNativeDirectory(snapshot, input, io = fs, options = {}) {
  if (readProjectFiles(snapshot.files).sourceVersion < FORMAT_VERSION) fail('VERSION_SAVE_AS', `Модель обновлена до формата v${FORMAT_VERSION}. Сохраните её в новый каталог.`);
  const { bytes } = projectBytes(input), afterState = deserializeProjectFile(bytes), canonicalAfter = exportFiles(afterState);
  if (afterState.project.id !== snapshot.state.project.id) fail('DIRECTORY_PROJECT', 'Каталог принадлежит другой модели. Используйте новый каталог.');
  await snapshot.guard.verify();
  const before = await verifiedRead(snapshot.guard, io);
  if (!sameFiles(before.files, snapshot.files) || snapshot.identities.some((s, i) => !sameFile(s, before.identities[i]))) changed();
  const beforeFiles = exportFiles(before.state), canonicalBefore = new Map(beforeFiles.map(f => [f.path, f.content])), rawBefore = new Map(before.files.map(f => [f.path, f]));
  const afterFiles = canonicalAfter.map(file => canonicalBefore.get(file.path) === file.content ? rawBefore.get(file.path) : file);
  if (sameFiles(before.files, afterFiles)) return { snapshot: before };
  const desired = new Map(afterFiles.map(file => [file.path, file.content]));
  if (before.files.some((file, index) => file.content !== desired.get(file.path) && before.identities[index].nlink !== 1n)) {
    fail('FILE_LINKS', 'Изменяемая запись имеет посторонние жёсткие ссылки. Сохраните модель в новый каталог.');
  }
  const verifyBackup = await options.backup?.(snapshot.guard.root, serializeProjectFile(before.state));
  const journal = await createJournal(before, afterFiles, io);
  let markerStarted = false;
  try {
    await verifyJournal(journal, io);
    markerStarted = true;
    journal.markerFile = await installRecoveryMarker(journal, io);
    journal.marker = { name: RECOVERY_MARKER, stat: journal.markerFile.stat, hash: hash(journal.markerBytes) };
    const result = await applyJournal(journal, 'after', liveMap(before), io);
    if (typeof verifyBackup === 'function') {
      let finalized = false;
      result.finalize = async () => {
        if (finalized) return;
        finalized = true;
        try {
          await removeCompletedTransaction({ files: [...journal.owned, ...journal.retained],
            directories: ['before', 'after', ...journal.evidenceDirectories].map(name => path.join(journal.tx, name)).concat(journal.tx),
            guard: journal.guard, io, verify: async () => {
              // The envelope backup cannot preserve non-canonical native formatting.
              if (!sameFiles(before.files, beforeFiles) || journal.pending.size) changed();
              for (const file of journal.retained) {
                if (!journal.copies[file.index]?.before?.bytes.equals(file.bytes)) changed();
              }
              await verifiedRead(journal.rootGuard, io, undefined, result.snapshot);
              await verifyJournal({ ...journal, markerFile: null }, io);
              if (await verifyBackup() !== true) changed();
            } });
          delete result.warning;
          delete result.transaction;
        } catch {
          result.warning = 'Каталог сохранён. Оставшиеся служебные файлы находятся рядом с ним; безопасная очистка не подтверждена.';
        }
      };
    }
    return result;
  } catch (error) {
    if (error.code === 'FILE_CHANGED') error.code = 'DIRECTORY_CHANGED';
    error.transactionPath = journal.tx;
    error.recoveryRequired = markerStarted && await io.lstat(path.join(snapshot.guard.root, RECOVERY_MARKER)).then(() => true, e => e.code !== 'ENOENT');
    throw error;
  }
}
export async function recoverNativeDirectory(root, side, io = fs) {
  if (!['before', 'after'].includes(side)) fail('DIRECTORY_RECOVERY', 'Выберите восстановление предыдущего или нового снимка.');
  const journal = await inspectDirectoryRecovery(root, io);
  try { return await applyJournal(journal, side, journal.expected, io); }
  catch (error) { if (error.code === 'FILE_CHANGED') error.code = 'DIRECTORY_CHANGED'; error.transactionPath = journal.tx; throw error; }
}
