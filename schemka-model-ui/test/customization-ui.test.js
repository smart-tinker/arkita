import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createStore, specializationLabel } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { customizationProject, customizationManagerProject, profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { setProfileAttributes, setProfileValues } from './profile-controls-fixture.js';
import { installCustomizationUI } from '../src/customization-ui.js';

function setup(t, initial = customizationProject({ enabled: { type: 'Boolean', default: true }, count: { type: 'Integer', default: 7 }, title: { type: 'String', default: 'old' }, url: { type: 'URL', default: 'javascript:inert()' } })) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { document } = dom.window, $ = id => document.getElementById(id), store = createStore(initial), model = createController(store), session = createProjectSession(store), reports = [];
  let renders = 0, ui;
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new dom.window.Event('close')); };
  }
  ui = installCustomizationUI({ document, model, openDialog: id => $(id).showModal(), render() { renders++; }, status: text => reports.push(text) });
  const event = (node, type) => node.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
  const set = (id,value) => { if (id === 'customization-attributes') { setProfileAttributes(document,JSON.parse(value)); return; } if (id === 'customization-values') { setProfileValues(document,JSON.parse(value)); return; } $(id).value = value; event($(id),'input'); };
  const submit = () => event($('customization-form'), 'submit');
  const capture = () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty });
  const history = () => { store.execute({ type: 'renameProject', name: 'Past' }, store.revision); store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision); };
  const concept = { kind: 'element', id: store.snapshot.elements[0].id };
  return { $, ui, store, model, session, reports, set, submit, capture, history, concept, event, document, window: dom.window, get renders() { return renders; } };
}
const button = (root, label) => [...root.querySelectorAll('button')].find(item => item.textContent === label);

test('manager authors a profile through human typed controls, rejects repeated attribute names and keeps input inert', t => {
  const h = setup(t, conceptProject()); h.history(); const before = h.capture();
  assert.equal(h.ui.manager(), true); h.$('customization-new').click();
  h.set('customization-name', '<img src=x onerror=alert(1)>'); h.set('customization-purpose', 'specialization');
  h.$('customization-targets').querySelector('[data-type="Grouping"]').checked = true;
  setProfileAttributes(h.document,[['count',{type:'Integer',default:7}],['count',{type:'Integer'}]]); h.submit();
  assert.match(h.$('customization-error').textContent, /повторяются/); assert.deepEqual(h.capture(), before);
  h.set('customization-attributes', '{"count":{"type":"Integer","default":7}}'); h.submit(); h.submit();
  assert.equal(h.store.snapshot.customizationProfiles.length, 1); assert.equal(h.store.revision, before.revision + 1); assert.equal(h.ui.active, false);
  assert.equal(h.document.querySelector('img'), null);
  assert.deepEqual(h.store.snapshot.customizationProfiles[0].targets, [{ kind: 'element', type: 'Grouping' }]);
  h.ui.manager(); assert.match(h.$('customization-list').textContent, /<img src=x onerror=alert\(1\)>/); assert.equal(h.document.querySelector('img'), null);
});

test('application editor preserves false/0/empty text, shows origins, resets explicit values and keeps invalid drafts atomic', t => {
  const h = setup(t); h.history(); const before = h.capture();
  h.ui.application(h.concept, profileId); h.set('customization-values', '{"enabled":"false"}'); h.submit();
  assert.deepEqual(h.capture(), before); assert.match(h.$('customization-error').textContent, /Boolean/);
  h.set('customization-values', '{"enabled":false,"count":0,"title":""}'); h.submit(); h.submit();
  assert.deepEqual(h.store.snapshot.elements[0].profileApplications[0].values, { enabled: false, count: 0, title: '' }); assert.equal(h.store.revision, before.revision + 1);
  const container = h.document.createElement('div'); h.ui.appendInspector(container, h.store.snapshot, h.concept);
  assert.equal(container.querySelectorAll('[data-value-origin="override"]').length, 3);
  assert.equal(container.querySelectorAll('[data-value-origin="default"]').length, 1);
  assert.equal(container.querySelector('a'), null); assert.match(container.textContent, /javascript:inert/);
  h.ui.application(h.concept, profileId); button(h.$('customization-value-hints'), 'Сбросить «enabled»').click(); h.submit();
  assert.equal(Object.hasOwn(h.store.snapshot.elements[0].profileApplications[0].values, 'enabled'), false);
  h.ui.application(h.concept, profileId); h.set('customization-values', '{}'); h.submit(); assert.deepEqual(h.store.snapshot.elements[0].profileApplications[0].values, {});
});

