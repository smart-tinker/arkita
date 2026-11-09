import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installInterchangeUI } from '../src/interchange-ui.js';
import { installTemplatesUI } from '../src/templates-ui.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { exportCSV } from '../../schemka-model-io/src/csv.js';
import { createTemplate, serializeTemplate, createTemplateLibrary, readTemplate } from '../../schemka-model-io/src/templates.js';
import { createBoardPlan, sketchConversionPlan } from '../../schemka-model-io/src/board-plans.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(t,kind='interchange',overrides={},extra={}) {
 const dom=new JSDOM('<!doctype html><body><details class="app-menu"><summary>Файл</summary><div class="menu-items"></div></details></body>',{url:'https://arkita.invalid',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const {document}=dom.window,$=id=>document.getElementById(id);const initial=createProject('Current'),store=createStore(initial),model=createController(store),session=createProjectSession(store),calls=[],messages=[];
 dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));};
 dom.window.schemkaDesktop={readExternalFiles:async()=>({status:'cancelled'}),saveExternalFiles:async(...args)=>{calls.push(['save',...args]);return{status:'saved',name:'Export'};},...overrides};
 const options={document,window:dom.window,model,session,files:{proposeExternal:request=>{calls.push(['propose',request]);return true;}},openDialog:id=>$(id).setAttribute('open',''),render(){},status:text=>messages.push(text),activateView:id=>{model.switchView(id);calls.push(['view',id]);}};
 Object.assign(options,extra);
 const ui=kind==='interchange'?installInterchangeUI(options):installTemplatesUI(options);ui.open();
 const change=(id,value,checked=false)=>{const input=$(id);checked?input.checked=value:input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 return{dom,document,$,store,model,session,ui,calls,messages,change,initial,capture:()=>({files:store.exportFiles(),history:store.history,revision:store.revision,dirty:session.dirty})};
}

test('CSV UI preview/cancel preserves document; explicit apply is one Undo and leaves local file dirty',async t=>{
 const incoming=createStore(createProject('CSV'));incoming.execute({type:'createElementInModel',elementType:'Service',name:'Imported'},0);const exported=exportCSV(incoming.snapshot);
 const h=setup(t,'interchange',{readExternalFiles:async()=>({status:'opened',files:exported.files})});h.change('interchange-action','csv');const before=h.capture();h.$('interchange-prepare').click();await tick();assert.match(h.$('interchange-report').textContent,/Imported/);assert.deepEqual(h.capture(),before);h.$('interchange-close').click();assert.deepEqual(h.capture(),before);
 h.ui.open();h.$('interchange-prepare').click();await tick();h.$('interchange-apply').click();await tick();assert.equal(h.store.snapshot.elements[0].name,'Imported');assert.equal(h.store.history.undo,1);assert.equal(h.session.dirty,true);h.model.undo();assert.deepEqual(h.store.exportFiles(),before.files);
});

test('late and stale CSV replies cannot replace model or show a stale proposal',async t=>{
 let resolve;const h=setup(t,'interchange',{readExternalFiles:()=>new Promise(done=>{resolve=done;})});h.change('interchange-action','csv');h.$('interchange-prepare').click();h.$('interchange-close').click();resolve({status:'opened',files:exportCSV(createProject('Incoming')).files});await tick();assert.equal(h.$('interchange-apply').disabled,true);assert.equal(h.store.revision,0);
 h.dom.window.schemkaDesktop.readExternalFiles=async()=>({status:'opened',files:exportCSV(createProject('Incoming')).files});h.ui.open();h.$('interchange-prepare').click();await tick();h.model.execute({type:'renameProject',name:'Later'});h.ui.refresh();assert.equal(h.$('interchange-apply').disabled,true);assert.equal(h.store.snapshot.project.name,'Later');
});

test('XLSX export requires declared loss consent and native success never marks model saved',async t=>{
 const h=setup(t);h.model.execute({type:'renameProject',name:'Unsaved'});h.change('interchange-action','xlsx');h.$('interchange-prepare').click();await tick();assert.equal(h.$('interchange-apply').disabled,true);const before=h.capture();h.change('interchange-loss-consent',true,true);h.$('interchange-apply').click();await tick();assert.equal(h.calls[0][0],'save');assert.equal(h.calls[0][1],'xlsx');assert.deepEqual(h.capture(),before);
});

