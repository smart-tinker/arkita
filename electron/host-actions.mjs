import path from 'node:path';
import { spawn as nativeSpawn } from 'node:child_process';
export function externalURL(input) {
  let url; try { url = new URL(input); } catch { throw Object.assign(Error('Некорректная внешняя ссылка.'), { code: 'EXTERNAL_URL' }); }
  if (typeof input !== 'string' || input.length > 2048 || /[\p{Cc}\p{Cf}\s]/u.test(input) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw Object.assign(Error('Разрешены только HTTP/HTTPS ссылки без учётных данных.'), { code: 'EXTERNAL_URL' });
  return url.href;
}
export function createHostActions({ dialog, shell, spawn = nativeSpawn, platform = process.platform, systemRoot = process.env.SystemRoot || 'C:\\Windows' }) {
  return {
    async openExternal(window, input, current) {
      const url = externalURL(input); current();
      const result = await dialog.showMessageBox(window, { type: 'question', title: 'Внешняя ссылка', message: 'Открыть ссылку в системном браузере?', detail: `${url}\n\nВнешняя страница не получает доступ к модели или API Arkita.`, buttons: ['Отмена', 'Открыть браузер'], defaultId: 0, cancelId: 0, noLink: true });
      current(); if (result.response !== 1) return { status: 'cancelled' };
      try { await shell.openExternal(url, { activate: true }); } catch { throw Object.assign(Error('Системный браузер не открыл ссылку. Проверьте браузер по умолчанию.'), { code: 'EXTERNAL_BROWSER' }); }
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
