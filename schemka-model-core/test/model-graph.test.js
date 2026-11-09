import { completeCurrentFixture } from '../fixtures/current-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, CURRENT_CATALOG, queryModelGraph, planGeneratedView, analyzeModelQuality, exportFiles, importFiles, validateProject } from '../src/index.js';
import { fixtureId as id } from '../fixtures/relationship-project.js';
import { conceptProject } from '../fixtures/concept-project.js';

const ref = (kind, value) => ({ kind, id: id(kind === 'element' ? 'el' : kind === 'junction' ? 'jct' : 'rel', value) });
const names = result => result.nodes.map(item => item.id).sort();
const snapshot = store => ({ files: store.exportFiles(), history: store.history, revision: store.revision });
function simple() {
  const state = createProject('Синтетическая модель');
  state.elements = [1, 2, 3, 4].map(value => ({ id: id('el', value), type: value === 4 ? 'Node' : 'ApplicationComponent', name: value < 3 ? 'Одинаковое имя' : `Имя ${value}`, documentation: '', properties: {} }));
  state.relationships = [[1, 2], [2, 3], [3, 1], [4, 1]].map(([a, b], at) => ({ id: id('rel', at + 1), type: at === 3 ? 'Flow' : 'Association', label: `Связь ${at + 1}`, source: ref('element', a), target: ref('element', b), documentation: '', properties: {} }));
  state.views = [{ view: { id: id('view', 1), name: 'Пустой', documentation: '', properties: {} }, occurrences: [], connections: [] }];
  return validateProject(completeCurrentFixture(state));
}
function viewpoint(state, types = ['ApplicationComponent']) {
  state.viewpoints = [{ id: id('vpt', 1), name: 'Applications', documentation: '', stakeholders: ['Reader'], concerns: ['Apps'], purpose: ['informing'], content: ['details'],
    selection: { elementTypes: types, junctionTypes: [...CURRENT_CATALOG.junctionTypes], relationshipTypes: [...CURRENT_CATALOG.relationshipTypes] }, representation: { kind: 'diagram', notation: 'archimate', labels: 'name-and-type' } }];
  return id('vpt', 1);
}

test('one-hop direction queries include the relationship concept and its exact other endpoint throughout the model', () => {
  const state = simple(), before = exportFiles(state), roots = [ref('element', 1)];
  assert.deepEqual(names(queryModelGraph(state, { roots, direction: 'outgoing' })), [id('el', 1), id('el', 2), id('rel', 1)].sort());
  assert.deepEqual(names(queryModelGraph(state, { roots, direction: 'incoming' })), [id('el', 1), id('el', 3), id('el', 4), id('rel', 3), id('rel', 4)].sort());
  const both = queryModelGraph(state, { roots, direction: 'both' });
  assert.equal(both.nodes.length, 7); assert.equal(both.relationships.length, 3); assert.equal(both.nodes.filter(item => item.root).length, 1);
  assert.equal(new Set(both.nodes.map(item => item.id)).size, both.nodes.length); assert.deepEqual(exportFiles(state), before);
});

test('increasing depth preserves earlier nodes, is deterministic by ID and terminates cycles with an explicit size limit', () => {
  const state = simple(), roots = [ref('element', 1)];
  const first = queryModelGraph(state, { roots, direction: 'outgoing', depth: 1 });
  const deep = queryModelGraph(state, { roots, direction: 'outgoing', depth: 8 });
  assert.ok(names(first).every(value => names(deep).includes(value))); assert.equal(deep.nodes.length, 6);
  const changed = structuredClone(state); changed.elements.reverse(); changed.relationships.reverse();
  assert.deepEqual(queryModelGraph(changed, { roots, direction: 'outgoing', depth: 8 }), deep);
  const bounded = queryModelGraph(state, { roots, depth: 8, limit: 3 }); assert.equal(bounded.truncated, true); assert.ok(bounded.nodes.length <= 3);
  assert.equal(queryModelGraph(state, { roots, depth: 0 }).nodes.length, 1);
});

test('typed relationship and junction roots retain cycles, their own endpoints and references from other relationships', () => {
  const state = conceptProject();
  for (const root of [ref('relationship', 1), ref('relationship', 10), ref('relationship', 11), ref('junction', 1)]) {
    const result = queryModelGraph(state, { roots: [root], depth: 8 });
    assert.ok(names(result).includes(root.id)); assert.equal(result.truncated, false); assert.ok(result.visited <= 16);
    for (const relation of result.relationships) { assert.ok(relation.source.kind); assert.ok(relation.target.kind); }
  }
  const first = queryModelGraph(state, { roots: [ref('relationship', 1)], depth: 0 });
  assert.deepEqual(first.boundaryRelationships, [id('rel', 1)]); assert.equal(first.relationships[0].sourceVisible, false);
  assert.throws(() => queryModelGraph(state, { roots: [{ kind: 'element', id: id('rel', 1) }] }), { code: 'REFERENCE' });
});