test('template gallery preview and cancel are readonly; local collection persists and new model is an unsaved proposal',async t=>{
 const h=setup(t,'templates'),before=h.capture();assert.ok(h.$('template-choice').options.length>=2);h.change('template-choice','builtin:tpl-00000000-0000-4000-8000-000000000002');assert.match(h.$('template-preview').src,/data:image\/svg/);assert.deepEqual(h.capture(),before);
 h.change('template-name','Reusable');h.$('template-save-current').click();assert.match(h.$('template-choice').textContent,/Reusable/);assert.ok(h.dom.window.localStorage.getItem('arkita.templates.v1'));h.$('template-new').click();const proposed=h.calls.find(call=>call[0]==='propose')[1];assert.equal(proposed.source,'template');assert.equal(proposed.unsaved,true);assert.deepEqual(h.capture(),before);
});

test('board insertion is explicitly previewed, independent, one Undo; disabling tools preserves existing boards',async t=>{
 const h=setup(t,'templates');h.change('template-choice','builtin:tpl-00000000-0000-4000-8000-000000000002');h.$('template-insert').click();assert.equal(h.store.snapshot.views.length,0);assert.equal(h.$('template-plan-apply').disabled,true);h.change('template-plan-consent',true,true);h.$('template-plan-apply').click();assert.equal(h.store.snapshot.views.length,1);assert.equal(h.store.snapshot.elements.length,0);assert.equal(h.store.history.undo,1);assert.equal(h.session.dirty,true);h.ui.open();h.change('board-tools-enabled',false,true);assert.equal(h.$('board-create').hidden,true);assert.equal(h.store.snapshot.views.length,1);h.model.undo();assert.deepEqual(h.store.exportFiles(),exportFiles(h.initial));
});

test('new canvas and sketch plans inherit the application theme unless a color is explicit', () => {
 const source = createProject('Boards'), before = exportFiles(source);
 for (const kind of ['canvas', 'sketch']) {
  const themed = createBoardPlan(source, { name: kind, kind });
  assert.equal(Object.hasOwn(themed.snapshot.views[0].view, 'background'), false);
  for (const background of ['#ffffff', '#123456']) {
   const explicit = createBoardPlan(source, { name: kind, kind, background });
   assert.equal(deserializeProjectFile(serializeProjectFile(explicit.snapshot)).views[0].view.background, background);
  }
 }
 assert.deepEqual(exportFiles(source), before);
});

test('new boards and the built-in board template use the theme without changing the model during preview', t => {
 const h = setup(t, 'templates'), before = h.capture(); h.document.documentElement.dataset.theme = 'dark';
 assert.equal(h.$('board-background-mode').value, 'theme'); assert.equal(h.$('board-background').disabled, true);
 h.$('board-create').click(); assert.deepEqual(h.capture(), before); assert.equal(h.$('template-plan-apply').disabled, true);
 h.change('template-plan-consent', true, true); h.$('template-plan-apply').click();
 assert.equal(Object.hasOwn(h.model.view.view, 'background'), false); assert.equal(h.store.history.undo, 1);
 h.ui.open(); h.change('template-choice', 'builtin:tpl-00000000-0000-4000-8000-000000000002'); h.$('template-insert').click();
 h.change('template-plan-consent', true, true); h.$('template-plan-apply').click();
 assert.equal(h.store.snapshot.views.length, 2); assert.ok(h.store.snapshot.views.every(entry => !Object.hasOwn(entry.view, 'background')));
});

