import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, validateProject, exportFiles, importFiles, selectViewpointConcepts, projectView, CURRENT_CATALOG, LIMITS } from '../src/index.js';
import { viewpointGraph, viewpointDefinition, viewpointId } from '../fixtures/viewpoint-project.js';
import { fixtureId } from '../fixtures/relationship-project.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { customizationProject } from '../fixtures/customization-project.js';
import { assessProject, CURRENT_PROFILE, createRegistry, getVerifiedJunctionAssessment } from '../../schemka-model-profiles/src/index.js';
const run = (store, command) => store.execute(command, store.revision);
const captured = store => ({ state: store.snapshot, revision: store.revision, history: store.history });
const project = h => projectView(h.state, h.state.views[0].view.id);
const concepts = h => selectViewpointConcepts(h.state, viewpointId);
const fieldset = (elementTypes, junctionTypes = [], relationshipTypes = []) => ({ elementTypes, junctionTypes, relationshipTypes });

test('VP-META-01/02/03/06: complete inert metadata, multiple labels, cross-domain selection and no generated concepts', () => {
  const { state } = viewpointGraph(), before = structuredClone(state.elements), d = state.viewpoints[0];
  d.name = '  Exact\r\nname  '; d.stakeholders = ['A role that is not a model element'];
  d.purpose = ['designing', 'deciding', 'informing']; d.content = ['details', 'overview']; d.selection.elementTypes = ['Goal', 'Device', 'ApplicationComponent'];
  assert.equal(validateProject(state), state); assert.deepEqual(state.elements, before);
  for (const field of ['stakeholders', 'concerns']) for (const value of [[], [' '], ['ok', ''], 'text', Array(65).fill('role')]) {
    const bad = structuredClone(state); bad.viewpoints[0][field] = value; assert.throws(() => validateProject(bad));
  }
  for (const field of ['purpose', 'content']) for (const value of [[], ['unexpected'], [d[field][0], d[field][0]]]) {
    const bad = structuredClone(state); bad.viewpoints[0][field] = value; assert.throws(() => validateProject(bad));
  }
});
test('VP-META-04/05/07 and VP-AUTH-01: exact selectors and closed representation grammar, no wildcard/markup/trusted authority', () => {
  const h = viewpointGraph({ selection: fieldset([]) }); assert.deepEqual(project(h).occurrences, []); assert.deepEqual(project(h).connections, []);
  const mutations = [d => d.selection.elementTypes = ['*'], d => d.selection.elementTypes = ['ApplicationComponent', 'ApplicationComponent'], d => d.selection.junctionTypes = ['Grouping'], d => d.selection.relationshipTypes = ['relation'], d => d.representation.kind = 'table', d => d.representation.notation = 'html', d => d.representation.labels = 'script', d => d.representation.css = 'x', d => d.selection.script = 'run', d => d.name = ' ', d => d.documentation = 'x'.repeat(LIMITS.string + 1)];
  for (const field of ['trusted', 'source', 'svg', 'html', 'script', 'profileApplications']) mutations.push(d => d[field] = 'forged');
  for (const mutate of mutations) { const bad = structuredClone(h.state); bad.viewpoints[0].name = 'schemka-archimate4'; mutate(bad.viewpoints[0]); assert.throws(() => validateProject(bad)); }
  const all = structuredClone(h.state); all.viewpoints[0].selection = fieldset([...CURRENT_CATALOG.elementTypes], [...CURRENT_CATALOG.junctionTypes], [...CURRENT_CATALOG.relationshipTypes]); validateProject(all);
});
test('VP-PROJ-01/02/13: exact default selection, unbound preservation and detached deterministic results without history or geometry changes', () => {
  const h = viewpointGraph(), store = createStore(h.state), before = captured(store), p = project(h), s = concepts(h);
  assert.deepEqual(h.names([...s.elementIds, ...s.relationshipIds]), ['A', 'D', 'R']);
  assert.deepEqual(h.names(p.occurrences), ['oA', 'oD']); assert.deepEqual(h.names(p.connections), ['cR']);
  assert.equal(s.excludedConcepts.find(item => item.id === h.ids.S).reason, 'endpoint-concept-excluded');
  assert.deepEqual(project(h), p); p.connections[0].routePoints[0].point.x = 999; p.view.name = 'detached';
  assert.deepEqual(captured(store), before); assert.deepEqual(h.state, before.state);
  delete h.state.views[0].view.viewpointId; const unbound = project(h);
  assert.equal(unbound.viewpointId, null); assert.deepEqual(unbound.occurrences, h.state.views[0].occurrences); assert.deepEqual(unbound.connections, h.state.views[0].connections);
});
test('VP-PROJ-03/04: Access variants, Grouping, Location and junctions need explicit exact selections', () => {
  const h = viewpointGraph({ types: { A: 'ApplicationComponent', D: 'DataObject', G: 'Grouping', L: 'Location', J: 'AndJunction' }, relationships: { R: ['Access', 'A', 'D'], Q: ['ReadAccess', 'A', 'D'], W: ['WriteAccess', 'A', 'D'], B: ['ReadWriteAccess', 'A', 'D'] }, selection: fieldset(['ApplicationComponent', 'DataObject'], [], ['Access']) });
  assert.deepEqual(h.names(concepts(h).relationshipIds), ['R']); assert.deepEqual(h.names(concepts(h).elementIds), ['A', 'D']); assert.deepEqual(concepts(h).junctionIds, []);
});
test('VP-PROJ-05: partial visible junction never changes full-model graph assessments', () => {
  const h = viewpointGraph({ types: { A: 'ApplicationComponent', J: 'AndJunction', X: 'Device' }, relationships: { I: ['Flow', 'A', 'J'], O: ['Flow', 'J', 'X'] }, selection: fieldset(['ApplicationComponent'], ['AndJunction'], ['Flow']) });
  const registry = createRegistry([CURRENT_PROFILE]), before = assessProject(h.state, registry), p = project(h);
  assert.deepEqual(h.names([...p.elementIds, ...p.junctionIds, ...p.relationshipIds]), ['A', 'I', 'J']);
  assert.deepEqual(assessProject(h.state, registry), before); assert.ok(getVerifiedJunctionAssessment(before.junctionAssessment));
});
test('VP-PROJ-06: excluded relationship host suppresses its selected dependent without implicit host inclusion', () => {
  const h = viewpointGraph({ types: { A: 'ApplicationComponent', B: 'ApplicationComponent', D: 'DataObject' }, relationships: { H: ['Flow', 'A', 'B'], Q: ['Association', 'H', 'D'] }, selection: fieldset(['ApplicationComponent', 'DataObject'], [], ['Association']) });
  assert.deepEqual(concepts(h).relationshipIds, []); assert.equal(concepts(h).excludedConcepts.find(item => item.id === h.ids.H).reason, 'type-excluded'); assert.equal(concepts(h).excludedConcepts.find(item => item.id === h.ids.Q).reason, 'endpoint-concept-excluded');
});
test('VP-PROJ-07/08/09: self and mutual relationship/drawing cycles survive; an excluded endpoint removes a dependent cycle', () => {
  for (const relationships of [{ R: ['Association', 'R', 'A'] }, { R: ['Association', 'S', 'A'], S: ['Association', 'R', 'A'] }]) {
    const h = viewpointGraph({ types: { A: 'ApplicationComponent' }, relationships, selection: fieldset(['ApplicationComponent'], [], ['Association']) }), p = project(h);
    assert.deepEqual(h.names(p.relationshipIds), Object.keys(relationships).sort()); assert.equal(p.connections.length, Object.keys(relationships).length);
    assert.deepEqual(p.connections, h.state.views[0].connections);
  }
  const h = viewpointGraph({ types: { A: 'ApplicationComponent', X: 'Device' }, relationships: { R: ['Association', 'S', 'X'], S: ['Association', 'R', 'A'] }, selection: fieldset(['ApplicationComponent'], [], ['Association']) });
  assert.deepEqual(concepts(h).relationshipIds, []); assert.deepEqual(project(h).connections, []);
});
test('VP-PROJ-10/11: repeated occurrence and repeated relationship host keep exact endpoint and anchor identity', () => {
  const h = viewpointGraph({ types: { A: 'ApplicationComponent', B: 'ApplicationComponent', D: 'DataObject' }, relationships: { R: ['Flow', 'A', 'B'], Q: ['Association', 'R', 'D'] }, selection: fieldset(['ApplicationComponent', 'DataObject'], [], ['Flow', 'Association']) }), entry = h.state.views[0];
  const oa2 = { ...structuredClone(entry.occurrences[0]), id: fixtureId('occ', 999) }; entry.occurrences.push(oa2);
  entry.connections[0].source.id = oa2.id;
  const host2 = { ...structuredClone(entry.connections[0]), id: fixtureId('conn', 999) }; host2.routePoints[0].id = fixtureId('anc', 999); entry.connections.push(host2);
  entry.connections[1].source = { kind: 'connection', id: host2.id, anchorId: host2.routePoints[0].id }; validateProject(h.state);
  const p = project(h); assert.deepEqual(p.occurrences, entry.occurrences); assert.deepEqual(p.connections, entry.connections);
  assert.equal(p.connections[0].source.id, oa2.id); assert.deepEqual(p.connections[1].source, entry.connections[1].source);
});
test('VP-PROJ-12/14: matching undrawn records stay available without population, empty selection preserves stored data', () => {
  const h = viewpointGraph(); h.state.views[0].occurrences = h.state.views[0].occurrences.filter(item => item.concept.id === h.ids.A); h.state.views[0].connections = [];
  validateProject(h.state); assert.deepEqual(h.names(project(h).undrawnConcepts), ['D', 'R']); assert.equal(project(h).occurrences.length, 1);
  const before = structuredClone(h.state); h.state.viewpoints[0].selection = fieldset([]); assert.equal(project(h).occurrences.length, 0); assert.equal(project(h).excludedDrawings.length, 1); assert.deepEqual(h.state.views, before.views);
});
test('VP-HISTORY-01/02/03/04: shared definitions, create binding, copy, exact undo/redo, stale/invalid rejection, explicit unbind and final omission', () => {
  const h = viewpointGraph(), store = createStore(h.state), v1 = h.state.views[0].view.id;
  const v2 = run(store, { type: 'duplicateView', viewId: v1, name: 'Shared' }).created.viewId;
  const duplicate = store.snapshot.views.find(item => item.view.id === v2); assert.equal(duplicate.view.viewpointId, viewpointId);
  assert.ok(duplicate.connections.every(item => !h.state.views[0].connections.some(old => old.id === item.id || old.routePoints[0].id === item.routePoints[0].id)));
  assert.deepEqual(duplicate.connections.map(item => item.relationshipId), h.state.views[0].connections.map(item => item.relationshipId));
  const before = captured(store), definition = viewpointDefinition(fieldset([])); const update = run(store, { type: 'updateViewpoint', viewpointId, definition });
  assert.deepEqual(update.affectedViewIds, [v1, v2].sort()); const after = captured(store); assert.equal(after.history.undo, before.history.undo + 1); assert.deepEqual(after.state.views, before.state.views); assert.deepEqual(after.state.relationships, before.state.relationships);
  store.undo(store.revision); assert.deepEqual(store.snapshot, before.state); store.redo(store.revision); assert.deepEqual(store.snapshot, after.state); store.undo(store.revision);
  for (const command of [{ type: 'deleteViewpoint', viewpointId }, { type: 'updateViewpoint', viewpointId, definition: { ...definition, stakeholders: [] } }, { type: 'setViewpoint', viewId: v1, viewpointId: fixtureId('vpt', 999) }]) { const prior = captured(store); assert.throws(() => run(store, command)); assert.deepEqual(captured(store), prior); }
  assert.throws(() => run(store, { type: 'deleteViewpoint', viewpointId }), error => error.code === 'REFERENCE' && error.message.includes(v1) && error.message.includes(v2));
  const prior = captured(store); assert.throws(() => store.execute({ type: 'createViewpoint', definition }, store.revision - 1), { code: 'REVISION' }); assert.deepEqual(captured(store), prior);
  const created = run(store, { type: 'createViewpoint', definition }).created.viewpointId;
  const fresh = run(store, { type: 'createView', name: 'Bound at creation', viewpointId: created }); assert.equal(store.snapshot.views.at(-1).view.viewpointId, created); assert.deepEqual(fresh.affectedViewIds, [fresh.created.viewId]);
  for (const entry of store.snapshot.views.filter(item => item.view.viewpointId)) run(store, { type: 'setViewpoint', viewId: entry.view.id, viewpointId: null });
  run(store, { type: 'deleteViewpoint', viewpointId }); run(store, { type: 'deleteViewpoint', viewpointId: created }); assert.equal(Object.hasOwn(store.snapshot, 'viewpoints'), false);
  assert.ok(store.snapshot.views.every(item => !Object.hasOwn(item.view, 'viewpointId'))); assert.ok(!store.exportFiles().some(item => item.path.startsWith('viewpoints/')));
});
test('VP-IO-01/02/03: canonical absence, native enhanced folder roundtrip, hostile imports and failed-load atomicity', () => {
  for (const state of [conceptProject(), customizationProject(), viewpointGraph().state]) {
    const files = exportFiles(state); assert.deepEqual(exportFiles(importFiles(files.slice().reverse())), files);
    if (!state.viewpoints) assert.equal(Object.hasOwn(importFiles(files), 'viewpoints'), false);
  }
  const h = viewpointGraph(), store = createStore(h.state); run(store, { type: 'renameProject', name: 'past' }); run(store, { type: 'renameProject', name: 'future' }); store.undo(store.revision);
  const good = store.exportFiles(), vp = good.find(file => file.path.startsWith('viewpoints/'));
  for (const files of [[...good, vp], good.map(file => file === vp ? { ...vp, path: `viewpoints/${fixtureId('vpt', 88)}.json` } : file), good.filter(file => file !== vp), good.map(file => file === vp ? { ...vp, content: vp.content.replace('"name":', '"name":"duplicate","name":') } : file)]) {
    const before = captured(store); assert.throws(() => store.load(files, store.revision)); assert.deepEqual(captured(store), before);
  }
  for (const mutate of [s => s.viewpoints = [], s => s.viewpoints.push(s.viewpoints[0]), s => s.views[0].view.viewpointId = null, s => s.viewpoints[0].concerns = Array(65).fill('concern'), s => s.viewpoints[0].documentation = 'x'.repeat(8193), s => s.viewpoints[0].concerns = Array(64).fill('x'.repeat(8192))]) {
    const bad = structuredClone(h.state); mutate(bad); assert.throws(() => validateProject(bad));
  }
  let calls = 0; const hostile = structuredClone(h.state); Object.defineProperty(hostile.viewpoints[0], 'name', { enumerable: true, get() { calls++; return 'unsafe'; } });
  for (const action of [() => validateProject(hostile), () => selectViewpointConcepts(hostile, viewpointId), () => projectView(hostile, h.state.views[0].view.id)]) assert.throws(action, { code: 'JSON_VALUE' }); assert.equal(calls, 0);
});
test('VP-AUTH-02/03 and VP-CH14-01: full-model assessments and customization remain independent of filtering', () => {
  const state = customizationProject(), registry = createRegistry([CURRENT_PROFILE]), before = assessProject(state, registry);
  state.viewpoints = [{ id: viewpointId, ...viewpointDefinition(fieldset([])) }]; state.views[0].view.viewpointId = viewpointId;
  assert.equal(projectView(state, state.views[0].view.id).occurrences.length, 0); assert.deepEqual(assessProject(state, registry), before);
  state.customizationProfiles[0].name = 'Changed customization'; state.viewpoints[0].selection = fieldset(['Grouping']);
  assert.deepEqual(projectView(state, state.views[0].view.id).elementIds, [state.elements.find(item => item.type === 'Grouping').id]);
  assert.equal(assessProject(state, registry).normative.status, 'UNKNOWN');
});
