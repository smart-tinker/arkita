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

test('catalog usage marker stays global across views and two Undos restore the saved bytes', async t => {
  const h = await setup(t), store = createStore(createProject('Shared usage'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId: firstView } = run({ type: 'createView', name: 'First view' });
  const { viewId: secondView } = run({ type: 'createView', name: 'Second view' });
  const firstSource = run({ type: 'createElementAndOccurrence', viewId: firstView, elementType: 'Service', name: 'Shared source', bounds: { x: 0, y: 0, width: 160, height: 80 } });
  const firstTarget = run({ type: 'createElementAndOccurrence', viewId: firstView, elementType: 'Process', name: 'Shared target', bounds: { x: 240, y: 0, width: 160, height: 80 } });
  const { relationshipId } = run({ type: 'createRelationshipAndConnection', viewId: firstView, relationshipType: 'Serving', source: { kind: 'occurrence', id: firstSource.occurrenceId }, target: { kind: 'occurrence', id: firstTarget.occurrenceId }, label: 'Shared relation' });
  const secondSource = run({ type: 'addOccurrence', viewId: secondView, concept: { kind: 'element', id: firstSource.elementId }, bounds: { x: 0, y: 0, width: 160, height: 80 } });
  const secondTarget = run({ type: 'addOccurrence', viewId: secondView, concept: { kind: 'element', id: firstTarget.elementId }, bounds: { x: 240, y: 0, width: 160, height: 80 } });
  run({ type: 'addConnection', viewId: secondView, relationshipId, source: { kind: 'occurrence', id: secondSource.occurrenceId }, target: { kind: 'occurrence', id: secondTarget.occurrenceId } });
  await h.load(serializeProjectFile(store.snapshot));
  const openView = viewId => h.document.querySelector(`[data-view-scope="tree"][data-view-id="${viewId}"]`).click();
  const elementButton = () => h.document.querySelector(`.catalog [data-element-id="${firstSource.elementId}"]`);
  const relationshipButton = () => h.document.querySelector(`.catalog [data-relationship-id="${relationshipId}"]`);
  const expectUsed = () => {
    for (const button of [elementButton(), relationshipButton()]) {
      assert.ok(button);
      assert.equal(button.dataset.unused, 'false');
      assert.equal(button.querySelector('.unused-marker'), null);
    }
  };
  const expectUnused = () => {
    for (const button of [elementButton(), relationshipButton()]) {
      assert.equal(button.dataset.unused, 'true');
      assert.equal(button.querySelector('.unused-marker').textContent, '∅');
    }
  };
  const removeOccurrence = occurrenceId => {
    const occurrence = h.$('canvas').querySelector(`[data-kind="occurrence"][data-id="${occurrenceId}"]`);
    assert.ok(occurrence);
    h.pointer(occurrence, 'pointerdown', 20, 30); h.pointer(h.$('canvas'), 'pointerup', 20, 30);
    h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    assert.equal(h.$('delete-dialog').open, true);
    h.$('delete-confirm').click();
    assert.equal(h.$('delete-dialog').open, false);
  };
  openView(firstView);
  const before = await h.download();
  expectUsed();
  removeOccurrence(firstSource.occurrenceId);
  expectUsed();
  openView(secondView);
  removeOccurrence(secondSource.occurrenceId);
  expectUnused();
  h.$('undo').click(); expectUsed();
  h.$('undo').click(); expectUsed();
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
