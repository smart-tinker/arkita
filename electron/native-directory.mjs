import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FORMAT_VERSION, LIMITS, exportFiles, readProjectFiles } from '../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeNativeFiles, serializeProjectFile } from '../schemka-model-io/src/project-file.js';
import { projectBytes, directoryBoundary as boundaries } from './project-files.mjs';
export { directoryBoundary as boundaries } from './project-files.mjs';

export const INCOMPLETE_MARKER = '.schemka-incomplete.json';
export const RECOVERY_MARKER = '.schemka-recovery.json';
export const DIRECTORY_LIMITS = Object.freeze({ entries: LIMITS.files * 8, markerBytes: LIMITS.files * 256 + 4096, depth: 4 });
const markers = new Set([INCOMPLETE_MARKER, RECOVERY_MARKER]);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const modelKinds = { elements: 'el', junctions: 'jct', relationships: 'rel', 'customization-profiles': 'prf', folders: 'fld' };
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const changed = () => fail('DIRECTORY_CHANGED', 'Каталог модели изменился во время операции. Выберите его заново.');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const sameIdentity = (a, b) => ['dev', 'ino'].every(key => a[key] === b[key]);
export const sameFile = (a, b) => sameIdentity(a, b) && ['size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
const sortFiles = files => files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
export const sameFiles = (a, b) => a.length === b.length && a.every((f, i) => f.path === b[i].path && f.content === b[i].content);

export async function readRegular(target, limit, guard, io) {
  await guard.check(path.dirname(target));
  const before = await io.lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) fail('DIRECTORY_TYPE', 'Записи модели должны быть обычными файлами, не ссылками.');
  if (before.size <= 0n || before.size > BigInt(limit)) fail('DIRECTORY_LIMIT', 'Превышен допустимый размер записи модели.');
  const handle = await io.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!sameFile(before, await handle.stat({ bigint: true }))) changed();
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== Number(before.size) || !sameFile(before, await handle.stat({ bigint: true }))) changed();
    await guard.check(path.dirname(target));
    if (!sameFile(before, await io.lstat(target, { bigint: true }))) changed();
    return { bytes: bytes.subarray(0, length), stat: before };
  } finally { await handle.close(); }
}

async function checkMarkerIdentity(root, marker, guard, io) {
  await guard.check(root);
  const current = await io.lstat(path.join(root, marker.name || INCOMPLETE_MARKER), { bigint: true });
  if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || !sameFile(marker.stat, current)) changed();
}

async function checkMarker(root, marker, guard, io) {
  const current = await readRegular(path.join(root, marker.name || INCOMPLETE_MARKER), DIRECTORY_LIMITS.markerBytes, guard, io);
  if (!sameFile(marker.stat, current.stat) || hash(current.bytes) !== marker.hash) changed();
}

