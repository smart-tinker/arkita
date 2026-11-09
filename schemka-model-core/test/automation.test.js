import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles } from '../src/index.js';
import { modelSearchRecords } from '../src/model-search.js';
import { prepareAutomation, queryModel, validateAutomation } from '../src/automation.js';
import { readAutomation, EXAMPLE_AUTOMATION } from '../../schemka-model-io/src/automation.js';
function fixture() { const store = createStore(createProject('Автоматизация')), run = command => store.execute(command, store.revision).created; const viewId = run({ type: 'createView', name: 'View' }).viewId; run({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent', name: 'Service', bounds: { x: 0, y: 0, width: 120, height: 60 } }); return store; }
const writable = steps => ({ ...structuredClone(EXAMPLE_AUTOMATION), capabilities: ['model.read', 'model.write'], steps });
test('readonly automation queries stable records/properties match UI and cannot mutate source or execute package code', () => {
  const store = fixture(), before = store.exportFiles(), rows = queryModel(store.snapshot, { kind: 'element' }); assert.equal(rows[0].id, modelSearchRecords(store.snapshot).find(row => row.owner.kind === 'element').owner.id); assert.equal(queryModel(store.snapshot, { kind: 'element', unused: true }).length, 0);
  rows[0].record.name = 'changed'; assert.deepEqual(store.exportFiles(), before);
  assert.throws(() => validateAutomation({ ...EXAMPLE_AUTOMATION, capabilities: ['model.read', 'fs.read'] }), { code: 'AUTOMATION_CAPABILITY' });
  assert.throws(() => validateAutomation(writable([{ action: 'command', command: { type: 'applyProjectSnapshot', files: [] } }])), { code: 'AUTOMATION_STEP' });
  assert.throws(() => readAutomation(JSON.stringify({ ...EXAMPLE_AUTOMATION, script: 'globalThis.evil=1' }))); assert.equal(globalThis.evil, undefined);
});
test('declarative batch stages exact preview and commits one Undo; no-op, stale and exceptions do not partially apply', async () => {
  const store = fixture(), before = store.exportFiles(), history = store.history, manifest = writable([{ action: 'rename', query: { kind: 'element' }, prefix: 'Мой ' }, { action: 'setProperty', query: { kind: 'element' }, key: 'owner', value: 'Эльдар' }, { action: 'query', query: { propertyKey: 'owner', propertyValue: 'Эльдар' } }]);
  const preview = await prepareAutomation(store.snapshot, manifest); assert.equal(preview.changed, true); assert.equal(preview.queries[0].rows.length, 1); assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, history);
  const revision = store.revision; store.execute({ type: 'applyProjectSnapshot', files: preview.files }, revision); assert.equal(store.history.undo, history.undo + 1); const after = store.exportFiles(); store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  assert.throws(() => store.execute({ type: 'applyProjectSnapshot', files: preview.files }, revision), { code: 'REVISION' });
  const noOp = await prepareAutomation(store.snapshot, writable([{ action: 'rename', query: { kind: 'element' }, prefix: '' }])); assert.equal(noOp.changed, false);
  await assert.rejects(() => prepareAutomation(store.snapshot, writable([{ action: 'rename', query: { kind: 'element' }, prefix: 'first ' }, { action: 'command', command: { type: 'renameView', viewId: 'missing', name: 'bad' } }])), error => error.step === 2); assert.deepEqual(store.exportFiles(), after);
});
test('cancel and deadline bound the staged run; errors identify the failing step/line without executing arbitrary code', async () => {
  const store = fixture(), before = store.exportFiles(), abort = new AbortController(); let yields = 0;
  await assert.rejects(() => prepareAutomation(store.snapshot, writable([{ action: 'rename', query: { kind: 'element' }, prefix: 'one ' }, { action: 'rename', query: { kind: 'element' }, prefix: 'two ' }]), { signal: abort.signal, yieldControl: async () => { if (++yields === 2) abort.abort(); } }), { code: 'AUTOMATION_CANCELLED' }); assert.deepEqual(store.exportFiles(), before);
  let time = 0; await assert.rejects(() => prepareAutomation(store.snapshot, EXAMPLE_AUTOMATION, { now: () => time += 6000, yieldControl: async () => {} }), { code: 'AUTOMATION_TIMEOUT' });
  assert.throws(() => readAutomation(JSON.stringify(writable([{ action: 'eval', text: 'bad' }]), null, 2)), error => error.step === 1 && error.line > 1);
});

test('repeated query output is bounded independently from a valid model and reports canonical step line', async () => {
  const state = createProject('Large metadata'); state.project.properties = Array.from({ length: 12 }, (_, index) => ({ key: `key-${index}`, value: 'x'.repeat(8192) })); const before = exportFiles(state);
  const input = { ...EXAMPLE_AUTOMATION, steps: Array.from({ length: 100 }, () => ({ action: 'query', query: { kind: 'project' } })) };
  await assert.rejects(() => prepareAutomation(state, input, { yieldControl: async () => {} }), error => error.code === 'AUTOMATION_LIMIT' && error.step > 1 && error.line > 1); assert.deepEqual(exportFiles(state), before);
  assert.throws(() => readAutomation('{\n"broken":\n}'), error => error.code === 'JSON_SYNTAX' && error.line === 3);
});
