import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createStore,createProject} from '../../schemka-model-core/src/index.js';
import {conceptProject} from '../../schemka-model-core/fixtures/concept-project.js';
import {installRelationshipReference} from '../src/relationship-reference.js';
import {installModelGallery} from '../src/model-gallery.js';
import {evaluateConceptRelationship} from '../../schemka-model-profiles/src/index.js';
import {modelProfiles,diagnosticPresentation} from '../src/profile-ui.js';

function fixture(t,state=conceptProject()) {
 const dom=new JSDOM('<!doctype html><html><body><details class="app-menu"><summary>Вид</summary><div class="menu-items"></div></details><details class="app-menu"><summary>Справка</summary><div class="menu-items"></div></details></body></html>',{pretendToBeVisual:true});t.after(()=>dom.window.close());const {window}=dom,{document}=window;
 window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};const model={store:createStore(state)},reports=[],opened=[];let blocked=false;
 const h={window,document,model,reports,opened,openDialog:id=>document.getElementById(id).setAttribute('open',''),blocked:()=>blocked,status:text=>reports.push(text),activateView:id=>opened.push(id),$:id=>document.getElementById(id),run:command=>model.store.execute(command,model.store.revision).created,get files(){return model.store.exportFiles();},set busy(value){blocked=value;}};return h;
}
const change=(h,id,value)=>{const field=h.$(id);field.value=value;field.dispatchEvent(new h.window.Event('change',{bubbles:true}));};
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
const svg='<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60"><rect x="0" y="0" width="100" height="60" fill="#ffffff"/></svg>';

test('relationship reference selects all endpoint categories and all three outcomes through the same checked registry, read-only with precise provenance',t=>{
 const h=fixture(t),ui=installRelationshipReference(h),before=h.files,history=h.model.store.history;assert.equal(ui.open(),true);
 for(const [source,type,target,status] of [['element:Node','Composition','element:Device','ALLOWED'],['element:DataObject','Assignment','element:Device','FORBIDDEN'],['element:Product','Composition','element:Deliverable','UNKNOWN'],['junction:AndJunction','Association','relationship:Flow','ALLOWED']]){
  change(h,'relationship-reference-source',source);change(h,'relationship-reference-target',target);change(h,'relationship-reference-type',type);assert.equal(h.$('relationship-reference-result').dataset.assessment,status);
  const decode=value=>{const[kind,type]=value.split(':');return{kind,type};};const expected=evaluateConceptRelationship(modelProfiles,h.model.store.snapshot.project.metamodel,{source:decode(source),target:decode(target),relationshipType:type,scope:'direct'});assert.equal(h.$('relationship-reference-result').textContent,diagnosticPresentation(expected).summary);assert.match(h.$('relationship-reference-version').textContent,/schemka-archimate4 · 2.*C260.*a29ef66a/);
 }
 assert.deepEqual(h.files,before);assert.deepEqual(h.model.store.history,history);ui.cancel();h.busy=true;assert.equal(ui.open(),false);
});

test('gallery filters exact folder descendants, labels duplicate views and keyboard navigates correct IDs without any model edit',async t=>{
 const h=fixture(t);const first=h.model.store.snapshot.views[0].view.id,second=h.model.store.snapshot.views[1].view.id;h.run({type:'renameView',viewId:first,name:'Одинаковое <img>'});h.run({type:'renameView',viewId:second,name:'Одинаковое <img>'});
 const parent=h.run({type:'createFolder',name:'Дом'}).folderId;h.run({type:'createFolder',name:'Сеть',parentFolderId:parent,members:[{kind:'view',id:second}]});let rendered=0;const ui=installModelGallery({...h,snapshotViewSvg:()=>{rendered++;return svg;}}),before=h.files,history=h.model.store.history;ui.open();await tick();assert.equal(h.$('model-gallery-list').querySelectorAll('button').length,2);assert.equal(rendered,2);assert.equal(h.$('model-gallery-list').querySelector('img').src.startsWith('data:image/svg+xml'),true);assert.equal(h.$('model-gallery-list').querySelector('script'),null);
 change(h,'model-gallery-folder',parent);await tick();const target=h.$('model-gallery-list').querySelector('button');assert.equal(target.dataset.viewId,second);assert.match(target.textContent,/Дом \/ Сеть/);h.$('model-gallery-descendants').checked=false;h.$('model-gallery-descendants').dispatchEvent(new h.window.Event('change'));assert.equal(h.$('model-gallery-list').children.length,0);
 h.$('model-gallery-descendants').checked=true;h.$('model-gallery-descendants').dispatchEvent(new h.window.Event('change'));const picked=h.$('model-gallery-list').querySelector('button');picked.focus();picked.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));assert.equal(h.document.activeElement,picked);picked.click();assert.deepEqual(h.opened,[second]);assert.equal(ui.active,false);assert.deepEqual(h.files,before);assert.deepEqual(h.model.store.history,history);
});

test('gallery invalidates shared-edit previews, preserves geometry on size changes and fences stale/cancelled thumbnail jobs and buttons',async t=>{
 const h=fixture(t);let rendered=0;const ui=installModelGallery({...h,snapshotViewSvg:()=>{rendered++;return svg;}});ui.open();ui.cancel();await tick();assert.equal(rendered,0);ui.open();await tick();const before=h.files,old=h.$('model-gallery-list').querySelector('button'),count=rendered;
 h.$('model-gallery-size').value='320';h.$('model-gallery-size').dispatchEvent(new h.window.Event('input'));await tick();assert.equal(rendered,count);assert.equal(h.$('model-gallery-list').querySelector('img').width,320);assert.deepEqual(h.files,before);
 const element=h.model.store.snapshot.elements[0];h.run({type:'renameElement',elementId:element.id,name:'Общий концепт изменён'});const changed=h.files;old.click();assert.deepEqual(h.opened,[]);ui.refresh();await tick();assert.equal(rendered,count+2);assert.deepEqual(h.files,changed);ui.cancel();
});

test('gallery pages a long model in bounded groups and reopens a replacement document without cached or late navigation',async t=>{
 const h=fixture(t,createProject('Many'));for(let i=0;i<27;i++)h.run({type:'createView',name:`View ${i}`});let rendered=0;const ui=installModelGallery({...h,snapshotViewSvg:()=>{rendered++;return svg;}});ui.open();await tick();assert.equal(h.$('model-gallery-list').children.length,12);assert.ok(rendered<=12);h.$('model-gallery-next').click();await tick();assert.equal(h.$('model-gallery-list').children.length,12);h.$('model-gallery-next').click();await tick();assert.equal(h.$('model-gallery-list').children.length,3);assert.equal(h.$('model-gallery-next').disabled,true);assert.equal(h.$('model-gallery-previous').disabled,false);
 const stale=h.$('model-gallery-list').querySelector('button');h.model.store=createStore(createProject('Replacement'));ui.refresh();stale.click();assert.deepEqual(h.opened,[]);assert.equal(h.$('model-gallery-list').children.length,0);ui.cancel();
});
