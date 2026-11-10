import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_URL } from '../boundary.mjs';
import { createFileService } from '../file-service.mjs';
import { readNativeDirectory } from '../native-directory.mjs';
import { atomicWrite, recoverProjectFile } from '../project-files.mjs';

const staticSvg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -20 100 80"><text x="0" y="10">Снимок &amp; 日本語</text></svg>';

import { updateNativeDirectory } from '../directory-update.mjs';
import { createDemo } from '../../schemka-model-ui/src/demo.js';
import { createController } from '../../schemka-model-ui/src/controller.js';
import { createProjectSession } from '../../schemka-model-ui/src/project-session.js';
import { installFileActions } from '../../schemka-model-ui/src/file-actions.js';
import { createStore } from '../../schemka-model-core/src/index.js';
import { viewpointDefinition, viewpointId } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';

async function fixture(t, options = {}) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-native-export-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const nativeWindow = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
  const event = { sender: nativeWindow.webContents, senderFrame: nativeWindow.webContents.mainFrame };
  let directory = parent, destination, picker = async () => ({ canceled: destination === null, filePath: destination });
  const replies = [], errors = [];
  const service = createFileService({ window: nativeWindow, dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [directory] }),
    showSaveDialog: (...args) => picker(...args), showErrorBox: (...args) => errors.push(args),
  }, ...options });
  const desktop = Object.fromEntries(['saveDirectory', 'saveProject', 'saveCurrentProject', 'openProject', 'documentChanged'].map(method => [method, async (...args) => {
    const result = await service[method === 'openProject' ? 'open' : method](event, ...args); replies.push({ method, args, result }); return result;
  }]));
  class Element {
    constructor() { this.listeners = {}; this.dataset = {}; this.value = ''; this.files = []; this.open = false; this.textContent = ''; }
    setAttribute(name, value) { this[name] = value; }
    focus() {}
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    async event(name) { for (const fn of this.listeners[name] || []) await fn({ target: this }); }
    close() { this.open = false; for (const fn of this.listeners.close || []) fn(); }
  }
  const elements = new Map(), statuses = [];
  const document = { addEventListener() {}, getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); } };
  const state = createDemo().snapshot;
  state.viewpoints = [{ id: viewpointId, ...viewpointDefinition() }];
  state.customizationProfiles = [{ id: profileId, ...profileDefinition() }];
  state.junctions.push({ id: fixtureId('jct', 1), type: 'AndJunction', name: 'Synthetic junction', documentation: '', properties: [] });
  const $ = id => document.getElementById(id), model = createController(createStore(state)), session = createProjectSession(model.store);
  const window = { schemkaDesktop: desktop, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
  const actions = installFileActions({ document, window, model, session, inline: { generation: 0, cancel() {} }, cancelGesture() {},
    render() { actions.refresh(); }, status: text => statuses.push(text), openDialog: id => { $(id).open = true; }, afterLoad: () => model.afterLoad() });
  actions.refresh(); await $('file-button').event('click'); await $('desktop-save-directory').event('click');
  const saved = replies.find(item => item.method === 'saveDirectory').result;
  assert.equal(saved.status, 'saved'); assert.equal(replies.at(-1).result.status, 'bound');
  const root = path.join(parent, saved.name), opened = await readNativeDirectory(root);
  return { parent, root, service, event, model, session, actions, $, statuses, replies, errors, opened,
    saveAt(value) { destination = value; }, openAt(value) { directory = value; }, picker(value) { picker = value; } };
}

async function unchanged(f, before, state = f.opened.bytes) {
  for (const file of before) assert.deepEqual(await fs.readFile(path.join(f.root, file.path)), Buffer.from(file.content), file.path);
  const reopened = await readNativeDirectory(f.root);
  assert.deepEqual(reopened.bytes, state, 'real native reopen preserves complete model and IDs');
  assert.deepEqual(reopened.snapshot.files, before, 'no native records added or removed');
  assert.equal(f.service.busy, false); assert.deepEqual(f.errors, []);
}