test('manager compatible edits propagate live defaults/purpose while referenced deletion is blocked; detach requires named confirmation', t => {
  const h = setup(t), concept = h.concept;
  h.ui.manager(); button(h.$('customization-list'), 'Удалить…').click(); assert.match(h.$('customization-error').textContent, /используется/); assert.equal(h.$('customization-confirm').hidden, true);
  button(h.$('customization-list'), 'Изменить').click(); h.set('customization-name', 'Edited'); h.set('customization-purpose', 'attributes');
  h.set('customization-attributes', '{"enabled":{"type":"Boolean","default":false},"count":{"type":"Integer","default":0},"title":{"type":"String","default":""}}'); h.submit();
  assert.equal(specializationLabel(h.store.snapshot, h.store.snapshot.elements[0]), '');
  const container = h.document.createElement('div'); h.ui.appendInspector(container, h.store.snapshot, concept);
  assert.match(container.textContent, /enabled: false · по умолчанию/);
  button(container, 'Снять профиль…').click(); const before = h.capture(); assert.equal(h.$('customization-confirm').hidden, false); assert.match(h.$('customization-confirm').textContent, /Edited/); assert.match(h.$('customization-confirm').textContent, /собственные значения/);
  h.$('customization-cancel').click(); assert.deepEqual(h.capture(), before);
  button(container, 'Снять профиль…').click(); h.submit(); assert.equal(Object.hasOwn(h.store.snapshot.elements[0], 'profileApplications'), false); assert.equal(h.store.snapshot.customizationProfiles.length, 1);
  h.store.undo(h.store.revision); assert.equal(h.store.snapshot.elements[0].profileApplications[0].profileId, profileId);
});

test('Close/Escape, changed selection/revision/project and repeated stale submissions never commit drafts or erase history', t => {
  for (const kind of ['close', 'cancel', 'selection', 'view', 'revision', 'load']) {
    const h = setup(t); h.history(); h.ui.application(h.concept, profileId); h.set('customization-values', '{"count":99}');
    if (kind === 'close') h.$('customization-dialog').close();
    if (kind === 'cancel') h.event(h.$('customization-dialog'), 'cancel');
    if (kind === 'selection') h.model.select({ kind: 'element', id: h.store.snapshot.elements[1].id });
    if (kind === 'view') h.model.switchView(h.store.snapshot.views[1].view.id);
    if (kind === 'revision') h.store.execute({ type: 'renameProject', name: 'New revision' }, h.store.revision);
    if (kind === 'load') { h.store.load(h.store.exportFiles(), h.store.revision); h.history(); }
    const before = h.capture(); assert.ok(before.history.undo && before.history.redo || kind === 'revision');
    h.submit(); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.ui.active, false);
  }
});

test('every concept kind can attach independently, duplicate display names are disambiguated, and untouched multiline names remain exact', t => {
  const initial = conceptProject(); initial.customizationProfiles = [1, 2].map(n => ({ id: `prf-00000000-0000-4000-8000-00000000000${n}`, ...profileDefinition(), name: 'Same\r\nname' }));
  const h = setup(t, initial);
  for (const [kind, objects] of [['element', initial.elements], ['junction', initial.junctions], ['relationship', initial.relationships.slice(0, 1)]]) for (const object of objects) {
    const concept = { kind, id: object.id }, container = h.document.createElement('div'); h.ui.appendInspector(container, h.store.snapshot, concept);
    const options = [...container.querySelectorAll('option')]; assert.equal(options.length, 2); assert.ok(options.every(item => item.textContent.includes(item.value) && item.textContent.includes(object.type)));
    h.ui.application(concept, profileId); h.submit();
  }
  h.ui.manager(); button(h.$('customization-list'), 'Изменить').click(); h.submit(); assert.equal(h.store.snapshot.customizationProfiles[0].name, 'Same\r\nname');
});


