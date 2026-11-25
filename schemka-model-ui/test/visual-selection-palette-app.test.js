import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { setup } from './app-test-fixture.js';

const selection = h => [...h.$('canvas').querySelectorAll('.selected[data-kind]')]
  .map(item => `${item.dataset.kind}:${item.dataset.id}`);

for (const kind of ['visualNode', 'visualConnector']) test(`canvas keyboard selection enables palette edit for ${kind} without changing the model`, async t => {
  const h = await setup(t), store = createStore(createProject('Visual palette selection'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Main' });
  const noteId = run({ type: 'createVisualNode', viewId, kind: 'note', text: 'Synthetic note', bounds: { x: 20, y: 30, width: 180, height: 90 } }).visualNodeId;
  const groupId = run({ type: 'createVisualNode', viewId, kind: 'group', bounds: { x: 300, y: 30, width: 220, height: 140 } }).visualNodeId;
  const connectorId = run({ type: 'createVisualConnector', viewId, source: { kind: 'visualNode', id: noteId }, target: { kind: 'visualNode', id: groupId } }).visualConnectorId;
  const id = kind === 'visualNode' ? groupId : connectorId, expected = [`${kind}:${id}`];
  await h.load(serializeProjectFile(store.snapshot));
  const before = await h.download(), target = h.$('canvas').querySelector(`[data-kind="${kind}"][data-id="${id}"]`);
  target.focus();
  const key = new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  target.dispatchEvent(key);
  assert.equal(key.defaultPrevented, true);
  assert.deepEqual(selection(h), expected);
  assert.equal(target.getAttribute('aria-pressed'), 'true');

  const history = [h.$('history-state').textContent, h.$('file-state').dataset.dirty, h.$('undo').disabled, h.$('redo').disabled];
  const palette = h.$('visual-tools');
  palette.querySelector('summary').click();
  assert.equal(palette.open, true);
  assert.equal(h.$('visual-edit').disabled, false, 'the selected drawing can be edited from its palette');
  h.$('visual-edit').click();
  assert.equal(h.$('visual-dialog').open, true);
  assert.deepEqual(selection(h), expected);
  assert.deepEqual([h.$('history-state').textContent, h.$('file-state').dataset.dirty, h.$('undo').disabled, h.$('redo').disabled], history);

  h.$('visual-cancel').click();
  assert.equal(h.$('visual-dialog').open, false);
  assert.deepEqual(selection(h), expected);
  assert.deepEqual(await h.download(), before);
  assert.deepEqual([h.$('history-state').textContent, h.$('file-state').dataset.dirty, h.$('undo').disabled, h.$('redo').disabled], history);
});
