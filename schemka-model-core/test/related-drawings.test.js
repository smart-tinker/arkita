import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles } from '../src/index.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { fixtureId } from '../fixtures/relationship-project.js';
import { addRelatedDrawings } from '../src/related-drawings.js';

test('existing relationships add missing endpoint closure atomically, including relation endpoints and cycles',()=>{
  const store=createStore(conceptProject()),before=store.exportFiles(),state=store.snapshot,viewId=fixtureId('view',2),id=fixtureId('rel',11),out=addRelatedDrawings(state,{viewId,relationshipIds:[id]});
  assert.deepEqual(store.exportFiles(),before);assert.deepEqual(out.snapshot.elements,state.elements);assert.deepEqual(out.snapshot.relationships,state.relationships);assert.ok(out.connectionIds.length>=2);assert.ok(out.occurrenceIds.length>=1);const view=out.snapshot.views.find(item=>item.view.id===viewId);assert.ok(view.connections.some(item=>item.source.kind==='connection'));
  store.execute({type:'applyProjectSnapshot',files:out.files},store.revision);const after=store.exportFiles();store.undo(store.revision);assert.deepEqual(store.exportFiles(),before);store.redo(store.revision);assert.deepEqual(store.exportFiles(),after);const again=addRelatedDrawings(store.snapshot,{viewId,relationshipIds:[id]});assert.equal(again.changed,false);
});

test('explicit endpoint image choices preserve duplicate occurrences and adding neighbors is optional',()=>{
  const state=conceptProject(),viewId=fixtureId('view',2),store=createStore(state),concept={kind:'element',id:fixtureId('el',1)},made=store.execute({type:'addOccurrence',viewId,concept,bounds:{x:10,y:20,width:120,height:80}},store.revision).created.occurrenceId;
  store.execute({type:'addOccurrence',viewId,concept,bounds:{x:500,y:20,width:120,height:80}},store.revision);const before=store.snapshot,id=fixtureId('rel',1),out=addRelatedDrawings(before,{viewId,relationshipIds:[id],placements:{[`element:${concept.id}`]:{id:made}}});const view=out.snapshot.views.find(entry=>entry.view.id===viewId);assert.equal(view.connections[0].source.id,made);assert.equal(view.occurrences.filter(item=>item.concept.id===concept.id).length,2);assert.equal(out.connectionIds.length,1);
  const expanded=addRelatedDrawings(before,{viewId,relationshipIds:[id],neighbors:true});assert.ok(expanded.connectionIds.length>out.connectionIds.length);assert.throws(()=>addRelatedDrawings(before,{viewId,relationshipIds:[id],placements:{[`element:${concept.id}`]:{id:'missing'}}}));assert.deepEqual(exportFiles(before),store.exportFiles());
});

test('explicit occurrence choices incompatible with a reused connection fail without changing source or redo',()=>{
 const store=createStore(conceptProject()),viewId=fixtureId('view',2),relationshipId=fixtureId('rel',1),initial=addRelatedDrawings(store.snapshot,{viewId,relationshipIds:[relationshipId]});store.execute({type:'applyProjectSnapshot',files:initial.files},store.revision);
 const concept={kind:'element',id:fixtureId('el',1)},other=store.execute({type:'addOccurrence',viewId,concept,bounds:{x:900,y:100,width:120,height:80}},store.revision).created.occurrenceId;
 store.execute({type:'renameProject',name:'Future'},store.revision);store.undo(store.revision);const before=store.exportFiles(),history=store.history;
 assert.throws(()=>addRelatedDrawings(store.snapshot,{viewId,relationshipIds:[relationshipId],placements:{[`element:${concept.id}`]:{id:other}}}),/другой рисунок или якорь/);assert.deepEqual(store.exportFiles(),before);assert.deepEqual(store.history,history);store.redo(store.revision);assert.equal(store.snapshot.project.name,'Future');
});
test('new anchors on an existing straight or bent host use its current geometry and preserve the authored route order, with exact Undo',()=>{
 for(const bends of [[],[{kind:'bend',point:{x:210,y:400}},{kind:'bend',point:{x:350,y:400}},{kind:'bend',point:{x:450,y:300}}]]){
  const store=createStore(conceptProject()),viewId=fixtureId('view',2),hostRelationship=fixtureId('rel',1),initial=addRelatedDrawings(store.snapshot,{viewId,relationshipIds:[hostRelationship]});store.execute({type:'applyProjectSnapshot',files:initial.files},store.revision);const entry=store.snapshot.views.find(item=>item.view.id===viewId),host=entry.connections[0];store.execute({type:'updateConnectionLayout',viewId,connectionId:host.id,routePoints:bends,labelPosition:null},store.revision);
  const before=store.exportFiles(),out=addRelatedDrawings(store.snapshot,{viewId,relationshipIds:[fixtureId('rel',6)],point:{x:10000,y:10000}}),changed=out.snapshot.views.find(item=>item.view.id===viewId).connections.find(item=>item.id===host.id);assert.equal(out.newAnchors.length,1);assert.deepEqual(changed.routePoints.filter(item=>item.kind==='bend'),bends);const anchor=changed.routePoints.find(item=>item.kind==='anchor');
  if(bends.length){assert.deepEqual(anchor.point,bends[1].point);assert.equal(changed.routePoints.indexOf(anchor),2);}else{const centers=[host.source,host.target].map(ref=>{const b=entry.occurrences.find(item=>item.id===ref.id).bounds;return{x:b.x+b.width/2,y:b.y+b.height/2};});assert.deepEqual(anchor.point,{x:(centers[0].x+centers[1].x)/2,y:(centers[0].y+centers[1].y)/2});}
  assert.deepEqual(store.exportFiles(),before);store.execute({type:'applyProjectSnapshot',files:out.files},store.revision);store.undo(store.revision);assert.deepEqual(store.exportFiles(),before);
 }
});
