import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { createController } from '../src/controller.js';
import {createLocalPreferences} from '../src/preferences.js';
import { installCatalogFolders } from '../src/catalog-folders.js';

function fixture(t,preferences=null,makeMemberRow=null) {
  const dom = new JSDOM('<body><aside class="catalog"><details id="tree-model" open><summary>Model</summary><div class="tree-branches" id="catalog-folders-host"></div></details></aside><svg id="canvas"></svg></body>', { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { window } = dom, { document } = window;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const store = createStore(createProject('Folders')); store.execute({ type: 'createView', name: 'Main' }, store.revision); const model = createController(createStore(store.snapshot));
  const opened = [], added = [], reports = []; let ui, selected = [];
  const render = () => ui.refresh();
  ui = installCatalogFolders({ document, window, model, preferences, makeMemberRow:makeMemberRow?(...args)=>makeMemberRow(document,...args):null, readSelection: () => selected, canvas: document.getElementById('canvas'), render, status: x => reports.push(x), openDialog: id => document.getElementById(id).showModal(), blocked: () => Boolean(document.querySelector('dialog[open]')), selectConcept: ref => model.select(ref), openMetadata: ref => opened.push(ref), addConcept: (ref,point) => added.push(point?{...ref,point}:ref), activateView: id => model.switchView(id), askDelete() {} }); ui.refresh();
  const $ = id => document.getElementById(id), submit = () => $('catalog-folder-dialog').querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const createFolder = (name,destination='@common') => { ui.folderEditor(null,destination); $('catalog-folder-name').value = name; submit(); assert.equal($('catalog-folder-dialog').open, false, $('catalog-folder-error').textContent); return model.store.snapshot.folders.find(item => item.name === name); };
  const button = text => [...document.querySelectorAll('#catalog-folders button')].find(item => item.textContent === text);
  return { $, window, document, model, ui, render, submit, createFolder, button, opened, added, reports, select: refs => { selected = refs; ui.refresh(); } };
}

test('one section tree keeps model identity, compact member rows and one-command moves', t => {
  const h = fixture(t), baseline = h.model.store.exportFiles(), f = h.createFolder('Folder 2');
  assert.equal(h.document.querySelectorAll('[data-catalog-section]').length,9);
  for(const id of ['catalog-folder-back','catalog-folder-home','catalog-folder-breadcrumb','catalog-new-folder'])assert.equal(h.$(id),null);
  h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), baseline); h.model.redo(); h.render();
  const before = h.model.store.exportFiles();
  h.model.execute({ type: 'createElementInModel', elementType: 'Role', name: 'Role 10', folderId: f.id }); h.render();
  const state = h.model.store.snapshot, el = state.elements[0]; assert.equal(el.name, 'Role 10'); assert.equal(state.views[0].occurrences.length, 0); assert.deepEqual(state.folders[0].members, [{ kind: 'element', id: el.id }]);
  h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before); h.model.redo(); h.render();
  assert.equal(h.document.querySelector('[data-folder-id]').open,false);
  h.document.querySelector(`[data-folder-focus="${f.id}"]`).click();
  assert.equal(h.document.querySelector('[data-folder-id]').open,true);
  assert.ok(h.document.querySelector('.catalog-member-row .unused-marker'));h.button('＋').click();assert.deepEqual(h.added,[{kind:'element',id:el.id}]);
  const unchanged=h.model.store.exportFiles(),history=h.model.store.history,member=h.document.querySelector(`[data-element-id="${el.id}"]`),folderButton=h.document.querySelector(`[data-folder-focus="${f.id}"]`);h.ui.refresh();assert.equal(h.document.querySelector(`[data-element-id="${el.id}"]`),member);assert.equal(h.document.querySelector(`[data-folder-focus="${f.id}"]`),folderButton);
  h.document.querySelector(`[data-folder-focus="${f.id}"]`).click();h.document.querySelector(`[data-folder-focus="${f.id}"]`).click();h.ui.refresh();
  assert.deepEqual(h.model.store.exportFiles(),unchanged);assert.deepEqual(h.model.store.history,history);
  h.ui.chooseDestination({ kind: 'element', id: el.id }); const target=h.$('catalog-move-target');target.value='@common';target.dispatchEvent(new h.window.Event('change'));h.submit();
  assert.equal(h.model.store.snapshot.folders[0].members.length,0);assert.equal(h.model.store.snapshot.elements[0].id,el.id);
  const bytes=serializeProjectFile(h.model.store.snapshot);assert.deepEqual(serializeProjectFile(deserializeProjectFile(bytes)),bytes);
});

