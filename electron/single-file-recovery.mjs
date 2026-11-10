import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseJSON, record } from '../schemka-model-core/src/json.js';
import { PROJECT_FILE_LIMITS } from '../schemka-model-io/src/project-file.js';
import { directoryBoundary } from './project-files.mjs';
import { removeCompletedTransaction } from './completed-transaction.mjs';
import { readEvidence, exclusiveEvidence, verifyEvidence, preservingReplace, clearPending, sameObservation, sameContentStamp } from './preserved-write.mjs';

const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const json = value => Buffer.from(JSON.stringify(value) + '\n');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MARKER = /^arkita-recovery-[0-9a-f]{64}\.json$/;
export const FILE_RECOVERY_LIMITS = Object.freeze({ entries: 64, retainedBytes: 4 * PROJECT_FILE_LIMITS.bytes });
const description = bytes => ({ bytes: bytes.length, sha256: hash(bytes) });
const markerPath = file => path.join(path.dirname(file), `arkita-recovery-${hash(process.platform === 'win32' ? path.basename(file).toLowerCase() : path.basename(file))}.json`);
function changed() { fail('FILE_CHANGED', 'Файл или данные восстановления изменились. Все сохранённые копии оставлены; сохраните текущую модель отдельно.'); }
function checked(value, keys) { record(value, keys); return value; }
function parse(bytes) {
  if (bytes.length > 8192 || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) changed();
  return parseJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function checkStamp(value) {
  checked(value, ['dev', 'ino']);
  if (!/^\d{1,32}$/.test(value.dev) || !/^\d{1,32}$/.test(value.ino)) changed();
}
function checkDescription(value) {
  checked(value, ['bytes', 'sha256']);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > PROJECT_FILE_LIMITS.bytes || !/^[0-9a-f]{64}$/.test(value.sha256)) changed();
}
function missing(error) { if (error.code === 'ENOENT') return null; throw error; }
async function recoveryError(error, tx, marker, io) {
  error.transactionPath = tx; error.recoveryMarkerPath = marker;
  error.recoveryRequired = await io.lstat(marker).then(() => true, value => value.code !== 'ENOENT');
  return error;
}

/** Presence is sufficient to block a normal open/write, including a partial marker. */
export async function assertNoFileRecovery(file, io = fs) {
  const marker = MARKER.test(path.basename(file)) ? file : markerPath(file);
  if (!await io.lstat(marker).catch(missing)) return;
  throw Object.assign(Error('Найдено незавершённое сохранение файла. Выберите вариант восстановления; текущая открытая модель не изменена.'),
    { code: 'FILE_RECOVERY', recoveryMarkerPath: marker, recoveryRequired: true });
}

async function installMarker(target, bytes, guard, io) {
  let handle, owned, closed = false;
  try {
    await guard.check(path.dirname(target));
    handle = await io.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    owned = await handle.stat({ bigint: true });
    await guard.check(path.dirname(target)); await handle.writeFile(bytes); await handle.sync();
    owned = await handle.stat({ bigint: true }); await handle.close(); closed = true;
    await guard.check(path.dirname(target));
    if (!sameObservation(owned, await io.lstat(target, { bigint: true }))) changed();
    return { target, bytes, stat: owned };
  } catch (error) {
    if (handle && !closed) {
      try { owned = await handle.stat({ bigint: true }); } catch { /* Keep the last handle-owned identity. */ }
      try { await handle.close(); closed = true; } catch { /* An uncertain handle retains the marker. */ }
    }
    if (owned && closed) try {
      const current = await readEvidence(target, bytes.length, guard, io);
      if (!sameObservation(owned, current.stat) || current.stat.nlink !== 1n || !current.bytes.equals(bytes.subarray(0, current.bytes.length))) changed();
      await guard.check(path.dirname(target));
      if (!sameObservation(owned, await io.lstat(target, { bigint: true }))) changed();
      await io.unlink(target);
    } catch { /* No source mutation has started; uncertain evidence stays visible. */ }
    throw error;
  }
}

