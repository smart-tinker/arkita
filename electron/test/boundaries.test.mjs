import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { APP_URL, createAssetHandler, trustedSender, trustedLocalPermission } from '../boundary.mjs';
import { createFileService } from '../file-service.mjs';
import { installWindowGuards, claimSingleInstance } from '../window-guards.mjs';
import { createBlankModel } from '../../schemka-model-ui/src/demo.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
function windowFixture() {
  const window = new EventEmitter(); window.isDestroyed = () => false;
  window.webContents = new EventEmitter(); window.webContents.mainFrame = { url: APP_URL };
  return { window, event: { sender: window.webContents, senderFrame: window.webContents.mainFrame } };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('bundled custom protocol exposes only exact local assets with restrictive CSP', async () => {
  const handle = await createAssetHandler(root);
  for (const asset of ['schemka-model-ui/index.html', 'schemka-model-ui/src/app.js', 'schemka-model-ui/src/model-analysis-worker.js', 'schemka-model-core/src/index.js']) {
    const response = handle({ url: `schemka://app/${asset}`, method: 'GET' }); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/); assert.match(response.headers.get('content-security-policy'), /frame-src 'none'/);
    assert.equal(response.headers.get('content-security-policy').split(';').find(rule => rule.trim().startsWith('worker-src')).trim(), 'worker-src schemka://app/schemka-model-ui/src/model-analysis-worker.js schemka://app/schemka-model-ui/src/model-search-worker.js schemka://app/schemka-model-core/src/');
  }
  for (const url of ['file:///etc/passwd', 'https://app/schemka-model-ui/index.html', 'schemka://evil/schemka-model-ui/index.html',
    'schemka://app/package.json', 'schemka://app/electron/preload.cjs', 'schemka://app/schemka-model-ui/src/../../package.json',
    'schemka://app/%2e%2e/package.json', `${APP_URL}?query`, `${APP_URL}#hash`, 'schemka://user@app/schemka-model-ui/index.html']) {
    assert.equal(handle({ url, method: 'GET' }).status, 403, url);
  }
  assert.equal(handle({ url: APP_URL, method: 'POST' }).status, 403);
});
test('IPC requires exact live top-level WebContents and frame, even for same-origin subframes', () => {
  const { window, event } = windowFixture(); assert.equal(trustedSender(event, window), true);
  for (const invalid of [{ ...event, sender: {} }, { ...event, senderFrame: { url: APP_URL } }, { ...event, senderFrame: null }]) assert.equal(trustedSender(invalid, window), false);
  window.webContents.mainFrame.url = 'schemka://app/other.html'; assert.equal(trustedSender(event, window), false);
});
for (const allowed of ['clipboard-sanitized-write', 'fullscreen']) test(`${allowed} permission is bound to the live bundled main document`, () => {
  const { window } = windowFixture(), contents = window.webContents, details = { isMainFrame: true, requestingUrl: APP_URL };
  assert.equal(trustedLocalPermission(contents, allowed, details, window), true);
  for (const permission of ['clipboard-read', 'deprecated-sync-clipboard-read', 'fileSystem', 'media', 'notifications', 'automatic-fullscreen', 'openExternal', 'unknown', undefined]) {
    assert.equal(trustedLocalPermission(contents, permission, details, window), false, permission);
  }
  for (const invalid of [null, {}, { ...details, isMainFrame: false }, { ...details, requestingUrl: `${APP_URL}#other` }, { ...details, requestingUrl: 'https://example.com/' }]) {
    assert.equal(trustedLocalPermission(contents, allowed, invalid, window), false);
  }
  for (const source of [null, {}, { mainFrame: { url: APP_URL } }]) assert.equal(trustedLocalPermission(source, allowed, details, window), false);
  assert.equal(trustedLocalPermission(contents, allowed, details, undefined), false);
  contents.mainFrame.url = 'schemka://app/other.html'; assert.equal(trustedLocalPermission(contents, allowed, details, window), false);
  contents.mainFrame.url = APP_URL; window.isDestroyed = () => true; assert.equal(trustedLocalPermission(contents, allowed, details, window), false);
});
test('native file service uses only dialog-selected paths, awaits writes, rejects overlap and invalid bytes', async () => {
  const { window, event } = windowFixture(), write = deferred(); let saved, openCalls = 0, saveCalls = 0;
  const service = createFileService({ window, dialog: {
    showOpenDialog: async () => { openCalls++; return { canceled: true, filePaths: [] }; },
    showSaveDialog: async (_window, options) => { saveCalls++; assert.equal(options.defaultPath.includes('/'), false); return { canceled: false, filePath: '/chosen/model.schemka.json' }; },
  }, write: async (target, bytes) => { saved = { target, bytes }; await write.promise; } });
  assert.equal((await service.open({ ...event, sender: {} })).code, 'IPC_SENDER'); assert.equal(openCalls, 0);
  assert.equal((await service.open(event)).status, 'cancelled');
  assert.equal((await service.saveProject(event, new Uint8Array([42]))).status, 'error'); assert.equal(saveCalls, 0);
  const saving = service.saveProject(event, serializeProjectFile(createBlankModel().snapshot));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(service.busy, true); assert.equal((await service.open(event)).code, 'FILE_BUSY');
  assert.equal(saved.target, '/chosen/model.schemka.json'); write.resolve();
  assert.deepEqual(await saving, { status: 'saved', name: 'model.schemka.json' }); assert.equal(service.busy, false);
});
test('native service reports cancellation, failed read/write and recovery without claiming saved', async () => {
  const { window, event } = windowFixture(); let cancel = true;
  const service = createFileService({ window, dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: ['/chosen/open'] }),
    showSaveDialog: async () => ({ canceled: cancel, filePath: '/chosen/save' }),
  }, read: async () => { throw Object.assign(Error('read failed'), { code: 'EIO' }); }, write: async () => { throw Object.assign(Error('disk full'), { code: 'ENOSPC' }); } });
  assert.equal((await service.open(event)).code, 'EIO');
  const bytes = serializeProjectFile(createBlankModel().snapshot);
  assert.equal((await service.saveProject(event, bytes)).status, 'cancelled'); cancel = false;
  assert.deepEqual(await service.saveProject(event, bytes), { status: 'error', code: 'ENOSPC', message: 'disk full' }); assert.equal(service.busy, false);
});
test('preload exposes only fixed promise methods and never the IPC event or raw APIs', async () => {
  let exposed; const calls = [];
  vm.runInNewContext(await fs.readFile(new URL('../preload.cjs', import.meta.url), 'utf8'), { require: name => {
    assert.equal(name, 'electron'); return { contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'schemkaDesktop'); exposed = value; } },
      ipcRenderer: { invoke: async (...args) => { calls.push(args); return { status: 'cancelled' }; } } };
  } });
  assert.deepEqual(Object.keys(exposed), ['paletteOpen', 'palettePublish', 'paletteDock', 'paletteResolveDrop', 'onPaletteCommand', 'onPaletteDocked', 'clipboardWriteFragment', 'clipboardReadFragment', 'clipboardAcknowledgeCut', 'clipboardClaimCut', 'clipboardCompleteCut', 'clipboardWriteImage', 'onClipboardCutDelivered', 'printView', 'savePdf', 'openExternalLink', 'openCredentialManager', 'outlineText', 'validateExchangeXml', 'readExternalFiles', 'saveExternalFiles', 'documentPreferences', 'setDocumentPreferences', 'openRecent', 'recoverBackup', 'newDocument', 'documentReady', 'openDroppedFile', 'closeDocument', 'finishSaveClose', 'setDocumentTitle', 'onSaveAndClose', 'readTeamProfile', 'documentLocation', 'getAppInfo', 'openProject', 'saveProject', 'saveCurrentProject', 'openDirectory', 'saveDirectory', 'documentChanged', 'saveBoundDirectory', 'recoverDirectory', 'saveMermaid', 'saveSvg',
    'gitNetworkPolicy', 'gitSetNetworkPolicy', 'gitStatus', 'gitConnect', 'gitOpen', 'gitAdopt', 'gitCommit', 'gitPush', 'gitReceive', 'gitApply', 'gitInspect', 'gitRestore', 'gitCreateBranch', 'gitPrepareBranch', 'gitSwitchBranch', 'gitCreateMilestone', 'gitPublishMilestone', 'gitDeleteMilestone', 'gitDisconnect']); assert.equal(Object.isFrozen(exposed), true);
  await exposed.clipboardClaimCut('cut-id', 'document-token', 'ignored');
  assert.deepEqual(calls, [['schemka:clipboard-claim-cut', 'cut-id', 'document-token']]); calls.length = 0;
  await exposed.readTeamProfile('/caller/path');
  await exposed.documentLocation('document-token', '/ignored/caller/path');
  await exposed.getAppInfo('/caller/path', 'caller version');
  await exposed.openProject('token', '/caller/path'); await exposed.saveProject('bytes', 'token', '/caller/path'); await exposed.saveCurrentProject('bytes', 'token', '/caller/path'); await exposed.saveMermaid('flowchart LR'); await exposed.saveSvg('<svg/>', 'View', '/caller/path');
  assert.deepEqual(calls, [['schemka:read-team-profile'], ['schemka:document-location', 'document-token'], ['schemka:app-info'], ['schemka:open-project', 'token'], ['schemka:save-project', 'bytes', 'token'], ['schemka:save-current-project', 'bytes', 'token'], ['schemka:save-mermaid', 'flowchart LR'], ['schemka:save-svg', '<svg/>', 'View']]);
  calls.length = 0;
  const options = { remote: 'git@example.org:models.git', branch: 'main', directory: 'arkita' };
  const resolution = { records: {} };
  await exposed.gitStatus('bytes', 'token'); await exposed.gitConnect(options);
  await exposed.gitOpen('token'); await exposed.gitAdopt('candidate', 'token');
  await exposed.gitCommit('bytes', 'token', 'version'); await exposed.gitPush('token');
  await exposed.gitReceive('bytes', 'token'); await exposed.gitApply('plan', resolution, 'token');
  await exposed.gitDisconnect('/caller/path');
  assert.deepEqual(calls, [['schemka:git-status', 'bytes', 'token'], ['schemka:git-connect', options],
    ['schemka:git-open', 'token'], ['schemka:git-adopt', 'candidate', 'token'],
    ['schemka:git-commit', 'bytes', 'token', 'version'], ['schemka:git-push', 'token'],
    ['schemka:git-receive', 'bytes', 'token'], ['schemka:git-apply', 'plan', resolution, 'token'], ['schemka:git-disconnect']]);
  calls.length = 0;
  await exposed.gitInspect('oid', 'bytes', 'token', 'ignored-extra');
  await exposed.gitRestore('id', 'bytes', 'token', 'ignored-extra');
  await exposed.gitCreateBranch('name', 'token', 'ignored-extra');
  await exposed.gitPrepareBranch('name', 'bytes', 'token', 'ignored-extra');
  await exposed.gitSwitchBranch('id', 'bytes', 'token', 'ignored-extra');
  await exposed.gitCreateMilestone('name', 'oid', 'token', 'ignored-extra');
  await exposed.gitPublishMilestone('name', 'oid', 'token', 'ignored-extra');
  await exposed.gitDeleteMilestone('name', 'oid', 'token', 'ignored-extra');
  assert.deepEqual(calls, [
    ['schemka:git-inspect', 'oid', 'bytes', 'token'],
    ['schemka:git-restore', 'id', 'bytes', 'token'],
    ['schemka:git-create-branch', 'name', 'token'],
    ['schemka:git-prepare-branch', 'name', 'bytes', 'token'],
    ['schemka:git-switch-branch', 'id', 'bytes', 'token'],
    ['schemka:git-create-milestone', 'name', 'oid', 'token'],
    ['schemka:git-publish-milestone', 'name', 'oid', 'token'],
    ['schemka:git-delete-milestone', 'name', 'oid', 'token']
  ]);
});
test('close guard cancels by default, blocks active writes and allows only explicit discard; navigation/windows denied', () => {
  const { window } = windowFixture(); let busy = false, hasDirectoryIssue = false, response = 0, prompts = 0, popup, prompt;
  window.webContents.setWindowOpenHandler = fn => { popup = fn; };
  installWindowGuards(window, { showMessageBoxSync: (_window, options) => { prompts++; prompt = options; assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0); return response; } }, { get busy() { return busy; }, get hasDirectoryIssue() { return hasDirectoryIssue; } });
  const event = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) { const e = event(); window.webContents.emit(name, e); assert.equal(e.prevented, true); }
  assert.deepEqual(popup({ url: 'https://example.com' }), { action: 'deny' });
  let e = event(); window.webContents.emit('will-prevent-unload', e); assert.equal(e.prevented, false);
  busy = true; e = event(); window.emit('close', e); assert.equal(e.prevented, true);
  e = event(); window.webContents.emit('will-prevent-unload', e); assert.equal(e.prevented, false); assert.equal(prompts, 1);
  busy = false; response = 1; e = event(); window.webContents.emit('will-prevent-unload', e); assert.equal(e.prevented, true);
  hasDirectoryIssue = true; response = 0; e = event(); window.webContents.emit('will-prevent-unload', e); assert.equal(e.prevented, false);
  assert.match(prompt.detail, /Закрытие не восстановит его и не сохранит открытую модель/);
  assert.match(prompt.detail, /Сохранить как/); assert.doesNotMatch(prompt.detail, /копии восстановления останутся/);
});

