import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { createController } from '../src/controller.js';
import { installVisualsUI } from '../src/visuals-ui.js';

function fixture(t,readResizeBehavior=()=>'retain') {
  const dom = new JSDOM('<!doctype html><html><body><div id="catalogue-palette"></div><svg id="canvas" viewBox="0 0 900 640" xmlns="http://www.w3.org/2000/svg"></svg></body></html>', { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { window } = dom, { document } = window; window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 640, width: 900, height: 640 }); window.Element.prototype.getClientRects = () => [{ x: 0, y: 0, width: 900, height: 640 }]; window.SVGElement.prototype.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } }); window.Element.prototype.setPointerCapture = function () {}; window.Element.prototype.hasPointerCapture = () => false;
  const store = createStore(createProject('UI')); const first = store.execute({ type: 'createView', name: 'Main' }, store.revision).created.viewId; store.execute({ type: 'createView', name: 'Destination' }, store.revision); const model = createController(createStore(store.snapshot)); model.switchView(first);
  const canvas = document.getElementById('canvas'), reports = [], opened = []; let renders = 0, ui;
  const render = () => { renders++; ui?.refresh(); };
  ui = installVisualsUI({ document, window, model, canvas, readResizeBehavior, openDialog: id => document.getElementById(id).showModal(), render, status: text => reports.push(text), openMetadata: owner => opened.push(owner), activateView: id => model.switchView(id) });
  const $ = id => document.getElementById(id), submit = () => $('visual-form').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
  const add = (kind, values = {}) => { $(`visual-add-${kind}`).click(); for (const [key, value] of Object.entries(values)) $(`visual-${key}`).value = value; submit(); assert.equal($('visual-dialog').open, false, $('visual-error').textContent); return model.selection; };
  const pointer = (target, type, x, y) => { const event = new window.Event(type, { bubbles: true, cancelable: true }); Object.assign(event, { button: 0, isPrimary: true, pointerId: 1, clientX: x, clientY: y }); target.dispatchEvent(event); };
  const marker = ref => { const element = document.createElementNS('http://www.w3.org/2000/svg', 'g'); element.dataset.kind = ref.kind; element.dataset.id = ref.id; canvas.append(element); return element; };
  return { $, model, store: model.store, ui, window, document, canvas, submit, add, reports, opened, render, pointer, marker, get renders() { return renders; } };
}

test('reachable visual controls create all five kinds, cancel/stale drafts, exact Undo and native reopen', t => {
  const h = fixture(t), baseline = h.store.exportFiles();
  h.$('visual-add-note').click(); h.$('visual-text').value = 'Cancelled'; h.$('visual-cancel').click(); assert.deepEqual(h.store.exportFiles(), baseline);
  const note = h.add('note', { text: '<script>inert()</script>\nNote' }); assert.equal(h.store.history.undo, 1); assert.equal(h.store.snapshot.elements.length, 0);
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), baseline); h.model.redo();
  h.add('group', { name: 'Container' }); h.add('legend', { 'legend-columns': '2', 'legend-colors': 'pastel' }); h.add('viewReference');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123456"/></svg>';
  const asset = h.model.execute({ type: 'createAsset', name: 'Icon', mediaType: 'image/svg+xml', data: Buffer.from(svg).toString('base64') }).created.assetId;
  h.add('image', { asset }); const bytes = serializeProjectFile(h.store.snapshot); assert.deepEqual(serializeProjectFile(deserializeProjectFile(bytes)), bytes);
  h.$('visual-add-note').click(); h.$('visual-text').value = 'Stale'; h.model.execute({ type: 'renameProject', name: 'Changed elsewhere' }); h.ui.refresh(); assert.equal(h.$('visual-dialog').open, false); const before = h.store.exportFiles(); h.submit(); assert.deepEqual(h.store.exportFiles(), before);
});

