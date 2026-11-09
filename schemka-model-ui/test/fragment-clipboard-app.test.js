import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { setup, richLifecycleFixture } from './app-test-fixture.js';

function sharedConceptFixture() {
  const store = createStore(createProject('Clipboard common concept')), run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Source' }), { viewId: emptyViewId } = run({ type: 'createView', name: 'Target' });
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent', name: 'Общий <script> текст',
    documentation: 'Exact notes\r\n🙂 е\u0301', properties: [{ key: 'empty', value: '' }, { key: 'literal', value: '<img> & 日本語' }],
    bounds: { x: -120.1, y: -60.2, width: 130, height: 60 } });
  const b = run({ type: 'addOccurrence', viewId, concept: { kind: 'element', id: a.elementId }, bounds: { x: 100.4, y: 80.8, width: 150, height: 70 } });
  const relation = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association',
    source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: b.occurrenceId }, label: 'Общая связь',
    routePoints: [{ kind: 'bend', point: { x: 50, y: 0 } }], labelPosition: { x: 50, y: 30 } });
  return { state: store.snapshot, viewId, emptyViewId, a, b, relation };
}

async function ready(t, data = richLifecycleFixture()) {
  const h = await setup(t);
  await h.load(serializeProjectFile(data.state), 'fragment-fixture.arkita');
  const activate = id => h.$('views').querySelector(`[data-view-id="${id}"]`).click();
  activate(data.viewId);
  const group = (id, kind = 'occurrence') => h.$('canvas').querySelector(`[data-kind="${kind}"][data-id="${id}"]`);
  const key = (target, key, options = {}) => {
    const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  };
  const select = () => { key(group(data.a.occurrenceId), 'Enter'); key(group(data.b.occurrenceId), 'Enter', { shiftKey: true }); };
  const menu = id => {
    const button = h.document.querySelector(`[data-command="${id}"]`), menu = button.closest('.app-menu');
    menu.open = true; menu.dispatchEvent(new h.window.Event('toggle'));
    button.click(); return button;
  };
  const selected = (kind = 'occurrence') => [...h.$('canvas').querySelectorAll(`.selected[data-kind="${kind}"]`)].map(item => item.dataset.id);
  return { h, data, activate, group, key, select, menu, selected };
}

test('actual Edit menu copies without mutation, reuses concepts in another view and gives each paste one Undo', async t => {
  const { h, data, activate, select, menu, selected } = await ready(t), beforeBytes = await h.download();
  for (const id of ['fragment-copy', 'fragment-paste-reuse', 'fragment-paste-clone']) assert.equal(h.$(id).disabled, true);
  select(); assert.equal(h.$('fragment-copy').disabled, false);
  const copy = menu('fragment-copy');
  assert.equal(copy.closest('.app-menu').open, false); assert.match(h.$('status').textContent, /2 фигур, 1 внутренних связей/);
  assert.equal(h.$('undo').disabled, true); assert.equal(h.$('file-state').dataset.dirty, 'false');
  activate(data.emptyViewId);
  assert.equal(h.$('fragment-copy').disabled, true); assert.equal(h.$('fragment-paste-reuse').disabled, false); assert.equal(h.$('fragment-paste-clone').disabled, false);
  menu('fragment-paste-reuse');
  assert.equal(selected().length, 2); assert.equal(selected('connection').length, 1);
  assert.ok(h.document.activeElement.matches('#canvas .node')); assert.match(h.$('history-state').textContent, /1 действий/);
  assert.equal(h.$('file-state').dataset.dirty, 'true');
  menu('undo'); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
  assert.equal(h.$('canvas').querySelectorAll('.node,.junction,.connection').length, 0);
  menu('redo'); assert.equal(h.$('file-state').dataset.dirty, 'true');
  const afterBytes = await h.download(), after = deserializeProjectFile(afterBytes), before = deserializeProjectFile(beforeBytes);
  assert.deepEqual(after.elements, before.elements); assert.deepEqual(after.junctions, before.junctions); assert.deepEqual(after.relationships, before.relationships);
  assert.deepEqual(after.views.filter(item => item.view.id !== data.emptyViewId), before.views.filter(item => item.view.id !== data.emptyViewId));
  const target = after.views.find(item => item.view.id === data.emptyViewId), source = before.views.find(item => item.view.id === data.viewId);
  assert.equal(target.occurrences.length, 2); assert.equal(target.connections.length, 1);
  assert.deepEqual(new Set(target.occurrences.map(item => item.concept.id)), new Set([data.a.elementId, data.b.elementId]));
  assert.ok(target.occurrences.every(item => !source.occurrences.some(original => original.id === item.id)));
  const connection = target.connections[0]; assert.equal(connection.relationshipId, data.relation.relationshipId); assert.notEqual(connection.id, data.relation.connectionId);
  assert.ok(target.occurrences.some(item => item.id === connection.source.id)); assert.ok(target.occurrences.some(item => item.id === connection.target.id));
  const points = [...target.occurrences.map(item => item.bounds), ...connection.routePoints.map(item => item.point), connection.labelPosition];
  assert.equal(Math.min(...points.map(point => point.x)), 40); assert.equal(Math.min(...points.map(point => point.y)), 40);
  menu('undo'); assert.deepEqual(await h.download(), beforeBytes); menu('redo'); assert.deepEqual(await h.download(), afterBytes);
});