test('saved custom board colors including white remain explicit; the theme default persists without rewriting existing boards', t => {
 for (const background of ['#ffffff', '#123456']) {
  const h = setup(t, 'templates'); h.dom.window.localStorage.setItem('arkita.boardBackground', background); h.ui.open();
  assert.equal(h.$('board-background-mode').value, 'custom'); assert.equal(h.$('board-background').value, background); assert.equal(h.$('board-background').disabled, false);
  h.$('board-create').click(); h.change('template-plan-consent', true, true); h.$('template-plan-apply').click();
  assert.equal(h.model.view.view.background, background); const viewId = h.model.viewId, before = h.capture();
  h.ui.open(); h.change('board-background', '#abcdef'); h.$('board-default').click(); h.ui.cancel(); h.ui.open();
  assert.equal(h.$('board-background').value, '#abcdef'); assert.equal(h.$('board-background-mode').value, 'custom');
  h.change('board-background-mode', 'theme'); assert.equal(h.$('board-background').disabled, true); h.$('board-default').click();
  assert.equal(h.dom.window.localStorage.getItem('arkita.boardBackground'), null); assert.deepEqual(h.capture(), before);
  h.ui.cancel(); h.ui.open(); assert.equal(h.$('board-background-mode').value, 'theme'); assert.equal(h.$('board-background').disabled, true);
  h.$('board-create').click(); h.change('template-plan-consent', true, true); h.$('template-plan-apply').click();
  assert.equal(Object.hasOwn(h.model.view.view, 'background'), false); assert.equal(h.store.snapshot.views.find(entry => entry.view.id === viewId).view.background, background);
 }
});

test('resetting a view background is previewed, cancellable, durable and one Undo/Redo', t => {
 const h = setup(t, 'templates'), viewId = h.model.execute({ type: 'createView', name: 'Existing view' }).created.viewId;
 h.model.switchView(viewId); h.model.execute({ type: 'setViewPresentation', viewId, background: '#ffffff' }); const before = h.capture();
 h.$('board-current-background').click(); assert.deepEqual(h.capture(), before); assert.equal(h.$('template-plan-apply').disabled, true);
 h.$('templates-close').click(); assert.deepEqual(h.capture(), before);
 h.ui.open(); h.$('board-current-background').click(); h.change('template-plan-consent', true, true); h.$('template-plan-apply').click();
 assert.equal(Object.hasOwn(h.model.view.view, 'background'), false); assert.equal(h.store.history.undo, before.history.undo + 1);
 assert.equal(Object.hasOwn(deserializeProjectFile(serializeProjectFile(h.store.snapshot)).views[0].view, 'background'), false);
 h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files); h.model.redo(); assert.equal(Object.hasOwn(h.model.view.view, 'background'), false);
});

test('changing the board background choice invalidates its preview and busy import keeps both background controls disabled', async t => {
 let finish;
 const h = setup(t, 'templates', { readExternalFiles: () => new Promise(resolve => { finish = resolve; }) });
 h.$('board-create').click(); h.change('template-plan-consent', true, true); h.change('board-background-mode', 'custom');
 assert.equal(h.$('template-plan-apply').disabled, true); assert.equal(h.$('template-plan').hidden, true); assert.equal(h.$('board-background').disabled, false);
 h.$('template-import').click(); assert.equal(h.$('board-background-mode').disabled, true); assert.equal(h.$('board-background').disabled, true);
 finish({ status: 'cancelled' }); await tick(); assert.equal(h.$('board-background-mode').disabled, false); assert.equal(h.$('board-background').disabled, false);
 assert.equal(h.store.revision, 0);
});

test('template file validation happens before registration and late read cannot create a library entry',async t=>{
 let resolve;const h=setup(t,'templates',{readExternalFiles:()=>new Promise(done=>{resolve=done;})});h.$('template-import').click();h.$('templates-close').click();resolve({status:'opened',files:[{name:'template.arkita-template.json',bytes:serializeTemplate(createTemplate(createProject('Private')))}]});await tick();assert.equal(h.dom.window.localStorage.getItem('arkita.templates.v1'),null);assert.equal(h.store.revision,0);
});

