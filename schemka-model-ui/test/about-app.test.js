import test from 'node:test';
import assert from 'node:assert/strict';
import { production, setup } from './app-test-fixture.js';

const mode = production ? 'production' : 'source';
const settle = () => new Promise(resolve => setImmediate(resolve));
const openAbout = h => h.document.querySelector('[data-command="about-button"]').click();
const closeAbout = h => h.$('about-dialog').querySelector('[data-close]').click();

test(`${mode} About menu uses one accessible modal and honestly identifies the browser preview without changing model or history`, async t => {
  const h = await setup(t), before = await h.download(), history = h.$('history-state').textContent;
  const button = h.document.querySelector('[data-command="about-button"]'), menu = button.closest('details');
  assert.equal(menu.querySelector('summary').textContent, 'Справка');
  menu.open = true; button.click();
  assert.equal(menu.open, false); assert.equal(h.$('about-dialog').open, true);
  assert.equal(h.$('about-dialog').getAttribute('aria-labelledby'), 'about-title');
  assert.equal(h.$('about-title').textContent, 'Об Arkita'); assert.equal(h.$('about-version').textContent, 'Браузерный просмотр');
  assert.deepEqual([...h.document.querySelectorAll('dialog[open]')].map(item => item.id), ['about-dialog']);
  assert.ok(h.$('about-dialog').querySelector('[data-close][autofocus]'));
  closeAbout(h); openAbout(h); closeAbout(h);
  assert.equal(h.$('history-state').textContent, history); assert.deepEqual(await h.download(), before);
});

test(`${mode} About observes the existing menu guard and leaves an inline draft and open editor intact`, async t => {
  const h = await setup(t);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Uncommitted name';
  const history = h.$('history-state').textContent; openAbout(h);
  assert.equal(h.$('about-dialog').open, false); assert.equal(input.isConnected, true); assert.equal(input.value, 'Uncommitted name');
  assert.equal(h.$('history-state').textContent, history);
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  h.$('create-service').click(); h.$('element-name').value = 'Uncommitted element'; openAbout(h);
  assert.equal(h.$('about-dialog').open, false); assert.equal(h.$('edit-dialog').open, true); assert.equal(h.$('element-name').value, 'Uncommitted element');
  h.$('edit-dialog').close(); openAbout(h); assert.equal(h.$('about-dialog').open, true); closeAbout(h);
});

test(`${mode} About displays the desktop-issued version as text and ignores a stale response after reopening`, async t => {
  const requests = [], h = await setup(t, { getAppInfo: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) });
  const history = h.$('history-state').textContent, dirty = h.$('file-state').dataset.dirty;
  openAbout(h); assert.equal(h.$('about-version').textContent, 'Версия приложения…'); closeAbout(h); openAbout(h);
  requests[1].resolve({ status: 'ok', version: '9.8.7-alpha.2 <img src=x>' }); await settle();
  assert.equal(h.$('about-version').textContent, 'Версия 9.8.7-alpha.2 <img src=x>'); assert.equal(h.$('about-dialog').querySelector('img'), null);
  requests[0].resolve({ status: 'ok', version: 'stale-version' }); await settle();
  assert.equal(h.$('about-version').textContent, 'Версия 9.8.7-alpha.2 <img src=x>');
  closeAbout(h); openAbout(h); requests[2].reject(Error('bridge unavailable')); await settle();
  assert.equal(h.$('about-version').textContent, 'Версия приложения недоступна');
  closeAbout(h); openAbout(h); requests[3].resolve({ status: 'ok', version: null }); await settle();
  assert.equal(h.$('about-version').textContent, 'Версия приложения недоступна'); closeAbout(h);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, dirty);
});