test('node edit keeps exact untouched text, metadata uses typed owner, parent delete retains child and can undo', t => {
  const h = fixture(t), group = h.add('group'), note = h.add('note', { text: 'Initial', parent: `visualNode:${group.id}` });
  h.model.execute({ type: 'updateVisualNode', viewId: h.model.viewId, nodeId: note.id, text: 'Exact\r\ntext' }); h.ui.refresh();
  h.$('visual-edit').click(); h.$('visual-name').value = 'Renamed'; h.submit(); assert.equal(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.find(item => item.id === note.id).text, 'Exact\r\ntext');
  h.$('visual-edit').click(); h.$('visual-metadata').click(); assert.deepEqual(h.opened, [{ kind: 'visualNode', viewId: h.model.viewId, id: note.id }]);
  h.model.select(group); h.ui.refresh(); h.$('visual-edit').click(); h.$('visual-delete').click(); h.submit(); assert.ok(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.some(item => item.id === note.id)); assert.equal(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.find(item => item.id === note.id).parent, null);
  h.model.undo(); assert.equal(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.find(item => item.id === note.id).parent.id, group.id);
});

test('style modal applies human fields once, reset and brush are atomic and never expose JSON editors', t => {
  const h = fixture(t), a = h.add('note', { text: 'A' }), b = h.add('group'); h.model.select(a); h.ui.refresh();
  const before = h.store.exportFiles(); h.$('visual-style').click(); h.$('visual-fill').value = '#123456'; h.$('visual-fontSize').value = '22'; h.$('visual-shape').value = 'rounded'; h.$('visual-labelTemplate').value = '${name}'; h.submit();
  const styled = h.store.exportFiles(); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before); h.model.redo(); assert.deepEqual(h.store.exportFiles(), styled);
  h.$('visual-style').click(); h.$('visual-style-copy').click(); h.model.select(b); h.ui.refresh(); h.$('visual-style-paste').click(); h.submit(); const entry = h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId); assert.deepEqual(entry.visualNodes.find(item => item.id === a.id).style, entry.visualNodes.find(item => item.id === b.id).style);
  h.$('visual-style').click(); h.$('visual-style-reset').click(); assert.deepEqual(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.find(item => item.id === b.id).style, {});
  assert.equal(h.document.querySelector('[aria-label*=JSON],textarea[name*=json]'), null);
});

test('dragged visual connector is one undo action, cancellation/stale release cannot write and no semantic relation is created', t => {
  const h = fixture(t), a = h.add('note'), b = h.add('group'), source = h.marker(a), target = h.marker(b), before = h.store.exportFiles(), undo = h.store.history.undo;
  h.$('visual-connector-tool').click(); h.pointer(source, 'pointerdown', 100, 100); h.pointer(h.canvas, 'pointermove', 300, 120); h.document.elementFromPoint = () => target; h.pointer(h.canvas, 'pointerup', 300, 120);
  const entry = h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId); assert.equal(entry.visualConnectors.length, 1); assert.equal(h.store.snapshot.relationships.length, 0); assert.equal(h.store.history.undo, undo + 1);
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), before);
  h.$('visual-connector-tool').click(); h.pointer(source, 'pointerdown', 100, 100); h.ui.cancel(); h.pointer(h.canvas, 'pointerup', 300, 120); assert.deepEqual(h.store.exportFiles(), before);
  h.$('visual-connector-tool').click(); h.pointer(source, 'pointerdown', 100, 100); h.model.execute({ type: 'renameProject', name: 'Other change' }); const changed = h.store.exportFiles(); h.pointer(h.canvas, 'pointerup', 300, 120); assert.deepEqual(h.store.exportFiles(), changed);
});

