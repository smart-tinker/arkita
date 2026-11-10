import { extendedEndpointFixture } from './endpoint-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createController } from '../src/controller.js';
import { installTypedActions } from '../src/typed-actions.js';
import { createStore, createProject, CURRENT_CATALOG, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { expectedEndpointDecision } from './endpoint-oracle.js';

function setup(store = createDemo()) {
  const items = new Map(), reports = [], commands = [], tools = [], reveals = [];
  let focused = null, failRender = false, failFocus = false;
  function make(id = '', tag = '') {
    let value = '';
    const select = ['link-source', 'link-target', 'existing-link'].includes(id);
    return { textContent: '', children: [], handlers: {}, hidden: false, disabled: false, open: false, dataset: {}, tag,
      get childNodes() { return this.children; },
      append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } },
      removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; },
      querySelector(selector) { return this.children.find(child => selector[0] === '.' ? child.className === selector.slice(1) : child.tag === selector) || null; },
      get value() { return value; }, set value(next) { value = select && !this.children.some(item => item.value === next) ? '' : next; },
      get options() { return this.children; }, set selectedIndex(index) { value = this.children[index]?.value || ''; },
      replaceChildren(...children) { this.children = []; this.append(...children); if (select) value = children[0]?.value || ''; },
      addEventListener(name, handler) { this.handlers[name] = handler; }, event(name) { this.handlers[name]?.({ preventDefault() {} }); },
      focus() { focused = id; }, close() { this.open = false; this.event('close'); },
    };
  }
  const document = { createElement(tag) { return make('', tag); }, getElementById(id) { if (!items.has(id)) items.set(id, make(id)); return items.get(id); } };
  const $ = document.getElementById, model = createController(store);
  const adapterModel = Object.create(model); adapterModel.execute = command => { const result = model.execute(command); commands.push(command); return result; };
  const ui = installTypedActions({ document, model: adapterModel, drawRelationship(type) { tools.push(type); }, openDialog(id) { $(id).open = true; },
    render() { if (failRender) throw Error('render failed'); },
    revealOccurrence(bounds) { reveals.push({ ...bounds }); },
    nextBounds() { return { x: 10, y: 20, width: 120, height: 60 }; }, panel() {}, focusSelected() { if (failFocus) throw Error('focus failed'); focused = 'canvas'; }, status(text) { reports.push(text); } });
  return { $, ui, model, reports, commands, tools, reveals, get focused() { return focused; }, set failRender(value) { failRender = value; }, set failFocus(value) { failFocus = value; } };
}

test('only automatic ordinary creation requests camera reveal; explicit coordinates and junctions retain their policy', () => {
  const h = setup(), explicit = Object.freeze({ x: 10.1, y: 20.2, width: 210, height: 90 });
  h.ui.openEdit('Service', explicit); h.$('element-name').value = 'Explicit position'; h.$('edit-form').event('submit');
  assert.deepEqual(h.commands.at(-1).bounds, explicit); assert.deepEqual(h.reveals, []);
  h.ui.openEdit('AndJunction'); h.$('element-name').value = 'Junction'; h.$('edit-form').event('submit');
  assert.deepEqual(h.reveals, []);
  h.ui.openEdit('Service'); h.$('element-name').value = 'Automatic position'; h.$('edit-form').event('submit');
  assert.deepEqual(h.reveals, [{ x: 10, y: 20, width: 120, height: 60 }]);
});

test('all current element controls create their explicit types once with inert hostile text and one undo step', () => {
  const h=setup();
  for (const type of CURRENT_CATALOG.elementTypes) {
    const before=h.model.store.snapshot, history=h.model.store.history.undo;
    h.$(`create-${type.toLowerCase()}`).event('click');assert.equal(h.$('edit-dialog').open,true);assert.match(h.$('edit-title').textContent,new RegExp(type));
    assert.match(h.$('edit-description').textContent,/UNKNOWN/);assert.equal(h.focused,'element-name');
    const name=`${type} <svg onload=x> 日本語 & "quoted"`;
    h.$('element-name').value=name;h.$('edit-form').event('submit');h.$('edit-form').event('submit');
    const element=h.model.store.snapshot.elements.at(-1),occurrence=h.model.view.occurrences.at(-1);
    assert.equal(element.type,type);assert.equal(element.name,name);assert.equal(occurrence.concept.id,element.id);
    assert.equal(h.commands.at(-1).elementType,type);assert.equal(h.focused,'canvas');
    assert.equal(h.model.store.history.undo,history+1);
    const created=h.model.store.snapshot;h.model.undo();assert.deepEqual(h.model.store.snapshot,before);h.model.redo();assert.deepEqual(h.model.store.snapshot,created);
  }
  assert.equal(h.commands.length,42);
});

