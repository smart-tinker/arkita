import { production, setup } from './app-test-fixture.js';
import test from 'node:test';
import { setViewpointList } from './profile-controls-fixture.js';
import assert from 'node:assert/strict';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { viewpointGraph, viewpointId } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { nativeViewpointHarness, nativeDeferred } from './notation-app-helpers.js';

function submitViewpoint(h) { h.$('viewpoint-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })); }

function chooseViewpointType(h, field, type) { h.$('viewpoint-types').querySelector(`input[data-field="${field}"][value="${type}"]`).checked = true; }

function chooseEligible(h, kind, id) { h.$('viewpoint-eligible').value = `${kind}:${id}`; h.$('viewpoint-add').click(); }

test(`${production ? 'production' : 'source'} app: VP-E2E-01 real controls define, bind, choose, depict and reopen native viewpoints without hidden-data loss`, async t => {
  const h = await setup(t), fixture = viewpointGraph({ drawn: false });
  delete fixture.state.views[0].view.viewpointId; delete fixture.state.viewpoints;
  await h.load(serializeProjectFile(fixture.state));
  h.$('viewpoint-button').click(); h.$('viewpoint-new').click();
  h.$('viewpoint-name').value = 'Application concerns'; setViewpointList(h.document,'stakeholders',['Application owner']); setViewpointList(h.document,'concerns',['Which information is used?']);
  for (const [field, values] of Object.entries({ purpose: ['informing'], content: ['coherence'], elementTypes: ['ApplicationComponent', 'DataObject'], relationshipTypes: ['Access', 'Association'] })) for (const value of values) chooseViewpointType(h, field, value);
  submitViewpoint(h); submitViewpoint(h); assert.equal(h.$('viewpoint-dialog').open, false);
  const id = [...h.$('viewpoint-binding').options].find(item => item.value).value;
  h.change('viewpoint-binding', id); assert.equal(h.$('canvas').querySelectorAll('[data-id]').length, 0); assert.match(h.$('canvas').textContent, /Пустая проекция/); assert.equal(h.$('viewpoint-eligible').options.length, 3);
  assert.ok([...h.$('viewpoint-eligible').options].every(item => !/Device/.test(item.textContent))); assert.equal(h.$('create-device').hidden, true); assert.equal(h.$('create-readaccess').hidden, true); assert.equal(h.$('create-access').hidden, false);
  chooseEligible(h, 'element', fixture.ids.A); chooseEligible(h, 'element', fixture.ids.D);
  assert.equal(h.$('canvas').querySelectorAll('[data-kind="occurrence"]').length, 2);
  chooseEligible(h, 'relationship', fixture.ids.R); assert.equal(h.$('link-dialog').open, true); assert.equal(h.$('existing-link').options.length, 1); assert.equal(h.$('existing-link').value, fixture.ids.R);
  h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })); assert.equal(h.$('link-dialog').open, false);
  assert.equal(h.$('canvas').querySelectorAll('.connection').length, 1); assert.match(h.$('viewpoint-counts').textContent, /не нарисованы: 0/);
  const bytes = await h.download(), result = deserializeProjectFile(bytes);
  assert.deepEqual(result.elements, fixture.state.elements); assert.deepEqual(result.relationships, fixture.state.relationships); assert.deepEqual(result.views[1], fixture.state.views[1]); assert.equal(result.viewpoints.length, 1); assert.equal(result.views[0].view.viewpointId, id);
  assert.match(h.$('viewpoint-scope').textContent, /человеческой проверки/);
  await h.load(bytes); assert.equal(h.$('viewpoint-binding').value, id); assert.equal(h.$('canvas').querySelectorAll('.connection').length, 1); assert.deepEqual(await h.download(), bytes);
  h.$('file-button').click(); h.$('download-mermaid').click(); assert.match(h.$('file-feedback').textContent, /Governed viewpoints.*native/); h.$('file-dialog').close();
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.state.views[1].view.id}"]`).click(); assert.ok((await h.download('download-mermaid')).length > 0);
});

