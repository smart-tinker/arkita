import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createStore } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { findModelObjects, installModelSearch } from '../src/model-search.js';

test('model search finds shared records by supported fields, including undrawn concepts and view documentation', () => {
  const state = conceptProject(), element = state.elements[0], relationship = state.relationships[0];
  state.views.forEach(entry => { entry.occurrences = []; entry.connections = []; });
  element.name = 'Сервер 1С'; element.documentation = 'Офис\nCafe\u0301'; element.properties = propertyEntries({ Владелец: 'Курбанов' });
  relationship.label = 'Передача данных'; relationship.properties = propertyEntries({ protocol: 'HTTPS' });
  state.views[1].view.documentation = 'Складской контур';
  const before = structuredClone(state);
  for (const query of ['СЕРВЕР 1с', element.id.toUpperCase(), 'grouping', 'офис', 'café', 'владелец', 'курбанов']) {
    assert.ok(findModelObjects(state, query, 'element').some(item => item.id === element.id), query);
  }
  for (const query of ['ПЕРЕДАЧА', 'protocol', 'https', 'сервер 1с']) assert.ok(findModelObjects(state, query, 'relationship').some(item => item.id === relationship.id), query);
  assert.equal(findModelObjects(state, 'складской', 'view')[0].id, state.views[1].view.id);
  assert.equal(findModelObjects(state, 'andjunction', 'junction')[0].id, state.junctions[0].id);
  assert.deepEqual(findModelObjects(state, '  '), []);
  assert.deepEqual(findModelObjects(state, 'сервер', 'view'), []);
  assert.deepEqual(state, before);
});

test('model search keeps exact typed identities and deterministic natural order without parsing literal markup', () => {
  const state = conceptProject();
  state.elements[0].name = '<img src=x> 10'; state.elements[1].name = '<img src=x> 2';
  state.junctions[0].name = '<img src=x> 2';
  const first = findModelObjects(state, '<img src=x>');
  assert.deepEqual(first.filter(item => item.kind !== 'relationship').map(item => item.kind), ['element', 'junction', 'element']);
  assert.equal(new Set(first.map(item => `${item.kind}:${item.id}`)).size, first.length);
  for (const name of ['elements', 'junctions', 'relationships', 'views']) state[name].reverse();
  assert.deepEqual(findModelObjects(state, '<img src=x>'), first);
});

function setup(t, state = conceptProject()) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id);
  state.elements[0].name = '<img src=x> Сервер'; state.elements[1].name = '<img src=x> Сервер';
  const store = createStore(state), model = createController(store), session = createProjectSession(store);
  const opened = [], selected = [], messages = [], panels = []; let blocked = false;
  const search = installModelSearch({ document, model, blocked: () => blocked, status: text => messages.push(text), panel: name => panels.push(name),
    selectConcept(ref) { selected.push(ref); model.select(ref); }, openConcept(ref) { opened.push(ref); }, activateView(id) { opened.push({ kind: 'view', id }); model.switchView(id); } });
  const event = (target, type) => target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  return { $, document, window, state, store, model, session, search, opened, selected, messages, panels,
    query(value) { $('model-search').value = value; event($('model-search'), 'input'); },
    category(value) { $('model-search-category').value = value; event($('model-search-category'), 'change'); },
    results: () => [...$('model-search-results').querySelectorAll('button')],
    capture: () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty }),
    set blocked(value) { blocked = value; } };
}

test('search UI preserves tree disclosure, literal labels, dirty and both history stacks through search/filter/navigation/clear', t => {
  const h = setup(t);
  h.model.execute({ type: 'renameProject', name: 'Past' }); h.model.execute({ type: 'renameProject', name: 'Future' }); h.model.undo();
  const before = h.capture(); h.$('tree-model').open = false;
  h.query('сервер'); h.category('element');
  assert.equal(h.results().length, 2); assert.equal(h.$('tree-model').hidden, true);
  assert.equal(h.document.querySelector('#model-search-results img'), null);
  assert.ok(h.results()[0].textContent.includes(h.state.elements[0].id));
  h.results()[1].click(); assert.deepEqual(h.opened, []); assert.deepEqual(h.selected.at(-1), { kind: 'element', id: h.state.elements[1].id });
  h.query('all concepts'); h.category('view'); h.results()[0].click();
  assert.equal(h.model.viewId, h.state.views[0].view.id);
  h.query('does not exist'); assert.equal(h.results().length, 0); assert.match(h.$('model-search-summary').textContent, /Ничего не найдено/);
  h.$('model-search-clear').click();
  assert.equal(h.$('tree-model').hidden, false); assert.equal(h.$('tree-model').open, false);
  assert.equal(h.$('model-search-results').hidden, true); assert.equal(h.document.activeElement, h.$('model-search'));
  assert.deepEqual(h.capture(), before); h.model.redo(); assert.equal(h.store.snapshot.project.name, 'Future');
});

