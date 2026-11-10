import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, snap } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createCurrentFixture as createDemo } from './current-fixture.js';
const fresh = () => createController(createDemo());

test('default and fallback views use canonical ID order without reordering the model or dirty baseline', () => {
  const state = createProject('Canonical presentation');
  const id = number => `view-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  state.views = [3, 1, 2].map(number => ({ view: { id: id(number), name: 'Same name', documentation: '', properties: propertyEntries({}) }, occurrences: [], connections: [], visualNodes: [], visualConnectors: [] }));
  const store = createStore(state), session = createProjectSession(store), controller = createController(store);
  assert.equal(controller.viewId, id(1));
  assert.deepEqual(store.snapshot, state); assert.equal(session.dirty, false);
  const files = store.exportFiles();
  store.load([...files].reverse(), store.revision); controller.afterLoad();
  assert.equal(controller.viewId, id(1)); assert.equal(session.dirty, false);
  assert.deepEqual(store.snapshot.views.map(entry => entry.view.id), [id(3), id(2), id(1)]);
  const remaining = store.snapshot; remaining.views = remaining.views.filter(entry => entry.view.id !== id(1));
  store.load(createStore(remaining).exportFiles().reverse(), store.revision); controller.sanitizeSelection();
  assert.equal(controller.viewId, id(2));
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
});

test('current fixture is synthetic, clean-history, and has two overlapping views', () => {
  const c = fresh(), state = c.store.snapshot;
  assert.deepEqual(state.project.metamodel,{id:'schemka-archimate4',version:2});
  assert.deepEqual(state.elements.map(item=>item.type),['Service','Process','Function']);
  assert.deepEqual(state.relationships.map(item=>item.type),['Serving','Flow']);
  assert.equal(state.views.length, 2); assert.equal(state.elements.length, 3);
  assert.ok(state.views[0].view.id < state.views[1].view.id);
  assert.equal(c.view.view.name, 'Обзор системы');
  assert.deepEqual(c.store.history, { undo: 0, redo: 0 });
  assert.ok(state.views[0].occurrences.every(a => state.views[1].occurrences.some(b => a.concept.id === b.concept.id && a.id !== b.id)));
  assert.equal(state.views[0].connections[0].relationshipId, state.views[1].connections[0].relationshipId);
});
test('shared rename and view-local drag use one global undo/redo history', () => {
  const c = fresh(), before = c.store.snapshot, first = c.view.occurrences[0];
  c.execute({ type: 'renameElement', elementId: first.concept.id, name: '<img> Shared & safe' });
  c.beginDrag(first.id); c.previewDrag(14.26, -4.04); c.commitDrag();
  assert.equal(c.store.history.undo, 2);
  assert.deepEqual(c.store.snapshot.views[1], before.views[1]);
  assert.equal(c.store.snapshot.elements.find(e => e.id === first.concept.id).name, '<img> Shared & safe');
  assert.equal(c.view.occurrences[0].bounds.x, first.bounds.x + 14.3);
  c.switchView(before.views[1].view.id); c.undo();
  assert.deepEqual(c.store.snapshot.views[0], before.views[0]);
  c.undo(); assert.deepEqual(c.store.snapshot, before);
  c.redo(); c.redo(); assert.equal(c.store.history.undo, 2);
});
test('drag preview is transient and many pointer updates commit one command', () => {
  const c = fresh(), before = c.store.exportFiles(), occurrence = c.view.occurrences[0];
  c.beginDrag(occurrence.id);
  for (let i = 0; i < 40; i++) c.previewDrag(i, i / 2);
  assert.deepEqual(c.store.exportFiles(), before); assert.equal(c.store.revision, 0);
  const preview = c.drag; preview.next.x = 999;
  c.commitDrag(); assert.equal(c.store.revision, 1); assert.equal(c.store.history.undo, 1);
  assert.equal(c.view.occurrences[0].bounds.x, occurrence.bounds.x + 39);
});
test('cancel, no-op drag and view switch leave history and bytes unchanged', () => {
  const c = fresh(), before = c.store.exportFiles(), occurrence = c.view.occurrences[0];
  c.beginDrag(occurrence.id); c.previewDrag(300, 20); c.cancelDrag(); assert.equal(c.commitDrag(), null);
  c.beginDrag(occurrence.id); assert.equal(c.commitDrag(), null);
  c.beginDrag(occurrence.id); c.previewDrag(5, 7); c.switchView(c.store.snapshot.views[1].view.id);
  assert.equal(c.commitDrag(), null); assert.deepEqual(c.store.exportFiles(), before); assert.equal(c.store.revision, 0);
});
test('stale drag is rejected and cleared without overriding another command', () => {
  const c = fresh(), first = c.view.occurrences[0];
  c.beginDrag(first.id); c.previewDrag(5, 8);
  c.store.execute({ type: 'renameElement', elementId: first.concept.id, name: 'External edit' }, c.store.revision);
  assert.throws(() => c.commitDrag(), error => error.code === 'REVISION');
  assert.equal(c.drag, null); assert.equal(c.view.occurrences[0].bounds.x, first.bounds.x); assert.equal(c.store.history.undo, 1);
});
test('remove occurrence preserves shared model, while delete preview describes model cascade', () => {
  const c = fresh(), before = c.store.snapshot, occurrence = c.view.occurrences[0];
  c.select({ kind: 'occurrence', id: occurrence.id });
  c.execute({ type: 'removeOccurrence', viewId: c.viewId, occurrenceId: occurrence.id });
  assert.equal(c.selection, null); assert.deepEqual(c.store.snapshot.elements, before.elements);
  assert.deepEqual(c.store.snapshot.relationships, before.relationships); assert.deepEqual(c.store.snapshot.views[1], before.views[1]);
  c.undo(); const impact = c.impact({ kind: 'element', id: occurrence.concept.id });
  assert.equal(impact.occurrenceIds.length, 2); assert.equal(impact.connectionIds.length, 2); assert.equal(impact.viewIds.length, 2);
  c.execute({ type: 'deleteElementFromModel', elementId: occurrence.concept.id });
  assert.ok(!c.store.snapshot.views.some(v => v.occurrences.some(o => o.concept.id === occurrence.concept.id)));
  c.undo(); assert.deepEqual(c.store.snapshot, before);
});
test('connection removal preserves relationship; deleting shared relationship cascades across views', () => {
  const c = fresh(), before = c.store.snapshot, connection = c.view.connections[0];
  c.execute({ type: 'removeConnection', viewId: c.viewId, connectionId: connection.id });
  assert.deepEqual(c.store.snapshot.relationships, before.relationships); assert.equal(c.store.snapshot.views[1].connections.length, 2);
  c.undo(); assert.equal(c.impact({ kind: 'relationship', id: connection.relationshipId }).connectionIds.length, 2);
  c.execute({ type: 'deleteRelationshipFromModel', relationshipId: connection.relationshipId });
  assert.ok(c.store.snapshot.views.every(v => v.connections.every(item => item.relationshipId !== connection.relationshipId)));
  c.undo(); assert.deepEqual(c.store.snapshot, before);
});
test('grid normalization is finite bounded and never negative zero; invalid selection/view are safe', () => {
  assert.equal(snap(1000001), 1000000); assert.equal(snap(-1000001), -1000000); assert.ok(!Object.is(snap(-0.01), -0));
  const c = fresh(); c.select({ kind: 'element', id: 'missing' }); assert.equal(c.selection, null);
  assert.throws(() => c.switchView('missing')); assert.throws(() => c.beginDrag('missing'));
});


test('loaded projects reset view/selection/drag without generating commands, including zero views', () => {
  const c=fresh(); c.select({kind:'occurrence',id:c.view.occurrences[0].id}); c.beginDrag(c.view.occurrences[0].id);
  const empty=c.store.snapshot; empty.views=[];
  const files=createStore(empty).exportFiles(); c.store.load(files,c.store.revision); c.afterLoad();
  assert.equal(c.viewId,null); assert.equal(c.view,undefined); assert.equal(c.selection,null); assert.equal(c.drag,null);
  c.select({kind:'element',id:empty.elements[0].id}); c.execute({type:'renameElement',elementId:empty.elements[0].id,name:'Unshown'});
  assert.equal(c.store.snapshot.elements.find(item=>item.id===empty.elements[0].id).name,'Unshown'); assert.equal(c.store.snapshot.views.length,0);
  const freshEmpty=createController(createStore(empty)); assert.equal(freshEmpty.viewId,null); assert.equal(freshEmpty.view,undefined);
});


test('undo of active created/duplicated view restores prior valid view and clears drag/selection', () => {
  const c=fresh();c.switchView(c.store.snapshot.views[1].view.id);const originalViewId=c.viewId;
  const created=c.execute({type:'createView',name:'New'}).created.viewId;c.switchView(created);
  const occurrence=c.execute({type:'addOccurrence',viewId:created,concept: { kind: 'element', id: c.store.snapshot.elements[0].id },bounds:{x:1,y:2,width:90,height:50}}).created.occurrenceId;
  c.select({kind:'occurrence',id:occurrence});c.beginDrag(occurrence);c.undo();assert.equal(c.selection,null);assert.equal(c.drag,null);
  c.undo();assert.equal(c.viewId,originalViewId);assert.equal(c.selection,null);c.redo();assert.ok(c.store.snapshot.views.some(v=>v.view.id===c.viewId));
});
test('tree reuse command creates only a view-local occurrence and one undo step', () => {
  const c=fresh(),before=c.store.snapshot,id=before.elements[0].id;
  const result=c.execute({type:'addOccurrence',viewId:c.viewId,concept: { kind: 'element', id: id },bounds:{x:0,y:0,width:210,height:90}});
  assert.deepEqual(c.store.snapshot.elements,before.elements);assert.deepEqual(c.store.snapshot.relationships,before.relationships);assert.equal(c.view.occurrences.at(-1).concept.id,id);
  assert.equal(c.store.history.undo,1);assert.ok(result.created.occurrenceId);c.undo();assert.deepEqual(c.store.snapshot,before);
});


test('created/duplicated views roundtrip through full-file IO with exact IDs/layout and canonical dirty history', async () => {
  const c=fresh(),session=createProjectSession(c.store),source=c.viewId;
  const created=c.execute({type:'createView',name:'Empty retained'}).created.viewId;
  const duplicate=c.execute({type:'duplicateView',viewId:source,name:'Copy retained'}).created.viewId;
  c.switchView(duplicate);assert.equal(session.dirty,true);const ticket=session.prepareSave(),files=c.store.exportFiles();session.completeSave(ticket);assert.equal(session.dirty,false);
  const occurrence=c.view.occurrences[0];c.execute({type:'moveOccurrence',viewId:duplicate,occurrenceId:occurrence.id,x:occurrence.bounds.x+1,y:occurrence.bounds.y});assert.equal(session.dirty,true);
  c.undo();assert.equal(session.dirty,false);await session.loadFile(session.beginLoad(),new File([ticket.bytes],ticket.name));c.afterLoad();
  assert.deepEqual(c.store.exportFiles(),files);assert.equal(session.dirty,false);assert.deepEqual(c.store.history,{undo:0,redo:0});
  assert.ok(c.store.snapshot.views.some(v=>v.view.id===created));assert.ok(c.store.snapshot.views.some(v=>v.view.id===duplicate));assert.ok(c.view);
});

test('synthetic startup teaches directly permitted Serving and Flow without altering shared layout identities', async () => {
  const {relationshipAssessment}=await import('../src/profile-ui.js');
  const {expectedEndpointDecision}=await import('./endpoint-oracle.js');
  const state=fresh().store.snapshot;
  assert.deepEqual(state.relationships.map(item=>[item.type,item.label]),[['Serving','обслуживает'],['Flow','результат проверки']]);
  for(const relation of state.relationships) {
    const source=state.elements.find(item=>item.id===relation.source.id).type,target=state.elements.find(item=>item.id===relation.target.id).type;
    assert.deepEqual(expectedEndpointDecision(source,relation.type,target),{status:'ALLOWED',permissionClass:'direct'});
    const result=relationshipAssessment(state,relation);assert.equal(result.status,'ALLOWED');assert.equal(result.permissionClass,'direct');
    const draft={...relation,type:'Realization'};assert.equal(relationshipAssessment(state,draft).status,'FORBIDDEN');
  }
});

test('documentation: no-view exact-ID tree selection survives edits/undo, and first view creation still activates a view', () => {
  const state = fresh().store.snapshot; state.views = [];
  const c = createController(createStore(state)), concept = { kind: 'element', id: state.elements[0].id };
  c.select(concept); assert.deepEqual(c.selection, concept); assert.equal(c.viewId, null);
  c.execute({ type: 'updateConceptDocumentation', concept, documentation: 'No drawing required' }); assert.deepEqual(c.selection, concept);
  c.undo(); assert.deepEqual(c.selection, concept); c.redo(); assert.deepEqual(c.selection, concept);
  c.select({ kind: 'occurrence', id: 'missing' }); assert.equal(c.selection, null);
  c.select(concept); const result = c.execute({ type: 'createView', name: 'First' }); assert.equal(c.viewId, result.created.viewId); assert.equal(c.selection, null);
  c.undo(); assert.equal(c.viewId, null); assert.equal(c.selection, null); c.select(concept); assert.deepEqual(c.selection, concept);
  c.redo(); assert.equal(c.viewId, result.created.viewId); assert.equal(c.selection, null);
  const drawing = c.execute({ type: 'addOccurrence', viewId: c.viewId, concept, bounds: { x: 0, y: 0, width: 120, height: 60 } }).created.occurrenceId;
  c.select({ kind: 'occurrence', id: drawing }); c.beginDrag(drawing);
  // Undoing first-view creation and replacing a model are the supported last-view removal paths.
  c.store.load(createStore(state).exportFiles(), c.store.revision); c.sanitizeSelection();
  assert.equal(c.viewId, null); assert.equal(c.selection, null);
  c.select(concept); assert.deepEqual(c.selection, concept); c.afterLoad();
  assert.equal(c.viewId, null); assert.equal(c.selection, null); assert.equal(c.drag, null);
});
