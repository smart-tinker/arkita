import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { renameCommand, renameTarget } from '../src/rename.js';

test('inline adapter resolves all mutable names to commands and leaves snapshots untouched', () => {
  const store = createDemo(), state = store.snapshot, before = structuredClone(state);
  const targets = [{ kind: 'project', id: state.project.id }, { kind: 'element', id: state.elements[0].id }, { kind: 'relationship', id: state.relationships[0].id }, { kind: 'view', id: state.views[0].view.id }];
  for (const target of targets) {
    const descriptor = renameTarget(state, target);
    assert.equal(renameCommand(state, target, descriptor.value), null, 'no-op creates no command');
    const command = renameCommand(state, target, '😀 <img onerror=evil()> & 名前');
    store.execute(command, store.revision);
    assert.equal(renameTarget(store.snapshot, target).value, '😀 <img onerror=evil()> & 名前');
    store.undo(store.revision); assert.deepEqual(store.snapshot, before);
    const blank = renameCommand(state, target, ''); store.execute(blank, store.revision);
    assert.equal(renameTarget(store.snapshot, target).value, ''); store.undo(store.revision);
  }
  assert.deepEqual(state, before);
});
test('invalid or missing rename targets and overlong names cannot mutate model/history', () => {
  const store = createDemo(), before = store.exportFiles(), target = { kind: 'project', id: store.snapshot.project.id };
  for (const value of [null, 7, 'x'.repeat(8193)]) assert.throws(() => renameCommand(store.snapshot, target, value));
  assert.throws(() => renameTarget(store.snapshot, { kind: 'view', id: 'missing' }));
  assert.throws(() => renameTarget(store.snapshot, { kind: 'project', id: 'wrong-project' }));
  assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, { undo: 0, redo: 0 });
});


test('visual note text and connector captions rename in their exact view, preserve metadata and undo without touching semantic owners', () => {
  const store = createDemo(), viewId = store.snapshot.views[0].view.id, run = command => store.execute(command, store.revision).created;
  const a = run({ type: 'createVisualNode', viewId, kind: 'note', bounds: { x: 0, y: 0, width: 180, height: 100 }, text: 'Exact\r\ntext', name: 'Independent name', documentation: 'Retained', properties: [{ key: 'owner', value: 'Kayla' }] }).visualNodeId;
  const b = run({ type: 'createVisualNode', viewId, kind: 'group', bounds: { x: 300, y: 0, width: 180, height: 100 } }).visualNodeId;
  const line = run({ type: 'createVisualConnector', viewId, name: 'Caption', source: { kind: 'visualNode', id: a }, target: { kind: 'visualNode', id: b } }).visualConnectorId;
  const baseline = store.exportFiles();
  for (const target of [{ kind: 'visualNode', id: a, viewId }, { kind: 'visualConnector', id: line, viewId }]) {
    const value = renameTarget(store.snapshot, target).value;
    assert.equal(renameCommand(store.snapshot, target, value), null);
    store.execute(renameCommand(store.snapshot, target, 'Подпись 🙂 <img>'), store.revision);
    assert.equal(renameTarget(store.snapshot, target).value, 'Подпись 🙂 <img>');
    const note = store.snapshot.views[0].visualNodes.find(item => item.id === a);
    assert.equal(note.name, 'Independent name'); assert.equal(note.documentation, 'Retained'); assert.deepEqual(note.properties, [{ key: 'owner', value: 'Kayla' }]);
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), baseline);
    assert.throws(() => renameTarget(store.snapshot, { ...target, viewId: 'other-view' }));
  }
  run({ type: 'updateDrawingStyle', viewId, drawing: { kind: 'visualNode', id: a }, style: { labelTemplate: '${name}' } });
  assert.throws(() => renameTarget(store.snapshot, { kind: 'visualNode', id: a, viewId }), /шаблона/);
});