test('natural folder order, safe delete retaining members, stale and cancelled dialogs cannot apply', t => {
  const h = fixture(t), f = h.createFolder('Folder 10'); h.createFolder('Folder 2');
  assert.deepEqual([...h.document.querySelectorAll('[data-folder-id] > summary button')].map(item => item.textContent), ['Folder 2', 'Folder 10']);
  h.document.querySelector(`[data-folder-focus="${f.id}"]`).click(); const id = h.model.execute({ type: 'createElementInModel', elementType: 'Role', name: 'Retained', folderId: f.id }).created.elementId; h.render();
  h.ui.deleteFolder(f.id); const before = h.model.store.exportFiles(); h.submit(); assert.ok(h.model.store.snapshot.elements.some(item => item.id === id)); h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before); h.render();
  h.ui.folderEditor(null,'@common'); h.$('catalog-folder-name').value = 'Cancelled'; h.$('catalog-folder-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true })); assert.deepEqual(h.model.store.exportFiles(), before);
  h.ui.folderEditor(null,'@common'); const generation = h.ui.generation; h.$('catalog-folder-name').dispatchEvent(new h.window.Event('input', { bubbles: true })); assert.ok(h.ui.generation > generation);
  h.model.execute({ type: 'renameProject', name: 'Changed' }); const changed = h.model.store.exportFiles(); h.submit(); assert.deepEqual(h.model.store.exportFiles(), changed); assert.match(h.$('catalog-folder-error').textContent, /Модель изменилась/);
});

test('concept type change previews whole graph and keeps ID, metadata and drawings through undo', t => {
  const h = fixture(t); const a = h.model.execute({ type: 'createElementAndOccurrence', viewId: h.model.viewId, elementType: 'Role', name: 'Role', documentation: 'Retained\r\ntext', bounds: { x: 10, y: 10, width: 100, height: 80 } }).created;
  const before = h.model.store.exportFiles(); h.ui.changeType({ kind: 'element', id: a.elementId }); assert.equal(h.$('catalog-folder-apply').disabled, true);
  h.$('catalog-new-type').value = 'Collaboration'; h.$('catalog-new-type').dispatchEvent(new h.window.Event('change')); assert.match(h.$('catalog-type-impact').textContent, /представлений: 1/); h.submit();
  const state = h.model.store.snapshot; assert.equal(state.elements[0].id, a.elementId); assert.equal(state.elements[0].type, 'Collaboration'); assert.equal(state.elements[0].documentation, 'Retained\r\ntext'); assert.equal(state.views[0].occurrences[0].id, a.occurrenceId);
  h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before);
});

test('folder preferences page lazily, reveal search-selected exact members, sort without dirtying model and keep all records reachable',t=>{
 const memory=new Map(),preferences=createLocalPreferences({getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}),behavior=preferences.get('behavior');behavior.treePageSize=25;preferences.update('behavior',behavior);const h=fixture(t,preferences),folder=h.createFolder('Many');
 const ids=[];for(let i=1;i<=61;i++){const id=h.model.execute({type:'createElementInModel',elementType:'Role',name:`Role ${i}`,folderId:folder.id}).created.elementId;ids.push(id);}h.ui.refresh();h.document.querySelector(`[data-folder-focus="${folder.id}"]`).click();assert.equal(h.document.querySelector(`[data-folder-id="${folder.id}"]`).querySelectorAll('.catalog-member-row').length,25);const before=h.model.store.exportFiles(),history=h.model.store.history;
 [...h.document.querySelectorAll('[data-catalog-more]')].find(item=>!item.disabled).click();assert.equal(h.document.querySelector(`[data-folder-id="${folder.id}"]`).querySelectorAll('.catalog-member-row').length,25);assert.match(h.document.querySelector(`[data-folder-id="${folder.id}"] .catalog-member-row`).textContent,/Role 26/);h.model.select({kind:'element',id:ids.at(-1)});const target=h.ui.reveal({kind:'element',id:ids.at(-1)});assert.equal(target.dataset.elementId,ids.at(-1));assert.ok(target.textContent.includes('Role 61'));
 const settings=preferences.get('behavior');settings.lazyTree=false;settings.naturalSort=false;preferences.update('behavior',settings);const names=[...h.document.querySelectorAll('.catalog-member-row [data-element-id]')].map(item=>item.querySelector('.element-name').textContent);assert.deepEqual(names.slice(0,3),['Role 1','Role 10','Role 11']);assert.equal(names.length,61);assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
});

