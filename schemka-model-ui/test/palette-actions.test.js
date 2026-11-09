import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { CURRENT_CATALOG, CURRENT_METAMODEL, createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createDemo } from '../src/demo.js';
import { createProjectSession } from '../src/project-session.js';
import { notationElement } from '../src/notation.js';
import { installPaletteActions } from '../src/palette-actions.js';
const all = [...CURRENT_CATALOG.elementTypes, ...CURRENT_CATALOG.relationshipTypes, ...CURRENT_CATALOG.junctionTypes];
function setup(t, store = createDemo()) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id), model = createController(store), session = createProjectSession(store);
  let beforeFilters = 0;
  const ui = installPaletteActions({ document, model, beforeFilter() { beforeFilters++; } }); ui.refresh();
  const query = value => { $('palette-search').value = value; $('palette-search').dispatchEvent(new window.Event('input', { bubbles: true })); };
  const visible = () => all.filter(type => !$(`create-${type.toLowerCase()}`).hidden);
  const capture = () => ({ snapshot: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty, selection: model.selection, view: model.viewId });
  return { window, document, $, model, store, ui, session, query, visible, capture, get beforeFilters() { return beforeFilters; } };
}

test('the full catalogue remains available with elements expanded, relation groups folded and the connector first inside relationships', t => {
  const h = setup(t), before = h.capture();
  assert.equal(h.document.querySelectorAll('[data-palette-group]').length, 9); assert.equal(h.visible().length, 59);
  assert.equal(h.$('smart-link-tool').disabled,false);
  for (const type of CURRENT_CATALOG.elementTypes) {
    const button = h.$(`create-${type.toLowerCase()}`);
    assert.equal(button.closest('[data-palette-group]').dataset.paletteGroup, notationElement(CURRENT_METAMODEL, type).family);
    assert.equal(button.disabled, false);
  }
  for (const type of CURRENT_CATALOG.relationshipTypes) assert.equal(h.$(`create-${type.toLowerCase()}`).closest('[data-palette-group]').dataset.paletteGroup, 'relationships');
  for (const group of h.document.querySelectorAll('[data-palette-group]')) {
    assert.ok(h.$(group.getAttribute('aria-labelledby'))); assert.equal(group.hidden, false);
    assert.equal(group.open, !['relationships', 'junctions'].includes(group.dataset.paletteGroup));
  }
  assert.equal(h.$('smart-link-tool').closest('[data-palette-group]').dataset.paletteGroup, 'relationships');
  assert.equal(h.$('palette-items-relationships').firstElementChild, h.$('smart-link-tool'));
  assert.equal(h.$('palette-results').textContent, 'Элементы: 42 из 42 · Отношения: 15 из 15 · Junctions: 2 из 2');
  assert.equal(h.$('palette-results').getAttribute('role'), 'status'); assert.equal(h.$('palette-results').getAttribute('aria-atomic'), 'true');
  assert.equal(h.$('catalogue-tools').hasAttribute('aria-live'), false); assert.equal(h.$('palette-empty').hidden, true);
  assert.ok(h.document.querySelector('label[for="palette-search"]')); assert.equal(h.$('palette-search').maxLength, 128);
  h.query('Flow'); assert.equal(h.$('palette-items-relationships').closest('details').open, true);
  assert.equal(h.$('smart-link-tool').hidden, false);
  h.query(''); assert.equal(h.$('palette-items-relationships').closest('details').open, false);
  assert.equal(h.$('palette-items-junctions').closest('details').open, false);
  assert.deepEqual(h.capture(), before);
});

test('canonical and displayed spaced names match case-insensitively with bounded literal queries and normalized whitespace', t => {
  const h = setup(t);
  for (const [query, expected] of [['dataobject', ['DataObject']], ['  DATA \t OBJECT  ', ['DataObject']], ['APPLICATIONINTERFACE', ['ApplicationInterface']], ['system software', ['SystemSoftware']], ['ReadWriteAccess', ['ReadWriteAccess']], ['read / write access', ['ReadWriteAccess']], ['interface', ['ApplicationInterface', 'BusinessInterface', 'TechnologyInterface']], ['*', []], ['[', []], ['<img onerror=x>', []], ['x'.repeat(10000), []]]) {
    h.query(query); assert.deepEqual(new Set(h.visible()), new Set(expected), query.slice(0, 30));
  }
  assert.equal(h.document.querySelectorAll('.palette img,.palette script').length, 0);
  h.query('   \t\n '); assert.equal(h.visible().length, 59);
});

