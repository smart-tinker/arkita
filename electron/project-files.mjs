import { FORMAT_VERSION } from '../schemka-model-core/src/index.js';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { PROJECT_FILE_LIMITS, readProjectFile, serializeProjectFile, projectFileName } from '../schemka-model-io/src/project-file.js';
import { readEvidence, sameObservation } from './preserved-write.mjs';
import { assertNoFileRecovery, writeProtectedFile } from './single-file-recovery.mjs';
export { inspectProjectFileRecovery, recoverProjectFile } from './single-file-recovery.mjs';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
// No-follow checks include all selected-path ancestors, not just the final basename.
export async function directoryBoundary(root, io) {
  if (!path.isAbsolute(root) || root.length > 4096) fail('DIRECTORY_PATH', 'Выберите локальный каталог модели.');
  root = path.resolve(root);
  const known = new Map();
  async function checkDirectory(current) {
    // Electron's Windows fs wrapper strips the trailing separator of an extended
    // drive root and lstats "C:" instead. Check the same root by its ordinary
    // spelling; keep every remaining ancestor and all no-follow/identity checks.
    const observed = process.platform === 'win32' && /^\\\\\?\\[a-z]:\\$/i.test(current) ? current.slice(4) : current;
    const stat = await io.lstat(observed, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('DIRECTORY_TYPE', 'Каталог модели и его родительские пути не могут быть ссылками.');
    if (known.has(current) && !['dev', 'ino'].every(key => known.get(current)[key] === stat[key])) fail('DIRECTORY_CHANGED', 'Родительский каталог изменился во время операции.');
    known.set(current, stat);
  }
  async function check(target) {
    const chain = [];
    for (let current = target; ; current = path.dirname(current)) {
      chain.unshift(current);
      if (current === path.dirname(current)) break;
      if (chain.length > 256) fail('DIRECTORY_PATH', 'Слишком глубокий путь к каталогу.');
    }
    for (const current of chain) await checkDirectory(current);
  }
  await check(root);
  // All ancestors are already in insertion order; recheck each once, never cache filesystem validity.
  return { root, check, async verify() { for (const current of known.keys()) await checkDirectory(current); } };
}

export function projectBytes(input) {
  if (!(input instanceof Uint8Array) || !input.byteLength || input.byteLength > PROJECT_FILE_LIMITS.bytes) {
    fail('FILE_SIZE', 'Файл должен быть непустым и не больше 18 MiB.');
  }
  const bytes = Uint8Array.from(input);
  const { state } = readProjectFile(bytes);
  return { bytes: serializeProjectFile(state), name: projectFileName(state.project.name) };
}

/** Main-only paths, obtained from the native picker. Allocation and reading are bounded. */
export async function readProject(filePath, io = fs) {
  const handle = await io.open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail('FILE_TYPE', 'Выберите обычный файл модели.');
    if (!stat.size || stat.size > PROJECT_FILE_LIMITS.bytes) fail('FILE_SIZE', 'Файл должен быть непустым и не больше 18 MiB.');
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
      fail('FILE_CHANGED', 'Файл изменился во время чтения. Выберите его заново.');
    }
    // Decode/validate in the sandboxed renderer before replacing its store.
    return { name: path.basename(filePath), bytes: Uint8Array.from(bytes.subarray(0, length)) };
  } finally { await handle.close(); }
}

async function destinationStat(filePath, io) {
  try {
    const stat = await io.lstat(filePath, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) fail('FILE_TYPE', 'Назначение должно быть обычным файлом, не ссылкой или каталогом.');
    if (stat.nlink > 1n) fail('FILE_LINKS', 'Файл назначения имеет несколько жёстких ссылок. Выберите отдельный файл.');
    return stat;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const sameDestination = (a, b) => a === b || Boolean(a && b &&
  ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]));

