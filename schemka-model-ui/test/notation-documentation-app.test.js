import { production, setup } from './app-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { viewpointId, viewpointDefinition } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { beforeUnload, nativeViewpointHarness, nativeDeferred } from './notation-app-helpers.js';

function documentationState() {
  const state = customizationProject({ raw: { type: 'String', default: ' \r\nexact ' } });
  for (const concept of [...state.elements, ...state.junctions]) { concept.name = '<img src=x> same name'; concept.documentation = ' \r\noriginal\rtext\n\t日本語 😀 <script>inert()</script> '; }
  const store = createStore(state), viewId = state.views[0].view.id;
  store.execute({ type: 'addOccurrence', viewId, concept: { kind: 'element', id: state.elements[0].id }, bounds: { x: 600, y: 400, width: 120, height: 60 } }, store.revision);
  store.execute({ type: 'duplicateView', viewId, name: 'Another complete view' }, store.revision);
  return deserializeProjectFile(serializeProjectFile(store.snapshot));
}

function selectDocumentation(h, kind, id, drawn = false) {
  if (drawn) {
    const drawing = h.$('canvas').querySelector(`[data-id="${id}"]`); assert.ok(drawing);
    drawing.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  } else h.document.querySelector(`[data-${kind}-id="${id}"]`).click();
  const edit = h.document.querySelector('[data-inspector-action="documentation"]'); assert.ok(edit); assert.equal(edit.disabled, false); return edit;
}

function editDocumentation(h, text) {
  h.$('documentation-value').value = text; h.$('documentation-value').dispatchEvent(new h.window.Event('input', { bubbles: true }));
}

