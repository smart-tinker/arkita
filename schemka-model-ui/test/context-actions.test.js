import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFixture } from './current-fixture.js';
import { createController } from '../src/controller.js';
import { contextActions } from '../src/context-actions.js';

function setup() {
  const model = createController(createCurrentFixture()), calls = [];
  const actions = Object.fromEntries(['newFolder','moveConcept','cutConcept','duplicateConcept','changeConceptType','editFolder','deleteFolder','pasteConcepts','removeVisual','openProperties','rename','addOccurrence','remove','reuseRelationship','openView','duplicateView','newView','createElement','fit','undo','redo'].map(name => [name, (...args) => calls.push([name,...args])]));
  return { model, calls, actions, menu: context => contextActions(context, model, actions) };
}
test('context actions bind hit occurrence identity rather than the unrelated current selection', () => {
  const h = setup(), a = h.model.view.occurrences[0], b = h.model.view.occurrences[1];
  h.model.select({ kind:'occurrence', id:b.id });
  const items = h.menu({kind:'occurrence',id:a.id});
  items.find(item=>item.id==='rename').action(); assert.equal(h.calls[0][2], a.concept.id);
  items.find(item=>item.id==='remove-occurrence').action(); assert.deepEqual(h.calls[1],['remove','occurrence',a.id]);
  items.find(item=>item.id==='delete-element').action(); assert.deepEqual(h.calls[2],['remove','element',a.concept.id]);
  assert.equal(h.model.store.history.undo,0); assert.equal(h.model.selection.id,b.id);
});
test('connection and relation menus distinguish view removal from model deletion and preserve exact relationship target', () => {
  const h=setup(), connection=h.model.view.connections[0];
  const menu=h.menu({kind:'connection',id:connection.id});
  menu.find(item=>item.id==='reuse-relationship').action(); assert.deepEqual(h.calls[0],['reuseRelationship',connection.relationshipId]);
  menu.find(item=>item.id==='remove-connection').action(); assert.deepEqual(h.calls[1],['remove','connection',connection.id]);
  menu.find(item=>item.id==='delete-relationship').action(); assert.deepEqual(h.calls[2],['remove','relationship',connection.relationshipId]);
  assert.equal(h.menu({kind:'relationship',id:connection.relationshipId}).some(item=>item.id==='remove-connection'),false);
});
test('empty canvas menu stays compact and creation remains in the palette', () => {
  const h=setup(), menu=h.menu({kind:'canvas',point:{x:10,y:20}});
  assert.deepEqual(menu.map(item => item.id), ['new-view','duplicate-view','fit','undo','redo']);
  assert.equal(menu.some(item => item.id.startsWith('create-') || item.id.startsWith('relation-')), false);
  assert.equal(h.model.store.history.undo,0);
});
test('tree element/view/project menus use existing actions and invalid or removed targets yield no menu', () => {
  const h=setup(),state=h.model.store.snapshot;
  h.menu({kind:'element',id:state.elements[0].id}).find(item=>item.id==='reuse-element').action(); assert.deepEqual(h.calls[0],['addOccurrence',{kind:'element',id:state.elements[0].id}]);
  h.menu({kind:'view',id:state.views[1].view.id}).find(item=>item.id==='duplicate-view').action(); assert.deepEqual(h.calls[1],['duplicateView',state.views[1].view.id]);
  assert.ok(h.menu({kind:'project',id:state.project.id}).some(item=>item.id==='rename'));
  for(const context of [{kind:'occurrence',id:'missing'},{kind:'connection',id:'missing'},{kind:'element',id:'missing'},{kind:'relationship',id:'missing'},{kind:'view',id:'missing'},{kind:'project',id:'missing'},{kind:'alien'}]) assert.deepEqual(h.menu(context),[]);
  assert.equal(h.menu({kind:'canvas'}).find(item=>item.id==='undo').disabled,true);
});

