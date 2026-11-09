import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore, LIMITS } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installMultiplicityEditor } from '../src/multiplicity-editor.js';

function fixture(values = {}) {
  const store = createStore(createProject('Synthetic multiplicity editing'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'First' });
  const source = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Source', bounds: { x: 0, y: 0, width: 100, height: 100 } });
  const target = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Target', bounds: { x: 300, y: 0, width: 100, height: 100 } });
  run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Flow',
    source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId }, label: '<img src=x> & raw relation' });
  run({ type: 'duplicateView', viewId, name: 'Shared second view' });
  const state = store.snapshot; Object.assign(state.relationships[0], values);
  return createStore(state);
}

function setup(t, values = {}, options = {}) {
  const fields = ['source', 'target'].map(end => `<section><textarea id="multiplicity-${end}-value" maxlength="128"></textarea>
    <p id="multiplicity-${end}-presence"></p><p id="multiplicity-${end}-diagnostic"></p>
    <button type="button" id="multiplicity-${end}-set">Задать</button><button type="button" id="multiplicity-${end}-remove">Удалить</button></section>`).join('');
  const dom = new JSDOM(`<!doctype html><dialog id="multiplicity-dialog"><form id="multiplicity-form">
    <p id="multiplicity-reference"></p>${fields}<p id="multiplicity-error" role="alert"></p>
    <button type="submit" id="multiplicity-apply">Применить</button></form></dialog>`, { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id);
  const store = fixture(values), session = createProjectSession(store), reports = [], executions = [], activeAtRender = [];
  const adaptedStore = Object.create(store);
  let editor, renders = 0, failRender = false, failStatus = false, failClose = false, failOpen = false, blocked = false;
  let executeHook = null, closeHook = null;
  Object.defineProperty(adaptedStore, 'execute', { value(command, revision) {
    executions.push({ command: structuredClone(command), revision, currentRevision: store.revision });
    if (executeHook) executeHook();
    return store.execute(command, revision);
  } });
  const model = createController(adaptedStore), relationshipId = store.snapshot.relationships[0].id;
  const dialog = $('multiplicity-dialog');
  const event = (target, type) => target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  dialog.close = () => {
    if (failClose) throw Error('Synthetic close failure');
    dialog.removeAttribute('open'); if (closeHook) closeHook(); event(dialog, 'close');
  };
  editor = installMultiplicityEditor({ document, model, blocked: () => blocked,
    openDialog(id) { assert.equal(id, 'multiplicity-dialog'); if (failOpen) throw Error('Synthetic open failure'); dialog.setAttribute('open', ''); },
    render() { renders++; activeAtRender.push(editor.active); if (failRender) throw Error('Synthetic render failure'); },
    status(message) { reports.push(message); if (failStatus) throw Error('Synthetic status failure'); }, ...options });
  const submit = () => event($('multiplicity-form'), 'submit');
  const value = (end, raw, sendEvent = true) => { $(`multiplicity-${end}-value`).value = raw; if (sendEvent) event($(`multiplicity-${end}-value`), 'input'); };
  const set = end => $(`multiplicity-${end}-set`).click();
  const remove = end => $(`multiplicity-${end}-remove`).click();
  const capture = () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty });
  return { window, document, $, store, model, session, editor, relationshipId, reports, executions, activeAtRender, event,
    submit, value, set, remove, capture, dialog, open: () => editor.open(relationshipId),
    get relationship() { return store.snapshot.relationships[0]; }, get renders() { return renders; },
    set failRender(value) { failRender = value; }, set failStatus(value) { failStatus = value; },
    set failClose(value) { failClose = value; }, set failOpen(value) { failOpen = value; },
    set blocked(value) { blocked = value; }, set executeHook(value) { executeHook = value; }, set closeHook(value) { closeHook = value; } };
}