test('upload and create-image commit once, unsafe SVG/late async reads leave the document unchanged', async t => {
  const h = fixture(t), source = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123456"/></svg>';
  const file = value => { const blob = new Blob([value], { type: 'image/svg+xml' }); Object.defineProperty(blob, 'name', { value: 'Icon.svg' }); return blob; };
  async function upload(value) { const input = h.$('visual-upload'); Object.defineProperty(input, 'files', { value: [value], configurable: true }); input.dispatchEvent(new h.window.Event('change', { bubbles: true })); for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); }
  h.$('visual-add-image').click(); const before = h.store.exportFiles(); await upload(file(source)); assert.deepEqual(h.store.exportFiles(), before); h.submit(); assert.equal(h.$('visual-dialog').open, false); assert.equal(h.store.snapshot.assets.length, 1); assert.equal(h.store.history.undo, 1);
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), before); h.model.redo();
  h.$('visual-add-image').click(); const valid = h.store.exportFiles(); await upload(file('<svg onload="bad()"/>')); assert.match(h.$('visual-error').textContent, /не добавлено/); h.$('visual-cancel').click(); assert.deepEqual(h.store.exportFiles(), valid);
  let release; const delayed = { name: 'Late.svg', type: 'image/svg+xml', size: Buffer.byteLength(source), arrayBuffer: () => new Promise(resolve => { release = resolve; }) };
  h.$('visual-add-image').click(); const input = h.$('visual-upload'); Object.defineProperty(input, 'files', { value: [delayed], configurable: true }); input.dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('visual-cancel').click(); release(new TextEncoder().encode(source).buffer); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(h.store.exportFiles(), valid); assert.equal(h.$('visual-dialog').open, false);
});

test('view-reference double click/Enter navigate, resource library reuses resources and protects used deletion', t => {
  const h = fixture(t), reference = h.add('viewReference'), target = h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.find(item => item.id === reference.id).targetViewId, marker = h.marker(reference);
  marker.dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true })); assert.equal(h.model.viewId, target);
  const svg = '<svg width="10" height="10"/>'; const asset = h.model.execute({ type: 'createAsset', name: 'Portable', mediaType: 'image/svg+xml', data: Buffer.from(svg).toString('base64') }).created.assetId;
  const image = h.add('image', { asset }); h.$('visual-assets-button').click(); assert.equal(h.$(`visual-remove-asset-${asset}`).disabled, true); h.$(`visual-use-asset-${asset}`).click(); h.submit(); assert.equal(h.store.snapshot.assets.length, 1); assert.equal(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.filter(item => item.kind === 'image').length, 2);
  assert.equal(h.ui.removeSelected(), true); h.submit(); assert.equal(h.store.snapshot.views.find(entry => entry.view.id === h.model.viewId).visualNodes.filter(item => item.kind === 'image').length, 1);
});

