import path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { readProjectFile, PROJECT_FILE_LIMITS } from '../schemka-model-io/src/project-file.js';
import { readRegular, exclusiveFile } from './native-directory.mjs';
import { directoryBoundary } from './project-files.mjs';
const defaults = { recentLimit: 10, backupEnabled: true, backupLimit: 5, openViews: 'first', autoViewLimit: 5 };
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
const key = value => createHash('sha256').update(process.platform === 'win32' ? value.toLowerCase() : value).digest('hex');
const backupId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function documentSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(name => !Object.hasOwn(defaults, name))) fail('DOCUMENT_SETTINGS', 'Некорректные настройки документов.');
  const result = { ...defaults, ...value };
  for (const [name, low, high] of [['recentLimit', 0, 50], ['backupLimit', 1, 20], ['autoViewLimit', 1, 100]]) if (!Number.isInteger(result[name]) || result[name] < low || result[name] > high) fail('DOCUMENT_SETTINGS', 'Настройка количества находится вне допустимого диапазона.');
  if (typeof result.backupEnabled !== 'boolean' || !['none', 'first', 'limited'].includes(result.openViews)) fail('DOCUMENT_SETTINGS', 'Некорректные настройки документов.');
  return result;
}
/** Local application preferences and bounded previous-version snapshots, separate from model content. */
export function createDocumentPreferences(root, io = fs) {
  const indexPath = path.join(root, 'documents.json'), backupRoot = path.join(root, 'backups');
  let state = null, queue = Promise.resolve();
  async function load() {
    if (state) return;
    try {
      const guard = await directoryBoundary(root, io);
      const stat = await io.lstat(indexPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) fail('DOCUMENT_STORAGE', 'Настройки документов повреждены.');
      const parsed = JSON.parse((await readRegular(indexPath, 1024 * 1024, guard, io)).bytes.toString('utf8'));
      if (parsed.version !== 1 || !Array.isArray(parsed.recent) || !Array.isArray(parsed.backups) || parsed.recent.length > 50 || parsed.backups.length > 1000) fail('DOCUMENT_STORAGE', 'Некорректный список документов.');
      for (const item of parsed.recent) if (typeof item.path !== 'string' || !path.isAbsolute(item.path) || item.path.length > 4096 || !['file', 'directory'].includes(item.kind)) fail('DOCUMENT_STORAGE', 'Некорректная запись недавнего файла.');
      for (const item of parsed.backups) if (!backupId(item.id) || typeof item.sourcePath !== 'string' || !path.isAbsolute(item.sourcePath) || item.sourcePath.length > 4096 || !Number.isSafeInteger(item.created)) fail('DOCUMENT_STORAGE', 'Некорректная запись резервной копии.');
      state = { settings: documentSettings(parsed.settings), recent: parsed.recent, backups: parsed.backups, paletteBounds: parsed.paletteBounds || null, mainBounds: parsed.mainBounds || null };
    } catch (error) { if (error.code !== 'ENOENT') throw error; state = { settings: { ...defaults }, recent: [], backups: [], paletteBounds: null, mainBounds: null }; }
  }
  async function storageBoundary() {
    const parent = await directoryBoundary(path.dirname(root), io);
    await io.mkdir(root, { recursive: true, mode: 0o700 }); await parent.check(root);
    if ((await io.lstat(root)).isSymbolicLink()) fail('DOCUMENT_STORAGE', 'Каталог настроек не должен быть ссылкой.');
    return directoryBoundary(root, io);
  }
  async function persist() {
    await storageBoundary();
    const temporary = path.join(root, `.documents-${randomUUID()}.tmp`);
    try { await io.writeFile(temporary, JSON.stringify({ version: 1, ...state }), { flag: 'wx', mode: 0o600 }); await io.rename(temporary, indexPath); }
    finally { await io.rm(temporary, { force: true }); }
  }
  function run(action) { const task = queue.then(async () => { await load(); return action(); }); queue = task.catch(() => {}); return task; }
  const summary = () => ({ status: 'ok', settings: { ...state.settings }, recent: state.recent.map(item => ({ ...item, id: key(item.path), name: path.basename(item.path) })),
    backups: state.backups.slice().sort((a, b) => b.created - a.created).map(item => ({ ...item, name: path.basename(item.sourcePath) })) });
  return {
    status: () => run(summary),
    windowBounds: (kind = 'palette') => run(() => kind === 'main' ? state.mainBounds : state.paletteBounds),
    setWindowBounds: (bounds, kind = 'palette') => run(async () => {
      if (!['main', 'palette'].includes(kind)) fail('DOCUMENT_SETTINGS', 'Неизвестное окно.');
      if (!bounds || Object.keys(bounds).some(key => !['x', 'y', 'width', 'height'].includes(key)) || ['x', 'y', 'width', 'height'].some(key => !Number.isInteger(bounds[key]) || Math.abs(bounds[key]) > 100000) || bounds.width < 1 || bounds.height < 1) fail('DOCUMENT_SETTINGS', 'Некорректное положение палитры.');
      state[kind === 'main' ? 'mainBounds' : 'paletteBounds'] = { ...bounds }; await persist();
    }),
    set: settings => run(async () => { const previous = state; state = { ...state, settings: documentSettings(settings), recent: state.recent.slice(0, settings.recentLimit ?? defaults.recentLimit) }; try { await persist(); } catch (error) { state = previous; throw error; } return summary(); }),
    remember: (selected, kind = 'file') => run(async () => {
      const canonical = await io.realpath(selected), previous = state.recent;
      state.recent = [{ path: canonical, kind }, ...state.recent.filter(item => key(item.path) !== key(canonical))].slice(0, state.settings.recentLimit);
      try { await persist(); } catch (error) { state.recent = previous; throw error; }
    }),
    recent: id => run(() => { const item = state.recent.find(item => key(item.path) === id); if (!item) fail('DOCUMENT_RECENT', 'Этой записи уже нет в недавних файлах.'); return { ...item }; }),
    backup: (sourcePath, input) => run(async () => {
      if (!state.settings.backupEnabled) return;
      const bytes = Buffer.from(input); readProjectFile(bytes);
      if (bytes.length > PROJECT_FILE_LIMITS.bytes) fail('BACKUP_SIZE', 'Резервная копия превышает размер модели.');
      const canonical = await io.realpath(sourcePath), item = { id: randomUUID(), sourcePath: canonical, created: Date.now() };
      const guard = await storageBoundary();
      await io.mkdir(backupRoot, { recursive: true, mode: 0o700 }); await guard.check(backupRoot);
      if ((await io.lstat(backupRoot)).isSymbolicLink()) fail('BACKUP_STORAGE', 'Каталог резервных копий не должен быть ссылкой.');
      const destination = path.join(backupRoot, `${item.id}.arkita`);
      await exclusiveFile(destination, bytes, guard, io);
      const verified = (await readRegular(destination, PROJECT_FILE_LIMITS.bytes, guard, io)).bytes; if (!verified.equals(bytes)) fail('BACKUP_IO', 'Резервная копия не прошла проверку. Модель не перезаписана.');
      const prior = state.backups, kept = [item, ...prior.filter(entry => key(entry.sourcePath) === key(canonical)).slice(0, state.settings.backupLimit - 1)];
      state.backups = [...prior.filter(entry => key(entry.sourcePath) !== key(canonical)), ...kept].slice(-1000);
      try { await persist(); } catch (error) { state.backups = prior; throw error; }
      for (const old of prior.filter(entry => !state.backups.some(item => item.id === entry.id))) {
        const obsolete = path.join(backupRoot, `${old.id}.arkita`);
        try { const stat = await io.lstat(obsolete); if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1) await io.unlink(obsolete); }
        catch (error) { if (error.code !== 'ENOENT') fail('BACKUP_ROTATION', 'Копия создана, но ротация не завершена. Исходная модель не перезаписана.'); }
      }
      return item.id;
    }),
    readBackup: id => run(async () => {
      const item = state.backups.find(entry => entry.id === id); if (!item || !backupId(id)) fail('BACKUP_MISSING', 'Резервная копия отсутствует.');
      const guard = await directoryBoundary(backupRoot, io);
      const selected = path.join(backupRoot, `${id}.arkita`), opened = await readRegular(selected, PROJECT_FILE_LIMITS.bytes, guard, io);
      await guard.verify();
      if (opened.stat.nlink !== 1n) fail('BACKUP_STORAGE', 'Резервная копия повреждена.');
      readProjectFile(opened.bytes); return { ...item, bytes: Uint8Array.from(opened.bytes), name: path.basename(item.sourcePath).replace(/\.arkita$/i, '') + '-recovered.arkita' };
    }),
  };
}