async function currentFile(journal, io) {
  const stat = await io.lstat(journal.target, { bigint: true }).catch(missing);
  if (!stat) return null;
  const current = await readEvidence(journal.target, PROJECT_FILE_LIMITS.bytes, journal.parentGuard, io);
  if (![journal.before, journal.after, ...journal.retained].filter(Boolean).some(file => file.bytes.equals(current.bytes))) changed();
  return current;
}
async function verifyJournal(journal, io) {
  await journal.parentGuard.verify(); await journal.guard.verify();
  for (const file of [journal.headerFile, journal.before, journal.after, journal.marker, journal.pending, ...journal.retained].filter(Boolean)) {
    await verifyEvidence(file, file === journal.marker ? journal.parentGuard : journal.guard, io);
  }
  for (const [root, expected] of [
    [journal.tx, ['journal.json', ...(journal.before ? ['before.bin'] : []), 'after.bin', 'pending', 'displaced']],
    [path.join(journal.tx, 'pending'), journal.pending ? ['file.bin'] : []],
    [path.join(journal.tx, 'displaced'), journal.retained.map(file => path.basename(file.target))],
  ]) {
    await journal.guard.check(root); const directory = await io.opendir(root), found = [];
    try { for (let entry; (entry = await directory.read()); ) { if (found.length > FILE_RECOVERY_LIMITS.entries + 5) changed(); found.push(entry.name); } }
    finally { await directory.close(); }
    if (!equal(found.sort(), expected.sort())) changed();
  }
}

/** Main-owned marker selection; no filename from metadata may leave its observed parent. */
export async function inspectProjectFileRecovery(selected, io = fs) {
  selected = path.resolve(selected);
  if (!MARKER.test(path.basename(selected))) fail('FILE_RECOVERY', 'Выберите файл arkita-recovery-…json рядом с моделью.');
  const parent = path.dirname(selected), parentGuard = await directoryBoundary(parent, io);
  const marker = await readEvidence(selected, 8192, parentGuard, io);
  if (marker.stat.nlink !== 1n) changed();
  const markerData = checked(parse(marker.bytes), ['version', 'operation', 'transaction', 'name', 'parent', 'directory', 'journal']);
  if (markerData.version !== 1 || markerData.operation !== 'file-update') fail('FILE_RECOVERY_VERSION', 'Этот формат восстановления файла не поддерживается. Копии сохранены.');
  if (!UUID.test(markerData.transaction) || typeof markerData.name !== 'string' || !markerData.name || markerData.name.length > 255 ||
      markerData.name !== path.basename(markerData.name) || /[\\/\0:]/.test(markerData.name) || ['.', '..'].includes(markerData.name) || !/^[0-9a-f]{64}$/.test(markerData.journal)) changed();
  checkStamp(markerData.parent); checkStamp(markerData.directory);
  const target = path.join(parent, markerData.name);
  if (selected !== markerPath(target) || !equal(markerData.parent, stamp(await io.lstat(parent, { bigint: true })))) changed();
  const tx = path.join(parent, `.schemka-transaction-${markerData.transaction}`), guard = await directoryBoundary(tx, io);
  if (!equal(markerData.directory, stamp(await io.lstat(tx, { bigint: true })))) changed();
  const headerFile = await readEvidence(path.join(tx, 'journal.json'), 8192, guard, io);
  if (headerFile.stat.nlink !== 1n || hash(headerFile.bytes) !== markerData.journal) changed();
  const header = checked(parse(headerFile.bytes), ['version', 'operation', 'transaction', 'name', 'parent', 'before', 'after']);
  for (const key of ['version', 'operation', 'transaction', 'name', 'parent']) if (!equal(header[key], markerData[key])) changed();
  const journal = { target, tx, parentGuard, guard, marker, headerFile, retained: [], retainedBytes: 0, pending: null };
  for (const side of ['before', 'after']) {
    if (header[side] === null && side === 'before') { journal.before = null; continue; }
    checkDescription(header[side]);
    const file = await readEvidence(path.join(tx, `${side}.bin`), header[side].bytes, guard, io);
    if (file.stat.nlink !== 1n || !equal(description(file.bytes), header[side])) changed();
    journal[side] = file;
  }
  await guard.check(path.join(tx, 'displaced'));
  const directory = await io.opendir(path.join(tx, 'displaced'));
  try {
    for (let entry; (entry = await directory.read()); ) {
      const match = /^file-([0-9a-f-]{36})\.bin$/.exec(entry.name);
      if (!match || !UUID.test(match[1]) || !entry.isFile() || entry.isSymbolicLink() || journal.retained.length >= FILE_RECOVERY_LIMITS.entries) changed();
      const file = await readEvidence(path.join(tx, 'displaced', entry.name), PROJECT_FILE_LIMITS.bytes, guard, io);
      if (file.stat.nlink !== 1n || (journal.retainedBytes += file.bytes.length) > FILE_RECOVERY_LIMITS.retainedBytes) changed();
      journal.retained.push(file);
    }
  } finally { await directory.close(); }
  await guard.check(path.join(tx, 'pending'));
  if (await io.lstat(path.join(tx, 'pending', 'file.bin')).catch(missing)) {
    journal.pending = await readEvidence(path.join(tx, 'pending', 'file.bin'), PROJECT_FILE_LIMITS.bytes, guard, io);
    if (![journal.before, journal.after, ...journal.retained].filter(Boolean).some(file => journal.pending.bytes.equals(file.bytes.subarray(0, journal.pending.bytes.length)))) changed();
  }
  await verifyJournal(journal, io);
  journal.current = await currentFile(journal, io);
  // A displaced third state is evidence, never an implicit overwrite baseline.
  journal.external = [...new Map(journal.retained.filter(file => ![journal.before, journal.after].filter(Boolean).some(known => known.bytes.equals(file.bytes)))
    .map(file => [hash(file.bytes), file])).values()];
  return journal;
}

