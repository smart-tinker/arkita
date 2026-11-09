import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as catalogModule from '../catalog.js';
import { SAMPLE_CATALOG } from '../sample-catalog.js';

const source = (await fs.readFile(new URL('../app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function boot(t) {
  const dom = new JSDOM(html, { url: 'https://catalog.test/catalog/', runScripts: 'outside-only' });
  const { window } = dom; const { document } = window;
  const downloads = []; const blobs = []; const revocations = [];
  window.structuredClone = structuredClone;
  window.confirm = () => true;
  window.URL.createObjectURL = blob => { blobs.push(blob); return `blob:https://catalog.test/${blobs.length}`; };
  window.URL.revokeObjectURL = url => revocations.push(url);
  const nativeClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({ name: this.download, href: this.href });
    else nativeClick.call(this);
  };
  const dependencies = { ...catalogModule, SAMPLE_CATALOG };
  window.Function(...Object.keys(dependencies), source)(...Object.values(dependencies));
  t.after(() => dom.window.close());
  return {
    window, document, downloads, blobs, revocations,
    async importText(text, name = 'neutral.json', size = new TextEncoder().encode(text).byteLength) {
      const input = document.getElementById('file-input');
      Object.defineProperty(input, 'files', { configurable: true, value: [{ name, size, text: () => Promise.resolve(text) }] });
      input.dispatchEvent(new window.Event('change')); await settle();
    },
    guard() { const event = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; },
    navigate() {
      const link = document.querySelector('a[data-mode-link="model"]');
      const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      // Prevent real navigation after observing the production capture-phase handler.
      let appPrevented;
      link.addEventListener('click', e => { appPrevented = e.defaultPrevented; e.preventDefault(); }, { once: true });
      link.dispatchEvent(event); return appPrevented ?? event.defaultPrevented;
    }
  };
}

test('production application boots, switches sections, expands requests and filters services', async t => {
  const app = boot(t); const { document, window } = app;
  assert.equal(document.querySelectorAll('.service-card').length, 2);
  assert.equal(document.querySelector('#detail h2').textContent, 'Документы и схемы');
  assert.equal(document.querySelectorAll('.request').length, 2);
  document.querySelector('.request summary').click();
  assert.equal(document.querySelector('.request').open, true);
  document.querySelector('[data-section="systems"]').click();
  assert.match(document.querySelector('.tab-content').textContent, /Учебный редактор/);
  document.querySelector('[data-section="bindings"]').click();
  assert.match(document.querySelector('.tab-content').textContent, /не сопоставлен/);
  const input = document.getElementById('search'); input.value = 'справка'; input.dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelectorAll('.service-card').length, 1);
  assert.equal(document.querySelector('#detail h2').textContent, 'Библиотека знаний');
  assert.equal(app.guard(), false);
});
test('imports safely render hostile strings and preserve unknown export fields', async t => {
  const app = boot(t); const data = structuredClone(SAMPLE_CATALOG);
  data.services[0].name = '<img src=x onerror=alert(1)>';
  data.services[0].knowledge.instruction_ref = 'javascript:alert(1)';
  data.extra_extension = { synthetic: true };
  await app.importText(JSON.stringify(data), '<script>example</script>.json');
  assert.equal(app.document.querySelector('#detail h2').textContent, data.services[0].name);
  assert.equal(app.document.querySelector('#detail img'), null);
  assert.equal(app.document.querySelector('.session script'), null);
  app.document.querySelector('[data-section="knowledge"]').click();
  assert.match(app.document.querySelector('.tab-content').textContent, /javascript:alert\(1\)/);
  assert.equal(app.document.querySelector('.tab-content a'), null);
  assert.equal(app.guard(), true);
  app.document.getElementById('export-button').click();
  assert.equal(app.downloads.length, 1);
  assert.equal(app.downloads[0].name, 'schemka-catalog.json');
  assert.match(app.document.getElementById('message').textContent, /Проверьте/);
  assert.equal(app.guard(), false);
});
test('invalid or oversized import preserves the current catalog and its dirty guard', async t => {
  const app = boot(t); const data = structuredClone(SAMPLE_CATALOG); data.services[0].name = 'Local example';
  await app.importText(JSON.stringify(data)); await app.importText('{broken');
  assert.equal(app.document.querySelector('#detail h2').textContent, 'Local example');
  assert.match(app.document.getElementById('message').textContent, /invalid JSON/);
  assert.equal(app.guard(), true);
  await app.importText('{}', 'oversize.json', catalogModule.MAX_FILE_BYTES + 1);
  assert.match(app.document.getElementById('message').textContent, /больше 2/);
  assert.equal(app.document.querySelector('#detail h2').textContent, 'Local example');
  assert.equal(app.guard(), true);
});
test('cancelled replacements and repeated blocked navigations retain dirty state', async t => {
  const app = boot(t); const data = structuredClone(SAMPLE_CATALOG); data.services[0].name = 'Keep this example';
  await app.importText(JSON.stringify(data)); app.window.confirm = () => false;
  app.document.getElementById('sample-button').click();
  assert.equal(app.document.querySelector('#detail h2').textContent, 'Keep this example');
  await app.importText(JSON.stringify(SAMPLE_CATALOG));
  assert.equal(app.document.querySelector('#detail h2').textContent, 'Keep this example');
  for (let i = 0; i < 3; i++) { app.navigate(); assert.equal(app.guard(), true); }
  app.window.confirm = () => true; app.document.getElementById('sample-button').click();
  assert.equal(app.guard(), false);
});
test('pending file reads block same-tab navigation and guard unload', async t => {
  const app = boot(t); let resolveRead;
  const input = app.document.getElementById('file-input');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'pending.json', size: 100, text: () => new Promise(resolve => { resolveRead = resolve; }) }] });
  input.dispatchEvent(new app.window.Event('change'));
  assert.equal(app.document.getElementById('import-button').disabled, true);
  assert.equal(app.navigate(), true);
  assert.equal(app.guard(), true);
  resolveRead(JSON.stringify(SAMPLE_CATALOG)); await settle();
  assert.equal(app.document.getElementById('import-button').disabled, false);
  assert.equal(app.guard(), true);
});
test('read failures restore controls and preserve the current catalog', async t => {
  const app = boot(t); const input = app.document.getElementById('file-input');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'failure.json', size: 100, text: () => Promise.reject(new Error('Read denied')) }] });
  input.dispatchEvent(new app.window.Event('change')); await settle();
  assert.match(app.document.getElementById('message').textContent, /Read denied/);
  assert.equal(app.document.getElementById('import-button').disabled, false);
  assert.equal(app.document.querySelectorAll('.service-card').length, 2);
  assert.equal(app.guard(), false);
});
test('export URL or anchor failures do not clear the dirty guard', async t => {
  const app = boot(t); await app.importText(JSON.stringify(SAMPLE_CATALOG));
  app.window.URL.createObjectURL = () => { throw new Error('URL failed'); };
  app.document.getElementById('export-button').click();
  assert.match(app.document.getElementById('message').textContent, /URL failed/);
  assert.equal(app.guard(), true);
  app.window.URL.createObjectURL = () => 'blob:https://catalog.test/failure';
  app.window.HTMLAnchorElement.prototype.click = () => { throw new Error('Download failed'); };
  app.document.getElementById('export-button').click();
  assert.match(app.document.getElementById('message').textContent, /Download failed/);
  assert.equal(app.document.querySelectorAll('a[download]').length, 0);
  assert.equal(app.guard(), true);
});
