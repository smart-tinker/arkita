import test from 'node:test';
import assert from 'node:assert/strict';
import {PREFERENCES_KEY,deserializePreferences} from '../src/preferences.js';
import { production, setup } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const mode = production ? 'production' : 'source';
const key = (h, target, value) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const history = h => [h.$('history-state').textContent, h.$('file-state').dataset.dirty, h.$('undo').disabled, h.$('redo').disabled];
function assertPanel(h, name) {
  assert.equal(h.document.body.dataset.mobilePanel, name);
  for (const item of h.document.querySelectorAll('[data-panel]')) assert.equal(item.getAttribute('aria-pressed'), String(item.dataset.panel === name));
  for (const [panel, selector] of [['catalog', '.catalog'], ['canvas', '.canvas-panel'], ['inspector', '.toolbox']]) assert.equal(h.document.querySelector(selector).getClientRects().length > 0, panel === name);
}

test(`${mode} workspace routes hidden mobile panels through a visible fallback and reveals an explicitly selected tab`, async t => {
  const h = await setup(t), bytes = Buffer.from(serializeProjectFile(conceptProject())); await h.load(bytes); h.viewport.narrow = true;
  const before = history(h);
  for (const [name, setting] of [['catalog', 'catalog'], ['inspector', 'palette']]) {
    const tab = h.document.querySelector(`[data-panel="${name}"]`); tab.click(); assertPanel(h, name);
    h.$(`workspace-toggle-${setting}`).click(); assertPanel(h, 'canvas');
    assert.equal(h.document.body.dataset[setting === 'catalog' ? 'workspaceCatalog' : 'workspacePalette'], 'false');
    tab.click(); assertPanel(h, name);
    assert.equal(deserializePreferences(h.window.localStorage.getItem(PREFERENCES_KEY)).workspace[setting], true);
  }
  h.$('workspace-button').click(); h.$('workspace-palette').checked = false;
  h.$('workspace-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assertPanel(h, 'canvas'); assert.deepEqual(history(h), before); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} queued help handoff cannot leave or cancel an active metadata draft`, async t => {
  const h = await setup(t), bytes = Buffer.from(serializeProjectFile(conceptProject())); await h.load(bytes);
  h.$('project-metadata').click(); h.$('metadata-documentation').click(); const input = h.$('documentation-value'), before = history(h);
  input.value = 'Незавершённая документация <script> 日本語'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  key(h, input, 'F1'); assert.equal(h.$('help-dialog').open, true); assert.match(h.$('help-article').textContent, /Документация и свойства/);
  h.document.querySelector('[data-help-topic="tutorial"]').click();
  const help = h.$('help-dialog'); help.close = () => help.removeAttribute('open');
  h.$('help-tutorial').querySelectorAll('li button')[1].click();
  help.dispatchEvent(new h.window.Event('close'));
  assert.equal(h.$('documentation-dialog').open, true); assert.equal(h.document.activeElement, input);
  assert.equal(input.value, 'Незавершённая документация <script> 日本語'); assert.match(h.$('status').textContent, /перед переходом к учебной команде/);
  assert.deepEqual(history(h), before);
  h.$('documentation-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.deepEqual(await h.download(), bytes);
});

test(`${mode} workspace, help, graph and minimap triggers preserve the same buffered rename and both history controls`, async t => {
  const h = await setup(t), bytes = Buffer.from(serializeProjectFile(conceptProject())); await h.load(bytes);
  h.$('minimap-toggle').click(); h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'), before = history(h);
  input.value = 'Оставить черновик'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  for (const id of ['workspace-button', 'workspace-toggle-catalog', 'workspace-toggle-palette', 'workspace-reset', 'workspace-resize-catalog', 'workspace-resize-palette', 'help-button', 'model-analysis-button', 'context-hints-toggle', 'minimap', 'minimap-close', 'minimap-toggle']) {
    const control = h.$(id); h.pointer(control, 'pointerdown'); control.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(h.document.querySelector('.inline-editor input'), input, id); assert.equal(input.value, 'Оставить черновик', id); assert.equal(h.document.activeElement, input, id);
  }
  assert.deepEqual(history(h), before); key(h, input, 'Escape'); assert.deepEqual(await h.download(), bytes);
});


test(`${mode} pane resizing persists local preferences while keeping model bytes, Undo and Redo intact`, async t => {
  const h = await setup(t), bytes = Buffer.from(serializeProjectFile(conceptProject())); await h.load(bytes);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Shared saved name'; key(h, input, 'Enter');
  h.$('undo').click(); const before = history(h), handle = h.$('workspace-resize-catalog');
  const pointer = (target, type, clientX) => {
    const event = new h.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, buttons: 1, isPrimary: true, pointerId: 71, clientX }); target.dispatchEvent(event);
  };
  const saved = h.window.localStorage.getItem(PREFERENCES_KEY);
  pointer(handle, 'pointerdown', 270); pointer(h.window, 'pointermove', 230);
  assert.equal(h.window.localStorage.getItem(PREFERENCES_KEY), saved); assert.deepEqual(history(h), before);
  pointer(h.window, 'pointerup', 230);
  // The DOM harness fixes every rectangle at 900px, so actual width starts at the clamped 270px.
  assert.equal(deserializePreferences(h.window.localStorage.getItem(PREFERENCES_KEY)).workspace.catalogWidth, 230);
  assert.deepEqual(history(h), before); assert.deepEqual(await h.download(), bytes);
  h.$('redo').click(); assert.match(h.$('project-name').textContent, /Shared saved name/);
});
