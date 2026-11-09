import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { viewpointGraph } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { createProjectSession } from '../src/project-session.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
const capture = (store, session) => ({ files: store.exportFiles(), history: store.history, revision: store.revision, token: session.documentToken, dirty: session.dirty });

test('every invalid viewpoint marker/reference import preserves session token, history, full store and pending save baseline', async () => {
  const state = viewpointGraph().state, bytes = serializeProjectFile(state);
  const mutations = [
    files => { const h = files.find(f => f.path === 'schemka.json'), v = JSON.parse(h.content); delete v.viewpointFormat; h.content = JSON.stringify(v); },
    files => { const h = files.find(f => f.path === 'schemka.json'); h.content = h.content.replace('"viewpointFormat": 1', '"viewpointFormat": 2'); },
    files => { const h = files.find(f => f.path === 'schemka.json'); h.content = h.content.replace('"viewpointFormat": 1', '"viewpointFormat": 1,"viewpointFormat": 1'); },
    files => files.splice(files.findIndex(f => f.path.startsWith('viewpoints/')), 1),
    files => { const h = files.find(f => f.path.endsWith('/view.json')), v = JSON.parse(h.content); v.viewpointId = fixtureId('vpt', 99); h.content = JSON.stringify(v); },
  ];
  for (const mutate of mutations) {
    const store = createStore(state), session = createProjectSession(store);
    for (const name of ['Past', 'Future']) store.execute({ type: 'renameProject', name }, store.revision); store.undo(store.revision);
    const envelope = JSON.parse(new TextDecoder().decode(bytes)); mutate(envelope.files);
    const before = capture(store, session), pending = session.prepareSave();
    await assert.rejects(session.loadFile(session.beginLoad(), new File([JSON.stringify(envelope)], 'invalid.schemka.json')));
    assert.deepEqual(capture(store, session), before); assert.equal(session.completeSave(pending).dirty, false);
    assert.deepEqual(exportFiles(store.snapshot), before.files);
  }
});
