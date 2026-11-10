import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { paletteSnapshot, createPaletteService, visiblePaletteBounds, PALETTE_URL } from '../palette-service.mjs';
const owner = () => ({ window: { isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }), webContents: { send() {} }, focus() {} }, files: { documentToken: randomUUID(), busy: false }, git: { busy: false } });
const snapshot = record => ({ documentToken: record.files.documentToken, revision: 7, viewId: 'view-' + randomUUID(), theme: 'dark', types: [{ kind: 'element', type: 'ApplicationComponent', label: '<script>typed</script>', description: 'plain text', enabled: true }] });
test('palette validates closed DTO/catalog and deduplicated inert icons; monitor recovery clamps to visible work area', () => {
  const state = snapshot(owner()); assert.equal(paletteSnapshot(state).types[0].label, '<script>typed</script>');
  for (const bad of [{ ...state, arbitraryPath: '/etc/passwd' }, { ...state, types: [{ ...state.types[0], type: 'exec' }] }, { ...state, types: [{ ...state.types[0], iconId: 'ast-' + randomUUID() }] }]) assert.throws(() => paletteSnapshot(bad));
  for (const type of ['palette-next', 'palette-previous']) assert.equal(paletteSnapshot({ ...state, types: [{ ...state.types[0], kind: 'tool', type }] }).types[0].type, type);
  const icon = { id: 'ast-' + randomUUID(), mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1kAAAAASUVORK5CYII=' };
  assert.equal(paletteSnapshot({ ...state, icons: [icon], types: [{ ...state.types[0], iconId: icon.id }] }).icons.length, 1); assert.throws(() => paletteSnapshot({ ...state, icons: [icon, icon] }));
  const area = { x: -1280, y: 0, width: 1280, height: 720 }, bounds = visiblePaletteBounds({ x: 9000, y: 9000, width: 300, height: 700 }, [{ workArea: area }]); assert.ok(bounds.x >= area.x && bounds.x + bounds.width <= 0); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 720);
});
test('native detached palette has only its own sender route, same-owner nonce drop, stale rejection, one window and native dock notification', async () => {
  const windows = [], ownerA = owner(), ownerB = owner(), delivered = [], docked = []; ownerA.window.webContents.send = (...args) => { if (args[0].endsWith('command')) delivered.push(args); else docked.push(args); };
  const screen = new EventEmitter(); screen.getAllDisplays = () => [{ workArea: { x: 0, y: 0, width: 1200, height: 800 } }];
  class Window extends EventEmitter {
    constructor(options) { super(); this.bounds = options; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: PALETTE_URL }; this.webContents.send = () => {}; this.webContents.setWindowOpenHandler = fn => assert.equal(fn().action, 'deny'); assert.equal(options.webPreferences.preload, path.join('/app', 'electron', 'preload-palette.cjs')); assert.equal(options.webPreferences.sandbox, true); windows.push(this); }
    async loadURL(url) { assert.equal(url, PALETTE_URL); } isDestroyed() { return Boolean(this.dead); } getBounds() { return { x: 0, y: 0, width: 300, height: 650 }; } setBounds(value) { this.bounds = value; } show() {} focus() {}
    close() { this.emit('close'); this.dead = true; this.emit('closed'); } destroy() { this.dead = true; this.emit('closed'); }
  }
  const service = createPaletteService({ BrowserWindow: Window, screen, root: '/app', session: {}, loadBounds: async () => null }), state = snapshot(ownerA);
  await Promise.all([service.open(ownerA, state), service.open(ownerA, state)]); assert.equal(windows.length, 1);
  const child = windows[0], event = { sender: child.webContents, senderFrame: child.webContents.mainFrame }, ready = service.ready(event), data = { nonce: ready.nonce, index: 0 };
  assert.throws(() => service.ready({ ...event, senderFrame: { url: PALETTE_URL } }), { code: 'IPC_SENDER' }); assert.throws(() => service.activate({ sender: {} }, data), { code: 'IPC_SENDER' });
  service.activate(event, data); assert.equal(delivered.length, 1); assert.equal(service.resolveDrop(ownerA, data).revision, 7); assert.throws(() => service.resolveDrop(ownerB, data), { code: 'PALETTE_STALE' });
  service.publish(ownerA, { ...state, revision: 8 }); assert.throws(() => service.activate(event, data), { code: 'PALETTE_STALE' }); const fresh = service.ready(event); ownerA.files.busy = true; assert.throws(() => service.activate(event, { nonce: fresh.nonce, index: 0 }), { code: 'DOCUMENT_STALE' }); ownerA.files.busy = false;
  screen.emit('display-removed'); assert.ok(child.bounds.x + child.bounds.width <= 1200); service.childDock(event); assert.equal(docked.length, 1); assert.throws(() => service.ready(event), { code: 'IPC_SENDER' });
});
