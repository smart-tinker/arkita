import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createStore } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { searchModel, planNameReplacement } from '../../schemka-model-core/src/model-search.js';
import { installAdvancedSearch } from '../src/advanced-search.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function setup(t, taskOverride) {
  const dom = new JSDOM('<!doctype html><body><section id="model-search-region"></section></body>', { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { document } = dom.window, $ = id => document.getElementById(id), state = conceptProject();
  state.elements[0].name = 'Сервер 2'; state.elements[1].name = 'Сервер 10';
  state.elements[0].properties = [{ key: 'owner', value: 'A' }, { key: 'owner', value: 'B' }, { key: 'keep', value: '<img src=x>' }];
  state.elements[1].properties = [{ key: 'owner', value: 'C' }];
  const store = createStore(state), model = createController(store), session = createProjectSession(store), opened = [], revealed = [], messages = [];
  const task = taskOverride || { run: async (state, options, replacement = null, owners) => replacement === null ? searchModel(state, options) : planNameReplacement(state, options, replacement, owners), cancel() {} };
  const ui = installAdvancedSearch({ document, model, task, openDialog(id) { $(id).setAttribute('open', ''); }, render() { ui.refresh(); }, status: text => messages.push(text), openOwner: owner => opened.push(owner), revealDrawing: ref => revealed.push(ref) });
  const dialog = $('advanced-search-dialog');
  dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new dom.window.Event('close')); };
  const input = (id, value) => { const el = $(id); el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const submit = () => { $('advanced-search-run').click(); return tick(); };
  ui.open(); await tick();
  return { dom, document, $, store, model, session, state, ui, dialog, input, submit, opened, revealed, messages,
    capture: () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty }) };
}

test('search/filter/preview/cancel never mutate files, history, redo or local dirty', async t => {
  const h = await setup(t); assert.equal(h.$('model-search-advanced').hidden, true); assert.equal(h.$('model-search-region').children.length, 0); h.store.execute({ type: 'renameProject', name: 'Future' }, 0); h.store.undo(h.store.revision); h.ui.refresh(); const before = h.capture();
  h.input('advanced-query', 'Сервер'); await h.submit(); assert.equal(h.$('advanced-search-results').children.length, 2);
  h.input('advanced-replacement', 'Host'); h.$('advanced-replace-all').click(); await tick();
  assert.match(h.$('advanced-search-preview').textContent, /Host 2/); assert.match(h.$('advanced-search-preview').textContent, new RegExp(h.state.elements[0].id));
  assert.deepEqual(h.capture(), before); h.$('advanced-search-discard').click(); assert.deepEqual(h.capture(), before);
  h.$('advanced-search-close').click(); assert.deepEqual(h.capture(), before);
});

test('confirmed replace is one command, literal safe text, stale previews and repeated Apply cannot overwrite', async t => {
  const h = await setup(t); h.input('advanced-query', 'Сервер'); await h.submit(); const before = h.capture();
  h.input('advanced-replacement', '<img src=x>'); h.$('advanced-replace-all').click(); await tick();
  assert.equal(h.document.querySelector('img'), null);
  h.$('advanced-search-apply').click(); h.$('advanced-search-apply').click(); await tick();
  assert.equal(h.store.history.undo, 1); assert.equal(h.session.dirty, true); assert.equal(h.store.snapshot.elements[0].name, '<img src=x> 2');
  h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files); h.ui.refresh(); await h.submit();
  h.$('advanced-replace-all').click(); await tick(); h.model.execute({ type: 'renameProject', name: 'Later' }); const newer = h.capture();
  h.$('advanced-search-apply').click(); assert.deepEqual(h.capture(), newer); assert.match(h.$('advanced-search-error').textContent, /изменилась/);
});

test('property preview scopes checked owners, counts duplicate rows, preserves individuals and requires collision choice', async t => {
  const h = await setup(t); h.input('advanced-query', 'Сервер'); await h.submit();
  assert.match(h.$('advanced-property-common').textContent, /значения различаются.*объектов 2, записей 3/);
  assert.equal(h.$('advanced-property-sort').disabled, true);
  const check = h.$('advanced-search-results').querySelector('input'); check.click(); h.input('advanced-property-scope', 'checked');
  h.input('advanced-property-key', 'owner'); h.input('advanced-property-new-key', 'keep'); h.$('advanced-property-rename').click();
  assert.match(h.$('advanced-search-preview').textContent, /Коллизии/); assert.equal(h.$('advanced-search-apply').disabled, true);
  h.input('advanced-property-collision', 'merge'); h.$('advanced-property-rename').click(); h.$('advanced-search-apply').click(); await tick();
  assert.deepEqual(h.store.snapshot.elements[0].properties, [{ key: 'keep', value: 'A' }, { key: 'keep', value: 'B' }, { key: 'keep', value: '<img src=x>' }]);
  assert.deepEqual(h.store.snapshot.elements[1].properties, [{ key: 'owner', value: 'C' }]);
  h.model.undo(); assert.deepEqual(h.store.snapshot.elements[0].properties, h.state.elements[0].properties);
});

