import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';

test('desktop editor exposes the model-tree detach action without changing saved model bytes', async t => {
  const opened = [], saved = [];
  const desktop = {
    catalogOpen: async snapshot => { opened.push(snapshot); return { status: 'detached' }; },
    catalogPublish: async () => ({ status: 'ok' }),
    catalogDock: async () => ({ status: 'docked' }),
    onCatalogAction: () => () => {},
    onCatalogDocked: () => () => {},
    saveProject: async bytes => { saved.push(Buffer.from(bytes)); return { status: 'saved', name: 'synthetic.arkita' }; },
  };
  const h = await setup(t, desktop);
  const save = async () => {
    const before = saved.length;
    h.$('file-button').click(); h.$('save-project').click();
    for (let attempt = 0; attempt < 20 && saved.length === before; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.length, before + 1);
    h.$('file-dialog').close();
    return saved.at(-1);
  };
  const bytes = await save();

  assert.ok(h.$('catalog-detach'), 'the tree panel has a desktop detach control');
  h.$('project-name').click();
  const draft = h.document.querySelector('.inline-editor input'); draft.value = 'Unfinished name';
  h.$('catalog-detach').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened.length, 0, 'opening the child must preserve an unfinished owner edit');
  assert.equal(draft.isConnected, true); assert.equal(draft.value, 'Unfinished name');
  draft.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  h.$('catalog-detach').click();
  for (let attempt = 0; attempt < 20 && !opened.length; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened.length, 1, 'detaching publishes a model-tree snapshot to the owner window');
  assert.deepEqual(await save(), bytes);
});

test('detached tree navigation preserves an unfinished owner edit and works after cancellation', async t => {
  let receive, snapshot;
  const h = await setup(t, {
    catalogOpen: async value => { snapshot = value; return { status: 'detached' }; },
    catalogPublish: async () => ({ status: 'ok' }),
    onCatalogAction: callback => { receive = callback; return () => {}; },
    onCatalogDocked: () => () => {},
  });
  h.$('catalog-detach').click();
  for (let attempt = 0; attempt < 20 && h.document.body.dataset.catalogDetached !== 'true'; attempt++) await new Promise(resolve => setImmediate(resolve));
  const other = snapshot.entries.find(item => item.kind === 'view' && item.id !== snapshot.viewId);
  assert.ok(other, 'the synthetic example includes another view');
  const request = { documentToken: snapshot.documentToken, revision: snapshot.revision, viewId: snapshot.viewId, kind: 'view', id: other.id, action: 'select' };
  h.$('project-name').click();
  const draft = h.document.querySelector('.inline-editor input'); draft.value = 'Keep this draft';
  receive(request);
  assert.equal(draft.isConnected, true, 'a child navigation must not cancel the owner draft');
  assert.equal(draft.value, 'Keep this draft');
  draft.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  receive(request);
  assert.equal(h.$(`tab-${other.id}`).getAttribute('aria-selected'), 'true');
});

test('detaching the active catalog returns a narrow owner window to the canvas', async t => {
  const h = await setup(t, {
    catalogOpen: async () => ({ status: 'detached' }),
    catalogPublish: async () => ({ status: 'ok' }),
    onCatalogAction: () => () => {},
    onCatalogDocked: () => () => {},
  });
  h.viewport.narrow = true;
  h.document.querySelector('[data-panel="catalog"]').click();
  assert.equal(h.document.body.dataset.mobilePanel, 'catalog');
  h.$('catalog-detach').click();
  for (let attempt = 0; attempt < 20 && h.document.body.dataset.catalogDetached !== 'true'; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.document.body.dataset.catalogDetached, 'true');
  assert.equal(h.document.body.dataset.mobilePanel, 'canvas', 'the owner must show its canvas after detaching the selected catalog');
});
