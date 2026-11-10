import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installTheme } from '../src/theme.js';
import { installWorkspace } from '../src/workspace-ui.js';
import { installGestureTools } from '../src/gesture-tools.js';
import { JSDOM } from 'jsdom';
import { PREFERENCE_DEFAULTS,PREFERENCES_KEY,createLocalPreferences,validatePreferences,serializePreferences,deserializePreferences,preferenceDrawingStyle,applyPreferenceView,prepareCreationCommand,viewUsageLabel } from '../src/preferences.js';
import { installPreferencesUI } from '../src/preferences-ui.js';
import { installWorkbench } from '../src/workbench.js';

function fixture(t) {
  const dom = new JSDOM('<!doctype html><html><body><details class="app-menu"><summary>Вид</summary><div class="menu-items"></div></details><button id="save"></button><button id="fragment-copy"></button><button id="undo"></button><button id="redo"></button><button id="help-button"></button><svg id="canvas" tabindex="0"></svg><input id="text"></body></html>',{url:'https://arkita.invalid'}); t.after(() => dom.window.close());
  const {window} = dom,{document} = window; window.HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
  const preferences = createLocalPreferences(window.localStorage), reports = []; let applies = 0;
  const ui = installPreferencesUI({document,window,preferences,openDialog:id=>document.getElementById(id).showModal(),blocked:()=>false,status:text=>reports.push(text),onApply:()=>applies++});
  const $ = id=>document.getElementById(id), submit=()=>$('preferences-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  return {window,document,preferences,ui,$,submit,reports,get applies(){return applies;}};
}

test('one preference authority migrates legacy keys once, strict roundtrip rejects duplicate/unknown/active values, reset is detached',t=>{
 const h=fixture(t);h.window.localStorage.removeItem(PREFERENCES_KEY);h.window.localStorage.setItem('schemka-model-theme','dark');h.window.localStorage.setItem('arkita.workspace.v1','{"palette":false}');h.window.localStorage.setItem('arkita.diagram-gestures','{"grid":true,"step":20}');
 const preferences=createLocalPreferences(h.window.localStorage);assert.equal(preferences.get('theme'),'dark');assert.equal(preferences.get('workspace').palette,false);assert.equal(preferences.get('gestures').step,20);
 h.window.localStorage.setItem('schemka-model-theme','light');assert.equal(createLocalPreferences(h.window.localStorage).get('theme'),'dark');const exported=serializePreferences(preferences.snapshot);assert.deepEqual(deserializePreferences(exported),preferences.snapshot);
 for(const mutate of [x=>x.bad=true,x=>x.keys.save='Ctrl+KeyW',x=>x.keys.save=x.keys.open,x=>x.display.colors.common='url(https://evil)',x=>x.defaults.nodeStyle.image={assetId:'outside',fit:'contain',position:'center'}]){const bad=preferences.snapshot;mutate(bad);assert.throws(()=>validatePreferences(bad));}
 assert.throws(()=>deserializePreferences(exported.replace('"version": 1','"version": 1, "version": 1')));preferences.reset();assert.deepEqual(preferences.snapshot,structuredClone(PREFERENCE_DEFAULTS));const copied=preferences.snapshot;copied.workspace.palette=false;assert.equal(preferences.get('workspace').palette,true);
});
test('storage failure applies only local state, all subscribers still run, and explicit saved style wins',()=>{
 const failures=[], storage={getItem:()=>null,setItem:()=>{throw Error('disk unavailable');}},prefs=createLocalPreferences(storage,{onStorageError:error=>failures.push(error.message)});let observed=0;prefs.subscribe(()=>{throw Error('paint failed');});prefs.subscribe(()=>observed++);const next=prefs.snapshot;next.display.diagramFont='Arial';next.display.diagramFontSize=22;next.display.borderFromFill=true;const result=prefs.replace(next);assert.equal(result.persisted,false);assert.equal(result.errors.length,1);assert.equal(observed,1);assert.ok(failures.length>=2);assert.equal(prefs.get('display').diagramFont,'Arial');assert.deepEqual(preferenceDrawingStyle({fontSize:12,stroke:'#123456'},prefs.snapshot),{fontFamily:'Arial',fontSize:12,stroke:'#123456'});
});
test('preferences draft Apply/cancel/reset/import remains local and late import cannot replace newer draft',async t=>{
 const h=fixture(t),before=h.preferences.snapshot;h.ui.open();h.$('preferences-display-statusBar').checked=false;h.$('preferences-form').dispatchEvent(new h.window.Event('input',{bubbles:true}));h.ui.cancel();assert.deepEqual(h.preferences.snapshot,before);h.ui.open();h.$('preferences-display-statusBar').checked=false;h.submit();assert.equal(h.preferences.get('display').statusBar,false);assert.equal(h.applies,1);assert.equal(h.document.body.dataset.preferenceStatus,'false');
 h.ui.open();const next=h.preferences.snapshot;next.theme='dark';let complete;const input=h.$('preferences-import');Object.defineProperty(input,'files',{value:[{size:100,arrayBuffer:()=>new Promise(resolve=>complete=resolve)}],configurable:true});input.dispatchEvent(new h.window.Event('change',{bubbles:true}));h.ui.cancel();complete(new TextEncoder().encode(serializePreferences(next)).buffer);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.preferences.get('theme'),'system');
 h.ui.open();const fresh=h.$('preferences-import');Object.defineProperty(fresh,'files',{value:[{size:100,arrayBuffer:async()=>new TextEncoder().encode(serializePreferences(next)).buffer}],configurable:true});fresh.dispatchEvent(new h.window.Event('change',{bubbles:true}));await new Promise(resolve=>setImmediate(resolve));assert.match(h.$('preferences-error').textContent,/Импортирован черновик/);assert.equal(h.preferences.get('theme'),'system');h.submit();assert.equal(h.preferences.get('theme'),'dark');
});
test('one custom-key capture handler respects text/IME, consumes reassigned originals and dispatches guarded commands once',t=>{
 const h=fixture(t),events=[];let saves=0;h.$('fragment-copy').addEventListener('click',()=>events.push('copy'));h.$('redo').addEventListener('click',()=>events.push('redo'));installWorkbench({document:h.document,window:h.window,preferences:h.preferences,files:{save:()=>saves++},blocked:()=>false,status:()=>{}});
 const key=(target,key,code,extra={})=>{const event=new h.window.KeyboardEvent('keydown',{key,code,ctrlKey:true,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;};
 assert.equal(key(h.$('text'),'c','KeyC').defaultPrevented,false);assert.equal(key(h.$('canvas'),'c','KeyC',{isComposing:true}).defaultPrevented,false);key(h.$('canvas'),'c','KeyC');assert.deepEqual(events,['copy']);key(h.$('canvas'),'z','KeyZ',{shiftKey:true});assert.deepEqual(events,['copy','redo']);
 const keys=h.preferences.get('keys');keys['fragment-copy']='Ctrl+Shift+KeyU';h.preferences.update('keys',keys);const original=key(h.$('canvas'),'c','KeyC');assert.equal(original.defaultPrevented,true);assert.equal(events.length,2);key(h.$('canvas'),'u','KeyU',{shiftKey:true});assert.deepEqual(events,['copy','redo','copy']);key(h.$('canvas'),'s','KeyS');assert.equal(saves,1);
});


test('existing theme/workspace/gesture controls share one persistence authority and external adoption does not write back',t=>{
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://arkita.invalid'});t.after(()=>dom.window.close());const {window}=dom,{document}=window;window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};window.matchMedia=()=>({matches:false,addEventListener(){}});for(const dialog of document.querySelectorAll('dialog')){dialog.showModal=()=>dialog.setAttribute('open','');dialog.close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new window.Event('close'));};}
 const writes=[],memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{writes.push(key);memory.set(key,value);}},preferences=createLocalPreferences(storage),theme=installTheme(document,window,preferences),workspace=installWorkspace({document,window,preferences,blocked:()=>false,status:()=>{},openDialog:id=>document.getElementById(id).showModal(),panel:()=>{}}),canvas=document.getElementById('canvas');canvas.setAttribute('viewBox','0 0 900 640');
 const gesture=installGestureTools({document,window,preferences,model:{},canvas,viewport:()=>({subscribe:()=>()=>{}}),openDialog:id=>document.getElementById(id).showModal(),blocked:()=>false,status:()=>{},redraw:()=>{},onScroll:()=>{}});
 const control=document.getElementById('theme-mode');control.value='dark';control.dispatchEvent(new window.Event('change'));assert.equal(preferences.get('theme'),'dark');document.getElementById('workspace-toggle-palette').click();assert.equal(preferences.get('workspace').palette,false);
 document.getElementById('gesture-settings-button').click();document.getElementById('gesture-grid').checked=true;document.getElementById('gesture-settings-form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(preferences.get('gestures').grid,true);assert.ok(writes.every(key=>key===PREFERENCES_KEY));
 const count=writes.length;preferences.adopt(structuredClone(PREFERENCE_DEFAULTS));assert.equal(writes.length,count);assert.equal(theme.preference,'system');assert.equal(workspace.settings.palette,true);assert.equal(gesture.options.grid,false);
});

test('creation defaults serialize only into new drawings and explicit choices win without touching updates',()=>{
 const settings=structuredClone(PREFERENCE_DEFAULTS);settings.defaults.nodeStyle={fill:'#123456',fontSize:18};settings.defaults.lineStyle='orthogonal';settings.defaults.legend={sort:'name',columns:2,showRelationships:true,colorScheme:'pastel',autoSize:true};
 for(const type of ['createElementAndOccurrence','createJunctionAndOccurrence','addOccurrence','createVisualNode']){const command={type,style:{fontSize:12}},next=prepareCreationCommand(command,settings);assert.deepEqual(next.style,{fill:'#123456',fontSize:12});assert.deepEqual(command,{type,style:{fontSize:12}});}
 for(const type of ['createRelationshipAndConnection','addConnection','createVisualConnector']){assert.deepEqual(prepareCreationCommand({type},settings).style,{lineStyle:'orthogonal'});assert.deepEqual(prepareCreationCommand({type,style:{lineStyle:'rounded'}},settings).style,{lineStyle:'rounded'});}
 assert.deepEqual(prepareCreationCommand({type:'createVisualNode',kind:'legend',legend:{columns:3}},settings).legend,{...settings.defaults.legend,columns:3});
 for(const type of ['updateDrawingStyle','updateVisualNode','applyProjectSnapshot','duplicateView']){const command={type};assert.equal(prepareCreationCommand(command,settings),command);}
 const next=prepareCreationCommand({type:'createVisualNode',kind:'note'},settings);next.style.fill='#ffffff';assert.equal(settings.defaults.nodeStyle.fill,'#123456');
});

test('workspace order is a closed local six-way choice, migrates old settings and paints detached/hidden columns without changing model state',t=>{
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://arkita.invalid'});t.after(()=>dom.window.close());const {window}=dom,{document}=window;const preferences=createLocalPreferences(window.localStorage);installWorkspace({document,window,preferences,blocked:()=>false,status:()=>{},openDialog:id=>document.getElementById(id).setAttribute('open',''),panel:()=>{}});
 const workspace=preferences.get('workspace');workspace.order='palette-canvas-catalog';preferences.update('workspace',workspace);assert.equal(document.body.dataset.workspaceOrder,'palette-canvas-catalog');assert.equal(document.querySelector('.toolbox').style.getPropertyValue('--workspace-panel-column'),'1');assert.equal(document.querySelector('.canvas-panel').style.getPropertyValue('--workspace-panel-column'),'2');assert.equal(document.querySelector('.catalog').style.getPropertyValue('--workspace-panel-column'),'3');
 const bad=preferences.snapshot;bad.workspace.order='canvas-canvas-palette';assert.throws(()=>validatePreferences(bad));const legacy=JSON.parse(serializePreferences(preferences.snapshot));delete legacy.settings.workspace.order;delete legacy.settings.behavior.viewLabelTemplate;assert.equal(deserializePreferences(JSON.stringify(legacy)).workspace.order,'catalog-canvas-palette');
 preferences.reset();assert.equal(document.body.dataset.workspaceOrder,'catalog-canvas-palette');assert.equal(document.querySelector('.catalog').style.getPropertyValue('--workspace-panel-column'),'1');
});
test('usage label expressions are inert local substitutions with readable fallback and exact path/ID',()=>{
 const settings=structuredClone(PREFERENCE_DEFAULTS),usage={viewName:'Сеть <img>',folderPath:'Дом / Infrastructure',viewId:'view-exact'};settings.behavior.viewLabelTemplate='${path} → ${name} [${id}]';assert.equal(viewUsageLabel(usage,settings),'Дом / Infrastructure → Сеть <img> [view-exact]');for(const bad of ['${constructor}','${window.alert(1)}','${name','']){settings.behavior.viewLabelTemplate=bad;assert.equal(viewUsageLabel(usage,settings),usage.viewName);}settings.behavior.viewNames=false;assert.equal(viewUsageLabel(usage,settings),'view-exact');
});
test('keymap default Paste callback follows local policy while explicit menu reuse remains explicit and text editing stays native',t=>{
 const h=fixture(t),actions=[];h.$('fragment-copy').id='fragment-paste-reuse';h.$('fragment-paste-reuse').addEventListener('click',()=>actions.push('explicit-reuse'));const menu=h.document.createElement('button');menu.dataset.command='fragment-paste-reuse';h.document.body.append(menu);installWorkbench({document:h.document,window:h.window,preferences:h.preferences,files:{},blocked:()=>false,status:()=>{},onDefaultPaste:()=>actions.push(h.preferences.get('behavior').pasteMode)});
 const behavior=h.preferences.get('behavior');behavior.pasteMode='clone';h.preferences.update('behavior',behavior);const key=target=>target.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'v',code:'KeyV',ctrlKey:true,bubbles:true,cancelable:true}));key(h.$('canvas'));assert.deepEqual(actions,['clone']);menu.click();assert.deepEqual(actions,['clone','explicit-reuse']);key(h.$('text'));assert.equal(actions.length,2);
});