test('matching groups, visible counts and empty state update without replacing buttons or losing their listeners', t => {
  const h = setup(t), buttons = all.map(type => h.$(`create-${type.toLowerCase()}`)); let clicks = 0;
  h.$('create-dataobject').addEventListener('click', () => clicks++);
  h.query('data object');
  assert.equal(h.$('palette-results').textContent, 'Элементы: 1 из 42 · Отношения: 0 из 15 · Junctions: 0 из 2');
  for (const group of h.document.querySelectorAll('[data-palette-group]')) assert.equal(group.hidden, group.dataset.paletteGroup !== 'application');
  h.$('create-dataobject').click(); assert.equal(clicks, 1);
  h.query('no such type'); assert.equal(h.visible().length, 0); assert.equal(h.$('palette-empty').hidden, false); assert.match(h.$('palette-empty').textContent, /Ничего не найдено/);
  assert.equal(h.$('palette-results').textContent, 'Элементы: 0 из 42 · Отношения: 0 из 15 · Junctions: 0 из 2');
  h.$('palette-clear').click(); assert.equal(h.$('palette-search').value, ''); assert.equal(h.document.activeElement, h.$('palette-search')); assert.equal(h.visible().length, 59);
  h.ui.refresh(); assert.deepEqual(all.map(type => h.$(`create-${type.toLowerCase()}`)), buttons); h.$('create-dataobject').click(); assert.equal(clicks, 2);
});

test('search preserves model, current view, selection, dirty baseline and both history stacks across refreshes', t => {
  const h = setup(t); h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id });
  h.model.execute({ type: 'renameProject', name: 'Committed' }); h.model.execute({ type: 'renameProject', name: 'Redo me' }); h.model.undo();
  const before = h.capture();
  for (const query of ['Service', 'Read', 'nonsense', '', 'Value Stream']) { h.query(query); h.ui.refresh(); assert.deepEqual(h.capture(), before); }
  assert.equal(h.$('palette-search').value, 'Value Stream'); assert.equal(h.store.history.redo, 1);
});

test('native Enter/Tab remain available, Escape clears only a non-composing plain query, and clear keys never bubble into model shortcuts', t => {
  const h = setup(t), input = h.$('palette-search'); let bubbles = 0;
  h.document.addEventListener('keydown', () => bubbles++);
  const key = (target, key, options = {}) => { const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; };
  for (const name of ['Enter', 'Tab', 'ArrowDown']) { h.query('Role'); assert.equal(key(input, name).defaultPrevented, false); assert.equal(input.value, 'Role'); }
  for (const options of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
    h.query('Role'); assert.equal(key(input, 'Escape', options).defaultPrevented, false); assert.equal(input.value, 'Role');
  }
  input.dispatchEvent(new h.window.Event('compositionstart')); assert.equal(key(input, 'Escape').defaultPrevented, false); assert.equal(input.value, 'Role');
  input.dispatchEvent(new h.window.Event('compositionend')); input.focus(); const before = bubbles;
  assert.equal(key(input, 'Escape').defaultPrevented, true); assert.equal(bubbles, before); assert.equal(input.value, ''); assert.equal(h.document.activeElement, input);
  for (const name of ['Delete', 'Backspace', 'F2', 'Enter', ' ', 'Tab', 'ArrowRight']) { h.query('Role'); const before = bubbles; assert.equal(key(h.$('palette-clear'), name).defaultPrevented, false); assert.equal(bubbles, before); }
  h.query('Role'); assert.equal(key(h.$('palette-clear'), 'Escape').defaultPrevented, true); assert.equal(input.value, '');
});

test('filtering a focused tool moves focus to search without model selection changes in the always-visible catalogue', t => {
  const h = setup(t); h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id }); const before = h.capture();
  h.$('create-service').focus(); h.query('Plateau');
  assert.equal(h.document.activeElement, h.$('palette-search')); assert.equal(h.$('catalogue-palette').tagName, 'DIV'); assert.equal(h.$('catalogue-palette').hidden, false); assert.deepEqual(h.capture(), before);
  assert.ok(h.beforeFilters >= 2, 'Changing and focusing the search both cross the disposable-gesture boundary');
});

test('zero-view models keep the full catalogue visible but disabled, and unsupported references fail closed', t => {
  const h = setup(t, createStore(createProject('No views'))), before = h.capture();
  assert.equal(h.visible().length, 59); for (const type of all) assert.equal(h.$(`create-${type.toLowerCase()}`).disabled, true);
  assert.equal(h.$('smart-link-tool').disabled,true);
  h.query('DataObject'); assert.deepEqual(h.visible(), ['DataObject']); assert.deepEqual(h.capture(), before);
  const unknown = { store: { snapshot: { project: { metamodel: { ...CURRENT_METAMODEL, version: 999 } } } }, view: null };
  installPaletteActions({ document: h.document, model: unknown }).refresh(); assert.equal(h.visible().length, 0); assert.equal(h.$('palette-empty').hidden, false);
  assert.equal(h.$('palette-results').textContent, 'Элементы: 0 из 0 · Отношения: 0 из 0 · Junctions: 0 из 0');
});

