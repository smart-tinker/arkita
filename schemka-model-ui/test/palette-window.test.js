import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { randomUUID } from 'node:crypto';
import { createStore, createProject } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { createController } from '../src/controller.js';
import { installPaletteWindow, PALETTE_MIME } from '../src/palette-window.js';
import { installDetachedPalette } from '../src/detached-palette.js';

test('child filters inert labels, uses nonce/index drag, and never owns a model', async t => {
  const dom=new JSDOM(readFileSync(new URL('../palette.html',import.meta.url),'utf8'),{url:'https://palette.test'});t.after(()=>dom.window.close());const {window}=dom,{document}=window;let receive;const sent=[];
  const ui=installPaletteWindow({document,window,bridge:{onState(callback){receive=callback;},ready:async()=>({}),command:async data=>{sent.push(data);return {status:'ok'};},dock:async()=>({status:'docked'})}});
  receive({nonce:'current',theme:'dark',types:[{kind:'element',type:'Service',label:'<script>inert</script>',description:'Tooltip',enabled:true},{kind:'tool',type:'palette-next',label:'Next',description:'Page',enabled:true},{kind:'element',type:'MadeUp',label:'Fake',description:'',enabled:true}]});
  await Promise.resolve();assert.equal(document.querySelectorAll('.palette-tool').length,2);assert.equal(document.querySelector('script:not([src])'),null);const button=document.querySelector('.palette-tool');assert.equal(button.title,'Tooltip');button.click();await Promise.resolve();assert.deepEqual(sent,[{nonce:'current',index:0}]);
  const transfer={},drag=new window.Event('dragstart',{bubbles:true,cancelable:true});drag.dataTransfer={setData:(type,value)=>{transfer[type]=value;}};button.dispatchEvent(drag);assert.deepEqual(JSON.parse(transfer[PALETTE_MIME]),{nonce:'current',index:0});assert.deepEqual(Object.keys(transfer),[PALETTE_MIME]);
  document.getElementById('palette-window-query').value='Next';document.getElementById('palette-window-query').dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('.palette-tool').length,1);assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(typeof ui.model,'undefined');
});

test('owner rejects stale child actions and pages the full specialization palette without model changes', async t => {
  const dom=new JSDOM('<html data-theme="light"><body><details class="app-menu"><summary>Вид</summary><div class="menu-items"></div></details><aside class="toolbox"><div class="palette"></div></aside><svg id="canvas"></svg></body></html>',{url:'https://owner.test'});t.after(()=>dom.window.close());const {window}=dom,{document}=window,store=createStore(createProject('Owner'));
  const viewId=store.execute({type:'createView',name:'Main'},store.revision).created.viewId;
  const state=store.snapshot;state.customizationProfiles=Array.from({length:600},(_,index)=>({id:fixtureId('prf',index+1),name:`Profile ${index}`,purpose:'specialization',targets:[{kind:'element',type:'Service'}],attributes:{}}));const model=createController(createStore(state)),session={documentToken:randomUUID()},snapshots=[],actions=[];let onCommand;const desktop={paletteOpen:async value=>{snapshots.push(value);return {status:'detached'};},palettePublish:async value=>{snapshots.push(value);return {status:'ok'};},onPaletteCommand(callback){onCommand=callback;},onPaletteDocked(){},paletteDock:async()=>({status:'docked'})};
  const ui=installDetachedPalette({document,window,model,session,canvas:document.getElementById('canvas'),blocked:()=>false,status:()=>{},activate:entry=>actions.push(entry),desktop}),before=model.store.exportFiles();await ui.open();
  assert.equal(document.body.dataset.paletteDetached,'true');assert.ok(snapshots.at(-1).types.length<=512);assert.ok(snapshots.at(-1).types.some(item=>item.type==='palette-next'));
  const current={documentToken:session.documentToken,revision:model.store.revision,viewId};onCommand({...current,kind:'tool',type:'palette-next'});await new Promise(resolve=>setTimeout(resolve,0));assert.ok(snapshots.at(-1).types.some(item=>item.profileId===fixtureId('prf',600)));
  onCommand({...current,revision:999,kind:'element',type:'Service'});assert.equal(actions.length,0);onCommand({...current,kind:'element',type:'Service'});assert.equal(actions.length,1);assert.deepEqual(model.store.exportFiles(),before);
});

test('child search keeps page controls reachable and states that an absent result may be on another page',async t=>{
 const dom=new JSDOM(readFileSync(new URL('../palette.html',import.meta.url),'utf8'));t.after(()=>dom.window.close());const {window}=dom,{document}=window;let receive;const sent=[];installPaletteWindow({document,window,bridge:{onState(callback){receive=callback;},ready:async()=>({}),command:async data=>{sent.push(data);return{status:'ok'};},dock:async()=>({status:'docked'})}});receive({nonce:'page1',theme:'light',types:[{kind:'element',type:'Service',label:'First profile',description:'',enabled:true},{kind:'tool',type:'palette-next',label:'Next',description:'Page',enabled:true}]});
 const input=document.getElementById('palette-window-query');input.value='Last profile';input.dispatchEvent(new window.Event('input'));const buttons=document.querySelectorAll('.palette-tool');assert.equal(buttons.length,1);assert.match(document.getElementById('palette-window-status').textContent,/На этой странице.*Переключите страницу/);buttons[0].click();await Promise.resolve();assert.deepEqual(sent,[{nonce:'page1',index:1}]);receive({nonce:'page2',theme:'light',types:[{kind:'element',type:'Service',label:'Last profile',description:'',enabled:true},{kind:'tool',type:'palette-previous',label:'Previous',description:'Page',enabled:true}]});assert.equal(document.querySelectorAll('.palette-tool').length,2);assert.match(document.querySelector('.palette-tool').textContent,/Last profile/);
});