test('normal application launches acquire a single-instance guard before creating a window', async () => {
  for (const owns of [false, true]) {
    const app = new EventEmitter(); let quits = 0, claims = 0, restores = 0, shows = 0, focuses = 0;
    app.requestSingleInstanceLock = () => { claims++; return owns; }; app.quit = () => { quits++; };
    let window;
    assert.equal(claimSingleInstance(app, () => window), owns);
    assert.equal(claims, 1); assert.equal(quits, owns ? 0 : 1);
    app.emit('second-instance');
    window = { isDestroyed: () => false, isMinimized: () => true, restore: () => restores++, show: () => shows++, focus: () => focuses++ };
    app.emit('second-instance');
    assert.deepEqual([restores, shows, focuses], owns ? [1, 1, 1] : [0, 0, 0]);
    window.isDestroyed = () => true; app.emit('second-instance');
    assert.equal(focuses, owns ? 1 : 0);
  }
  const main = await fs.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  const claim = main.indexOf('if (claimSingleInstance('), ready = main.indexOf('app.whenReady()');
  assert.ok(claim >= 0 && ready > claim);
  assert.equal((main.match(/new BrowserWindow\(/g) || []).length, 1);
  const index = await fs.readFile(new URL('../../schemka-model-ui/index.html', import.meta.url), 'utf8');
  const version = createBlankModel().snapshot.project.formatVersion;
  assert.match(index, new RegExp(`id="directory-title">Каталог модели · native v${version}</h3>[\\s\\S]*id="file-format-details"[\\s\\S]*Текущий формат модели — v${version}\\. Файлы v2 и v3 преобразуются в памяти`));
  assert.match(index, /сохраняет вытеснённые версии для восстановления/);
  assert.match(index, /Журнал успешного обновления очищается только после проверки сохранённых данных и отдельной резервной копии/);
  assert.match(index, /Старые, прерванные и неоднозначные журналы остаются на диске/);
  assert.doesNotMatch(index, /одновременная внешняя правка может быть потеряна/);
});
