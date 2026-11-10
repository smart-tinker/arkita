import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { createProject,createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile,deserializeProjectFile } from '../../schemka-model-io/src/index.js';
test('visual note and connector inline editing use their exact visual owners, preserve metadata and cancel or Undo exactly',async t=>{
 const h=await setup(t),store=createStore(createProject('Visual inline')),run=command=>store.execute(command,store.revision).created,{viewId}=run({type:'createView',name:'Main'}),a=run({type:'createVisualNode',viewId,kind:'note',name:'Metadata name',text:'Visible text',bounds:{x:30,y:30,width:200,height:100}}),b=run({type:'createVisualNode',viewId,kind:'note',name:'Other',text:'Other',bounds:{x:330,y:30,width:200,height:100}}),line=run({type:'createVisualConnector',viewId,name:'Caption',source:{kind:'visualNode',id:a.visualNodeId},target:{kind:'visualNode',id:b.visualNodeId}});
 await h.load(serializeProjectFile(store.snapshot));const before=await h.download();
 function f2(kind,id){h.$('canvas').querySelector(`[data-kind="${kind}"][data-id="${id}"]`).dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'F2',bubbles:true}));return h.$('canvas').querySelector('.inline-editor input,.inline-editor textarea');}
 let input=f2('visualNode',a.visualNodeId);assert.ok(input);assert.equal(input.value,'Visible text');input.value='Changed note';input.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));let state=deserializeProjectFile(await h.download()),note=state.views[0].visualNodes.find(item=>item.id===a.visualNodeId);assert.equal(note.name,'Metadata name');assert.equal(note.text,'Changed note');h.$('undo').click();assert.deepEqual(await h.download(),before);
 input=f2('visualConnector',line.visualConnectorId);assert.ok(input);assert.equal(input.value,'Caption');input.value='Cancelled';input.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.deepEqual(await h.download(),before);
});