test('type-change explanation preference hides only optional help; full graph impact, exact documentation and one Undo remain',t=>{
 const memory=new Map(),preferences=createLocalPreferences({getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}),h=fixture(t,preferences),element=h.model.execute({type:'createElementInModel',elementType:'Role',name:'Exact',documentation:'Keep\r\n🙂'}).created.elementId,ref={kind:'element',id:element},before=h.model.store.exportFiles();
 h.ui.changeType(ref);h.$('catalog-new-type').value='Collaboration';h.$('catalog-new-type').dispatchEvent(new h.window.Event('change'));assert.ok(h.$('catalog-type-explanation'));h.ui.cancel();const behavior=preferences.get('behavior');behavior.explainTypeChange=false;preferences.update('behavior',behavior);
 h.ui.changeType(ref);h.$('catalog-new-type').value='Collaboration';h.$('catalog-new-type').dispatchEvent(new h.window.Event('change'));assert.equal(h.$('catalog-type-explanation'),null);assert.match(h.$('catalog-type-impact').textContent,/Затронутых отношений/);h.submit();assert.equal(h.model.store.snapshot.elements.find(item=>item.id===element).documentation,'Keep\r\n🙂');h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
});


test('catalogue selection moves atomically with cycle preview and group type changes preserve exact Undo', t => {
 const h=fixture(t),a=h.createFolder('A'),child=h.model.execute({type:'createFolder',name:'Child',parentFolderId:a.id}).created.folderId,b=h.createFolder('B');
 const ids=['Service','Process'].map((elementType,i)=>h.model.execute({type:'createElementInModel',elementType,name:`Selected ${i}`,folderId:a.id}).created.elementId),refs=ids.map(id=>({kind:'element',id}));
 h.select([{kind:'folder',id:a.id},{kind:'folder',id:child},...refs]);const before=h.model.store.exportFiles(),history=h.model.store.history.undo;
 h.ui.chooseDestination({kind:'folder',id:a.id});const target=h.$('catalog-move-target');target.value=child;target.dispatchEvent(new h.window.Event('change'));assert.equal(h.$('catalog-folder-apply').disabled,true);assert.match(h.$('catalog-move-impact').textContent,/потомка/);h.submit();assert.deepEqual(h.model.store.exportFiles(),before);
 target.value=b.id;target.dispatchEvent(new h.window.Event('change'));assert.equal(h.$('catalog-folder-apply').disabled,false);assert.match(h.$('catalog-move-impact').textContent,/вместе с выбранной папкой/);h.submit();assert.equal(h.model.store.history.undo,history+1);assert.equal(h.model.store.snapshot.folders.find(item=>item.id===child).parentFolderId,a.id);assert.deepEqual(h.model.store.snapshot.folders.find(item=>item.id===a.id).members,refs);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
 h.select(refs);h.ui.changeType(refs[0]);h.$('catalog-new-type').value='Role';h.$('catalog-new-type').dispatchEvent(new h.window.Event('change'));assert.match(h.$('catalog-type-impact').textContent,/Изменяемых объектов: 2/);h.submit();assert.ok(h.model.store.snapshot.elements.every(item=>item.type==='Role'));h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
 h.ui.changeType(refs[0]);h.$('catalog-new-type').value='Role';h.$('catalog-new-type').dispatchEvent(new h.window.Event('change'));h.model.execute({type:'renameProject',name:'Later'});const changed=h.model.store.exportFiles();h.submit();assert.match(h.$('catalog-folder-error').textContent,/Модель изменилась/);assert.deepEqual(h.model.store.exportFiles(),changed);
});