test('opening is read-only, displays shared reference safely and separates syntax from normative UNKNOWN', t => {
  const h = setup(t, { sourceMultiplicity: '*', targetMultiplicity: '3..2' }), before = h.capture();
  assert.equal(h.editor.active, false); assert.equal(h.editor.generation, 0);
  assert.equal(h.open(), true); assert.equal(h.editor.active, true); assert.ok(h.editor.generation > 0);
  assert.equal(h.$('multiplicity-source-value').value, '*'); assert.equal(h.$('multiplicity-target-value').value, '3..2');
  assert.equal(h.$('multiplicity-source-value').maxLength, LIMITS.multiplicity);
  assert.match(h.$('multiplicity-reference').textContent, /<img src=x>/);
  assert.match(h.$('multiplicity-reference').textContent, /всех.*UNKNOWN/);
  assert.equal(h.document.querySelector('img'), null);
  assert.equal(h.$('multiplicity-source-diagnostic').dataset.status, 'CONFIRMED_SYNTAX');
  assert.equal(h.$('multiplicity-target-diagnostic').dataset.status, 'INVALID_SYNTAX');
  assert.match(h.$('multiplicity-target-diagnostic').textContent, /можно сохранить/);
  assert.doesNotMatch(h.$('multiplicity-source-diagnostic').textContent, /UNKNOWN/);
  assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0);
});

test('absent stays absent despite text; Set creates present empty, and both ends commit atomically', t => {
  const h = setup(t), before = h.store.snapshot;
  h.open(); assert.equal(h.$('multiplicity-source-value').disabled, true);
  assert.match(h.$('multiplicity-source-presence').textContent, /отсутствует/);
  h.value('source', 'programmatic text without Set'); h.submit();
  assert.deepEqual(h.store.snapshot, before); assert.equal(h.executions.length, 0);
  h.open(); h.set('source'); h.set('target'); h.value('target', '*');
  assert.match(h.$('multiplicity-source-presence').textContent, /пустая строка/);
  assert.equal(h.$('multiplicity-source-value').disabled, false);
  const revision = h.store.revision; h.submit(); h.submit();
  assert.equal(h.relationship.sourceMultiplicity, ''); assert.equal(h.relationship.targetMultiplicity, '*');
  assert.equal(h.executions.length, 1);
  assert.deepEqual(h.executions[0], { command: { type: 'updateRelationshipMultiplicity', relationshipId: h.relationshipId,
    sourceMultiplicity: '', targetMultiplicity: '*' }, revision, currentRevision: revision });
  assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.renders, 1);
  assert.deepEqual(h.store.snapshot.views, before.views); assert.deepEqual(h.store.snapshot.elements, before.elements);
  assert.deepEqual(h.activeAtRender, [false]); assert.equal(h.editor.active, false); assert.equal(h.dialog.open, false);
});

test('clearing present text stays present empty; Remove explicitly deletes only its chosen end', t => {
  const h = setup(t, { sourceMultiplicity: '*', targetMultiplicity: '1..*' });
  h.open(); h.value('source', ''); h.submit();
  assert.equal(Object.hasOwn(h.relationship, 'sourceMultiplicity'), true); assert.equal(h.relationship.sourceMultiplicity, '');
  assert.deepEqual(h.executions[0].command, { type: 'updateRelationshipMultiplicity', relationshipId: h.relationshipId, sourceMultiplicity: '' });
  h.open(); h.remove('source'); h.submit();
  assert.equal(Object.hasOwn(h.relationship, 'sourceMultiplicity'), false); assert.equal(h.relationship.targetMultiplicity, '1..*');
  assert.deepEqual(h.executions[1].command, { type: 'updateRelationshipMultiplicity', relationshipId: h.relationshipId, sourceMultiplicity: null });
  h.open(); h.remove('target'); h.submit(); assert.equal(Object.hasOwn(h.relationship, 'targetMultiplicity'), false);
});