test('unsupported element and relationship types cannot open drafts or enter history', () => {
  const h=setup(),before=h.model.store.exportFiles();
  for (const type of [null,'Unknown','<script>','']) { h.ui.openEdit(type);h.$('edit-form').event('submit'); }
  for (const type of ['Unknown','<script>','']) { h.ui.openLink(type);h.$('link-form').event('submit'); }
  assert.equal(h.$('edit-dialog').open,false);assert.equal(h.$('link-dialog').open,false);
  assert.equal(h.commands.length,0);assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,{undo:0,redo:0});
});

test('all current element drafts cancel on close and reject newer revisions or views', () => {
  for (const type of CURRENT_CATALOG.elementTypes) {
    const h=setup(),initial=h.model.store.exportFiles();
    h.ui.openEdit(type);h.$('edit-dialog').close();h.$('edit-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),initial);
    h.ui.openEdit(type);h.model.execute({type:'renameProject',name:'Newer edit'});
    const newer=h.model.store.exportFiles(),history=h.model.store.history;
    h.$('edit-form').event('submit');h.$('edit-form').event('submit');assert.match(h.$('edit-error').textContent,/изменилась/);
    h.$('edit-dialog').close();h.ui.openEdit(type);h.model.switchView(h.model.store.snapshot.views[1].view.id);h.$('edit-form').event('submit');
    assert.match(h.$('edit-error').textContent,/изменилась/);assert.deepEqual(h.model.store.exportFiles(),newer);assert.deepEqual(h.model.store.history,history);assert.equal(h.commands.length,0);
  }
});

test('all 15 relationship controls activate drawing without opening an endpoint form or editing history', () => {
  const h = setup(), before = h.model.store.exportFiles();
  for (const type of CURRENT_CATALOG.relationshipTypes) h.$(`create-${type.toLowerCase()}`).event('click');
  assert.deepEqual(h.tools, CURRENT_CATALOG.relationshipTypes);
  assert.equal(h.$('link-dialog').open, false); assert.equal(h.commands.length, 0);
  assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
});

test('all 15 relationship dialogs retain direct, reverse and self endpoint identities with independently checked assessments', () => {
  const h=setup(),[first,second]=h.model.view.occurrences;
  for (const type of CURRENT_CATALOG.relationshipTypes) for (const [source,target] of [[first,second],[second,first],[first,first]]) {
    h.ui.openLink(type);assert.match(h.$('link-title').textContent,new RegExp(type));
    h.$('link-source').value=source.id;h.$('link-target').value=target.id;h.$('link-source').event('change');h.$('link-target').event('change');
    const state=h.model.store.snapshot,sourceType=state.elements.find(item=>item.id===source.concept.id).type,targetType=state.elements.find(item=>item.id===target.concept.id).type;
    const decision=expectedEndpointDecision(sourceType,type,targetType);
    assert.equal(h.$('link-assessment').dataset.assessment,decision.status);assert.match(h.$('link-assessment').textContent,/Нормативная оценка: UNKNOWN/);
    if(type==='ReadAccess')assert.match(h.$('link-note').textContent,/стрелка находится у «Откуда»/);
    const before=h.model.store.snapshot,history=h.model.store.history.undo;
    if (decision.status === 'FORBIDDEN') { assert.equal(h.$('link-submit').disabled, true); h.$('link-submit').disabled = false; h.$('link-form').event('submit'); assert.deepEqual(h.model.store.snapshot, before); assert.equal(h.model.store.history.undo, history); h.$('link-dialog').close(); continue; }
    h.$('link-label').value=`${type} <img onerror=x> 日本語`;h.$('link-form').event('submit');h.$('link-form').event('submit');
    const relation=h.model.store.snapshot.relationships.at(-1),connection=h.model.view.connections.at(-1);
    assert.equal(relation.type,type);assert.equal(relation.source.id,source.concept.id);assert.equal(relation.target.id,target.concept.id);assert.equal(relation.label,`${type} <img onerror=x> 日本語`);
    assert.equal(connection.source.id,source.id);assert.equal(connection.target.id,target.id);assert.equal(h.commands.at(-1).relationshipType,type);
    assert.equal(h.model.store.history.undo,history+1);assert.match(h.reports.at(-1),/UNKNOWN/);
    const created=h.model.store.snapshot;h.model.undo();assert.deepEqual(h.model.store.snapshot,before);h.model.redo();assert.deepEqual(h.model.store.snapshot,created);
  }
  assert.ok(h.commands.length > 0 && h.commands.length < 45);
});

test('existing typed relationship reuse adds only a connection and restricts endpoint identities', () => {
  const h=setup(),before=h.model.store.snapshot.relationships;
  h.ui.openLink();assert.equal(h.$('link-assessment').dataset.assessment,expectedEndpointDecision('Service','Serving','Process').status);assert.equal(h.$('link-mode').disabled,true);
  h.$('link-mode').value='new';h.$('link-form').event('submit');assert.equal(h.commands.length,0);assert.match(h.$('link-note').textContent,/недоступно/);
  h.$('link-mode').value='reuse';h.ui.fillEndpoints();
  assert.deepEqual(h.$('existing-link').children.map(item=>item.textContent.split(' · ')[0]),['Serving','Flow']);
  for (const id of ['link-source','link-target'])assert.equal(h.$(id).options.length,1);
  h.$('link-form').event('submit');h.$('link-form').event('submit');assert.equal(h.commands.length,1);assert.equal(h.commands[0].type,'addConnection');assert.deepEqual(h.model.store.snapshot.relationships,before);
});

test('relationship and reuse drafts cancel and reject stale revisions or views for every current type', () => {
  for (const type of [null,...CURRENT_CATALOG.relationshipTypes]) {
    const h=setup(),initial=h.model.store.exportFiles();
    h.ui.openLink(type);h.$('link-dialog').close();h.$('link-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),initial);
    h.ui.openLink(type);h.model.execute({type:'renameProject',name:'Newer'});const before=h.model.store.exportFiles(),history=h.model.store.history;
    h.$('link-form').event('submit');assert.match(h.$('link-note').textContent,/изменилась/);
    h.$('link-dialog').close();h.ui.openLink(type);h.model.switchView(h.model.store.snapshot.views[1].view.id);h.$('link-form').event('submit');
    assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);assert.equal(h.commands.length,0);
  }
  const empty=setup(createStore(createProject('Empty')));empty.$('create-service').event('click');empty.$('create-realization').event('click');empty.ui.fillEndpoints();empty.$('link-target').event('change');
  assert.equal(empty.$('edit-dialog').open,false);assert.equal(empty.$('link-dialog').open,false);assert.equal(empty.commands.length,0);
});

test('post-commit rendering and focus failures stay truthful and cannot repeat creation or reuse', () => {
  for (const [kind,types] of [['element',CURRENT_CATALOG.elementTypes],['relationship',[null,...CURRENT_CATALOG.relationshipTypes]]]) for (const type of types) {
    const f = kind === 'relationship' && type ? extendedEndpointFixture() : null;
    const h=setup(f ? createStore(f.state) : createDemo()),element=kind==='element';
    if (f) h.model.switchView(f.viewId);
    if(element){h.ui.openEdit(type);h.$('element-name').value=`Committed ${type}`;}else { h.ui.openLink(type); if (f) { const pair = Object.keys(f.items).flatMap(a => Object.keys(f.items).map(b => [a,b])).find(([a,b]) => expectedEndpointDecision(a,type,b).status === 'ALLOWED'); h.$('link-source').value=f.items[pair[0]].occurrenceId; h.$('link-target').value=f.items[pair[1]].occurrenceId; h.$('link-target').event('change'); } }
    const form=element?'edit-form':'link-form';h.failRender=type!==null;h.failFocus=type===null;
    h.$(form).event('submit');h.$(form).event('submit');assert.equal(h.commands.length,1);assert.equal(h.model.store.history.undo,1);
    assert.match(h.reports.at(-1),/уже созданы, но интерфейс/);assert.equal(h.$(element?'edit-dialog':'link-dialog').open,false);
  }
});

test('contextual relation source retains exact repeated occurrence through refresh and submit', () => {
  const h=setup(),original=h.model.view.occurrences[0];
  const repeated=h.model.execute({type:'addOccurrence',viewId:h.model.viewId,concept: { kind: 'element', id: original.concept.id },bounds:{x:20,y:20,width:120,height:60}}).created.occurrenceId;
  h.model.select({kind:'occurrence',id:original.id});
  for(const type of CURRENT_CATALOG.relationshipTypes){
    h.ui.openLink(type,{sourceEndpoint: { kind: 'occurrence', id: repeated }});assert.equal(h.$('link-source').value,repeated);h.ui.fillEndpoints();assert.equal(h.$('link-source').value,repeated);
    if (h.$('link-assessment').dataset.assessment === 'FORBIDDEN') { const before = h.model.store.exportFiles(); h.$('link-form').event('submit'); assert.deepEqual(h.model.store.exportFiles(), before); h.$('link-dialog').close(); continue; }
    h.$('link-form').event('submit');assert.equal(h.commands.at(-1).source.id,repeated);assert.equal(h.model.store.snapshot.relationships.at(-1).source.id,original.concept.id);
  }
});

test('verified derived commits and forbidden drafts reject atomically with cancel/stale safety', async () => {
  const {endpointFixture}=await import('./endpoint-fixture.js');
  for(const [sourceIndex,targetIndex,status] of [[0,2,'ALLOWED'],[2,0,'FORBIDDEN']]) {
    const f=endpointFixture(),h=setup(createStore(f.state));h.model.switchView(f.viewId);
    const open=()=>{h.ui.openLink('ReadAccess');h.$('link-source').value=f.items[sourceIndex].occurrenceId;h.$('link-target').value=f.items[targetIndex].occurrenceId;h.$('link-target').event('change');assert.equal(h.$('link-assessment').dataset.assessment,status);assert.equal(h.$('link-submit').disabled,status === 'FORBIDDEN');};
    const before=h.model.store.exportFiles();open();h.$('link-dialog').close();h.$('link-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),before);
    open();h.model.execute({type:'renameProject',name:'Changed revision'});const changed=h.model.store.exportFiles(),history=h.model.store.history;
    h.$('link-form').event('submit');h.$('link-form').event('submit');assert.match(h.$('link-note').textContent,/изменилась/);assert.deepEqual(h.model.store.exportFiles(),changed);assert.deepEqual(h.model.store.history,history);h.$('link-dialog').close();
    open();h.$('link-form').event('submit');h.$('link-form').event('submit');
    if (status === 'FORBIDDEN') { assert.equal(h.commands.length, 0); assert.deepEqual(h.model.store.exportFiles(), changed); assert.deepEqual(h.model.store.history, history); continue; }
    assert.equal(h.commands.length,1);
    const relation=h.model.store.snapshot.relationships.at(-1);assert.equal(relation.source.id,f.items[sourceIndex].elementId);assert.equal(relation.target.id,f.items[targetIndex].elementId);
    assert.equal(h.model.store.history.undo,history.undo+1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),changed);h.model.redo();assert.equal(h.model.store.snapshot.relationships.at(-1).id,relation.id);
  }
});

test('endpoint select refresh uses one project snapshot, and verified direct drafts retain cancel/stale/undo safeguards', async () => {
  const {extendedEndpointFixture}=await import('./endpoint-fixture.js');const f=extendedEndpointFixture(),h=setup(createStore(f.state));h.model.switchView(f.viewId);
  const open=()=>{h.ui.openLink('Serving');h.$('link-source').value=f.items.Service.occurrenceId;h.$('link-target').value=f.items.Process.occurrenceId;h.$('link-target').event('change');};
  open();assert.equal(h.$('link-assessment').dataset.assessment,'ALLOWED');assert.match(h.$('link-assessment').textContent,/прямое разрешение/);
  const originalClone=globalThis.structuredClone;let snapshots=0;
  globalThis.structuredClone=(value,...options)=>{if(value?.project?.metamodel&&Array.isArray(value.elements)&&Array.isArray(value.views))snapshots++;return originalClone(value,...options);};
  try{h.$('link-target').event('change');}finally{globalThis.structuredClone=originalClone;}
  assert.equal(snapshots,1,'One shared snapshot resolves both stored endpoint types');
  const before=h.model.store.exportFiles();h.$('link-dialog').close();h.$('link-form').event('submit');assert.deepEqual(h.model.store.exportFiles(),before);
  open();h.model.execute({type:'renameProject',name:'Revision changes'});const changed=h.model.store.exportFiles(),history=h.model.store.history;
  h.$('link-form').event('submit');h.$('link-form').event('submit');assert.match(h.$('link-note').textContent,/изменилась/);assert.deepEqual(h.model.store.exportFiles(),changed);assert.deepEqual(h.model.store.history,history);h.$('link-dialog').close();
  open();h.$('link-form').event('submit');h.$('link-form').event('submit');assert.equal(h.commands.length,1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),changed);h.model.redo();assert.equal(h.model.store.history.undo,history.undo+1);
});

