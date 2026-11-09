import { buildPrintDocument } from '../schemka-model-io/src/print-layout.js';
export function createPrintService({ BrowserWindow, session }) {
  return async (owner, svg, options, pdf = false, current = () => {}) => {
    const { html, layout } = buildPrintDocument(svg, options);
    const window = new BrowserWindow({ show: false, parent: owner, width: 900, height: 1100,
      webPreferences: { session, javascript: false, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) window.webContents.on(name, event => event.preventDefault());
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      if (owner.isDestroyed()) return { status: 'cancelled' };
      current();
      if (pdf) {
        const bytes = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, scale: 1 });
        if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw Error('PDF превышает 64 MiB.');
        return { status: 'prepared', bytes, pages: layout.pages, columns: layout.columns, rows: layout.rows };
      }
      return await new Promise(resolve => window.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' }, pageSize: { width: Math.round(layout.pageWidthMm * 1000), height: Math.round(layout.pageHeightMm * 1000) }, scaleFactor: 100 }, (success, reason) => resolve(success ? { status: 'printed', pages: layout.pages, columns: layout.columns, rows: layout.rows } : /cancel/i.test(reason || '') ? { status: 'cancelled' } : { status: 'error', code: 'PRINT_FAILED', message: reason || 'Печать не выполнена.' })));
    } finally { if (!window.isDestroyed()) window.destroy(); }
  };
}