test('properties preserve the exact repeated occurrence, never the selected shared occurrence', () => {
  const h=setup();
  const original=h.model.view.occurrences[0];
  const duplicate=h.model.execute({type:'addOccurrence',viewId:h.model.viewId,concept: { kind: 'element', id: original.concept.id },bounds:{x:5,y:5,width:100,height:60}}).created.occurrenceId;
  h.model.select({kind:'occurrence',id:original.id});
  const menu=h.menu({kind:'occurrence',id:duplicate});
  menu.find(item=>item.id==='properties').action();
  assert.deepEqual(h.calls,[['openProperties',{kind:'occurrence',id:duplicate}]]);
  assert.equal(menu.some(item=>item.id.startsWith('relation-')),false);
  assert.equal(h.menu({kind:'element',id:original.concept.id}).some(item=>item.id.startsWith('relation-')),false);
});

test('a clicked view-anchor opens host connection properties without planning a relationship', () => {
  const h = setup(), connection = h.model.view.connections[0];
  const anchorId = h.model.execute({ type: 'insertConnectionAnchor', viewId: h.model.viewId, connectionId: connection.id, index: 0, point: { x: 300, y: 300 } }).created.anchorId;
  const menu = h.menu({ kind: 'connection', id: connection.id, anchorId });
  menu.find(item => item.id === 'properties').action();
  assert.deepEqual(h.calls[0], ['openProperties', { kind: 'connection', id: connection.id }]);
  assert.equal(menu.some(item=>item.id.startsWith('relation-')),false);
  assert.equal(h.model.store.history.undo, 1);
  assert.deepEqual(h.menu({ kind: 'connection', id: connection.id, anchorId: 'foreign-anchor' }), []);
});

test('shared concept properties preserve their tree target and unavailable callbacks are disabled', () => {
  const h=setup(), state=h.model.store.snapshot;
  for(const [kind,id] of [['element',state.elements[0].id],['relationship',state.relationships[0].id]]) {
    const item=h.menu({kind,id})[0];
    assert.equal(item.id,'properties'); assert.equal(item.disabled,false); item.action();
    assert.deepEqual(h.calls.at(-1),['openProperties',{kind,id}]);
  }
  h.actions.openProperties=undefined;
  assert.equal(h.menu({kind:'element',id:state.elements[0].id})[0].disabled,true);
  assert.equal(h.model.store.history.undo,0);
});


test('tree context operations keep exact target IDs and are absent from canvas drawing menus', () => {
  const h=setup(), state=h.model.store.snapshot, ref={kind:'element',id:state.elements[0].id};
  h.model.select({kind:'element',id:state.elements[1].id}); const menu=h.menu(ref);
  for(const [id,callback] of [['move-concept','moveConcept'],['cut-concept','cutConcept'],['duplicate-concept','duplicateConcept'],['change-concept-type','changeConceptType']]) {menu.find(item=>item.id===id).action();assert.deepEqual(h.calls.at(-1),[callback,ref]);}
  const occurrence=h.model.view.occurrences[0];assert.equal(h.menu({kind:'occurrence',id:occurrence.id}).some(item=>item.id==='move-concept'),false);
  const relationship={kind:'relationship',id:state.relationships[0].id};h.menu(relationship).find(item=>item.id==='change-concept-type').action();assert.deepEqual(h.calls.at(-1),['changeConceptType',relationship]);
  h.actions.moveConcept=undefined;assert.equal(h.menu(ref).find(item=>item.id==='move-concept').disabled,true);assert.equal(h.model.store.history.undo,0);
});

