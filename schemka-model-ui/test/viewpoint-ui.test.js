import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createStore } from '../../schemka-model-core/src/index.js';
import { viewpointGraph, viewpointId, viewpointDefinition } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { setViewpointList } from './profile-controls-fixture.js';
import { installViewpointUI } from '../src/viewpoint-ui.js';

function setup(t, initial = viewpointGraph().state) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { document } = dom.window, $ = id => document.getElementById(id), store = createStore(initial), model = createController(store), session = createProjectSession(store), reports = [], added = [];
  let ui, changes = 0;
  for (const dialog of document.querySelectorAll('dialog')) { dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new dom.window.Event('close')); }; }
  ui = installViewpointUI({ document, model, openDialog: id => $(id).showModal(), render: () => ui.refresh(), status: text => reports.push(text), beforeChange() { changes++; model.cancelDrag(); model.select(null); }, addConcept: ref => added.push(ref) }); ui.refresh();
  const event = (target, type) => target.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
  const set = (id,value) => { if (['viewpoint-stakeholders','viewpoint-concerns'].includes(id)) { setViewpointList(document,id.slice(10),JSON.parse(value)); return; } $(id).value = value; event($(id),'input'); };
  const submit = () => event($('viewpoint-form'), 'submit');
  const capture = () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty });
  const history = () => { store.execute({ type: 'renameProject', name: 'Past' }, store.revision); store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision); ui.refresh(); };
  return { $, ui, store, model, session, reports, added, set, submit, capture, history, event, document, window: dom.window, get changes() { return changes; } };
}
const button = (root, label) => [...root.querySelectorAll('button')].find(item => item.textContent === label);
const checked = (h, field, values) => h.$('viewpoint-types').querySelectorAll(`input[data-field="${field}"]`).forEach(item => item.checked = values.includes(item.value));