test('search results refresh after edit/undo, and stale buttons cannot navigate a replaced model', t => {
  const h = setup(t); h.query('сервер'); h.category('element'); const old = h.results()[0];
  h.model.execute({ type: 'renameElement', elementId: h.state.elements[0].id, name: 'Другой объект' }); h.search.refresh();
  assert.equal(h.results().length, 1); old.click(); assert.deepEqual(h.opened, []); assert.deepEqual(h.selected, []);
  h.model.undo(); h.search.refresh(); assert.equal(h.results().length, 2);
  const stale = h.results()[0]; h.model.store = createStore(conceptProject()); stale.click();
  assert.deepEqual(h.opened, []); assert.deepEqual(h.selected, []); assert.equal(h.$('model-search').value, ''); assert.equal(h.$('tree-model').hidden, false);
});

test('search keyboard supports Russian layout and does not take over composition, inputs or blocked editing', t => {
  const h = setup(t), key = (target, options) => {
    const event = new h.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event;
  };
  const input = h.$('model-search');
  const shortcut = key(h.document.body, { key: 'а', code: 'KeyF', ctrlKey: true });
  assert.equal(shortcut.defaultPrevented, true); assert.equal(h.document.activeElement, input); assert.equal(h.panels.at(-1), 'catalog');
  h.query('сервер'); h.category('element');
  key(input, { key: 'Enter', isComposing: true }); assert.equal(h.document.activeElement, input); assert.deepEqual(h.opened, []); assert.deepEqual(h.selected, []);
  key(input, { key: 'ArrowDown' }); assert.equal(h.document.activeElement, h.results()[0]);
  input.focus(); key(input, { key: 'Escape' }); assert.equal(input.value, ''); assert.equal(h.$('tree-model').hidden, false);
  const other = h.$('documentation-value'); other.focus();
  assert.equal(key(other, { key: 'f', code: 'KeyF', ctrlKey: true }).defaultPrevented, false); assert.equal(h.document.activeElement, other);
  h.query('сервер'); const count = h.results().length; h.blocked = true;
  const before = h.capture(); h.results()[0].click(); h.query('blocked'); h.$('model-search-clear').click();
  assert.equal(input.value, 'сервер'); assert.equal(h.results().length, count); assert.deepEqual(h.opened, []); assert.deepEqual(h.selected, []); assert.deepEqual(h.capture(), before);
  assert.equal(key(h.document.body, { key: 'f', code: 'KeyF', ctrlKey: true }).defaultPrevented, false);
});

test('large result lists render a bounded first page, report the full total and allow keyboard progress to every record', t => {
  const state = conceptProject();
  for (let number = 3; number <= 220; number++) state.elements.push({ ...structuredClone(state.elements[0]),
    id: `el-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, name: `Сервер ${number}` });
  const h = setup(t, state), before = h.capture(); h.query('сервер'); h.category('element');
  assert.equal(h.results().length, 100); assert.match(h.$('model-search-summary').textContent, /220.*100/);
  h.$('model-search-more').click(); assert.equal(h.results().length, 200); assert.equal(h.document.activeElement, h.results()[100]);
  h.$('model-search-more').click(); assert.equal(h.results().length, 220); assert.equal(h.$('model-search-more').hidden, true);
  assert.equal(h.document.activeElement, h.results()[200]); assert.equal(new Set(h.results().map(button => button.dataset.searchId)).size, 220);
  h.query('сервер 219'); assert.equal(h.results().length, 1); assert.equal(h.$('model-search-more').hidden, true);
  assert.deepEqual(h.capture(), before);
});
