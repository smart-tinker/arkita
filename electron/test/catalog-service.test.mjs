import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { catalogSnapshot, createCatalogService, visibleCatalogBounds, CATALOG_URL } from '../catalog-service.mjs';

const id = prefix => `${prefix}-00000000-0000-4000-8000-000000000001`;
const owner = () => ({
  window: { isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }), webContents: { send() {} }, focus() {} },
  files: { documentToken: randomUUID(), busy: false }, git: { busy: false }, openBusy: false,
});
const snapshot = record => ({ documentToken: record.files.documentToken, revision: 4, viewId: id('view'), theme: 'light', projectName: 'Synthetic', entries: [
  { kind: 'section', id: 'common', parent: null, label: 'Общие', selected: false, active: false, uses: 0, drawings: 0, canAdd: false },
  { kind: 'element', id: id('el'), parent: 0, label: '<script>plain text</script>', type: 'ApplicationComponent', selected: true, active: false, uses: 1, drawings: 1, canAdd: true },
] });

test('catalog DTO rejects malformed hierarchy and keeps labels inert; detached bounds recover after monitor loss', () => {
  const state = snapshot(owner()); assert.equal(catalogSnapshot(state).entries[1].label, '<script>plain text</script>');
  assert.equal(catalogSnapshot(state).viewId, id('view'));
  assert.throws(() => catalogSnapshot({ ...state, viewId: 'invalid' }), { code: 'CATALOG_STATE' });
  assert.throws(() => catalogSnapshot({ ...state, path: '/tmp/model' }), { code: 'CATALOG_STATE' });
  assert.throws(() => catalogSnapshot({ ...state, entries: [{ ...state.entries[1], parent: 0 }] }), { code: 'CATALOG_ENTRY' });
  assert.throws(() => catalogSnapshot({ ...state, entries: [{ ...state.entries[0], id: '../outside' }] }), { code: 'CATALOG_ENTRY' });
  const area = { x: -1280, y: 0, width: 1280, height: 720 }, bounds = visibleCatalogBounds({ x: 9000, y: 9000, width: 360, height: 700 }, [{ workArea: area }]);
  assert.ok(bounds.x >= area.x && bounds.x + bounds.width <= 0); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 720);
});

test('catalog DTO rejects oversized unknown fields before encoding the raw IPC payload', () => {
  const state = snapshot(owner());
  state.entries[1].unexpected = 'x'.repeat(8 * 1024 * 1024);
  assert.throws(() => catalogSnapshot(state), { code: 'CATALOG_ENTRY' });
});

test('detached catalog accepts only its child sender and current owner snapshot; docking restores the owner', async () => {
  const windows = [], ownerA = owner(), ownerB = owner(), commands = [], docked = [];
  ownerA.window.webContents.send = (...args) => { if (args[0].endsWith('command')) commands.push(args); else docked.push(args); };
  const screen = new EventEmitter(); screen.getAllDisplays = () => [{ workArea: { x: 0, y: 0, width: 1200, height: 800 } }];
  class Window extends EventEmitter {
    constructor(options) { super(); this.bounds = options; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: CATALOG_URL }; this.webContents.send = () => {}; this.webContents.setWindowOpenHandler = fn => assert.equal(fn().action, 'deny'); assert.equal(options.webPreferences.preload, path.join('/app', 'electron', 'preload-catalog.cjs')); assert.equal(options.webPreferences.sandbox, true); windows.push(this); }
    async loadURL(url) { assert.equal(url, CATALOG_URL); } isDestroyed() { return Boolean(this.dead); } getBounds() { return { x: 0, y: 0, width: 360, height: 650 }; } getNormalBounds() { return this.getBounds(); } setBounds(value) { this.bounds = value; } show() {} focus() {}
    close() { this.emit('close'); this.dead = true; this.emit('closed'); } destroy() { this.dead = true; this.emit('closed'); }
  }
  const service = createCatalogService({ BrowserWindow: Window, screen, root: '/app', session: {} }), state = snapshot(ownerA);
  await Promise.all([service.open(ownerA, state), service.open(ownerA, state)]); assert.equal(windows.length, 1);
  const child = windows[0], event = { sender: child.webContents, senderFrame: child.webContents.mainFrame }, ready = service.ready(event), data = { nonce: ready.nonce, index: 1, action: 'select' };
  assert.throws(() => service.ready({ ...event, senderFrame: { url: CATALOG_URL } }), { code: 'IPC_SENDER' });
  assert.throws(() => service.activate({ sender: {} }, data), { code: 'IPC_SENDER' });
  service.activate(event, data); assert.deepEqual(commands[0][1], { kind: 'element', id: id('el'), action: 'select', documentToken: ownerA.files.documentToken, revision: 4, viewId: id('view') });
  assert.throws(() => service.activate(event, { ...data, action: 'add', index: 0 }), { code: 'CATALOG_STALE' });
  service.publish(ownerA, { ...state, revision: 5 }); assert.throws(() => service.activate(event, data), { code: 'CATALOG_STALE' });
  assert.throws(() => service.publish(ownerB, state), { code: 'DOCUMENT_STALE' });
  screen.emit('display-removed'); service.childDock(event); assert.equal(docked.length, 1); assert.throws(() => service.ready(event), { code: 'IPC_SENDER' });
});

test('detached catalog saves its bounds when the owner force-closes the child window', async () => {
  const record = owner(), saved = [];
  const screen = new EventEmitter(); screen.getAllDisplays = () => [{ workArea: { x: 0, y: 0, width: 1200, height: 800 } }];
  let child;
  class Window extends EventEmitter {
    constructor(options) { super(); child = this; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: CATALOG_URL }; this.webContents.send = () => {}; this.webContents.setWindowOpenHandler = () => {}; }
    async loadURL() {} isDestroyed() { return Boolean(this.dead); } getBounds() { return this.bounds; } getNormalBounds() { return this.getBounds(); } setBounds(value) { this.bounds = value; } show() {} focus() {}
    destroy() { this.dead = true; this.emit('closed'); }
  }
  const service = createCatalogService({ BrowserWindow: Window, screen, root: '/app', session: {}, loadBounds: async () => ({ x: 150, y: 120, width: 360, height: 650 }), saveBounds: async (bounds, kind) => saved.push({ bounds, kind }) });
  await service.open(record, snapshot(record));
  child.bounds = { x: 220, y: 180, width: 420, height: 700 }; child.emit('resize');
  service.closed(record);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, [{ bounds: { x: 220, y: 180, width: 420, height: 700 }, kind: 'catalog' }]);
});
