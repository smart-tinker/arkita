import {createStore} from '../../schemka-model-core/src/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, richLifecycleFixture } from './app-test-fixture.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

async function ready(t, adjust = () => {}) {
  const h = await setup(t), data = richLifecycleFixture(); adjust(data);
  await h.load(serializeProjectFile(data.state)); h.$('views').querySelector(`[data-view-id="${data.viewId}"]`).click();
  const group = (id, kind = 'occurrence') => h.$('canvas').querySelector(`[data-kind="${kind}"][data-id="${id}"]`);
  const key = (target, key, options = {}) => { const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; };
  const select = () => { key(group(data.a.occurrenceId), 'Enter'); key(group(data.b.occurrenceId), 'Enter', { shiftKey: true }); };
  const action = operation => h.$('alignment-dialog').querySelector(`[data-align="${operation}"]`);
  return { h, data, group, key, select, action };
}

test('app alignment offers nine explicit operations and explains mixed drawing scope with a literal exact anchor', async t => {
  const { h, data, group, key, select, action } = await ready(t, data => { data.state.elements.find(item => item.id === data.a.elementId).name = '<img src=x onerror=alert(1)> Literal anchor'; });
  const bytes = await h.download(); select(); key(group(data.relation.connectionId, 'connection'), 'Enter', { shiftKey: true });
  assert.equal(h.$('alignment-button').disabled, false); h.$('alignment-button').click();
  assert.equal(h.$('alignment-dialog').open, true); assert.equal(h.$('alignment-dialog').querySelectorAll('[data-align]').length, 9);
  assert.match(h.$('alignment-description').textContent, /Выбрано фигур: 2; соединений: 1/);
  assert.ok(h.$('alignment-description').textContent.includes(data.a.occurrenceId)); assert.ok(h.$('alignment-description').textContent.includes('<img src=x onerror=alert(1)>'));
  assert.equal(h.$('alignment-dialog').querySelector('img,script'), null); assert.equal(h.document.activeElement, action('left'));
  action('left').click(); assert.equal(h.$('alignment-dialog').open, false); assert.match(h.$('history-state').textContent, /1 действий/);
  const afterBytes = await h.download(), after = deserializeProjectFile(afterBytes), before = deserializeProjectFile(bytes);
  const originalView = before.views.find(item => item.view.id === data.viewId), view = after.views.find(item => item.view.id === data.viewId);
  assert.deepEqual(view.occurrences.find(item => item.id === data.a.occurrenceId), originalView.occurrences.find(item => item.id === data.a.occurrenceId));
  assert.equal(view.occurrences.find(item => item.id === data.b.occurrenceId).bounds.x, view.occurrences.find(item => item.id === data.a.occurrenceId).bounds.x);
  assert.deepEqual(after.views.filter(item => item.view.id !== data.viewId), before.views.filter(item => item.view.id !== data.viewId));
  assert.deepEqual(after.elements, before.elements); assert.deepEqual(after.relationships, before.relationships);
  assert.equal(h.$('canvas').querySelectorAll('.selected[data-kind="occurrence"]').length, 2); assert.ok(group(data.relation.connectionId, 'connection').classList.contains('selected'));
  h.$('undo').click(); assert.deepEqual(await h.download(), bytes); h.$('redo').click(); assert.deepEqual(await h.download(), afterBytes);
  h.$('alignment-button').click(); action('size').click();
  const resized = deserializeProjectFile(await h.download()).views.find(item => item.view.id === data.viewId);
  const anchor = resized.occurrences.find(item => item.id === data.a.occurrenceId), other = resized.occurrences.find(item => item.id === data.b.occurrenceId);
  assert.equal(other.bounds.width, anchor.bounds.width); assert.equal(other.bounds.height, anchor.bounds.height);
  assert.deepEqual({ x: other.bounds.x, y: other.bounds.y }, { x: view.occurrences.find(item => item.id === data.b.occurrenceId).bounds.x, y: view.occurrences.find(item => item.id === data.b.occurrenceId).bounds.y });
  h.$('undo').click(); assert.deepEqual(await h.download(), afterBytes);
});

test('app alignment requires two occurrences and an occurrence anchor, then an anchor click enables the same mixed group', async t => {
  const { h, data, group, key } = await ready(t), canvas = h.$('canvas');
  assert.equal(h.$('alignment-button').disabled, true);
  key(group(data.relation.connectionId, 'connection'), 'Enter'); key(group(data.a.occurrenceId), 'Enter', { shiftKey: true }); key(group(data.b.occurrenceId), 'Enter', { shiftKey: true });
  assert.equal(h.$('alignment-button').disabled, true); assert.match(h.$('alignment-hint').textContent, /Сделайте опорой фигуру/);
  h.pointer(group(data.a.occurrenceId), 'pointerdown'); h.pointer(canvas, 'pointerup');
  assert.equal(h.$('alignment-button').disabled, false); assert.equal(canvas.querySelectorAll('.selected[data-kind="occurrence"]').length, 2);
  h.$('alignment-button').click(); h.$('alignment-cancel').click(); assert.equal(h.$('alignment-dialog').open, false); assert.equal(h.$('undo').disabled, true);
});