test('canvas Ctrl/Cmd shortcuts use physical keys, Shift clones one common concept and repeat pastes offset from the viewport', async t => {
  const { h, data, activate, key, select, selected } = await ready(t, sharedConceptFixture()), canvas = h.$('canvas');
  select(); canvas.focus();
  assert.equal(key(canvas, 'с', { code: 'KeyC', ctrlKey: true }).defaultPrevented, true);
  activate(data.emptyViewId); canvas.setAttribute('viewBox', '-300.5,-200.2,450,320'); canvas.focus();
  assert.equal(key(canvas, 'м', { code: 'KeyV', metaKey: true }).defaultPrevented, true);
  const reusedIds = selected(); assert.equal(reusedIds.length, 2);
  assert.equal(key(h.document.activeElement, 'М', { code: 'KeyV', ctrlKey: true, shiftKey: true }).defaultPrevented, true);
  const clonedIds = selected(); assert.equal(clonedIds.length, 2);
  assert.equal(key(h.document.activeElement, 'v', { code: 'KeyV', ctrlKey: true }).defaultPrevented, true);
  const repeatedIds = selected(); assert.equal(repeatedIds.length, 2); assert.equal(selected('connection').length, 1);
  assert.match(h.$('history-state').textContent, /3 действий/); assert.equal(h.$('file-state').dataset.dirty, 'true');
  const state = deserializeProjectFile(await h.download()), target = state.views.find(item => item.view.id === data.emptyViewId);
  assert.equal(state.elements.length, 2); assert.equal(state.relationships.length, 2); assert.equal(target.occurrences.length, 6); assert.equal(target.connections.length, 3);
  const batches = [reusedIds, clonedIds, repeatedIds].map(ids => target.occurrences.filter(item => ids.includes(item.id)));
  assert.equal(new Set(batches.flat().map(item => item.id)).size, 6);
  for (const index of [0, 2]) assert.ok(batches[index].every(item => item.concept.id === data.a.elementId));
  const clone = state.elements.find(item => item.id !== data.a.elementId), original = state.elements.find(item => item.id === data.a.elementId);
  assert.ok(batches[1].every(item => item.concept.id === clone.id));
  assert.deepEqual({ ...clone, id: original.id }, original);
  const clonedConnection = target.connections.find(item => clonedIds.includes(item.source.id));
  assert.ok(clonedIds.includes(clonedConnection.target.id)); assert.notEqual(clonedConnection.relationshipId, data.relation.relationshipId);
  const clonedRelationship = state.relationships.find(item => item.id === clonedConnection.relationshipId);
  assert.deepEqual(clonedRelationship.source, { kind: 'element', id: clone.id }); assert.deepEqual(clonedRelationship.target, { kind: 'element', id: clone.id });
  for (const [index, batch] of batches.entries()) {
    const first = batch.find(item => item.bounds.width === 130);
    assert.equal(first.bounds.x, [-260.5, -236.5, -212.5][index]); assert.equal(first.bounds.y, [-160.2, -136.2, -112.2][index]);
  }
  assert.equal(h.$('canvas').querySelector('script,img'), null);
});