test(`${production ? 'production' : 'source'} app: VP-UI-01 projection changes cancel hidden inline/drag/menu/anchor focus and preserve stored geometry`, async t => {
  const h = await setup(t), fixture = viewpointGraph(), original = structuredClone(fixture.state);
  delete fixture.state.views[0].view.viewpointId; await h.load(serializeProjectFile(fixture.state));
  const hiddenId = fixture.draws.X, group = () => h.$('canvas').querySelector(`[data-id="${hiddenId}"]`);
  group().dispatchEvent(new h.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })); const input = h.document.querySelector('.inline-editor input'); assert.ok(input); input.value = 'Hidden uncommitted draft';
  h.change('viewpoint-binding', viewpointId); assert.equal(h.document.querySelector('.inline-editor'), null); assert.equal(group(), null); assert.equal(h.document.activeElement.id, 'viewpoint-binding'); assert.equal(h.$('canvas').querySelector('.selected'), null);
  h.change('viewpoint-binding', ''); h.pointer(group(), 'pointerdown'); h.pointer(h.$('canvas'), 'pointermove', 160, 180);
  h.change('viewpoint-binding', viewpointId); h.pointer(h.$('canvas'), 'pointerup', 160, 180); assert.equal(h.$('canvas').hasPointerCapture(1), false); assert.equal(group(), null);
  h.change('viewpoint-binding', ''); group().dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); assert.equal(h.$('context-menu').hidden, false);
  h.change('viewpoint-binding', viewpointId); assert.equal(h.$('context-menu').hidden, true);
  h.change('viewpoint-binding', ''); const anchor = h.$('canvas').querySelector(`[data-anchor-id="${fixture.anchors.S}"]`); anchor.focus();
  h.change('viewpoint-binding', viewpointId); assert.equal(h.$('canvas').querySelector(`[data-anchor-id="${fixture.anchors.S}"]`), null); assert.equal(h.document.activeElement.id, 'viewpoint-binding');
  h.change('viewpoint-binding', ''); const hiddenConnection = h.$('canvas').querySelector(`.connection[data-id="${fixture.draws.S}"]`);
  h.pointer(hiddenConnection, 'pointerdown'); h.pointer(h.$('canvas'), 'pointerup'); h.$('layout-edit-toggle').click();
  const anchorHandle = h.$('canvas').querySelector('[data-layout-kind="anchor"]'); assert.ok(anchorHandle);
  h.pointer(anchorHandle, 'pointerdown', 50, 80); h.pointer(h.$('canvas'), 'pointermove', 95, 125);
  h.change('viewpoint-binding', viewpointId); h.pointer(h.$('canvas'), 'pointerup', 95, 125);
  assert.equal(h.$('canvas').querySelector('[data-layout-kind]'), null); assert.equal(h.document.activeElement.id, 'viewpoint-binding');
  const saved = deserializeProjectFile(await h.download()); assert.deepEqual(saved.elements, original.elements); assert.deepEqual(saved.relationships, original.relationships); assert.deepEqual(saved.views, original.views);
  h.$('fit-button').click(); assert.ok(!/NaN|Infinity/.test(h.$('canvas').getAttribute('viewBox')));
});

test(`${production ? 'production' : 'source'} app: VP-AUTH-02 full model diagnostics retain filtered findings, and duplicate governed view retains binding`, async t => {
  const h = await setup(t), fixture = viewpointGraph(); await h.load(serializeProjectFile(fixture.state));
  h.$('profile-button').click(); assert.equal(h.$('profile-results').querySelectorAll('[data-relationship-id]').length, 2); assert.match(h.$('profile-local').textContent, /Включена вся модель.*Не показаны/); assert.match(h.$('profile-normative').textContent, /UNKNOWN/); h.$('profile-dialog').close();
  h.$('duplicate-view').click(); h.$('new-view-name').value = 'Governed copy'; h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.$('viewpoint-binding').value, viewpointId); assert.equal(h.$('canvas').querySelectorAll('[data-kind="occurrence"]').length, 2);
  const saved = deserializeProjectFile(await h.download()), copy = saved.views.find(item => item.view.name === 'Governed copy'); assert.equal(copy.view.viewpointId, viewpointId); assert.equal(copy.occurrences.length, 3); assert.equal(copy.connections.length, 2);
  h.$('undo').click(); assert.equal(h.$('view-tabs').querySelectorAll('button').length, 1); h.$('redo').click(); assert.equal(h.$('view-tabs').querySelectorAll('button').length, 1); assert.equal(deserializeProjectFile(await h.download()).views.length, 3);
});

