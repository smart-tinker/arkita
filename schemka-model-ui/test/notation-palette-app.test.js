import { production, setup, richLifecycleFixture, setStoredGeometry } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { NOTATION_ELEMENTS, NOTATION_RELATIONSHIPS, notationElement } from '../src/notation.js';
import { drawTypedRelationship, fixture, beginLayoutEdit, layoutHandle, searchPalette } from './notation-app-helpers.js';

const visiblePaletteTypes = h => [...NOTATION_ELEMENTS, ...NOTATION_RELATIONSHIPS, 'AndJunction', 'OrJunction'].filter(type => !h.$(`create-${type.toLowerCase()}`).hidden);

test(`${production ? 'production' : 'source'} app: grouped palette search keeps selected objects, redo and exact files while filtered types remain creatable across fresh sessions`, async t => {
  const f = richLifecycleFixture(); f.state.elements.find(item => item.id === f.a.elementId).type = 'ApplicationComponent';
  const bytes = Buffer.from(serializeProjectFile(f.state)); let saved;
  await t.test('search, clear, counts and current typed actions survive view/theme/load refreshes without touching retained data', async phase => {
    const h = await setup(phase); await h.load(bytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
    assert.equal(h.document.querySelectorAll('[data-palette-group]').length, 9); assert.equal(visiblePaletteTypes(h).length, 59);
    const controls = [...NOTATION_ELEMENTS, ...NOTATION_RELATIONSHIPS].map(type => h.$(`create-${type.toLowerCase()}`));
    h.$('create-service').click(); h.$('element-name').value = 'Temporary redo seed'; h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })); h.$('undo').click();
    const selected = h.$('canvas').querySelector(`[data-id="${f.a.occurrenceId}"]`); h.pointer(selected, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup');
    const history = h.$('history-state').textContent, selectedId = selected.dataset.id;
    searchPalette(h, '  dAtA   Object  '); assert.deepEqual(visiblePaletteTypes(h), ['DataObject']);
    assert.equal(h.$('palette-results').textContent, 'Элементы: 1 из 42 · Отношения: 0 из 15 · Junctions: 0 из 2');
    assert.equal(h.$('canvas').querySelector('.node.selected').dataset.id, selectedId); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
    h.$('palette-search').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(h.$('edit-dialog').open, false); assert.equal(h.$('history-state').textContent, history);
    searchPalette(h, '<script>[no such type]'); assert.equal(visiblePaletteTypes(h).length, 0); assert.equal(h.$('palette-empty').hidden, false);
    h.$('palette-clear').focus();
    for (const key of ['Delete', 'Backspace', 'F2', 'ArrowRight']) h.$('palette-clear').dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    assert.equal(h.$('delete-dialog').open, false); assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(h.$('canvas').querySelector('.node.selected').dataset.id, selectedId);
    h.$('palette-clear').click(); assert.equal(h.document.activeElement, h.$('palette-search')); assert.equal(visiblePaletteTypes(h).length, 59);
    assert.equal(h.$('redo').disabled, false); assert.deepEqual(await h.download(), bytes);
    searchPalette(h, 'DataObject');
    for (const stored of [false, true]) for (const theme of ['light', 'dark']) { setStoredGeometry(h, stored); h.change('theme-mode', theme); assert.deepEqual(visiblePaletteTypes(h), ['DataObject']); }
    for (const view of f.state.views) { h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click(); assert.equal(h.$('palette-search').value, 'DataObject'); assert.deepEqual(visiblePaletteTypes(h), ['DataObject']); }
    await h.load(bytes); assert.equal(h.$('palette-search').value, 'DataObject'); assert.deepEqual(visiblePaletteTypes(h), ['DataObject']); assert.deepEqual(await h.download(), bytes);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
    h.$('create-dataobject').click(); h.$('element-name').value = 'Search-created data'; h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(visiblePaletteTypes(h), ['DataObject']); assert.match(h.$('canvas').querySelector('.node.selected').getAttribute('aria-label'), /^DataObject:/);
    const dataOccurrenceId = h.$('canvas').querySelector('.node.selected').dataset.id;
    searchPalette(h, 'ReadAccess'); assert.deepEqual(visiblePaletteTypes(h), ['ReadAccess']);
    drawTypedRelationship(h, 'ReadAccess', f.a.occurrenceId, dataOccurrenceId);
    assert.deepEqual(visiblePaletteTypes(h), ['ReadAccess']); assert.equal(h.$('canvas').querySelector('.connection.selected .line').getAttribute('marker-start'), 'url(#notation-canvas-open)');
    saved = await h.download(); const actual = deserializeProjectFile(saved);
    for (const element of f.state.elements) assert.deepEqual(actual.elements.find(item => item.id === element.id), element);
    for (const relation of f.state.relationships) assert.deepEqual(actual.relationships.find(item => item.id === relation.id), relation);
    assert.equal(actual.elements.length, f.state.elements.length + 1); assert.equal(actual.relationships.length, f.state.relationships.length + 1);
    assert.deepEqual([...NOTATION_ELEMENTS, ...NOTATION_RELATIONSHIPS].map(type => h.$(`create-${type.toLowerCase()}`)), controls, 'Filters and app renders retain every original palette button');
  });
  await t.test('a fresh page has no saved filter and reopens the complete current file exactly', async phase => {
    const h = await setup(phase); assert.equal(h.$('palette-search').value, ''); assert.equal(visiblePaletteTypes(h).length, 59);
    await h.load(saved); assert.deepEqual(await h.download(), saved); assert.equal(visiblePaletteTypes(h).length, 59);
  });
});

