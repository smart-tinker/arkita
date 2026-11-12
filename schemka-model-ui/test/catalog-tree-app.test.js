import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { createProject } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { profileId, profileDefinition } from '../../schemka-model-core/fixtures/customization-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { CATALOG_SECTIONS } from '../src/catalog-tree.js';

const wait = () => new Promise(resolve => setTimeout(resolve, 0));
const openTree = h => { for (const group of h.document.querySelectorAll('[data-catalog-section]')) group.open = true; for (let count = 0; count < 100; count++) { const closed = h.document.querySelector('.catalog details[data-folder-id]:not([open])'); if (!closed) return; closed.querySelector('summary button').click(); } throw Error('Tree did not finish opening'); };
const folder = (number, name, parentFolderId = null, members = []) => ({ id: fixtureId('fld', number), name, parentFolderId, members, documentation: '', properties: [] });
function filedModel() {
  const state = conceptProject();
  const refs = [...state.elements.map(item => ({ kind: 'element', id: item.id })), ...state.junctions.map(item => ({ kind: 'junction', id: item.id })), ...state.relationships.map(item => ({ kind: 'relationship', id: item.id })), ...state.views.map(item => ({ kind: 'view', id: item.view.id }))];
  state.folders = [folder(1, 'Imported root'), folder(2, 'Mixed objects', fixtureId('fld', 1), refs), folder(3, 'Empty legacy')];
  return state;
}
const leaf = (h, kind, id) => h.document.querySelector(`.catalog button[data-${kind}-id="${id}"]`);
function context(h, element) { element.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 90, clientY: 220 })); return h.$('context-menu'); }

test('catalog context creates a named model element before any view and supports cancel and Undo', async t => {
  const h = await setup(t); await h.load(serializeProjectFile(createProject('No view'))); const before = await h.download();
  const menu = context(h, h.$('tree-application').querySelector(':scope > summary'));
  menu.querySelector('[data-context-action="new-element"]').click();
  assert.equal(h.$('catalog-folder-dialog').open, true);
  const types = h.$('catalog-create-element-type');
  assert.ok([...types.options].some(option => option.value === 'ApplicationComponent'));
  assert.equal([...types.options].some(option => option.value === 'Role'), false);
  h.$('catalog-folder-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.deepEqual(await h.download(), before);

  context(h, h.$('tree-application').querySelector(':scope > summary')).querySelector('[data-context-action="new-element"]').click();
  h.$('catalog-create-element-name').value = '   ';
  h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('catalog-folder-dialog').open, true);
  assert.match(h.$('catalog-folder-error').textContent, /имя элемента/i);
  h.$('catalog-folder-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.deepEqual(await h.download(), before);

  context(h, h.$('tree-application').querySelector(':scope > summary')).querySelector('[data-context-action="new-element"]').click();
  h.$('catalog-create-element-type').value = 'ApplicationComponent';
  h.$('catalog-create-element-name').value = 'Без диаграммы α';
  h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('catalog-folder-dialog').open, false, h.$('catalog-folder-error').textContent);
  const saved = deserializeProjectFile(await h.download());
  assert.equal(saved.elements.at(-1).name, 'Без диаграммы α');
  assert.equal(saved.elements.at(-1).type, 'ApplicationComponent');
  assert.deepEqual(saved.views, []);
  assert.ok(h.document.querySelector(`[data-element-id="${saved.elements.at(-1).id}"]`));
  h.$('undo').click(); assert.deepEqual(await h.download(), before);
});

test('catalog element creation places the new object in the clicked section folder', async t => {
  const h = await setup(t), state = createProject('Folder destination');
  const folderId = fixtureId('fld', 91);
  state.folders.push({ id: folderId, name: 'Applications', parentFolderId: null, members: [], documentation: '', properties: [{ key: 'arkita:catalog-section', value: 'application' }] });
  await h.load(serializeProjectFile(state)); openTree(h);
  const row = h.$('tree-application').querySelector(`[data-folder-id="${folderId}"] > summary button`);
  context(h, row).querySelector('[data-context-action="new-element"]').click();
  assert.equal([...h.$('catalog-create-element-type').options].some(option => option.value === 'Role'), false);
  h.$('catalog-create-element-type').value = 'ApplicationInterface';
  h.$('catalog-create-element-name').value = 'Folder interface';
  h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const saved = deserializeProjectFile(await h.download());
  const created = saved.elements.find(item => item.name === 'Folder interface');
  assert.equal(created.type, 'ApplicationInterface');
  assert.deepEqual(saved.folders.find(item => item.id === folderId).members, [{ kind: 'element', id: created.id }]);
  assert.deepEqual(saved.views, []);
});