test('ordinary Save As refuses a healthy bound header without clearing dirty state or history', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files;
  f.model.execute({ type: 'renameProject', name: 'Unsaved one' });
  f.model.execute({ type: 'renameProject', name: 'Unsaved two' }); f.model.undo();
  const state = f.model.store.snapshot, history = f.model.store.history, revision = f.model.store.revision;
  assert.deepEqual(history, { undo: 1, redo: 1 }); assert.equal(f.session.dirty, true);
  f.saveAt(path.join(f.root, 'schemka.json')); await f.$('save-project').event('click');
  assert.equal(f.replies.at(-1).method, 'saveProject'); assert.equal(f.replies.at(-1).args[1], f.session.documentToken);
  assert.equal(f.replies.at(-1).result.status, 'error');
  assert.equal(f.replies.at(-1).result.code, 'DIRECTORY_OWNED');
  assert.equal(f.session.dirty, true); assert.equal(f.actions.directoryMismatch, true);
  assert.match(f.statuses.at(-1), /не выполнено/);
  assert.deepEqual(f.model.store.snapshot, state); assert.deepEqual(f.model.store.history, history); assert.equal(f.model.store.revision, revision);
  await unchanged(f, before);
});

test('Save As outside a bound native directory commits a file; normal Save updates only that file without a picker', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files, target = path.join(f.parent, 'separate.arkita');
  f.model.execute({ type: 'renameProject', name: 'Separate copy' });
  const history = f.model.store.history, token = f.session.documentToken;
  f.saveAt(target); await f.$('save-project').event('click');
  const saved = f.replies.at(-2), ack = f.replies.at(-1);
  assert.equal(saved.method, 'saveProject'); assert.equal(saved.args[1], token); assert.equal(saved.result.status, 'saved');
  assert.equal(saved.result.directory.binding.name, path.basename(f.root)); assert.equal(saved.result.directory.file, null);
  assert.equal(ack.method, 'documentChanged'); assert.deepEqual(ack.args, [token, token, saved.result.candidate]);
  assert.equal(ack.result.status, 'bound'); assert.equal(ack.result.directory.binding, null); assert.equal(ack.result.directory.file.name, 'separate.arkita');
  assert.equal(f.session.dirty, false); assert.equal(f.actions.directoryMismatch, false); assert.deepEqual(f.model.store.history, history);
  assert.deepEqual(await fs.readFile(target), Buffer.from(f.session.prepareSave().bytes));
  f.picker(() => { throw Error('Normal Save must not reopen a picker'); });
  f.model.execute({ type: 'renameProject', name: 'Edited separate copy' }); await f.actions.save();
  const current = f.replies.at(-1);
  assert.equal(current.method, 'saveCurrentProject'); assert.equal(current.args[1], token); assert.equal(current.result.status, 'saved');
  assert.equal(current.result.bindingId, ack.result.directory.file.id); assert.equal(f.session.dirty, false);
  assert.deepEqual(await fs.readFile(target), Buffer.from(f.session.prepareSave().bytes));
  await unchanged(f, before);
});

test('envelope, Mermaid and SVG exports cannot replace native records or create new native-shaped collisions', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files, view = f.model.store.snapshot.views[0].view.id;
  const destinations = [...before.map(file => file.path),
    'model', 'model/elements', 'model/junctions', 'model/relationships', 'model/customization-profiles', 'viewpoints', 'views',
    `model/elements/el-${fixtureId('el', 999).slice(3)}.json`, 'model/elements/notes.json', 'model/elements/el-invalid.mmd',
    'model/junctions/jct-invalid.mmd', 'model/relationships/rel-invalid.mmd', 'model/customization-profiles/prf-invalid.mmd',
    'viewpoints/vpt-invalid.mmd', 'viewpoints/notes.json', `views/${view}/unknown.json`,
    'views/view-invalid', `views/${view}/view.json`, `views/${view}/occurrences`, `views/${view}/connections`,
    `views/${view}/occurrences/occ-invalid.mmd`, `views/${view}/connections/conn-invalid.mmd`,
    `views/${view}/occurrences/notes.json`, `views/${view}/connections/notes.json`,
    '.schemka-incomplete.json', '.schemka-recovery.json',
  ];
  const captured = f.session.prepareSave().bytes, state = f.model.store.snapshot, history = f.model.store.history, revision = f.model.store.revision;
  for (const relative of [...new Set(destinations)]) for (const spelling of [relative, relative.toUpperCase()]) {
    f.saveAt(path.join(f.root, spelling));
    for (const action of [() => f.service.saveProject(f.event, captured), () => f.service.saveMermaid(f.event, 'flowchart LR\nA-->B'), () => f.service.saveSvg(f.event, staticSvg, 'Synthetic view')]) {
      const result = await action();
      assert.equal(result.status, 'error', spelling); assert.equal(result.code, 'DIRECTORY_OWNED', spelling);
    }
  }
  assert.deepEqual(f.model.store.snapshot, state); assert.deepEqual(f.model.store.history, history); assert.equal(f.model.store.revision, revision);
  await unchanged(f, before);
});