test(`${production ? 'production' : 'source'} app: search focus and filtering cancel disposable gestures before hiding tools, and late releases cannot create or move objects`, async t => {
  const h = await setup(t), f = richLifecycleFixture(), bytes = Buffer.from(serializeProjectFile(f.state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${f.viewId}"]`).click();
  const source = h.$('create-node'); h.pointer(source, 'pointerdown', 20, 20, 7); h.pointer(h.$('canvas'), 'pointermove', 300, 200, 7);
  assert.ok(h.document.querySelector('.internal-drag-ghost'));
  searchPalette(h, 'DataObject'); assert.equal(source.hidden, true); assert.equal(source.isConnected, true); assert.equal(h.document.querySelector('.internal-drag-ghost'), null);
  h.pointer(h.$('canvas'), 'pointerup', 300, 200, 7); assert.equal(h.$('undo').disabled, true); assert.deepEqual(await h.download(), bytes);
  const moving = h.$('canvas').querySelector(`[data-id="${f.a.occurrenceId}"]`), position = moving.getAttribute('transform');
  h.pointer(moving, 'pointerdown', 100, 100, 8); h.pointer(h.$('canvas'), 'pointermove', 150, 140, 8); assert.notEqual(moving.getAttribute('transform'), position);
  searchPalette(h, 'Role'); assert.equal(moving.getAttribute('transform'), position); h.pointer(h.$('canvas'), 'pointerup', 150, 140, 8); assert.deepEqual(await h.download(), bytes);
  beginLayoutEdit(h, f.relation.connectionId); const handle = layoutHandle(h, 0);
  h.pointer(handle, 'pointerdown', 280, 25, 9); h.pointer(h.$('canvas'), 'pointermove', 320, 45, 9);
  searchPalette(h, 'Flow'); h.pointer(h.$('canvas'), 'pointerup', 320, 45, 9); assert.deepEqual(await h.download(), bytes);
  const anchor = h.$('project-name'); anchor.click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Discarded rename';
  h.$('palette-search').focus(); await Promise.resolve(); assert.equal(h.document.querySelector('.inline-editor'), null); assert.deepEqual(await h.download(), bytes);
  // A programmatic filter is read-only even while a creation modal is active;
  // the real modal keeps background controls inert until it closes.
  h.$('palette-clear').click(); h.$('create-service').click(); h.$('element-name').value = 'Preserve modal draft';
  searchPalette(h, 'Node', false); assert.equal(h.$('edit-dialog').open, true); assert.equal(h.$('element-name').value, 'Preserve modal draft');
  h.$('edit-dialog').close(); assert.deepEqual(await h.download(), bytes);
  h.$('file-button').click(); h.$('new-project').click(); searchPalette(h, 'Goal', false); h.$('cancel-load').click(); h.$('file-dialog').close();
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('palette-search').value, 'Goal');
  for (const action of ['new-project', 'reset-example']) {
    h.$('file-button').click(); h.$(action).click(); h.$('load-project').click();
    for (let attempt = 0; attempt < 40 && h.$('file-dialog').open; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.$('file-dialog').open, false); assert.equal(h.$('palette-search').value, 'Goal'); assert.deepEqual(visiblePaletteTypes(h), ['Goal']);
    assert.equal(h.$('create-goal').disabled, false); assert.equal(h.$('undo').disabled, true);
  }
  h.$('palette-clear').click(); assert.equal(visiblePaletteTypes(h).length, 59);
});

test(`${production ? 'production' : 'source'} app: element folders retain all 42 exact IDs, reuse and native history while folds remain presentation-only`, async t => {
  const h = await setup(t), state = fixture(), demo = await h.download();
  const visibleFamilies = () => [...h.document.querySelectorAll('[data-catalog-section]')].filter(group => !group.hidden).map(group => group.dataset.catalogSection);
  const expected = ['common', 'strategy', 'business', 'application', 'technology', 'motivation', 'implementation', 'relationships', 'views'];
  assert.deepEqual(visibleFamilies(), expected); assert.equal(h.$('tree-common').hidden, false);
  assert.equal(h.$('tree-junctions'), null); assert.equal(h.$('tree-relationships').hidden, false);
  const business = h.document.querySelector('[data-catalog-section="business"]'); business.open = false;
  h.$('create-businessactor').click(); h.$('element-name').value = 'First Business Actor';
  h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(visibleFamilies(), expected); assert.equal(business.open, true);
  h.$('undo').click(); assert.equal(business.hidden, false); assert.equal(business.querySelectorAll('[data-element-id]').length, 0); assert.deepEqual(await h.download(), demo);
  h.$('redo').click(); assert.equal(business.hidden, false); assert.equal(business.open, true);
  await h.load(serializeProjectFile(createProject('Empty tree')));
  assert.deepEqual(visibleFamilies(), expected);
  for (const id of ['tree-common', 'tree-relationships']) assert.equal(h.$(id).hidden, false);
  assert.equal(h.document.querySelectorAll('.catalog [data-element-id]').length, 0);
  assert.equal(h.$('tree-model').hidden, false); assert.equal(h.$('tree-views').hidden, false);
  await h.load(serializeProjectFile(state));
  assert.equal(h.document.querySelector('[data-catalog-section="business"]'), business);
  assert.equal(h.$('tree-common').hidden, false); assert.equal(h.$('tree-relationships').hidden, false);
  const groups = [...h.document.querySelectorAll('[data-catalog-section]')];
  assert.deepEqual(groups.map(g => g.dataset.catalogSection), expected);
  const before = await h.download(), history = h.$('history-state').textContent;
  const originals = new Map();
  for (const element of state.elements) {
    const item = h.document.querySelector('.catalog').querySelector(`[data-element-id="${element.id}"]`); originals.set(element.id, item);
    assert.ok(item); assert.equal(item.closest('[data-catalog-section]').dataset.catalogSection, notationElement(state.project.metamodel, element.type).family);
    assert.equal(item.closest('[data-catalog-kind]').dataset.catalogId, element.id); assert.ok(item.parentNode.querySelector(`[data-add-element-id="${element.id}"]`));
  }
  assert.equal(h.document.querySelector('.catalog').querySelectorAll('.element-button').length, 42);
  for (const group of groups) {
    assert.equal(group.tagName, 'DETAILS'); assert.equal(Number(group.querySelector('summary .tree-count').textContent), group.querySelectorAll('button[data-rename-kind][data-rename-id]').length);
    group.open = false;
    const summary = group.querySelector('summary'); summary.focus();
    for (const key of ['F2', 'Delete', 'Escape']) summary.dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true }));
  }
  assert.equal(h.$('edit-dialog').open, false); assert.equal(h.$('delete-dialog').open, false);
  assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(h.$('history-state').textContent, history);
  assert.deepEqual(await h.download(), before);
  const element = state.elements[0], group = originals.get(element.id).closest('details'); group.open = true;
  originals.get(element.id).click();
  for (const [id, button] of originals) assert.equal(h.document.querySelector('.catalog').querySelector(`[data-element-id="${id}"]`), button, 'Render preserves tree button and drag listener identity');
  assert.ok(groups.filter(g => g !== group).every(g => !g.open));
  assert.equal(originals.get(element.id).getAttribute('aria-pressed'), 'true');
  h.document.querySelector('.catalog').querySelector(`[data-add-element-id="${element.id}"]`).click();
  const added = await h.download(), after = deserializeProjectFile(added);
  assert.deepEqual(after.elements, state.elements); assert.deepEqual(after.relationships, state.relationships);
  assert.equal(after.views.reduce((n, v) => n + v.occurrences.filter(o => o.concept.id === element.id).length, 0), 3);
  h.$('undo').click(); assert.deepEqual(await h.download(), before);
  h.$('redo').click(); assert.deepEqual(await h.download(), added);
  assert.ok(groups.filter(g => g !== group).every(g => !g.open));
});

