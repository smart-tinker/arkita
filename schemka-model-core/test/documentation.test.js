import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, createStore, importFiles, exportFiles } from '../src/index.js';
import { customizationProject } from '../fixtures/customization-project.js';

const capture = store => ({ state: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history });
const run = (store, command) => store.execute(command, store.revision);
const ref = (store, kind) => ({ kind, id: store.snapshot[`${kind}s`][0].id });
const update = (store, concept, documentation) => run(store, { type: 'updateConceptDocumentation', concept, documentation });
function fixture() {
  const state = customizationProject({ exact: { type: 'String', default: ' raw\r\n<inert> ' } });
  for (const item of [...state.elements, ...state.junctions]) item.name = 'Same name';
  const store = createStore(state);
  run(store, { type: 'duplicateView', viewId: state.views[0].view.id, name: 'Another occurrence of each concept' });
  run(store, { type: 'addOccurrence', viewId: state.views[0].view.id, concept: ref(store, 'element'), bounds: { x: 400, y: 400, width: 120, height: 60 } });
  return createStore(store.snapshot);
}
function unchanged(store, command, code) {
  const before = capture(store);
  assert.throws(() => run(store, command), { code });
  assert.deepEqual(capture(store), before);
}

test('documentation: exact shared element/junction changes only documentation, across repeated drawings and views', () => {
  for (const kind of ['element', 'junction']) {
    const store = fixture(), before = capture(store), concept = ref(store, kind), text = ' \r\n<script>literal()</script>\r\t日本語 😀 ';
    const result = update(store, concept, text), expected = structuredClone(before.state);
    expected[`${kind}s`][0].documentation = text;
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(result.affectedViewIds, [before.state.views[0].view.id, before.state.views[2].view.id].sort());
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    const files = store.exportFiles(); assert.deepEqual(exportFiles(importFiles(files)), files);
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
    store.redo(store.revision); assert.deepEqual(store.exportFiles(), files);
  }
});

test('documentation: empty string remains required; all raw values and 8192 UTF-16 units roundtrip', () => {
  assert.equal(LIMITS.string, 8192);
  for (const kind of ['element', 'junction']) for (const text of ['', ' ', '\r\n\r\n', '\r\t a\nb ', '\ud800', 'x'.repeat(8192), '😀'.repeat(4096)]) {
    const store = fixture(), concept = ref(store, kind);
    update(store, concept, text);
    const item = importFiles(store.exportFiles())[`${kind}s`][0];
    assert.equal(Object.hasOwn(item, 'documentation'), true); assert.equal(item.documentation, text);
  }
});

test('documentation: no-op, malformed payloads, invalid kinds/IDs and accessors fail atomically before history', () => {
  const store = fixture(), concept = ref(store, 'element');
  run(store, { type: 'renameProject', name: 'Kept' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const valid = { type: 'updateConceptDocumentation', concept, documentation: 'new' };
  unchanged(store, { ...valid, documentation: store.snapshot.elements[0].documentation }, 'COMMAND');
  for (const documentation of [null, false, 0, [], {}, 'x'.repeat(8193), '😀'.repeat(4096) + 'x']) unchanged(store, { ...valid, documentation }, 'SCHEMA');
  for (const command of [{ type: valid.type, concept }, { ...valid, ignored: 'value' }, { ...valid, concept: { ...concept, extra: true } },
    { ...valid, concept: { id: concept.id } }]) unchanged(store, command, 'SCHEMA');
  for (const concept of [{ kind: 'relationship', id: store.snapshot.elements[0].id }, { kind: 'view', id: store.snapshot.views[0].view.id }, { kind: 'element', id: store.snapshot.junctions[0].id }]) unchanged(store, { ...valid, concept }, 'REFERENCE');
  unchanged(store, { ...valid, concept: { kind: 'element', id: 'el-00000000-0000-4000-8000-999999999999' } }, 'REFERENCE');
  unchanged(store, { ...valid, concept: ref(store, 'junction'), documentation: undefined }, 'JSON_VALUE');
  let accessed = false; const command = { type: valid.type, concept };
  Object.defineProperty(command, 'documentation', { enumerable: true, get() { accessed = true; return 'new'; } });
  unchanged(store, command, 'JSON_VALUE'); assert.equal(accessed, false);
  const before = capture(store); assert.throws(() => store.execute(valid, store.revision - 1), { code: 'REVISION' }); assert.deepEqual(capture(store), before);
  assert.deepEqual(store.history, { undo: 1, redo: 1 }); store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});

test('documentation: model concepts remain editable with no views and report no affected drawings', () => {
  const state = customizationProject(); state.views = [];
  const store = createStore(state);
  for (const kind of ['element', 'junction']) assert.deepEqual(update(store, ref(store, kind), `${kind} text`).affectedViewIds, []);
  assert.deepEqual(store.snapshot.views, []); assert.deepEqual(store.snapshot.relationships, state.relationships);
});
