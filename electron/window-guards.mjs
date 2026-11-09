/** The existing renderer beforeunload guard is the authority for dirty/transient state. */
export function installWindowGuards(window, dialog, files) {
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    window.webContents.on(name, event => event.preventDefault());
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('close', event => { if (files.busy) event.preventDefault(); });
  window.webContents.on('will-prevent-unload', event => {
    if (files.busy) return;
    const choice = dialog.showMessageBoxSync(window, { type: 'warning',
      buttons: files.requestSaveClose ? ['Остаться', 'Сохранить и закрыть', 'Закрыть без сохранения'] : ['Остаться', 'Закрыть без сохранения'], defaultId: 0, cancelId: 0, noLink: true,
      message: 'Закрыть модель?', detail: files.hasDirectoryIssue ? 'Каталог требует проверки. Закрытие не восстановит его и не сохранит открытую модель. Существующие файлы останутся на диске. Чтобы сохранить модель отдельно, останьтесь и выберите «Сохранить как…» или новый каталог.' : 'Есть несохранённые изменения, отличие от каталога или незавершённое действие. Чтобы сохранить модель, останьтесь и откройте меню «Файл».' });
    // Here Electron's preventDefault accepts the explicit discard, unlike beforeunload.
    if (files.requestSaveClose && choice === 1) files.requestSaveClose();
    if (choice === (files.requestSaveClose ? 2 : 1)) event.preventDefault();
  });
}

/** Normal launches share Electron's application lock; this is not a filesystem lock. */
export function claimSingleInstance(app, currentWindow, openFiles = () => {}) {
  if (!app.requestSingleInstanceLock()) { app.quit(); return false; }
  app.on('second-instance', (_event, argv = [], cwd) => {
    openFiles(argv, cwd);
    const window = currentWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  return true;
}