async function projectLocation(selected, io, knownGuard) {
  selected = path.resolve(selected);
  const selectedGuard = knownGuard || await directoryBoundary(path.dirname(selected), io);
  await selectedGuard.verify();
  const identity = await destinationStat(selected, io);
  // Preserve the real basename when a Windows picker returns an 8.3 or casing alias.
  const target = identity ? await io.realpath(selected) : path.join(await io.realpath(path.dirname(selected)), path.basename(selected));
  const actualGuard = target === selected ? selectedGuard : await directoryBoundary(path.dirname(target), io);
  await selectedGuard.verify();
  if (!sameDestination(identity, await destinationStat(selected, io)) || !sameDestination(identity, await destinationStat(target, io))) {
    fail('FILE_CHANGED', 'Имя или файл изменились во время выбора. Откройте модель заново.');
  }
  const guard = actualGuard === selectedGuard ? selectedGuard : { root: actualGuard.root,
    async check(directory) { await selectedGuard.verify(); await actualGuard.check(directory); },
    async verify() { await selectedGuard.verify(); await actualGuard.verify(); } };
  return { target, guard, identity };
}

/** Persist recovery evidence before displacing the actual target; publish without overwrite. */
export async function atomicWrite(filePath, bytes, io = fs, expected = null, options = {}) {
  const location = await projectLocation(filePath, io, expected?.guard); filePath = location.target;
  const guard = location.guard;
  await guard.verify(); await assertNoFileRecovery(filePath, io);
  const identity = await destinationStat(filePath, io);
  if (options.freshOnly && identity) fail('FILE_EXISTS', 'Восстановление создаёт новый файл. Выберите другое имя; существующий файл сохранён.');
  if (expected && (!identity || !sameDestination(identity, expected.identity))) fail('FILE_CHANGED', 'Файл изменён вне Arkita. Сохраните копию под другим именем.');
  const before = identity ? await readEvidence(filePath, PROJECT_FILE_LIMITS.bytes, guard, io) : null;
  if (before && (!sameObservation(identity, before.stat) || before.stat.nlink !== 1n)) fail('FILE_CHANGED', 'Файл изменился во время подготовки сохранения.');
  if (expected && !before.bytes.equals(Buffer.from(expected.bytes))) fail('FILE_CHANGED', 'Файл изменён вне Arkita. Сохраните копию под другим именем.');
  if (before?.bytes.equals(Buffer.from(bytes))) return;
  const verifyBackup = before ? await options.backup?.(filePath, before.bytes) : null;
  return writeProtectedFile(filePath, bytes, before, guard, io, verifyBackup);
}

/** Capture a main-owned baseline; no selected path or filesystem handle crosses IPC. */
export async function readProjectSnapshot(filePath, io = fs) {
  filePath = path.resolve(filePath);
  const selectedGuard = await directoryBoundary(path.dirname(filePath), io);
  await assertNoFileRecovery(filePath, io);
  const location = await projectLocation(filePath, io, selectedGuard); filePath = location.target;
  const guard = location.guard;
  await assertNoFileRecovery(filePath, io);
  const identity = await destinationStat(filePath, io);
  if (!identity) fail('FILE_CHANGED', 'Файл отсутствует. Откройте модель заново.');
  const opened = await readProject(filePath, io);
  await guard.verify();
  if (!sameDestination(identity, await destinationStat(filePath, io))) fail('FILE_CHANGED', 'Файл изменился во время открытия.');
  return { ...opened, snapshot: { path: filePath, bytes: opened.bytes.slice(), identity, guard } };
}

export async function writeBoundProject(snapshot, bytes, io = fs, options = {}) {
  if (readProjectFile(snapshot.bytes).sourceVersion < FORMAT_VERSION) fail('VERSION_SAVE_AS', `Модель обновлена до формата v${FORMAT_VERSION}. Сохраните её отдельным файлом через «Сохранить как».`);
  bytes = projectBytes(bytes).bytes;
  await snapshot.guard.verify();
  const result = await atomicWrite(snapshot.path, bytes, io, snapshot, options);
  try {
    const saved = await readProjectSnapshot(snapshot.path, io);
    if (!Buffer.from(saved.bytes).equals(Buffer.from(bytes))) fail('FILE_CHANGED', 'Файл изменился после записи. Откройте его заново или сохраните копию.');
    await result?.finalize?.();
    return { ...saved, warning: result?.warning };
  } catch (error) {
    if (result?.transactionPath) error.transactionPath = result.transactionPath;
    throw error;
  }
}