// Only known native namespaces are descended. Unowned entries (including .git) are never opened.
async function scan(guard, io, marker) {
  let count = 0;
  const files = [];
  async function entries(relative, visit) {
    const target = path.join(guard.root, relative);
    await guard.check(target);
    const dir = await io.opendir(target);
    try {
      while (true) {
        const entry = await dir.read();
        if (!entry) break;
        if (++count > DIRECTORY_LIMITS.entries) fail('DIRECTORY_LIMIT', 'Слишком много записей в каталоге модели.');
        await visit(entry.name);
      }
    } finally { await dir.close(); }
    await guard.check(target);
  }
  function add(relative) {
    if (relative.split('/').length > DIRECTORY_LIMITS.depth || files.length >= LIMITS.files) fail('DIRECTORY_LIMIT', 'Слишком много файлов модели.');
    files.push(relative);
  }
  function exact(name, expected) {
    if (name !== expected) fail('DIRECTORY_PATH', 'Неоднозначное имя или регистр пути модели.');
  }
  async function collection(relative, prefix) {
    await entries(relative, async name => {
      if (!name.toLowerCase().endsWith('.json') && !name.toLowerCase().startsWith(`${prefix}-`)) return;
      if (!new RegExp(`^${prefix}-${UUID}\\.json$`).test(name)) fail('DIRECTORY_PATH', 'Некорректный путь записи модели.');
      add(`${relative}/${name}`);
    });
  }
  await entries('', async name => {
    const lower = name.toLowerCase();
    if (markers.has(lower)) {
      if (!marker || name !== (marker.name || INCOMPLETE_MARKER)) {
        throw Object.assign(Error('Каталог содержит маркер незавершённой записи или восстановления. Открытие заблокировано.'),
          { code: 'DIRECTORY_INCOMPLETE', incompleteMarker: lower });
      }
      await checkMarker(guard.root, marker, guard, io);
    } else if (lower === 'schemka.json') { exact(name, lower); add(name); }
    else if (lower === 'viewpoints') {
      exact(name, lower);
      await collection(name, 'vpt');
    } else if (lower === 'assets') {
      exact(name, lower); await collection(name, 'ast');
    } else if (lower === 'model') {
      exact(name, lower);
      await entries(name, async kind => {
        const key = kind.toLowerCase();
        if (Object.hasOwn(modelKinds, key)) { exact(kind, key); await collection(`model/${kind}`, modelKinds[key]); }
      });
    } else if (lower === 'views') {
      exact(name, lower);
      await entries(name, async view => {
        if (!view.toLowerCase().startsWith('view-')) return;
        if (!new RegExp(`^view-${UUID}$`).test(view)) fail('DIRECTORY_PATH', 'Некорректный путь представления.');
        await entries(`views/${view}`, async item => {
          const key = item.toLowerCase(), relative = `views/${view}/${item}`;
          if (key === 'view.json') { exact(item, key); add(relative); }
          else if (['occurrences', 'connections', 'visual-nodes', 'visual-connectors'].includes(key)) {
            exact(item, key); await collection(relative, { occurrences: 'occ', connections: 'conn', 'visual-nodes': 'vnd', 'visual-connectors': 'vcn' }[key]);
          }
          else if (key.endsWith('.json')) fail('DIRECTORY_PATH', 'Неизвестная запись представления.');
        });
      });
    }
  });
  if (marker) await checkMarker(guard.root, marker, guard, io);
  return files.sort();
}

export async function observe(guard, io, marker) {
  const paths = await scan(guard, io, marker);
  const files = [], identities = [];
  let total = 0;
  for (const relative of paths) {
    const file = await readRegular(path.join(guard.root, relative), Math.min(LIMITS.fileBytes, LIMITS.totalBytes - total), guard, io);
    total += file.bytes.length;
    if (file.bytes[0] === 0xef && file.bytes[1] === 0xbb && file.bytes[2] === 0xbf) fail('DIRECTORY_ENCODING', 'BOM в записи модели не поддерживается.');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); }
    catch { fail('DIRECTORY_ENCODING', 'Запись модели должна быть корректным UTF-8.'); }
    files.push({ path: relative, content }); identities.push(file.stat);
  }
  return { files, identities };
}

export async function verifiedRead(guard, io, marker, expected) {
  const first = await observe(guard, io, marker);
  if (expected && (!sameFiles(expected.files, first.files) || expected.identities.some((stat, i) => !sameFile(stat, first.identities[i])))) changed();
  const { state, sourceVersion } = readProjectFiles(first.files);
  const second = await observe(guard, io, marker);
  if (!sameFiles(first.files, second.files) || first.identities.some((stat, i) => !sameFile(stat, second.identities[i]))) changed();
  const finalPaths = await scan(guard, io, marker);
  if (finalPaths.length !== first.files.length || finalPaths.some((p, i) => p !== first.files[i].path)) changed();
  await guard.verify();
  return { state, sourceVersion, files: first.files, identities: first.identities, guard };
}