test('app cancellation, no-op and delayed stale dialog actions preserve redo and exact model bytes', async t => {
  const { h, data, group, key, select, action } = await ready(t, data => {
    const view = data.state.views.find(item => item.view.id === data.viewId), anchor = view.occurrences.find(item => item.id === data.a.occurrenceId), other = view.occurrences.find(item => item.id === data.b.occurrenceId);
    other.bounds.width = anchor.bounds.width;
  });
  const bytes = await h.download(); select(); key(h.$('canvas'), 'ArrowRight'); h.$('undo').click(); assert.equal(h.$('redo').disabled, false);
  h.$('alignment-button').click(); h.$('alignment-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.equal(h.$('alignment-dialog').open, false); assert.equal(h.document.activeElement, h.$('alignment-button')); assert.deepEqual(await h.download(), bytes);
  h.$('alignment-button').click(); action('width').click(); assert.match(h.$('status').textContent, /История не изменилась/); assert.equal(h.$('redo').disabled, false); assert.deepEqual(await h.download(), bytes);
  h.$('alignment-button').click(); const stale = action('left'); h.$('views').querySelector(`[data-view-id="${data.otherViewId}"]`).click(); stale.click();
  assert.equal(h.$('alignment-dialog').open, false); assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, false); assert.deepEqual(await h.download(), bytes);
  assert.equal(h.$('canvas').querySelectorAll('.selected').length, 0);
});

test('app rejects an invalid whole-group alignment, keeps the dialog reviewable and creates no command', async t => {
  const { h, data, select, action } = await ready(t, data => {
    const view = data.state.views.find(item => item.view.id === data.viewId), anchor = view.occurrences.find(item => item.id === data.a.occurrenceId), other = view.occurrences.find(item => item.id === data.b.occurrenceId);
    Object.assign(anchor.bounds, { x: 1000000, width: 1000000 }); other.bounds.width = .1;
  });
  const bytes = await h.download(); select(); h.$('alignment-button').click(); action('right').click();
  assert.equal(h.$('alignment-dialog').open, true); assert.match(h.$('alignment-error').textContent, /Вся группа сохранена без изменений/); assert.equal(h.$('undo').disabled, true);
  h.$('alignment-cancel').click(); assert.deepEqual(await h.download(), bytes);
});

test('app alignment opener protects an unfinished inline draft before pointer focus or keyboard click can discard it', async t => {
  const { h, data, group, select } = await ready(t); select();
  group(data.a.occurrenceId).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true }));
  const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = 'Unfinished exact draft';
  assert.equal(h.pointer(h.$('alignment-button'), 'pointerdown').defaultPrevented, true); h.$('alignment-button').click();
  assert.equal(h.$('alignment-dialog').open, false); assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(input.value, 'Unfinished exact draft');
  assert.equal(h.$('undo').disabled, true);
});


test('semantic and visual figures share alignment and sizing with either kind as the explicit anchor',async t=>{
 const h=await setup(t),data=richLifecycleFixture(),store=createStore(data.state),visual=store.execute({type:'createVisualNode',viewId:data.viewId,kind:'note',text:'Visual',bounds:{x:520,y:240,width:130,height:70}},store.revision).created.visualNodeId;await h.load(serializeProjectFile(store.snapshot));h.document.querySelector(`[data-view-id="${data.viewId}"]`).click();const bytes=await h.download(),find=id=>h.$('canvas').querySelector(`[data-id="${id}"]`),key=(target,shift=false)=>target.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Enter',shiftKey:shift,bubbles:true,cancelable:true}));key(find(data.a.occurrenceId));key(find(visual),true);assert.equal(h.$('alignment-button').disabled,false);h.$('alignment-button').click();h.$('alignment-dialog').querySelector('[data-align="left"]').click();let view=deserializeProjectFile(await h.download()).views.find(item=>item.view.id===data.viewId);assert.equal(view.visualNodes.find(item=>item.id===visual).bounds.x,view.occurrences.find(item=>item.id===data.a.occurrenceId).bounds.x);h.$('undo').click();assert.deepEqual(await h.download(),bytes);
 key(find(visual));key(find(data.a.occurrenceId),true);h.$('alignment-button').click();h.$('alignment-dialog').querySelector('[data-align="width"]').click();view=deserializeProjectFile(await h.download()).views.find(item=>item.view.id===data.viewId);assert.equal(view.occurrences.find(item=>item.id===data.a.occurrenceId).bounds.width,130);assert.equal(view.visualNodes.find(item=>item.id===visual).bounds.width,130);h.$('undo').click();assert.deepEqual(await h.download(),bytes);
});
