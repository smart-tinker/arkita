import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { viewpointGraph, viewpointDefinition, viewpointId } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid } from '../src/index.js';

test('VP-IO-01/02: native envelope preserves definitions, multiple bindings, hidden drawings and both pre-viewpoint forms byte-for-byte', () => {
  const h = viewpointGraph(); h.state.views[1].view.viewpointId = viewpointId;
  for (const state of [conceptProject(), customizationProject(), h.state]) {
    const bytes = serializeProjectFile(state), reopened = deserializeProjectFile(bytes);
    assert.deepEqual(serializeProjectFile(reopened), bytes); assert.deepEqual(exportFiles(reopened), exportFiles(state));
    if (state.viewpoints) { assert.equal(reopened.views[0].connections.length, 2); assert.equal(reopened.views.filter(item => item.view.viewpointId).length, 2); }
    else assert.equal(Object.hasOwn(reopened, 'viewpoints'), false);
  }
});
test('VP-IO-03: enhanced invalid file never replaces existing state, revision or undo/redo', () => {
  const store = createStore(viewpointGraph().state); store.execute({ type: 'renameProject', name: 'past' }, store.revision); store.execute({ type: 'renameProject', name: 'future' }, store.revision); store.undo(store.revision);
  const before = { state: store.snapshot, revision: store.revision, history: store.history };
  const envelope = JSON.parse(new TextDecoder().decode(serializeProjectFile(store.snapshot)));
  envelope.files = envelope.files.filter(file => !file.path.startsWith('viewpoints/'));
  assert.throws(() => loadProjectFile(store, JSON.stringify(envelope), store.revision), { code: 'VIEWPOINT_FORMAT' });
  assert.deepEqual({ state: store.snapshot, revision: store.revision, history: store.history }, before);
});
test('VP-UI-03 refinement: Mermaid rejects governed selected view with native guidance, unrelated unbound exports keep their bytes', () => {
  const h = viewpointGraph(), governed = h.state.views[0].view.id, unbound = h.state.views[1].view.id;
  const expected = exportMermaid(h.state, unbound), before = exportFiles(h.state);
  assert.throws(() => exportMermaid(h.state, governed), error => error.code === 'MERMAID_UNSUPPORTED' && /native/.test(error.message) && /hidden/.test(error.message));
  h.state.viewpoints[0] = { id: viewpointId, ...viewpointDefinition({ elementTypes: [], junctionTypes: [], relationshipTypes: [] }) };
  assert.equal(exportMermaid(h.state, unbound), expected);
  h.state.viewpoints[0] = viewpointGraph().state.viewpoints[0]; assert.deepEqual(exportFiles(h.state), before);
});