test('composite direct, derived, forbidden and qualified UNKNOWN drafts preserve cancel, stale, repeat and undo boundaries', async () => {
  const { extendedEndpointFixture } = await import('./endpoint-fixture.js');
  for (const [source, type, target, status, reason] of [
    ['Product', 'Aggregation', 'Service', 'ALLOWED', null],
    ['Product', 'Composition', 'Grouping', 'ALLOWED', null],
    ['Product', 'Aggregation', 'ApplicationComponent', 'FORBIDDEN', null],
    ['Plateau', 'Aggregation', 'Deliverable', 'UNKNOWN', 'source-scope-unresolved'],
  ]) {
    const f = extendedEndpointFixture(), h = setup(createStore(f.state)); h.model.switchView(f.viewId);
    const open = () => {
      h.ui.openLink(type); h.$('link-source').value = f.items[source].occurrenceId; h.$('link-target').value = f.items[target].occurrenceId; h.$('link-target').event('change');
      assert.equal(h.$('link-assessment').dataset.assessment, status); assert.equal(h.$('link-submit').disabled, status === 'FORBIDDEN');
      if (reason) assert.match(h.$('link-assessment').textContent, /Область правила/);
    };
    const before = h.model.store.exportFiles(); open(); h.$('link-dialog').close(); h.$('link-form').event('submit'); assert.deepEqual(h.model.store.exportFiles(), before);
    open(); h.model.execute({ type: 'renameProject', name: 'New revision' });
    const changed = h.model.store.exportFiles(), history = h.model.store.history;
    h.$('link-form').event('submit'); h.$('link-form').event('submit'); assert.match(h.$('link-note').textContent, /изменилась/);
    assert.deepEqual(h.model.store.exportFiles(), changed); assert.deepEqual(h.model.store.history, history); h.$('link-dialog').close();
    open(); h.$('link-form').event('submit'); h.$('link-form').event('submit');
    if (status === 'FORBIDDEN') { assert.equal(h.commands.length, 0); assert.deepEqual(h.model.store.exportFiles(), changed); assert.deepEqual(h.model.store.history, history); continue; }
    assert.equal(h.commands.length, 1);
    const relation = h.model.store.snapshot.relationships.at(-1);
    assert.equal(relation.source.id, f.items[source].elementId); assert.equal(relation.target.id, f.items[target].elementId);
    assert.equal(h.model.store.history.undo, history.undo + 1);
    h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), changed); h.model.redo(); assert.equal(h.model.store.snapshot.relationships.at(-1).id, relation.id);
  }
});

