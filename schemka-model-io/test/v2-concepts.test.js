import { completeCurrentFixture } from '../../schemka-model-core/fixtures/current-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, validateProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid } from '../src/index.js';

const id = (kind, n) => `${kind}-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ref = (kind, n) => ({ kind, id: id({ element: 'el', junction: 'jct', relationship: 'rel' }[kind], n) });
const occ = n => ({ kind: 'occurrence', id: id('occ', n) });
const anchor = n => ({ kind: 'connection', id: id('conn', n), anchorId: id('anc', n) });
function graph() {
  const state = createProject('Current v2 concept graph');
  state.elements = [1, 2].map(n => ({ id: id('el', n), type: 'Process', name: `E${n}`, documentation: 'Exact\r\ntext', properties: { raw: '<>' } }));
  state.junctions = [1, 2].map(n => ({ id: id('jct', n), type: n === 1 ? 'AndJunction' : 'OrJunction', name: `J${n}`, documentation: '', properties: {} }));
  const relation = (n, type, source, target) => ({ id: id('rel', n), type, source, target, label: `R${n}`, documentation: '', properties: {}, sourceMultiplicity: '', targetMultiplicity: ' 1\r\n ' });
  state.relationships = [
    relation(1, 'Flow', ref('element', 1), ref('junction', 1)),
    relation(2, 'Flow', ref('junction', 1), ref('element', 2)),
    relation(3, 'Association', ref('element', 1), ref('relationship', 1)),
    relation(4, 'Association', ref('relationship', 3), ref('relationship', 4)),
    relation(5, 'Association', ref('relationship', 5), ref('element', 2)),
    relation(6, 'Association', ref('relationship', 7), ref('element', 1)),
    relation(7, 'Association', ref('relationship', 6), ref('element', 2)),
  ];
  const concepts = [ref('element', 1), ref('element', 2), ref('junction', 1), ref('junction', 2)];
  const occurrences = concepts.map((concept, i) => ({ id: id('occ', i + 1), concept, bounds: { x: i * 120, y: 0, width: 80, height: 50 }, parentOccurrenceId: null, zIndex: i }));
  const endpoints = [[occ(1), occ(3)], [occ(3), occ(2)], [occ(1), anchor(1)], [anchor(3), anchor(4)], [anchor(5), occ(2)], [anchor(7), occ(1)], [anchor(6), occ(2)]];
  const connections = endpoints.map(([source, target], i) => ({ id: id('conn', i + 1), relationshipId: id('rel', i + 1), source, target,
    routePoints: [{ kind: 'bend', point: { x: 10.1, y: -20.2 } }, { kind: 'anchor', id: id('anc', i + 1), point: { x: 130.3 + i, y: 150.4 } }], labelPosition: { x: -10.5, y: 3.6 } }));
  state.views = [{ view: { id: id('view', 1), name: 'Pinned cycles', documentation: '', properties: {} }, occurrences, connections }];
  return validateProject(completeCurrentFixture(state));
}

test('native v2 preserves junctions, relationship endpoints, pinned self/mutual references and exact raw values', () => {
  const state = graph(), before = structuredClone(state), bytes = serializeProjectFile(state);
  const loaded = deserializeProjectFile(bytes);
  assert.equal(loaded.project.formatVersion, 4);
  assert.equal(loaded.project.metamodel.version, 2);
  assert.deepEqual(exportFiles(loaded), exportFiles(state));
  assert.deepEqual(serializeProjectFile(loaded), bytes);
  assert.deepEqual(state, before);
  const reordered = structuredClone(state);
  reordered.relationships.reverse(); reordered.junctions.reverse(); reordered.views[0].connections.reverse();
  assert.deepEqual(serializeProjectFile(reordered), bytes);
  const store = createStore(createProject('Destination'));
  loadProjectFile(store, bytes, store.revision);
  assert.deepEqual(store.exportFiles(), exportFiles(state));
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
});

test('core v1 and unsupported identities reject atomically inside the unchanged transport envelope', () => {
  const store = createStore(graph());
  store.execute({ type: 'renameProject', name: 'Pending redo' }, store.revision); store.undo(store.revision);
  const before = { files: store.exportFiles(), revision: store.revision, history: store.history };
  for (const version of [1, 0, 5]) {
    const envelope = JSON.parse(new TextDecoder().decode(serializeProjectFile(graph())));
    const file = envelope.files.find(item => item.path === 'schemka.json');
    const header = JSON.parse(file.content); header.formatVersion = version; file.content = JSON.stringify(header);
    assert.equal(envelope.formatVersion, 1); // Transport grammar did not change.
    assert.throws(() => loadProjectFile(store, JSON.stringify(envelope), store.revision), { code: 'VERSION' });
    assert.deepEqual({ files: store.exportFiles(), revision: store.revision, history: store.history }, before);
  }
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Pending redo');
});

test('unsupported Mermaid concept projection fails explicitly without losing native data', () => {
  const state = graph(), before = serializeProjectFile(state);
  assert.throws(() => exportMermaid(state, state.views[0].view.id), { code: 'MERMAID_UNSUPPORTED' });
  assert.deepEqual(serializeProjectFile(state), before);
  const elementOnly = structuredClone(state);
  elementOnly.views[0].occurrences = elementOnly.views[0].occurrences.filter(item => item.concept.kind === 'element');
  elementOnly.views[0].connections = [];
  assert.match(exportMermaid(elementOnly, elementOnly.views[0].view.id), /^flowchart LR/);
});