test('sketch conversion requires total explicit map, keeps source and rejects invalid relation without mutation',()=>{
 const initial=createBoardPlan(createProject('Sketch'),{name:'Ideas',kind:'sketch'}),store=createStore(initial.snapshot),viewId=initial.viewId;const a=store.execute({type:'createVisualNode',viewId,kind:'note',name:'A',text:'A',bounds:{x:0,y:0,width:100,height:60}},store.revision).created.visualNodeId,b=store.execute({type:'createVisualNode',viewId,kind:'note',name:'B',text:'B',bounds:{x:200,y:0,width:100,height:60}},store.revision).created.visualNodeId;
 const before=exportFiles(store.snapshot);assert.throws(()=>sketchConversionPlan(store.snapshot,viewId,{name:'Typed',nodes:{[a]:{type:'Service'}},connectors:{}}),/Выберите тип/);assert.deepEqual(exportFiles(store.snapshot),before);
 const plan=sketchConversionPlan(store.snapshot,viewId,{name:'Typed',nodes:{[a]:{type:'Service'},[b]:{type:'Process'}},connectors:{}});assert.equal(plan.snapshot.views.length,2);assert.deepEqual(plan.snapshot.views.find(entry=>entry.view.id===viewId),store.snapshot.views[0]);assert.equal(plan.snapshot.elements.length,2);
});


test('XML validation gates preview/new unsaved document; cancelled and late validation cannot apply',async t=>{
 const {exportExchangeXml}=await import('../../schemka-model-io/src/exchange-xml.js');const incoming=createProject('From XML'),xml=exportExchangeXml(incoming).bytes;let finish;const h=setup(t,'interchange',{readExternalFiles:async()=>({status:'opened',files:[{name:'model.xml',bytes:xml}]}),validateExchangeXml:()=>new Promise(resolve=>{finish=resolve;})});h.change('interchange-action','xml');const before=h.capture();h.$('interchange-prepare').click();await tick();assert.equal(h.$('interchange-apply').disabled,true);h.$('interchange-close').click();finish({status:'ok'});await tick();assert.deepEqual(h.capture(),before);assert.equal(h.calls.length,0);
 h.dom.window.schemkaDesktop.validateExchangeXml=async bytes=>{assert.deepEqual(bytes,xml);return{status:'ok'};};h.ui.open();h.$('interchange-prepare').click();await tick();assert.equal(h.$('interchange-apply').disabled,true);const generation=h.ui.generation;h.change('interchange-loss-consent',true,true);assert.ok(h.ui.generation>generation);h.$('interchange-apply').click();await tick();assert.equal(h.calls[0][0],'propose');assert.equal(h.calls[0][1].source,'import');assert.equal(h.calls[0][1].unsaved,true);assert.deepEqual(h.capture(),before);
});
test('XML export validates exact generated bytes, ships optional schemas and leaves local dirty baseline untouched',async t=>{
 let validated;const h=setup(t,'interchange',{validateExchangeXml:async bytes=>{validated=bytes;return{status:'ok',schemas:[{name:'arkita-exchange.xsd',bytes:new TextEncoder().encode('<schema/>')}]};}});h.model.execute({type:'renameProject',name:'Unsaved XML'});h.change('interchange-action','xml-export');h.change('interchange-schemas',true,true);h.$('interchange-prepare').click();await tick();const before=h.capture();assert.ok(validated);h.change('interchange-loss-consent',true,true);h.$('interchange-apply').click();await tick();assert.equal(h.calls[0][1],'xml');assert.deepEqual(h.calls[0][2][0].bytes,validated);assert.equal(h.calls[0][2].length,2);assert.deepEqual(h.capture(),before);
});