test('explicit semantic nesting uses current ArchiMate 4 endpoint choices and one Undo; forbidden forged selection stays atomic', t => {
  const h=fixture(t),viewId=h.model.viewId;
  const parent=h.model.execute({type:'createElementAndOccurrence',viewId,elementType:'Service',name:'Parent',bounds:{x:20,y:20,width:500,height:400}}).created;
  const child=h.model.execute({type:'createElementAndOccurrence',viewId,elementType:'Process',name:'Child',bounds:{x:80,y:80,width:120,height:90}}).created;
  h.model.select({kind:'occurrence',id:child.occurrenceId});h.ui.refresh();const before=h.store.exportFiles(),undo=h.store.history.undo;
  h.$('visual-hierarchy').click();h.$('visual-parent').value=`occurrence:${parent.occurrenceId}`;h.$('visual-parent').dispatchEvent(new h.window.Event('change',{bubbles:true}));
  h.$('visual-nesting-relation').value='new:Serving';h.$('visual-nesting-relation').dispatchEvent(new h.window.Event('change',{bubbles:true}));h.$('visual-nesting-hide').value='true';h.submit();
  assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);assert.equal(h.store.history.undo,undo+1);const entry=h.store.snapshot.views.find(entry=>entry.view.id===viewId);assert.equal(entry.connections.length,1);assert.equal(entry.connections[0].style.hideWhenNested,true);assert.deepEqual(entry.occurrences.find(item=>item.id===child.occurrenceId).parent,{kind:'occurrence',id:parent.occurrenceId});
  h.model.undo();assert.deepEqual(h.store.exportFiles(),before);
  h.model.execute({type:'changeConceptType',concept:{kind:'element',id:parent.elementId},conceptType:'DataObject'});h.ui.refresh();h.$('visual-hierarchy').click();h.$('visual-parent').value=`occurrence:${parent.occurrenceId}`;h.$('visual-parent').dispatchEvent(new h.window.Event('change',{bubbles:true}));assert.equal([...h.$('visual-nesting-relation').options].find(option=>option.value==='new:Serving').disabled,true);
  const protectedState=h.store.exportFiles();h.$('visual-nesting-relation').value='new:Serving';h.submit();assert.equal(h.$('visual-dialog').open,true);assert.deepEqual(h.store.exportFiles(),protectedState);
});
test('explicit lock/unlock is reachable and a locked drawing cannot move, restyle or delete through the UI', t => {
  const h=fixture(t),note=h.add('note');h.$('visual-lock').click();h.submit();const before=h.store.exportFiles();assert.throws(()=>h.model.execute({type:'moveDrawings',viewId:h.model.viewId,drawings:[note],dx:10,dy:0}),{code:'DRAWING_LOCKED'});
  h.$('visual-style').click();h.$('visual-fill').value='#123456';h.submit();assert.equal(h.$('visual-dialog').open,true);assert.deepEqual(h.store.exportFiles(),before);h.$('visual-cancel').click();h.$('visual-lock').click();h.submit();h.model.execute({type:'moveDrawings',viewId:h.model.viewId,drawings:[note],dx:10,dy:0});assert.notDeepEqual(h.store.exportFiles(),before);
});

test('visual container editor applies the chosen child offset policy once and cancel/Undo preserve every descendant bound',t=>{
 const h=fixture(t,()=> 'offset'),parent=h.add('group',{x:100,y:100,width:500,height:400}),child=h.add('note',{x:150,y:160,width:180,height:90,parent:`visualNode:${parent.id}`});h.model.select(parent);h.ui.refresh();const before=h.store.exportFiles();h.$('visual-edit').click();h.$('visual-x').value='50';h.$('visual-y').value='70';h.$('visual-width').value='550';h.$('visual-cancel').click();assert.deepEqual(h.store.exportFiles(),before);
 h.$('visual-edit').click();h.$('visual-x').value='50';h.$('visual-y').value='70';h.$('visual-width').value='550';h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);const view=h.store.snapshot.views.find(entry=>entry.view.id===h.model.viewId);assert.equal(view.visualNodes.find(item=>item.id===child.id).bounds.x,100);assert.equal(view.visualNodes.find(item=>item.id===child.id).bounds.y,130);h.model.undo();assert.deepEqual(h.store.exportFiles(),before);
});


test('legend rows and readable type labels are human edited, native portable, one Undo and cancel-safe',t=>{
 const h=fixture(t),before=h.store.exportFiles();h.$('visual-add-legend').click();h.$('visual-legend-rows').value='2';h.$('visual-legend-label-type').value='Service';h.$('visual-legend-label-text').value='Сервис 🙂';h.$('visual-legend-label-set').click();h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);const node=h.store.snapshot.views.find(item=>item.view.id===h.model.viewId).visualNodes[0];assert.equal(node.legend.rowsPerColumn,2);assert.deepEqual(node.legend.labels,[{type:'Service',label:'Сервис 🙂'}]);const bytes=serializeProjectFile(h.store.snapshot);assert.deepEqual(serializeProjectFile(deserializeProjectFile(bytes)),bytes);h.$('visual-edit').click();h.$('visual-legend-label-text').value='Discard';h.$('visual-legend-label-set').click();h.$('visual-cancel').click();assert.deepEqual(serializeProjectFile(h.store.snapshot),bytes);h.model.undo();assert.deepEqual(h.store.exportFiles(),before);
});


