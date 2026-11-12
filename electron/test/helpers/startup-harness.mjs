import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { visibleWindowBounds, watchWindowBounds } from '../../window-bounds.mjs';
import { projectBytes, readProjectSnapshot } from '../../project-files.mjs';
import { createDocumentRegistry, launchFiles } from '../../document-registry.mjs';
import { createProject } from '../../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../../schemka-model-io/src/project-file.js';

const [mainPath, scenario] = process.argv.slice(2);
const mainURL = pathToFileURL(path.resolve(mainPath));
const root = path.resolve(path.dirname(mainPath), '..');
const { APP_URL, trustedSender, trustedLocalPermission } = await import(new URL('./boundary.mjs', mainURL));
const { createFileService, prepareFileOpen } = await import(new URL('./file-service.mjs', mainURL));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
const ready = deferred(), assets = deferred(), readStarted = deferred(), finishRead = deferred();
const launchScenario = scenario.startsWith('launch-');
const fixture = launchScenario ? await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-startup-'))) : null;
const firstPath = fixture && path.join(fixture, 'Сертификаты офиса.arkita');
const secondPath = fixture && path.join(fixture, 'Вторая модель.arkita');
const badPath = fixture && path.join(fixture, 'broken.arkita');
const missingPath = fixture && path.join(fixture, 'missing.arkita');
const modelBytes = new Map();
if (fixture) {
  for (const selected of [firstPath, secondPath]) {
    const bytes = serializeProjectFile(createProject(path.basename(selected)));
    modelBytes.set(selected, Buffer.from(bytes).toString()); await fs.writeFile(selected, bytes);
  }
  await fs.writeFile(badPath, '{broken');
}
const argv = ['Arkita.exe', ...(scenario === 'launch-file-dev' ? ['electron/main.mjs'] : []),
  ...(['launch-file', 'launch-file-dev'].includes(scenario) ? [firstPath] :
    scenario === 'launch-multiple' ? [badPath, firstPath, firstPath, secondPath, missingPath] :
    scenario === 'launch-during-drain' ? [badPath] : scenario === 'launch-invalid' ? [badPath, missingPath] : [])];
async function until(predicate) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) { assert.ok(Date.now() < deadline, `startup completion timed out: ${JSON.stringify({ windows: windows.length, loaded: loaded.length, dialogs, errors })}`); await checkpoint(); }
  await checkpoint();
}
const events = [], windows = [], loaded = [], errors = [], dialogs = [], exits = [], clipboardClosed = [], ipc = new Map();
let isReady = false, claims = 0, readyCalls = 0, partitions = 0, assetCalls = 0, quits = 0;
let requestPermission, checkPermission, requestFilter, beforeRequest, menu, partitionName;
let restores = 0, shows = 0, focuses = 0, files, gitBusy = false;
const failure = Error(`startup ${scenario}`);
const dialogFailure = Error('error dialog failed');
const assetHandler = () => 'local asset';
const app = new EventEmitter();
let appVersion = '99.8.7-alpha.test';
Object.assign(app, {
  isPackaged: scenario !== 'launch-file-dev',
  setName: name => assert.equal(name, 'Arkita'),
  setAppUserModelId: id => assert.equal(id, 'org.smart-tinker.arkita'),
  getVersion: () => appVersion,
  getPath: name => { assert.equal(name, 'userData'); return path.join(root, 'test-user-data'); },
  enableSandbox: () => { events.push('sandbox'); },
  requestSingleInstanceLock: () => { claims++; events.push('lock'); return scenario !== 'lock-lost'; },
  whenReady: () => { readyCalls++; events.push('whenReady'); return ready.promise; },
  quit: () => { quits++; },
  exit: code => { exits.push(code); },
});
const dialog = {
  showErrorBox: (...args) => { dialogs.push(args); if (scenario === 'dialog-fails') throw dialogFailure; },
  showMessageBoxSync: () => 0,
};
const local = new EventEmitter();
Object.assign(local, {
  setPermissionRequestHandler: fn => { requestPermission = fn; },
  setPermissionCheckHandler: fn => { checkPermission = fn; },
  webRequest: { onBeforeRequest: (filter, fn) => { requestFilter = filter; beforeRequest = fn; } },
  protocol: { handle: (scheme, handler) => {
    assert.equal(scheme, 'schemka'); assert.equal(handler, assetHandler); events.push('protocol');
  } },
});
const channels = ['palette-open', 'palette-publish', 'palette-dock', 'palette-resolve-drop', 'palette-ready', 'palette-activate', 'palette-child-dock', 'clipboard-write-fragment', 'clipboard-read-fragment', 'clipboard-acknowledge-cut', 'clipboard-claim-cut', 'clipboard-complete-cut', 'clipboard-write-image', 'print-view', 'save-pdf', 'open-external-link', 'open-credential-manager', 'outline-text', 'validate-exchange-xml', 'read-external-files', 'save-external-files', 'read-team-profile', 'document-location', 'app-info', 'open-project', 'save-current-project', 'save-project', 'open-directory', 'save-directory', 'save-mermaid', 'save-svg',
  'document-changed', 'save-bound-directory', 'recover-directory', 'git-network-policy', 'git-set-network-policy', 'git-status', 'git-connect', 'git-open',
  'git-adopt', 'git-commit', 'git-push', 'git-receive', 'git-apply', 'git-inspect', 'git-restore', 'git-create-branch', 'git-prepare-branch', 'git-switch-branch', 'git-create-milestone', 'git-publish-milestone', 'git-delete-milestone', 'git-disconnect', 'document-preferences', 'set-document-preferences', 'open-recent', 'recover-backup', 'new-document', 'document-ready', 'open-dropped', 'close-document', 'finish-save-close', 'document-title'].map(name => `schemka:${name}`);
