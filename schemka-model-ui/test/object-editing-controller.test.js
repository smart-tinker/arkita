import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { createCurrentFixture } from './current-fixture.js';
import { createStore } from '../../schemka-model-core/src/index.js';
import { viewpointGraph } from '../../schemka-model-core/fixtures/viewpoint-project.js';

test('controller resize cancels preview, keeps selection, affects only its view and follows dirty undo/redo', () => {
  const model = createController(createCurrentFixture()), session = createProjectSession(model.store);
  const before = model.store.exportFiles(), occurrence = model.view.occurrences[0];
  model.select({ kind: 'occurrence', id: occurrence.id }); model.beginDrag(occurrence.id); model.previewDrag(40, 10);
  model.execute({ type: 'resizeOccurrence', viewId: model.viewId, occurrenceId: occurrence.id, width: 300, height: 150 });
  assert.equal(model.drag, null); assert.equal(session.dirty, true);
  assert.deepEqual(model.selection, { kind: 'occurrence', id: occurrence.id });
  assert.deepEqual(model.view.occurrences[0].bounds, { ...occurrence.bounds, width: 300, height: 150 });
  const edited = model.store.exportFiles();
  model.switchView(model.store.snapshot.views[1].view.id); model.undo();
  assert.deepEqual(model.store.exportFiles(), before); assert.equal(session.dirty, false);
  model.redo(); assert.deepEqual(model.store.exportFiles(), edited); assert.equal(session.dirty, true);
});

test('controller rejects resize for viewpoint-hidden drawing without state or history changes', () => {
  const model = createController(createStore(viewpointGraph().state));
  const hidden = model.store.snapshot.views[0].occurrences.find(item => !model.view.occurrences.some(visible => visible.id === item.id));
  assert.ok(hidden);
  const before = model.store.exportFiles();
  assert.throws(() => model.execute({ type: 'resizeOccurrence', viewId: model.viewId, occurrenceId: hidden.id, width: 300, height: 150 }), /исключён/);
  assert.deepEqual(model.store.exportFiles(), before); assert.deepEqual(model.store.history, { undo: 0, redo: 0 });
});

test('controller shared property edits retain concept selection with no drawings and undo the whole record', () => {
  const state = createCurrentFixture().snapshot; state.views = [];
  const model = createController(createStore(state)), before = model.store.exportFiles();
  const concept = { kind: 'relationship', id: state.relationships[0].id };
  model.select(concept);
  model.execute({ type: 'updateConceptProperties', concept, properties: propertyEntries({ owner: 'Architecture team' }) });
  assert.deepEqual(model.selection, concept);
  assert.deepEqual(model.store.snapshot.relationships[0].properties, propertyEntries({ owner: 'Architecture team' }));
  model.undo(); assert.deepEqual(model.store.exportFiles(), before); assert.deepEqual(model.selection, concept);
});