test('viewpoint and type filters explicitly report hidden roots, suppress dependent relationships and reset without mutation', () => {
  const state = simple(), viewpointId = viewpoint(state), before = exportFiles(state);
  const hidden = queryModelGraph(state, { roots: [ref('element', 4)], viewpointId, depth: 8 });
  assert.equal(hidden.nodes.length, 0); assert.equal(hidden.hiddenRoots[0].reason, 'viewpoint');
  const filtered = queryModelGraph(state, { roots: [ref('element', 1)], relationshipTypes: ['Association'], depth: 8 });
  assert.ok(!names(filtered).includes(id('el', 4))); assert.ok(!names(filtered).includes(id('rel', 4)));
  assert.equal(filtered.excluded[0].reason, 'type-filter');
  const visible = queryModelGraph(state, { roots: [ref('element', 4)], depth: 8 }); assert.ok(visible.nodes.length > 0);
  assert.deepEqual(exportFiles(state), before);
});

test('graph query validates caller options at the boundary without invoking accessors or exceeding explicit bounds', () => {
  const state = simple(), roots = [ref('element', 1)]; let getter = 0;
  for (const options of [{ roots, depth: 9 }, { roots, depth: .5 }, { roots, limit: 257 }, { roots, limit: 0 }, { roots: [] }, { roots, direction: 'up' }, { roots, elementTypes: ['Arbitrary'] }, { roots, elementTypes: ['Node', 'Node'] }, { roots, extra: true }]) assert.throws(() => queryModelGraph(state, options));
  assert.throws(() => queryModelGraph(state, { roots, get depth() { getter++; return 1; } })); assert.equal(getter, 0);
});

test('generation preview includes relationship endpoint closure with explicit support and filters its dependent cycle together', () => {
  const state = conceptProject(), before = exportFiles(state);
  const plan = planGeneratedView(state, { concepts: [ref('relationship', 11)], relationshipMode: 'selected' });
  assert.deepEqual(plan.concepts.map(item => item.id).sort(), [id('el', 2), id('jct', 1), id('rel', 11), id('rel', 12)].sort());
  assert.equal(plan.support.length, 3); assert.equal(plan.connectionCount, 2); assert.equal(plan.occurrenceCount, 2);
  const viewpointId = viewpoint(state, []);
  const excluded = planGeneratedView(state, { concepts: [ref('relationship', 11)], viewpointId });
  assert.equal(excluded.concepts.length, 0); assert.equal(excluded.excluded.length, 1);
  delete state.viewpoints; assert.deepEqual(exportFiles(state), before);
});

test('between mode adds relationships among selected concepts but never pulls unrelated components or infers new edges', () => {
  const state = simple();
  const chosen = [ref('element', 1), ref('element', 2)];
  assert.equal(planGeneratedView(state, { concepts: chosen, relationshipMode: 'selected' }).connectionCount, 0);
  const plan = planGeneratedView(state, { concepts: chosen, relationshipMode: 'between' });
  assert.equal(plan.connectionCount, 1); assert.deepEqual(plan.support, [ref('relationship', 1)]);
  const cyclic = conceptProject();
  const noSeeds = planGeneratedView(cyclic, { concepts: [ref('element', 1)], relationshipMode: 'between' });
  assert.ok(!noSeeds.concepts.some(item => item.id === id('rel', 10)));
  const connected = planGeneratedView(cyclic, { concepts: [ref('element', 2), ref('junction', 1)], relationshipMode: 'between' });
  assert.ok(connected.concepts.some(item => item.id === id('rel', 11))); assert.ok(connected.concepts.some(item => item.id === id('rel', 12)));
});

