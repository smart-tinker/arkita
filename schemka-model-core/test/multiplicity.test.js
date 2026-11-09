import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, createStore, exportFiles, importFiles, validateProject } from '../src/index.js';
import { relationshipProject } from '../fixtures/relationship-project.js';

const capture = store => ({ state: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history });
const run = (store, command) => store.execute(command, store.revision);
const patch = (store, values, relationshipId = store.snapshot.relationships[0].id) => run(store, { type: 'updateRelationshipMultiplicity', relationshipId, ...values });
function unchanged(store, action, code) {
  const before = capture(store); assert.throws(action, { code }); assert.deepEqual(capture(store), before);
}
function historyStore() {
  const store = createStore(relationshipProject());
  run(store, { type: 'renameProject', name: 'Kept' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  return store;
}

test('absence, empty, star and exact raw values are distinct bounded persisted multiplicity data', () => {
  assert.equal(LIMITS.multiplicity, 128);
  const original = relationshipProject();
  assert.ok(!Object.hasOwn(original.relationships[0], 'sourceMultiplicity'));
  const values = ['', '*', '0..*', '1..*', '2..*', '0', '-1', '3..2', '01', ' 1 ', '+1', '１',
    '9007199254740993', ' \r\n\t<svg onload="synthetic">\ud800 ', '😀'.repeat(64)];
  for (const raw of values) {
    const state = structuredClone(original);
    state.relationships[0].sourceMultiplicity = raw;
    state.relationships[0].targetMultiplicity = raw;
    assert.equal(validateProject(state), state);
    const files = exportFiles(state), reopened = importFiles(files);
    assert.equal(reopened.relationships[0].sourceMultiplicity, raw);
    assert.equal(reopened.relationships[0].targetMultiplicity, raw);
    assert.deepEqual(exportFiles(reopened), files);
  }
  for (const raw of [null, 0, false, {}, [], 'x'.repeat(129), '😀'.repeat(64) + 'x']) {
    const state = structuredClone(original); state.relationships[0].sourceMultiplicity = raw;
    assert.throws(() => validateProject(state), { code: 'SCHEMA' });
  }
});

test('independent-end updates affect shared views only and undo/redo preserves exact optional-field bytes', () => {
  const store = createStore(relationshipProject()), initial = capture(store), snapshots = [];
  const targetId = store.snapshot.relationships[0].id;
  const updates = [
    { sourceMultiplicity: '*' }, { targetMultiplicity: '' },
    { sourceMultiplicity: ' 1\r\n ', targetMultiplicity: '3..2' },
    { sourceMultiplicity: null }, { targetMultiplicity: null },
  ];
  for (const values of updates) {
    const before = store.snapshot, result = patch(store, values), after = store.snapshot;
    assert.deepEqual(result, { command: 'updateRelationshipMultiplicity', created: {}, revision: store.revision,
      affectedViewIds: before.views.slice(0, 2).map(entry => entry.view.id).sort() });
    assert.deepEqual(after.views, initial.state.views);
    assert.deepEqual(after.elements, initial.state.elements);
    assert.deepEqual(after.relationships.filter(item => item.id !== targetId), initial.state.relationships.filter(item => item.id !== targetId));
    for (const field of ['sourceMultiplicity', 'targetMultiplicity']) {
      const relationship = after.relationships[0];
      if (Object.hasOwn(values, field)) {
        assert.equal(Object.hasOwn(relationship, field), values[field] !== null);
        if (values[field] !== null) assert.equal(relationship[field], values[field]);
      } else {
        assert.equal(Object.hasOwn(relationship, field), Object.hasOwn(before.relationships[0], field));
        assert.equal(relationship[field], before.relationships[0][field]);
      }
    }
    snapshots.push(store.exportFiles());
  }
  assert.deepEqual(store.exportFiles(), initial.files); // Removed, never replaced by null or a default.
  for (let index = snapshots.length - 1; index >= 0; index--) {
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), index ? snapshots[index - 1] : initial.files);
  }
  for (const files of snapshots) { store.redo(store.revision); assert.deepEqual(store.exportFiles(), files); }
  const unshown = store.snapshot.relationships.at(-1).id;
  assert.deepEqual(patch(store, { targetMultiplicity: 'unknown raw text' }, unshown).affectedViewIds, []);
});

test('no-op, stale and malformed multiplicity patches preserve both histories and commit neither end', () => {
  const store = historyStore(), relationshipId = store.snapshot.relationships[0].id;
  assert.deepEqual(store.history, { undo: 1, redo: 1 });
  for (const values of [{}, { sourceMultiplicity: null }, { sourceMultiplicity: null, targetMultiplicity: null }]) {
    unchanged(store, () => patch(store, values), 'COMMAND');
  }
  unchanged(store, () => store.execute({ type: 'updateRelationshipMultiplicity', relationshipId, sourceMultiplicity: '*' }, store.revision - 1), 'REVISION');
  for (const values of [{ sourceMultiplicity: '*', targetMultiplicity: 3 },
    { sourceMultiplicity: 'x'.repeat(129), targetMultiplicity: '' }, { sourceMultiplicity: [], targetMultiplicity: null },
    { sourceMultiplicity: '*', accessType: 'read' }]) unchanged(store, () => patch(store, values), 'SCHEMA');
  unchanged(store, () => patch(store, { sourceMultiplicity: undefined }), 'JSON_VALUE');
  unchanged(store, () => patch(store, { sourceMultiplicity: '*' }, 'missing'), 'REFERENCE');
  let accessed = false;
  const command = { type: 'updateRelationshipMultiplicity', relationshipId };
  Object.defineProperty(command, 'sourceMultiplicity', { enumerable: true, get() { accessed = true; return '*'; } });
  unchanged(store, () => store.execute(command, store.revision), 'JSON_VALUE'); assert.equal(accessed, false);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
  patch(store, { sourceMultiplicity: '', targetMultiplicity: '*' });
  run(store, { type: 'renameProject', name: 'Later' }); store.undo(store.revision);
  unchanged(store, () => patch(store, { sourceMultiplicity: '', targetMultiplicity: '*' }), 'COMMAND');
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Later');
});

test('multiplicity updates keep relationship endpoints, labels, graph size and layout independent', () => {
  const store = createStore(relationshipProject()), before = store.snapshot;
  for (const relation of before.relationships) patch(store, { sourceMultiplicity: '0', targetMultiplicity: '-1' }, relation.id);
  const after = store.snapshot;
  assert.equal(after.relationships.length, before.relationships.length);
  assert.deepEqual(after.elements, before.elements); assert.deepEqual(after.views, before.views);
  assert.deepEqual(after.relationships.map(({ sourceMultiplicity, targetMultiplicity, ...rest }) => rest), before.relationships);
});
