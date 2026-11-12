import {createProject,createStore} from '../../schemka-model-core/src/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, richLifecycleFixture } from './app-test-fixture.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const dispatch = (h, id, type) => h.$(id).dispatchEvent(new h.window.Event(type, { bubbles: true, cancelable: true }));
const state = async h => deserializeProjectFile(await h.download());

test('quick linked creation uses one undo, filtered types and cancellation cannot leave partial records', async t => {
  const h = await setup(t), f = richLifecycleFixture(), bytes = Buffer.from(serializeProjectFile(f.state)); await h.load(bytes); h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();
  const target = h.document.querySelector(`[data-kind="occurrence"][data-id="${f.a.occurrenceId}"]`); h.pointer(target, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
  h.$('diagram-tools-button').click(); h.$('diagram-quick-linked').click(); assert.equal(h.$('diagram-tools-dialog').open, true);
  h.$('diagram-name').value = 'Atomic linked role'; h.$('diagram-search').value = 'role'; dispatch(h, 'diagram-search', 'input'); assert.deepEqual([...h.$('diagram-type').options].map(item => item.value), ['Role']);
  h.$('diagram-source').value = f.a.occurrenceId; h.$('diagram-relationship').value = 'Association'; dispatch(h, 'diagram-tools-form', 'submit'); assert.equal(h.$('diagram-tools-dialog').open, false, h.$('diagram-tools-error').textContent);
  const after = await state(h); assert.equal(after.elements.length, f.state.elements.length + 1); assert.equal(after.relationships.length, f.state.relationships.length + 1);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await state(h), after);
  h.$('diagram-quick-add').click(); h.$('diagram-search').value = 'nothing matches'; dispatch(h, 'diagram-search', 'input'); assert.equal(h.$('diagram-tools-apply').disabled, true); h.$('diagram-tools-cancel').click(); assert.deepEqual(await state(h), after);
});

