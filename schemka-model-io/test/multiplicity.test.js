import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles, LIMITS } from '../../schemka-model-core/src/index.js';
import { relationshipProject, fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid, MERMAID_LIMITS } from '../src/index.js';
const warning = '%% multiplicities are text annotations only; use native Schemka for exact data\n';
const decodeLabels = source => source.replace(/#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)));
const capture = store => ({ files: store.exportFiles(), bytes: serializeProjectFile(store.snapshot), revision: store.revision, history: store.history });

test('native files preserve absent, empty, star and exact raw multiplicities across all relationships and views', () => {
  const state = relationshipProject();
  const values = ['', '*', '1..*', '2..*', '0', '-1', '3..2', '01', '+1', '１', 'unknown', ' \r\n\t<svg>\ud800 ', '😀'.repeat(64), '9'.repeat(128)];
  for (const [index, relation] of state.relationships.entries()) {
    if (index) relation.sourceMultiplicity = values[(index - 1) % values.length];
    if (index > 1) relation.targetMultiplicity = values[index % values.length];
  }
  const bytes = serializeProjectFile(state), files = exportFiles(state);
  const loaded = deserializeProjectFile(bytes), store = createStore(loaded);
  assert.deepEqual(exportFiles(loaded), files); assert.deepEqual(serializeProjectFile(loaded), bytes);
  assert.equal(Object.hasOwn(loaded.relationships[0], 'sourceMultiplicity'), false);
  assert.equal(loaded.relationships[1].sourceMultiplicity, '');
  assert.equal(loaded.relationships[2].sourceMultiplicity, '*');
  assert.deepEqual(loaded.relationships, state.relationships);
  assert.deepEqual(loaded.views, state.views);
  const relationshipId = loaded.relationships[0].id;
  store.execute({ type: 'updateRelationshipMultiplicity', relationshipId, sourceMultiplicity: '', targetMultiplicity: '*' }, store.revision);
  const changed = serializeProjectFile(store.snapshot);
  store.undo(store.revision); assert.deepEqual(serializeProjectFile(store.snapshot), bytes);
  store.redo(store.revision); assert.deepEqual(serializeProjectFile(store.snapshot), changed);
  assert.equal(LIMITS.multiplicity, 128);
});

test('malformed multiplicity files reject atomically while raw diagnostic-invalid strings remain valid storage', () => {
  const state = relationshipProject(), store = createStore(state);
  store.execute({ type: 'renameProject', name: 'Kept' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision);
  for (const value of [null, false, 1, [], {}, 'x'.repeat(129), '😀'.repeat(64) + 'x']) {
    for (const field of ['sourceMultiplicity', 'targetMultiplicity']) {
      const envelope = JSON.parse(new TextDecoder().decode(serializeProjectFile(state)));
      const file = envelope.files.find(file => file.path.startsWith('model/relationships/'));
      const record = JSON.parse(file.content); record[field] = value; file.content = JSON.stringify(record);
      const before = capture(store), malformed = JSON.stringify(envelope);
      assert.throws(() => deserializeProjectFile(malformed), { code: 'SCHEMA' });
      assert.throws(() => loadProjectFile(store, malformed, store.revision), { code: 'SCHEMA' });
      assert.deepEqual(capture(store), before);
    }
  }
  state.relationships[0].sourceMultiplicity = '-1'; state.relationships[0].targetMultiplicity = '3..2';
  assert.equal(deserializeProjectFile(serializeProjectFile(state)).relationships[0].sourceMultiplicity, '-1');
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});

test('Mermaid projects independent ends as escaped text with an explicit approximation disclosure', () => {
  const state = relationshipProject(), relation = state.relationships[0];
  const original = structuredClone(state);
  const viewId = state.views[0].view.id;
  const baseline = exportMermaid(state, viewId);
  assert.ok(!baseline.includes(warning));
  relation.sourceMultiplicity = ''; relation.targetMultiplicity = '*';
  let output = exportMermaid(state, viewId);
  assert.equal(output.split(warning).length, 2);
  assert.ok(decodeLabels(output).includes('[source multiplicity=""; target multiplicity="*"]'));
  const attack = '"]\r\nclick EVIL "javascript:alert(1)" <img src=x> %%{init}%%';
  relation.sourceMultiplicity = attack; delete relation.targetMultiplicity;
  output = exportMermaid(state, viewId);
  assert.equal(output.split('\n').length, baseline.split('\n').length + 1);
  assert.ok(decodeLabels(output).includes('source multiplicity='));
  assert.ok(!decodeLabels(output).includes('target multiplicity='));
  for (const line of output.split('\n').filter(line => line.startsWith('  '))) {
    assert.doesNotMatch(line.replaceAll('-->', ''), /[<>%&`$:]/);
    assert.match(line, /^  n_[0-9a-f]{32}(?:\["[a-zA-Z0-9_.#;-]+"\]| -->\|"[a-zA-Z0-9_.#;-]+"\| n_[0-9a-f]{32})$/);
  }
  assert.deepEqual(state.views, original.views);
  assert.deepEqual(state.elements, original.elements);
  assert.equal(state.relationships[0].sourceMultiplicity, attack);
  assert.deepEqual(exportMermaid(deserializeProjectFile(serializeProjectFile(state)), viewId), output);
});

test('unshown end values and other views do not leak into a selected Mermaid projection', () => {
  const state = relationshipProject(), viewId = state.views[0].view.id;
  const baseline = exportMermaid(state, viewId);
  state.relationships.at(-1).sourceMultiplicity = 'PRIVATE UNDRAWN VALUE';
  assert.equal(exportMermaid(state, viewId), baseline);
  state.relationships[0].targetMultiplicity = '*';
  assert.equal(exportMermaid(state, state.views[2].view.id), 'flowchart LR\n%% relationship semantics UNKNOWN; not normative notation\n');
  assert.ok(!exportMermaid(state, viewId).includes('PRIVATE'));
});

test('multiplicity annotations share the existing exact Mermaid byte budget and never truncate stored data', () => {
  const state = relationshipProject(), view = state.views[0];
  const relation = state.relationships[0]; relation.sourceMultiplicity = '😀'.repeat(64); relation.targetMultiplicity = '😀'.repeat(64);
  view.connections = Array.from({ length: 50 }, (_, index) => ({ ...structuredClone(view.connections[0]), id: fixtureId('conn', 1000 + index) }));
  const before = serializeProjectFile(state);
  assert.equal(MERMAID_LIMITS.outputBytes, 48000);
  assert.throws(() => exportMermaid(state, view.view.id), { code: 'MERMAID_LIMIT' });
  assert.deepEqual(serializeProjectFile(state), before);
});
