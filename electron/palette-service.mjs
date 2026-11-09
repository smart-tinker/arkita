import path from 'node:path';
import { visibleWindowBounds } from './window-bounds.mjs';
import { randomUUID } from 'node:crypto';
import { validateAsset } from '../schemka-model-core/src/native-v4.js';
import { CURRENT_CATALOG } from '../schemka-model-core/src/index.js';
export const PALETTE_URL = 'schemka://app/schemka-model-ui/palette.html';
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const id = (value, prefix = '') => typeof value === 'string' && new RegExp(`^${prefix}${uuid}$`).test(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
export function paletteSnapshot(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['documentToken', 'revision', 'viewId', 'theme', 'types', 'icons'].includes(key)) || !id(input.documentToken) || !Number.isSafeInteger(input.revision) || input.revision < 0 || input.viewId !== null && !id(input.viewId, 'view-') || !['dark', 'light'].includes(input.theme) || !Array.isArray(input.types) || input.types.length > 512) fail('PALETTE_STATE', 'Некорректное состояние палитры.');
  const icons = input.icons || []; let total = 0, pixels = 0; const iconIds = new Set();
  if (!Array.isArray(icons) || icons.length > 512) fail('PALETTE_ASSETS', 'Слишком много значков палитры.');
  for (const icon of icons) {
    if (!icon || Object.keys(icon).some(key => !['id', 'mediaType', 'data'].includes(key)) || !id(icon.id, 'ast-') || iconIds.has(icon.id) || typeof icon.data !== 'string') fail('PALETTE_ASSETS', 'Некорректный значок палитры.');
    total += Buffer.byteLength(icon.data); if (total > 8 * 1024 * 1024) fail('PALETTE_ASSETS', 'Значки палитры больше 8 MiB.');
    const size = validateAsset({ ...icon, name: '', encoding: 'base64' }); pixels += size.width * size.height; if (pixels > 64 * 1024 * 1024) fail('PALETTE_ASSETS', 'Значки палитры превышают бюджет изображения.'); iconIds.add(icon.id);
  }
  const types = input.types.map(item => {
    if (!item || Object.keys(item).some(key => !['kind', 'type', 'label', 'description', 'enabled', 'active', 'profileId', 'category', 'iconId'].includes(key)) || !text(item.label, 200) || !text(item.description, 2000) || typeof item.enabled !== 'boolean' || item.active !== undefined && typeof item.active !== 'boolean' || item.category !== undefined && !text(item.category, 80) || item.profileId !== undefined && !id(item.profileId, 'prf-')) fail('PALETTE_TYPE', 'Некорректный инструмент палитры.');
    if (item.iconId !== undefined && !iconIds.has(item.iconId)) fail('PALETTE_ASSETS', 'Значок инструмента отсутствует.');
    const allowed = item.kind === 'tool' ? ['smart-link', 'visual-connector', 'palette-next', 'palette-previous'] : item.kind === 'visualNode' ? ['note', 'group', 'legend', 'viewReference', 'image'] : ['element', 'junction', 'relationship'].includes(item.kind) ? CURRENT_CATALOG[`${item.kind}Types`] : [];
    if (!allowed?.includes(item.type)) fail('PALETTE_TYPE', 'Неизвестный инструмент палитры.');
    return { ...item };
  });
  return { documentToken: input.documentToken, revision: input.revision, viewId: input.viewId, theme: input.theme, types, icons: icons.map(icon => ({ ...icon })) };
}
export const visiblePaletteBounds = (bounds, displays) => visibleWindowBounds(bounds, displays, { width: 300, height: 650, minWidth: 240, minHeight: 280, maxWidth: 800, maxHeight: 1600 });
export function createPaletteService({ BrowserWindow, screen, session, root, loadBounds = async () => null, saveBounds = async () => {} }) {
  const owners = new Map(), opening = new Map(); let lastBounds = null;
  const sender = (event, state) => !state.window.isDestroyed() && event.sender === state.window.webContents && event.senderFrame === state.window.webContents.mainFrame && event.senderFrame?.url === PALETTE_URL;
  function child(event) { return [...owners.values()].find(state => sender(event, state)); }
  function update(record, input) {
    const snapshot = paletteSnapshot(input); if (record.window.isDestroyed() || record.files.documentToken !== snapshot.documentToken) fail('DOCUMENT_STALE', 'Модель палитры уже изменилась.');
    const state = owners.get(record); if (!state) return { status: 'docked' };
    const signature = JSON.stringify(snapshot);
    if (state.signature !== signature) { state.signature = signature; state.snapshot = { ...snapshot, nonce: randomUUID() }; state.window.webContents.send('schemka:palette-state', state.snapshot); }
    return { status: 'ok', nonce: state.snapshot.nonce };
  }
  function command(state, data) {
    if (!state || !data || Object.keys(data).some(key => !['nonce', 'index'].includes(key)) || data.nonce !== state.snapshot?.nonce || !Number.isInteger(data.index) || data.index < 0 || !state.snapshot.types[data.index]?.enabled) fail('PALETTE_STALE', 'Инструмент палитры больше не актуален.');
    const record = state.owner, snapshot = state.snapshot;
    if (record.window.isDestroyed() || record.files.documentToken !== snapshot.documentToken || record.files.busy || record.git.busy || record.openBusy) fail('DOCUMENT_STALE', 'Завершите текущую операцию модели.');
    const item = snapshot.types[data.index]; return { kind: item.kind, type: item.type, ...(item.profileId ? { profileId: item.profileId } : {}), documentToken: snapshot.documentToken, revision: snapshot.revision, viewId: snapshot.viewId };
  }
  function dock(record) { const state = owners.get(record); if (state && !state.window.isDestroyed()) state.window.close(); return { status: 'docked' }; }
  screen.on('display-removed', () => { for (const state of owners.values()) if (!state.window.isDestroyed()) state.window.setBounds(visiblePaletteBounds(state.window.getBounds(), screen.getAllDisplays())); });
  async function openWindow(record, snapshot) {
      paletteSnapshot(snapshot); if (record.files.documentToken !== snapshot.documentToken || record.files.busy || record.git.busy || record.openBusy) fail('DOCUMENT_STALE', 'Завершите текущую операцию модели.');
      if (owners.has(record)) { update(record, snapshot); owners.get(record).window.show(); owners.get(record).window.focus(); return { status: 'detached' }; }
      let saved; try { saved = await loadBounds(); } catch { /* Missing bounds use the current monitor. */ }
      if (record.window.isDestroyed() || record.files.documentToken !== snapshot.documentToken) fail('DOCUMENT_STALE', 'Окно модели закрыто.');
      const window = new BrowserWindow({ ...visiblePaletteBounds(lastBounds || saved || record.window.getBounds(), screen.getAllDisplays()), minWidth: 240, minHeight: 280, title: 'Arkita — Палитра', parent: record.window,
        webPreferences: { session, preload: path.join(root, 'electron/preload-palette.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false } });
      const state = { owner: record, window, snapshot: null, signature: null }; owners.set(record, state);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) window.webContents.on(name, event => event.preventDefault());
      window.once('close', () => { lastBounds = window.getBounds(); void saveBounds(lastBounds).catch(() => {}); });
      window.once('closed', () => { if (owners.get(record) === state) owners.delete(record); if (!record.window.isDestroyed()) record.window.webContents.send('schemka:palette-docked'); });
      try { update(record, snapshot); await window.loadURL(PALETTE_URL); return { status: 'detached' }; } catch (error) { if (!window.isDestroyed()) window.destroy(); throw error; }
      }
  return {
    open(record, snapshot) { if (opening.has(record)) return opening.get(record); const task = openWindow(record, snapshot).finally(() => opening.delete(record)); opening.set(record, task); return task; },
    publish: update, dock,
    ready(event) { const state = child(event); if (!state) fail('IPC_SENDER', 'Недопустимое окно палитры.'); return { status: 'ok', ...state.snapshot }; },
    activate(event, data) { const state = child(event); if (!state) fail('IPC_SENDER', 'Недопустимое окно палитры.'); const item = command(state, data); state.owner.window.webContents.send('schemka:palette-command', item); state.owner.window.focus(); return { status: 'ok' }; },
    childDock(event) { const state = child(event); if (!state) fail('IPC_SENDER', 'Недопустимое окно палитры.'); return dock(state.owner); },
    resolveDrop(record, data) { return { status: 'ok', ...command(owners.get(record), data) }; },
    closed(record) { const state = owners.get(record); if (state && !state.window.isDestroyed()) state.window.destroy(); owners.delete(record); },
  };
}