test('team preference baseline stays below explicit user profile and reset follows that baseline without implicit user override',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},team=structuredClone(PREFERENCE_DEFAULTS);team.theme='dark';team.defaults.width=320;team.behavior.magicOrder='relation-first';
 const first=createLocalPreferences(storage,{baseSettings:team});assert.equal(first.get('theme'),'dark');assert.equal(first.get('defaults').width,320);assert.equal(values.has(PREFERENCES_KEY),false);const updated=structuredClone(team);updated.defaults.width=400;assert.equal(createLocalPreferences(storage,{baseSettings:updated}).get('defaults').width,400);
 first.update('theme','light');assert.equal(createLocalPreferences(storage,{baseSettings:updated}).get('defaults').width,320);assert.equal(createLocalPreferences(storage,{baseSettings:updated}).get('theme'),'light');
 const prefs=createLocalPreferences(storage,{baseSettings:updated});prefs.reset();assert.deepEqual(prefs.snapshot,updated);assert.deepEqual(prefs.defaultsSnapshot,updated);const copy=prefs.defaultsSnapshot;copy.defaults.width=999;assert.equal(prefs.defaultsSnapshot.defaults.width,400);
 const old=JSON.parse(serializePreferences(updated));for(const key of ['magicOrder','proposeNestingCreate','proposeNestingReuse','proposeNestingMove','nestingParentTypes','nestingChildTypes','selectionEffect'])delete old.settings.behavior[key];const migrated=deserializePreferences(JSON.stringify(old));assert.deepEqual(migrated.behavior.nestingParentTypes,PREFERENCE_DEFAULTS.behavior.nestingParentTypes);assert.equal(migrated.behavior.magicOrder,'element-first');
 for(const types of [['constructor'],['Association','Association']]){const bad=structuredClone(updated);bad.behavior.nestingParentTypes=types;assert.throws(()=>validatePreferences(bad));}
});

test('local rounded display preference changes effective route only and explicit drawing styles still win',()=>{
 const settings=structuredClone(PREFERENCE_DEFAULTS),view={view:{},occurrences:[],visualNodes:[],connections:[{id:'a',style:{},routePoints:[{kind:'bend',point:{x:20,y:30}}]},{id:'b',style:{lineStyle:'direct'},routePoints:[]}],visualConnectors:[]},before=structuredClone(view);settings.display.roundedLines=true;const shown=applyPreferenceView(view,settings);assert.equal(shown.connections[0].style.lineStyle,'rounded');assert.equal(shown.connections[1].style.lineStyle,'direct');assert.deepEqual(view,before);const restored=deserializePreferences(serializePreferences(settings));assert.equal(restored.display.roundedLines,true);settings.display.roundedLines=false;assert.deepEqual(applyPreferenceView(view,settings),view);
});