test('template source collisions select exact external package and require explicit local overwrite; team is readonly',async t=>{
 const local=createTemplate(createProject('Local')),external=structuredClone(local),team=structuredClone(local);external.snapshot.project.name='External';external.metadata.name='External';team.snapshot.project.name='Team';team.metadata.name='Team';
 const h=setup(t,'templates',{readExternalFiles:async()=>({status:'opened',files:[{name:'package.arkita-template.json',bytes:serializeTemplate(external)}]})},{teamTemplates:[team]});
 const library=createTemplateLibrary(h.dom.window.localStorage);library.put(local);h.ui.open();h.$('template-import').click();await tick();assert.equal(h.$('template-choice').value,`external:${local.metadata.id}`);
 h.$('template-export').click();await tick();assert.equal(readTemplate(h.calls.at(-1)[2][0].bytes).snapshot.project.name,'External');h.$('template-register').click();assert.equal(library.list().templates[0].snapshot.project.name,'Local');assert.match(h.$('templates-feedback').textContent,/Подтвердите замену/);
 h.change('template-replace-confirm',true,true);h.$('template-register').click();assert.equal(library.list().templates[0].snapshot.project.name,'External');assert.equal(h.$('template-choice').value,`local:${local.metadata.id}`);
 h.change('template-choice',`team:${local.metadata.id}`);assert.equal(h.$('template-delete').disabled,true);h.$('template-new').click();assert.equal(h.calls.at(-1)[0],'propose');assert.equal(deserializeProjectFile(h.calls.at(-1)[1].bytes).project.name,'Team');assert.equal(team.snapshot.project.name,'Team');assert.equal(library.list().templates[0].snapshot.project.name,'External');
});


test('native remap report traces source to target IDs after one apply; CSV shows submitted unchanged records',async t=>{
 const h=setup(t),a=h.model.execute({type:'createElementInModel',elementType:'Service',name:'Same'}).created.elementId,b=h.model.execute({type:'createElementInModel',elementType:'Process',name:'Before'}).created.elementId,incoming=structuredClone(h.model.store.snapshot);incoming.elements.find(item=>item.id===b).name='After';
 h.dom.window.schemkaDesktop.readExternalFiles=async()=>({status:'opened',files:exportCSV(incoming).files});h.change('interchange-action','csv');h.$('interchange-prepare').click();await tick();assert.match(h.$('interchange-report').textContent,/без изменений в выбранной области: 1/);assert.match(h.$('interchange-report').textContent,new RegExp(a));assert.match(h.$('interchange-report').textContent,new RegExp(`Исходный ID: ${b} → целевой ID: ${b}`));
 h.$('interchange-apply').click();await tick();assert.match(h.$('interchange-report').textContent,/без изменений в выбранной области: 1/);assert.equal(h.model.store.snapshot.elements.find(item=>item.id===b).name,'After');
 h.change('interchange-action','native');h.change('interchange-ids','remap');h.dom.window.schemkaDesktop.readExternalFiles=async()=>({status:'opened',files:[{name:'Incoming.arkita',bytes:serializeProjectFile(incoming)}]});const before=h.model.store.exportFiles(),history=h.model.store.history.undo;h.$('interchange-prepare').click();await tick();const line=[...h.$('interchange-report').querySelectorAll('p')].find(item=>item.textContent.startsWith(`Исходный ID: ${a} →`));assert.ok(line);const target=line.textContent.split('целевой ID: ')[1];assert.notEqual(target,a);h.$('interchange-apply').click();await tick();assert.ok(h.model.store.snapshot.elements.some(item=>item.id===target));assert.ok(h.$('interchange-report').textContent.includes(line.textContent));assert.equal(h.model.store.history.undo,history+1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before);
});

const archiBytes = body => new TextEncoder().encode(`<archimate:model xmlns:archimate="http://www.archimatetool.com/archimate" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="5.0.0" id="source-model" name="Migration"><folder id="elements" name="Elements">${body}</folder></archimate:model>`);