test('visual keyboard capture uses the event target, preserves Shift selection and reserves navigation only for an unmodified reference Enter', t => {
  const h = fixture(t), note = h.add('note'), noteMarker = h.marker(note), reference = h.add('viewReference'), referenceMarker = h.marker(reference), source = h.model.viewId;
  const destination = h.store.snapshot.views.find(entry => entry.view.id === source).visualNodes.find(item => item.id === reference.id).targetViewId;
  const key = (target, options = {}) => { const event = new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; };
  h.model.select(note); assert.equal(key(noteMarker).defaultPrevented, false); assert.equal(key(referenceMarker, { shiftKey: true }).defaultPrevented, false); assert.equal(h.$('visual-dialog').open, false); assert.equal(h.model.viewId, source);
  assert.equal(key(referenceMarker).defaultPrevented, true); assert.equal(h.model.viewId, destination); assert.equal(h.$('visual-dialog').open, false);
});

test('view-reference editor separates local fields from opt-in target name/documentation, preserves CRLF, cancel and one Undo',t=>{
 const h=fixture(t),reference=h.add('viewReference'),target=h.store.snapshot.views.find(entry=>entry.view.id!==h.model.viewId).view.id;h.model.execute({type:'updateMetadata',owner:{kind:'view',id:target},documentation:'Exact\r\nDocs'});h.ui.refresh();const baseline=h.store.exportFiles();h.$('visual-edit').click();h.$('visual-name').value='Local only';h.$('visual-target-name').value='Must not apply';h.submit();assert.equal(h.store.snapshot.views.find(entry=>entry.view.id===target).view.name,'Destination');h.model.undo();assert.deepEqual(h.store.exportFiles(),baseline);
 h.model.select(reference);h.ui.refresh();h.$('visual-edit').click();h.$('visual-target-edit').value='true';h.$('visual-target-edit').dispatchEvent(new h.window.Event('change'));h.$('visual-target-name').value='Target renamed';h.$('visual-cancel').click();assert.deepEqual(h.store.exportFiles(),baseline);h.$('visual-edit').click();h.$('visual-target-edit').value='true';h.$('visual-target-name').value='Target renamed';h.$('visual-name').value='Local caption';h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);assert.equal(h.store.snapshot.views.find(entry=>entry.view.id===target).view.name,'Target renamed');assert.equal(h.store.snapshot.views.find(entry=>entry.view.id===target).view.documentation,'Exact\r\nDocs');h.model.undo();assert.deepEqual(h.store.exportFiles(),baseline);
});
test('human legend filters and colors, instruction editing, bounded resource pages and proportional clear-image edits are reachable',t=>{
 const h=fixture(t),profile=h.model.execute({type:'createCustomizationProfile',definition:{name:'Special',purpose:'specialization',targets:[{kind:'element',type:'Service'}],attributes:{}}}).created.profileId;
 h.$('visual-add-legend').click();h.$('visual-legend-elements').value='false';h.$('visual-legend-specializations').value='true';h.$('visual-legend-color-entry').value='profile:'+profile;h.$('visual-legend-color-value').value='#123456';h.$('visual-legend-color-set').click();h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);const legend=h.store.snapshot.views.find(entry=>entry.view.id===h.model.viewId).visualNodes[0].legend;assert.equal(legend.showElements,false);assert.equal(legend.showSpecializations,true);assert.deepEqual(legend.colors,[{profileId:profile,color:'#123456'}]);
 const note=h.add('note',{text:'Text',instruction:'**Read me**'});assert.equal(h.store.snapshot.views.find(entry=>entry.view.id===h.model.viewId).visualNodes.find(item=>item.id===note.id).instruction,'**Read me**');
 const source='<svg width="200" height="100"><rect width="200" height="100" fill="#123456"/></svg>';let asset;for(let i=0;i<26;i++)asset=h.model.execute({type:'createAsset',name:'Picture '+i,mediaType:'image/svg+xml',data:Buffer.from(source).toString('base64')}).created.assetId;h.ui.assets();assert.equal(h.$('visual-assets').children.length,24);assert.equal(h.$('visual-assets-next').disabled,false);h.$('visual-assets-next').click();assert.equal(h.$('visual-assets').children.length,2);assert.equal(h.$('visual-assets').querySelector('img').style.width,'auto');h.$('visual-cancel').click();const image=h.add('image',{asset,width:150,height:150}),before=h.store.exportFiles();h.$('visual-edit').click();h.$('visual-restore-aspect').click();assert.equal(h.$('visual-height').value,'75');h.$('visual-width').value='300';h.$('visual-width').dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.equal(h.$('visual-height').value,'150');h.$('visual-clear-image').click();h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);const empty=h.store.snapshot.views.find(entry=>entry.view.id===h.model.viewId).visualNodes.find(item=>item.id===image.id);assert.equal(empty.assetId,null);assert.equal(empty.name,'Изображение');h.model.undo();assert.deepEqual(h.store.exportFiles(),before);
});

