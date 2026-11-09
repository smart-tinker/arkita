import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
export const sameIdentity = (a, b) => Boolean(a && b && ['dev', 'ino'].every(key => a[key] === b[key]));
export const sameContentStamp = (a, b) => sameIdentity(a, b) && ['size', 'mtimeNs'].every(key => a[key] === b[key]);
export const sameObservation = (a, b) => sameContentStamp(a, b) && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink;
const probeName = (stage, target) => path.join(path.dirname(target), `.schemka-link-${createHash('sha256').update(stage).digest('hex')}`);

/** Bounded raw evidence; empty or malformed external bytes are never parsed as a model. */
export async function readEvidence(target, limit, guard, io) {
  await guard.check(path.dirname(target));
  const stat = await io.lstat(target, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink()) fail('FILE_TYPE', 'Сохранённые данные должны быть обычным файлом.');
  if (stat.size < 0n || stat.size > BigInt(limit)) fail('FILE_SIZE', 'Сохранённые данные превышают допустимый размер. Они оставлены для проверки.');
  const handle = await io.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!sameObservation(stat, await handle.stat({ bigint: true }))) fail('FILE_CHANGED', 'Сохранённые данные изменились во время чтения.');
    const bytes = Buffer.alloc(Number(stat.size) + 1); let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== Number(stat.size) || !sameObservation(stat, await handle.stat({ bigint: true }))) fail('FILE_CHANGED', 'Сохранённые данные изменились во время чтения.');
    await guard.check(path.dirname(target));
    if (!sameObservation(stat, await io.lstat(target, { bigint: true }))) fail('FILE_CHANGED', 'Сохранённые данные изменились во время чтения.');
    return { target, bytes: bytes.subarray(0, length), stat };
  } finally { await handle.close(); }
}

export async function exclusiveEvidence(target, bytes, guard, io) {
  await guard.check(path.dirname(target));
  const handle = await io.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let stat;
  try {
    await guard.check(path.dirname(target));
    await handle.writeFile(bytes); await handle.sync(); stat = await handle.stat({ bigint: true });
  } finally { await handle.close(); }
  await guard.check(path.dirname(target));
  if (!sameObservation(stat, await io.lstat(target, { bigint: true }))) fail('FILE_CHANGED', 'Созданная копия изменилась. Она оставлена для проверки.');
  return { target, bytes: Buffer.from(bytes), stat };
}

export async function verifyEvidence(file, guard, io) {
  const current = await readEvidence(file.target, file.bytes.length, guard, io);
  if (!sameObservation(file.stat, current.stat) || !file.bytes.equals(current.bytes)) fail('FILE_CHANGED', 'Сохранённая копия изменилась. Она оставлена для проверки.');
}

