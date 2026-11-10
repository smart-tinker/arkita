import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createStore, LIMITS, metadataRecord } from '../../schemka-model-core/src/index.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installObjectProperties } from '../src/object-properties.js';

const rowsOf = value => Array.isArray(value) ? value : Object.entries(value).map(([key, value]) => ({ key, value }));

function setup(t, { kind = 'element', properties = { owner: 'Team', note: ' raw\r\nline\rtext ' }, noViews = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><aside id="inspector"></aside></body>', { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { document } = dom.window, $ = id => document.getElementById(id), state = customizationProject();
  const concept = { kind, id: (kind === 'project' ? state.project : kind === 'view' ? state.views[0].view : state[`${kind}s`][0]).id }; metadataRecord(state, concept).properties = rowsOf(properties);
  if (noViews) state.views = [];
  const store = createStore(state), adapted = Object.create(store), session = createProjectSession(store), flags = {}, reports = [], commands = [];
  let hook = null, renders = 0, editor;
  Object.defineProperty(adapted, 'execute', { value(command, revision) { commands.push(structuredClone(command)); hook?.(); return store.execute(command, revision); } });
  const model = createController(adapted); model.select(['project', 'view'].includes(kind) ? null : concept);
  const event = (target, type) => target.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
  editor = installObjectProperties({ document, model, blocked: () => flags.blocked,
    openDialog(id) { if (flags.open) throw Error('synthetic open'); if (flags.cancelOnOpen) editor.cancel(); $(id).setAttribute('open', ''); },
    render() { assert.equal(editor.active, false); renders++; if (flags.render) throw Error('synthetic render'); },
    status(text) { reports.push(text); if (flags.status) throw Error('synthetic status'); } });
  for (const dialog of document.querySelectorAll('dialog')) dialog.close = () => {
    if (flags.close) throw Error('synthetic close'); dialog.removeAttribute('open'); event(dialog, 'close');
  };
  const occurrence = model.view?.occurrences.find(item => item.concept.kind === kind && item.concept.id === concept.id);
  editor.appendInspector($('inspector'), { concept, occurrence });
  return { document, $, store, model, session, editor, concept, occurrence, flags, reports, commands, event,
    openProperties: () => $('object-properties-edit').click(), openSize: () => $('occurrence-size-edit').click(),
    submit: (type = 'object-properties') => event($(`${type}-form`), 'submit'),
    fields: () => [...$('object-properties-fields').querySelectorAll('.property-row')].map(row => ({ name: row.querySelector('[name=name]'), value: row.querySelector('[name=value]'), remove: row.querySelector('.property-remove') })),
    input(input, value) { input.value = value; event(input, 'input'); },
    capture: () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty }),
    get item() { return metadataRecord(store.snapshot, concept); }, get renders() { return renders; }, set hook(value) { hook = value; } };
}

test('properties inspector and dialogs display inert accessible text, with property controls for every shared concept kind', t => {
  for (const kind of ['project', 'view', 'element', 'junction', 'relationship']) {
    const h = setup(t, { kind, properties: { '<img src=x>': '<svg onload=bad()> &' } });
    assert.match(h.$('inspector').textContent, /<img src=x>/); assert.equal(h.document.querySelector('img,svg'), null);
    h.openProperties(); assert.equal(h.editor.active, true);
    assert.equal(h.$('object-properties-dialog').getAttribute('aria-labelledby'), 'object-properties-title');
    assert.equal(h.$('object-properties-error').getAttribute('role'), 'alert');
    assert.equal(h.fields()[0].name.value, '<img src=x>'); assert.equal(h.fields()[0].value.value, '<svg onload=bad()> &');
    assert.equal(h.document.activeElement, h.fields()[0].name);
    for (const input of [h.fields()[0].name, h.fields()[0].value]) { assert.ok(input.closest('label')); assert.equal(input.maxLength, LIMITS.string); }
    assert.equal(Boolean(h.$('occurrence-size-edit')), ['element', 'junction'].includes(kind));
  }
});