test('line label binding and image-off controls apply to the selected drawing with one exact Undo',t=>{
 const h=fixture(t),a=h.add('note'),b=h.add('group'),id=h.model.execute({type:'createVisualConnector',viewId:h.model.viewId,source:a,target:b,routePoints:[]}).created.visualConnectorId;h.model.select({kind:'visualConnector',id});h.ui.refresh();const before=h.store.exportFiles();h.$('visual-style').click();h.$('visual-labelAnchor').value='target';h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);assert.equal(h.store.snapshot.views.find(item=>item.view.id===h.model.viewId).visualConnectors.find(item=>item.id===id).style.labelAnchor,'target');h.model.undo();assert.deepEqual(h.store.exportFiles(),before);h.model.select(a);h.ui.refresh();h.$('visual-style').click();h.$('visual-imageVisible').value='false';h.submit();assert.equal(h.store.snapshot.views.find(item=>item.view.id===h.model.viewId).visualNodes.find(item=>item.id===a.id).style.imageVisible,false);
});

test('semantic notation controls are limited, imported unsupported paint values stay lossless with an explicit warning',t=>{
 const h=fixture(t),viewId=h.model.viewId,source=h.model.execute({type:'createElementAndOccurrence',viewId,elementType:'Service',name:'Source',bounds:{x:0,y:0,width:100,height:80}}).created.occurrenceId,target=h.model.execute({type:'createElementAndOccurrence',viewId,elementType:'Process',name:'Target',bounds:{x:300,y:0,width:100,height:80}}).created.occurrenceId,connection=h.model.execute({type:'createRelationshipAndConnection',viewId,relationshipType:'Serving',source:{kind:'occurrence',id:source},target:{kind:'occurrence',id:target},label:'',style:{strokeDash:'dot',sourceEnding:'circle',targetEnding:'diamond'}}).created.connectionId;h.model.select({kind:'connection',id:connection});h.ui.refresh();const before=h.store.exportFiles();h.$('visual-style').click();assert.equal(h.$('visual-strokeDash'),null);assert.equal(h.$('visual-sourceEnding'),null);assert.match(h.$('visual-fields').textContent,/сохраняются, но не применяются/);h.$('visual-stroke').value='#123456';h.submit();assert.equal(h.$('visual-dialog').open,false,h.$('visual-error').textContent);const style=h.store.snapshot.views.find(entry=>entry.view.id===viewId).connections.find(item=>item.id===connection).style;assert.deepEqual(style,{strokeDash:'dot',sourceEnding:'circle',targetEnding:'diamond',stroke:'#123456'});h.model.undo();assert.deepEqual(h.store.exportFiles(),before);
});
