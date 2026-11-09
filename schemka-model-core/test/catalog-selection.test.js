import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, importFiles, catalogSelectionMovePlan, conceptTypeChangeImpact, conceptTypeChangesImpact } from '../src/index.js';
const run=(store,command)=>store.execute(command,store.revision);
const capture=store=>({files:store.exportFiles(),revision:store.revision,history:store.history});
function fixture(){const store=createStore(createProject('Group')),viewId=run(store,{type:'createView',name:'V'}).created.viewId,a=run(store,{type:'createElementAndOccurrence',viewId,elementType:'Service',name:'A',bounds:{x:0,y:0,width:100,height:60}}).created,b=run(store,{type:'createElementAndOccurrence',viewId,elementType:'Process',name:'B',bounds:{x:150,y:0,width:100,height:60}}).created,relation=run(store,{type:'createRelationshipAndConnection',viewId,source:{kind:'occurrence',id:a.occurrenceId},target:{kind:'occurrence',id:b.occurrenceId},relationshipType:'Serving',label:'R'}).created.relationshipId;return{store:createStore(store.snapshot),viewId,a,b,relation};}

test('group type change checks final graph, permits repaired joint result and is one exact Undo',()=>{
 const {store,a,relation,viewId}=fixture(),concept={kind:'element',id:a.elementId},before=capture(store),originalView=store.snapshot.views[0],changes=[{concept,conceptType:'DataObject'},{concept:{kind:'relationship',id:relation},conceptType:'Association'}];
 assert.ok(conceptTypeChangeImpact(store.snapshot,concept,'DataObject').newBlockers.length);
 const preview=conceptTypeChangesImpact(store.snapshot,changes);assert.equal(preview.newBlockers.length,0);assert.deepEqual(preview.affectedViewIds,[viewId]);assert.equal(preview.changes.length,2);assert.deepEqual(capture(store),before);
 run(store,{type:'changeConceptTypes',changes});assert.equal(store.history.undo,1);assert.equal(store.snapshot.elements[0].type,'DataObject');assert.equal(store.snapshot.relationships[0].type,'Association');assert.deepEqual(store.snapshot.views[0],originalView);
 const after=store.exportFiles();store.undo(store.revision);assert.deepEqual(store.exportFiles(),before.files);store.redo(store.revision);assert.deepEqual(store.exportFiles(),after);
 const unchanged=capture(store);assert.throws(()=>run(store,{type:'changeConceptTypes',changes}),{code:'COMMAND'});assert.deepEqual(capture(store),unchanged);
});
test('wrong scope, duplicate refs, unknown fields and forbidden final graph leave history and redo untouched',()=>{
 const {store,a,relation}=fixture(),valid={concept:{kind:'element',id:a.elementId},conceptType:'Role'};run(store,{type:'renameProject',name:'Future'});store.undo(store.revision);const before=capture(store);
 for(const changes of [[],[valid,valid],[{...valid,extra:true}],[{...valid,concept:{...valid.concept,id:[a.elementId]}}],[{...valid,concept:{kind:'occurrence',id:a.occurrenceId}}],[{...valid,concept:{kind:'relationship',id:a.elementId}}],[{...valid,conceptType:'DataObject'}]]){assert.throws(()=>run(store,{type:'changeConceptTypes',changes}));assert.deepEqual(capture(store),before);}
 assert.throws(()=>run(store,{type:'changeConceptTypes',changes:[valid],extra:true}));assert.deepEqual(capture(store),before);assert.throws(()=>store.execute({type:'changeConceptTypes',changes:[valid]},store.revision-1),{code:'REVISION'});store.redo(store.revision);assert.equal(store.snapshot.project.name,'Future');
});

test('mixed folder/member move carries nested selected descendants, refuses cycles and preserves identity once',()=>{
 const {store,a,b,viewId}=fixture(),outer=run(store,{type:'createFolder',name:'Outer',members:[{kind:'element',id:a.elementId}]}).created.folderId,child=run(store,{type:'createFolder',name:'Child',parentFolderId:outer,members:[{kind:'element',id:b.elementId}]}).created.folderId,target=run(store,{type:'createFolder',name:'Target'}).created.folderId;
 const refs=[{kind:'folder',id:outer},{kind:'folder',id:child},{kind:'element',id:a.elementId},{kind:'element',id:b.elementId},{kind:'view',id:viewId}],before=capture(store),plan=catalogSelectionMovePlan(store.snapshot,refs,target);assert.equal(plan.moved.length,2);assert.equal(plan.carried.length,3);assert.deepEqual(capture(store),before);run(store,{type:'applyProjectSnapshot',files:exportFiles(plan.snapshot)});assert.equal(store.history.undo,before.history.undo+1);assert.equal(store.snapshot.folders.find(item=>item.id===child).parentFolderId,outer);assert.deepEqual(store.snapshot.elements,importFiles(before.files).elements);assert.equal(catalogSelectionMovePlan(store.snapshot,refs,target).unchanged,true);store.undo(store.revision);assert.deepEqual(store.exportFiles(),before.files);
 for(const selection of [[refs[0],refs[0]],[{kind:'project',id:store.snapshot.project.id}],[{kind:'element',id:[a.elementId]}],[{kind:'view',id:a.elementId}]])assert.throws(()=>catalogSelectionMovePlan(store.snapshot,selection,target));assert.throws(()=>catalogSelectionMovePlan(store.snapshot,refs,child),{code:'FOLDER_CYCLE'});assert.deepEqual(store.exportFiles(),before.files);
});
