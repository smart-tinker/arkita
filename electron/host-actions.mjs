import path from 'node:path';
import * as fileSystem from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn as nativeSpawn } from 'node:child_process';
export function externalURL(input) {
  let url; try { url = new URL(input); } catch { throw Object.assign(Error('Некорректная внешняя ссылка.'), { code: 'EXTERNAL_URL' }); }
  if (typeof input !== 'string' || input.length > 2048 || /[\p{Cc}\p{Cf}\s]/u.test(input) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw Object.assign(Error('Разрешены только HTTP/HTTPS ссылки без учётных данных.'), { code: 'EXTERNAL_URL' });
  return url.href;
}
async function localFileTarget(input, io) {
  let selected;
  try {
    const url = new URL(input);
    if (typeof input !== 'string' || input.length > 2048 || /[\p{Cc}\p{Cf}\s]/u.test(input)
      || url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost') || url.pathname.startsWith('//') || url.username || url.password || url.search || url.hash) throw Error();
    selected = fileURLToPath(url);
  } catch { throw Object.assign(Error('Разрешены только локальные file:// ссылки без параметров.'), { code: 'FILE_LINK_URL' }); }
  let target;
  try { target = await io.realpath(selected); }
  catch { throw Object.assign(Error('Файл по локальной ссылке отсутствует или недоступен.'), { code: 'FILE_LINK_MISSING' }); }
  const root = path.win32.parse(target).root;
  const extendedDrive = root.startsWith('\\\\?\\') && /^[a-z]:\\$/i.test(root.slice(4));
  if (root.startsWith('\\\\') && !extendedDrive) throw Object.assign(Error('Разрешены только локальные файлы.'), { code: 'FILE_LINK_URL' });
  try {
    if (!(await io.stat(target)).isFile()) throw Error();
    return target;
  } catch { throw Object.assign(Error('Файл по локальной ссылке отсутствует или недоступен.'), { code: 'FILE_LINK_MISSING' }); }
}
export function createHostActions({ dialog, shell, spawn = nativeSpawn, platform = process.platform, systemRoot = process.env.SystemRoot || 'C:\\Windows', io = fileSystem }) {
  return {
    async openExternal(window, input, current) {
      const url = externalURL(input); current();
      const result = await dialog.showMessageBox(window, { type: 'question', title: 'Внешняя ссылка', message: 'Открыть ссылку в системном браузере?', detail: `${url}\n\nВнешняя страница не получает доступ к модели или API Arkita.`, buttons: ['Отмена', 'Открыть браузер'], defaultId: 0, cancelId: 0, noLink: true });
      current(); if (result.response !== 1) return { status: 'cancelled' };
      try { await shell.openExternal(url, { activate: true }); } catch { throw Object.assign(Error('Системный браузер не открыл ссылку. Проверьте браузер по умолчанию.'), { code: 'EXTERNAL_BROWSER' }); }
      return { status: 'opened' };
    },
    async openFileLink(window, input, current) {
      current();
      const target = await localFileTarget(input, io);
      const result = await dialog.showMessageBox(window, { type: 'question', title: 'Открыть локальный файл',
        message: `Открыть «${path.basename(target)}» в приложении Windows?`,
        detail: `${target}\n\nФайл будет передан приложению, назначенному в Windows. Доступ к модели Arkita не предоставляется.`,
        buttons: ['Отмена', 'Открыть файл'], defaultId: 0, cancelId: 0, noLink: true });
      current(); if (result.response !== 1) return { status: 'cancelled' };
      const confirmed = await localFileTarget(input, io);
      if (confirmed !== target) throw Object.assign(Error('Файл по ссылке изменился после подтверждения.'), { code: 'FILE_LINK_CHANGED' });
      current();
      const failure = await shell.openPath(confirmed);
      if (failure) throw Object.assign(Error(`Windows не открыл файл: ${failure}`), { code: 'FILE_LINK_HANDLER' });
      return { status: 'opened' };
    },
    async credentialManager() {
      if (platform !== 'win32') return { status: 'error', code: 'HOST_UNSUPPORTED', message: 'Диспетчер учётных данных доступен в Windows.' };
      return new Promise(resolve => {
        const child = spawn(path.win32.join(systemRoot, 'System32', 'control.exe'), ['/name', 'Microsoft.CredentialManager'], { shell: false, windowsHide: false, stdio: 'ignore' });
        child.once('error', () => resolve({ status: 'error', code: 'HOST_CREDENTIALS', message: 'Не удалось открыть диспетчер учётных данных Windows.' }));
        child.once('spawn', () => { child.unref(); resolve({ status: 'opened' }); });
      });
    },
  };
}