const submitDocumentation = h => h.$('documentation-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));

test(`${production ? 'production' : 'source'} app: documentation tree/drawing edits target exact shared element and junction, with one undo and unchanged geometry/profiles`, async t => {
  const h = await setup(t), initial = documentationState(); await h.load(serializeProjectFile(initial));
  for (const kind of ['element', 'junction']) {
    const concept = initial[`${kind}s`][0], expected = structuredClone(initial);
    const view = initial.views.find(v => v.occurrences.length), occurrence = view.occurrences.find(o => o.concept.id === concept.id);
    h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
    for (const drawn of [false, true]) {
      selectDocumentation(h, kind, drawn ? occurrence.id : concept.id, drawn);
      assert.equal(h.document.querySelector('.documentation-text').textContent, concept.documentation);
      assert.equal(h.document.querySelector('#inspector-content img,#inspector-content script'), null);
    }
    h.document.querySelector('[data-inspector-action="documentation"]').click(); assert.equal(h.$('documentation-dialog').open, true);
    const changed = ` ${kind} <img onerror="bad()">\n日本語 😀 `; editDocumentation(h, changed); submitDocumentation(h); submitDocumentation(h);
    assert.equal(h.$('documentation-dialog').open, false); assert.equal(h.document.querySelector('.documentation-text').textContent, changed);
    assert.equal(h.$('file-state').dataset.dirty, 'true'); expected[`${kind}s`][0].documentation = changed;
    const saved = await h.download(); assert.deepEqual(deserializeProjectFile(saved), expected);
    assert.match(h.$('history-state').textContent, /1 действий/);
    for (const entry of expected.views.filter(v => v.occurrences.some(o => o.concept.id === concept.id))) {
      h.document.querySelector(`[data-view-scope="tree"][data-view-id="${entry.view.id}"]`).click();
      for (const drawing of entry.occurrences.filter(o => o.concept.id === concept.id)) {
        selectDocumentation(h, kind, drawing.id, true); assert.equal(h.document.querySelector('.documentation-text').textContent, changed);
      }
    }
    h.$('undo').click(); assert.deepEqual(await h.download(), Buffer.from(serializeProjectFile(initial)));
    h.$('redo').click(); assert.deepEqual(await h.download(), saved);
    await h.load(saved); selectDocumentation(h, kind, concept.id); assert.equal(h.document.querySelector('.documentation-text').textContent, changed);
    assert.equal(h.$('undo').disabled, true); await h.load(serializeProjectFile(initial));
  }
  h.$('relationships').querySelector('[data-relationship-id]').click(); assert.ok(h.document.querySelector('[data-inspector-action="documentation"]'));
});

test(`${production ? 'production' : 'source'} app: documentation cancel/no-op/revert preserve raw bytes and redo; empty and maximum text remain literal`, async t => {
  const h = await setup(t), state = documentationState(), concept = state.elements[0], bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const open = () => { selectDocumentation(h, 'element', concept.id).click(); assert.equal(h.$('documentation-dialog').open, true); };
  open(); assert.equal(beforeUnload(h), true); const normalized = h.$('documentation-value').value; submitDocumentation(h);
  assert.equal(beforeUnload(h), false); assert.deepEqual(await h.download(), bytes);
  open(); editDocumentation(h, 'temporary'); editDocumentation(h, normalized); submitDocumentation(h); assert.deepEqual(await h.download(), bytes);
  open(); editDocumentation(h, 'temporary'); h.$('documentation-dialog').querySelector('[data-close]').click(); submitDocumentation(h); assert.deepEqual(await h.download(), bytes);
  open(); editDocumentation(h, 'future'); submitDocumentation(h); h.$('undo').click(); assert.equal(h.$('redo').disabled, false);
  open(); submitDocumentation(h); assert.equal(h.$('redo').disabled, false); h.$('redo').click(); assert.equal(h.document.querySelector('.documentation-text').textContent, 'future');
  h.$('undo').click(); open(); editDocumentation(h, 'x'.repeat(8193)); submitDocumentation(h); assert.equal(h.$('documentation-dialog').open, true); assert.match(h.$('documentation-error').textContent, /8192/);
  editDocumentation(h, '😀'.repeat(4096)); submitDocumentation(h); assert.equal(h.document.querySelector('.documentation-text').textContent, '😀'.repeat(4096));
  open(); editDocumentation(h, ''); submitDocumentation(h); const saved = deserializeProjectFile(await h.download());
  assert.equal(saved.elements[0].documentation, ''); assert.equal(Object.hasOwn(saved.elements[0], 'documentation'), true);
});

test(`${production ? 'production' : 'source'} app: documentation respects modal, selection, view, history and leave boundaries without cancelling on focus loss`, async t => {
  const h = await setup(t), state = documentationState(), concept = state.elements[0], bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const open = () => { selectDocumentation(h, 'element', concept.id).click(); editDocumentation(h, 'uncommitted'); };
  open(); h.window.dispatchEvent(new h.window.Event('blur')); h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(h.$('documentation-dialog').open, true); assert.equal(h.$('documentation-value').value, 'uncommitted'); assert.equal(beforeUnload(h), true);
  h.$('documentation-value').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); assert.equal(h.$('undo').disabled, true);
  h.document.querySelector(`[data-element-id="${state.elements[1].id}"]`).click(); assert.equal(h.$('documentation-dialog').open, false); submitDocumentation(h);
  open(); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${state.views[1].view.id}"]`).click(); assert.equal(h.$('documentation-dialog').open, false); submitDocumentation(h);
  open(); h.$('help-button').click(); assert.equal(h.$('documentation-dialog').open, true);
  h.$('documentation-value').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
  assert.equal(h.$('help-dialog').open, true); assert.equal(h.$('documentation-value').value, 'uncommitted');
  assert.equal(h.$('undo').disabled, true); h.$('help-dialog').close();
  assert.equal(h.$('documentation-dialog').open, true); h.$('documentation-dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  open(); h.$('file-button').click(); assert.equal(h.$('documentation-dialog').open, false); submitDocumentation(h); h.$('file-dialog').close();
  open(); editDocumentation(h, 'accepted before undo'); submitDocumentation(h); open(); h.$('undo').click(); assert.equal(h.$('documentation-dialog').open, false); submitDocumentation(h);
  assert.deepEqual(await h.download(), bytes); assert.equal(beforeUnload(h), false);
  const edit = selectDocumentation(h, 'element', concept.id); h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'keep inline';
  edit.click(); assert.equal(h.$('documentation-dialog').open, false); assert.equal(input.value, 'keep inline');
});

test(`${production ? 'production' : 'source'} app: documentation edits work in a no-view tree and retain fully hidden Ch13 drawings`, async t => {
  const h = await setup(t);
  for (const empty of [true, false]) {
    const state = documentationState();
    if (empty) state.views = [];
    else {
      state.viewpoints = [{ id: viewpointId, ...viewpointDefinition({ elementTypes: [], junctionTypes: [], relationshipTypes: [] }) }];
      for (const view of state.views) view.view.viewpointId = viewpointId;
    }
    await h.load(serializeProjectFile(state)); assert.equal(h.$('canvas').querySelectorAll('[data-id]').length, 0);
    const expected = structuredClone(state);
    for (const kind of ['element', 'junction']) {
      selectDocumentation(h, kind, state[`${kind}s`][0].id).click(); editDocumentation(h, `${kind} documentation`); submitDocumentation(h);
      expected[`${kind}s`][0].documentation = `${kind} documentation`;
    }
    assert.equal(h.$('canvas').querySelectorAll('[data-id]').length, 0); assert.deepEqual(deserializeProjectFile(await h.download()), expected);
    h.$('profile-button').click(); assert.match(h.$('profile-normative').textContent, /UNKNOWN/); h.$('profile-dialog').close();
  }
});

test(`${production ? 'production' : 'source'} native integration: documentation edits save/reopen exactly through temporary native file service without model/app mixing`, async t => {
  const initial = documentationState(), h = await nativeViewpointHarness(t, initial), expected = structuredClone(initial);
  for (const kind of ['element', 'junction']) {
    selectDocumentation(h, kind, initial[`${kind}s`][0].id).click(); editDocumentation(h, ` ${kind}\n<svg onload=bad()> 日本語 😀 `); submitDocumentation(h);
    expected[`${kind}s`][0].documentation = ` ${kind}\n<svg onload=bad()> 日本語 😀 `;
  }
  const history = h.$('history-state').textContent; assert.match(history, /2 действий/); h.$('file-button').click(); await h.click('desktop-save-bound-directory');
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(h.$('history-state').textContent, history);
  const saved = (await h.read()).bytes; assert.deepEqual(saved, serializeProjectFile(expected));
  h.$('file-dialog').close(); h.$('undo').click(); assert.equal(h.$('file-state').dataset.dirty, 'true'); h.$('redo').click(); assert.equal(h.$('file-state').dataset.dirty, 'false');
  await h.open(); assert.equal(h.$('undo').disabled, true);
  for (const kind of ['element', 'junction']) { selectDocumentation(h, kind, initial[`${kind}s`][0].id); assert.equal(h.document.querySelector('.documentation-text').textContent, expected[`${kind}s`][0].documentation); }
  assert.deepEqual((await h.read()).bytes, saved); assert.deepEqual(h.errors, []);
});

test(`${production ? 'production' : 'source'} native integration: documentation survives canceled/failed/late file reads with history, draft, dirty identity and binding intact`, async t => {
  const state = documentationState(), h = await nativeViewpointHarness(t, state), concept = state.elements[0];
  selectDocumentation(h, 'element', concept.id).click(); editDocumentation(h, 'kept edit'); submitDocumentation(h);
  const history = h.$('history-state').textContent, onDisk = (await h.read()).bytes;
  h.$('file-button').click(); h.select(null); assert.equal((await h.click('desktop-open-directory')).status, 'cancelled');
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, 'true');
  h.select(h.path.join(h.parent, 'missing-directory')); assert.equal((await h.click('desktop-open-directory')).status, 'error');
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('file-state').dataset.dirty, 'true');
  h.select(h.root); const hold = nativeDeferred(); h.holdRead(hold); h.$('desktop-open-directory').click(); h.$('cancel-load').click(); h.$('file-dialog').close();
  selectDocumentation(h, 'element', concept.id).click(); editDocumentation(h, 'newer unsaved draft');
  const binding = h.$('directory-status').textContent; hold.resolve(); await h.until(() => h.calls.every(c => c.done));
  assert.equal(h.$('documentation-dialog').open, true); assert.equal(h.$('documentation-value').value, 'newer unsaved draft'); assert.equal(beforeUnload(h), true);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('directory-status').textContent, binding); assert.deepEqual((await h.read()).bytes, onDisk);
  submitDocumentation(h); submitDocumentation(h); assert.match(h.$('history-state').textContent, /2 действий/);
  h.$('file-button').click(); await h.click('desktop-save-bound-directory'); assert.equal(h.$('file-state').dataset.dirty, 'false');
  const saved = deserializeProjectFile((await h.read()).bytes); assert.equal(saved.elements[0].documentation, 'newer unsaved draft');
  const expected = structuredClone(state); expected.elements[0].documentation = 'newer unsaved draft'; assert.deepEqual(saved, expected);
});