test('ordinary unowned exports remain usable and cancellation never changes native records', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files, view = f.model.store.snapshot.views[0].view.id;
  const exports = ['copy.schemka.json', 'view.mmd', 'notes/copy.json', 'model/constructor', 'model/__proto__', 'model/private/copy.json', 'model/elements/notes/copy.json',
    'model/elements/notes.mmd', 'viewpoints/notes/copy.json', 'viewpoints/notes.mmd', 'views/notes/copy.json',
    `views/${view}/notes/copy.json`, `views/${view}/notes.mmd`, `views/${view}/occurrences/notes/copy.json`,
    `views/${view}/connections/notes.mmd`];
  for (const relative of exports) {
    const target = path.join(f.root, relative); await fs.mkdir(path.dirname(target), { recursive: true }); f.saveAt(target);
    assert.equal((await f.service.saveProject(f.event, f.opened.bytes)).status, 'saved', relative);
    assert.deepEqual(await fs.readFile(target), Buffer.from(f.opened.bytes));
    assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR\nA-->B')).status, 'saved', relative);
    assert.equal(await fs.readFile(target, 'utf8'), 'flowchart LR\nA-->B');
  }
  const outside = path.join(f.parent, 'schemka.json'); f.saveAt(outside);
  assert.equal((await f.service.saveProject(f.event, f.opened.bytes)).status, 'saved');
  f.saveAt(null);
  assert.deepEqual(await f.service.saveProject(f.event, f.opened.bytes), { status: 'cancelled' });
  assert.deepEqual(await f.service.saveMermaid(f.event, 'flowchart LR'), { status: 'cancelled' });
  assert.deepEqual(await f.service.saveSvg(f.event, staticSvg, 'Current view'), { status: 'cancelled' });
  await unchanged(f, before);
});

test('SVG uses a separate sanitized filename, writes exact UTF-8 and retains native model binding', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files;
  for (const relative of ['diagram.svg', 'notes/日本語.svg', `views/${f.model.viewId}/notes/diagram.svg`]) {
    const target = path.join(f.root, relative); await fs.mkdir(path.dirname(target), { recursive: true });
    f.picker(async (_window, options) => {
      assert.match(options.defaultPath, /\.svg$/); assert.doesNotMatch(options.defaultPath, /[\\/:<>]/);
      assert.deepEqual(options.filters, [{ name: 'Изображение SVG', extensions: ['svg'] }]);
      return { canceled: false, filePath: target };
    });
    const result = await f.service.saveSvg(f.event, staticSvg, '../View <日本語>'); assert.equal(result.status, 'saved'); assert.equal(result.name, path.basename(target)); if (result.warning) assert.match(result.warning, /восстановления/);
    assert.equal(await fs.readFile(target, 'utf8'), staticSvg);
    assert.equal(f.session.dirty, false); assert.equal(f.actions.directoryMismatch, false); assert.equal(f.actions.directoryWarning, false);
  }
  for (const target of [path.join(f.parent, 'existing.arkita'), path.join(f.root, 'model/elements/el-invalid.svg')]) {
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, 'retained'); f.picker(async () => ({ canceled: false, filePath: target }));
    const result = await f.service.saveSvg(f.event, staticSvg);
    assert.equal(result.code, target.endsWith('.arkita') ? 'FILE_EXTENSION' : 'DIRECTORY_OWNED'); assert.equal(await fs.readFile(target, 'utf8'), 'retained');
    if (target.endsWith('el-invalid.svg')) await fs.unlink(target);
  }
  await unchanged(f, before);
});

test('SVG invalid payload and untrusted sender never open a native picker or write bytes', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files; let picks = 0;
  f.picker(async () => { picks++; return { canceled: false, filePath: path.join(f.parent, 'unexpected.svg') }; });
  for (const payload of ['<svg onload="run()"/>', staticSvg.replace('</svg>', '<image href="https://example.invalid/x"/></svg>'), staticSvg.replace('</text>', '&AMP;</text>')]) assert.equal((await f.service.saveSvg(f.event, payload)).status, 'error');
  assert.equal((await f.service.saveSvg({ ...f.event, sender: {} }, staticSvg)).code, 'IPC_SENDER');
  assert.equal(picks, 0); await assert.rejects(fs.stat(path.join(f.parent, 'unexpected.svg')), { code: 'ENOENT' }); await unchanged(f, before);
});