test('context API cut/paste scopes the hit group, duplicate is one command and replacement clears cut state', t => {
  const h = fixture(t), a = h.createFolder('A'), b = h.createFolder('B');
  const ids = ['Service', 'Process'].map(elementType => h.model.execute({ type: 'createElementInModel', elementType, name: elementType, folderId: a.id }).created.elementId);
  const refs = ids.map(id => ({ kind: 'element', id })); h.select(refs); const before = h.model.store.exportFiles(), history = h.model.store.history.undo;
  assert.equal(h.ui.cut(refs[0]), true); assert.equal(h.ui.hasCut, true); assert.deepEqual(h.model.store.exportFiles(), before);
  h.ui.paste(b.id); assert.equal(h.$('catalog-folder-dialog').open, true); h.submit();
  assert.deepEqual(h.model.store.snapshot.folders.find(folder => folder.id === b.id).members, refs); assert.equal(h.model.store.history.undo, history + 1); assert.equal(h.ui.hasCut, false);
  h.model.undo(); h.render(); assert.deepEqual(h.model.store.exportFiles(), before);
  assert.equal(h.ui.duplicate(refs[0]), true); assert.equal(h.model.store.history.undo, history + 1); assert.equal(h.model.store.snapshot.elements.length, 3); assert.ok(h.model.store.snapshot.elements.some(item => item.name === 'Service — копия'));
  h.model.undo(); h.render(); assert.deepEqual(h.model.store.exportFiles(), before);
  assert.equal(h.ui.duplicate({ kind: 'folder', id: a.id }), false); assert.equal(h.ui.cut({ kind: 'element', id: 'missing' }), false);
  h.ui.cut(refs[0]); h.ui.paste(b.id); h.model.execute({ type: 'renameProject', name: 'New revision' }); const changed = h.model.store.exportFiles(); h.submit(); assert.deepEqual(h.model.store.exportFiles(), changed); assert.match(h.$('catalog-folder-error').textContent, /Модель изменилась/); h.ui.cancel();
  h.model.store = createStore(createProject('Replacement')); h.render(); assert.equal(h.ui.hasCut, false); assert.equal(h.ui.paste(), false);
});

test('fixed sections and nested empty folders retain local expansion without changing the model',t=>{
  const h=fixture(t),folder=h.createFolder('Network','@technology'),child=h.createFolder('Office',folder.id);
  const record=h.model.store.snapshot.folders.find(item=>item.id===child.id);assert.equal(record.parentFolderId,folder.id);assert.deepEqual(record.properties,[{key:'arkita:catalog-section',value:'technology'}]);
  assert.equal(h.document.querySelector(`[data-folder-id="${folder.id}"]`).closest('[data-catalog-section]').dataset.catalogSection,'technology');
  assert.equal(h.document.querySelector(`[data-folder-id="${child.id}"]`).closest('[data-folder-id]').dataset.folderId,child.id);
  const before=h.model.store.exportFiles(),history=h.model.store.history;const root=h.$('tree-technology');root.open=false;h.ui.refresh();assert.equal(root.open,false);root.open=true;h.ui.refresh();assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
  const bytes=serializeProjectFile(h.model.store.snapshot);h.model.store=createStore(deserializeProjectFile(bytes));h.ui.refresh();assert.equal(h.document.querySelector(`[data-folder-id="${folder.id}"]`).open,false);assert.equal(h.document.querySelector(`[data-folder-id="${child.id}"]`),null);assert.deepEqual(h.model.store.exportFiles(),before);
});