test('Set after Remove deliberately creates empty instead of restoring removed draft text', t => {
  const h = setup(t, { sourceMultiplicity: '1' }); h.open(); h.value('source', '2..3');
  h.remove('source'); h.set('source'); assert.equal(h.$('multiplicity-source-value').value, '');
  h.submit(); assert.equal(h.relationship.sourceMultiplicity, '');
});

test('each end supports the full independent absence, empty and star transition matrix', t => {
  for (const end of ['source', 'target']) for (const initial of [undefined, '', '*']) for (const desired of [undefined, '', '*']) {
    const other = end === 'source' ? 'target' : 'source';
    const values = { [`${other}Multiplicity`]: 'untouched\r\ntext', ...(initial === undefined ? {} : { [`${end}Multiplicity`]: initial }) };
    const h = setup(t, values); h.open();
    if (desired === undefined) h.remove(end); else { h.set(end); h.value(end, desired); }
    h.submit();
    assert.equal(Object.hasOwn(h.relationship, `${end}Multiplicity`), desired !== undefined);
    assert.equal(h.relationship[`${end}Multiplicity`], desired); assert.equal(h.relationship[`${other}Multiplicity`], values[`${other}Multiplicity`]);
    assert.equal(h.executions.length, initial === desired ? 0 : 1);
  }
});

test('native textarea normalization never changes untouched or reverted raw CR and CRLF', t => {
  for (const raw of ['1\r2', '1\r\n2', '\r\n\r\n', 'a\r\nb\rc\n\t']) {
    const h = setup(t, { sourceMultiplicity: raw, targetMultiplicity: raw }), before = h.capture();
    h.open(); const initialDOM = h.$('multiplicity-source-value').value;
    assert.equal(initialDOM, raw.replace(/\r\n?/g, '\n')); assert.notEqual(initialDOM, raw);
    h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0);
    h.open(); h.value('source', 'temporary edit'); h.value('source', initialDOM); h.submit();
    assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0);
    h.open(); h.value('target', '*'); h.submit();
    assert.equal(h.relationship.sourceMultiplicity, raw); assert.equal(h.relationship.targetMultiplicity, '*');
    assert.deepEqual(h.executions[0].command, { type: 'updateRelationshipMultiplicity', relationshipId: h.relationshipId, targetMultiplicity: '*' });
  }
});

test('actual textarea edits retain their native LF value and safe HTML, without trimming', t => {
  const h = setup(t, { sourceMultiplicity: 'old\r\ntext' }); h.open(); h.set('target');
  const raw = ' <img onerror="synthetic()">\n\t 😀 ';
  h.value('source', 'new\r\ntext'); h.value('target', raw);
  assert.equal(h.document.querySelector('img'), null); h.submit();
  assert.equal(h.relationship.sourceMultiplicity, 'new\ntext'); assert.equal(h.relationship.targetMultiplicity, raw);
  assert.equal(h.document.querySelector('img'), null);
});

test('advisory INVALID_SYNTAX and UNVERIFIED values are savable without invented normalization', t => {
  for (const raw of ['3..2', '2..2', '-1', '1.5', '0', '01', ' 1 ', '+1', '１２', '5..*', 'unknown']) {
    const h = setup(t); h.open(); h.set('source'); h.value('source', raw);
    assert.match(h.$('multiplicity-source-diagnostic').textContent, /можно сохранить/);
    assert.equal(h.$('multiplicity-apply').disabled, false); h.submit();
    assert.equal(h.relationship.sourceMultiplicity, raw); assert.equal(h.executions.length, 1);
    assert.match(h.reports.at(-1), /UNKNOWN/);
  }
});