test('SVG write failure retains the destination and explicit recovery copies without changing native records', async t => {
  let injectedWrite = false;
  const injected = { ...fs, open: async (...args) => {
    const handle = await fs.open(...args);
    if (!(args[1] & constants.O_WRONLY) || path.basename(path.dirname(args[0])) !== 'pending' || path.basename(args[0]) !== 'file.bin') return handle;
    return new Proxy(handle, { get(object, key) {
      if (key === 'writeFile') return async bytes => {
        injectedWrite = true; await handle.writeFile(bytes.subarray(0, 8)); throw Object.assign(Error('injected SVG disk full'), { code: 'ENOSPC' });
      };
      return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
    } });
  } };
  const f = await fixture(t, { write: (target, bytes) => atomicWrite(target, bytes, injected) }), before = f.opened.snapshot.files;
  const target = path.join(f.parent, 'retained.svg'); await fs.writeFile(target, 'previous SVG'); f.saveAt(target);
  const entries = await fs.readdir(f.parent), result = await f.service.saveSvg(f.event, staticSvg);
  assert.equal(result.status, 'error'); assert.equal(result.code, 'ENOSPC'); assert.match(result.message, /injected SVG disk full/); assert.equal(injectedWrite, true);
  assert.equal(await fs.readFile(target, 'utf8'), 'previous SVG');
  const marker = (await fs.readdir(f.parent)).find(name => /^arkita-recovery-[0-9a-f]{64}\.json$/.test(name)); assert.ok(marker);
  assert.equal(f.errors.length, 1, 'main presents the recovery location'); f.errors.length = 0;
  await recoverProjectFile(path.join(f.parent, marker), 'before');
  assert.equal(await fs.readFile(target, 'utf8'), 'previous SVG');
  assert.deepEqual((await fs.readdir(f.parent)).filter(name => !name.startsWith('.schemka-transaction-')), entries.filter(name => !name.startsWith('.schemka-transaction-')));
  await unchanged(f, before);
});

test('SVG keeps its captured native-root protection after a document change while its picker is pending', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files; let choose;
  f.picker(() => new Promise(resolve => { choose = resolve; }));
  const exporting = f.service.saveSvg(f.event, staticSvg);
  assert.equal(f.service.busy, true); assert.equal((await f.service.saveSvg(f.event, staticSvg)).code, 'FILE_BUSY');
  assert.equal(f.service.documentChanged(f.event, f.session.documentToken, randomUUID()).status, 'detached');
  choose({ canceled: false, filePath: path.join(f.root, 'model/elements/el-late.svg') });
  assert.equal((await exporting).code, 'DIRECTORY_OWNED'); await unchanged(f, before);
});

async function boundModelFile(t) {
  const f = await fixture(t), target = path.join(f.parent, 'native-model.svg');
  await fs.writeFile(target, f.opened.bytes); f.openAt(target);
  await f.$('desktop-open-project').event('click'); await f.$('load-project').event('click');
  assert.equal(f.replies.at(-1).result.status, 'bound'); assert.equal(f.replies.at(-1).result.directory.file.name, 'native-model.svg');
  f.model.execute({ type: 'renameProject', name: 'Retain unsaved' }); f.model.execute({ type: 'renameProject', name: 'Retain redo' }); f.model.undo();
  return { ...f, target };
}

test('SVG and Mermaid cannot overwrite an opened native model even when its filename ends in .svg or gains a hard-link alias', async t => {
  const f = await boundModelFile(t), before = f.opened.snapshot.files;
  const bytes = await fs.readFile(f.target), state = f.model.store.snapshot, history = f.model.store.history, revision = f.model.store.revision;
  const alias = path.join(f.parent, 'alias.svg'); await fs.link(f.target, alias);
  for (const target of [f.target, alias]) {
    f.saveAt(target);
    for (const operation of [() => f.service.saveSvg(f.event, staticSvg), () => f.service.saveMermaid(f.event, 'flowchart LR')]) assert.equal((await operation()).code, 'FILE_OWNED');
    assert.deepEqual(await fs.readFile(target), bytes);
  }
  const separate = path.join(f.parent, 'separate.svg'); f.saveAt(separate); assert.equal((await f.service.saveSvg(f.event, staticSvg)).status, 'saved');
  assert.equal(await fs.readFile(separate, 'utf8'), staticSvg); assert.deepEqual(await fs.readFile(f.target), bytes);
  assert.deepEqual(f.model.store.snapshot, state); assert.deepEqual(f.model.store.history, history); assert.equal(f.model.store.revision, revision); assert.equal(f.session.dirty, true);
  await unchanged(f, before);
});