test(`${production ? 'production' : 'source'} app: rejected foreign-profile import preserves current category folders, IDs and history`, async t => {
  const h = await setup(t), before = await h.download(), history = h.$('history-state').textContent;
  const common = h.document.querySelector('[data-catalog-section="common"]'); common.open = false;
  const buttons = [...h.document.querySelector('.catalog').querySelectorAll('[data-element-id]')];
  const envelope = JSON.parse(before), project = envelope.files.find(file => file.path === 'schemka.json');
  const header = JSON.parse(project.content); header.metamodel = { id: 'foreign<svg>', version: 900 }; project.content = JSON.stringify(header);
  h.$('file-button').click(); const file = new Blob([JSON.stringify(envelope)]); Object.defineProperty(file, 'name', { value: 'unsupported.schemka.json' });
  Object.defineProperty(h.$('project-file'), 'files', { value: [file], configurable: true });
  h.$('project-file').dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('load-project').click();
  for (let i = 0; i < 40 && !h.$('file-feedback').textContent.includes('Файл не открыт'); i++) await new Promise(resolve => setImmediate(resolve));
  assert.match(h.$('file-feedback').textContent, /Файл не открыт/); h.$('file-dialog').close();
  assert.equal(common.open, false); assert.equal(h.$('history-state').textContent, history);
  assert.deepEqual([...h.document.querySelector('.catalog').querySelectorAll('[data-element-id]')], buttons);
  assert.deepEqual(await h.download(), before); assert.equal(h.document.querySelector('.catalog').querySelectorAll('img,svg,script').length, 0);
});

