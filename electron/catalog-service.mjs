import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { visibleWindowBounds } from './window-bounds.mjs';

export const CATALOG_URL = 'schemka://app/schemka-model-ui/catalog.html';
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const sectionIds = new Set(['common', 'strategy', 'business', 'application', 'technology', 'motivation', 'implementation', 'relationships', 'views']);
const prefixes = { folder: 'fld', element: 'el', junction: 'jct', relationship: 'rel', view: 'view' };
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const validId = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}-${uuid}$`).test(value);
const validUuid = value => typeof value === 'string' && new RegExp(`^${uuid}$`).test(value);

export function catalogSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['documentToken', 'revision', 'viewId', 'theme', 'projectName', 'entries'].includes(key)) ||
      !validUuid(input.documentToken) || input.viewId !== null && !validId(input.viewId, 'view') || !Number.isSafeInteger(input.revision) || input.revision < 0 || !['dark', 'light'].includes(input.theme) ||
      !text(input.projectName, 200) || !Array.isArray(input.entries) || input.entries.length > 65536) fail('CATALOG_STATE', 'Некорректное состояние дерева модели.');
  const snapshot = { documentToken: input.documentToken, revision: input.revision, viewId: input.viewId, theme: input.theme, projectName: input.projectName, entries: [] };
  let bytes = Buffer.byteLength(JSON.stringify(snapshot));
  for (let index = 0; index < input.entries.length; index++) {
    const item = input.entries[index];
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['kind', 'id', 'parent', 'label', 'type', 'selected', 'active', 'uses', 'drawings', 'canAdd'].includes(key)) ||
        !['section', 'folder', 'element', 'junction', 'relationship', 'view'].includes(item.kind) || !text(item.label, 8192) ||
        item.type !== undefined && !text(item.type, 100) || typeof item.selected !== 'boolean' || typeof item.active !== 'boolean' ||
        !Number.isSafeInteger(item.uses) || item.uses < 0 || !Number.isSafeInteger(item.drawings) || item.drawings < 0 || typeof item.canAdd !== 'boolean') fail('CATALOG_ENTRY', 'Некорректный элемент дерева модели.');
    if (item.kind === 'section' ? !sectionIds.has(item.id) || item.parent !== null : !validId(item.id, prefixes[item.kind]) || !Number.isInteger(item.parent) || item.parent < 0 || item.parent >= index || !['section', 'folder'].includes(snapshot.entries[item.parent]?.kind)) fail('CATALOG_ENTRY', 'Некорректная связь в дереве модели.');
    if (item.kind === 'section' && snapshot.entries.some(entry => entry.kind === 'section' && entry.id === item.id)) fail('CATALOG_ENTRY', 'Повтор раздела дерева.');
    if (item.canAdd && !['element', 'junction'].includes(item.kind)) fail('CATALOG_ENTRY', 'Для этого элемента нельзя добавить экземпляр.');
    const entry = { ...item };
    bytes += Buffer.byteLength(JSON.stringify(entry)) + Number(index > 0);
    if (bytes > 8 * 1024 * 1024) fail('CATALOG_STATE', 'Некорректное состояние дерева модели.');
    snapshot.entries.push(entry);
  }
  return snapshot;
}

export const visibleCatalogBounds = (bounds, displays) => visibleWindowBounds(bounds, displays, { width: 360, height: 650, minWidth: 280, minHeight: 320, maxWidth: 1000, maxHeight: 1600 });

export function createCatalogService({ BrowserWindow, screen, session, root, loadBounds = async () => null, saveBounds = async () => {} }) {
  const owners = new Map(), opening = new Map(); let lastBounds = null;
  const sender = (event, state) => !state.window.isDestroyed() && event.sender === state.window.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame?.url === CATALOG_URL;
  function child(event) { return [...owners.values()].find(state => sender(event, state)); }
  function update(record, input) {
    const snapshot = catalogSnapshot(input);
    if (record.window.isDestroyed() || record.files.documentToken !== snapshot.documentToken) fail('DOCUMENT_STALE', 'Модель дерева уже изменилась.');
    const state = owners.get(record); if (!state) return { status: 'docked' };
    const signature = JSON.stringify(snapshot);
    if (state.signature !== signature) { state.signature = signature; state.snapshot = { ...snapshot, nonce: randomUUID() }; state.window.webContents.send('schemka:catalog-state', state.snapshot); }
    return { status: 'ok', nonce: state.snapshot.nonce };
  }
  function command(state, data) {
    if (!state || !data || Object.keys(data).some(key => !['nonce', 'index', 'action'].includes(key)) || data.nonce !== state.snapshot?.nonce ||
        !Number.isInteger(data.index) || !['select', 'add'].includes(data.action)) fail('CATALOG_STALE', 'Команда дерева модели больше не актуальна.');
    const record = state.owner, snapshot = state.snapshot, item = snapshot.entries[data.index];
    if (!item || item.kind === 'section' || data.action === 'add' && !item.canAdd) fail('CATALOG_STALE', 'Элемент дерева больше не доступен.');
    if (record.window.isDestroyed() || record.files.documentToken !== snapshot.documentToken || record.files.busy || record.git.busy || record.openBusy) fail('DOCUMENT_STALE', 'Завершите текущую операцию модели.');
    if (!['element', 'junction', 'relationship', 'view'].includes(item.kind)) fail('CATALOG_STALE', 'Элемент дерева больше не доступен.');
    return { kind: item.kind, id: item.id, action: data.action, documentToken: snapshot.documentToken, revision: snapshot.revision, viewId: snapshot.viewId };
  }
  function dock(record) { const state = owners.get(record); if (state && !state.window.isDestroyed()) state.window.close(); return { status: 'docked' }; }
  for (const event of ['display-removed', 'display-metrics-changed']) screen.on(event, () => { for (const state of owners.values()) if (!state.window.isDestroyed()) state.window.setBounds(visibleCatalogBounds(state.window.getNormalBounds?.() ?? state.window.getBounds(), screen.getAllDisplays())); });
  async function openWindow(record, snapshot) {
    catalogSnapshot(snapshot);
    if (record.files.documentToken !== snapshot.documentToken || record.files.busy || record.git.busy || record.openBusy) fail('DOCUMENT_STALE', 'Завершите текущую операцию модели.');
    if (owners.has(record)) { update(record, snapshot); owners.get(record).window.show(); owners.get(record).window.focus(); return { status: 'detached' }; }
    let saved; try { saved = await loadBounds('catalog'); } catch { /* Missing bounds use the current monitor. */ }
    if (record.window.isDestroyed() || record.files.documentToken !== snapshot.documentToken) fail('DOCUMENT_STALE', 'Окно модели закрыто.');
    const window = new BrowserWindow({ ...visibleCatalogBounds(lastBounds || saved || record.window.getBounds(), screen.getAllDisplays()), minWidth: 280, minHeight: 320, title: 'Arkita — Дерево модели', parent: record.window,
      webPreferences: { session, preload: path.join(root, 'electron/preload-catalog.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false } });
    const state = { owner: record, window, snapshot: null, signature: null }; owners.set(record, state);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) window.webContents.on(name, event => event.preventDefault());
    window.once('close', () => { lastBounds = window.getBounds(); void saveBounds(lastBounds, 'catalog').catch(() => {}); });
    window.once('closed', () => { if (owners.get(record) === state) owners.delete(record); if (!record.window.isDestroyed()) record.window.webContents.send('schemka:catalog-docked'); });
    try { update(record, snapshot); await window.loadURL(CATALOG_URL); return { status: 'detached' }; } catch (error) { if (!window.isDestroyed()) window.destroy(); throw error; }
  }
  return {
    open(record, snapshot) { if (opening.has(record)) return opening.get(record); const task = openWindow(record, snapshot).finally(() => opening.delete(record)); opening.set(record, task); return task; },
    publish: update, dock,
    ready(event) { const state = child(event); if (!state) fail('IPC_SENDER', 'Недопустимое окно дерева модели.'); return { status: 'ok', ...state.snapshot }; },
    activate(event, data) { const state = child(event); if (!state) fail('IPC_SENDER', 'Недопустимое окно дерева модели.'); const item = command(state, data); state.owner.window.webContents.send('schemka:catalog-command', item); state.owner.window.focus(); return { status: 'ok' }; },
    childDock(event) { const state = child(event); if (!state) fail('IPC_SENDER', 'Недопустимое окно дерева модели.'); return dock(state.owner); },
    closed(record) { const state = owners.get(record); if (state && !state.window.isDestroyed()) state.window.destroy(); owners.delete(record); },
  };
}