test('late SVG and Mermaid pickers retain protection for detached or renamed source model files', async t => {
  for (const format of ['SVG', 'Mermaid']) {
    const f = await boundModelFile(t), bytes = await fs.readFile(f.target); let choose;
    f.picker(() => new Promise(resolve => { choose = resolve; }));
    const exporting = format === 'SVG' ? f.service.saveSvg(f.event, staticSvg) : f.service.saveMermaid(f.event, 'flowchart LR');
    const token = f.session.documentToken; assert.equal(f.service.documentChanged(f.event, token, randomUUID()).status, 'detached');
    const moved = path.join(f.parent, 'renamed-model.svg'); await fs.rename(f.target, moved);
    choose({ canceled: false, filePath: moved }); assert.equal((await exporting).code, 'FILE_OWNED'); assert.deepEqual(await fs.readFile(moved), bytes);
    assert.deepEqual(f.model.store.history, { undo: 1, redo: 1 }); assert.equal(f.session.dirty, true);
  }
});

test('a model file newly bound during an export picker is protected along with the captured source file', async t => {
  const f = await boundModelFile(t), target = path.join(f.parent, 'new-model.svg'), token = f.session.documentToken;
  await fs.writeFile(target, f.opened.bytes); f.openAt(target);
  const opened = await f.service.open(f.event, token); assert.equal(opened.status, 'opened');
  let choose; f.picker(() => new Promise(resolve => { choose = resolve; })); const exporting = f.service.saveSvg(f.event, staticSvg);
  const bound = f.service.documentChanged(f.event, token, randomUUID(), opened.candidate); assert.equal(bound.status, 'bound'); assert.equal(bound.directory.file.name, 'new-model.svg');
  choose({ canceled: false, filePath: target }); assert.equal((await exporting).code, 'FILE_OWNED');
  assert.deepEqual(await fs.readFile(target), Buffer.from(f.opened.bytes)); assert.deepEqual(await fs.readFile(f.target), Buffer.from(f.opened.bytes));
});

async function modelFileAliases(t, aliasFor) {
  const f = await boundModelFile(t), bytes = await fs.readFile(f.target);
  const alias = await aliasFor(f.target); f.saveAt(alias);
  for (const operation of [() => f.service.saveSvg(f.event, staticSvg), () => f.service.saveMermaid(f.event, 'flowchart LR')]) assert.equal((await operation()).code, 'FILE_OWNED');
  assert.deepEqual(await fs.readFile(f.target), bytes); assert.equal(f.session.dirty, true); assert.deepEqual(f.model.store.history, { undo: 1, redo: 1 });
}

test('a document change while the picker is open cannot remove protection from its captured native root', async t => {
  const f = await fixture(t), before = f.opened.snapshot.files;
  let choose;
  f.picker(() => new Promise(resolve => { choose = resolve; }));
  const exporting = f.service.saveProject(f.event, f.opened.bytes);
  assert.equal(typeof choose, 'function'); assert.equal(f.service.busy, true);
  assert.equal(f.service.documentChanged(f.event, f.session.documentToken, randomUUID()).status, 'detached');
  choose({ canceled: false, filePath: path.join(f.root, 'schemka.json') });
  assert.equal((await exporting).code, 'DIRECTORY_OWNED');
  await unchanged(f, before);
});

test('Windows extended-path aliases cannot overwrite native records', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), before = f.opened.snapshot.files;
  const targets = ['schemka.json', before.find(file => file.path.startsWith('model/elements/')).path];
  const captured = f.session.prepareSave().bytes;
  const state = f.model.store.snapshot, history = f.model.store.history, revision = f.model.store.revision;
  for (const relative of targets) {
    const ordinary = path.join(f.root, relative), alias = path.toNamespacedPath(ordinary);
    assert.notEqual(alias, ordinary);
    const normalStat = await fs.lstat(ordinary, { bigint: true }), aliasStat = await fs.lstat(alias, { bigint: true });
    assert.equal(aliasStat.dev, normalStat.dev); assert.equal(aliasStat.ino, normalStat.ino);
    t.diagnostic(JSON.stringify({ relative, alias: 'extended-path', canonicalMatches: await fs.realpath(alias) === await fs.realpath(ordinary), sameFile: true }));
    f.saveAt(alias);
    for (const action of [() => f.service.saveProject(f.event, captured), () => f.service.saveMermaid(f.event, 'flowchart LR\nA-->B'), () => f.service.saveSvg(f.event, staticSvg, 'Synthetic view')]) {
      const result = await action();
      t.diagnostic(JSON.stringify({ relative, status: result.status, code: result.code }));
      assert.equal(result.status, 'error', relative);
      await unchanged(f, before);
    }
  }
  assert.deepEqual(f.model.store.snapshot, state); assert.deepEqual(f.model.store.history, history); assert.equal(f.model.store.revision, revision);
  assert.equal(f.session.dirty, false); assert.equal(f.actions.directoryMismatch, false);
  await modelFileAliases(t, target => path.toNamespacedPath(target));
});