async function absent(target, guard, io, code) {
  await guard.check(path.dirname(target));
  try { await io.lstat(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail(code, 'Назначение изменилось. Появившийся файл не перезаписан.');
}

/** Probe the destination filesystem before moving a live source. No overwrite fallback. */
async function probeLink(stage, targetGuard, guard, target, io) {
  const probe = probeName(stage.target, target);
  let linked = false;
  try {
    await targetGuard.check(path.dirname(target)); await verifyEvidence(stage, guard, io);
    await io.link(stage.target, probe); linked = true;
    const left = await io.lstat(stage.target, { bigint: true }), right = await io.lstat(probe, { bigint: true });
    if (!sameContentStamp(stage.stat, left) || !sameObservation(left, right) || left.nlink !== 2n) fail('FILE_CHANGED', 'Проверочная ссылка изменилась.');
    await targetGuard.check(path.dirname(target));
    await io.unlink(probe); linked = false;
    stage.stat = await io.lstat(stage.target, { bigint: true });
    if (stage.stat.nlink !== 1n || !sameContentStamp(left, stage.stat)) fail('FILE_CHANGED', 'Временная копия изменилась после проверки файловой системы.');
    await verifyEvidence(stage, guard, io);
  } catch (error) {
    if (linked) try {
      await targetGuard.check(path.dirname(target));
      const current = await io.lstat(probe, { bigint: true });
      if (sameContentStamp(stage.stat, current)) await io.unlink(probe);
    } catch { /* Keep an uncertain path; never unlink a replacement. */ }
    if (['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV', 'ENOSYS'].includes(error.code)) {
      fail('FILE_ATOMIC_UNSUPPORTED', 'Файловая система не поддерживает безопасное сохранение через жёсткую ссылку. Перемещение исходного файла не начато; выберите другой локальный диск.');
    }
    throw error;
  }
}

/**
 * Move the actual destination to retained evidence, then publish exclusively.
 * The private journal and its ancestors require the existing single-writer boundary.
 */
export async function preservingReplace({ target, stagePath, archivePath, desired, expected,
  targetGuard, guard, io, verify = async () => {}, onStage = () => {}, onCaptured = () => {}, limit, code = 'FILE_CHANGED' }) {
  let stage, published = false;
  const checkExpected = async () => {
    if (!expected) return absent(target, targetGuard, io, code);
    const current = await readEvidence(target, limit, targetGuard, io);
    if (current.stat.nlink !== 1n || !sameObservation(expected.stat, current.stat) || !current.bytes.equals(expected.bytes)) {
      fail(code, 'Исходный файл изменился. Внешние данные не приняты как основание перезаписи.');
    }
  };
  try {
    await checkExpected();
    // A deletion also probes support so its recovery can publish a complete file.
    stage = await exclusiveEvidence(stagePath, desired ?? expected.bytes, guard, io);
    onStage(stage);
    await probeLink(stage, targetGuard, guard, target, io);
    await verify(); await verifyEvidence(stage, guard, io); await checkExpected();
    if (expected) {
      await absent(archivePath, guard, io, code);
      await targetGuard.check(path.dirname(target));
      await io.rename(target, archivePath);
      const captured = await readEvidence(archivePath, limit, guard, io);
      onCaptured(captured);
      if (captured.stat.nlink !== 1n || !sameContentStamp(expected.stat, captured.stat) || !captured.bytes.equals(expected.bytes)) {
        fail(code, 'Во время сохранения появился внешний файл. Его фактические байты сохранены в каталоге восстановления.');
      }
      await verify();
    }
    await absent(target, targetGuard, io, code);
    if (desired !== null) {
      await verifyEvidence(stage, guard, io); await targetGuard.check(path.dirname(target));
      try { await io.link(stagePath, target); }
      catch (error) { if (error.code === 'EEXIST') fail(code, 'Во время сохранения появился внешний файл. Он не перезаписан.'); throw error; }
      published = true;
    }
    await guard.check(path.dirname(stagePath));
    const current = await io.lstat(stagePath, { bigint: true });
    if (!sameContentStamp(stage.stat, current) || current.nlink !== (published ? 2n : 1n)) fail(code, 'Временная копия изменилась. Данные восстановления сохранены.');
    if (published) {
      const destination = await readEvidence(target, limit, targetGuard, io);
      if (!sameObservation(current, destination.stat) || !destination.bytes.equals(desired)) fail(code, 'Файл изменился после публикации. Данные восстановления сохранены.');
    }
    await io.unlink(stagePath); stage = null; onStage(null);
    if (desired === null) { await absent(target, targetGuard, io, code); return null; }
    const saved = await readEvidence(target, limit, targetGuard, io);
    if (saved.stat.nlink !== 1n || !saved.bytes.equals(desired)) fail(code, 'Файл изменился после записи. Данные восстановления сохранены.');
    return saved;
  } catch (error) {
    // A partial or linked pending file belongs to the persistent recovery protocol.
    // Never remove a displaced original, even if its bytes initially matched.
    throw error;
  }
}

/** Remove only a validated pending publication; displaced originals are never pruned. */
export async function clearPending(file, target, choices, guard, targetGuard, io) {
  const current = await readEvidence(file.target, Math.max(...choices.map(bytes => bytes.length)), guard, io);
  if (!sameObservation(file.stat, current.stat) || !file.bytes.equals(current.bytes) ||
      !choices.some(bytes => current.bytes.length <= bytes.length && current.bytes.equals(bytes.subarray(0, current.bytes.length)))) {
    fail('FILE_CHANGED', 'Незавершённая копия изменена. Автоматическое восстановление остановлено.');
  }
  if (current.stat.nlink !== 1n) {
    await targetGuard.check(path.dirname(target));
    const live = await io.lstat(target, { bigint: true }).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (current.stat.nlink !== 2n) fail('FILE_LINKS', 'Незавершённая копия имеет посторонние жёсткие ссылки.');
    if (!live || !sameObservation(current.stat, live)) {
      const probe = probeName(file.target, target), observed = await io.lstat(probe, { bigint: true });
      if (!sameObservation(current.stat, observed)) fail('FILE_LINKS', 'Незавершённая копия имеет посторонние жёсткие ссылки.');
      await targetGuard.check(path.dirname(target)); await io.unlink(probe);
      current.stat = await io.lstat(file.target, { bigint: true });
      if (current.stat.nlink !== 1n || !sameContentStamp(file.stat, current.stat)) fail('FILE_CHANGED', 'Проверочная копия изменилась при очистке.');
    }
  }
  await guard.check(path.dirname(file.target));
  if (!sameObservation(current.stat, await io.lstat(file.target, { bigint: true }))) fail('FILE_CHANGED', 'Незавершённая копия изменилась перед очисткой.');
  await io.unlink(file.target);
}