test('query changes require refresh; invalid regex leaves usable dialog; current-view navigation identifies exact drawing', async t => {
  const h = await setup(t); h.input('advanced-query', 'Сервер'); h.input('advanced-property-key', 'owner');
  h.$('advanced-property-remove').click(); assert.match(h.$('advanced-search-error').textContent, /обновите поиск/);
  h.input('advanced-scope', 'view'); await h.submit(); h.$('advanced-search-next').click();
  assert.equal(h.revealed.length, 1); assert.equal(h.revealed[0].viewId, h.model.viewId); assert.equal(h.revealed[0].kind, 'occurrence');
  h.$('advanced-regex').click(); h.input('advanced-query', '['); await h.submit(); assert.match(h.$('advanced-search-error').textContent, /Некорректное/);
  assert.equal(h.dialog.open, true); assert.equal(h.store.history.undo, 0);
});

test('cancelled and stale asynchronous search results cannot reappear in another session', async t => {
  const pending = []; const task = { run: (...args) => new Promise(resolve => pending.push({ resolve, args })), cancel() {} };
  const h = await setup(t, task); h.$('advanced-search-stop').click(); pending[0].resolve(searchModel(h.state, {})); await tick();
  assert.equal(h.$('advanced-search-results').children.length, 0);
  h.$('advanced-search-run').click(); h.dialog.close(); pending[1].resolve(searchModel(h.state, {})); await tick(); assert.equal(h.dialog.open, false); assert.equal(h.$('advanced-search-results').children.length, 0);
  h.ui.open(); h.model.store = createStore(conceptProject()); h.ui.refresh(); pending[2].resolve(searchModel(h.state, {})); await tick(); assert.equal(h.$('advanced-search-results').children.length, 0);
});

test('replace-all respects the actual result set when a disabled name field would match extra owners', async t => {
  const h = await setup(t); h.model.execute({ type: 'updateMetadata', owner: { kind: 'element', id: h.state.elements[0].id }, documentation: 'Сервер' }); h.ui.refresh();
  h.input('advanced-query', 'Сервер'); h.$('advanced-name').click(); h.$('advanced-properties').click(); await h.submit();
  assert.equal(h.$('advanced-search-results').children.length, 1);
  h.input('advanced-replacement', 'Host'); h.$('advanced-replace-all').click(); await tick(); h.$('advanced-search-apply').click(); await tick();
  assert.equal(h.store.snapshot.elements[0].name, 'Host 2'); assert.equal(h.store.snapshot.elements[1].name, 'Сервер 10');
});

test('multi-selection property preview refuses a changed selection even without a model revision change', async t => {
  const h = await setup(t), drawings = h.model.view.occurrences.filter(item => item.concept.kind === 'element');
  h.model.selectMany(drawings.map(item => ({ kind: 'occurrence', id: item.id })));
  h.input('advanced-property-scope', 'selection'); h.input('advanced-property-key', 'owner'); h.input('advanced-property-value', 'Unified');
  h.$('advanced-property-set').click(); assert.equal(h.$('advanced-search-apply').disabled, false);
  h.model.selectMany([{ kind: 'occurrence', id: drawings[0].id }]); const before = h.capture(); h.$('advanced-search-apply').click();
  assert.deepEqual(h.capture(), before); assert.match(h.$('advanced-search-error').textContent, /изменилась/);
});

test('normal catalogue owner scope previews common/mixed properties and applies only the fixed owners in one Undo', async t => {
 const h = await setup(t), owners = [{ kind: 'project', id: h.state.project.id }, { kind: 'element', id: h.state.elements[0].id }]; h.dialog.close(); h.ui.open({ owners });
 assert.equal(h.$('advanced-property-scope').value, 'catalog'); assert.equal(h.$('advanced-search-results').children.length, 2); const before = h.capture();
 h.input('advanced-property-key', 'owner'); h.input('advanced-property-value', 'Team'); h.$('advanced-property-set').click(); assert.match(h.$('advanced-search-preview').textContent, /Team/); assert.deepEqual(h.capture(), before);
 h.$('advanced-search-apply').click(); await tick(); assert.deepEqual(h.store.snapshot.project.properties, [{ key: 'owner', value: 'Team' }]); assert.equal(h.store.snapshot.elements[0].properties.filter(item => item.key === 'owner').every(item => item.value === 'Team'), true); assert.deepEqual(h.store.snapshot.elements[1].properties, h.state.elements[1].properties); assert.equal(h.store.history.undo, 1); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files);
 h.dialog.close(); assert.throws(() => h.ui.open({ owners: [{ kind: 'element', id: 'missing' }] }), /устарело/); assert.deepEqual(h.store.exportFiles(), before.files);
});
