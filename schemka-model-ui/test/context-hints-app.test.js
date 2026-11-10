import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { customizationProject, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { viewpointGraph, viewpointId } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const mode = production ? 'production' : 'source';
const key = (h, target, value) => target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const select = (h, kind, id) => h.document.querySelector(`[data-${kind}-id="${id}"]`).click();
const hintText = h => ['title', 'identity', 'description', 'documentation', 'details'].map(id => h.$(`context-hints-${id}`).textContent).join('\n');
const history = h => [h.$('history-state').textContent, h.$('file-state').dataset.dirty, h.$('undo').disabled, h.$('redo').disabled];

test(`${mode} hints use all exact catalogue type descriptions through keyboard focus without creating concepts`, async t => {
  const h = await setup(t), bytes = Buffer.from(serializeProjectFile(conceptProject())); await h.load(bytes);
  const before = history(h); h.$('context-hints-toggle').click();
  assert.equal(h.$('context-hints-panel').hidden, false); assert.equal(h.document.activeElement, h.$('context-hints-title'));
  for (const [kind, types] of [['element', CURRENT_CATALOG.elementTypes], ['junction', CURRENT_CATALOG.junctionTypes], ['relationship', CURRENT_CATALOG.relationshipTypes]]) {
    for (const type of types) {
      const id = `create-${type.toLowerCase()}`; h.$(id).focus();
      assert.match(h.$('context-hints-identity').textContent, new RegExp(type));
      assert.equal(h.$('context-hints-description').textContent, h.$(`${id}-description`).textContent.trim());
      assert.match(h.$('context-hints-details').textContent, /schemka-archimate4 · версия 2/);
      assert.match(h.$('context-hints-details').textContent, /UNKNOWN/);
      assert.equal(h.document.activeElement, h.$(id), `${kind}:${type}: passive hints do not steal focus`);
    }
  }
  h.$('smart-link-tool').focus(); assert.match(h.$('context-hints-title').textContent, /Инструмент связи/); assert.match(h.$('context-hints-description').textContent, /Escape/);
  assert.deepEqual(history(h), before); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} pinned hints keep literal concept/profile/documentation text and unpin follows the latest selected concept`, async t => {
  const h = await setup(t), state = customizationProject(); state.elements[0].name = '<script> 🙂 日本語'; state.elements[0].documentation = 'Описание <img src=x>\nВторая строка';
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes); const before = history(h);
  select(h, 'element', state.elements[0].id); h.$('context-hints-toggle').click();
  assert.ok(hintText(h).includes(state.elements[0].id)); assert.ok(hintText(h).includes(profileId)); assert.ok(hintText(h).includes(state.elements[0].documentation));
  assert.equal(h.$('context-hints-panel').querySelector('script,img,iframe'), null);
  h.$('context-hints-pin').click(); const pinned = hintText(h); assert.equal(h.$('context-hints-pin').getAttribute('aria-pressed'), 'true');
  for (const [kind, record] of [['element', state.elements[1]], ['junction', state.junctions[0]], ['relationship', state.relationships[0]]]) {
    select(h, kind, record.id); assert.equal(hintText(h), pinned); assert.equal(h.$('context-hints-pin').getAttribute('aria-pressed'), 'true');
  }
  h.$('context-hints-pin').click(); assert.equal(h.$('context-hints-pin').getAttribute('aria-pressed'), 'false');
  assert.ok(hintText(h).includes(state.relationships[0].id)); assert.match(h.$('context-hints-description').textContent, /Связывает понятия/);
  h.$('context-hints-title').focus(); key(h, h.$('context-hints-title'), 'ArrowRight'); key(h, h.$('context-hints-title'), 'Delete'); key(h, h.$('context-hints-title'), 'F2');
  assert.deepEqual(history(h), before); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} reselecting the same concept replaces a tool hint and becomes the pending context while pinned`, async t => {
  const h = await setup(t), state = conceptProject(), element = state.elements[0];
  const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes); const before = history(h);
  select(h, 'element', element.id); h.$('context-hints-toggle').click();
  h.$('create-role').focus(); assert.equal(h.$('context-hints-identity').textContent, 'Элемент · Role');
  select(h, 'element', element.id); assert.ok(h.$('context-hints-identity').textContent.includes(element.id));
  h.$('context-hints-pin').click(); const pinned = hintText(h);
  h.$('create-collaboration').focus(); select(h, 'element', element.id); assert.equal(hintText(h), pinned);
  h.$('context-hints-pin').click(); assert.ok(h.$('context-hints-identity').textContent.includes(element.id));
  assert.deepEqual(history(h), before); assert.deepEqual(await h.download(), bytes);
});

test(`${mode} viewpoint hints show exact tasks and type counts, pin marks revision changes, and model load clears snapshots`, async t => {
  const h = await setup(t), fixture = viewpointGraph(); fixture.state.viewpoints[0].documentation = '<script>literal viewpoint</script>';
  await h.load(serializeProjectFile(fixture.state)); const before = await h.download(); h.$('context-hints-toggle').click();
  h.$('viewpoint-binding').focus(); assert.ok(hintText(h).includes(viewpointId)); assert.ok(hintText(h).includes('Application owner')); assert.ok(hintText(h).includes('Which information is accessed?'));
  assert.match(hintText(h), /элементы 2, junctions 0, отношения 2/); assert.equal(h.$('context-hints-panel').querySelector('script'), null);
  h.$('context-hints-pin').click(); const pinned = hintText(h);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Изменённое имя'; input.dispatchEvent(new h.window.Event('input', { bubbles: true })); key(h, input, 'Enter');
  assert.equal(hintText(h), pinned); assert.match(h.$('context-hints-status').textContent, /Модель после закрепления изменилась/);
  h.$('undo').click(); assert.deepEqual(await h.download(), before);
  const next = conceptProject(); next.project.name = 'Другой документ'; await h.load(serializeProjectFile(next));
  assert.equal(h.$('context-hints-pin').getAttribute('aria-pressed'), 'false'); assert.equal(hintText(h).includes(viewpointId), false);
  assert.match(hintText(h), /Представление/);
});

test(`${mode} hint controls preserve an unfinished inline draft and Escape closes the nonmodal panel`, async t => {
  const h = await setup(t); await h.load(serializeProjectFile(conceptProject())); h.$('context-hints-toggle').click(); const before = history(h);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Сохранить мой черновик'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  for (const control of [h.$('context-hints-toggle'), h.$('context-hints-close'), h.$('context-hints-pin'), h.document.querySelector('[data-command="context-hints-toggle"]')]) {
    h.pointer(control, 'pointerdown'); control.click();
    assert.equal(h.document.querySelector('.inline-editor input'), input); assert.equal(input.value, 'Сохранить мой черновик'); assert.equal(h.document.activeElement, input);
    assert.equal(h.$('context-hints-panel').hidden, false); assert.equal(h.$('context-hints-pin').getAttribute('aria-pressed'), 'false');
  }
  assert.deepEqual(history(h), before); key(h, input, 'Escape');
  h.$('context-hints-title').focus(); key(h, h.$('context-hints-title'), 'Escape'); assert.equal(h.$('context-hints-panel').hidden, true);
  assert.equal(h.$('context-hints-toggle').getAttribute('aria-expanded'), 'false');
});