test('actual menu and keyboard guards preserve inline drafts, text selection, search text and redo until paste commits', async t => {
  const { h, data, group, key, select, menu } = await ready(t), before = await h.download();
  select(); menu('fragment-copy'); key(h.$('canvas'), 'ArrowRight'); h.$('undo').click();
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('file-state').dataset.dirty, 'false');
  group(data.a.occurrenceId).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true }));
  const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = 'Unfinished exact draft'; input.setSelectionRange(3, 8);
  for (const id of ['fragment-copy', 'fragment-paste-reuse', 'fragment-paste-clone']) {
    for (const button of [h.$(id), h.document.querySelector(`[data-command="${id}"]`)]) {
      assert.equal(h.pointer(button, 'pointerdown').defaultPrevented, true); button.click();
      assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(h.document.activeElement, input);
      assert.equal(input.value, 'Unfinished exact draft'); assert.equal(input.selectionStart, 3); assert.equal(input.selectionEnd, 8);
    }
  }
  for (const letter of ['c', 'v']) assert.equal(key(input, letter, { code: `Key${letter.toUpperCase()}`, ctrlKey: true }).defaultPrevented, false);
  assert.equal(key(h.$('canvas'), 'v', { code: 'KeyV', ctrlKey: true }).defaultPrevented, true);
  assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, false); assert.equal(input.value, 'Unfinished exact draft');
  key(input, 'Escape'); assert.equal(h.document.querySelector('.inline-editor'), null);
  const search = h.$('model-search'); search.value = 'Shared'; search.dispatchEvent(new h.window.Event('input', { bubbles: true })); search.focus(); search.setSelectionRange(1, 4);
  for (const letter of ['c', 'v']) assert.equal(key(search, letter, { code: `Key${letter.toUpperCase()}`, metaKey: true }).defaultPrevented, false);
  const result = h.$('model-search-results').querySelector('button'); assert.ok(result);
  assert.equal(key(result, 'v', { code: 'KeyV', ctrlKey: true }).defaultPrevented, false);
  assert.equal(search.value, 'Shared'); assert.equal(search.selectionStart, 1); assert.equal(search.selectionEnd, 4);
  assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, false);
  menu('fragment-paste-reuse');
  assert.equal(search.value, 'Shared'); assert.equal(h.$('canvas').querySelectorAll('.node').length, 4);
  assert.match(h.$('history-state').textContent, /1 действий/); assert.equal(h.$('redo').disabled, true); assert.equal(h.$('file-state').dataset.dirty, 'true');
  h.$('undo').click(); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), before);
});

test('opening the same project again clears implicit reuse and offers an explicit portable clone preview', async t => {
  const { h, data, activate, key, select, menu } = await ready(t), before = await h.download();
  select(); menu('fragment-copy'); activate(data.emptyViewId); assert.equal(h.$('fragment-paste-reuse').disabled, false);
  await h.load(before, 'same-project.arkita'); activate(data.viewId);
  for (const id of ['fragment-copy', 'fragment-paste-reuse']) {
    assert.equal(h.$(id).disabled, true); assert.equal(menu(id).disabled, true);
  }
  assert.equal(h.$('fragment-paste-clone').disabled,false);
  h.$('canvas').focus(); assert.equal(key(h.$('canvas'), 'v', { code: 'KeyV', ctrlKey: true }).defaultPrevented, true);
  assert.equal(h.$('fragment-dialog').open,true); h.$('fragment-cancel').click(); assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true);
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), before);
});

test('a stale copied source is rejected through perform without changing bytes, selection, dirty or either history', async t => {
  const { h, data, group, key, select, menu, selected } = await ready(t);
  select(); menu('fragment-copy'); group(data.a.occurrenceId).dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true }));
  const input = h.document.querySelector('.inline-editor input'); input.value = 'Changed source'; key(input, 'Enter');
  key(h.$('canvas'), 'ArrowRight'); h.$('undo').click();
  const before = await h.download(), selection = selected(); assert.match(h.$('history-state').textContent, /1 действий/); assert.equal(h.$('redo').disabled, false);
  menu('fragment-paste-clone');
  assert.match(h.$('status').textContent, /^Не выполнено:.*(изменён|заново)/); assert.deepEqual(selected(), selection);
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.match(h.$('history-state').textContent, /1 действий/); assert.equal(h.$('redo').disabled, false);
  assert.deepEqual(await h.download(), before);
  h.$('undo').click(); menu('fragment-paste-clone');
  assert.match(h.$('history-state').textContent, /1 действий/); assert.equal(h.$('redo').disabled, true); assert.equal(h.$('canvas').querySelectorAll('.node').length, 4);
});

test('a redraw error after the app commits paste still returns the result and keeps exactly one recoverable Undo', async t => {
  const { h, select, menu } = await ready(t), before = await h.download(); select(); menu('fragment-copy');
  const canvas = h.$('canvas'), replace = canvas.replaceChildren;
  canvas.replaceChildren = function () { this.replaceChildren = replace; throw new Error('Simulated post-commit redraw failure'); };
  menu('fragment-paste-reuse');
  assert.match(h.$('status').textContent, /^Изменение уже сохранено/); assert.doesNotMatch(h.$('status').textContent, /^Не выполнено/);
  assert.equal(canvas.querySelectorAll('.node').length, 4); assert.equal(canvas.querySelectorAll('.selected[data-kind="occurrence"]').length, 2);
  assert.match(h.$('history-state').textContent, /1 действий/); assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.equal(h.$('undo').disabled, false);
  h.$('undo').click(); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), before);
});