test('legacy mixed folder projects its ancestor chain into sections without duplicating any object',t=>{
 const h=fixture(t),parent=h.model.execute({type:'createFolder',name:'Imported'}).created.folderId,folder=h.model.execute({type:'createFolder',name:'Mixed',parentFolderId:parent}).created.folderId;
 const role=h.model.execute({type:'createElementInModel',elementType:'Role',name:'Role',folderId:folder}).created.elementId,device=h.model.execute({type:'createElementInModel',elementType:'Device',name:'Device',folderId:folder}).created.elementId;h.ui.refresh();
 const before=h.model.store.exportFiles(),history=h.model.store.history;h.ui.reveal({kind:'element',id:role});h.ui.reveal({kind:'element',id:device});
 for(const [section,id] of [['common',role],['technology',device]]){const branch=h.$(`tree-${section}`);assert.ok(branch.querySelector(`[data-folder-id="${parent}"] [data-folder-id="${folder}"] [data-element-id="${id}"]`));assert.equal(branch.querySelector('.tree-count').textContent,'1');assert.equal(h.document.querySelectorAll(`[data-element-id="${id}"]`).length,1);}
 assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
 h.ui.folderEditor(null,folder,'technology');h.$('catalog-folder-name').value='Child in technology';h.submit();assert.equal(h.model.store.snapshot.folders.find(item=>item.name==='Child in technology').properties.find(item=>item.key==='arkita:catalog-section').value,'technology');h.model.undo();h.ui.refresh();
 h.ui.folderEditor(folder);h.$('catalog-folder-name').value='Renamed mixed';h.submit();assert.equal(h.model.store.snapshot.folders.find(item=>item.id===folder).name,'Renamed mixed');assert.deepEqual(h.model.store.snapshot.folders.find(item=>item.id===folder).properties,[]);h.model.undo();h.ui.refresh();
 h.ui.deleteFolder(folder);assert.match(h.$('catalog-folder-fields').textContent,/общая для разделов/);h.ui.cancel();
 const wrongProjection=dataTransfer();transferEvent(h,'dragstart',h.document.querySelector(`[data-element-id="${role}"]`),wrongProjection);transferEvent(h,'drop',h.$('tree-technology').querySelector(`[data-folder-id="${folder}"] > summary`),wrongProjection);assert.equal(h.$('catalog-folder-apply').disabled,true);assert.match(h.$('catalog-folder-fields').textContent,/только объекты её раздела/);h.ui.cancel();assert.deepEqual(h.model.store.exportFiles(),before);
 h.ui.chooseDestination({kind:'element',id:device});const target=h.$('catalog-move-target');target.append(new h.window.Option('Wrong section','@common'));target.value='@common';target.dispatchEvent(new h.window.Event('change'));assert.equal(h.$('catalog-folder-apply').disabled,true);assert.match(h.$('catalog-move-impact').textContent,/только объекты её раздела/);h.submit();assert.deepEqual(h.model.store.exportFiles(),before);
});

function transferEvent(h,type,target,data){const event=new h.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:data});target.dispatchEvent(event);return event;}
function dataTransfer(){const values=new Map();return {setData:(type,value)=>values.set(type,value),getData:type=>values.get(type)??''};}

test('catalogue native drag previews the actual target section, applies once and rejects stale view or revision',t=>{
 const h=fixture(t),folder=h.createFolder('Target'),id=h.model.execute({type:'createElementInModel',elementType:'Role',name:'Dragged'}).created.elementId;h.ui.refresh();
 let data=dataTransfer();const before=h.model.store.exportFiles(),history=h.model.store.history.undo;transferEvent(h,'dragstart',h.document.querySelector(`[data-element-id="${id}"]`),data);transferEvent(h,'drop',h.document.querySelector(`[data-folder-id="${folder.id}"] > summary`),data);assert.equal(h.$('catalog-folder-dialog').open,true);assert.deepEqual(h.model.store.exportFiles(),before);h.submit();assert.equal(h.model.store.history.undo,history+1);assert.deepEqual(h.model.store.snapshot.folders.find(item=>item.id===folder.id).members,[{kind:'element',id}]);h.model.undo();h.ui.refresh();
 data=dataTransfer();transferEvent(h,'dragstart',h.document.querySelector(`[data-element-id="${id}"]`),data);h.model.execute({type:'renameProject',name:'Changed'});transferEvent(h,'drop',h.$('tree-common').querySelector('summary'),data);assert.equal(h.$('catalog-folder-dialog').open,false);
 h.model.execute({type:'createView',name:'Other'});h.ui.refresh();data=dataTransfer();transferEvent(h,'dragstart',h.document.querySelector(`[data-element-id="${id}"]`),data);h.model.switchView(h.model.store.snapshot.views.at(-1).view.id);transferEvent(h,'drop',h.$('tree-common').querySelector('summary'),data);assert.equal(h.$('catalog-folder-dialog').open,false);
 h.ui.refresh();data=dataTransfer();transferEvent(h,'dragstart',h.document.querySelector(`[data-element-id="${id}"]`),data);h.document.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));transferEvent(h,'drop',h.document.querySelector(`[data-folder-id="${folder.id}"] > summary`),data);assert.equal(h.$('catalog-folder-dialog').open,false);
});