test('folder/model/view properties and cut destinations are available only for existing owners', () => {
  const h=setup(), folderId=h.model.execute({type:'createFolder',name:'Folder'}).created.folderId, state=h.model.store.snapshot;
  h.actions.hasCut=()=>true;
  for(const ref of [{kind:'folder',id:folderId},{kind:'project',id:state.project.id},{kind:'view',id:state.views[0].view.id}]) {h.menu(ref).find(item=>item.id==='properties').action();assert.deepEqual(h.calls.at(-1),['openProperties',ref]);}
  h.menu({kind:'folder',id:folderId}).find(item=>item.id==='paste-concepts').action();assert.deepEqual(h.calls.at(-1),['pasteConcepts',folderId,undefined]);
  h.menu({kind:'project',id:state.project.id}).find(item=>item.id==='paste-concepts').action();assert.deepEqual(h.calls.at(-1),['pasteConcepts',null,undefined]);
  h.menu({kind:'folder',id:folderId}).find(item=>item.id==='delete-folder').action();assert.deepEqual(h.calls.at(-1),['deleteFolder',folderId]);
  h.actions.hasCut=()=>false;assert.equal(h.menu({kind:'folder',id:folderId}).some(item=>item.id==='paste-concepts'),false);
  assert.deepEqual(h.menu({kind:'folder',id:'missing'}),[]);
});


test('visual node and connector properties preserve exact hit IDs and never retarget shared concepts', () => {
  const h=setup(), run=command=>h.model.execute(command).created;
  const a=run({type:'createVisualNode',viewId:h.model.viewId,kind:'note',text:'Exact note',bounds:{x:10,y:10,width:140,height:90}}).visualNodeId;
  const b=run({type:'createVisualNode',viewId:h.model.viewId,kind:'group',name:'Group',bounds:{x:250,y:10,width:180,height:130}}).visualNodeId;
  const connector=run({type:'createVisualConnector',viewId:h.model.viewId,source:{kind:'visualNode',id:a},target:{kind:'visualNode',id:b},routePoints:[]}).visualConnectorId;
  h.model.select({kind:'occurrence',id:h.model.view.occurrences[0].id});const before=h.model.store.exportFiles(),history=h.model.store.history;
  for(const ref of [{kind:'visualNode',id:a},{kind:'visualConnector',id:connector}]) {
    const menu=h.menu(ref);menu.find(item=>item.id==='properties').action();assert.deepEqual(h.calls.at(-1),['openProperties',ref]);
    menu.find(item=>item.id==='remove-visual').action();assert.deepEqual(h.calls.at(-1),['removeVisual',ref]);
    assert.equal(menu.some(item=>item.id==='delete-element'||item.id==='change-concept-type'),false);
  }
  for(const kind of ['visualNode','visualConnector'])assert.deepEqual(h.menu({kind,id:'missing'}),[]);
  assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
});


test('fixed catalogue sections create real folders without offering properties or rename of virtual roots', () => {
  const h = setup();
  const menu = h.menu({ kind: 'catalogSection', id: 'technology' });
  assert.deepEqual(menu.map(item => item.id), ['new-folder', 'undo', 'redo']);
  menu[0].action(); assert.deepEqual(h.calls, [['newFolder', '@technology']]);
  h.actions.hasCut = () => true; h.menu({ kind: 'catalogSection', id: 'technology' }).find(item => item.id === 'paste-concepts').action();
  assert.deepEqual(h.calls.at(-1), ['pasteConcepts', '@technology', 'technology']);
  assert.deepEqual(h.menu({ kind: 'catalogSection', id: 'untrusted' }), []);
  const folder = h.model.execute({ type: 'createFolder', name: 'Native' }).created.folderId;
  h.menu({ kind: 'folder', id: folder }).find(item => item.id === 'new-folder').action();
  assert.deepEqual(h.calls.at(-1), ['newFolder', folder, undefined]);
});


test('mixed folder context carries the clicked projection into create and paste actions', () => {
  const h = setup(), folderId = h.model.execute({ type: 'createFolder', name: 'Mixed' }).created.folderId;
  h.actions.hasCut = () => true;
  const menu = h.menu({ kind: 'folder', id: folderId, sectionId: 'application' });
  menu.find(item => item.id === 'new-folder').action(); assert.deepEqual(h.calls.at(-1), ['newFolder', folderId, 'application']);
  menu.find(item => item.id === 'paste-concepts').action(); assert.deepEqual(h.calls.at(-1), ['pasteConcepts', folderId, 'application']);
});
