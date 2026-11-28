import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
test('palette placement highlights a container, cancels without creating data and applies an explicit ALLOWED nesting relation with exact Undo',async t=>{
 const h=await setup(t),store=createStore(createProject('ARM integration')),run=command=>store.execute(command,store.revision).created,{viewId}=run({type:'createView',name:'Main'}),parent=run({type:'createElementAndOccurrence',viewId,elementType:'Service',name:'Parent',bounds:{x:0,y:0,width:500,height:400}});
 await h.load(serializeProjectFile(store.snapshot));const before=await h.download();
 function start(){h.pointer(h.$('create-process'),'pointerdown',20,30);h.pointer(h.document,'pointermove',250,200);assert.ok(h.$('canvas').querySelector('[data-nesting-preview]'));h.pointer(h.document,'pointerup',250,200);assert.ok(h.$('semantic-editing-dialog').open);assert.equal(h.document.querySelector('[data-catalog-count="common"]').textContent,'1');}
 start();h.$('semantic-editing-cancel').click();assert.deepEqual(await h.download(),before);assert.equal(h.$('canvas').querySelector('[data-nesting-preview]'),null);
 start();const select=h.$('nesting-relation-0');assert.ok([...select.options].every(option=>!option.value||option.textContent.includes('ALLOWED')));select.value='parent-child:Serving';assert.equal(select.value,'parent-child:Serving');h.$('nesting-hide-0').checked=true;h.$('semantic-editing-apply').click();assert.equal(h.$('semantic-editing-dialog').open,false,h.$('semantic-editing-error').textContent);
 const after=await h.download(),state=deserializeProjectFile(after),child=state.views[0].occurrences.find(item=>item.id!==parent.occurrenceId);assert.deepEqual(child.parent,{kind:'occurrence',id:parent.occurrenceId});assert.equal(state.relationships.length,1);assert.equal(state.views[0].connections[0].style.hideWhenNested,true);h.$('undo').click();assert.deepEqual(await h.download(),before);h.$('redo').click();assert.deepEqual(await h.download(),after);
});
test('actual magic chooser honors relation-first preference and Alt reverses order for one activation without model edits',async t=>{
 const h=await setup(t),before=await h.download();h.$('preferences-button').click();h.$('preferences-behavior-magicOrder').value='relation-first';h.$('preferences-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));h.$('smart-link-tool').click();assert.ok(h.$('magic-order-dialog').open);h.$('magic-order-cancel').click();h.$('smart-link-tool').dispatchEvent(new h.window.MouseEvent('click',{bubbles:true,altKey:true}));assert.equal(h.$('magic-order-dialog').open,false);assert.equal(h.$('smart-link-tool').getAttribute('aria-pressed'),'true');h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.deepEqual(await h.download(),before);
});

test('relationship selection on Canvas and catalog immediately toggles Rebind without model edits',async t=>{
 const h=await setup(t),store=createStore(createProject('Relationship selection')),run=command=>store.execute(command,store.revision).created,{viewId}=run({type:'createView',name:'Main'});
 const source=run({type:'createElementAndOccurrence',viewId,elementType:'Service',name:'Source',bounds:{x:40,y:50,width:180,height:80}});
 const target=run({type:'createElementAndOccurrence',viewId,elementType:'Role',name:'Target',bounds:{x:360,y:50,width:180,height:80}});
 const relation=run({type:'createRelationshipAndConnection',viewId,relationshipType:'Flow',source:{kind:'occurrence',id:source.occurrenceId},target:{kind:'occurrence',id:target.occurrenceId},label:'Synthetic flow'});
 await h.load(serializeProjectFile(store.snapshot));
 const before=await h.download(),history=h.$('history-state').textContent,opener=h.$('semantic-rebind');
 const connection=h.$('canvas').querySelector(`[data-kind="connection"][data-id="${relation.connectionId}"]`);
 assert.ok(connection);
 assert.equal(opener.disabled,true);
 h.pointer(connection,'pointerdown',100,100);
 assert.equal(connection.classList.contains('selected'),true);
 assert.equal(opener.disabled,false,'Canvas selection should immediately enable Rebind');
 h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(opener.disabled,true,'Clearing Canvas selection should disable Rebind');
 const catalogRelationship=h.document.querySelector(`[data-relationship-id="${relation.relationshipId}"]`);
 assert.ok(catalogRelationship);
 catalogRelationship.click();
 assert.equal(connection.classList.contains('selected'),true);
 assert.equal(opener.disabled,false,'Catalog selection should immediately enable Rebind');
 h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(opener.disabled,true,'Clearing catalog selection should disable Rebind');
 assert.deepEqual(await h.download(),before);
 assert.equal(h.$('history-state').textContent,history);
});