test('128 UTF-16 units including surrogate pairs are accepted, while programmatic overflow blocks both ends', t => {
  for (const raw of ['x'.repeat(128), '😀'.repeat(64), '\r\n'.repeat(64)]) {
    const h = setup(t, { sourceMultiplicity: raw }), before = h.capture(); h.open(); h.submit();
    assert.deepEqual(h.capture(), before); assert.equal(h.relationship.sourceMultiplicity, raw);
  }
  for (const tooLong of ['x'.repeat(129), '😀'.repeat(64) + 'x']) {
    const h = setup(t), before = h.capture(); h.open(); h.set('source'); h.set('target');
    h.value('source', '*'); h.value('target', tooLong, false); h.submit();
    assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0); assert.equal(h.editor.active, true);
    assert.match(h.$('multiplicity-error').textContent, /128/); assert.match(h.$('multiplicity-target-diagnostic').textContent, /129/);
    assert.equal(h.$('multiplicity-apply').disabled, true);
    h.value('target', '😀'.repeat(64)); assert.equal(h.$('multiplicity-apply').disabled, false); h.submit();
    assert.equal(h.relationship.sourceMultiplicity, '*'); assert.equal(h.relationship.targetMultiplicity, '😀'.repeat(64));
  }
});

test('one atomic edit supports exact undo and redo across every shared connection', t => {
  const h = setup(t, { sourceMultiplicity: '\r\n', targetMultiplicity: '*' }), initial = h.capture();
  h.open(); h.remove('source'); h.value('target', '0..*'); h.submit(); const changed = h.capture();
  assert.equal(h.session.dirty, true); assert.equal(changed.history.undo, 1);
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), initial.files); assert.equal(h.session.dirty, false);
  assert.equal(h.relationship.sourceMultiplicity, '\r\n'); assert.equal(h.relationship.targetMultiplicity, '*');
  h.model.redo(); assert.deepEqual(h.store.exportFiles(), changed.files); assert.equal(h.session.dirty, true);
});

test('no-op editing, reversible presence changes and cancellation preserve both history stacks and dirty identity', t => {
  const h = setup(t, { sourceMultiplicity: '', targetMultiplicity: '*' });
  h.model.execute({ type: 'renameProject', name: 'kept' }); h.model.execute({ type: 'renameProject', name: 'future' }); h.model.undo();
  const before = h.capture(), executions = h.executions.length; assert.deepEqual(before.history, { undo: 1, redo: 1 });
  h.open(); h.submit(); assert.deepEqual(h.capture(), before);
  h.open(); h.remove('source'); h.set('source'); h.value('target', 'changed'); h.value('target', '*'); h.submit();
  assert.deepEqual(h.capture(), before);
  h.open(); h.value('target', 'cancelled'); const generation = h.editor.generation;
  assert.equal(h.editor.cancel(), true); assert.ok(h.editor.generation > generation); h.submit();
  assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, executions);
  h.model.redo(); assert.equal(h.store.snapshot.project.name, 'future');
});

test('native close, Escape cancellation and late submit never commit abandoned text', t => {
  for (const cancel of [h => h.dialog.close(), h => h.event(h.dialog, 'cancel'), h => h.editor.cancel()]) {
    const h = setup(t, { sourceMultiplicity: '1' }), before = h.capture(); h.open(); h.value('source', '*'); cancel(h);
    h.submit(); h.submit(); assert.equal(h.editor.active, false); assert.equal(h.dialog.open, false);
    assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0);
  }
  const h = setup(t, { sourceMultiplicity: '1' }), before = h.capture(); h.open(); h.value('source', '*');
  h.dialog.removeAttribute('open'); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false);
});

test('a delayed close event after reopening does not cancel the new request', t => {
  const h = setup(t); h.open(); h.editor.cancel(); const generation = h.editor.generation;
  h.open(); assert.ok(h.editor.generation > generation); h.event(h.dialog, 'close');
  assert.equal(h.editor.active, true); h.set('target'); h.value('target', '*'); h.submit();
  assert.equal(h.relationship.targetMultiplicity, '*'); assert.equal(h.executions.length, 1);
});

