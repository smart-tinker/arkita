import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { usageFixture } from './where-used-fixture.js';
import { connectionGeometry } from '../src/connection-geometry.js';

const mode = production ? 'production' : 'source';
const press = (h, target, key) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const historyState = h => ({ text: h.$('history-state').textContent, undo: h.$('undo').disabled, redo: h.$('redo').disabled, dirty: h.$('file-state').dataset.dirty });
function open(h, reference) {
  const selector = `[data-${reference.kind}-id="${reference.id}"]`;
  const item = h.document.querySelector(selector); assert.ok(item); item.click();
  h.$('inspector-button').click(); assert.equal(h.$('inspector-panel').open, true);
  const action = h.$('inspector-content').querySelector('[data-inspector-action="where-used"]');
  assert.ok(action); action.focus(); action.click();
  assert.equal(h.$('inspector-panel').open, false); assert.equal(h.$('where-used-dialog').open, true);
}
function result(h, id) { const item = h.$('where-used-list').querySelector(`[data-drawing-id="${id}"]`); assert.ok(item); return item; }
function contains(h, bounds) {
  const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(/\s+/).map(Number);
  assert.ok(bounds.x >= x && bounds.y >= y && bounds.x + bounds.width <= x + width && bounds.y + bounds.height <= y + height, 'Camera reveals the exact selected drawing');
}
function renameProject(h, name) {
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); assert.ok(input);
  input.value = name; input.dispatchEvent(new h.window.Event('input', { bubbles: true })); press(h, input, 'Enter');
}

test(`${mode} where-used app: each precise occurrence opens its view, is selected/revealed/focused and preserves dirty plus both histories`, async t => {
  const h = await setup(t), fixture = usageFixture(); await h.load(serializeProjectFile(fixture.state));
  renameProject(h, 'Past'); renameProject(h, 'Future'); h.$('undo').click();
  const expected = structuredClone(fixture.state); expected.project.name = 'Past';
  const before = historyState(h); assert.equal(before.dirty, 'true'); assert.equal(before.undo, false); assert.equal(before.redo, false);
  for (const id of fixture.visibleOccurrences) {
    open(h, fixture.refs.element);
    assert.equal(h.$('where-used-list').querySelectorAll('button').length, 4);
    assert.equal(h.$('where-used-dialog').querySelector('img,script,svg'), null);
    const button = result(h, id); button.click(); button.click();
    assert.equal(h.$('where-used-dialog').open, false);
    assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, fixture.otherViewId);
    const selected = h.$('canvas').querySelector('.node.selected'); assert.equal(selected.dataset.id, id);
    assert.equal(h.document.activeElement, selected);
    contains(h, expected.views.find(entry => entry.view.id === fixture.otherViewId).occurrences.find(item => item.id === id).bounds);
    assert.deepEqual(historyState(h), before);
  }
  assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(expected)));
  h.$('redo').click(); expected.project.name = 'Future'; assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(expected)));
});

test(`${mode} where-used app: junction and relationship properties navigate to the exact drawing rather than a same-name object`, async t => {
  const h = await setup(t), fixture = usageFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes);
  for (const [reference, id, kind] of [[fixture.refs.junction, fixture.visibleJunctionId, 'occurrence'],
    ...fixture.visibleConnections.map(id => [fixture.refs.relationship, id, 'connection'])]) {
    open(h, reference); result(h, id).click();
    const selected = h.$('canvas').querySelector(`[data-kind="${kind}"].selected`);
    assert.equal(selected.dataset.id, id); assert.equal(h.document.activeElement, selected);
    assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, fixture.otherViewId);
    if (kind === 'connection') {
      const connection = fixture.state.views.find(entry => entry.view.id === fixture.otherViewId).connections.find(item => item.id === id);
      const occurrences = fixture.state.views.find(entry => entry.view.id === fixture.otherViewId).occurrences;
      contains(h, connectionGeometry(connection, occurrences).bounds);
    }
  }
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} where-used app: hidden results explain the viewpoint, keep its binding and focus the canvas with the shared concept selected`, async t => {
  const h = await setup(t), fixture = usageFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes);
  for (const reference of [fixture.refs.element, fixture.refs.relationship]) {
    open(h, reference); const hidden = h.$('where-used-list').querySelector('[data-hidden="true"]');
    assert.ok(hidden); assert.match(hidden.textContent, /Скрыт viewpoint/); const id = hidden.dataset.drawingId;
    hidden.click(); assert.equal(h.$('where-used-dialog').open, false);
    assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, fixture.primaryViewId);
    assert.equal(h.$('canvas').querySelector(`[data-id="${id}"]`), null);
    assert.equal(h.$('inspector-content').querySelector('.object-name').dataset.renameId, reference.id);
    assert.equal(h.document.activeElement, h.$('canvas'));
    assert.match(h.$('status').textContent, /Скрыт viewpoint.*viewpoint не изменён/);
  }
  assert.equal(h.$('undo').disabled, true); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} where-used app: empty state, Escape and stale buttons after view transition preserve the file and restore useful focus`, async t => {
  const h = await setup(t), fixture = usageFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes);
  open(h, fixture.refs.unused); assert.match(h.$('where-used-count').textContent, /пока нет рисунков/);
  assert.equal(h.document.activeElement, h.$('where-used-close'));
  h.$('where-used-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.equal(h.$('where-used-dialog').open, false); assert.equal(h.$('inspector-panel').open, true);
  assert.equal(h.document.activeElement.dataset.inspectorAction, 'where-used'); h.$('inspector-close').click();
  open(h, fixture.refs.element); const old = result(h, fixture.visibleOccurrences[0]);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click();
  assert.equal(h.$('where-used-dialog').open, false); const camera = h.$('canvas').getAttribute('viewBox');
  old.click(); assert.equal(h.$('canvas').getAttribute('viewBox'), camera); assert.equal(h.$('canvas').querySelector('.selected'), null);
  open(h, fixture.refs.element); old.click(); assert.equal(h.$('where-used-dialog').open, true);
  h.$('where-used-close').click(); h.$('inspector-close').click(); assert.deepEqual(await h.download(), bytes);
});