test('each query or refresh reads one project snapshot and reuses active-view eligibility for all 59 controls', t => {
  const h = setup(t), before = h.capture(), original = globalThis.structuredClone;
  let copies = 0;
  globalThis.structuredClone = (value, ...options) => {
    if (value?.project?.metamodel && Array.isArray(value.views)) copies++;
    return original(value, ...options);
  };
  try {
    h.query('DataObject'); assert.equal(copies, 1, 'A keystroke must not deep-clone the project once per button');
    h.ui.refresh(); assert.equal(copies, 2, 'A model refresh also uses one shared snapshot');
  } finally { globalThis.structuredClone = original; }
  assert.deepEqual(h.visible(), ['DataObject']); assert.equal(h.$('create-dataobject').disabled, false);
  assert.deepEqual(h.capture(), before);
});

test('native category folds persist through refresh; search reveals matches then restores the exact prior folds', async t => {
  const h = setup(t), before = h.capture();
  const groups = [...h.document.querySelectorAll('[data-palette-group]')];
  for (const [i, group] of groups.entries()) { assert.equal(group.tagName, 'DETAILS'); assert.ok(group.querySelector(':scope > summary')); group.open = i % 2 === 0; }
  const folds = groups.map(group => group.open);
  h.ui.refresh(); assert.deepEqual(groups.map(group => group.open), folds);
  h.query('Data Object'); assert.equal(h.$('create-dataobject').closest('details').open, true);
  h.ui.refresh(); h.query('Read'); h.query('nothing'); h.query('');
  assert.deepEqual(groups.map(group => group.open), folds);
  h.query('Role'); h.$('palette-clear').click(); assert.deepEqual(groups.map(group => group.open), folds);
  assert.deepEqual(h.capture(), before);
  const group = groups.find(group => group.dataset.paletteGroup === 'common'), summary = group.querySelector('summary');
  group.open = true; h.$('create-service').focus(); group.open = false;
  group.dispatchEvent(new h.window.Event('toggle')); assert.equal(h.document.activeElement, summary);
  let bubbles = 0; h.document.addEventListener('keydown', () => bubbles++);
  for (const key of ['Enter', ' ', 'Tab', 'Delete', 'F2', 'Escape']) {
    const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); summary.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'Native disclosure/navigation is not emulated');
  }
  assert.equal(bubbles, 0); assert.deepEqual(h.capture(), before);
});

test('all 59 palette controls have native hover titles and stable accessible descriptions outside the row layout', t => {
  const h = setup(t), before = h.capture(), descriptions = new Set();
  for (const type of all) {
    const button = h.$(`create-${type.toLowerCase()}`), label = h.$(button.getAttribute('aria-labelledby')), description = h.$(button.getAttribute('aria-describedby'));
    assert.equal(label, button.querySelector('strong')); assert.ok(description);
    assert.equal(button.title,description.textContent); assert.equal(description.classList.contains('sr-only'),true);
    assert.equal(description.hasAttribute('role'),false);
    assert.ok(description.textContent.length >= 35 && description.textContent.length <= 140, type); assert.equal(description.children.length, 0);
    assert.equal(description.hasAttribute('tabindex'), false); descriptions.add(description.textContent);
    assert.equal(button.querySelector('small'), null); assert.doesNotMatch(button.textContent, /Новый объект и экземпляр|Новое отношение и соединение/);
    button.focus(); assert.equal(h.document.activeElement,button);
    button.dispatchEvent(new h.window.MouseEvent('mouseenter')); assert.equal(description.classList.contains('sr-only'),true);
    let bubbled=false;
    const onKey=()=>{bubbled=true;}; h.document.addEventListener('keydown',onKey);
    const escape=new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}); button.dispatchEvent(escape);
    h.document.removeEventListener('keydown',onKey);
    assert.equal(bubbled,false); assert.equal(escape.defaultPrevented,false);
  }
  assert.equal(descriptions.size, 59); assert.deepEqual(h.capture(), before);
  assert.match(h.$('create-orjunction-description').textContent, /одна или несколько/);
  assert.match(h.$('create-readwriteaccess-description').textContent, /чтения и записи/);
});

test('the magic connector is searchable inside relationships without inventing catalogue types', t => {
  const h = setup(t), before = h.capture();
  h.query('палочка');
  assert.equal(h.$('smart-link-tool').hidden, false);
  assert.equal(h.$('smart-link-tool').closest('details').hidden, false);
  assert.equal(h.$('smart-link-tool').closest('details').open, true);
  assert.equal(h.visible().length, 0); assert.equal(h.$('palette-empty').hidden, true);
  h.$('smart-link-tool').focus(); h.query('data object');
  assert.equal(h.$('smart-link-tool').hidden, true); assert.equal(h.document.activeElement, h.$('palette-search'));
  h.query(''); assert.equal(h.$('smart-link-tool').hidden, false);
  assert.deepEqual(h.capture(), before);
});
