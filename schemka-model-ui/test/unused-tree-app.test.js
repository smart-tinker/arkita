import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

test('tree unused marker uses all stored drawings and updates after add and Undo without changing model metadata', async t => {
  const h = await setup(t), store = createStore(createProject('Global usage'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Current empty' });
  const { viewId: other } = run({ type: 'createView', name: 'Stored other' });
  const used = run({ type: 'createElementAndOccurrence', viewId: other, elementType: 'Service', name: 'Used elsewhere', bounds: { x: 0, y: 0, width: 160, height: 80 } });
  const unused = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Node', name: 'Unused', bounds: { x: 0, y: 0, width: 160, height: 80 } });
  run({ type: 'removeOccurrence', viewId, occurrenceId: unused.occurrenceId });
  await h.load(serializeProjectFile(store.snapshot));
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${viewId}"]`).click();
  const usedButton = () => h.document.querySelector(`.catalog [data-element-id="${used.elementId}"]`);
  const unusedButton = () => h.document.querySelector(`.catalog [data-element-id="${unused.elementId}"]`);
  assert.equal(usedButton().dataset.unused, 'false');
  assert.equal(usedButton().querySelector('.occurrence-count').textContent, '0');
  assert.equal(unusedButton().dataset.unused, 'true');
  assert.match(unusedButton().getAttribute('aria-label'), /Не используется ни в одном/);
  const before = await h.download();
  h.document.querySelector(`[data-add-element-id="${unused.elementId}"]`).click();
  assert.equal(unusedButton().dataset.unused, 'false');
  h.$('undo').click();
  assert.equal(unusedButton().dataset.unused, 'true');
  assert.deepEqual(await h.download(), before);
});

test('rename-after-drop Escape retains one created object and creates no extra Undo', async t => {
  const h = await setup(t);
  h.$('preferences-button').click(); h.$('preferences-behavior-renameAfterCreate').checked = true;
  h.$('preferences-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const before = deserializeProjectFile(await h.download());
  h.pointer(h.$('create-service'), 'pointerdown', 20, 30);
  h.pointer(h.document, 'pointermove', 330, 250);
  h.pointer(h.document, 'pointerup', 330, 250);
  const input = h.$('canvas').querySelector('.inline-editor input'); assert.ok(input);
  input.value = 'Cancelled name'; input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(h.$('canvas').querySelector('.inline-editor'), null);
  const after = deserializeProjectFile(await h.download());
  assert.equal(after.elements.length, before.elements.length + 1);
  assert.equal(after.elements.find(item => !before.elements.some(old => old.id === item.id)).name, 'Новый Service');
  h.$('undo').click(); assert.deepEqual(deserializeProjectFile(await h.download()), before);
});