test('typed connector commits direct, derived and UNKNOWN once, refuses forbidden, and preserves exact drawings and undo bytes', () => {
  for (const [sourceType, type, targetType, expected] of [
    ['Service', 'Serving', 'Process', 'ALLOWED'],
    ['ApplicationComponent', 'ReadAccess', 'DataObject', 'ALLOWED'],
    ['DataObject', 'ReadAccess', 'ApplicationComponent', 'FORBIDDEN'],
    ['Plateau', 'Aggregation', 'Deliverable', 'UNKNOWN'],
  ]) {
    const f = extendedEndpointFixture(), h = setup(createStore(f.state)); h.model.switchView(f.viewId);
    const source = h.model.execute({ type: 'addOccurrence', viewId: f.viewId, concept: { kind: 'element', id: f.items[sourceType].elementId }, bounds: { x: 10, y: 20, width: 120, height: 60 } }).created.occurrenceId;
    const endpoints = { sourceEndpoint: { kind: 'occurrence', id: source }, targetEndpoint: { kind: 'occurrence', id: f.items[targetType].occurrenceId } };
    const before = h.model.store.exportFiles(), history = h.model.store.history;
    h.ui.connect(type, endpoints);
    assert.equal(h.$('link-dialog').open, false);
    assert.match(h.reports.at(-1), /UNKNOWN/);
    if (expected === 'FORBIDDEN') {
      assert.match(h.reports.at(-1), /не создана/); assert.equal(h.commands.length, 0);
      assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); continue;
    }
    assert.equal(h.commands.length, 1); assert.equal(h.model.store.history.undo, history.undo + 1);
    const relation = h.model.store.snapshot.relationships.at(-1), connection = h.model.view.connections.at(-1);
    assert.equal(relation.type, type); assert.equal(relation.source.id, f.items[sourceType].elementId); assert.equal(relation.target.id, f.items[targetType].elementId);
    assert.deepEqual(connection.source, endpoints.sourceEndpoint); assert.deepEqual(connection.target, endpoints.targetEndpoint);
    const created = h.model.store.exportFiles(); h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before); h.model.redo(); assert.deepEqual(h.model.store.exportFiles(), created);
  }
});

