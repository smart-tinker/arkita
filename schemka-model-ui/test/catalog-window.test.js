import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { installCatalogWindow } from '../src/catalog-window.js';

const dto = {
  nonce: 'owner-snapshot', documentToken: '00000000-0000-4000-8000-000000000001', revision: 3, viewId: 'view-00000000-0000-4000-8000-000000000001', theme: 'dark', projectName: 'Synthetic',
  entries: [
    { kind: 'section', id: 'common', parent: null, label: 'Общие', selected: false, active: false, uses: 0, drawings: 2, canAdd: false },
    { kind: 'folder', id: 'fld-00000000-0000-4000-8000-000000000001', parent: 0, label: 'Папка', selected: false, active: false, uses: 0, drawings: 0, canAdd: false },
    { kind: 'element', id: 'el-00000000-0000-4000-8000-000000000001', parent: 1, label: '<script>текст</script>', type: 'ApplicationComponent', selected: true, active: false, uses: 1, drawings: 1, canAdd: true },
  ],
};

test('detached tree uses inert labels, emits owner actions, filters all rows, and docks', async t => {
  const dom = new JSDOM(readFileSync(new URL('../catalog.html', import.meta.url), 'utf8'), { url: 'https://catalog.test' });
  t.after(() => dom.window.close()); const { document, window } = dom.window, sent = []; let receive, docked = 0;
  const ui = installCatalogWindow({ document, window, bridge: {
    onState(callback) { receive = callback; return () => {}; }, ready: async () => ({}), command: async data => { sent.push(data); return { status: 'ok' }; }, dock: async () => { docked++; return { status: 'docked' }; },
  } });
  receive(dto); await Promise.resolve();
  assert.equal(document.querySelectorAll('script:not([src])').length, 0);
  assert.equal(document.querySelector('#catalog-window-title').textContent, 'Дерево · Synthetic');
  const folderSummary = document.querySelectorAll('#catalog-window-items summary')[1];
  folderSummary.focus(); assert.equal(document.activeElement, folderSummary);
  folderSummary.click();
  await new Promise(resolve => window.setTimeout(resolve, 0));
  assert.equal(document.activeElement.tagName, 'SUMMARY', 'the folder disclosure keeps keyboard focus after the tree rerenders');
  assert.equal(document.activeElement.dataset.catalogIndex, '1');
  const openedRow = document.querySelector('.catalog-window-row button');
  await new Promise(resolve => window.setTimeout(resolve, 0));
  await new Promise(resolve => window.setTimeout(resolve, 0));
  assert.equal(openedRow.isConnected, true, 'an open folder must settle without replacing its controls repeatedly');
  assert.match(document.querySelector('.catalog-window-row button').textContent, /<script>текст<\/script>/);
  document.querySelector('.catalog-window-row button').click(); await Promise.resolve(); assert.deepEqual(sent[0], { nonce: 'owner-snapshot', index: 2, action: 'select' });
  document.querySelector('.catalog-window-add').click(); await Promise.resolve(); assert.deepEqual(sent[1], { nonce: 'owner-snapshot', index: 2, action: 'add' });
  const input = document.getElementById('catalog-window-query'); input.value = 'ApplicationComponent'; input.dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelectorAll('.catalog-window-result').length, 1); assert.equal(document.documentElement.dataset.theme, 'dark'); assert.equal(typeof ui.model, 'undefined');
  document.getElementById('catalog-dock').click(); await Promise.resolve(); assert.equal(docked, 1);
});

test('detached tree keeps folder pages attached to their folder after siblings are inserted', async t => {
  const dom = new JSDOM(readFileSync(new URL('../catalog.html', import.meta.url), 'utf8'), { url: 'https://catalog.test' });
  t.after(() => dom.window.close()); const { document, window } = dom.window; let receive;
  installCatalogWindow({ document, window, bridge: {
    onState(callback) { receive = callback; return () => {}; }, ready: async () => ({}), command: async () => ({ status: 'ok' }), dock: async () => ({ status: 'docked' }),
  } });
  const treeSnapshot = (folders, revision) => {
    const entries = [{ ...dto.entries[0] }]; let nextElementId = 1;
    for (const { id, name } of folders) {
      const parent = entries.length;
      entries.push({ kind: 'folder', id, parent: 0, label: name, selected: false, active: false, uses: 0, drawings: 0, canAdd: false });
      for (let index = 0; index < 101; index++) entries.push({ kind: 'element', id: `el-00000000-0000-4000-8000-${String(nextElementId++).padStart(12, '0')}`, parent, label: `${name} child ${index}`, type: 'Role', selected: false, active: false, uses: 0, drawings: 0, canAdd: false });
    }
    return { ...dto, revision, entries };
  };
  const tick = () => new Promise(resolve => window.setTimeout(resolve, 0));

  receive(treeSnapshot([{ id: 'fld-00000000-0000-4000-8000-000000000101', name: 'A' }], 3));
  document.querySelectorAll('#catalog-window-items summary')[1].click(); await tick();
  document.querySelector('#catalog-window-items .catalog-window-pages button:last-child').click();

  receive(treeSnapshot([{ id: 'fld-00000000-0000-4000-8000-000000000102', name: 'B' }, { id: 'fld-00000000-0000-4000-8000-000000000101', name: 'A' }], 4));
  const folder = name => [...document.querySelectorAll('#catalog-window-items details')].find(item => item.querySelector('summary span')?.textContent === name);
  assert.equal(folder('A').open, true, 'inserting a sibling keeps the open state with folder A');
  assert.ok([...folder('A').querySelectorAll('.catalog-window-row button')].some(button => button.textContent.startsWith('A child 100')));
  document.querySelectorAll('#catalog-window-items summary')[1].click(); await tick();
  assert.ok([...document.querySelectorAll('#catalog-window-items .catalog-window-row button')].some(button => button.textContent.startsWith('B child 0')));
});

test('detached tree clamps a folder page when its entries are removed', async t => {
  const dom = new JSDOM(readFileSync(new URL('../catalog.html', import.meta.url), 'utf8'), { url: 'https://catalog.test' });
  t.after(() => dom.window.close()); const { document, window } = dom.window; let receive;
  installCatalogWindow({ document, window, bridge: {
    onState(callback) { receive = callback; return () => {}; }, ready: async () => ({}), command: async () => ({ status: 'ok' }), dock: async () => ({ status: 'docked' }),
  } });
  const treeSnapshot = (count, revision) => {
    const entries = [{ ...dto.entries[0] }, { ...dto.entries[1] }];
    for (let index = 0; index < count; index++) entries.push({ ...dto.entries[2], id: `el-00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, parent: 1, label: `A child ${index}` });
    return { ...dto, revision, entries };
  };
  const tick = () => new Promise(resolve => window.setTimeout(resolve, 0));

  receive(treeSnapshot(250, 3));
  document.querySelectorAll('#catalog-window-items summary')[1].click(); await tick();
  const next = () => [...document.querySelectorAll('#catalog-window-items .catalog-window-pages button')].find(button => button.textContent.startsWith('Следующие'));
  next().click(); next().click();
  assert.equal(document.querySelectorAll('.catalog-window-row').length, 50);

  receive(treeSnapshot(20, 4));
  assert.equal(document.querySelectorAll('.catalog-window-row').length, 20);
  assert.match(document.querySelector('.catalog-window-row button').textContent, /^A child 0/);
});
