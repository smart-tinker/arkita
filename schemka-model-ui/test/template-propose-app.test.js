import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, richLifecycleFixture, production } from './app-test-fixture.js';
import { createStore } from '../../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const nextTask = window => new Promise(resolve => window.setTimeout(resolve, 0));

function allIds(state) {
  return [state.project.id, ...state.elements, ...state.junctions, ...state.relationships].map(item => item.id)
    .concat(state.assets.map(item => item.id), state.views.flatMap(entry => [entry.view, ...entry.occurrences, ...entry.connections, ...entry.visualNodes, ...entry.visualConnectors].map(item => item.id)))
    .concat(state.views.flatMap(entry => entry.connections.flatMap(line => line.routePoints.filter(point => point.kind === 'anchor').map(point => point.id))))
    .filter(id => typeof id === 'string');
}

test(`${production ? 'production' : 'source'} full-model template proposal survives its dialog close event`, async t => {
  const h = await setup(t);
  const close = h.window.HTMLDialogElement.prototype.close;
  h.window.HTMLDialogElement.prototype.close = function () {
    if (this.id !== 'templates-dialog') return close.call(this);
    this.removeAttribute('open');
    h.window.setTimeout(() => this.dispatchEvent(new h.window.Event('close')), 0);
  };

  const store = createStore(richLifecycleFixture().state);
  const { assetId } = store.execute({ type: 'createAsset', name: 'QA image', mediaType: 'image/svg+xml',
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>').toString('base64') }, store.revision).created;
  const viewId = store.snapshot.views[0].view.id;
  store.execute({ type: 'createVisualNode', viewId, kind: 'image', name: 'QA resource', assetId,
    bounds: { x: 430, y: 220, width: 48, height: 48 } }, store.revision);
  await h.load(serializeProjectFile(store.snapshot), 'QA template source.arkita');
  const source = deserializeProjectFile(await h.download());

  h.$('templates-button').click();
  h.$('template-name').value = 'QA reusable full model';
  h.$('template-save-current').click();
  const entry = [...h.$('template-choice').options].find(option => option.textContent.includes('QA reusable full model'));
  assert.ok(entry, 'the full model template was saved in the local library');
  h.$('template-choice').value = entry.value;
  h.$('template-choice').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  h.$('template-new').click();
  await nextTask(h.window);
  assert.equal(h.$('file-dialog').open, true);
  assert.equal(h.$('replace-project').hidden, false);
  h.$('load-project').click();
  for (let attempt = 0; attempt < 40 && h.$('file-dialog').open && !h.$('file-feedback').textContent.includes('Файл не открыт'); attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(h.$('file-dialog').open, false, h.$('file-feedback').textContent);
  assert.equal(h.$('file-state').dataset.dirty, 'true');

  const instance = deserializeProjectFile(await h.download());
  assert.notEqual(instance.project.id, source.project.id);
  assert.equal(instance.elements.length, source.elements.length);
  assert.equal(instance.relationships.length, source.relationships.length);
  assert.equal(instance.views.length, source.views.length);
  assert.equal(instance.assets.length, source.assets.length);
  assert.equal(instance.views.flatMap(item => item.visualNodes).filter(item => item.kind === 'image').length, 1);
  assert.ok(instance.assets.some(item => item.id === instance.views.flatMap(view => view.visualNodes).find(item => item.kind === 'image').assetId));
  assert.deepEqual(instance.assets.map(({ id, ...item }) => item), source.assets.map(({ id, ...item }) => item));
  const sourceIds = new Set(allIds(source)), repeatedIds = allIds(instance).filter(id => sourceIds.has(id));
  assert.deepEqual(repeatedIds, [], `the template instance remaps model, drawing and resource IDs: ${repeatedIds.join(', ')}`);
});
