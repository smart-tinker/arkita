import path from 'node:path';
import * as fs from 'node:fs/promises';
import { readProjectSnapshot } from './project-files.mjs';
import { readNativeDirectory } from './native-directory.mjs';
import { readProjectFile } from '../schemka-model-io/src/project-file.js';
import { trustedSender } from './boundary.mjs';

const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
const comparable = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
export function launchFiles(argv = [], cwd = process.cwd()) {
  return argv.filter(value => typeof value === 'string' && value.length <= 4096 && !value.startsWith('-') && !/[\x00-\x1f]/.test(value) && path.extname(value).toLowerCase() === '.arkita')
    .map(value => path.resolve(cwd, value));
}
export async function documentIdentity(selected, io = fs) {
  if (typeof selected !== 'string' || !path.isAbsolute(selected) || selected.length > 4096 || /[\x00-\x1f]/.test(selected)) fail('DOCUMENT_PATH', 'Некорректный путь модели.');
  const canonical = await io.realpath(selected), stat = await io.stat(canonical, { bigint: true });
  return { path: canonical, identity: { dev: stat.dev, ino: stat.ino } };
}
const same = (left, right) => left && right && (comparable(left.path) === comparable(right.path) ||
  left.identity && right.identity && left.identity.dev === right.identity.dev && left.identity.ino === right.identity.ino);

/** One BrowserWindow owns one store/session and native services. Paths never arrive from renderer strings. */
export function createDocumentRegistry({ create, dialog, identify = documentIdentity, readFile = readProjectSnapshot, readDirectory = readNativeDirectory }) {
  const documents = new Set();
  let opening = false, queue = Promise.resolve();
  function focus(record) {
    if (!record || record.window.isDestroyed()) return;
    if (record.window.isMinimized()) record.window.restore(); record.window.show(); record.window.focus();
  }
  function location(record) { return record.files.location || record.initial?.location || null; }
  function owner(identity, except) { return [...documents].find(record => record !== except && !record.window.isDestroyed() && same(location(record), identity)); }
  function externalBusy(record) { return opening && !record?.initial || [...documents].some(item => item !== record && (item.files.busy || item.git?.busy || item.openBusy)); }
  async function selected(selectedPath, kind = 'file', requester = [...documents].at(-1)) {
    const identity = await identify(selectedPath), existing = owner(identity);
    if (existing) { focus(existing); return { status: 'focused', name: path.basename(identity.path) }; }
    const event = requester && { sender: requester.window.webContents, senderFrame: requester.window.webContents.mainFrame };
    const result = kind === 'directory' ? requester?.files.prepareDirectory ? await requester.files.prepareDirectory(event, selectedPath) : await readDirectory(selectedPath) : requester?.files.prepareFile
      ? await requester.files.prepareFile({ sender: requester.window.webContents, senderFrame: requester.window.webContents.mainFrame }, selectedPath) : await readFile(selectedPath);
    if (result.status && result.status !== 'opened') return result;
    const prepared = result.prepared || result;
    readProjectFile(prepared.bytes);
    const record = await create({ kind, prepared, location: identity });
    focus(record); return { status: 'opened-window', name: prepared.name };
  }
  async function waitIdle() {
    while ([...documents].some(record => record.files.busy || record.git?.busy || record.openBusy)) await new Promise(resolve => setTimeout(resolve, 25));
  }
  function enqueue(selectedPath, kind = 'file', requester = [...documents].at(-1)) {
    const task = queue.then(async () => { await waitIdle(); if (requester?.window.isDestroyed()) return { status: 'cancelled' }; if (requester) requester.openBusy = true; opening = true; try { return await selected(selectedPath, kind, requester); } finally { opening = false; if (requester) requester.openBusy = false; } });
    queue = task.catch(() => {}); return task;
  }
  return {
    get records() { return [...documents]; },
    get busy() { return opening; }, externalBusy, focus,
    register(record) { documents.add(record); record.window.once('closed', () => documents.delete(record)); return record; },
    forContents(contents) { return [...documents].find(record => record.window.webContents === contents && !record.window.isDestroyed()); },
    resolve(event) { return [...documents].find(record => trustedSender(event, record.window)); },
    async assertAvailable(selectedPath, except) {
      let identity; try { identity = await identify(selectedPath); } catch (error) { if (error.code !== 'ENOENT') throw error; identity = { path: path.resolve(selectedPath) }; }
      const containing = [...documents].find(record => {
        if (record === except || record.window.isDestroyed()) return false;
        const current = location(record), directory = record.files.location?.kind === 'directory' || record.initial?.kind === 'directory';
        const relative = current && path.relative(comparable(current.path), comparable(identity.path));
        return directory && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      });
      if (owner(identity, except) || containing) fail('DOCUMENT_OPEN', 'Этот файл или каталог открыт в другом окне Arkita. Переключитесь в его окно либо выберите другое имя.');
    },
    async pick(record, kind = 'file') {
      if (record.files.busy || record.git.busy || record.openBusy || externalBusy(record)) return { status: 'error', code: 'FILE_BUSY', message: 'Дождитесь текущей файловой операции или операции Git.' };
      record.openBusy = true;
      try {
        const result = await dialog.showOpenDialog(record.window, { title: kind === 'directory' ? 'Открыть каталог модели в новом окне' : 'Открыть модель в новом окне',
          filters: [{ name: 'Модели Arkita', extensions: ['arkita', 'json'] }], properties: [kind === 'directory' ? 'openDirectory' : 'openFile', 'dontAddToRecent'] });
        if (result.canceled || !result.filePaths?.length) return { status: 'cancelled' };
        if (result.filePaths.length !== 1) fail('DOCUMENT_PATH', 'Выберите ровно одну модель.');
        if (record.window.isDestroyed()) return { status: 'cancelled' };
        opening = true; try { return await selected(result.filePaths[0], kind, record); } finally { opening = false; }
      } catch (error) { return { status: 'error', code: error.code || 'FILE_IO', message: error.message }; }
      finally { record.openBusy = false; }
    },
    open: enqueue,
  };
}