test('VP-META/VP-UI-02: editor creates exact inert definition; invalid drafts stay atomic and repeated success commits once', t => {
  const h = setup(t, conceptProject()); h.history(); const before = h.capture(); h.ui.manager(); h.$('viewpoint-new').click();
  h.set('viewpoint-name', '<img src=x onerror=alert(1)>\r\nRaw'); h.set('viewpoint-stakeholders', '["Owner"]'); h.set('viewpoint-concerns', '[]'); checked(h, 'purpose', ['informing']); checked(h, 'content', ['details', 'coherence']); checked(h, 'elementTypes', ['ApplicationComponent']);
  h.submit(); assert.deepEqual(h.capture(), before); assert.match(h.$('viewpoint-error').textContent, /nonempty/);
  h.set('viewpoint-concerns', '["Which applications?"]'); h.submit(); h.submit(); assert.equal(h.store.revision, before.revision + 1); assert.equal(h.ui.active, false); assert.equal(h.session.dirty, true);
  assert.deepEqual(h.store.snapshot.viewpoints[0].selection, { elementTypes: ['ApplicationComponent'], junctionTypes: [], relationshipTypes: [] }); assert.deepEqual(h.store.snapshot.elements, conceptProject().elements);
  h.ui.manager(); assert.match(h.$('viewpoint-list').textContent, /<img/); assert.equal(h.document.querySelector('img'), null);
});
test('VP-HISTORY-01/03 and VP-UI-02: shared impact before save, cancel unchanged, deletion cannot cascade, single-step undo/redo', t => {
  const initial = viewpointGraph().state; initial.views[1].view.viewpointId = viewpointId; const h = setup(t, initial); h.history(); const before = h.capture();
  h.ui.manager(); button(h.$('viewpoint-list'), 'Удалить…').click(); assert.match(h.$('viewpoint-error').textContent, /Используется видами/); assert.ok(h.$('viewpoint-error').textContent.includes(initial.views[1].view.id));
  button(h.$('viewpoint-list'), 'Изменить').click(); assert.ok(h.$('viewpoint-impact').textContent.includes(initial.views[1].view.id)); checked(h, 'elementTypes', []); h.$('viewpoint-cancel').click(); h.submit(); assert.deepEqual(h.capture(), before);
  h.ui.manager(); button(h.$('viewpoint-list'), 'Изменить').click(); checked(h, 'elementTypes', []); h.submit(); const after = h.capture(); assert.equal(after.revision, before.revision + 1); assert.equal(h.model.view.occurrences.length, 0); assert.equal(h.store.snapshot.views[0].occurrences.length, 3);
  h.model.undo(); h.ui.refresh(); assert.deepEqual(h.store.exportFiles(), before.files); assert.equal(h.session.dirty, before.dirty); h.model.redo(); h.ui.refresh(); assert.deepEqual(h.store.exportFiles(), after.files);
});
test('VP-HISTORY-04: cancel, close, changed revision/view/load and repeated stale submit retain all model/session history', t => {
  for (const mode of ['cancel', 'close', 'revision', 'view', 'load']) {
    const h = setup(t); h.history(); h.ui.manager(); button(h.$('viewpoint-list'), 'Изменить').click(); h.set('viewpoint-name', 'Never committed');
    if (mode === 'cancel') h.event(h.$('viewpoint-dialog'), 'cancel');
    if (mode === 'close') h.$('viewpoint-dialog').close();
    if (mode === 'revision') h.store.execute({ type: 'renameProject', name: 'Changed' }, h.store.revision);
    if (mode === 'view') h.model.switchView(h.store.snapshot.views[1].view.id);
    if (mode === 'load') { h.store.load(h.store.exportFiles(), h.store.revision); h.history(); }
    const before = h.capture(); h.submit(); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.ui.active, false);
  }
});
test('VP-UI-01: bind/unbind cancels hidden drag/selection, disallows hidden drawing edits and rejects stale binding control', t => {
  const h = setup(t), hidden = h.store.snapshot.views[0].occurrences.find(item => item.concept.id === h.store.snapshot.elements[2].id);
  h.$('viewpoint-binding').value = ''; h.event(h.$('viewpoint-binding'), 'change'); h.model.select({ kind: 'occurrence', id: hidden.id }); h.model.beginDrag(hidden.id);
  h.$('viewpoint-binding').value = viewpointId; h.event(h.$('viewpoint-binding'), 'change'); assert.equal(h.model.selection, null); assert.equal(h.model.drag, null); assert.equal(h.document.activeElement.id, 'viewpoint-binding');
  const before = h.capture(); assert.throws(() => h.model.execute({ type: 'moveOccurrence', viewId: h.model.viewId, occurrenceId: hidden.id, x: 90, y: 90 }), /исключён/); assert.deepEqual(h.capture(), before);
  h.store.execute({ type: 'renameProject', name: 'Outside change' }, h.store.revision); const stale = h.capture(); h.$('viewpoint-binding').value = ''; h.event(h.$('viewpoint-binding'), 'change'); assert.deepEqual(h.capture(), stale); assert.equal(h.$('viewpoint-binding').value, viewpointId);
});
test('VP-PROJ-12/14: actual eligible chooser excludes out-of-scope model records and distinguishes undrawn data, no automatic population', t => {
  const state = viewpointGraph({ drawn: false }).state, h = setup(t, state);
  assert.equal(h.model.view.occurrences.length, 0); assert.equal(h.$('viewpoint-eligible').options.length, 3); assert.ok([...h.$('viewpoint-eligible').options].every(item => !/Device/.test(item.textContent) && /ещё не нарисован/.test(item.textContent)));
  assert.match(h.$('viewpoint-counts').textContent, /не нарисованы: 3/); assert.equal(h.$('viewpoint-empty').hidden, false);
  h.$('viewpoint-add').click(); assert.deepEqual(h.added, [{ kind: 'element', id: state.elements[0].id }]); assert.equal(h.store.revision, 0);
});
test('VP-IO-02/03: file session definitions/bindings survive native save/load; dirty follows undo and draft generation prevents pending replacement', async t => {
  const h = setup(t), source = h.session.prepareSave(); h.session.completeSave(source); assert.equal(h.session.dirty, false);
  h.ui.manager(); button(h.$('viewpoint-list'), 'Изменить').click(); h.set('viewpoint-documentation', 'A draft only'); assert.equal(h.session.dirty, false); const generation = h.ui.generation;
  let finish; const pending = h.session.loadFile(h.session.beginLoad(), { size: source.bytes.length, name: source.name, arrayBuffer: () => new Promise(resolve => finish = resolve) }, { isCurrent: () => h.ui.generation === generation });
  h.set('viewpoint-documentation', 'Newer draft'); finish(source.bytes.slice().buffer); await assert.rejects(pending, { code: 'SESSION_STALE' }); assert.equal(h.ui.active, true); assert.equal(h.session.dirty, false);
  h.submit(); const changed = h.session.prepareSave(); h.session.completeSave(changed); assert.equal(h.session.dirty, false); h.model.undo(); assert.equal(h.session.dirty, true); h.model.redo(); assert.equal(h.session.dirty, false);
  const expected = h.store.exportFiles(); await h.session.loadFile(h.session.beginLoad(), new Blob([changed.bytes])); h.model.afterLoad(); h.ui.refresh(); assert.deepEqual(h.store.exportFiles(), expected); assert.equal(h.session.dirty, false); assert.deepEqual(h.store.history, { undo: 0, redo: 0 });
});
test('definition copying and exact existing multiline values preserve metadata; Select all is concrete catalog enumeration', t => {
  const state = viewpointGraph().state; state.viewpoints[0].name = 'Raw\r\nname'; state.viewpoints[0].documentation = 'Raw\r\ntext'; const h = setup(t, state);
  h.ui.manager(); button(h.$('viewpoint-list'), 'Изменить').click(); h.submit(); assert.equal(h.store.snapshot.viewpoints[0].name, 'Raw\r\nname'); assert.equal(h.store.snapshot.viewpoints[0].documentation, 'Raw\r\ntext');
  h.ui.manager(); button(h.$('viewpoint-list'), 'Копировать').click(); button(h.$('viewpoint-types').querySelectorAll('fieldset')[2], 'Выбрать все').click(); h.submit(); assert.equal(h.store.snapshot.viewpoints.length, 2); assert.notEqual(h.store.snapshot.viewpoints[1].id, viewpointId); assert.equal(h.store.snapshot.viewpoints[1].selection.elementTypes.length, 42);
});


test('optional scope preview lists hidden drawings before Apply, cancel is read-only and one Undo restores the prior scope', t => {
  const h = setup(t), before = h.capture(); h.$('viewpoint-preview').click(); assert.equal(h.$('viewpoint-dialog').open,true); const select = h.$('viewpoint-preview-choice'); select.value = ''; h.event(select,'change'); assert.match(h.$('viewpoint-scope-preview').textContent,/скрыто рисунков: 0/); assert.deepEqual(h.capture(),before); h.$('viewpoint-cancel').click(); assert.deepEqual(h.capture(),before);
  h.$('viewpoint-preview').click(); h.$('viewpoint-preview-choice').value = ''; h.event(h.$('viewpoint-preview-choice'),'change'); h.submit(); assert.equal(h.store.revision,before.revision+1); assert.ok(!h.model.view.view.viewpointId); const after = h.store.exportFiles(); h.model.undo(); h.ui.refresh(); assert.deepEqual(h.store.exportFiles(),before.files); h.model.redo(); h.ui.refresh(); assert.deepEqual(h.store.exportFiles(),after);
});
