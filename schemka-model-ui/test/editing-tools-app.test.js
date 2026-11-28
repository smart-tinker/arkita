import {createProject,createStore} from '../../schemka-model-core/src/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, richLifecycleFixture } from './app-test-fixture.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { beginLayoutEdit, layoutHandle } from './notation-app-helpers.js';
const dispatch = (h, id, type) => h.$(id).dispatchEvent(new h.window.Event(type, { bubbles: true, cancelable: true }));
const state = async h => deserializeProjectFile(await h.download());
const nextTask = window => new Promise(resolve => window.setTimeout(resolve, 0));

function deferToolsDialogClose(h) {
  const close = h.window.HTMLDialogElement.prototype.close;
  h.window.HTMLDialogElement.prototype.close = function () {
    if (this.id !== 'diagram-tools-dialog') return close.call(this);
    this.removeAttribute('open'); h.window.setTimeout(() => this.dispatchEvent(new h.window.Event('close')), 0);
  };
}

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

test('Shift+Insert on a selected occurrence uses the atomic connector dialog and free-slot keyboard placement', async t => {
  const store = createStore(createProject('Keyboard atomic connector'));
  const viewId = store.execute({ type: 'createView', name: 'Main' }, store.revision).created.viewId;
  const source = store.execute({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent', name: 'Source',
    bounds: { x: 40, y: 40, width: 160, height: 90 } }, store.revision).created;
  const bytes = Buffer.from(serializeProjectFile(store.snapshot)), h = await setup(t); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${viewId}"]`).click();
  const sourceNode = h.$('canvas').querySelector(`[data-id="${source.occurrenceId}"]`);
  h.pointer(sourceNode, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
  h.$('canvas').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Insert', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(h.$('diagram-tools-dialog').open, true); assert.equal(h.$('diagram-source').value, source.occurrenceId);
  assert.equal(h.document.activeElement.id, 'diagram-search');
  h.$('diagram-search').value = 'DataObject'; h.$('diagram-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  assert.ok([...h.$('diagram-relationship').options].some(option => option.value === 'Access'));
  h.$('diagram-type').value = 'DataObject'; h.$('diagram-type').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  h.$('diagram-relationship').value = 'Access'; h.$('diagram-relationship').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  h.$('diagram-name').value = 'Keyboard target';
  h.$('diagram-tools-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const saved = await h.download(), after = deserializeProjectFile(saved), relationship = after.relationships.find(item => !store.snapshot.relationships.some(old => old.id === item.id));
  const target = after.elements.find(item => item.name === 'Keyboard target');
  assert.equal(target.type, 'DataObject'); assert.deepEqual(relationship.source, { kind: 'element', id: source.elementId });
  assert.deepEqual(relationship.target, { kind: 'element', id: target.id });
  assert.match(h.$('history-state').textContent, /1 действий/);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), saved);
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


test('saved view router attaches orthogonal lines to contours, preserves authored anchors and supports bend edits', async t => {
  const h = await setup(t), f = richLifecycleFixture(), entry = f.state.views.find(item => item.view.id === f.viewId);
  const route = entry.connections.find(item => item.id === f.relation.connectionId);
  route.routePoints.splice(1, 0, { kind: 'anchor', id: 'anc-00000000-0000-4000-8000-000000000149', point: { x: 295, y: 50 } });
  const authoredRoute = structuredClone(route.routePoints), bytes = Buffer.from(serializeProjectFile(f.state));
  await h.load(bytes); h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();
  const open = () => { h.$('diagram-tools-button').click(); h.$('diagram-router-settings').click(); };
  const paths = () => [...h.$('canvas').querySelectorAll('g.connection .line')].map(path => path.getAttribute('d'));
  const originalPaths = paths();
  assert.equal(Object.hasOwn(entry.view, 'router'), false);
  open(); assert.equal(h.$('diagram-router').value, 'manual');
  assert.match(h.$('diagram-tools-dialog').textContent, /примыкание по контуру/);
  h.$('diagram-router').value = 'orthogonal'; dispatch(h, 'diagram-tools-form', 'submit');
  assert.equal(h.$('diagram-tools-dialog').open, false, h.$('diagram-tools-error').textContent);
  const orthogonalBytes = await h.download(), orthogonalState = deserializeProjectFile(orthogonalBytes);
  let view = orthogonalState.views.find(item => item.view.id === f.viewId);
  let connection = view.connections.find(item => item.id === f.relation.connectionId);
  assert.equal(view.view.router, 'orthogonal');
  assert.deepEqual(connection.routePoints, authoredRoute);
  assert.ok(paths().every(path => !path.includes(' C ')), 'The selected strategy paints only orthogonal segments');
  assert.deepEqual(deserializeProjectFile(serializeProjectFile(orthogonalState)), orthogonalState);

  beginLayoutEdit(h, f.relation.connectionId);
  const bend = layoutHandle(h, 0); bend.focus();
  const moved = new h.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  bend.dispatchEvent(moved); assert.equal(moved.defaultPrevented, true);
  assert.notDeepEqual(paths(), originalPaths);
  h.$('layout-edit-toggle').click();
  const movedBytes = await h.download(), movedState = deserializeProjectFile(movedBytes);
  view = movedState.views.find(item => item.view.id === f.viewId);
  connection = view.connections.find(item => item.id === f.relation.connectionId);
  assert.equal(connection.routePoints[0].point.x, authoredRoute[0].point.x + 10);
  assert.deepEqual(connection.routePoints[1], authoredRoute[1], 'Editing a bend leaves the anchor ID and coordinates exact');
  assert.equal(view.view.router, 'orthogonal');

  h.$('undo').click(); assert.deepEqual(await h.download(), orthogonalBytes);
  open(); h.$('diagram-router').value = 'manual'; dispatch(h, 'diagram-tools-form', 'submit');
  const manualBytes = await h.download(), manualState = deserializeProjectFile(manualBytes);
  view = manualState.views.find(item => item.view.id === f.viewId);
  connection = view.connections.find(item => item.id === f.relation.connectionId);
  assert.equal(Object.hasOwn(view.view, 'router'), false, 'Manual clears the override and restores the old default');
  assert.deepEqual(connection.routePoints, authoredRoute);
  assert.deepEqual(paths(), originalPaths);
  assert.deepEqual(manualBytes, bytes);

  h.$('undo').click(); assert.deepEqual(await h.download(), orthogonalBytes);
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
  const history = h.$('history-state').textContent;
  open(); dispatch(h, 'diagram-tools-form', 'submit');
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
  h.$('redo').click(); assert.deepEqual(await h.download(), orthogonalBytes);
  await h.load(orthogonalBytes);
  const reopenedBytes = await h.download(), reopenedState = deserializeProjectFile(reopenedBytes);
  assert.deepEqual(reopenedBytes, orthogonalBytes, 'Save after reopening preserves the exact native bytes');
  view = reopenedState.views.find(item => item.view.id === f.viewId);
  connection = view.connections.find(item => item.id === f.relation.connectionId);
  assert.equal(view.view.router, 'orthogonal');
  assert.deepEqual(connection.routePoints, authoredRoute, 'Reopen and Save preserve the pinned anchor ID and coordinates');
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

test('inversion survives a deferred close event and one Undo restores all bytes', async t => {
  const h = await setup(t), f = richLifecycleFixture();
  for (const view of f.state.views) {
    const connection = view.connections.find(item => item.relationshipId === f.relation.relationshipId);
    if (connection) connection.style = { ...connection.style, labelOffset: { x: 24, y: -12 } };
  }
  const bytes = Buffer.from(serializeProjectFile(f.state)); await h.load(bytes); h.document.querySelector(`[data-view-id="${f.viewId}"]`).click();
  const selector = `#canvas g[data-kind="connection"][data-id="${f.relation.connectionId}"]:not([data-anchor-id])`;
  h.$('canvas').querySelector(selector).dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(h.$('canvas').querySelector(selector).getAttribute('aria-pressed'), 'true');
  deferToolsDialogClose(h);
  h.$('diagram-tools-button').click(); h.$('diagram-reverse').click(); await nextTask(h.window);
  assert.equal(h.$('diagram-tools-title').textContent, 'Изменить направление во всей модели?');
  assert.equal(h.$('diagram-tools-apply').disabled, false);
  h.$('diagram-tools-apply').click();
  assert.equal(h.$('diagram-tools-dialog').open, false, h.$('diagram-tools-error').textContent);
  assert.match(h.$('history-state').textContent, /1 действий/);
  const after = await state(h), relationship = after.relationships.find(item => item.id === f.relation.relationshipId);
  const beforeRelationship = f.state.relationships.find(item => item.id === f.relation.relationshipId);
  assert.deepEqual(relationship.source, beforeRelationship.target); assert.deepEqual(relationship.target, beforeRelationship.source);
  assert.equal(relationship.label, beforeRelationship.label); assert.deepEqual(relationship.properties, beforeRelationship.properties);
  for (const beforeView of f.state.views) {
    const before = beforeView.connections.find(item => item.relationshipId === f.relation.relationshipId); if (!before) continue;
    const current = after.views.find(item => item.view.id === beforeView.view.id).connections.find(item => item.id === before.id);
    assert.deepEqual(current.source, before.target); assert.deepEqual(current.target, before.source);
    assert.deepEqual(current.routePoints, [...before.routePoints].reverse()); assert.deepEqual(current.style.labelOffset, { x: 24, y: -12 });
    assert.deepEqual(current.labelPosition, before.labelPosition);
  }
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes);
  h.$('diagram-tools-button').click(); h.$('diagram-tools-cancel').click(); await nextTask(h.window);
  assert.deepEqual(await h.download(), bytes);
});
