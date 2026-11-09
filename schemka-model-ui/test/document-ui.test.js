import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installDocumentUI } from '../src/document-ui.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createProjectSession } from '../src/project-session.js';
const settings = { recentLimit: 10, backupEnabled: true, backupLimit: 5, openViews: 'first', autoViewLimit: 5 };
const result = () => ({ status: 'ok', settings: { ...settings }, recent: [], backups: [
  { id: 'one', sourcePath: 'C:\\Models\\Дом.arkita', created: 1760000000000 },
  { id: 'two', sourcePath: 'C:\\Models\\Офис', created: 1760000001000 },
] });
function fixture(t, native = {}) {
  const dom = new JSDOM('<body><dialog id="file-dialog"></dialog></body>', { url: 'https://arkita.test' }); t.after(() => dom.window.close());
  const { window } = dom, { document } = window; window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const statuses = [], calls = [], store = createStore(createProject('Unsaved')), session = createProjectSession(store);
  store.execute({ type: 'renameProject', name: 'Dirty' }, store.revision); store.execute({ type: 'renameProject', name: 'Redo' }, store.revision); store.undo(store.revision);
  window.schemkaDesktop = { documentPreferences: async () => result(), recoverBackup: async (...args) => { calls.push(args); return { status: 'saved', name: 'restored.arkita' }; }, setDocumentPreferences: async value => ({ ...result(), settings: value }), ...native };
  installDocumentUI({ document, window, session, status: text => statuses.push(text), openDialog: id => document.getElementById(id).showModal() });
  return { document, window, session, store, calls, statuses, $: id => document.getElementById(id), settle: async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); } };
}

test('backup entry opens searchable snapshots and restores through opaque ID without changing the dirty model', async t => {
  const h = fixture(t), before = { files: h.store.exportFiles(), history: h.store.history, token: h.session.documentToken, dirty: h.session.dirty };
  h.$('document-backups-button').click(); await h.settle(); assert.equal(h.document.activeElement.id, 'document-backup-search'); assert.equal(h.document.querySelector('[name="backupEnabled"]').checked, true);
  const search = h.$('document-backup-search'); search.value = 'дом'; search.dispatchEvent(new h.window.Event('input'));
  assert.equal(h.document.querySelector('[data-backups]').querySelectorAll('button').length, 1); assert.match(h.document.querySelector('[data-backups]').textContent, /Дом\.arkita/);
  h.document.querySelector('[data-backups] button').click(); await h.settle(); assert.deepEqual(h.calls, [['one', before.token]]); assert.match(h.statuses.at(-1), /новый файл: restored\.arkita/);
  assert.deepEqual({ files: h.store.exportFiles(), history: h.store.history, token: h.session.documentToken, dirty: h.session.dirty }, before);
  search.value = 'missing'; search.dispatchEvent(new h.window.Event('input')); assert.match(h.document.querySelector('[data-backups]').textContent, /Копии не найдены/);
});

test('cancelled, missing and failed backup recovery never claim success or alter the document', async t => {
  for (const response of [{ status: 'cancelled' }, { status: 'error', code: 'BACKUP_MISSING', message: 'Копия отсутствует' }, { status: 'error', code: 'FILE_EXISTS', message: 'Выберите новое имя' }]) {
    const h = fixture(t, { recoverBackup: async () => response }), files = h.store.exportFiles(), history = h.store.history, token = h.session.documentToken;
    h.$('document-backups-button').click(); await h.settle(); h.document.querySelector('[data-backups] button').click(); await h.settle(); assert.doesNotMatch(h.statuses.at(-1), /Копия сохранена/);
    assert.match(h.statuses.at(-1), response.status === 'cancelled' ? /отменено/ : new RegExp(response.message)); assert.deepEqual(h.store.exportFiles(), files); assert.deepEqual(h.store.history, history); assert.equal(h.session.documentToken, token);
  }
});

test('pending native restore blocks duplicate requests and Escape until native cancellation completes', async t => {
  let finish, calls = 0; const pending = new Promise(resolve => { finish = resolve; }), h = fixture(t, { recoverBackup: () => { calls++; return pending; } });
  h.$('document-backups-button').click(); await h.settle(); const button = h.document.querySelector('[data-backups] button'); button.click(); button.click(); assert.equal(calls, 1); assert.equal(h.$('document-backup-search').disabled, true);
  const escape = new h.window.Event('cancel', { cancelable: true }); h.$('document-settings-dialog').dispatchEvent(escape); assert.equal(escape.defaultPrevented, true); assert.equal(h.$('document-settings-dialog').open, true);
  finish({ status: 'cancelled' }); await h.settle(); assert.equal(button.disabled, false); assert.equal(h.$('document-backup-search').disabled, false); assert.match(h.statuses.at(-1), /отменено/);
});

test('empty backup list explains when copies are created and retained opt-out stays visible', async t => {
  const h = fixture(t, { documentPreferences: async () => ({ ...result(), backups: [], settings: { ...settings, backupEnabled: false } }) }); h.$('document-settings-button').click(); await h.settle();
  assert.equal(h.document.querySelector('[name="backupEnabled"]').checked, false); assert.match(h.document.querySelector('[data-backups]').textContent, /Резервных копий пока нет/); assert.equal(h.document.querySelector('[data-backups] button'), null);
});