test('typed connector rejects unavailable endpoints and invalid types without a draft, and reports post-commit render failure truthfully', () => {
  const h = setup(), [source, target] = h.model.view.occurrences, before = h.model.store.exportFiles();
  const endpoints = { sourceEndpoint: { kind: 'occurrence', id: source.id }, targetEndpoint: { kind: 'occurrence', id: target.id } };
  h.ui.connect('Unknown', endpoints);
  h.ui.connect('Association', { ...endpoints, targetEndpoint: { kind: 'occurrence', id: 'missing' } });
  assert.equal(h.commands.length, 0); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
  h.failRender = true; h.ui.connect('Association', endpoints);
  assert.equal(h.commands.length, 1); assert.match(h.reports.at(-1), /уже созданы, но интерфейс/);
  h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before);
});

test('typed connector creates junction endpoints with one atomic undo step and honest UNKNOWN assessment', () => {
  const h = setup(), source = h.model.view.occurrences[0];
  const junction = h.model.execute({ type: 'createJunctionAndOccurrence', viewId: h.model.viewId, junctionType: 'AndJunction', name: 'Junction', bounds: { x: 300, y: 100, width: 20, height: 20 } }).created;
  const before = h.model.store.exportFiles(), history = h.model.store.history;
  h.ui.connect('Association', { sourceEndpoint: { kind: 'occurrence', id: source.id }, targetEndpoint: { kind: 'occurrence', id: junction.occurrenceId } });
  assert.equal(h.commands.length, 1); assert.deepEqual(h.model.store.snapshot.relationships.at(-1).target, { kind: 'junction', id: junction.junctionId });
  assert.match(h.reports.at(-1), /UNKNOWN/); assert.equal(h.model.store.history.undo, history.undo + 1);
  const created = h.model.store.exportFiles(); h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before); h.model.redo(); assert.deepEqual(h.model.store.exportFiles(), created);
});