test('Archi full diagnostics remain exportable while blocked; analysis, report and cancellation preserve history', async t => {
 const input = archiBytes('<element xsi:type="archimate:UnknownOne" id="bad-one" name="First"/><element xsi:type="archimate:UnknownTwo" id="bad-two" name="Second"/><element xsi:type="archimate:Gap" id="gap-one" name="Gap"/>');
 const h = setup(t, 'interchange', { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'model.archimate', bytes: input }] }) });
 h.model.execute({ type: 'renameProject', name: 'Earlier' }); h.model.execute({ type: 'renameProject', name: 'Later' }); h.model.undo();
 h.change('interchange-action', 'archi'); const before = h.capture(); h.$('interchange-prepare').click(); await tick();
 assert.match(h.$('interchange-report').textContent, /bad-one/); assert.match(h.$('interchange-report').textContent, /bad-two/); assert.match(h.$('interchange-report').textContent, /gap-one/);
 assert.equal(h.$('interchange-apply').disabled, true); assert.equal(h.$('interchange-save-report').disabled, false); assert.deepEqual(h.capture(), before);
 h.$('interchange-save-report').click(); await tick(); const saved = h.calls.find(call => call[0] === 'save'); assert.equal(saved[1], 'csv'); assert.equal(saved[2].length, 2);
 assert.match(new TextDecoder().decode(saved[2][0].bytes), /bad-one/); assert.match(new TextDecoder().decode(saved[2][0].bytes), /bad-two/);
 assert.deepEqual(h.capture(), before); h.$('interchange-close').click(); assert.deepEqual(h.capture(), before); assert.equal(h.calls.some(call => call[0] === 'propose'), false);
});

test('Archi Gap choices are per object, keep target IDs stable and require fresh consent before atomic new model', async t => {
 const input = archiBytes('<element xsi:type="archimate:Gap" id="gap-one" name="First gap"/><element xsi:type="archimate:Gap" id="gap-two" name="Second gap"/><element xsi:type="archimate:ApplicationService" id="service" name="Service"/>');
 const h = setup(t, 'interchange', { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'model.archimate', bytes: input }] }) });
 h.change('interchange-action', 'archi'); const before = h.capture(); h.$('interchange-prepare').click(); await tick();
 h.$('interchange-save-report').click(); await tick(); const firstReport = new TextDecoder().decode(h.calls[0][2][1].bytes), firstService = firstReport.split('\r\n').find(line => line.includes('ApplicationService'));
 const select = id => h.$('interchange-report').querySelector(`select[data-source-id="${id}"]`);
 assert.equal(select('gap-one').disabled, false); select('gap-one').value = 'Assessment'; select('gap-one').dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(h.$('interchange-apply').disabled, true); select('gap-two').value = 'Assessment'; select('gap-two').dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(h.$('interchange-apply').disabled, true); h.change('interchange-loss-consent', true, true); assert.equal(h.$('interchange-apply').disabled, false);
 h.$('interchange-save-report').click(); await tick(); const secondReport = new TextDecoder().decode(h.calls.at(-1)[2][1].bytes); assert.equal(secondReport.split('\r\n').find(line => line.includes('ApplicationService')), firstService);
 h.$('interchange-apply').click(); await tick(); const proposal = h.calls.find(call => call[0] === 'propose')[1], migrated = deserializeProjectFile(proposal.bytes);
 assert.equal(proposal.unsaved, true); assert.equal(migrated.elements.filter(item => item.type === 'Assessment').length, 2); assert.equal(migrated.elements.find(item => item.type === 'Service').archiSource.domain, 'Application'); assert.deepEqual(h.capture(), before);
 h.store.load(exportFiles(migrated), h.store.revision); const importedBefore = h.capture(); h.$('archi-mappings-button').click();
 assert.equal(h.$('interchange-action').value, 'archi-trace'); assert.match(h.$('interchange-report').textContent, /Соответствия исходных и новых ID: 5/);
 h.$('interchange-save-report').click(); await tick(); const durableReport = new TextDecoder().decode(h.calls.at(-1)[2][1].bytes); assert.match(durableReport, /source-model/); assert.match(durableReport, /gap-one/); assert.match(durableReport, /ApplicationService/); assert.deepEqual(h.capture(), importedBefore);
});

