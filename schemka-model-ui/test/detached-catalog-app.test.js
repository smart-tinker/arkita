import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

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
  h.$('catalog-detach').click();
  for (let attempt = 0; attempt < 20 && !opened.length; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened.length, 1, 'detaching publishes a model-tree snapshot to the owner window');
  assert.deepEqual(await save(), bytes);
});