async function windowsShortPath(target) {
  const script = `Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;
public static class SchemkaShortPath {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern uint GetShortPathName(string source, StringBuilder target, uint size);
}
'@;
$buffer=New-Object System.Text.StringBuilder 32768;
$length=[SchemkaShortPath]::GetShortPathName($env:SCHEMKA_ALIAS_TEST_PATH,$buffer,[uint32]$buffer.Capacity);
if ($length -eq 0) { throw 'GetShortPathNameW failed' }; [Console]::Write($buffer.ToString());`;
  const result = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { env: { ...process.env, SCHEMKA_ALIAS_TEST_PATH: target }, windowsHide: true });
  return result.stdout;
}

async function quarantinedCurrentFile(t, shortAlias = false) {
  const f = await fixture(t), before = f.opened.snapshot.files, target = path.join(f.root, 'notes', 'copy.arkita');
  await fs.mkdir(path.dirname(target)); await fs.writeFile(target, f.opened.bytes);
  const selected = shortAlias ? await windowsShortPath(target) : target;
  if (shortAlias && selected.toLowerCase() === target.toLowerCase()) return t.skip('The file has no distinct 8.3 alias');
  assert.equal(await fs.realpath(selected), await fs.realpath(target));
  const marker = path.join(f.root, '.schemka-recovery.json'); await fs.writeFile(marker, 'malformed recovery marker');
  f.openAt(f.root);
  const interrupted = await f.service.openDirectory(f.event, f.session.documentToken);
  assert.equal(interrupted.code, 'DIRECTORY_INCOMPLETE'); assert.equal(interrupted.directory.issues[0].status, 'recovery-required');
  const previousToken = f.session.documentToken;
  f.openAt(selected); await f.$('file-button').event('click'); await f.$('desktop-open-project').event('click'); await f.$('load-project').event('click');
  const ack = f.replies.at(-1);
  assert.notEqual(f.session.documentToken, previousToken); assert.equal(ack.method, 'documentChanged');
  assert.equal(ack.result.status, 'bound'); assert.equal(ack.result.directory.binding, null); assert.equal(ack.result.directory.issues.length, 1);
  f.model.execute({ type: 'renameProject', name: 'Quarantined edit one' });
  f.model.execute({ type: 'renameProject', name: 'Quarantined edit two' }); f.model.undo();
  const state = f.model.store.snapshot, history = f.model.store.history, revision = f.model.store.revision;
  f.picker(() => { throw Error('Normal Save must not reopen a picker'); }); await f.actions.save();
  const rejected = f.replies.at(-1);
  assert.equal(rejected.method, 'saveCurrentProject'); assert.equal(rejected.args[1], f.session.documentToken);
  assert.equal(rejected.result.status, 'error'); assert.equal(rejected.result.code, 'DIRECTORY_QUARANTINED');
  assert.equal(f.session.dirty, true); assert.equal(f.actions.directoryWarning, true);
  assert.deepEqual(f.model.store.snapshot, state); assert.deepEqual(f.model.store.history, history); assert.equal(f.model.store.revision, revision);
  assert.deepEqual(await fs.readFile(target), Buffer.from(f.opened.bytes));
  const rescue = path.join(f.parent, 'rescued.arkita');
  f.picker(async () => ({ canceled: false, filePath: rescue })); await f.$('save-project').event('click');
  assert.equal(f.replies.at(-1).result.status, 'bound'); assert.equal(f.replies.at(-1).result.directory.file.name, 'rescued.arkita');
  assert.equal(f.session.dirty, false); assert.equal(f.actions.directoryWarning, true);
  f.picker(() => { throw Error('Normal Save must not reopen a picker'); });
  f.model.execute({ type: 'renameProject', name: 'Rescued edit' }); await f.actions.save();
  assert.equal(f.replies.at(-1).method, 'saveCurrentProject'); assert.equal(f.replies.at(-1).result.status, 'saved');
  assert.equal(f.session.dirty, false); assert.deepEqual(await fs.readFile(rescue), Buffer.from(f.session.prepareSave().bytes));
  assert.deepEqual(await fs.readFile(target), Buffer.from(f.opened.bytes));
  for (const file of before) assert.deepEqual(await fs.readFile(path.join(f.root, file.path)), Buffer.from(file.content), file.path);
  assert.equal(await fs.readFile(marker, 'utf8'), 'malformed recovery marker');
  assert.equal(f.service.busy, false); assert.deepEqual(f.errors, []);
}