test('properties preserve untouched/reverted CRLF names and values, and unchanged/cancelled dialogs retain exact history', t => {
  const raw = { ' key\r\nraw ': ' value\r\nraw\r ', keep: 'unchanged' };
  for (const mode of ['unchanged', 'reverted', 'cancel', 'escape', 'close']) {
    const h = setup(t, { properties: raw }); h.store.execute({ type: 'renameProject', name: 'Future' }, 0); h.model.undo();
    const before = h.capture(); h.openProperties();
    if (mode === 'reverted') {
      const field = h.fields()[0], key = field.name.value, value = field.value.value;
      h.input(field.name, 'edited'); h.input(field.name, key); h.input(field.value, 'edited'); h.input(field.value, value);
    }
    if (mode === 'cancel') { h.input(h.fields()[0].value, 'discard'); h.$('object-properties-cancel').click(); }
    if (mode === 'escape') { h.input(h.fields()[0].value, 'discard'); h.event(h.$('object-properties-dialog'), 'cancel'); }
    if (mode === 'close') h.$('object-properties-dialog').close();
    h.submit(); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false);
  }
  const h = setup(t, { properties: raw }); h.openProperties(); h.input(h.fields()[1].value, 'changed'); h.submit();
  assert.deepEqual(h.item.properties, rowsOf({ ' key\r\nraw ': ' value\r\nraw\r ', keep: 'changed' }));
});

test('properties preserve existing empty and whitespace keys while rejecting a newly created blank key', t => {
  const h = setup(t, { properties: { '': 'empty key', ' \r\n ': 'whitespace key', owner: 'Team' } }), before = h.capture();
  h.openProperties(); h.input(h.fields()[2].value, 'Changed'); h.submit();
  assert.deepEqual(h.item.properties, rowsOf({ '': 'empty key', ' \r\n ': 'whitespace key', owner: 'Changed' }));
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files); h.model.redo();
  h.openProperties(); h.$('object-property-add').click(); const unchanged = h.capture(); h.submit();
  assert.deepEqual(h.capture(), unchanged); assert.equal(h.editor.active, true); assert.match(h.$('object-properties-error').textContent, /имя нового/);
});

test('property rows add, edit, rename and remove in one atomic command; clear-all and undo retain other metadata', t => {
  const h = setup(t), before = h.capture(); h.flags.cancelOnOpen = true; h.openProperties();
  const generation = h.editor.generation;
  h.input(h.fields()[0].name, 'team'); h.input(h.fields()[0].value, 'Architecture');
  h.$('object-property-add').click(); h.input(h.fields().at(-1).name, 'version'); h.input(h.fields().at(-1).value, '1');
  assert.ok(h.editor.generation > generation); h.fields()[1].remove.click(); h.submit(); h.submit();
  assert.deepEqual(h.item.properties, rowsOf({ team: 'Architecture', version: '1' }));
  assert.equal(h.commands.length, 1); assert.equal(h.renders, 1); assert.equal(h.session.dirty, true);
  const edited = h.capture(); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files);
  h.model.redo(); assert.deepEqual(h.store.exportFiles(), edited.files);
  h.openProperties(); for (const field of h.fields()) field.remove.click(); h.submit();
  assert.deepEqual(h.item.properties, []); h.model.undo(); assert.deepEqual(h.store.exportFiles(), edited.files);
});

test('property validation preserves invalid drafts and existing history; new blank and oversized names/values fail; existing rows stay exact', t => {
  for (const invalid of ['empty', 'long-name', 'long-value']) {
    const h = setup(t), before = h.capture(); h.openProperties();
    if (invalid === 'empty') h.input(h.fields()[0].name, ' \n ');
    if (invalid === 'long-name') h.input(h.fields()[0].name, 'x'.repeat(LIMITS.string + 1));
    if (invalid === 'long-value') h.input(h.fields()[0].value, 'x'.repeat(LIMITS.string + 1));
    h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, true); assert.ok(h.$('object-properties-error').textContent);
    h.input(h.fields()[0].name, 'valid'); h.input(h.fields()[0].value, 'valid'); h.submit(); assert.equal(h.editor.active, false);
  }
  const h = setup(t, { properties: Object.fromEntries(Array.from({ length: LIMITS.properties }, (_, i) => [String(i), 'value'])) });
  h.openProperties(); assert.equal(h.$('object-property-add').disabled, true); h.$('object-property-add').click(); assert.equal(h.fields().length, LIMITS.properties);
  h.fields()[0].remove.click(); assert.equal(h.$('object-property-add').disabled, false);
});

test('properties can edit an undrawn shared relationship and retain exact maximum-size strings', t => {
  const h = setup(t, { kind: 'relationship', noViews: true, properties: {} }), before = h.capture();
  h.openProperties(); assert.equal(h.fields().length, 0); h.$('object-property-add').click();
  h.input(h.fields()[0].name, 'owner'); h.input(h.fields()[0].value, 'x'.repeat(LIMITS.string)); h.submit();
  assert.equal(h.item.properties.find(row => row.key === 'owner').value.length, LIMITS.string); assert.equal(h.model.viewId, null);
  assert.deepEqual(h.model.selection, h.concept); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files);
});

