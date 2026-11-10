import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { setup } from './app-test-fixture.js';

test('actual canvas note double click and connector F2 edit literal text inline, cancel and exact Undo preserve all other records', async t => {
  const h = await setup(t), store = createStore(createProject('Visual captions')), run = command => store.execute(command, store.revision).created;
  const viewId = run({ type: 'createView', name: 'Main' }).viewId;
  const noteId = run({ type: 'createVisualNode', viewId, kind: 'note', name: 'Private name', text: 'Exact\r\ntext', properties: [{ key: 'owner', value: 'Unchanged' }], bounds: { x: 20, y: 30, width: 200, height: 100 } }).visualNodeId;
  const groupId = run({ type: 'createVisualNode', viewId, kind: 'group', bounds: { x: 400, y: 30, width: 150, height: 100 } }).visualNodeId;
  const lineId = run({ type: 'createVisualConnector', viewId, name: 'Visual caption', source: { kind: 'visualNode', id: noteId }, target: { kind: 'visualNode', id: groupId } }).visualConnectorId;
  await h.load(serializeProjectFile(store.snapshot)); const bytes = await h.download(), figure = id => h.$('canvas').querySelector(`[data-id="${id}"]`), key = (target, value) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: value,ctrlKey:target.tagName==='TEXTAREA'&&value==='Enter', bubbles: true, cancelable: true }));
  figure(noteId).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })); let input = h.document.querySelector('.inline-editor input,.inline-editor textarea'); assert.ok(input);assert.equal(input.tagName,'TEXTAREA');const newline=new h.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input.dispatchEvent(newline);assert.equal(newline.defaultPrevented,false);assert.ok(h.document.querySelector('.inline-editor textarea'));assert.equal(h.$('visual-dialog').open, false); key(input, 'Enter'); assert.deepEqual(await h.download(), bytes, 'untouched browser-normalized line breaks must stay exact');
  for (const [id, trigger, value] of [[noteId, 'double', 'Заметка 🙂 <img src=x>\nВторая строка'], [lineId, 'F2', 'Линия 🙂 <script>']]) {
    if (trigger === 'double') figure(id).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })); else key(figure(id), trigger);
    input = h.document.querySelector('.inline-editor input,.inline-editor textarea'); assert.ok(input); input.value = 'Cancelled'; key(input, 'Escape'); assert.deepEqual(await h.download(), bytes);
    key(figure(id), 'F2'); input = h.document.querySelector('.inline-editor input,.inline-editor textarea'); assert.ok(input); input.value = value; key(input, 'Enter'); assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(h.$('canvas').querySelector('script,img'), null); assert.match(h.$('history-state').textContent, /1 действий/);
    const after = deserializeProjectFile(await h.download()), expected = deserializeProjectFile(bytes), entry = expected.views.find(item => item.view.id === viewId);
    if (id === noteId) entry.visualNodes.find(item => item.id === id).text = value; else entry.visualConnectors.find(item => item.id === id).name = value;
    assert.deepEqual(after, expected); h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
  }
});
