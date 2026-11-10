import { readFileSync } from 'node:fs';
import { createStore, createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, richLifecycleFixture } from './app-test-fixture.js';
import { deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';

test('app exposes V4 folders and visual dialogs; selection, properties, style and Undo survive native file roundtrip', async t => {
  const h = await setup(t), event = (id, type) => h.$(id).dispatchEvent(new h.window.Event(type, { bubbles: true, cancelable: true }));
  h.$('visual-add-note').click(); h.$('visual-text').value = 'A note\n<script>inert</script>'; event('visual-form', 'submit'); assert.equal(h.$('visual-dialog').open, false, h.$('visual-error').textContent);
  const drawn = h.document.querySelector('[data-kind="visualNode"]'); assert.ok(drawn); assert.ok(!drawn.querySelector('script')); assert.equal(h.$('inspector-button').disabled, false);
  h.$('inspector-button').click(); assert.equal(h.$('visual-dialog').open, true); h.$('visual-cancel').click();
  h.$('visual-style').click(); h.$('visual-fill').value = '#123456'; event('visual-form', 'submit');
  h.$('tree-common').querySelector('summary').dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 80, clientY: 220 }));
  h.$('context-menu').querySelector('[data-context-action="new-folder"]').click(); h.$('catalog-folder-name').value = 'Annotations';
  // The form, rather than its dialog, owns submit.
  if (h.$('catalog-folder-dialog').open) h.$('catalog-folder-dialog').querySelector('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('catalog-folder-dialog').open, false, h.$('catalog-folder-error').textContent);
  const bytes = await h.download(), state = deserializeProjectFile(bytes); assert.ok(state.folders.some(item => item.name === 'Annotations')); assert.ok(state.views.some(entry => entry.visualNodes.some(item => item.text === 'A note\n<script>inert</script>' && item.style.fill === '#123456')));
  await h.load(bytes); assert.deepEqual(await h.download(), bytes);
});


test('nested container backgrounds paint before leaves with stable sibling order', async t => {
  const store = createStore(createProject('Layers')), run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Main' });
  const add = (kind, name, zIndex, parent = null) => run({ type: 'createVisualNode', viewId, kind, name, zIndex, parent, bounds: { x: 30, y: 30, width: 200, height: 100 }, ...(kind === 'note' ? { text: name } : {}) }).visualNodeId;
  const a = add('group', 'A', 0), b = add('group', 'B', 1), childA = add('note', 'Child A', 999, { kind: 'visualNode', id: a }), childB = add('note', 'Child B', -999, { kind: 'visualNode', id: b });
  const h = await setup(t); await h.load(serializeProjectFile(store.snapshot));
  assert.deepEqual([...h.$('canvas').querySelectorAll('g[data-kind="visualNode"]')].map(item => item.dataset.id), [a, b, childA, childB]);
  const bytes = await h.download(); assert.deepEqual(bytes, Buffer.from(serializeProjectFile(store.snapshot)));
});


test('actual renderer report preview excludes records from metadata and embedded diagrams without changing the open view or history', async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes); h.document.querySelector(`[data-view-id="${fixture.viewId}"]`).click(); const title = h.$('view-title').textContent;
  const style = h.document.createElement('style'); style.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8'); h.document.head.append(style);
  h.$('export-report-button').click(); h.$('export-report-format').value = 'html'; h.$('export-report-format').dispatchEvent(new h.window.Event('change', { bubbles: true }));
  [...h.$('export-report-exclude').options].find(option => option.value === fixture.a.elementId).selected = true; h.$('export-report-exclude').dispatchEvent(new h.window.Event('change', { bubbles: true })); h.$('export-report-generate').click();
  for (let attempt = 0; attempt < 100 && h.$('export-report-save').disabled && !h.$('export-report-feedback').textContent.startsWith('Не подготовлено'); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.$('export-report-save').disabled, false, h.$('export-report-feedback').textContent); const preview = h.$('export-report-preview'); assert.ok(!preview.textContent.includes('Shared collaboration')); assert.equal(preview.querySelector('script,iframe,object'), null);
  for (const image of preview.querySelectorAll('img')) { const source = image.getAttribute('src'), svg = Buffer.from(source.split(',')[1], 'base64').toString('utf8'); assert.ok(!svg.includes('Shared collaboration')); }
  assert.equal(h.$('view-title').textContent, title); h.$('export-report-cancel').click(); assert.deepEqual(await h.download(), bytes);
});

test('adding existing relation closure previews, cancels and commits with one exact Undo and no semantic copies', async t => {
  const { conceptProject } = await import('../../schemka-model-core/fixtures/concept-project.js');
  const { fixtureId } = await import('../../schemka-model-core/fixtures/relationship-project.js');
  const h = await setup(t), state = conceptProject(); await h.load(serializeProjectFile(state)); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixtureId('view',2)}"]`).click(); const before = await h.download();
  function plan() { h.$('related-drawings-button').click(); for (const option of h.$('related-drawings-list').options) option.selected = option.value === fixtureId('rel',11); h.$('related-drawings-list').dispatchEvent(new h.window.Event('change',{bubbles:true})); h.$('related-drawings-preview').click(); assert.equal(h.$('related-drawings-apply').disabled,false,h.$('related-drawings-feedback').textContent); }
  plan(); h.$('related-drawings-cancel').click(); assert.deepEqual(await h.download(),before); plan(); h.$('related-drawings-apply').click(); const after = deserializeProjectFile(await h.download()); assert.deepEqual(after.relationships,state.relationships); assert.deepEqual(after.elements,state.elements); assert.ok(after.views.find(entry=>entry.view.id===fixtureId('view',2)).connections.length>=2); h.$('undo').click(); assert.deepEqual(await h.download(),before);
});

test('closing all view tabs keeps model bytes and reopens saved drawings from the tree',async t=>{
  const h=await setup(t),before=await h.download(),id=h.document.querySelector('[data-view-scope="tabs"]').dataset.viewId; const tab=h.document.querySelector('[data-view-scope="tabs"]');tab.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));assert.equal(h.$('view-tabs').children.length,0);assert.match(h.$('canvas').textContent,/Все вкладки закрыты/);assert.deepEqual(await h.download(),before);h.document.querySelector(`[data-view-scope="tree"][data-view-id="${id}"]`).click();assert.ok(h.document.querySelector('[data-kind="occurrence"]'));assert.deepEqual(await h.download(),before);
});