test('catalogue native canvas drop reuses one model object, carries a point and ignores duplicate delivery',t=>{
 const h=fixture(t),id=h.model.execute({type:'createElementInModel',elementType:'Role',name:'Shared'}).created.elementId;h.ui.refresh();const canvas=h.$('canvas');
 canvas.getBoundingClientRect=()=>({left:10,top:10,right:610,bottom:410,width:600,height:400});Object.defineProperty(canvas,'viewBox',{value:{baseVal:{x:0,y:0,width:600,height:400}}});canvas.getClientRects=()=>[canvas.getBoundingClientRect()];canvas.getScreenCTM=()=>({a:1,b:0,c:0,d:1,e:10,f:10,inverse:()=>({a:1,b:0,c:0,d:1,e:-10,f:-10})});
 const data=dataTransfer(),before=h.model.store.exportFiles();transferEvent(h,'dragstart',h.document.querySelector(`[data-element-id="${id}"]`),data);
 function drop(){const event=new h.window.MouseEvent('drop',{bubbles:true,cancelable:true,clientX:210,clientY:110});Object.defineProperty(event,'dataTransfer',{value:data});canvas.dispatchEvent(event);}drop();drop();assert.deepEqual(h.added,[{kind:'element',id,point:{x:200,y:100}}]);assert.deepEqual(h.model.store.exportFiles(),before);
});