test('catalog tree creation applies the selected compatible specialization to the new concept', async t => {
  const h = await setup(t), state = createProject('Specialized tree creation');
  state.customizationProfiles = [{ id: profileId, ...profileDefinition() }];
  await h.load(serializeProjectFile(state)); openTree(h);
  const row = h.$('tree-application').querySelector(':scope > summary');
  context(h, row).querySelector('[data-context-action="new-element"]').click();
  const type = h.$('catalog-create-element-type'), specialization = h.$('catalog-create-element-specialization');
  type.value = 'ApplicationComponent'; type.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  assert.ok([...specialization.options].some(option => option.value === profileId && option.textContent.includes('ApplicationComponent')));
  specialization.value = profileId;
  h.$('catalog-create-element-name').value = 'Specialized from tree';
  h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  const saved = deserializeProjectFile(await h.download()), created = saved.elements.find(item => item.name === 'Specialized from tree');
  assert.equal(created.type, 'ApplicationComponent');
  assert.deepEqual(created.profileApplications, [{ profileId, values: {} }]);
  assert.deepEqual(saved.views, []);
});

test('one catalogue tree keeps every filed object reachable once with accurate section counts and full view scope', async t => {
  const h = await setup(t), state = filedModel(), bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes); openTree(h);
  const groups = [...h.$('catalog-folders-host').querySelectorAll('[data-catalog-section]')];
  assert.deepEqual(groups.map(group => group.dataset.catalogSection), CATALOG_SECTIONS.map(section => section.id));
  for (const absent of ['catalog-folder-back', 'catalog-folder-home', 'catalog-folder-breadcrumb', 'catalog-new-folder', 'tree-elements', 'tree-junctions']) assert.equal(h.$(absent), null);
  for (const [kind, items] of [['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships], ['view', state.views.map(entry => entry.view)]]) for (const item of items) {
    const matches = h.document.querySelectorAll(`.catalog button[data-${kind}-id="${item.id}"]`); assert.equal(matches.length, 1, `${kind}:${item.id}`);
    assert.equal(matches[0].closest('[data-folder-id]').dataset.folderId, fixtureId('fld', 2));
    if (kind === 'view') assert.equal(matches[0].dataset.viewScope, 'tree');
  }
  const counts = Object.fromEntries(groups.map(group => [group.dataset.catalogSection, Number(group.querySelector('summary .tree-count').textContent)]));
  assert.deepEqual(counts, { common: 3, strategy: 0, business: 0, application: 1, technology: 0, motivation: 0, implementation: 0, relationships: 12, views: 2 });
  assert.ok(h.$('tree-common').querySelector(`[data-folder-id="${fixtureId('fld', 3)}"]`));
  assert.equal(h.$('tree-application').querySelector(`[data-folder-id="${fixtureId('fld', 3)}"]`), null);
  const first = leaf(h, 'element', state.elements[0].id); first.click(); assert.equal(leaf(h, 'element', state.elements[0].id), first);
  assert.deepEqual(await h.download(), bytes); assert.equal(h.$('undo').disabled, true);
});

test('folder drill-down shows its path, returns through history, preserves the model and resets between projects', async t => {
  const h = await setup(t), state = filedModel(); await h.load(serializeProjectFile(state)); openTree(h);
  const before = await h.download(), folderId = fixtureId('fld', 1);
  const folderButton = h.$('tree-common').querySelector(`[data-folder-id="${folderId}"] > summary button`);
  context(h, folderButton).querySelector('[data-context-action="drill-into"]').click();
  assert.equal(h.$('catalog-folder-back').textContent, 'Назад');
  assert.equal(h.document.activeElement.id, 'catalog-folder-back');
  assert.equal(h.$('catalog-folder-home').textContent, 'К началу');
  assert.match(h.$('catalog-folder-breadcrumb').textContent, /Общие.*Imported root/);
  assert.equal(h.$('tree-common').hidden, false); assert.equal(h.$('tree-application').hidden, true);
  assert.ok(h.$('tree-common').querySelector(`[data-folder-id="${fixtureId('fld', 2)}"]`));
  assert.deepEqual(await h.download(), before); assert.equal(h.$('undo').disabled, true);

  h.$('catalog-folder-back').click(); assert.equal(h.$('catalog-folder-navigation'), null);
  assert.equal(h.document.activeElement, h.$('tree-common').querySelector(':scope > summary'));
  assert.equal(h.$('tree-application').hidden, false);
  context(h, h.$('tree-common').querySelector(`[data-folder-id="${folderId}"] > summary button`)).querySelector('[data-context-action="drill-into"]').click();
  h.$('catalog-folder-home').click(); assert.equal(h.$('catalog-folder-navigation'), null);
  await h.load(serializeProjectFile(conceptProject()));
  assert.equal(h.$('catalog-folder-navigation'), null);
  assert.equal(h.$('tree-application').hidden, false);
});

test('section and folder context menus create correctly located folders; disclosure keyboard cannot delete canvas objects', async t => {
  const h = await setup(t), state = filedModel(); await h.load(serializeProjectFile(state)); openTree(h);
  leaf(h, 'element', state.elements[0].id).click(); const before = await h.download();
  const summary = h.$('tree-technology').querySelector('summary'); summary.focus();
  for (const key of ['F2', 'Delete', 'Escape']) summary.dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  assert.equal(h.$('delete-dialog').open, false); assert.equal(h.document.querySelector('.inline-editor'), null); assert.deepEqual(await h.download(), before);
  const menu = context(h, summary); assert.equal(menu.querySelector('[data-context-action="properties"]'), null); menu.querySelector('[data-context-action="new-folder"]').click();
  h.$('catalog-folder-name').value = 'New technology'; h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('catalog-folder-dialog').open, false, h.$('catalog-folder-error').textContent);
  const saved = deserializeProjectFile(await h.download()), created = saved.folders.find(item => item.name === 'New technology'); assert.ok(created);
  assert.deepEqual(created.properties.find(item => item.key === 'arkita:catalog-section'), { key: 'arkita:catalog-section', value: 'technology' });
  assert.ok(h.$('tree-technology').querySelector(`[data-folder-id="${created.id}"]`)); h.$('undo').click(); assert.deepEqual(await h.download(), before);
});