test('stale revision, model replacement and view switches reject Apply without changing either end', t => {
  for (const stale of [
    h => h.model.execute({ type: 'renameProject', name: 'newer' }),
    h => {
      const previous = h.model.viewId;
      h.model.switchView(h.store.snapshot.views.find(entry => entry.view.id !== previous).view.id);
      assert.notEqual(h.model.viewId, previous);
    },
    h => { h.model.store = createStore(h.store.snapshot); },
  ]) {
    const h = setup(t, { sourceMultiplicity: '1', targetMultiplicity: '*' }); h.open();
    h.value('source', '2'); h.remove('target'); stale(h); const before = h.capture(), count = h.executions.length;
    h.submit(); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, count);
    assert.equal(h.editor.active, false); assert.match(h.$('multiplicity-error').textContent, /изменились/);
    assert.equal(h.$('multiplicity-apply').disabled, true);
  }
});

test('blocked, duplicate and missing-target opens do not replace an active draft or change generation', t => {
  const h = setup(t); h.blocked = true; assert.equal(h.open(), false); assert.equal(h.editor.generation, 0);
  h.blocked = false; assert.equal(h.editor.open('missing'), false); assert.equal(h.editor.generation, 0);
  assert.equal(h.open(), true); h.set('source'); h.value('source', '*'); const generation = h.editor.generation;
  assert.equal(h.open(), false); assert.equal(h.editor.open('missing'), false); assert.equal(h.editor.generation, generation);
  assert.equal(h.$('multiplicity-source-value').value, '*'); h.submit(); assert.equal(h.relationship.sourceMultiplicity, '*');
});

test('failed modal opening leaves no accepted pending request and can be retried', t => {
  const h = setup(t), before = h.capture(); h.failOpen = true;
  assert.equal(h.open(), false); assert.equal(h.editor.active, false); h.submit(); assert.deepEqual(h.capture(), before);
  assert.match(h.reports.at(-1), /Не удалось открыть/); h.failOpen = false;
  assert.equal(h.open(), true); h.editor.cancel(); assert.deepEqual(h.capture(), before);
});

test('execution uses the captured revision and clears pending before a reentrant duplicate submission', t => {
  const h = setup(t); h.open(); h.set('source'); h.value('source', '*');
  const revision = h.store.revision; h.executeHook = () => { assert.equal(h.editor.active, false); h.submit(); };
  h.submit(); assert.equal(h.executions.length, 1); assert.equal(h.executions[0].revision, revision);
  assert.equal(h.store.revision, revision + 1); assert.equal(h.relationship.sourceMultiplicity, '*');
});

test('execution failure is noncommitting, ends the request and prevents late duplicate retries', t => {
  const h = setup(t), before = h.capture(); h.open(); h.set('source'); h.value('source', '*');
  h.executeHook = () => { throw Error('Synthetic command rejection'); }; h.submit(); h.submit();
  assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 1); assert.equal(h.editor.active, false);
  assert.match(h.$('multiplicity-error').textContent, /Кратность не изменена.*Synthetic command rejection/);
});

test('render, close and status failures after commit never misreport rollback or repeat the command', t => {
  for (const failure of ['failRender', 'failClose', 'failStatus']) {
    const h = setup(t); h.open(); h.set('source'); h.value('source', '*'); h[failure] = true;
    h.submit(); h.submit(); assert.equal(h.relationship.sourceMultiplicity, '*'); assert.equal(h.executions.length, 1);
    assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.editor.active, false);
    assert.match(h.reports.at(-1), /[Кк]ратность.*сохранена/);
    assert.doesNotMatch(h.reports.at(-1), /не изменена|не сохранена/);
    if (failure !== 'failStatus') assert.match(h.reports.at(-1), /интерфейс не обновлён/);
  }
});

test('cancel clears pending even when native close throws', t => {
  const h = setup(t), before = h.capture(); h.open(); h.set('source'); h.value('source', '*');
  h.failClose = true; assert.equal(h.editor.cancel(), true); h.submit();
  assert.equal(h.editor.active, false); assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0);
  assert.match(h.reports.at(-1), /Правка отменена/);
});