test('Archi changed selection resets consent; stale report and apply cannot operate on a changed document', async t => {
 const h = setup(t, 'interchange', { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'model.archimate', bytes: archiBytes('<element xsi:type="archimate:Gap" id="gap" name="Decision"/>') }] }) });
 h.change('interchange-action', 'archi'); h.$('interchange-prepare').click(); await tick(); const decide = value => { const choice = h.$('interchange-report').querySelector('select[data-source-id]'); choice.value = value; choice.dispatchEvent(new h.dom.window.Event('change')); };
 decide('Assessment'); h.change('interchange-loss-consent', true, true); decide(''); assert.equal(h.$('interchange-loss-consent').checked, false); assert.equal(h.$('interchange-apply').disabled, true);
 decide('Assessment'); h.change('interchange-loss-consent', true, true); h.model.execute({ type: 'renameProject', name: 'Changed during preview' }); h.ui.refresh();
 assert.equal(h.$('interchange-apply').disabled, true); assert.equal(h.$('interchange-save-report').disabled, true); assert.equal(h.$('interchange-report').querySelector('select').disabled, true); h.$('interchange-close').click(); assert.equal(h.calls.length, 0); assert.equal(h.store.snapshot.project.name, 'Changed during preview');
});

test('5016-record Archi preview keeps rendered report bounded and exports the complete correspondence table', {
  skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'capacity test runs in Extended CI' : false,
}, async t => {
 const { largeArchiXML } = await import('../../schemka-model-core/fixtures/large-native-model.js');
 const { parseCSV } = await import('../../schemka-model-io/src/csv.js');
 const h = setup(t, 'interchange', { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'large.archimate', bytes: new TextEncoder().encode(largeArchiXML()) }] }) });
 h.change('interchange-action', 'archi'); const before = h.capture(); h.$('interchange-prepare').click(); await tick();
 assert.match(h.$('interchange-report').textContent, /Соответствия исходных и новых ID: 5016/);
 assert.ok(h.$('interchange-report').querySelectorAll('p').length < 310);
 assert.ok(h.$('interchange-report').textContent.includes('Показать ещё'));
 h.$('interchange-save-report').click(); await tick();
 assert.equal(parseCSV(h.calls[0][2][1].bytes).length, 5017); assert.deepEqual(h.capture(), before);
});

test('5000 individual Gap decisions are paged and choosing a later row retains loaded rows and keyboard focus', async t => {
 const body = Array.from({ length: 5000 }, (_, index) => `<element xsi:type="archimate:Gap" id="gap-${index}" name="Gap ${index}"/>`).join('');
 const h = setup(t, 'interchange', { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'gaps.archimate', bytes: archiBytes(body) }] }) });
 h.change('interchange-action', 'archi'); const before = h.capture(); h.$('interchange-prepare').click(); await tick();
 const report = h.$('interchange-report'), selects = () => report.querySelectorAll('select[data-source-id]');
 assert.equal(selects().length, 100); assert.ok(report.querySelectorAll('*').length < 1500); assert.equal(h.$('interchange-apply').disabled, true);
 const more = [...report.querySelectorAll('button')].at(-1); more.click(); assert.equal(selects().length, 200);
 const row = report.querySelector('select[data-source-id="gap-120"]'); row.focus(); row.value = 'Assessment'; row.dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(selects().length, 200); assert.equal(h.document.activeElement.dataset.sourceId, 'gap-120'); assert.equal(h.document.activeElement.value, 'Assessment'); assert.deepEqual(h.capture(), before);
});

test('source identifiers with JavaScript property names remain ordinary per-object Gap choices', async t => {
 const names = ['__proto__', 'constructor', 'prototype'], bytes = archiBytes(names.map(id => `<element xsi:type="archimate:Gap" id="${id}" name="${id}"/>`).join(''));
 const h = setup(t, 'interchange', { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'ids.archimate', bytes }] }) });
 h.change('interchange-action', 'archi'); const before = h.capture(); h.$('interchange-prepare').click(); await tick();
 for (const id of names) { const choice = [...h.$('interchange-report').querySelectorAll('select[data-source-id]')].find(item => item.dataset.sourceId === id); choice.value = 'Assessment'; choice.dispatchEvent(new h.dom.window.Event('change')); }
 h.change('interchange-loss-consent', true, true); assert.equal(h.$('interchange-apply').disabled, false); h.$('interchange-apply').click(); await tick();
 const imported = deserializeProjectFile(h.calls.find(call => call[0] === 'propose')[1].bytes); assert.deepEqual(imported.elements.map(item => item.archiSource.id).sort(), [...names].sort()); assert.deepEqual(h.capture(), before);
});
