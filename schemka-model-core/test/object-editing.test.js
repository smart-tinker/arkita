import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles, importFiles, LIMITS } from '../src/index.js';
import { customizationProject } from '../fixtures/customization-project.js';

const capture = store => ({ files: store.exportFiles(), revision: store.revision, history: store.history });
const run = (store, command) => store.execute(command, store.revision);
function fixture() {
  const store = createStore(customizationProject());
  run(store, { type: 'duplicateView', viewId: store.snapshot.views[0].view.id, name: 'Shared model, independent drawing' });
  return createStore(store.snapshot);
}
function unchanged(store, command, code) {
  const before = capture(store);
  assert.throws(() => run(store, command), code ? { code } : undefined);
  assert.deepEqual(capture(store), before);
}

test('resize changes one element or junction drawing, preserves position, and roundtrips with exact undo/redo', () => {
  for (const kind of ['element', 'junction']) {
    const store = fixture(), before = store.snapshot, view = before.views[0];
    const occurrence = view.occurrences.find(item => item.concept.kind === kind);
    const original = store.exportFiles();
    const result = run(store, { type: 'resizeOccurrence', viewId: view.view.id, occurrenceId: occurrence.id, width: 275.5, height: 130.1 });
    const expected = structuredClone(before);
    Object.assign(expected.views[0].occurrences.find(item => item.id === occurrence.id).bounds, { width: 275.5, height: 130.1 });
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(result.affectedViewIds, [view.view.id]);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    const resized = store.exportFiles();
    assert.deepEqual(exportFiles(importFiles(resized)), resized);
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), original);
    store.redo(store.revision); assert.deepEqual(store.exportFiles(), resized);
  }
});

test('resize validates dimensions and exact view ownership atomically, keeping redo after failed and no-op edits', () => {
  const store = fixture(), view = store.snapshot.views[0], occurrence = view.occurrences[0];
  run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const valid = { type: 'resizeOccurrence', viewId: view.view.id, occurrenceId: occurrence.id, width: 200, height: 100 };
  for (const field of ['width', 'height']) for (const value of [0, -0, -1, 0.01, 1000000.1, NaN, Infinity, -Infinity, null, '100']) {
    unchanged(store, { ...valid, [field]: value });
  }
  unchanged(store, { ...valid, ...occurrence.bounds }, 'SCHEMA');
  unchanged(store, { ...valid, width: occurrence.bounds.width, height: occurrence.bounds.height }, 'COMMAND');
  unchanged(store, { ...valid, occurrenceId: store.snapshot.views.at(-1).occurrences[0].id }, 'REFERENCE');
  unchanged(store, { ...valid, viewId: 'missing' }, 'REFERENCE');
  const before = capture(store);
  assert.throws(() => store.execute(valid, store.revision - 1), { code: 'REVISION' });
  assert.deepEqual(capture(store), before);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
  run(store, { ...valid, width: 0.1, height: LIMITS.coordinate });
  assert.deepEqual(store.snapshot.views[0].occurrences[0].bounds, { ...occurrence.bounds, width: 0.1, height: LIMITS.coordinate });
});

test('ordinary properties replace one shared concept record across views with exact undo/redo and native file roundtrip', () => {
  for (const kind of ['element', 'junction', 'relationship']) {
    const store = fixture(), before = store.snapshot, original = store.exportFiles();
    const concept = { kind, id: before[`${kind}s`][0].id };
    const properties = [{ key: 'owner', value: 'Team Arkita' }, { key: 'note', value: ' \r\n<script>literal</script> 日本語 😀 ' }];
    const result = run(store, { type: 'updateConceptProperties', concept, properties });
    const expected = structuredClone(before); expected[`${kind}s`][0].properties = properties;
    assert.deepEqual(store.snapshot, expected);
    const affected = before.views.filter(entry => kind === 'relationship'
      ? entry.connections.some(item => item.relationshipId === concept.id)
      : entry.occurrences.some(item => item.concept.kind === kind && item.concept.id === concept.id)).map(entry => entry.view.id).sort();
    assert.ok(affected.length >= 2); assert.deepEqual(result.affectedViewIds, affected);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    const edited = store.exportFiles(); assert.deepEqual(exportFiles(importFiles(edited)), edited);
    properties[0].value = 'Mutated caller'; assert.equal(store.snapshot[`${kind}s`][0].properties[0].value, 'Team Arkita');
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), original);
    store.redo(store.revision); assert.deepEqual(store.exportFiles(), edited);
    run(store, { type: 'updateConceptProperties', concept, properties: [] });
    assert.deepEqual(store.snapshot[`${kind}s`][0].properties, []);
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), edited);
  }
});

test('property updates reject malformed payloads, unsafe keys, stale revisions and semantic no-ops before altering history', () => {
  const store = fixture(), concept = { kind: 'element', id: store.snapshot.elements[0].id };
  const valid = { type: 'updateConceptProperties', concept, properties: [{ key: 'first', value: 'one' }, { key: 'second', value: 'two' }] };
  run(store, valid); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  unchanged(store, { ...valid, properties: structuredClone(valid.properties) }, 'COMMAND');
  for (const properties of [null, [{}], 'text', { numeric: 1 }, { nested: {} }, { note: 'x'.repeat(LIMITS.string + 1) }, { ['k'.repeat(LIMITS.string + 1)]: 'value' }]) {
    unchanged(store, { ...valid, properties }, 'SCHEMA');
  }
  unchanged(store, { ...valid, properties: Array.from({ length: LIMITS.properties + 1 }, (_, i) => ({ key: String(i), value: 'value' })) }, 'LIMIT');
  for (const key of ['__proto__', 'prototype', 'constructor']) unchanged(store, { ...valid, properties: { [key]: 'unsafe' } }, 'UNSAFE_KEY');
  let accessed = false;
  const properties = {}; Object.defineProperty(properties, 'owner', { enumerable: true, get() { accessed = true; return 'team'; } });
  unchanged(store, { ...valid, properties }, 'JSON_VALUE'); assert.equal(accessed, false);
  unchanged(store, { ...valid, ignored: true }, 'SCHEMA');
  unchanged(store, { ...valid, concept: { kind: 'relationship', id: concept.id } }, 'REFERENCE');
  const before = capture(store);
  assert.throws(() => store.execute(valid, store.revision - 1), { code: 'REVISION' });
  assert.deepEqual(capture(store), before);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});

test('ordinary properties support undrawn concepts and the existing 64 string-pair boundary', () => {
  const state = customizationProject(); state.views = [];
  const store = createStore(state), properties = Array.from({ length: LIMITS.properties }, (_, i) => ({ key: String(i), value: i ? '' : 'x'.repeat(LIMITS.string) }));
  for (const kind of ['element', 'junction', 'relationship']) {
    const concept = { kind, id: state[`${kind}s`][0].id };
    assert.deepEqual(run(store, { type: 'updateConceptProperties', concept, properties }).affectedViewIds, []);
    assert.deepEqual(store.snapshot[`${kind}s`][0].properties, properties);
  }
});