async function apply(journal, desired, expected, io) {
  if (journal.pending) {
    await clearPending(journal.pending, journal.target, [journal.before, journal.after, ...journal.retained].filter(Boolean).map(file => file.bytes), journal.guard, journal.parentGuard, io);
    journal.pending = null;
    const current = await currentFile(journal, io);
    if (expected && (!current || !sameContentStamp(current.stat, expected.stat) || !current.bytes.equals(expected.bytes))) changed();
    expected = current;
  }
  let saved = expected;
  if (!expected || !expected.bytes.equals(desired)) {
    if (expected && (journal.retained.length >= FILE_RECOVERY_LIMITS.entries || journal.retainedBytes + expected.bytes.length > FILE_RECOVERY_LIMITS.retainedBytes)) {
      fail('FILE_RECOVERY_LIMIT', 'Достигнут предел восстановлений файла. Все копии оставлены; сохраните модель под новым именем.');
    }
    saved = await preservingReplace({ target: journal.target, targetGuard: journal.parentGuard, guard: journal.guard, io,
      stagePath: path.join(journal.tx, 'pending', 'file.bin'), archivePath: path.join(journal.tx, 'displaced', `file-${randomUUID()}.bin`),
      desired, expected, limit: PROJECT_FILE_LIMITS.bytes,
      verify: async () => { for (const file of [journal.headerFile, journal.before, journal.after, journal.marker].filter(Boolean)) await verifyEvidence(file, file === journal.marker ? journal.parentGuard : journal.guard, io); },
      onStage: file => { journal.pending = file; },
      onCaptured: file => { journal.retained.push(file); journal.retainedBytes += file.bytes.length; },
    });
  }
  if (saved.stat.nlink !== 1n) fail('FILE_LINKS', 'Файл имеет посторонние жёсткие ссылки. Копии восстановления сохранены.');
  await verifyJournal(journal, io);
  const actual = await currentFile(journal, io);
  if (!actual || !sameObservation(actual.stat, saved.stat) || !actual.bytes.equals(desired)) changed();
  await verifyEvidence(journal.marker, journal.parentGuard, io); await journal.parentGuard.check(path.dirname(journal.target));
  await io.unlink(journal.marker.target);
  journal.completed = actual;
  return { path: journal.target, name: path.basename(journal.target), transactionPath: journal.tx,
    warning: 'Снимки и фактически вытесненные файлы сохранены рядом с моделью в отдельном каталоге восстановления.' };
}