test('explicit typed-root paste follows its target even when the current selection belongs to another section',t=>{
 const h=fixture(t),folder=h.createFolder('Network','@technology'),device=h.model.execute({type:'createElementInModel',elementType:'Device',name:'Router',folderId:folder.id}).created.elementId,role=h.model.execute({type:'createElementInModel',elementType:'Role',name:'Selected Common'}).created.elementId;h.model.select({kind:'element',id:role});h.ui.refresh();assert.equal(h.ui.currentSection,'common');
 const before=h.model.store.exportFiles(),history=h.model.store.history.undo;h.ui.cut({kind:'element',id:device});h.ui.paste('@technology');assert.equal(h.$('catalog-folder-apply').disabled,false,h.$('catalog-folder-fields').textContent);h.submit();assert.deepEqual(h.model.store.snapshot.folders.find(item=>item.id===folder.id).members,[]);assert.equal(h.model.store.history.undo,history+1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
});


test('new folder beyond the first lazy page is revealed and focused after its dialog closes',t=>{
 const memory=new Map(),preferences=createLocalPreferences({getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}),behavior=preferences.get('behavior');behavior.treePageSize=25;preferences.update('behavior',behavior);const h=fixture(t,preferences);
 for(let i=1;i<=30;i++)h.model.execute({type:'createFolder',name:`Folder ${i}`,properties:[{key:'arkita:catalog-section',value:'common'}]});h.ui.refresh();assert.equal(h.$('tree-common').querySelectorAll('[data-folder-id]').length,25);
 const before=h.model.store.exportFiles(),history=h.model.store.history.undo,created=h.createFolder('ZZZ last');assert.ok(h.$('tree-common').querySelector(`[data-folder-id="${created.id}"]`));assert.equal(h.document.activeElement.dataset.folderFocus,created.id);assert.equal(h.model.store.history.undo,history+1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
});


test('refresh reads one snapshot and view for 61 rows and shares that context with custom member renderers',t=>{
 for(const custom of [false,true]){
  const contexts=[],makeRow=custom?(document,_ref,item,context)=>{contexts.push(context);const row=document.createElement('div');row.textContent=item.name;return row;}:null,h=fixture(t,null,makeRow);
  for(let i=1;i<=61;i++)h.model.execute({type:'createElementInModel',elementType:'Role',name:`Role ${i}`});
  const reads={snapshot:0,view:0,selection:0},store=h.model.store,view=Object.getOwnPropertyDescriptor(h.model,'view'),selection=Object.getOwnPropertyDescriptor(h.model,'selection');
  h.model.store=new Proxy(store,{get(target,name){if(name==='snapshot')reads.snapshot++;return Reflect.get(target,name,target);}});
  Object.defineProperty(h.model,'view',{...view,get(){reads.view++;return view.get();}});Object.defineProperty(h.model,'selection',{...selection,get(){reads.selection++;return selection.get();}});
  contexts.length=0;h.ui.refresh();assert.equal(h.document.querySelectorAll('[data-catalog-kind="element"]').length,61);assert.deepEqual(reads,{snapshot:1,view:1,selection:1});
  if(custom){assert.equal(contexts.length,62);const first=contexts[0];assert.ok(first.state.elements.length===61);assert.ok(first.records instanceof Map);for(const context of contexts){assert.equal(context.state,first.state);assert.equal(context.view,first.view);assert.equal(context.selected,first.selected);assert.equal(context.records,first.records);}}
 }
});


test('queued tree toggles from install, refresh or reveal do not invalidate file transaction generations',async t=>{
 const h=fixture(t),flush=()=>new Promise(resolve=>setTimeout(resolve,5));let generation=h.ui.generation;await flush();assert.equal(h.ui.generation,generation,'initially open section toggles are presentation only');
 const folder=h.createFolder('Network','@technology'),device=h.model.execute({type:'createElementInModel',elementType:'Device',name:'Router',folderId:folder.id}).created.elementId;h.ui.refresh();const root=h.$('tree-technology');root.open=false;generation=h.ui.generation;h.ui.refresh();await flush();assert.equal(h.ui.generation,generation,'programmatic root disclosure does not change the editor generation');
 h.ui.reveal({kind:'element',id:device});generation=h.ui.generation;const before=h.model.store.exportFiles(),history=h.model.store.history;await flush();assert.equal(h.ui.generation,generation,'queued reveal toggles do not count as another interaction');assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
 const summary=h.document.querySelector(`[data-folder-id="${folder.id}"] > summary`);summary.click();assert.equal(h.ui.generation,generation+1,'native summary interaction invalidates synchronously');generation=h.ui.generation;await flush();assert.equal(h.ui.generation,generation,'its later toggle does not invalidate twice');
 root.querySelector(':scope > summary').click();assert.equal(h.ui.generation,generation+1);generation=h.ui.generation;await flush();assert.equal(h.ui.generation,generation);
});


test('actual catalogue buttons stay explicit native drag sources through cached refresh and move only once',t=>{
 const h=fixture(t),folder=h.createFolder('Target'),id=h.model.execute({type:'createElementInModel',elementType:'Grouping',name:'Drag this button'}).created.elementId;h.ui.refresh();
 const source=h.document.querySelector(`[data-element-id="${id}"]`),row=source.closest('.catalog-member-row'),folderButton=h.document.querySelector(`[data-folder-focus="${folder.id}"]`);assert.equal(row.draggable,true);assert.equal(source.draggable,true);assert.equal(folderButton.draggable,true);assert.equal(folderButton.closest('summary').draggable,true);assert.equal(row.querySelector('.tree-add-element').draggable,false);
 h.ui.refresh();assert.equal(h.document.querySelector(`[data-element-id="${id}"]`),source);assert.equal(source.draggable,true,'fresh button attributes must not remove the native drag source from the cached button');
 const before=h.model.store.exportFiles(),history=h.model.store.history.undo,data=dataTransfer();transferEvent(h,'dragstart',source,data);assert.match(data.getData('application/x-arkita-catalog'),/^[0-9a-f-]{36}$/);transferEvent(h,'drop',folderButton,data);assert.equal(h.$('catalog-folder-dialog').open,true);assert.equal(h.$('catalog-folder-apply').disabled,false);assert.deepEqual(h.model.store.exportFiles(),before);h.submit();transferEvent(h,'drop',folderButton,data);h.submit();assert.equal(h.model.store.history.undo,history+1);assert.deepEqual(h.model.store.snapshot.folders.find(item=>item.id===folder.id).members,[{kind:'element',id}]);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
});
