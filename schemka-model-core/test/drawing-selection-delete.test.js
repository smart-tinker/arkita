import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore,exportFiles,drawingSelectionDeletionImpact,drawingDeletionImpact } from '../src/index.js';
import { conceptProject } from '../fixtures/concept-project.js';
const run=(store,command)=>store.execute(command,store.revision);
const capture=store=>({files:store.exportFiles(),revision:store.revision,history:store.history});
function fixture(){
  const store=createStore(conceptProject()),viewId=store.snapshot.views[0].view.id;
  const outer=run(store,{type:'createVisualNode',viewId,kind:'group',name:'Retained outer',bounds:{x:0,y:0,width:900,height:700}}).created.visualNodeId;
  const group=run(store,{type:'createVisualNode',viewId,kind:'group',name:'Selected inner',parent:{kind:'visualNode',id:outer},bounds:{x:30,y:30,width:600,height:400}}).created.visualNodeId;
  const note=run(store,{type:'createVisualNode',viewId,kind:'note',text:'Retained child',parent:{kind:'visualNode',id:group},bounds:{x:40,y:40,width:100,height:60}}).created.visualNodeId;
  const entry=store.snapshot.views[0],occurrence=entry.occurrences[0];run(store,{type:'reparentDrawing',viewId,drawing:{kind:'occurrence',id:occurrence.id},parent:{kind:'visualNode',id:group}});
  const line=run(store,{type:'createVisualConnector',viewId,source:{kind:'visualNode',id:group},target:{kind:'visualNode',id:note},routePoints:[],labelPosition:null}).created.visualConnectorId;
  const independent=run(store,{type:'createVisualConnector',viewId,source:{kind:'visualNode',id:outer},target:{kind:'visualNode',id:note},routePoints:[],labelPosition:null}).created.visualConnectorId;
  const connection=entry.connections[0],anchor=connection.routePoints.find(item=>item.kind==='anchor');
  const dependent=run(store,{type:'createVisualConnector',viewId,source:{kind:'connection',id:connection.id,anchorId:anchor.id},target:{kind:'visualNode',id:note},routePoints:[],labelPosition:null}).created.visualConnectorId;
  const otherViewId=run(store,{type:'duplicateView',viewId,name:'Other view unchanged'}).created.viewId;
  return{store:createStore(store.snapshot),viewId,otherViewId,outer,group,note,occurrenceId:occurrence.id,line,dependent,drawings:[{kind:'occurrence',id:entry.occurrences[2].id},{kind:'connection',id:connection.id},{kind:'visualNode',id:group},{kind:'visualConnector',id:independent}]};
}
test('batch deletion computes one frozen union, retains concepts/other views/children coordinates and uses one exact Undo',()=>{
  const f=fixture(),before=f.store.snapshot,bytes=f.store.exportFiles(),impact=drawingSelectionDeletionImpact(before,{viewId:f.viewId,drawings:f.drawings});assert.ok(Object.isFrozen(impact)&&Object.isFrozen(impact.connectionIds));assert.deepEqual(f.store.exportFiles(),bytes);assert.deepEqual(impact.elementIds,[]);assert.deepEqual(impact.relationshipIds,[]);assert.deepEqual(impact.viewIds,[f.viewId]);assert.ok(impact.visualConnectorIds.includes(f.line)&&impact.visualConnectorIds.includes(f.dependent));
  for(const drawing of f.drawings){const single=drawingDeletionImpact(before,{viewId:f.viewId,...drawing});for(const[key,ids]of Object.entries(single))for(const id of ids)assert.ok(impact[key].includes(id));}
  const result=run(f.store,{type:'removeDrawings',viewId:f.viewId,drawings:f.drawings}),after=f.store.snapshot;assert.deepEqual(result.impact,impact);assert.equal(f.store.history.undo,1);for(const collection of ['elements','junctions','relationships','assets','folders'])assert.deepEqual(after[collection],before[collection]);assert.deepEqual(after.views.find(item=>item.view.id===f.otherViewId),before.views.find(item=>item.view.id===f.otherViewId));
  const entry=after.views.find(item=>item.view.id===f.viewId),original=before.views.find(item=>item.view.id===f.viewId);for(const[collection,id]of [['occurrences',f.occurrenceId],['visualNodes',f.note]]){const current=entry[collection].find(item=>item.id===id),old=original[collection].find(item=>item.id===id);assert.ok(current);assert.deepEqual(current.bounds,old.bounds);assert.deepEqual(current.parent,{kind:'visualNode',id:f.outer});}
  const changed=f.store.exportFiles();f.store.undo(f.store.revision);assert.deepEqual(f.store.exportFiles(),bytes);f.store.redo(f.store.revision);assert.deepEqual(f.store.exportFiles(),changed);
});
test('invalid, duplicate, stale, empty or foreign selections preserve bytes, revision and redo',()=>{
 const f=fixture();run(f.store,{type:'renameProject',name:'Future'});f.store.undo(f.store.revision);const before=capture(f.store),base={type:'removeDrawings',viewId:f.viewId,drawings:f.drawings};
 for(const command of [{...base,drawings:[]},{...base,drawings:[f.drawings[0],f.drawings[0]]},{...base,drawings:[{kind:'element',id:f.store.snapshot.elements[0].id}]},{...base,drawings:[{...f.drawings[0],extra:true}]},{...base,drawings:[{...f.drawings[0],id:[f.drawings[0].id]}]},{...base,drawings:[{...f.drawings[0],kind:[f.drawings[0].kind]}]},{...base,drawings:[{kind:'occurrence',id:'missing'}]},{...base,viewId:f.otherViewId},{...base,extra:true}]){assert.throws(()=>run(f.store,command));assert.deepEqual(capture(f.store),before);}
 assert.throws(()=>f.store.execute(base,f.store.revision-1),{code:'REVISION'});assert.deepEqual(capture(f.store),before);f.store.redo(f.store.revision);assert.equal(f.store.snapshot.project.name,'Future');
});
test('locked selected, dependent or retained-reparented child each prevents the entire batch atomically',()=>{
 for(const which of ['selected','dependent','child']){const f=fixture(),drawing=which==='selected'?f.drawings[0]:which==='dependent'?{kind:'visualConnector',id:f.dependent}:{kind:'visualNode',id:f.note};run(f.store,{type:'setDrawingLocked',viewId:f.viewId,drawing,locked:true});const before=capture(f.store);assert.throws(()=>run(f.store,{type:'removeDrawings',viewId:f.viewId,drawings:f.drawings}),{code:'DRAWING_LOCKED'});assert.deepEqual(capture(f.store),before);}
});