test(`${production ? 'production' : 'source'} app: VP-PROJ-07/08/14 selected self/mutual relationship cycles render without repair and fully hidden state still saves`, async t => {
  const h = await setup(t), fixture = viewpointGraph({ types: { A: 'ApplicationComponent' }, relationships: { R: ['Association', 'R', 'A'], S: ['Association', 'T', 'A'], T: ['Association', 'S', 'A'] }, selection: { elementTypes: ['ApplicationComponent'], junctionTypes: [], relationshipTypes: ['Association'] } });
  await h.load(serializeProjectFile(fixture.state)); assert.equal(h.$('canvas').querySelectorAll('.connection').length, 3); assert.equal(h.$('canvas').querySelectorAll('.view-anchor').length, 3);
  for (const line of h.$('canvas').querySelectorAll('.connection .line')) assert.ok(!/NaN|Infinity/.test(line.getAttribute('d')));
  assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(fixture.state)));
  h.$('viewpoint-button').click(); [...h.$('viewpoint-list').querySelectorAll('button')].find(item => item.textContent === 'Изменить').click();
  for (const input of h.$('viewpoint-types').querySelectorAll('input[data-field="elementTypes"]')) input.checked = false; submitViewpoint(h);
  assert.equal(h.$('canvas').querySelectorAll('[data-id]').length, 0); assert.match(h.$('canvas').textContent, /скрыто рисунков: 4/); h.$('fit-button').click(); assert.equal(h.$('canvas').getAttribute('viewBox'), '0 0 900 640');
  const hidden = deserializeProjectFile(await h.download()); assert.deepEqual(hidden.views, fixture.state.views); assert.deepEqual(hidden.relationships, fixture.state.relationships); assert.equal(hidden.views[0].connections[0].source.id, fixture.draws.R);
  h.$('undo').click(); assert.equal(h.$('canvas').querySelectorAll('.connection').length, 3);
});

function combinedViewpointState() {
  const state = viewpointGraph().state; delete state.views[0].view.viewpointId; delete state.viewpoints;
  state.customizationProfiles = [{ id: profileId, ...profileDefinition({ count: { type: 'Integer', default: 7 } }) }];
  for (const item of [...state.elements, ...state.relationships]) item.profileApplications = [{ profileId, values: { count: 0 } }];
  return state;
}

function createViewpointWithControls(h) {
  h.$('viewpoint-button').click(); h.$('viewpoint-new').click();
  h.$('viewpoint-name').value = 'Native governed'; setViewpointList(h.document,'stakeholders',['Owner']); setViewpointList(h.document,'concerns',['Application data']);
  for (const [field, values] of Object.entries({ purpose: ['informing'], content: ['coherence'], elementTypes: ['ApplicationComponent', 'DataObject'], relationshipTypes: ['Access', 'Association'] })) for (const value of values) chooseViewpointType(h, field, value);
  submitViewpoint(h); assert.equal(h.$('viewpoint-dialog').open, false);
  return [...h.$('viewpoint-binding').options].find(o => o.value).value;
}

test(`${production ? 'production' : 'source'} native integration: create/bind/edit/undo/save/reopen keeps Ch14 labels and every hidden record`, async t => {
  const original = combinedViewpointState(), h = await nativeViewpointHarness(t, original), id = createViewpointWithControls(h);
  h.change('viewpoint-binding', id); assert.equal(h.$('canvas').querySelectorAll('[data-kind="occurrence"]').length, 2);
  assert.equal(h.$('canvas').querySelectorAll('.stereotype-label').length, 3);
  assert.match(h.$('canvas').querySelector('.stereotype-label').getAttribute('aria-label'), /Synthetic/);
  h.$('viewpoint-button').click(); [...h.$('viewpoint-list').querySelectorAll('button')].find(b => b.textContent === 'Изменить').click();
  h.$('viewpoint-name').value = 'Edited native'; submitViewpoint(h); h.$('undo').click(); assert.match(h.$('viewpoint-summary').textContent, /Native governed/);
  h.$('redo').click(); assert.match(h.$('viewpoint-summary').textContent, /Edited native/);
  const history = h.$('history-state').textContent; h.$('file-button').click(); await h.click('desktop-save-bound-directory');
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, 'false');
  const opened = await h.read(), state = deserializeProjectFile(opened.bytes);
  for (const field of ['elements', 'relationships', 'customizationProfiles']) assert.deepEqual(state[field], original[field]);
  assert.deepEqual(state.views[0].occurrences, original.views[0].occurrences); assert.deepEqual(state.views[0].connections, original.views[0].connections);
  assert.equal(state.views[0].view.viewpointId, id); assert.equal(state.viewpoints[0].name, 'Edited native');
  h.$('file-dialog').close(); await h.open(); assert.equal(h.$('undo').disabled, true); assert.equal(h.$('viewpoint-binding').value, id);
  assert.equal(h.$('canvas').querySelectorAll('[data-kind="occurrence"]').length, 2); assert.equal(h.$('canvas').querySelectorAll('.stereotype-label').length, 3);
  h.change('viewpoint-binding', ''); h.$('viewpoint-button').click(); [...h.$('viewpoint-list').querySelectorAll('button')].find(b => b.textContent === 'Удалить…').click(); submitViewpoint(h);
  h.$('file-button').click(); await h.click('desktop-save-bound-directory');
  assert.equal(Object.hasOwn(JSON.parse(await h.fs.readFile(h.path.join(h.root, 'schemka.json'), 'utf8')), 'viewpointFormat'), false);
  h.$('file-dialog').close(); h.$('undo').click(); assert.equal(h.$('file-state').dataset.dirty, 'true'); h.$('file-button').click(); await h.click('desktop-save-bound-directory');
  assert.equal(JSON.parse(await h.fs.readFile(h.path.join(h.root, 'schemka.json'), 'utf8')).viewpointFormat, 1);
  h.$('file-dialog').close(); h.$('profile-button').click(); assert.match(h.$('profile-normative').textContent, /UNKNOWN/); h.$('profile-dialog').close(); assert.deepEqual(h.errors, []);
});

