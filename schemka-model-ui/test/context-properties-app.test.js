import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

function contextProperties(h, selector) {
  const target = h.document.querySelector(selector); assert.ok(target, selector); target.focus();
  target.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 300 }));
  assert.equal(h.$('context-menu').hidden, false);
  const command = h.$('context-menu').querySelector('[data-context-action="properties"]'); assert.ok(command); assert.equal(command.getAttribute('role'), 'menuitem'); command.click();
}
function selectGroup(h, state) {
  for (const item of h.document.querySelectorAll('.catalog details')) item.open = true;
  h.document.querySelector(`.catalog button[data-element-id="${state.elements[0].id}"]`).click();
  h.document.querySelector(`.catalog button[data-relationship-id="${state.relationships[0].id}"]`).dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
  assert.equal(h.$('catalog-selection-summary').hidden, false); assert.match(h.$('catalog-selection-status').textContent, /2/);
}

test(`${production ? 'production' : 'source'} context properties bind an unrelated tree hit and keep a hit inside the group scoped to the group`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  selectGroup(h, state);
  contextProperties(h, `.catalog button[data-element-id="${state.elements[1].id}"]`);
  assert.equal(h.$('catalog-selection-dialog').open, false); assert.equal(h.$('inspector-panel').open, true); assert.ok(h.$('inspector-content').textContent.includes(state.elements[1].id));
  h.$('inspector-close').click(); assert.equal(h.document.querySelector('dialog[open]'), null); assert.deepEqual(await h.download(), bytes);
  selectGroup(h, state);
  contextProperties(h, `.catalog button[data-element-id="${state.elements[0].id}"]`);
  assert.equal(h.$('inspector-panel').open, false); assert.equal(h.$('catalog-selection-dialog').open, true); assert.match(h.$('catalog-selection-details').textContent, /Выбрано 2/);
  assert.ok(h.$('catalog-selection-details').textContent.includes(state.elements[0].id)); assert.ok(h.$('catalog-selection-details').textContent.includes(state.relationships[0].id));
  h.$('catalog-selection-close').click(); assert.deepEqual(await h.download(), bytes); assert.match(h.$('history-state').textContent, /0 действий/);
});

test(`${production ? 'production' : 'source'} metadata context properties keep mixed group scope and unrelated folders open their own modal`, async t => {
  const { createStore } = await import('../../schemka-model-core/src/index.js');
  const store = createStore(conceptProject()), folderId = store.execute({ type: 'createFolder', name: 'Exact folder' }, store.revision).created.folderId;
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)), h = await setup(t); await h.load(bytes);
  for (const item of h.document.querySelectorAll('.catalog details')) item.open = true;
  h.document.querySelector(`.catalog button[data-element-id="${state.elements[0].id}"]`).click();
  h.$('project-tree-name').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
  assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(h.$('catalog-selection-summary').hidden, false);
  contextProperties(h, '#project-tree-name');
  assert.equal(h.$('metadata-dialog').open, false); assert.equal(h.$('catalog-selection-dialog').open, true); assert.ok(h.$('catalog-selection-details').textContent.includes(state.project.id)); assert.ok(h.$('catalog-selection-details').textContent.includes(state.elements[0].id));
  h.$('catalog-selection-close').click();
  contextProperties(h, `[data-folder-focus="${folderId}"]`);
  assert.equal(h.$('catalog-selection-dialog').open, false); assert.equal(h.$('metadata-dialog').open, true); assert.equal(h.$('metadata-title').textContent, 'Свойства папки'); assert.ok(h.$('metadata-content').textContent.includes(folderId));
  h.$('metadata-close').click(); assert.deepEqual(await h.download(), bytes); assert.match(h.$('history-state').textContent, /0 действий/);
});

test(`${production ? 'production' : 'source'} folder documentation has folder-specific scope and roundtrips on that folder`, async t => {
  const { createStore } = await import('../../schemka-model-core/src/index.js');
  const store = createStore(conceptProject()), folderId = store.execute({ type: 'createFolder', name: 'Documentation owner' }, store.revision).created.folderId;
  const state = store.snapshot, bytes = Buffer.from(serializeProjectFile(state)), h = await setup(t); await h.load(bytes);
  for (const item of h.document.querySelectorAll('.catalog details')) item.open = true;
  contextProperties(h, `[data-folder-focus="${folderId}"]`); h.$('metadata-documentation').click();
  assert.equal(h.$('documentation-dialog').open, true);
  assert.match(h.$('documentation-reference').textContent, /Документация этой папки/);
  h.$('documentation-value').value = 'Folder-only instructions';
  h.$('documentation-value').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  h.$('documentation-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const savedBytes = await h.download(), saved = deserializeProjectFile(savedBytes);
  assert.equal(saved.folders.find(item => item.id === folderId).documentation, 'Folder-only instructions');
  assert.deepEqual(saved.elements, state.elements); assert.deepEqual(saved.relationships, state.relationships);
  await h.load(savedBytes); contextProperties(h, `[data-folder-focus="${folderId}"]`);
  assert.equal(h.$('metadata-content').querySelector('.documentation-text').textContent, 'Folder-only instructions');
});

test(`${production ? 'production' : 'source'} Edit properties keeps the tree group when its primary concept is drawn on the canvas`, async t => {
  const h = await setup(t), state = conceptProject(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  selectGroup(h, state);
  assert.equal(h.$('canvas').querySelector('[data-kind="connection"][aria-pressed="true"]').dataset.renameId, state.relationships[0].id);
  const command = h.document.querySelector('[data-command="inspector-button"]'); assert.ok(command); command.closest('.app-menu').open = true; command.click();
  assert.equal(h.$('inspector-panel').open, false); assert.equal(h.$('catalog-selection-dialog').open, true); assert.match(h.$('catalog-selection-details').textContent, /Выбрано 2/);
  assert.ok(h.$('catalog-selection-details').textContent.includes(state.elements[0].id)); assert.ok(h.$('catalog-selection-details').textContent.includes(state.relationships[0].id));
  h.$('catalog-selection-close').click(); assert.deepEqual(await h.download(), bytes); assert.match(h.$('history-state').textContent, /0 действий/);
});
