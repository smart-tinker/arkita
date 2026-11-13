import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, clipboard, ClipboardItem, nativeImage, screen, shell } from 'electron';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { APP_URL, createAssetHandler, trustedSender, trustedLocalPermission } from './boundary.mjs';
import { projectBytes } from './project-files.mjs';
import { readStartupTeamProfile } from './team-profile.mjs';
import { createHostActions } from './host-actions.mjs';
import { createFileService, prepareFileOpen } from './file-service.mjs';
import { createGitService } from './git-service.mjs';
import { visibleWindowBounds, watchWindowBounds } from './window-bounds.mjs';
import { createPaletteService } from './palette-service.mjs';
import { createPrintService } from './print-service.mjs';
import { createClipboardService } from './clipboard-service.mjs';
import { createDocumentPreferences } from './document-preferences.mjs';
import { createDocumentRegistry, launchFiles } from './document-registry.mjs';
import { installWindowGuards, claimSingleInstance } from './window-guards.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.setName('Arkita');
app.setAppUserModelId('org.smart-tinker.arkita');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'schemka', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, documents, startupComplete = false;
const waitingFiles = [];
function reportOpen(result) { if (result?.status === 'error') dialog.showErrorBox('Arkita: модель не открыта', result.message || 'Не удалось открыть модель.'); }
async function openLaunchedFile(selected) {
  try { reportOpen(await documents.open(selected)); }
  catch (error) { reportOpen({ status: 'error', message: error.message }); }
}
function launch(argv, cwd) {
  for (const selected of launchFiles(argv, cwd)) {
    if (startupComplete) void openLaunchedFile(selected);
    else waitingFiles.push(selected);
  }
}
if (claimSingleInstance(app, () => window, launch)) {
app.on('open-file', (event, selected) => { event.preventDefault(); launch([selected]); });
// Electron emits ready only after this module has finished importing.
app.whenReady().then(async () => {
const local = session.fromPartition('persist:schemka-local');
const permissionWindow = contents => documents?.forContents(contents)?.window;
local.setPermissionRequestHandler((contents, permission, callback, details) => callback(trustedLocalPermission(contents, permission, details, permissionWindow(contents))));
local.setPermissionCheckHandler((contents, permission, _origin, details) => trustedLocalPermission(contents, permission, details, permissionWindow(contents)));
local.on('will-download', event => event.preventDefault());
local.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*'] }, (_details, callback) => callback({ cancel: true }));
local.protocol.handle('schemka', await createAssetHandler(root));
Menu.setApplicationMenu(null);
const printDocument = createPrintService({ BrowserWindow, session: local });
const hostActions = createHostActions({ dialog, shell });
const clip = createClipboardService({ clipboard, nativeImage, ClipboardItem });
const preferences = createDocumentPreferences(path.join(app.getPath('userData'), 'documents'));
const palettes = createPaletteService({ BrowserWindow, screen, session: local, root, loadBounds: preferences.windowBounds, saveBounds: preferences.setWindowBounds });
async function createDocument(initial = { kind: 'new' }) {
  let savedBounds; try { savedBounds = await preferences.windowBounds('main'); } catch { /* Defaults preserve startup if local settings cannot be read. */ }
  const bounds = visibleWindowBounds(savedBounds, screen.getAllDisplays());
  const next = new BrowserWindow({ ...bounds, minWidth: 760, minHeight: 540, title: 'Arkita',
    webPreferences: { preload: path.join(root, 'electron/preload.cjs'), session: local,
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false } });
  watchWindowBounds(next, bounds => preferences.setWindowBounds(bounds, 'main'), bounds);
  window = next;
  const record = { window: next, initial, initialDelivered: false, openBusy: false, closeRequest: null };
  record.files = createFileService({ window: next, dialog, printDocument, hostActions,
    isExternalBusy: () => Boolean(record.git?.busy) || (!record.initial && !record.openBusy && documents.externalBusy(record)),
    backup: async (source, bytes) => {
      const expected = Buffer.from(bytes), id = await preferences.backup(source, expected);
      return id ? async () => Buffer.from((await preferences.readBackup(id)).bytes).equals(expected) : undefined;
    },
    assertDestination: target => documents.assertAvailable(target, record) });
  record.git = createGitService({ window: next, storagePath: path.join(app.getPath('userData'), 'git'),
    isFileBusy: () => record.files.busy || record.openBusy || documents.externalBusy(record),
    gitPath: app.isPackaged && process.platform === 'win32' ? path.join(process.resourcesPath, 'git', 'cmd', 'git.exe') : undefined });
  documents.register(record);
  next.on('focus', () => { window = next; });
  next.once('closed', () => { clip.closed(record); palettes.closed(record); if (window === next) window = documents.records.at(-1)?.window; });
  installWindowGuards(next, dialog, {
    get busy() { return record.files.busy || record.git.busy || record.openBusy; },
    get hasDirectoryIssue() { return record.files.hasDirectoryIssue; },
    requestSaveClose() { record.closeRequest = randomUUID(); next.webContents.send('schemka:save-and-close', record.closeRequest); },
  });
  next.webContents.on('render-process-gone', (_event, details) => {
    clip.closed(record);
    dialog.showErrorBox('Arkita: редактор остановлен', `Причина: ${details.reason}. Несохранённая модель этого окна могла быть потеряна. Проверьте последний подтверждённый файл или резервную копию. Другие окна сохраняют свои модели.`);
  });
  await next.loadURL(APP_URL); return record;
}
documents = createDocumentRegistry({ create: createDocument, dialog, readFile: selected => prepareFileOpen(selected, { dialog }) });
for (const name of ['display-removed', 'display-metrics-changed']) screen.on(name, () => { for (const record of documents.records) if (!record.window.isDestroyed()) record.window.setBounds(visibleWindowBounds(record.window.getNormalBounds(), screen.getAllDisplays())); });
function handle(name, action) {
  ipcMain.handle(`schemka:${name}`, (event, ...args) => {
    const record = documents.resolve(event);
    if (!record) return { status: 'error', code: 'IPC_SENDER', message: 'Недопустимый источник запроса.' };
    return action(record, event, ...args);
  });
}
async function clipboardAction(action) { try { return await action(); } catch (error) { return { status: 'error', code: error.code || 'CLIPBOARD_IO', message: error.message }; } }
async function paletteAction(action) { try { return await action(); } catch (error) { return { status: 'error', code: error.code || 'PALETTE_IO', message: error.message }; } }
handle('palette-open', (record, _event, snapshot) => paletteAction(() => palettes.open(record, snapshot)));
handle('palette-publish', (record, _event, snapshot) => paletteAction(() => palettes.publish(record, snapshot)));
handle('palette-dock', record => paletteAction(() => palettes.dock(record)));
handle('palette-resolve-drop', (record, _event, data) => paletteAction(() => palettes.resolveDrop(record, data)));
for (const [name, method] of [['palette-ready', 'ready'], ['palette-activate', 'activate'], ['palette-child-dock', 'childDock']]) ipcMain.handle(`schemka:${name}`, (event, data) => paletteAction(() => palettes[method](event, data)));
handle('clipboard-write-fragment', (record, _event, options) => clipboardAction(() => clip.write(record, options)));
handle('clipboard-read-fragment', () => clipboardAction(() => clip.read()));
handle('clipboard-acknowledge-cut', (record, _event, id, token) => clipboardAction(() => clip.acknowledge(record, id, token)));
handle('clipboard-claim-cut', (record, _event, id, token) => clipboardAction(() => clip.claim(record, id, token)));
handle('clipboard-complete-cut', (record, _event, id, token, result) => clipboardAction(() => clip.complete(record, id, token, result)));
handle('clipboard-write-image', (record, _event, bytes, token) => clipboardAction(() => clip.image(record, bytes, token)));
handle('print-view', (record, event, svg, options, token) => record.files.printView(event, svg, options, token));
handle('save-pdf', (record, event, svg, title, options, token) => record.files.savePdf(event, svg, title, options, token));
handle('open-external-link', (record, event, url, token) => record.files.openExternalLink(event, url, token));
handle('open-file-link', (record, event, url, token) => record.files.openFileLink(event, url, token));
handle('open-credential-manager', (record, event, token) => record.files.openCredentialManager(event, token));
handle('outline-text', (record, event, runs, token) => record.files.outlineText(event, runs, token));
handle('validate-exchange-xml', (record, event, bytes, token) => record.files.validateExchangeXml(event, bytes, token));
handle('read-external-files', (record, event, kind, token) => record.files.readExternalFiles(event, kind, token));
handle('save-external-files', (record, event, kind, records, token) => record.files.saveExternalFiles(event, kind, records, token));
handle('read-team-profile', async () => { try { return await readStartupTeamProfile(); } catch (error) { return { status: 'error', code: error.code || 'TEAM_PROFILE', message: error.message }; } });
handle('document-location', (record, event, token) => record.files.documentLocation(event, token));
handle('app-info', () => ({ status: 'ok', version: app.getVersion() }));
handle('open-project', record => documents.pick(record));
handle('save-current-project', (record, event, bytes, token) => record.files.saveCurrentProject(event, bytes, token));
handle('save-project', (record, event, bytes, token) => record.files.saveProject(event, bytes, token));
handle('open-directory', record => documents.pick(record, 'directory'));
handle('save-directory', (record, event, bytes, token) => record.files.saveDirectory(event, bytes, token));
handle('save-mermaid', (record, event, text) => record.files.saveMermaid(event, text));
handle('save-svg', (record, event, text, title) => record.files.saveSvg(event, text, title));
handle('document-changed', async (record, event, previous, current, candidate) => {
  const result = record.files.documentChanged(event, previous, current, candidate);
  if (result.code !== 'IPC_SENDER') record.git.documentChanged(event, previous, current);
  if (result.status !== 'error') {
    record.initial = null;
    const location = record.files.location;
    if (location) try { await preferences.remember(location.path, location.kind || 'file'); }
    catch { result.warning = 'Модель открыта, но список недавних файлов не сохранён.'; }
  }
  return result;
});
handle('save-bound-directory', (record, event, bytes, token) => record.files.saveBoundDirectory(event, bytes, token));
handle('recover-directory', (record, event, id, side) => record.files.recoverDirectory(event, id, side));
handle('git-network-policy', (record, event, token, target) => record.git.networkPolicy(event, token, target));
handle('git-set-network-policy', (record, event, target, policy, token) => record.git.setNetworkPolicy(event, target, policy, token));
handle('git-status', (record, event, bytes, token) => record.git.status(event, bytes, token));
handle('git-connect', (record, event, options) => record.git.connect(event, options));
handle('git-open', (record, event, token) => record.git.open(event, token));
handle('git-adopt', (record, event, candidate, token) => record.git.adopt(event, candidate, token));
handle('git-commit', (record, event, bytes, token, message) => record.git.commit(event, bytes, token, message));
handle('git-push', (record, event, token) => record.git.push(event, token));
handle('git-receive', (record, event, bytes, token) => record.git.receive(event, bytes, token));
handle('git-apply', (record, event, plan, resolution, token) => record.git.apply(event, plan, resolution, token));
handle('git-inspect', (record, event, oid, bytes, token) => record.git.inspect(event, oid, bytes, token));
handle('git-restore', (record, event, id, bytes, token) => record.git.restore(event, id, bytes, token));
handle('git-create-branch', (record, event, name, token) => record.git.createBranch(event, name, token));
handle('git-prepare-branch', (record, event, name, bytes, token) => record.git.prepareBranch(event, name, bytes, token));
handle('git-switch-branch', (record, event, id, bytes, token) => record.git.switchBranch(event, id, bytes, token));
handle('git-create-milestone', (record, event, name, oid, token) => record.git.createMilestone(event, name, oid, token));
handle('git-publish-milestone', (record, event, name, oid, token) => record.git.publishMilestone(event, name, oid, token));
handle('git-delete-milestone', (record, event, name, oid, token) => record.git.deleteMilestone(event, name, oid, token));
handle('git-disconnect', (record, event) => record.git.disconnect(event));

handle('document-preferences', async () => { try { return await preferences.status(); } catch (error) { return { status: 'error', code: error.code || 'DOCUMENT_STORAGE', message: error.message }; } });
handle('set-document-preferences', async (_record, _event, settings) => { try { return await preferences.set(settings); } catch (error) { return { status: 'error', code: error.code || 'DOCUMENT_STORAGE', message: error.message }; } });
handle('open-recent', async (record, _event, id) => { try { const item = await preferences.recent(id); return await documents.open(item.path, item.kind, record); } catch (error) { return { status: 'error', code: error.code || 'FILE_IO', message: error.message }; } });
handle('recover-backup', async (record, event, id, token) => { try { const item = await preferences.readBackup(id); return await record.files.saveRecoveryCopy(event, item.bytes, item.name, item.sourcePath, token); } catch (error) { return { status: 'error', code: error.code || 'BACKUP_IO', message: error.message }; } });
handle('new-document', async (record, _event, options) => {
  if (record.files.busy || record.git.busy || record.openBusy) return { status: 'error', code: 'FILE_BUSY' };
  try {
    let initial;
    if (options !== undefined) {
      if (!options || !['template', 'import'].includes(options.source) || typeof options.name !== 'string' || options.name.length > 200 || Object.keys(options).some(key => !['bytes', 'name', 'source'].includes(key))) return { status: 'error', code: 'DOCUMENT_INITIAL' };
      const prepared = projectBytes(options.bytes); initial = { kind: 'external', bytes: prepared.bytes, name: prepared.name, source: options.source };
    }
    await createDocument(initial); return { status: 'opened-window' };
  } catch (error) { return { status: 'error', code: error.code || 'DOCUMENT_INITIAL', message: error.message }; }
});
handle('document-ready', async (record, event, token) => {
  if (record.initialDelivered || !record.initial) return { status: 'none' };
  record.initialDelivered = true;
  if (record.initial.kind === 'new') return { status: 'new' };
  if (record.initial.kind === 'external') return { status: 'external', bytes: record.initial.bytes, name: record.initial.name, source: record.initial.source };
  const result = await record.files.openPrepared(event, record.initial.prepared, token, record.initial.kind);
  if (result.status === 'error') record.initial = null;
  return result;
});
handle('open-dropped', async (record, _event, selected) => {
  if (typeof selected !== 'string' || !path.isAbsolute(selected) || path.extname(selected).toLowerCase() !== '.arkita') return { status: 'error', code: 'DOCUMENT_PATH', message: 'Перетащите один файл .arkita.' };
  if (record.files.busy || record.git.busy || record.openBusy) return { status: 'error', code: 'FILE_BUSY' };
  try { return await documents.open(selected, 'file', record); } catch (error) { return { status: 'error', code: error.code || 'FILE_IO', message: error.message }; }
});
handle('close-document', record => { record.window.close(); return { status: 'ok' }; });
handle('finish-save-close', (record, _event, request, token) => {
  if (!record.closeRequest || request !== record.closeRequest || token !== record.files.documentToken || record.files.busy || record.git.busy || record.openBusy) return { status: 'error', code: 'DOCUMENT_STALE' };
  record.closeRequest = null; record.window.close(); return { status: 'ok' };
});
handle('document-title', (record, _event, name, dirty, marker = 'circle') => {
  if (typeof name !== 'string' || name.length > 200 || typeof dirty !== 'boolean' || !['circle', 'asterisk'].includes(marker)) return { status: 'error', code: 'DOCUMENT_TITLE' };
  const location = record.files.location;
  record.window.setTitle(`${dirty ? marker === 'asterisk' ? '* ' : '● ' : ''}${name.replace(/[\x00-\x1f]/g, ' ')} — ${location?.path || 'Новая модель'} — Arkita`); return { status: 'ok' };
});
app.on('window-all-closed', () => app.quit());
waitingFiles.unshift(...launchFiles((process.argv || []).slice(app.isPackaged ? 1 : 2)));
do {
  while (waitingFiles.length) await openLaunchedFile(waitingFiles.shift());
  if (!documents.records.length) await createDocument();
} while (waitingFiles.length);
startupComplete = true;
}).catch(error => {
  console.error('Arkita: ошибка запуска', error);
  try { dialog.showErrorBox('Arkita: ошибка запуска', String(error?.message || error)); }
  catch (dialogError) { console.error('Arkita: не удалось показать ошибку запуска', dialogError); }
  finally { app.exit(1); }
});
}