function assertGuards(window) {
  let permitted;
  requestPermission(window.webContents, 'camera', value => { permitted = value; });
  assert.equal(permitted, false); assert.equal(checkPermission(), false);
  const permissionDetails = { isMainFrame: true, requestingUrl: APP_URL };
  for (const permission of ['clipboard-sanitized-write', 'fullscreen']) {
    requestPermission(window.webContents, permission, value => { permitted = value; }, permissionDetails);
    assert.equal(permitted, true, permission); assert.equal(checkPermission(window.webContents, permission, 'schemka://app', permissionDetails), true, permission);
    for (const details of [{ ...permissionDetails, isMainFrame: false }, { ...permissionDetails, requestingUrl: 'https://example.com/' }]) {
      requestPermission(window.webContents, permission, value => { permitted = value; }, details);
      assert.equal(permitted, false); assert.equal(checkPermission(window.webContents, permission, 'schemka://app', details), false);
    }
    requestPermission({}, permission, value => { permitted = value; }, permissionDetails);
    assert.equal(permitted, false); assert.equal(checkPermission({}, permission, 'schemka://app', permissionDetails), false);
  }
  for (const permission of ['clipboard-read', 'automatic-fullscreen', 'unknown']) {
    requestPermission(window.webContents, permission, value => { permitted = value; }, permissionDetails);
    assert.equal(permitted, false); assert.equal(checkPermission(window.webContents, permission, 'schemka://app', permissionDetails), false);
  }
  const preventable = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  const download = preventable(); local.emit('will-download', download); assert.equal(download.prevented, true);
  assert.deepEqual([...requestFilter.urls], ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*']);
  let result; beforeRequest({}, value => { result = value; }); assert.deepEqual({ ...result }, { cancel: true });
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    const event = preventable(); window.webContents.emit(name, event); assert.equal(event.prevented, true, name);
  }
  assert.deepEqual({ ...window.popup({ url: 'https://example.com' }) }, { action: 'deny' });
  assert.equal(window.listenerCount('close'), 1);
  const unload = preventable(); window.webContents.emit('will-prevent-unload', unload); assert.equal(unload.prevented, false);
  assert.equal(window.webContents.listenerCount('render-process-gone'), 1);
  assert.deepEqual([...ipc.keys()], channels);
  assert.equal(app.listenerCount('window-all-closed'), 1);
  assert.equal(menu, null);
}
class BrowserWindow extends EventEmitter {
  constructor(options) {
    super(); assert.equal(isReady, true); assert.ok(events.includes('protocol'));
    assert.equal(options.webPreferences.session, local);
    const { session: _session, ...preferences } = options.webPreferences;
    assert.deepEqual(preferences, { preload: path.join(root, 'electron/preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false });
    const { webPreferences: _preferences, ...dimensions } = options;
    assert.deepEqual(dimensions, { x: 0, y: 0, width: 1280, height: 850, minWidth: 760, minHeight: 540, title: 'Arkita' });
    this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: APP_URL };
    this.webContents.setWindowOpenHandler = fn => { this.popup = fn; };
    windows.push(this); events.push('window');
  }
  isDestroyed() { return false; }
  setTitle(title) { this.title = title; }
  close() { this.emit('close', { preventDefault() {} }); }
  isMinimized() { return true; }
  restore() { restores++; }
  show() { shows++; }
  focus() { focuses++; }
  async loadURL(url) {
    assert.equal(url, APP_URL); assertGuards(this); loaded.push(url);
    if (scenario === 'launch-during-drain' && windows.length === 1) app.emit('second-instance', {}, [firstPath, secondPath]);
    if (scenario === 'load-fails' || scenario === 'dialog-fails') throw failure;
  }
}
const context = vm.createContext({ console: { error: (...args) => { errors.push(args); } } });
const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
}, { context });
const modules = {
  electron: synthetic({ app, BrowserWindow, dialog, clipboard: {}, ClipboardItem: class {}, nativeImage: {}, screen: { on() {}, getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1280, height: 850 } }] },
    ipcMain: { handle: (name, fn) => { assert.equal(ipc.has(name), false); ipc.set(name, fn); } },
    Menu: { setApplicationMenu: value => { menu = value; } },
    protocol: { registerSchemesAsPrivileged: schemes => {
      assert.equal(isReady, false); events.push('scheme');
      assert.equal(schemes.length, 1); assert.equal(schemes[0].scheme, 'schemka');
      assert.deepEqual({ ...schemes[0].privileges }, { standard: true, secure: true, supportFetchAPI: true });
    } },
    shell: {},
    session: { fromPartition: name => {
      assert.equal(isReady, true); partitionName = name; partitions++; return local;
    } },
  }),
  'node:crypto': synthetic({ randomUUID }),
  './project-files.mjs': synthetic({ projectBytes }),
  './team-profile.mjs': synthetic({ readStartupTeamProfile: async () => ({ status: 'absent' }) }),
  './host-actions.mjs': synthetic({ createHostActions: () => ({}) }),
  './window-bounds.mjs': synthetic({ visibleWindowBounds, watchWindowBounds }),
  './palette-service.mjs': synthetic({ createPaletteService: () => ({ closed() {}, ready: () => ({ status: 'error', code: 'IPC_SENDER' }), activate: () => ({ status: 'error', code: 'IPC_SENDER' }), childDock: () => ({ status: 'error', code: 'IPC_SENDER' }) }) }),
  './catalog-service.mjs': synthetic({ createCatalogService: () => ({ closed() {}, ready: () => ({ status: 'error', code: 'IPC_SENDER' }), activate: () => ({ status: 'error', code: 'IPC_SENDER' }), childDock: () => ({ status: 'error', code: 'IPC_SENDER' }) }) }),
  './print-service.mjs': synthetic({ createPrintService: () => async () => ({ status: 'cancelled' }) }),
  './clipboard-service.mjs': synthetic({ createClipboardService: ({ ClipboardItem }) => { assert.equal(typeof ClipboardItem, 'function'); return { closed(record) { clipboardClosed.push(record.window); }, read: async () => { throw Object.assign(Error('native clipboard rejected'), { code: 'CLIPBOARD_DENIED' }); } }; } }),
  './document-preferences.mjs': synthetic({ createDocumentPreferences: () => ({ status: async () => ({ status: 'ok' }), remember: async () => {}, backup: async () => {}, windowBounds: async () => null, setWindowBounds: async () => {} }) }),
  './document-registry.mjs': synthetic({ createDocumentRegistry, launchFiles }),
  'node:path': synthetic({ default: path }),
  'node:process': synthetic({ default: { platform: 'win32', argv, resourcesPath: path.join(root, 'test-resources') } }),
  'node:url': synthetic({ fileURLToPath }),
  './boundary.mjs': synthetic({ APP_URL, trustedSender, trustedLocalPermission, createAssetHandler: actualRoot => {
    assert.equal(isReady, true); assert.equal(actualRoot, root); assetCalls++; return assets.promise;
  } }),
  './file-service.mjs': synthetic({ prepareFileOpen: (selected, options) => prepareFileOpen(selected, { ...options,
    reader: async file => {
      if (scenario === 'launch-during-drain' && file === badPath) { readStarted.resolve(); await finishRead.promise; }
      return readProjectSnapshot(file);
    } }), createFileService: options => {
    assert.equal(options.window, windows.at(-1)); assert.equal(options.dialog, dialog);
    files = createFileService(options); return files;
  } }),
  './git-service.mjs': synthetic({ createGitService: options => {
    assert.equal(options.window, windows.at(-1));
    assert.equal(options.storagePath, path.join(root, 'test-user-data', 'git'));
    assert.equal(options.gitPath, app.isPackaged ? path.join(root, 'test-resources', 'git', 'cmd', 'git.exe') : undefined);
    assert.equal(options.isFileBusy(), launchScenario && windows.length > 1);
    return { get busy() { return gitBusy; }, ...Object.fromEntries(
      ['status', 'connect', 'open', 'adopt', 'commit', 'push', 'receive', 'apply', 'inspect', 'restore', 'createBranch', 'prepareBranch', 'switchBranch', 'createMilestone', 'publishMilestone', 'deleteMilestone', 'disconnect', 'documentChanged']
        .map(name => [name, event => trustedSender(event, options.window) ? { status: 'ok' } : { status: 'error', code: 'IPC_SENDER' }])) };
  } }),
  './window-guards.mjs': new vm.SourceTextModule(await fs.readFile(new URL('./window-guards.mjs', mainURL), 'utf8'), { context }),
};
try {
const entry = new vm.SourceTextModule(await fs.readFile(mainURL, 'utf8'), {
  context, identifier: mainURL.href, initializeImportMeta: meta => { meta.url = mainURL.href; },
});
await entry.link(specifier => {
  assert.ok(Object.hasOwn(modules, specifier), `Unexpected entry import: ${specifier}`); return modules[specifier];
});
let evaluated = false, evaluationError;
entry.evaluate().then(() => { evaluated = true; }, error => { evaluationError = error; });
await checkpoint();
assert.ifError(evaluationError);
assert.equal(evaluated, true, 'Main module evaluation must settle while ready is withheld (Electron emits ready only after import)');
assert.equal(claims, 1); assert.deepEqual(events.slice(0, 3), ['sandbox', 'scheme', 'lock']);
assert.equal(partitions, 0); assert.equal(assetCalls, 0); assert.equal(windows.length, 0); assert.equal(ipc.size, 0);
assert.equal(loaded.length, 0); assert.equal(dialogs.length, 0); assert.equal(exits.length, 0);
app.emit('second-instance');
assert.deepEqual([restores, shows, focuses], [0, 0, 0]);
if (scenario === 'launch-pre-ready') {
  let prevented = false;
  app.emit('open-file', { preventDefault() { prevented = true; } }, firstPath);
  assert.equal(prevented, true);
  app.emit('second-instance', {}, [path.basename(secondPath)], fixture);
  app.emit('second-instance', {}, [firstPath]);
}
if (scenario === 'lock-lost') {
  assert.equal(readyCalls, 0); assert.equal(quits, 1); assert.equal(app.listenerCount('second-instance'), 0);
  isReady = true; ready.resolve(); await checkpoint();
  assert.equal(partitions, 0); assert.equal(windows.length, 0); assert.equal(assetCalls, 0); assert.equal(ipc.size, 0);
  assert.equal(loaded.length, 0); assert.equal(errors.length, 0); assert.equal(dialogs.length, 0); assert.equal(exits.length, 0);
} else {
  assert.equal(readyCalls, 1); assert.equal(quits, 0); assert.equal(app.listenerCount('second-instance'), 1);
  if (scenario === 'ready-fails') ready.reject(failure);
  else { isReady = true; ready.resolve(); }
  await checkpoint();
  assert.equal(windows.length, 0); assert.equal(loaded.length, 0);
  assert.equal(partitions, scenario === 'ready-fails' ? 0 : 1);
  if (partitions) assert.match(partitionName, /^persist:.+/, 'Local preferences must use a persistent Electron session');
  assert.equal(assetCalls, scenario === 'ready-fails' ? 0 : 1);
  if (scenario === 'assets-fail') assets.reject(failure);
  else if (scenario !== 'ready-fails') assets.resolve(assetHandler);
  await checkpoint();
  if (launchScenario) {
    if (scenario === 'launch-during-drain') {
      await readStarted.promise; assert.equal(windows.length, 0);
      app.emit('second-instance', {}, [firstPath]); finishRead.resolve();
    }
    const expected = scenario === 'launch-invalid' ? [] :
      ['launch-file', 'launch-file-dev'].includes(scenario) ? [firstPath] : [firstPath, secondPath];
    const errorCount = ['launch-multiple', 'launch-invalid'].includes(scenario) ? 2 : scenario === 'launch-during-drain' ? 1 : 0;
    await until(() => loaded.length === Math.max(1, expected.length) && dialogs.length === errorCount);
    assert.equal(windows.length, Math.max(1, expected.length));
    assert.equal(errors.length, 0); assert.deepEqual(exits, []);
    for (const message of dialogs) assert.match(message[0], /модель не открыта/);
    for (const [index, current] of windows.entries()) {
      assertGuards(current);
      const event = { sender: current.webContents, senderFrame: current.webContents.mainFrame }, token = randomUUID();
      const initial = await ipc.get('schemka:document-ready')(event, token);
      assert.equal(initial.status, expected.length ? 'opened' : 'new');
      if (expected.length) {
        assert.equal(initial.name, path.basename(expected[index]));
        assert.equal(Buffer.from(initial.bytes).toString(), modelBytes.get(expected[index])); assert.ok(initial.candidate);
      }
      const currentToken = randomUUID();
      assert.equal((await ipc.get('schemka:document-changed')(event, token, currentToken, initial.candidate)).status, expected.length ? 'bound' : 'detached');
      current.token = currentToken;
    }
    if (scenario === 'launch-file') {
      const first = windows[0], event = { sender: first.webContents, senderFrame: first.webContents.mainFrame };
      app.emit('second-instance', {}, [firstPath, secondPath]);
      await until(() => loaded.length === 2);
      assert.equal(windows.length, 2); assert.equal(windows[0], first);
      assert.equal((await ipc.get('schemka:document-location')(event, first.token)).path, firstPath);
      assert.equal((await ipc.get('schemka:document-ready')(event, first.token)).status, 'none');
      const second = windows[1], event2 = { sender: second.webContents, senderFrame: second.webContents.mainFrame };
      const opened = await ipc.get('schemka:document-ready')(event2, randomUUID());
      assert.equal(opened.status, 'opened'); assert.equal(opened.name, path.basename(secondPath));
      assert.equal(Buffer.from(opened.bytes).toString(), modelBytes.get(secondPath));
    }
  } else {
  if (scenario === 'ready' || scenario === 'load-fails' || scenario === 'dialog-fails') {
    assert.equal(windows.length, 1); assert.deepEqual(loaded, [APP_URL]);
    assertGuards(windows[0]); assert.ok(files);
    for (const handler of ipc.values()) assert.equal((await handler({ sender: {} })).code, 'IPC_SENDER');
    const info = ipc.get('schemka:app-info'), contents = windows[0].webContents;
    const titleEvent = { sender: contents, senderFrame: contents.mainFrame }, titleHandler = ipc.get('schemka:document-title');
    assert.equal((await titleHandler(titleEvent, 'Native', true, 'asterisk')).status, 'ok'); assert.match(windows[0].title, /^\* Native/);
    assert.equal((await titleHandler(titleEvent, 'Native', true, 'circle')).status, 'ok'); assert.match(windows[0].title, /^● Native/);
    assert.equal((await titleHandler(titleEvent, 'Native', true, 'html')).code, 'DOCUMENT_TITLE');
    for (const senderFrame of [null, { url: APP_URL }]) assert.equal((await info({ sender: contents, senderFrame })).code, 'IPC_SENDER');
    for (const version of ['99.8.7-alpha.test', '99.8.8-test']) {
      appVersion = version;
      assert.deepEqual({ ...await info({ sender: contents, senderFrame: contents.mainFrame }) }, { status: 'ok', version });
    }
    gitBusy = true;
    const close = { prevented: false, preventDefault() { this.prevented = true; } };
    windows[0].emit('close', close); assert.equal(close.prevented, true, 'Git operation blocks native close');
    const open = await ipc.get('schemka:open-project')({ sender: contents, senderFrame: contents.mainFrame });
    assert.equal(open.code, 'FILE_BUSY', 'Git operation blocks overlapping native file I/O');
    gitBusy = false;
    app.emit('second-instance'); assert.deepEqual([restores, shows, focuses], [1, 1, 1]);
  } else {
    assert.equal(windows.length, 0); assert.equal(loaded.length, 0); assert.equal(ipc.size, 0);
    assert.equal(events.includes('protocol'), false);
  }
  if (scenario === 'ready') {
    assert.equal(errors.length, 0); assert.equal(dialogs.length, 0); assert.equal(exits.length, 0);
    const first = windows[0], firstEvent = { sender: first.webContents, senderFrame: first.webContents.mainFrame };
    const clipboardError = await ipc.get('schemka:clipboard-read-fragment')(firstEvent);
    assert.deepEqual({ ...clipboardError }, { status: 'error', code: 'CLIPBOARD_DENIED', message: 'native clipboard rejected' });
    const token1 = randomUUID(), token2 = randomUUID();
    assert.equal((await ipc.get('schemka:document-ready')(firstEvent, token1)).status, 'new');
    assert.equal((await ipc.get('schemka:document-changed')(firstEvent, token1, token1)).status, 'detached');
    assert.equal((await ipc.get('schemka:new-document')(firstEvent)).status, 'opened-window');
    assert.equal(windows.length, 2); const second = windows[1], secondEvent = { sender: second.webContents, senderFrame: second.webContents.mainFrame };
    assert.equal((await ipc.get('schemka:document-ready')(secondEvent, token2)).status, 'new');
    assert.equal((await ipc.get('schemka:document-changed')(secondEvent, token2, token2)).status, 'detached');
    assert.equal((await ipc.get('schemka:save-current-project')(secondEvent, new Uint8Array(), token1)).code, 'DIRECTORY_SESSION');
    for (const selected of [firstEvent, secondEvent]) assert.equal((await ipc.get('schemka:git-status')(selected)).status, 'ok');
    assertGuards(second);
    windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    assert.equal(dialogs.length, 1); assert.match(dialogs[0][1], /crashed/);
    assert.deepEqual(clipboardClosed, [first]);
    app.emit('window-all-closed'); assert.equal(quits, 1);
  } else {
    assert.equal(errors.length, scenario === 'dialog-fails' ? 2 : 1); assert.ok(errors[0].includes(failure));
    if (scenario === 'dialog-fails') assert.ok(errors[1].includes(dialogFailure));
    assert.equal(dialogs.length, 1); assert.match(dialogs[0][0], /Arkita/); assert.equal(dialogs[0][1], failure.message);
    assert.deepEqual(exits, [1]);
  }
}
}
console.log(`Verified actual main module: ${scenario}`);
} finally { if (fixture) await fs.rm(fixture, { recursive: true, force: true }); }