test('generated view reuses every concept, allocates independent drawings/anchors, preserves native cycles and has exact one-step Undo/Redo', () => {
  const state = conceptProject(), store = createStore(state), before = snapshot(store);
  const concepts = [...state.elements.map(item => ({ kind: 'element', id: item.id })), ...state.junctions.map(item => ({ kind: 'junction', id: item.id })), ...state.relationships.map(item => ({ kind: 'relationship', id: item.id }))];
  const result = store.execute({ type: 'generateView', name: 'Сгенерированный 🙂', concepts, viewpointId: null, relationshipMode: 'selected' }, store.revision);
  const next = store.snapshot, entry = next.views.find(item => item.view.id === result.created.viewId);
  assert.deepEqual(next.elements, state.elements); assert.deepEqual(next.junctions, state.junctions); assert.deepEqual(next.relationships, state.relationships); assert.deepEqual(next.views.slice(0, 2), state.views);
  assert.equal(entry.occurrences.length, 4); assert.equal(entry.connections.length, 12); assert.deepEqual(store.history, { undo: 1, redo: 0 });
  const oldIds = new Set(state.views.flatMap(item => [...item.occurrences, ...item.connections].map(item => item.id)));
  for (const item of [...entry.occurrences, ...entry.connections]) assert.ok(!oldIds.has(item.id));
  const after = store.exportFiles(); assert.deepEqual(exportFiles(importFiles(after)), after);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
});

test('generation failures and stale previews preserve files, dirty history and redo', () => {
  const store = createStore(simple()); store.execute({ type: 'renameProject', name: 'Next' }, 0); store.undo(1);
  const command = { type: 'generateView', name: 'New', concepts: [ref('element', 1)], viewpointId: null, relationshipMode: 'between' };
  for (const [change, base] of [[{ concepts: [] }, store.revision], [{ name: 123 }, store.revision], [{ viewpointId: 'missing' }, store.revision], [{ relationshipMode: 'inferred' }, store.revision], [{}, 0]]) {
    const before = snapshot(store); assert.throws(() => store.execute({ ...command, ...change }, base)); assert.deepEqual(snapshot(store), before);
  }
});

test('quality checks use exact concept usages across all views and compare names only inside the same kind/type', () => {
  const store = createStore(simple());
  store.execute({ type: 'generateView', name: 'Usage', concepts: [ref('element', 1), ref('element', 2)], viewpointId: null, relationshipMode: 'between' }, 0);
  const state = store.snapshot, view = state.views.at(-1); view.view.viewpointId = viewpoint(state, ['Node']);
  const before = exportFiles(state), report = analyzeModelQuality(state);
  assert.equal(report.issues.filter(item => item.rule === 'empty-views').length, 1);
  assert.equal(report.issues.filter(item => item.rule === 'viewpoint-hidden')[0].count, 3);
  assert.deepEqual(report.issues.find(item => item.rule === 'viewpoint-hidden').targets.map(item => item.id), [view.view.id, id('el', 1), id('el', 2), id('rel', 1)]);
  assert.equal(report.issues.filter(item => item.rule === 'duplicate-names').length, 1);
  const unused = report.issues.filter(item => item.rule === 'unused-concepts').flatMap(item => item.targets.map(item => item.id));
  assert.ok(!unused.includes(id('el', 1))); assert.ok(!unused.includes(id('rel', 1))); assert.ok(unused.includes(id('el', 4)));
  assert.equal(report.normative, 'UNKNOWN'); assert.equal(analyzeModelQuality(state, []).issues.length, 0); assert.deepEqual(exportFiles(state), before);
  assert.throws(() => analyzeModelQuality(state, ['arbitrary']));
});

test('nesting candidates identify exact view and drawings, compare explicit relations and never infer semantics from decorative groups',()=>{
 const store=createStore(simple()),run=command=>store.execute(command,store.revision).created;
 const viewId=run({type:'createView',name:'Nested'}).viewId;
 const parent=run({type:'addOccurrence',viewId,concept:ref('element',1),bounds:{x:0,y:0,width:500,height:400}}).occurrenceId;
 const child=run({type:'addOccurrence',viewId,concept:ref('element',2),parent:{kind:'occurrence',id:parent},bounds:{x:40,y:50,width:140,height:80}}).occurrenceId;
 const group=run({type:'createVisualNode',viewId,kind:'group',bounds:{x:600,y:0,width:500,height:400}}).visualNodeId;
 run({type:'addOccurrence',viewId,concept:ref('element',2),parent:{kind:'visualNode',id:group},bounds:{x:640,y:50,width:140,height:80}});
 const before=store.exportFiles(),report=analyzeModelQuality(store.snapshot,['nesting-review']);assert.equal(report.normative,'UNKNOWN');assert.equal(report.issues.length,1);
 const issue=report.issues[0];assert.equal(issue.viewId,viewId);assert.equal(issue.parentDrawingId,parent);assert.equal(issue.childDrawingId,child);assert.equal(issue.contained,true);assert.ok(issue.relationshipIds.includes(id('rel',1)));assert.deepEqual(store.exportFiles(),before);
 const changed=store.snapshot;changed.views.find(entry=>entry.view.id===viewId).occurrences.find(item=>item.id===child).bounds.x=900;assert.equal(analyzeModelQuality(changed,['nesting-review']).issues[0].contained,false);
});
