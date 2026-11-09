import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,createProject,exportFiles} from '../../schemka-model-core/src/index.js';
import {prepareDrawingBounds,standardDrawingBounds} from '../src/resize-preferences.js';

function fixture(){const store=createStore(createProject('Nested')),run=command=>store.execute(command,store.revision).created,viewId=run({type:'createView',name:'Main'}).viewId;
 const parent=run({type:'createVisualNode',viewId,kind:'group',bounds:{x:100,y:100,width:500,height:400}}).visualNodeId;
 const child=run({type:'createVisualNode',viewId,kind:'group',parent:{kind:'visualNode',id:parent},bounds:{x:150,y:160,width:200,height:180}}).visualNodeId;
 const grandchild=run({type:'createVisualNode',viewId,kind:'note',parent:{kind:'visualNode',id:child},bounds:{x:180,y:190,width:100,height:80}}).visualNodeId;
 const line=run({type:'createVisualConnector',viewId,source:{kind:'visualNode',id:child},target:{kind:'visualNode',id:grandchild},routePoints:[{kind:'bend',point:{x:250,y:240}}],labelPosition:{x:230,y:220}}).visualConnectorId;return {store,run,viewId,parent,child,grandchild,line};}
test('top-left container resize retains absolute coordinates or nested offsets plus internal routes with exact single Undo',()=>{
 for(const mode of ['retain','offset']){const h=fixture(),state=h.store.snapshot,before=h.store.exportFiles(),out=prepareDrawingBounds(state,h.viewId,{kind:'visualNode',id:h.parent},{x:50,y:70,width:550,height:430},mode);assert.equal(out.changed,true);assert.deepEqual(exportFiles(state),before);const view=out.snapshot.views[0],child=view.visualNodes.find(item=>item.id===h.child),grandchild=view.visualNodes.find(item=>item.id===h.grandchild),line=view.visualConnectors.find(item=>item.id===h.line);
  assert.deepEqual(child.bounds,{x:mode==='retain'?150:100,y:mode==='retain'?160:130,width:200,height:180});assert.equal(grandchild.bounds.x,mode==='retain'?180:130);assert.deepEqual(line.routePoints[0].point,mode==='retain'?{x:250,y:240}:{x:200,y:210});assert.deepEqual(line.labelPosition,mode==='retain'?{x:230,y:220}:{x:180,y:190});
  h.store.execute({type:'applyProjectSnapshot',files:exportFiles(out.snapshot)},h.store.revision);const after=h.store.exportFiles();h.store.undo(h.store.revision);assert.deepEqual(h.store.exportFiles(),before);h.store.redo(h.store.revision);assert.deepEqual(h.store.exportFiles(),after);
 }
});
test('no-op is identity and locked descendants refuse offset changes atomically; retaining their coordinates remains allowed',()=>{
 const h=fixture(),state=h.store.snapshot,original=state.views[0].visualNodes.find(item=>item.id===h.parent).bounds;assert.deepEqual(prepareDrawingBounds(state,h.viewId,{kind:'visualNode',id:h.parent},original,'retain'),{snapshot:state,changed:false});h.run({type:'setDrawingLocked',viewId:h.viewId,drawing:{kind:'visualNode',id:h.child},locked:true});const before=h.store.exportFiles();assert.throws(()=>prepareDrawingBounds(h.store.snapshot,h.viewId,{kind:'visualNode',id:h.parent},{...original,x:50},'offset'));assert.deepEqual(h.store.exportFiles(),before);assert.equal(prepareDrawingBounds(h.store.snapshot,h.viewId,{kind:'visualNode',id:h.parent},{...original,x:50},'retain').changed,true);
 const fresh=fixture(),offset=prepareDrawingBounds(fresh.store.snapshot,fresh.viewId,{kind:'visualNode',id:fresh.parent},{...original,x:50},'offset');assert.equal(offset.snapshot.views[0].visualNodes.find(item=>item.id===fresh.parent).bounds.x,50);
});


test('standard size respects local defaults and descendant extent, then repeated acceptance is a no-op',()=>{
 const h=fixture(),state=h.store.snapshot,before=exportFiles(state),bounds=standardDrawingBounds(state,h.viewId,{kind:'visualNode',id:h.parent},{width:210,height:90});assert.deepEqual(bounds,{x:100,y:100,width:262,height:252});const stage=prepareDrawingBounds(state,h.viewId,{kind:'visualNode',id:h.parent},bounds);assert.equal(stage.changed,true);assert.deepEqual(stage.snapshot.views[0].visualNodes.find(item=>item.id===h.child),state.views[0].visualNodes.find(item=>item.id===h.child));assert.deepEqual(exportFiles(state),before);const repeated=standardDrawingBounds(stage.snapshot,h.viewId,{kind:'visualNode',id:h.parent},{width:210,height:90});assert.equal(prepareDrawingBounds(stage.snapshot,h.viewId,{kind:'visualNode',id:h.parent},repeated).changed,false);
});
