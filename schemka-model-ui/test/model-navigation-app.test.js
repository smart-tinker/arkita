import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { usageFixture } from './where-used-fixture.js';

const mode = production ? 'production' : 'source';
const press = (h, target, key) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const historyState = h => ({ text: h.$('history-state').textContent, undo: h.$('undo').disabled, redo: h.$('redo').disabled, dirty: h.$('file-state').dataset.dirty });
const usageAction = h => h.$('inspector-content').querySelector('[data-inspector-action="where-used"]');
function search(h, query, category) {
  h.$('model-search').value = query;
  h.$('model-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  h.change('model-search-category', category);
}
function openProperties(h, reference) {
  const result = h.$('model-search-results').querySelector(`[data-search-kind="${reference.kind}"][data-search-id="${reference.id}"]`);
  assert.ok(result); result.focus(); result.click();
  assert.equal(h.document.querySelector('dialog[open]'), null);
  const current = h.$('model-search-results').querySelector(`[data-search-kind="${reference.kind}"][data-search-id="${reference.id}"]`); assert.ok(current); current.focus();
  current.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 300 }));
  const properties = h.$('context-menu').querySelector('[data-context-action="properties"]'); assert.ok(properties); assert.equal(properties.getAttribute('role'), 'menuitem'); properties.click();
  assert.equal(h.$('inspector-panel').open, true);
  assert.equal(h.$('inspector-content').querySelector('.object-name').dataset.renameId, reference.id);
  return current;
}
function openUsages(h) {
  const action = usageAction(h); assert.ok(action); action.focus(); action.click();
  assert.equal(h.$('inspector-panel').open, false);
  assert.equal(h.$('where-used-dialog').open, true);
}
function renameProject(h, name) {
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); assert.ok(input);
  input.value = name; input.dispatchEvent(new h.window.Event('input', { bubbles: true })); press(h, input, 'Enter');
}

test(`${mode} model navigation: search, properties and usages retain the query, precise drawing, focus and both histories`, async t => {
  const h = await setup(t), fixture = usageFixture(); await h.load(serializeProjectFile(fixture.state));
  renameProject(h, 'Past'); renameProject(h, 'Future'); h.$('undo').click();
  const expected = structuredClone(fixture.state); expected.project.name = 'Past';
  const before = historyState(h); assert.equal(before.dirty, 'true'); assert.equal(before.undo, false); assert.equal(before.redo, false);
  search(h, 'Одинаковое', 'element');
  assert.equal(h.$('model-search-results').querySelectorAll('button').length, 3);
  assert.equal(h.$('model-search-results').querySelector('img,svg,script'), null);
  let oldSearch, oldUsage;
  for (const id of fixture.visibleOccurrences) {
    const source = openProperties(h, fixture.refs.element); openUsages(h);
    if (oldSearch) { oldSearch.click(); oldUsage.click(); assert.equal(h.$('where-used-dialog').open, true); }
    const result = h.$('where-used-list').querySelector(`[data-drawing-id="${id}"]`); assert.ok(result); result.click();
    assert.equal(h.$('where-used-dialog').open, false);
    assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, fixture.otherViewId);
    const selected = h.$('canvas').querySelector('.node.selected'); assert.equal(selected.dataset.id, id);
    assert.equal(h.document.activeElement, selected);
    const bounds = expected.views.find(entry => entry.view.id === fixture.otherViewId).occurrences.find(item => item.id === id).bounds;
    const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(/\s+/).map(Number);
    assert.ok(bounds.x >= x && bounds.y >= y && bounds.x + bounds.width <= x + width && bounds.y + bounds.height <= y + height, 'Exact drawing is inside the camera');
    assert.equal(h.$('model-search').value, 'Одинаковое'); assert.equal(h.$('model-search-category').value, 'element');
    assert.equal(h.$('model-search-results').querySelectorAll('button').length, 3);
    assert.equal(source.isConnected, false); source.click(); result.click();
    assert.equal(h.$('inspector-panel').open, false); assert.equal(h.$('where-used-dialog').open, false);
    assert.equal(h.document.activeElement, selected); assert.deepEqual(historyState(h), before);
    oldSearch = source; oldUsage = result;
  }
  h.change('model-search-category', 'relationship');
  assert.equal(h.$('model-search-results').querySelectorAll('button').length, 2);
  openProperties(h, fixture.refs.relationship); openUsages(h);
  const oldHidden = h.$('where-used-list').querySelector('[data-hidden="true"]'); assert.ok(oldHidden);
  assert.match(oldHidden.textContent, /Скрыт viewpoint/);
  h.$('where-used-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.equal(h.$('inspector-panel').open, true); assert.equal(h.document.activeElement, usageAction(h));
  assert.equal(h.$('model-search').value, 'Одинаковое'); assert.equal(h.$('model-search-category').value, 'relationship');
  openUsages(h); oldHidden.click(); assert.equal(h.$('where-used-dialog').open, true);
  const hidden = h.$('where-used-list').querySelector('[data-hidden="true"]'), hiddenId = hidden.dataset.drawingId;
  hidden.click();
  assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, fixture.primaryViewId);
  assert.equal(h.$('canvas').querySelector(`[data-id="${hiddenId}"]`), null);
  assert.equal(h.$('inspector-content').querySelector('.object-name').dataset.renameId, fixture.refs.relationship.id);
  assert.equal(h.document.activeElement, h.$('canvas'));
  assert.match(h.$('status').textContent, /Скрыт viewpoint.*viewpoint не изменён/);
  assert.equal(h.$('model-search').value, 'Одинаковое'); assert.equal(h.$('model-search-category').value, 'relationship');
  assert.deepEqual(historyState(h), before);
  assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(expected)));
  h.$('redo').click(); expected.project.name = 'Future'; assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(expected)));
  h.$('undo').click(); expected.project.name = 'Past'; assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(expected)));
});

test(`${mode} model navigation: a pointer on Where used preserves an unfinished name draft until explicit cancellation`, async t => {
  const h = await setup(t), fixture = usageFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes);
  search(h, fixture.refs.element.id, 'element'); openProperties(h, fixture.refs.element);
  h.$('inspector-content').querySelector('.object-name').click();
  const input = h.$('inspector-content').querySelector('.inline-editor input'); assert.ok(input);
  input.value = 'Uncommitted name'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  const before = historyState(h), action = usageAction(h);
  const down = h.pointer(action, 'pointerdown');
  if (!down.defaultPrevented) action.focus();
  h.pointer(action, 'pointerup'); action.click(); await Promise.resolve();
  assert.equal(h.$('inspector-panel').open, true, 'Properties remain open while the name draft blocks navigation');
  assert.equal(h.$('where-used-dialog').open, false);
  assert.equal(h.$('inspector-content').querySelector('.inline-editor input'), input);
  assert.equal(input.value, 'Uncommitted name'); assert.equal(h.document.activeElement, input);
  assert.equal(h.$('model-search').value, fixture.refs.element.id); assert.deepEqual(historyState(h), before);
  press(h, input, 'Escape'); assert.equal(h.$('inspector-content').querySelector('.inline-editor'), null);
  openUsages(h); h.$('where-used-close').click();
  assert.equal(h.$('inspector-panel').open, true); assert.equal(h.document.activeElement, usageAction(h));
  h.$('inspector-close').click(); assert.deepEqual(historyState(h), before);
  assert.deepEqual(await h.download(), bytes);
});