test(`${production ? 'production' : 'source'} native integration: invalid/canceled/late opens preserve history, viewpoint drafts and directory binding`, async t => {
  const h = await nativeViewpointHarness(t, combinedViewpointState()), id = createViewpointWithControls(h); h.change('viewpoint-binding', id);
  h.$('file-button').click(); await h.click('desktop-save-bound-directory'); h.$('file-dialog').close();
  h.change('viewpoint-binding', ''); h.$('undo').click(); const history = h.$('history-state').textContent, binding = h.$('directory-status').textContent;
  const invalid = h.path.join(h.parent, 'unguarded'); await h.fs.cp(h.root, invalid, { recursive: true });
  const header = JSON.parse(await h.fs.readFile(h.path.join(invalid, 'schemka.json'), 'utf8')); delete header.viewpointFormat; await h.fs.writeFile(h.path.join(invalid, 'schemka.json'), JSON.stringify(header));
  h.select(invalid); h.$('file-button').click(); const rejected = await h.click('desktop-open-directory'); assert.equal(rejected.code, 'VIEWPOINT_FORMAT');
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('directory-status').textContent, binding); assert.equal(h.$('viewpoint-binding').value, id);
  h.select(null); const canceled = await h.click('desktop-open-directory'); assert.equal(canceled.status, 'cancelled'); assert.equal(h.$('history-state').textContent, history);
  h.select(h.root); const hold = nativeDeferred(); h.holdRead(hold); h.$('desktop-open-directory').click(); h.$('cancel-load').click(); h.$('file-dialog').close();
  h.$('viewpoint-button').click(); [...h.$('viewpoint-list').querySelectorAll('button')].find(b => b.textContent === 'Изменить').click();
  h.$('viewpoint-name').value = 'Uncommitted draft'; h.$('viewpoint-name').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  hold.resolve(); await h.until(() => h.calls.every(c => c.done));
  assert.equal(h.$('viewpoint-dialog').open, true); assert.equal(h.$('viewpoint-name').value, 'Uncommitted draft'); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('directory-status').textContent, binding);
  h.$('viewpoint-cancel').click(); h.holdRead(null); h.$('file-button').click(); await h.click('desktop-save-bound-directory');
  const expected = (await h.read()).bytes; h.$('file-dialog').close(); h.change('viewpoint-binding', '');
  const saveHold = nativeDeferred(); h.holdSave(saveHold); h.$('file-button').click(); h.$('desktop-save-bound-directory').click();
  h.$('file-dialog').close(); h.change('viewpoint-binding', id); saveHold.resolve(); await h.until(() => h.calls.every(c => c.done));
  assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.match(h.$('directory-status').textContent, /отличается/); assert.equal(h.$('viewpoint-binding').value, id);
  const onDisk = deserializeProjectFile((await h.read()).bytes); assert.equal(Object.hasOwn(onDisk.views[0].view, 'viewpointId'), false); assert.notDeepEqual((await h.read()).bytes, expected);
});