test('mixed tree selection, properties and reuse preserve model identity through one Undo', async t => {
  const h = await setup(t), state = filedModel(); await h.load(serializeProjectFile(state)); openTree(h); const before = await h.download();
  leaf(h, 'element', state.elements[0].id).click();
  leaf(h, 'relationship', state.relationships[0].id).dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
  assert.match(h.$('catalog-selection-status').textContent, /2/);
  context(h, leaf(h, 'element', state.elements[0].id)).querySelector('[data-context-action="properties"]').click(); assert.equal(h.$('catalog-selection-dialog').open, true); h.$('catalog-selection-close').click();
  h.$('catalog-selection-clear').click();
  const add = h.document.querySelector(`.catalog [data-add-element-id="${state.elements[0].id}"]`); add.click();
  const after = deserializeProjectFile(await h.download()); assert.deepEqual(after.elements, state.elements); assert.deepEqual(after.relationships, state.relationships); assert.deepEqual(after.folders, state.folders);
  assert.equal(after.views.reduce((sum, entry) => sum + entry.occurrences.length, 0), state.views.reduce((sum, entry) => sum + entry.occurrences.length, 0) + 1);
  h.$('undo').click(); assert.deepEqual(await h.download(), before);
});

test('search and opening all filed views preserve the tree and model history', async t => {
  const h = await setup(t), state = filedModel(); await h.load(serializeProjectFile(state)); openTree(h); const before = await h.download();
  const root = h.$('tree-application'), views = h.$('views'), openAll = h.$('open-all-views'); root.open = false;
  h.$('model-search').value = state.elements[1].id; h.$('model-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  assert.equal(h.$('tree-model').hidden, true); assert.ok(h.$('model-search-results').querySelector(`[data-search-kind="element"][data-search-id="${state.elements[1].id}"]`)); h.$('model-search-results').querySelector(`[data-search-kind="element"][data-search-id="${state.elements[1].id}"]`).click();
  h.$('model-search-clear').click(); assert.equal(h.$('tree-model').hidden, false); assert.equal(h.$('tree-application'), root);
  openAll.click(); h.$('open-views-dialog').querySelector('[data-confirm]').click(); await wait(); await wait();
  assert.equal(h.$('view-tabs').querySelectorAll('[role="tab"]').length, state.views.length);
  assert.equal(h.$('views'), views); assert.equal(h.$('open-all-views'), openAll);
  for (const view of state.views) { const button = leaf(h, 'view', view.view.id); context(h, button).querySelector('[data-context-action="rename"]').click(); assert.ok(h.document.querySelector('.catalog .inline-editor')); h.document.querySelector('.inline-editor input').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  assert.deepEqual(await h.download(), before); assert.equal(h.$('undo').disabled, true);
});


test('mixed folder context keeps its projection when creating children and blocks paste from another section', async t => {
  const h = await setup(t), state = filedModel(); await h.load(serializeProjectFile(state)); openTree(h); const before = await h.download();
  const appFolder = () => h.$('tree-application').querySelector(`[data-folder-id="${fixtureId('fld', 2)}"] > summary button`);
  context(h, appFolder()).querySelector('[data-context-action="new-folder"]').click();
  h.$('catalog-folder-name').value = 'Application child'; h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('catalog-folder-dialog').open, false, h.$('catalog-folder-error').textContent);
  const after = deserializeProjectFile(await h.download()), child = after.folders.find(item => item.name === 'Application child');
  assert.equal(child.parentFolderId, fixtureId('fld', 2)); assert.deepEqual(child.properties.find(item => item.key === 'arkita:catalog-section'), { key: 'arkita:catalog-section', value: 'application' });
  h.$('undo').click(); assert.deepEqual(await h.download(), before); openTree(h);
  context(h, leaf(h, 'element', state.elements[0].id)).querySelector('[data-context-action="cut-concept"]').click();
  context(h, appFolder()).querySelector('[data-context-action="paste-concepts"]').click();
  assert.equal(h.$('catalog-folder-dialog').open, true); assert.equal(h.$('catalog-folder-apply').disabled, true); h.$('catalog-folder-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.deepEqual(await h.download(), before);
});

test('folder child-label templates affect immediate labels only, follow moves, and survive reopen without renaming records', async t => {
  const h = await setup(t), state = conceptProject(), child = state.elements[0];
  child.name = 'Service'; child.documentation = 'Keep this description'; child.properties = [{ key: 'owner', value: 'Ops' }];
  const parent = folder(91, 'Parent'), nested = folder(92, 'Nested', parent.id, [{ kind: 'element', id: child.id }]);
  state.folders = [parent, nested]; await h.load(serializeProjectFile(state)); openTree(h);
  const editTemplate = (folderId, value) => {
    const button = h.document.querySelector(`[data-folder-id="${folderId}"] > summary button`);
    context(h, button).querySelector('[data-context-action="edit-folder"]').click();
    const field = h.$('catalog-folder-child-label-template'); assert.ok(field, 'folder editor exposes its child-label template');
    field.value = value;
    h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(h.$('catalog-folder-dialog').open, false, h.$('catalog-folder-error').textContent);
  };
  editTemplate(parent.id, 'P:${name}'); editTemplate(nested.id, 'N:${name} · ${property:owner}');
  const label = id => h.document.querySelector(`[data-element-id="${id}"] .element-name`).textContent;
  assert.equal(h.document.querySelector(`[data-folder-id="${nested.id}"] > summary button`).textContent, 'P:Nested');
  assert.equal(label(child.id), 'N:Service · Ops');

  context(h, leaf(h, 'element', child.id)).querySelector('[data-context-action="move-concept"]').click();
  h.change('catalog-move-target', parent.id);
  h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('catalog-folder-dialog').open, false, h.$('catalog-folder-error').textContent);
  assert.equal(label(child.id), 'P:Service');
  const savedBytes = await h.download(), saved = deserializeProjectFile(savedBytes);
  assert.equal(saved.elements.find(item => item.id === child.id).name, 'Service');
  assert.equal(saved.elements.find(item => item.id === child.id).documentation, 'Keep this description');
  assert.deepEqual(saved.elements.find(item => item.id === child.id).properties, [{ key: 'owner', value: 'Ops' }]);
  assert.deepEqual(saved.folders.find(item => item.id === parent.id).members, [{ kind: 'element', id: child.id }]);
  assert.equal(saved.folders.find(item => item.id === parent.id).childLabelTemplate, 'P:${name}');
  assert.equal(saved.folders.find(item => item.id === nested.id).childLabelTemplate, 'N:${name} · ${property:owner}');

  await h.load(savedBytes); openTree(h); assert.equal(label(child.id), 'P:Service');
});

test('folder child-label expansion stays within the native string limit', async t => {
  const h = await setup(t), state = conceptProject(), child = state.elements[0];
  child.documentation = 'x'.repeat(8192);
  const parent = folder(93, 'Bounded', null, [{ kind: 'element', id: child.id }]);
  const nested = folder(94, 'x'.repeat(8192), parent.id); nested.documentation = child.documentation;
  parent.childLabelTemplate = '${documentation}'.repeat(511);
  state.folders = [parent, nested]; await h.load(serializeProjectFile(state)); openTree(h);
  const button = leaf(h, 'element', child.id), label = button.querySelector('.element-name').textContent;
  assert.equal(label.length, 8192);
  assert.ok(label.endsWith('…'));
  assert.ok(button.getAttribute('aria-label').includes(label));
  const nestedButton = h.document.querySelector(`[data-folder-id="${nested.id}"] > summary button`);
  assert.equal(nestedButton.textContent.length, 8192);
  assert.ok(nestedButton.textContent.endsWith('…'));
});
