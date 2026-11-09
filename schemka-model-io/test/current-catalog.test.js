import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_CATALOG, CURRENT_METAMODEL, createProject, createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { relationshipProject } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid } from '../src/index.js';
const capture = store => ({ state: store.snapshot, bytes: serializeProjectFile(store.snapshot), revision: store.revision, history: store.history });

test('all current type IDs, shared views, bends and labels survive the complete native file cycle', () => {
  const original = relationshipProject(), bytes = serializeProjectFile(original);
  const projection = original.views.map(entry => exportMermaid(original, entry.view.id));
  const reopened = deserializeProjectFile(bytes), destination = createStore(createProject('Blank'));
  loadProjectFile(destination, bytes, destination.revision);
  assert.deepEqual(reopened.project.metamodel, CURRENT_METAMODEL);
  assert.deepEqual(new Set(reopened.elements.map(item => item.type)), new Set(CURRENT_CATALOG.elementTypes));
  assert.deepEqual(new Set(reopened.relationships.map(item => item.type)), new Set(CURRENT_CATALOG.relationshipTypes));
  assert.deepEqual(exportFiles(reopened), exportFiles(original));
  assert.deepEqual(destination.exportFiles(), exportFiles(original));
  assert.deepEqual(serializeProjectFile(reopened), bytes);
  assert.deepEqual(reopened.views.map(entry => exportMermaid(reopened, entry.view.id)), projection);
  for (const type of CURRENT_CATALOG.elementTypes) assert.ok(projection[0].includes(type + '#65306;'));
  for (const type of CURRENT_CATALOG.relationshipTypes) assert.ok(projection[0].includes(type + '#65306;'));
  assert.equal(projection[2], 'flowchart LR\n%% relationship semantics UNKNOWN; not normative notation\n');
});

test('unsupported project identity and removed type files cannot replace a current session or its history', () => {
  const store = createStore(relationshipProject());
  store.execute({ type: 'renameProject', name: 'Kept' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision);
  for (const [select, change, code] of [
    [file => file.path === 'schemka.json', record => { record.metamodel = { id: 'schemka-generic', version: 1 }; }, 'VERSION'],
    [file => file.path === 'schemka.json', record => { record.metamodel.version = 99; }, 'VERSION'],
    [file => file.path.startsWith('model/elements/'), record => { record.type = 'Element'; }, 'TYPE'],
    [file => file.path.startsWith('model/relationships/'), record => { record.type = 'Link'; }, 'TYPE'],
  ]) {
    const envelope = JSON.parse(new TextDecoder().decode(serializeProjectFile(relationshipProject())));
    const file = envelope.files.find(select), record = JSON.parse(file.content); change(record); file.content = JSON.stringify(record);
    const malformed = JSON.stringify(envelope), before = capture(store);
    assert.throws(() => deserializeProjectFile(malformed), { code });
    assert.throws(() => loadProjectFile(store, malformed, store.revision), { code });
    assert.deepEqual(capture(store), before);
  }
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});