export async function captureNativeDirectory(root, io = fs) {
  return verifiedRead(await boundaries(root, io), io);
}
export async function readNativeDirectory(root, io = fs) {
  const snapshot = await captureNativeDirectory(root, io);
  return { name: path.basename(snapshot.guard.root), bytes: snapshot.sourceVersion < FORMAT_VERSION ? serializeNativeFiles(snapshot.files) : serializeProjectFile(snapshot.state), snapshot };
}

export async function exclusiveFile(target, bytes, guard, io) {
  await guard.check(path.dirname(target));
  const handle = await io.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let stat;
  try {
    await guard.check(path.dirname(target));
    await handle.writeFile(bytes);
    await handle.sync();
    stat = await handle.stat({ bigint: true });
  } finally { await handle.close(); }
  await guard.check(path.dirname(target));
  if (!sameFile(stat, await io.lstat(target, { bigint: true }))) changed();
  return stat;
}

/** Fresh-only Save As. Never rename over a destination, overwrite a record, or remove a failed child. */
export async function createNativeDirectory(parent, input, io = fs) {
  const { bytes } = projectBytes(input);
  const files = exportFiles(deserializeProjectFile(bytes));
  const intended = files.map(file => ({ path: file.path, bytes: Buffer.byteLength(file.content), sha256: hash(file.content) }));
  const manifest = Buffer.from(JSON.stringify({ version: 1, operation: 'fresh-save', files: intended }) + '\n');
  if (manifest.length > DIRECTORY_LIMITS.markerBytes) fail('DIRECTORY_LIMIT', 'Слишком большой манифест модели.');
  const guard = await boundaries(parent, io);
  if (guard.root.split(path.sep).some(part => part.toLowerCase() === '.git' || part.toLowerCase().startsWith('.schemka-transaction-'))) fail('DIRECTORY_RESERVED', 'Выберите родителя вне служебных каталогов.');
  let ancestryEntries = 0;
  for (let current = guard.root; ; current = path.dirname(current)) {
    await guard.check(current);
    const directory = await io.opendir(current);
    try {
      while (true) {
        const entry = await directory.read(); if (!entry) break;
        if (++ancestryEntries > DIRECTORY_LIMITS.entries) fail('DIRECTORY_LIMIT', 'Слишком много записей в родительских каталогах.');
        if (markers.has(entry.name.toLowerCase())) fail('DIRECTORY_INCOMPLETE', 'Родитель находится внутри незавершённого каталога. Выберите другое место.');
      }
    } finally { await directory.close(); }
    await guard.check(current);
    if (current === path.dirname(current)) break;
  }
  let root;
  try {
    await guard.check(guard.root);
    root = await io.mkdtemp(path.join(guard.root, 'schemka-'));
    await guard.check(root);
    guard.root = root;
    const markerPath = path.join(root, INCOMPLETE_MARKER);
    const marker = { stat: await exclusiveFile(markerPath, manifest, guard, io), hash: hash(manifest) };
    const created = new Set([root]);
    for (const file of files) {
      let directory = root;
      for (const part of file.path.split('/').slice(0, -1)) {
        const next = path.join(directory, part);
        if (!created.has(next)) {
          await guard.check(directory); await checkMarkerIdentity(root, marker, guard, io);
          await io.mkdir(next); await guard.check(next); created.add(next);
        }
        directory = next;
      }
      // Full manifest bytes are verified at scan/final boundaries; nanosecond stamps guard each exclusive write.
      await checkMarkerIdentity(root, marker, guard, io);
      await exclusiveFile(path.join(root, file.path), Buffer.from(file.content), guard, io);
    }
    const result = await verifiedRead(guard, io, marker);
    if (!sameFiles(files, sortFiles(exportFiles(result.state))) || !sameFiles(files, result.files) ||
        intended.some((item, i) => item.sha256 !== hash(result.files[i].content))) changed();
    await guard.verify(); await checkMarker(root, marker, guard, io);
    await io.unlink(markerPath);
    return { name: path.basename(root), snapshot: result };
  } catch (error) {
    if (root) error.incompletePath = root;
    throw error;
  }
}
