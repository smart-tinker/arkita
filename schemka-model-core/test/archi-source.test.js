import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles, importFiles, validateProject, validateProjectV2 } from '../src/index.js';
import { remapProject } from '../src/project-remap.js';
import { metadataFixture, metadataV2State } from '../fixtures/metadata-compatibility.js';

function sourceModel() {
  const model = importFiles(metadataFixture().files);
  const records = [model.project, ...model.elements, ...model.junctions, ...model.relationships,
    ...model.views.flatMap(entry => [entry.view, ...entry.occurrences, ...entry.connections])];
  for (const item of records) item.archiSource = { version: '5.0.0', modelId: model.project.id, id: item.id, type: item.type ?? 'Drawing', domain: 'Business' };
  return model;
}

test('Archi source provenance survives file roundtrip, editing, Undo/Redo and independent ID remap', () => {
  const model = sourceModel(), files = exportFiles(model), store = createStore(importFiles(files));
  const item = model.elements[0];
  store.execute({ type: 'renameElement', elementId: item.id, name: 'After migration' }, store.revision);
  assert.deepEqual(store.snapshot.elements[0].archiSource, item.archiSource);
  const after = store.exportFiles(); store.undo(store.revision); assert.deepEqual(store.exportFiles(), files);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  const remapped = remapProject(store.snapshot);
  assert.notEqual(remapped.snapshot.project.id, model.project.id);
  assert.deepEqual(remapped.snapshot.project.archiSource, model.project.archiSource);
  assert.deepEqual(remapped.snapshot.elements[0].archiSource, item.archiSource);
  assert.deepEqual(exportFiles(importFiles(exportFiles(remapped.snapshot))), exportFiles(remapped.snapshot));
});

test('Archi source is a strict bounded native v4 field; invalid metadata cannot mutate history', () => {
  const model = sourceModel(), store = createStore(model), before = store.exportFiles();
  for (const patch of [source => { source.id = ''; }, source => { source.version = '6.0.0'; },
    source => { source.untrusted = true; }, source => { source.domain = null; }, source => { source.modelId = 'x'.repeat(8193); }]) {
    const candidate = structuredClone(model); patch(candidate.elements[0].archiSource);
    assert.throws(() => validateProject(candidate));
    assert.throws(() => store.execute({ type: 'applyProjectSnapshot', files: before.map(file => file.path.endsWith(`${candidate.elements[0].id}.json`) ? { ...file, content: JSON.stringify(candidate.elements[0]) } : file) }, store.revision));
    assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, { undo: 0, redo: 0 });
  }
  const legacy = metadataV2State(); legacy.elements[0].archiSource = model.elements[0].archiSource;
  assert.throws(() => validateProjectV2(legacy), { code: 'SCHEMA' });
});