test('normal Save refuses a file under a quarantined native root, preserving edits and allowing an outside rescue', async t => {
  await quarantinedCurrentFile(t);
});

test('normal Save through an available Windows 8.3 alias cannot bypass native-root quarantine', { skip: process.platform !== 'win32' }, async t => {
  await quarantinedCurrentFile(t, true);
});

test('Windows available 8.3 aliases cannot overwrite native records', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), before = f.opened.snapshot.files;
  const shortRoot = await windowsShortPath(f.root);
  if (shortRoot.toLowerCase() === f.root.toLowerCase()) return t.skip('The fixture has no distinct 8.3 root alias');
  const targets = ['schemka.json', before.find(file => file.path.startsWith('model/elements/')).path];
  const state = f.model.store.snapshot, history = f.model.store.history, revision = f.model.store.revision;
  for (const relative of targets) {
    const ordinary = path.join(f.root, relative), fullAlias = await windowsShortPath(ordinary);
    t.diagnostic(JSON.stringify({ relative, fullShortBasename: path.basename(fullAlias), basenameAliasAvailable: path.basename(fullAlias) !== path.basename(ordinary) }));
    for (const target of new Set([path.join(shortRoot, relative), fullAlias])) {
      const normalStat = await fs.lstat(ordinary, { bigint: true }), aliasStat = await fs.lstat(target, { bigint: true });
      assert.equal(aliasStat.dev, normalStat.dev); assert.equal(aliasStat.ino, normalStat.ino);
      assert.equal(await fs.realpath(target), await fs.realpath(ordinary));
      f.saveAt(target);
      for (const action of [() => f.service.saveProject(f.event, f.opened.bytes), () => f.service.saveMermaid(f.event, 'flowchart LR\nA-->B'), () => f.service.saveSvg(f.event, staticSvg, 'Synthetic view')]) {
        const result = await action();
        assert.equal(result.status, 'error', relative); assert.equal(result.code, 'DIRECTORY_OWNED', relative);
        await unchanged(f, before);
      }
    }
  }
  f.saveAt(path.join(shortRoot, 'model', 'elements', 'el-invalid.mmd'));
  assert.equal((await f.service.saveProject(f.event, f.opened.bytes)).code, 'DIRECTORY_OWNED');
  assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR')).code, 'DIRECTORY_OWNED');
  assert.equal((await f.service.saveSvg(f.event, staticSvg)).code, 'DIRECTORY_OWNED');
  const ordinaryCopy = path.join(f.root, 'copy.schemka.json'); f.saveAt(path.join(shortRoot, 'copy.schemka.json'));
  assert.equal((await f.service.saveProject(f.event, f.opened.bytes)).status, 'saved');
  assert.deepEqual(await fs.readFile(ordinaryCopy), Buffer.from(f.opened.bytes));
  assert.deepEqual(f.model.store.snapshot, state); assert.deepEqual(f.model.store.history, history); assert.equal(f.model.store.revision, revision);
  assert.equal(f.session.dirty, false); assert.equal(f.actions.directoryMismatch, false);
  await unchanged(f, before);

  f.model.execute({ type: 'renameProject', name: 'Unsaved alias one' });
  f.model.execute({ type: 'renameProject', name: 'Unsaved alias two' }); f.model.undo();
  const dirtyState = f.model.store.snapshot, dirtyHistory = f.model.store.history, dirtyRevision = f.model.store.revision;
  f.saveAt(path.join(shortRoot, 'schemka.json')); await f.$('save-project').event('click');
  assert.equal(f.replies.at(-1).result.code, 'DIRECTORY_OWNED');
  assert.equal(f.session.dirty, true); assert.equal(f.actions.directoryMismatch, true);
  assert.deepEqual(f.model.store.snapshot, dirtyState); assert.deepEqual(f.model.store.history, dirtyHistory); assert.equal(f.model.store.revision, dirtyRevision);
  await unchanged(f, before);
  await modelFileAliases(t, windowsShortPath);
});

