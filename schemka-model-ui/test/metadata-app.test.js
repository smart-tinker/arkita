import test from 'node:test';
import assert from 'node:assert/strict';
import { production, setup } from './app-test-fixture.js';
import { importFiles, metadataRecord } from '../../schemka-model-core/src/index.js';
import { metadataFixture, metadataV3Fixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

const event = (h, id, type) => h.$(id).dispatchEvent(new h.window.Event(type, { bubbles: true, cancelable: true }));
function openOwner(h, owner, field) {
  if (owner.kind === 'relationship') {
    h.document.querySelector(`[data-relationship-id="${owner.id}"]`).click();
    (field === 'documentation' ? h.document.querySelector('[data-inspector-action="documentation"]') : h.$('object-properties-edit')).click();
  } else {
    h.$(owner.kind === 'project' ? 'project-metadata' : 'view-metadata').click();
    assert.equal(h.$('metadata-dialog').open, true); h.$(`metadata-${field}`).click();
    assert.equal(h.$('metadata-dialog').open, false);
  }
}

test(`${production ? 'production' : 'source'} metadata app: project, view and shared relationship documents/properties edit their exact owners and undo once`, async t => {
  const h = await setup(t), state = importFiles(metadataV3Fixture().files), initial = serializeProjectFile(state);
  await h.load(initial);
  const selectedViewId = h.document.querySelector('#view-tabs [aria-selected="true"]').dataset.viewId;
  for (const owner of [{ kind: 'project', id: state.project.id }, { kind: 'view', id: selectedViewId }, { kind: 'relationship', id: state.relationships[0].id }]) {
    await h.load(initial); const expected = structuredClone(state);
    openOwner(h, owner, 'documentation'); assert.equal(h.$('documentation-dialog').open, true);
    const documentation = ` ${owner.kind}\n<script>inert()</script> 日本語 🧭 `;
    h.$('documentation-value').value = documentation; event(h, 'documentation-value', 'input'); event(h, 'documentation-form', 'submit'); event(h, 'documentation-form', 'submit');
    metadataRecord(expected, owner).documentation = documentation;
    assert.equal(h.$('documentation-dialog').open, false); assert.equal(h.$('file-state').dataset.dirty, 'true');
    const documented = await h.download(); assert.deepEqual(deserializeProjectFile(documented), expected);
    assert.match(h.$('history-state').textContent, /1 действий/);
    h.$('undo').click(); assert.deepEqual(await h.download(), Buffer.from(initial));
    h.$('redo').click(); assert.deepEqual(await h.download(), documented);
    openOwner(h, owner, 'properties'); assert.equal(h.$('object-properties-dialog').open, true);
    h.$('object-property-add').click();
    const rows = h.document.querySelectorAll('#object-properties-fields .property-row'), row = rows[rows.length - 1];
    row.querySelector('[name=name]').value = 'Owner 🧭'; row.querySelector('[name=value]').value = '<img src=x> exact';
    event(h, 'object-properties-form', 'submit'); event(h, 'object-properties-form', 'submit');
    metadataRecord(expected, owner).properties.push({ key: 'Owner 🧭', value: '<img src=x> exact' });
    const changed = await h.download(); assert.deepEqual(deserializeProjectFile(changed), expected);
    assert.equal(h.document.querySelector('#metadata-content img,#metadata-content script,#object-properties-dialog img'), null);
    h.$('undo').click(); assert.deepEqual(await h.download(), documented); h.$('redo').click(); assert.deepEqual(await h.download(), changed);
    await h.load(changed); assert.equal(h.$('undo').disabled, true); assert.deepEqual(await h.download(), changed);
  }
});

test(`${production ? 'production' : 'source'} metadata app: both legacy formats require a separate current copy without changing source bytes`, async t => {
  for (const original of [metadataFixture(), metadataV3Fixture()]) {
    const h = await setup(t); await h.load(original.bytes);
    assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.match(h.$('file-state').textContent, /Формат модели обновлён/);
    h.$('file-button').click(); assert.match(h.$('file-dialog-state').textContent, /Исходная модель сохранена без изменений/); h.$('file-dialog').close();
    const owner = { kind: 'project', id: importFiles(original.files).project.id };
    openOwner(h, owner, 'documentation'); h.$('documentation-value').value = 'temporary'; event(h, 'documentation-value', 'input'); event(h, 'documentation-form', 'submit');
    h.$('undo').click(); assert.equal(h.$('file-state').dataset.dirty, 'true');
    const converted = Buffer.from(serializeProjectFile(importFiles(original.files)));
    assert.deepEqual(await h.download(), converted); assert.equal(h.$('file-state').dataset.dirty, 'false');
    await h.load(converted); assert.equal(h.$('file-state').dataset.dirty, 'false');
    const sourceVersion = JSON.parse(original.files.find(file => file.path === 'schemka.json').content).formatVersion;
    assert.deepEqual(original, sourceVersion === 2 ? metadataFixture() : metadataV3Fixture());
  }
});

test(`${production ? 'production' : 'source'} metadata app: model search selects model metadata and opens context properties without selecting a drawing`, async t => {
  const h = await setup(t), state = importFiles(metadataV3Fixture().files); state.project.documentation = 'Unique model needle';
  await h.load(serializeProjectFile(state));
  h.$('model-search').value = 'unique model needle'; event(h, 'model-search', 'input');
  const results = h.document.querySelectorAll('#model-search-results button'); assert.equal(results.length, 1);
  assert.equal(results[0].dataset.searchKind, 'project'); results[0].click();
  assert.equal(h.document.querySelector('dialog[open]'), null); assert.equal(h.$('canvas').querySelectorAll('.selected[data-kind]').length, 0);
  const current = h.$('model-search-results').querySelector(`[data-search-kind="project"][data-search-id="${state.project.id}"]`); current.focus();
  current.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 300 }));
  const properties = h.$('context-menu').querySelector('[data-context-action="properties"]'); assert.ok(properties); assert.equal(properties.getAttribute('role'), 'menuitem'); properties.click();
  assert.equal(h.$('metadata-dialog').open, true); assert.ok(h.$('metadata-content').textContent.includes(state.project.documentation));
  h.$('metadata-close').click(); assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('undo').disabled, true);
});

test(`${production ? 'production' : 'source'} metadata app: closing a menu panel returns focus to its visible menu and opening an editor retains editor focus`, async t => {
  const h = await setup(t);
  const menu = h.document.querySelector('[data-command="project-metadata"]').closest('details').querySelector('summary');
  h.$('project-metadata').click(); h.$('metadata-close').click(); assert.equal(h.document.activeElement, menu);
  h.$('project-metadata').click(); h.$('metadata-documentation').click();
  h.$('metadata-dialog').dispatchEvent(new h.window.Event('close'));
  assert.equal(h.document.activeElement, h.$('documentation-value')); assert.equal(h.$('documentation-dialog').open, true);
});