export async function recoverProjectFile(selected, side, io = fs) {
  const journal = await inspectProjectFileRecovery(selected, io);
  try {
    const chosen = side === 'displaced' && journal.external.length === 1 ? journal.external[0] : ['before', 'after'].includes(side) ? journal[side] : null;
    if (!chosen) fail('FILE_RECOVERY', 'Выберите доступный сохранённый снимок файла.');
    return await apply(journal, chosen.bytes, journal.current, io);
  } catch (error) { throw await recoveryError(error, journal.tx, selected, io); }
}

/** A readable sibling marker identifies an interrupted write even when the target is absent. */
export async function writeProtectedFile(target, bytes, before, parentGuard, io = fs, verifyBackup) {
  bytes = Buffer.from(bytes);
  if (MARKER.test(path.basename(target))) fail('FILE_RESERVED', 'Это имя предназначено для данных восстановления. Выберите другое имя файла.');
  if (bytes.length > PROJECT_FILE_LIMITS.bytes) fail('FILE_SIZE', 'Размер сохраняемого файла превышает 18 MiB.');
  await assertNoFileRecovery(target, io);
  const parent = path.dirname(target), transaction = randomUUID(), tx = path.join(parent, `.schemka-transaction-${transaction}`);
  await parentGuard.check(parent); await io.mkdir(tx, { mode: 0o700 });
  try {
    const guard = await directoryBoundary(tx, io), association = stamp(await io.lstat(parent, { bigint: true }));
    const journal = { target, tx, parentGuard, guard, before: null, retained: [], retainedBytes: 0, pending: null };
    if (before) journal.before = await exclusiveEvidence(path.join(tx, 'before.bin'), before.bytes, guard, io);
    journal.after = await exclusiveEvidence(path.join(tx, 'after.bin'), bytes, guard, io);
    for (const name of ['pending', 'displaced']) { await guard.check(tx); await io.mkdir(path.join(tx, name), { mode: 0o700 }); await guard.check(path.join(tx, name)); }
    const header = { version: 1, operation: 'file-update', transaction, name: path.basename(target), parent: association,
      before: before ? description(before.bytes) : null, after: description(bytes) };
    journal.headerFile = await exclusiveEvidence(path.join(tx, 'journal.json'), json(header), guard, io);
    const marker = json({ version: 1, operation: 'file-update', transaction, name: path.basename(target), parent: association,
      directory: stamp(await io.lstat(tx, { bigint: true })), journal: hash(journal.headerFile.bytes) });
    await verifyJournal(journal, io);
    journal.marker = await installMarker(markerPath(target), marker, parentGuard, io);
    const result = await apply(journal, bytes, before, io);
    if (!before || typeof verifyBackup === 'function') {
      let finalized = false;
      result.finalize = async () => {
        if (finalized) return;
        finalized = true;
        try {
          await removeCompletedTransaction({ guard, io,
            files: [journal.before, journal.after, ...journal.retained, journal.headerFile].filter(Boolean),
            directories: [path.join(tx, 'pending'), path.join(tx, 'displaced'), tx],
            verify: async () => {
              await assertNoFileRecovery(target, io);
              await verifyJournal({ ...journal, marker: null }, io);
              const current = await readEvidence(target, PROJECT_FILE_LIMITS.bytes, parentGuard, io);
              if (!sameObservation(journal.completed.stat, current.stat) || !current.bytes.equals(journal.after.bytes) || journal.pending ||
                  journal.retained.some(file => !journal.before || !file.bytes.equals(journal.before.bytes))) changed();
              if (before && await verifyBackup() !== true) changed();
            } });
          delete result.warning; delete result.transactionPath;
        } catch {
          result.warning = 'Файл сохранён. Оставшиеся служебные копии сохранены рядом с моделью в каталоге восстановления; их очистка не подтверждена.';
        }
      };
    }
    return result;
  } catch (error) { throw await recoveryError(error, tx, markerPath(target), io); }
}