test('a native root opened through its Windows 8.3 alias still protects ordinary-path exports', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), before = f.opened.snapshot.files, shortRoot = await windowsShortPath(f.root);
  if (shortRoot.toLowerCase() === f.root.toLowerCase()) return t.skip('The fixture has no distinct 8.3 root alias');
  f.openAt(shortRoot);
  const opened = await f.service.openDirectory(f.event, f.session.documentToken);
  assert.equal(opened.status, 'opened');
  const bound = f.service.documentChanged(f.event, f.session.documentToken, randomUUID(), opened.candidate);
  assert.equal(bound.status, 'bound');
  for (const relative of ['schemka.json', before.find(file => file.path.startsWith('model/elements/')).path]) {
    f.saveAt(path.join(f.root, relative));
    assert.equal((await f.service.saveProject(f.event, f.opened.bytes)).code, 'DIRECTORY_OWNED');
    assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR')).code, 'DIRECTORY_OWNED');
    assert.equal((await f.service.saveSvg(f.event, staticSvg)).code, 'DIRECTORY_OWNED');
  }
  await unchanged(f, before);
});

test('a removed native root does not block rescue exports to a separate directory', async t => {
  const f = await fixture(t);
  await fs.rm(f.root, { recursive: true });
  const target = path.join(f.parent, 'rescued.schemka.json'); f.saveAt(target);
  assert.equal((await f.service.saveProject(f.event, f.opened.bytes)).status, 'saved');
  assert.deepEqual(await fs.readFile(target), Buffer.from(f.opened.bytes));
  const mermaid = path.join(f.parent, 'rescued.mmd'); f.saveAt(mermaid);
  assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR\nA-->B')).status, 'saved');
  assert.equal(await fs.readFile(mermaid, 'utf8'), 'flowchart LR\nA-->B');
  const svg = path.join(f.parent, 'rescued.svg'); f.saveAt(svg);
  assert.equal((await f.service.saveSvg(f.event, staticSvg)).status, 'saved'); assert.equal(await fs.readFile(svg, 'utf8'), staticSvg);
});

test('Windows 8.3 aliases cannot overwrite an interrupted transaction journal', { skip: process.platform !== 'win32' }, async t => {
  let injected = 0;
  const f = await fixture(t, { updateDirectory: (snapshot, bytes) => updateNativeDirectory(snapshot, bytes,
    { ...fs, rename: async () => { injected++; throw Object.assign(Error('injected interruption'), { code: 'EIO' }); } }) });
  f.model.execute({ type: 'renameProject', name: 'Interrupted journal candidate' });
  const failed = await f.service.saveBoundDirectory(f.event, f.session.prepareSave().bytes, f.session.documentToken);
  assert.equal(injected, 1); assert.equal(failed.status, 'error'); assert.equal(failed.code, 'EIO'); assert.equal(failed.directory.issues[0].status, 'recovery-required');
  const transaction = path.join(f.parent, (await fs.readdir(f.parent)).find(name => name.startsWith('.schemka-transaction-')));
  async function capture(root, relative = '') {
    const files = [];
    for (const item of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = path.join(relative, item.name);
      if (item.isDirectory()) files.push(...await capture(root, name));
      else files.push({ name, bytes: await fs.readFile(path.join(root, name)) });
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }
  const journalBefore = await capture(transaction), rootBefore = await capture(f.root);
  const protectedFile = path.join(transaction, 'before', (await fs.readdir(path.join(transaction, 'before'))).find(name => name.endsWith('.json')));
  const shortFile = await windowsShortPath(protectedFile);
  if (shortFile.toLowerCase() === protectedFile.toLowerCase()) return t.skip('The journal file has no distinct 8.3 alias');
  const normalStat = await fs.lstat(protectedFile, { bigint: true }), aliasStat = await fs.lstat(shortFile, { bigint: true });
  assert.equal(aliasStat.dev, normalStat.dev); assert.equal(aliasStat.ino, normalStat.ino);
  assert.equal(await fs.realpath(shortFile), await fs.realpath(protectedFile));
  f.saveAt(shortFile);
  for (const action of [() => f.service.saveProject(f.event, f.opened.bytes), () => f.service.saveMermaid(f.event, 'flowchart LR\nA-->B'), () => f.service.saveSvg(f.event, staticSvg, 'Synthetic view')]) {
    const result = await action();
    assert.equal(result.status, 'error'); assert.ok(['DIRECTORY_RESERVED', 'DIRECTORY_QUARANTINED'].includes(result.code), result.code);
    assert.deepEqual(await capture(transaction), journalBefore); assert.deepEqual(await capture(f.root), rootBefore);
  }
  const recovered = await f.service.recoverDirectory(f.event, failed.directory.issues[0].id, 'before');
  assert.equal(recovered.status, 'recovered');
  const reopened = await readNativeDirectory(f.root);
  assert.deepEqual(reopened.bytes, f.opened.bytes); assert.deepEqual(reopened.snapshot.files, f.opened.snapshot.files);
});