test('resize edits one occurrence through history and rejects invalid sizes without discarding the draft', t => {
  for (const kind of ['element', 'junction']) {
    const h = setup(t, { kind }), before = h.capture(); h.openSize();
    assert.equal(h.$('occurrence-size-width').step, '0.1');
    h.input(h.$('occurrence-size-width'), '315.5'); h.input(h.$('occurrence-size-height'), '150'); h.submit('occurrence-size');
    assert.equal(h.commands.length, 1); assert.equal(h.commands[0].type,'applyProjectSnapshot');assert.equal(h.model.view.occurrences.find(item=>item.id===h.occurrence.id).bounds.width,315.5);assert.equal(h.model.view.occurrences.find(item=>item.id===h.occurrence.id).bounds.height,150);
    assert.equal(h.model.view.occurrences.find(item => item.id === h.occurrence.id).bounds.x, h.occurrence.bounds.x);
    const edited = h.capture(); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files); h.model.redo(); assert.deepEqual(h.store.exportFiles(), edited.files);
    const unchanged = h.capture(); h.openSize(); h.submit('occurrence-size'); assert.deepEqual(h.capture(), unchanged);
  }
  for (const invalid of ['', '0', '-1', '0.01', '1000000.1']) {
    const h = setup(t), before = h.capture(); h.openSize(); h.input(h.$('occurrence-size-width'), invalid); h.submit('occurrence-size');
    assert.equal(h.editor.active, true); assert.ok(h.$('occurrence-size-error').textContent); assert.deepEqual(h.capture(), before);
    h.$('occurrence-size-cancel').click(); h.submit('occurrence-size'); assert.deepEqual(h.capture(), before);
  }
});

test('both dialogs reject changed revision/view/selection/store and closed requests without overriding newer work', t => {
  for (const type of ['object-properties', 'occurrence-size']) for (const stale of ['revision', 'view', 'selection', 'store', 'load']) {
    const h = setup(t); if (type === 'object-properties') { h.openProperties(); h.input(h.fields()[0].value, 'stale'); }
    else { h.openSize(); h.input(h.$('occurrence-size-width'), '400'); }
    if (stale === 'revision') h.model.execute({ type: 'renameProject', name: 'Newer edit' });
    if (stale === 'view') h.model.switchView(h.store.snapshot.views[1].view.id);
    if (stale === 'selection') h.model.select(null);
    if (stale === 'store') h.model.store = createStore(h.store.snapshot);
    if (stale === 'load') h.store.load(h.store.exportFiles(), h.store.revision);
    const before = h.capture(); h.submit(type); h.submit(type);
    assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false); assert.match(h.$(`${type}-error`).textContent, /изменились/);
  }
});

test('opening guards, modal cancel/reopen and callback failures cannot duplicate an accepted property edit', t => {
  const blocked = setup(t), before = blocked.capture(); blocked.flags.blocked = true; blocked.openProperties(); assert.equal(blocked.editor.active, false);
  blocked.flags.blocked = false; blocked.flags.open = true; blocked.openProperties(); assert.equal(blocked.editor.active, false); assert.deepEqual(blocked.capture(), before);
  const reopened = setup(t); reopened.openProperties(); reopened.editor.cancel(); reopened.openProperties(); reopened.event(reopened.$('object-properties-dialog'), 'close'); assert.equal(reopened.editor.active, true);
  for (const failure of ['render', 'status', 'close', 'none']) {
    const h = setup(t); h.openProperties(); h.input(h.fields()[0].value, 'accepted'); h.flags[failure] = true;
    h.hook = () => { assert.equal(h.editor.active, false); h.submit(); };
    h.submit(); h.submit(); assert.equal(h.item.properties.find(row => row.key === 'owner').value, 'accepted'); assert.equal(h.commands.length, 1); assert.equal(h.editor.active, false);
    assert.match(h.reports.at(-1), /сохранен/);
  }
  const failedClose = setup(t), original = failedClose.capture(); failedClose.openSize(); failedClose.flags.close = true; failedClose.editor.cancel(); failedClose.submit('occurrence-size');
  assert.equal(failedClose.editor.active, false); assert.deepEqual(failedClose.capture(), original);
});


test('V4 repeated property keys and their explicit order survive modal edit, one Undo and Redo', t => {
  const initial = [{ key: 'team', value: 'first' }, { key: 'team', value: 'second' }, { key: '__proto__', value: '<inert>' }];
  const h = setup(t, { properties: initial }), before = h.capture(); h.openProperties();
  h.$('object-property-up-3').click(); h.submit();
  assert.deepEqual(h.item.properties, [initial[0], initial[2], initial[1]]);
  assert.equal(h.commands.length, 1); const after = h.capture();
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files);
  h.model.redo(); assert.deepEqual(h.store.exportFiles(), after.files);
  assert.equal(Object.getPrototypeOf({}).polluted, undefined);
});