test('keyboard geometry preview has no history, Escape restores it, Enter applies once and text arrows do not move', async t => {
  const h = await setup(t), f = richLifecycleFixture(), bytes = Buffer.from(serializeProjectFile(f.state)); await h.load(bytes); h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();
  const target = h.document.querySelector(`[data-kind="occurrence"][data-id="${f.a.occurrenceId}"]`); h.pointer(target, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
  const open = () => { h.$('diagram-tools-button').click(); h.$('diagram-geometry').click(); assert.equal(h.$('diagram-tools-dialog').open, true); };
  const arrow = target => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  open(); const x = Number(h.$('diagram-x').value); arrow(h.$('diagram-x')); assert.equal(Number(h.$('diagram-x').value), x); arrow(h.$('diagram-tools-apply')); assert.equal(Number(h.$('diagram-x').value), x + 10); assert.equal(h.$('history-state').textContent, 'Единая история · 0 действий'); h.$('diagram-tools-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true })); assert.deepEqual(await h.download(), bytes);
  open(); h.$('diagram-width').value = '260'; dispatch(h, 'diagram-width', 'input'); dispatch(h, 'diagram-tools-form', 'submit'); const changed = await state(h); assert.equal(changed.views.find(entry => entry.view.id === f.viewId).occurrences.find(item => item.id === f.a.occurrenceId).bounds.width, 260);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
});

test('repeat tool creates separate undo steps and blur stops subsequent late clicks', async t => {
  const h = await setup(t), before = await state(h); h.$('diagram-quick-add').click(); h.$('diagram-type').value = 'Role'; h.$('diagram-name').value = 'Repeat'; h.$('diagram-repeat').checked = true; dispatch(h, 'diagram-tools-form', 'submit'); assert.equal(h.$('diagram-repeat-stop').hidden, false);
  h.pointer(h.$('canvas'), 'pointerdown', 350, 200); assert.match(h.$('history-state').textContent, /2 действий/);
  h.window.dispatchEvent(new h.window.Event('blur')); assert.equal(h.$('diagram-repeat-stop').hidden, true); h.pointer(h.$('canvas'), 'pointerdown', 500, 300); h.pointer(h.$('canvas'), 'pointerup', 500, 300);
  const after = await state(h); assert.equal(after.elements.length, before.elements.length + 2); h.$('undo').click(); assert.equal((await state(h)).elements.length, before.elements.length + 1); h.$('undo').click(); assert.deepEqual(await state(h), before);
});


test('Alt-click quick creation is optional while Insert remains available and cancel preserves the model',async t=>{
 const h=await setup(t),before=await h.download(),alt=()=>{const event=new h.window.Event('pointerdown',{bubbles:true,cancelable:true});Object.assign(event,{button:0,isPrimary:true,pointerId:9,clientX:333,clientY:222,altKey:true});h.$('canvas').dispatchEvent(event);return event;};
 assert.equal(alt().defaultPrevented,true);assert.equal(h.$('diagram-tools-dialog').open,true);assert.match(h.$('diagram-tools-dialog').textContent,/333, 222/);h.$('diagram-tools-cancel').click();assert.deepEqual(await h.download(),before);
 h.$('preferences-button').click();h.$('preferences-behavior-quickAdd').checked=false;dispatch(h,'preferences-form','submit');alt();h.pointer(h.$('canvas'),'pointerup',333,222,9);assert.equal(h.$('diagram-tools-dialog').open,false);
 h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Insert',bubbles:true,cancelable:true}));assert.equal(h.$('diagram-tools-dialog').open,true);h.$('diagram-tools-cancel').click();assert.deepEqual(await h.download(),before);
});


test('saved view orthogonal router changes displayed strokes only, restores authored routes with Undo and no-op keeps redo',async t=>{
 const h=await setup(t),f=richLifecycleFixture(),bytes=Buffer.from(serializeProjectFile(f.state));await h.load(bytes);h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();const open=()=>{h.$('diagram-tools-button').click();h.$('diagram-router-settings').click();};const paths=()=>[...h.$('canvas').querySelectorAll('g.connection .line')].map(path=>path.getAttribute('d')),originalPaths=paths();
 open();h.$('diagram-router').value='orthogonal';dispatch(h,'diagram-tools-form','submit');assert.equal(h.$('diagram-tools-dialog').open,false,h.$('diagram-tools-error').textContent);const after=await state(h),view=after.views.find(item=>item.view.id===f.viewId),original=f.state.views.find(item=>item.view.id===f.viewId);assert.equal(view.view.router,'orthogonal');assert.deepEqual(view.connections,original.connections);assert.deepEqual(view.occurrences,original.occurrences);assert.ok(paths().every(path=>!path.includes(' C ')));assert.deepEqual(deserializeProjectFile(serializeProjectFile(after)),after);
 h.$('undo').click();assert.deepEqual(await h.download(),bytes);assert.deepEqual(paths(),originalPaths);const history=h.$('history-state').textContent;open();dispatch(h,'diagram-tools-form','submit');assert.equal(h.$('history-state').textContent,history);assert.deepEqual(await h.download(),bytes);h.$('redo').click();assert.equal((await state(h)).views.find(item=>item.view.id===f.viewId).view.router,'orthogonal');
});

test('quick type searches work in both orders, keep source-issued UNKNOWN and omit verified forbidden combinations',async t=>{
 const h=await setup(t),store=createStore(createProject('Quick source')),viewId=store.execute({type:'createView',name:'Source'},0).created.viewId,source=store.execute({type:'createElementAndOccurrence',viewId,elementType:'Product',name:'Product',bounds:{x:20,y:20,width:140,height:80}},store.revision).created.occurrenceId;await h.load(serializeProjectFile(store.snapshot));const before=await h.download();
 for(const order of ['element-first','relation-first']){h.$('diagram-quick-add').click();h.$('diagram-source').value=source;dispatch(h,'diagram-source','change');h.$('diagram-search-order').value=order;dispatch(h,'diagram-search-order','change');h.$('diagram-relationship-search').value='composition';dispatch(h,'diagram-relationship-search','input');h.$('diagram-search').value='deliverable';dispatch(h,'diagram-search','input');assert.deepEqual([...h.$('diagram-type').options].map(option=>option.value),['Deliverable']);assert.deepEqual([...h.$('diagram-relationship').options].map(option=>option.value),['Composition']);assert.match(h.$('diagram-combination-assessment').textContent,/UNKNOWN/);assert.equal(h.$('diagram-tools-apply').disabled,false);h.$('diagram-tools-cancel').click();assert.deepEqual(await h.download(),before);}
 h.$('diagram-quick-add').click();h.$('diagram-source').value=source;dispatch(h,'diagram-source','change');h.$('diagram-search').value='service';dispatch(h,'diagram-search','input');assert.ok(![...h.$('diagram-relationship').options].some(option=>option.value==='Specialization'));h.$('diagram-tools-cancel').click();assert.deepEqual(await h.download(),before);
});

test('standard size is reachable, uses local defaults in preview and commits once with exact cancel and Undo', async t => {
  const h = await setup(t), f = richLifecycleFixture(); await h.load(serializeProjectFile(f.state)); h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();
  h.$('preferences-button').click(); h.$('preferences-defaults-width').value = '300'; h.$('preferences-defaults-height').value = '140'; dispatch(h, 'preferences-form', 'submit');
  const bytes = await h.download(), target = () => h.$('canvas').querySelector(`[data-id="${f.a.occurrenceId}"]`), open = () => { h.pointer(target(), 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup'); h.$('diagram-tools-button').click(); h.$('diagram-geometry').click(); h.$('diagram-standard-size').click(); };
  open(); assert.equal(h.$('diagram-width').value, '300'); assert.equal(h.$('diagram-height').value, '140'); assert.match(h.$('history-state').textContent, /0 действий/); h.$('diagram-tools-cancel').click(); assert.deepEqual(await h.download(), bytes);
  open(); dispatch(h, 'diagram-tools-form', 'submit'); assert.equal(h.$('diagram-tools-dialog').open, false, h.$('diagram-tools-error').textContent); assert.match(h.$('history-state').textContent, /1 действий/);
  const after = await state(h), occurrence = after.views.find(entry => entry.view.id === f.viewId).occurrences.find(item => item.id === f.a.occurrenceId); assert.deepEqual(occurrence.bounds, { ...f.state.views.find(entry => entry.view.id === f.viewId).occurrences.find(item => item.id === f.a.occurrenceId).bounds, width: 300, height: 140 });
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await state(h), after);
});

test('same-type selection unions the selected drawing types in the active view without editing model files', async t => {
  const h = await setup(t), f = richLifecycleFixture(), store = createStore(f.state);
  const duplicate = store.execute({ type: 'createElementAndOccurrence', viewId: f.viewId, elementType: 'Collaboration', name: 'Shared role', bounds: { x: 600, y: 80, width: 210, height: 90 } }, store.revision).created;
  await h.load(serializeProjectFile(store.snapshot)); h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();
  const pointer = (target, shiftKey = false) => {
    const event = new h.window.Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100, shiftKey }); target.dispatchEvent(event);
    h.pointer(h.$('canvas'), 'pointerup', 100, 100, 1);
  };
  const occurrence = id => h.$('canvas').querySelector(`[data-kind="occurrence"][data-id="${id}"]`);
  const connection = h.$('canvas').querySelector(`[data-kind="connection"][data-id="${f.relation.connectionId}"]`);
  pointer(occurrence(f.a.occurrenceId)); pointer(connection, true);
  const before = await h.download(), history = h.$('history-state').textContent, dirty = h.$('file-state').dataset.dirty;
  h.$('diagram-tools-button').click(); h.$('diagram-select-same').click();
  const selected = [...h.$('canvas').querySelectorAll('.selected[data-kind]')].map(item => `${item.dataset.kind}:${item.dataset.id}`).sort();
  assert.deepEqual(selected, [`connection:${f.relation.connectionId}`, `occurrence:${f.a.occurrenceId}`, `occurrence:${duplicate.occurrenceId}`].sort());
  assert.match(h.$('selection-summary').textContent, /Выбрано: 3/);
  assert.deepEqual(await h.download(), before); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, dirty);
});