test('magic drop fixes endpoint drawings while explicit menu dialog restores editable endpoints', () => {
  const f = extendedEndpointFixture(), h = setup(createStore(f.state)); h.model.switchView(f.viewId);
  const endpoints = { sourceEndpoint: { kind: 'occurrence', id: f.items.ApplicationComponent.occurrenceId }, targetEndpoint: { kind: 'occurrence', id: f.items.DataObject.occurrenceId } };
  h.ui.openLink(null, { smart: true, fixedEndpoints: true, ...endpoints });
  assert.equal(h.$('link-endpoints').hidden, true); assert.equal(h.$('link-mode-field').hidden, true); assert.equal(h.$('link-fixed-endpoints').hidden, false);
  assert.match(h.$('link-fixed-endpoints').textContent, /ApplicationComponent.*→.*DataObject/);
  h.$('link-source').value = f.items.Service.occurrenceId; h.$('link-source').event('change');
  h.$('link-target').value = f.items.Process.occurrenceId; h.$('link-target').event('change');
  assert.equal(h.$('link-source').value, endpoints.sourceEndpoint.id); assert.equal(h.$('link-target').value, endpoints.targetEndpoint.id);
  h.$('smart-link-type').value = 'ReadAccess'; h.$('smart-link-type').event('change');
  h.$('link-form').event('submit'); h.$('link-form').event('submit');
  assert.equal(h.commands.length, 1); assert.deepEqual(h.commands[0].source, endpoints.sourceEndpoint); assert.deepEqual(h.commands[0].target, endpoints.targetEndpoint);
  h.ui.openLink(null, { smart: true });
  assert.equal(h.$('link-endpoints').hidden, false); assert.equal(h.$('link-source').disabled, false); assert.equal(h.$('link-target').disabled, false); assert.equal(h.$('link-fixed-endpoints').hidden, true);
});