test(`${production ? 'production' : 'source'} app: palette folding, native hints and search preserve selection, redo and native bytes`, async t => {
  const h = await setup(t);
  h.$('create-service').click(); h.$('element-name').value = 'Temporary item'; h.$('edit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })); h.$('undo').click();
  const target = h.$('canvas').querySelector('.node'); target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const selectedId = target.dataset.id, before = await h.download(), history = h.$('history-state').textContent;
  const group = h.document.querySelector('[data-palette-group="common"]'), summary = group.querySelector('summary'), tool = h.$('create-service');
  const folds = [...h.document.querySelectorAll('[data-palette-group]')]; for (const g of folds) g.open = false;
  summary.focus(); summary.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  assert.equal(h.$('delete-dialog').open, false); assert.equal(h.$('redo').disabled, false);
  h.$('palette-search').value = 'Service'; h.$('palette-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  assert.equal(group.open, true); tool.focus(); tool.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(tool.title,h.$('create-service-description').textContent); assert.equal(h.document.activeElement, tool);
  assert.equal(h.$('canvas').querySelector(`[data-id="${selectedId}"]`).getAttribute('aria-pressed'), 'true');
  h.$('palette-clear').click(); assert.ok(folds.every(g => !g.open));
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false); assert.deepEqual(await h.download(), before);
  h.$('redo').click(); assert.equal(deserializeProjectFile(await h.download()).elements.length, deserializeProjectFile(before).elements.length + 1);
  assert.ok(folds.every(g => !g.open), 'Model rendering leaves manual fold choices intact');
});