test('manager with 1000 definitions and concepts prepares usages once with no per-definition model validation or mutation', t => {
  const h = setup(t, customizationManagerProject()); h.history(); const before = h.capture(), ownKeys = Reflect.ownKeys, projectId = h.store.snapshot.project.id;
  let preparedWalks = 0, directUsageWalks = 0;
  Reflect.ownKeys = value => {
    const project = value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'project');
    if (project && 'value' in project && project.value?.id === projectId) {
      const stack = new Error().stack;
      if (stack.includes('at createCustomizationResolver ')) preparedWalks++;
      if (stack.includes('at customizationProfileUsages ')) directUsageWalks++;
    }
    return ownKeys(value);
  };
  const start = performance.now();
  try { assert.equal(h.ui.manager(), true); } finally { Reflect.ownKeys = ownKeys; }
  const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
  assert.equal(preparedWalks, 1); assert.equal(directUsageWalks, 0);
  assert.equal(h.$('customization-list').children.length, 1000);
  for (const row of h.$('customization-list').children) assert.match(row.textContent, /применён к 1 концептам/);
  button(h.$('customization-list').lastElementChild, 'Удалить…').click(); assert.match(h.$('customization-error').textContent, /используется/);
  assert.equal(h.$('customization-confirm').hidden, true); h.ui.cancel(); assert.deepEqual(h.capture(), before);
  t.diagnostic(JSON.stringify({ definitions: 1000, concepts: 1000, elapsedMs, preparedWalks, directUsageWalks, measurement: 'manager jsdom, not browser latency' }));
});


test('specialization image editing and explicit detach-all delete each have one exact Undo, cancel and used-asset protection', t => {
  const h = setup(t), svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="#123456"/></svg>';
  const assetId = h.store.execute({type:'createAsset',name:'Icon',mediaType:'image/svg+xml',data:Buffer.from(svg).toString('base64')},h.store.revision).created.assetId;
  const before = h.capture(); h.ui.manager(); button(h.$('customization-list'),'Изменить').click(); h.$('customization-image').value = assetId; h.event(h.$('customization-image'),'change'); assert.ok(h.$('customization-definition').querySelector('img[src^="data:image/svg+xml"]')); h.$('customization-cancel').click(); assert.deepEqual(h.capture(),before);
  h.ui.manager(); button(h.$('customization-list'),'Изменить').click(); h.$('customization-image').value = assetId; h.submit(); const applied = h.store.exportFiles(); assert.equal(h.store.revision,before.revision+1); assert.equal(h.store.snapshot.customizationProfiles[0].imageAssetId,assetId); assert.throws(() => h.store.execute({type:'deleteAsset',assetId},h.store.revision),{code:'REFERENCE'});
  const inspector = h.document.createElement('section'); h.ui.appendInspector(inspector,h.store.snapshot,h.concept); assert.match(inspector.textContent,/наследуется/);
  h.store.undo(h.store.revision); assert.deepEqual(h.store.exportFiles(),before.files); h.store.redo(h.store.revision); assert.deepEqual(h.store.exportFiles(),applied);
  h.ui.manager(); button(h.$('customization-list'),'Использования…').click(); assert.match(h.$('customization-list').textContent,/представления:/); button(h.$('customization-list'),'Снять у всех и удалить…').click(); const deletion = h.capture(); assert.match(h.$('customization-confirm').textContent,/Одно Undo/); h.$('customization-cancel').click(); assert.deepEqual(h.capture(),deletion);
  h.ui.manager(); button(h.$('customization-list'),'Снять у всех и удалить…').click(); h.submit(); assert.equal(h.store.snapshot.customizationProfiles,undefined); assert.ok(h.store.snapshot.elements.every(item => !item.profileApplications)); assert.equal(h.store.snapshot.assets.length,1);
  h.store.undo(h.store.revision); assert.deepEqual(h.store.exportFiles(),applied);
});

test('new overlapping specialization names require an explicit separate-ID choice; imported collisions remain readable', t => {
  const h = setup(t); h.ui.manager(); h.$('customization-new').click(); h.set('customization-name',h.store.snapshot.customizationProfiles[0].name.toUpperCase()); h.set('customization-purpose','specialization'); h.$('customization-targets').querySelector('[data-type="Grouping"]').checked = true;
  const before = h.capture(); h.submit(); assert.deepEqual(h.capture(),before); assert.match(h.$('customization-error').textContent,/Подтвердите/); assert.equal(h.$('customization-collision-confirm').closest('label').hidden,false);
  h.$('customization-collision-confirm').checked = true; h.submit(); assert.equal(h.store.snapshot.customizationProfiles.length,2); h.ui.manager(); assert.match(h.$('customization-list').textContent,/Историческое совпадение/);
});
