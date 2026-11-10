import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { production, setup, richLifecycleFixture } from './app-test-fixture.js';

const mode = production ? 'production' : 'source';
function command(h, name) {
  if (name === 'object-properties-edit') {
    command(h, 'inspector-button');
    assert.equal(h.$('inspector-panel').open, true);
    h.$('object-properties-edit').click();
    assert.equal(h.$('inspector-panel').open, false);
    return;
  }
  const button = h.document.querySelector(`[data-command="${name}"]`);
  assert.ok(button, `Workbench menu exposes ${name}`); button.click();
}
function selectDrawing(h, id) {
  const drawing = h.$('canvas').querySelector(`[data-id="${id}"]`);
  assert.ok(drawing); drawing.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
function input(h, field, value) {
  field.value = value; field.dispatchEvent(new h.window.Event('input', { bubbles: true }));
}
const submit = (h, prefix) => h.$(`${prefix}-form`).dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
const property = (h, key) => [...h.$('object-properties-fields').querySelectorAll('.property-row')]
  .find(row => row.querySelector('[name=name]').value === key)?.querySelector('[name=value]');
function beforeUnload(h) {
  const event = new h.window.Event('beforeunload', { cancelable: true }); h.window.dispatchEvent(event); return event.defaultPrevented;
}

test(`${mode} app: properties open explicitly for the context target and cancelling a name draft preserves the model`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(); await h.load(serializeProjectFile(fixture.state));
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  selectDrawing(h, fixture.a.occurrenceId);
  assert.equal(h.$('inspector-panel').open, false);
  assert.equal(h.document.querySelector('.toolbox #inspector-content'), null);
  const target = h.$('canvas').querySelector(`[data-id="${fixture.b.occurrenceId}"]`);
  target.dispatchEvent(new h.window.MouseEvent('contextmenu', { button: 2, clientX: 120, clientY: 120, bubbles: true, cancelable: true }));
  h.$('context-menu').querySelector('[data-context-action="properties"]').click();
  assert.equal(h.$('inspector-panel').open, true);
  assert.equal(h.$('context-menu').hidden, true);
  assert.equal(h.$('inspector-content').querySelector('.object-name').dataset.renameId, fixture.b.elementId);
  assert.equal(h.$('inspector-content').querySelector('.inspector-advanced').open, false);
  h.$('inspector-content').querySelector('.object-name').click();
  const field = h.$('inspector-content').querySelector('.inline-editor input'); assert.ok(field);
  input(h, field, 'Cancelled name');
  const history = h.$('history-state').textContent;
  command(h, 'save'); assert.equal(h.$('file-dialog').open, false);
  h.$('inspector-panel').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.equal(h.$('inspector-panel').open, false); assert.equal(h.document.querySelector('.inline-editor'), null);
  assert.equal(h.$('history-state').textContent, history);
  assert.deepEqual(deserializeProjectFile(await h.download()), fixture.state);
});

test(`${mode} app: modal properties hand documentation editing one dialog and one undoable change`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(); await h.load(serializeProjectFile(fixture.state));
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); selectDrawing(h, fixture.a.occurrenceId);
  command(h, 'inspector-button');
  h.$('inspector-content').querySelector('[data-inspector-action="documentation"]').click();
  assert.deepEqual([...h.document.querySelectorAll('dialog[open]')].map(item => item.id), ['documentation-dialog']);
  input(h, h.$('documentation-value'), 'Shared documentation'); submit(h, 'documentation');
  assert.equal(h.document.querySelector('dialog[open]'), null);
  const edited = structuredClone(fixture.state); edited.elements.find(item => item.id === fixture.a.elementId).documentation = 'Shared documentation';
  assert.deepEqual(deserializeProjectFile(await h.download()), edited);
  command(h, 'undo'); assert.deepEqual(deserializeProjectFile(await h.download()), fixture.state);
  command(h, 'redo'); assert.deepEqual(deserializeProjectFile(await h.download()), edited);
});

test(`${mode} app: modal name F2 edits only its focused title, guards modified/IME keys and preserves cancellation and atomic undo`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), initial = Buffer.from(serializeProjectFile(fixture.state));
  await h.load(initial); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  selectDrawing(h, fixture.a.occurrenceId); command(h, 'inspector-button');
  const title = () => h.$('inspector-content').querySelector('.object-name');
  const press = (target, key, extra = {}) => {
    const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event); return event;
  };
  const history = h.$('history-state').textContent;
  title().focus();
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    assert.equal(press(title(), 'F2', modifiers).defaultPrevented, false);
    assert.equal(h.document.querySelector('.inline-editor'), null);
  }
  h.$('inspector-close').focus(); press(h.$('inspector-close'), 'F2');
  assert.equal(h.document.querySelector('.inline-editor'), null);
  title().focus(); assert.equal(press(title(), 'F2').defaultPrevented, true);
  let field = h.$('inspector-content').querySelector('.inline-editor input'); assert.ok(field);
  assert.equal(h.document.activeElement, field); input(h, field, 'Cancelled name');
  press(field, 'Escape');
  assert.equal(h.$('inspector-panel').open, true); assert.equal(h.document.querySelector('.inline-editor'), null);
  assert.equal(h.document.activeElement, title()); assert.equal(h.$('history-state').textContent, history);
  press(title(), 'F2'); field = h.$('inspector-content').querySelector('.inline-editor input'); input(h, field, 'Shared F2 name');
  press(field, 'Enter'); press(field, 'Enter');
  assert.equal(h.$('inspector-panel').open, true); assert.equal(title().textContent, 'Shared F2 name');
  assert.equal(h.document.activeElement, title()); assert.match(h.$('history-state').textContent, /1 действий/);
  const changed = structuredClone(fixture.state); changed.elements.find(element => element.id === fixture.a.elementId).name = 'Shared F2 name';
  press(title(), 'F2'); field = h.$('inspector-content').querySelector('.inline-editor input'); input(h, field, 'Discard on close');
  h.$('inspector-panel').dispatchEvent(new h.window.Event('cancel', { cancelable: true }));
  assert.equal(h.$('inspector-panel').open, false); assert.equal(h.document.querySelector('.inline-editor'), null);
  assert.deepEqual(deserializeProjectFile(await h.download()), changed);
  command(h, 'undo'); assert.deepEqual(await h.download(), initial);
  command(h, 'redo'); assert.deepEqual(deserializeProjectFile(await h.download()), changed);
});

test(`${mode} app: advanced properties stay expanded after an undoable action redraws the modal`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(); await h.load(serializeProjectFile(fixture.state));
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); selectDrawing(h, fixture.a.occurrenceId);
  command(h, 'inspector-button'); h.$('inspector-content').querySelector('.inspector-advanced').open = true;
  const add = [...h.$('inspector-content').querySelectorAll('button')].find(button => button.textContent === 'Добавить экземпляр в этот вид');
  add.focus(); add.click();
  assert.equal(h.$('inspector-panel').open, true);
  assert.equal(h.$('inspector-content').querySelector('.inspector-advanced').open, true);
  assert.equal(h.document.activeElement.textContent, 'Добавить экземпляр в этот вид');
  h.$('inspector-close').click(); command(h, 'undo');
  assert.deepEqual(deserializeProjectFile(await h.download()), fixture.state);
});

test(`${mode} app: workbench property and size commands save shared metadata and view-local geometry with exact undo/redo`, async t => {
  if (production) assert.equal(readFileSync(new URL('../../dist/model/src/object-properties.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/object-properties.js', import.meta.url), 'utf8'), 'Production properties module must match source; rebuild first');
  const h = await setup(t), fixture = richLifecycleFixture(), initial = fixture.state;
  await h.load(serializeProjectFile(initial));
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); selectDrawing(h, fixture.a.occurrenceId);
  command(h, 'object-properties-edit'); assert.equal(h.$('object-properties-dialog').open, true);
  input(h, property(h, 'owner'), 'Arkita colleagues <img src=x>'); submit(h, 'object-properties'); submit(h, 'object-properties');
  assert.equal(h.$('object-properties-dialog').open, false);
  assert.match(h.$('inspector-content').querySelector('.property-table').textContent, /Arkita colleagues <img src=x>/);
  assert.equal(h.$('inspector-content').querySelector('img'), null);
  const metadata = structuredClone(initial); metadata.elements.find(item => item.id === fixture.a.elementId).properties.find(row => row.key === 'owner').value = 'Arkita colleagues <img src=x>';
  assert.deepEqual(deserializeProjectFile(await h.download()), metadata);
  assert.match(h.$('history-state').textContent, /1 действий/);
  command(h, 'undo'); assert.deepEqual(deserializeProjectFile(await h.download()), initial);
  command(h, 'redo'); assert.deepEqual(deserializeProjectFile(await h.download()), metadata);
  selectDrawing(h, fixture.a.occurrenceId); command(h, 'occurrence-size-edit');
  assert.equal(h.$('occurrence-size-dialog').open, true);
  input(h, h.$('occurrence-size-width'), '310.5'); input(h, h.$('occurrence-size-height'), '140.2'); submit(h, 'occurrence-size');
  const resized = structuredClone(metadata);
  Object.assign(resized.views.find(entry => entry.view.id === fixture.viewId).occurrences.find(item => item.id === fixture.a.occurrenceId).bounds, { width: 310.5, height: 140.2 });
  assert.deepEqual(deserializeProjectFile(await h.download()), resized);
  command(h, 'undo'); assert.deepEqual(deserializeProjectFile(await h.download()), metadata);
  command(h, 'redo'); assert.deepEqual(deserializeProjectFile(await h.download()), resized);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click();
  const other = initial.views.find(entry => entry.view.id === fixture.otherViewId).occurrences.find(item => item.concept.id === fixture.a.elementId);
  selectDrawing(h, other.id); assert.match(h.$('inspector-content').querySelector('.property-table').textContent, /Arkita colleagues/);
  command(h, 'occurrence-size-edit'); assert.equal(Number(h.$('occurrence-size-width').value), other.bounds.width);
  h.$('occurrence-size-cancel').click(); assert.deepEqual(deserializeProjectFile(await h.download()), resized);
});

test(`${mode} app: property drafts guard menu/save/unload and cancel on selection, view and direct history transitions`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), bytes = Buffer.from(serializeProjectFile(fixture.state)); await h.load(bytes);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const open = () => {
    selectDrawing(h, fixture.a.occurrenceId); command(h, 'object-properties-edit'); input(h, property(h, 'owner'), 'uncommitted');
  };
  open(); const history = h.$('history-state').textContent;
  h.window.dispatchEvent(new h.window.Event('blur')); h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(h.$('object-properties-dialog').open, true); assert.equal(property(h, 'owner').value, 'uncommitted'); assert.equal(beforeUnload(h), true);
  for (const action of ['save', 'new', 'undo']) {
    command(h, action); assert.equal(h.$('object-properties-dialog').open, true); assert.equal(h.$('history-state').textContent, history);
  }
  h.$('object-properties-cancel').click(); assert.equal(beforeUnload(h), false); assert.deepEqual(await h.download(), bytes);
  open(); h.document.querySelector(`[data-element-id="${fixture.b.elementId}"]`).click();
  assert.equal(h.$('object-properties-dialog').open, false); submit(h, 'object-properties');
  open(); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.otherViewId}"]`).click();
  assert.equal(h.$('object-properties-dialog').open, false); submit(h, 'object-properties');
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click(); open(); submit(h, 'object-properties');
  open(); h.$('undo').click(); assert.equal(h.$('object-properties-dialog').open, false); submit(h, 'object-properties');
  assert.deepEqual(await h.download(), bytes); assert.equal(beforeUnload(h), false);
});

test(`${mode} app: ordinary relationship properties remain editable from the model tree with no views`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), initial = fixture.state; initial.views = [];
  await h.load(serializeProjectFile(initial));
  h.document.querySelector(`[data-relationship-id="${fixture.relation.relationshipId}"]`).click();
  command(h, 'object-properties-edit'); assert.equal(h.$('object-properties-dialog').open, true);
  input(h, property(h, 'payload'), 'Shared contract'); submit(h, 'object-properties');
  const edited = structuredClone(initial); edited.relationships.find(item => item.id === fixture.relation.relationshipId).properties.find(row => row.key === 'payload').value = 'Shared contract';
  assert.deepEqual(deserializeProjectFile(await h.download()), edited);
  command(h, 'undo'); assert.deepEqual(deserializeProjectFile(await h.download()), initial);
});

test(`${mode} app: capture-phase Ctrl+S cannot escape an inline name draft or open a native save picker`, async t => {
  let saves = 0;
  const h = await setup(t, { saveProject: async () => { saves++; return { status: 'cancelled' }; }, saveCurrentProject: async () => { saves++; return { status: 'cancelled' }; } });
  const history = h.$('history-state').textContent;
  h.$('project-name').click(); const field = h.document.querySelector('.inline-editor input'); assert.ok(field);
  input(h, field, 'Uncommitted name');
  for (const shiftKey of [false, true]) for (const keys of [{ key: 's' }, { key: 'ы', code: 'KeyS' }]) {
    const key = new h.window.KeyboardEvent('keydown', { ...keys, ctrlKey: true, shiftKey, bubbles: true, cancelable: true });
    field.dispatchEvent(key); assert.equal(key.defaultPrevented, true);
    assert.equal(h.document.querySelector('.inline-editor input'), field); assert.equal(field.value, 'Uncommitted name');
    assert.equal(saves, 0); assert.equal(h.$('file-dialog').open, false); assert.equal(h.$('history-state').textContent, history);
    assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.equal(beforeUnload(h), true);
  }
  field.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(h.document.querySelector('.inline-editor input'), null); assert.equal(beforeUnload(h), false);
  h.document.body.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(saves, 1); assert.equal(h.$('file-state').dataset.dirty, 'false');
});

test(`${mode} app: Russian Ctrl/Meta Undo and Redo restore exact serialized geometry after a canvas move`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), initial = Buffer.from(serializeProjectFile(fixture.state));
  await h.load(initial); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const drawing = h.$('canvas').querySelector(`[data-id="${fixture.a.occurrenceId}"]`);
  h.pointer(drawing, 'pointerdown', 100, 100); h.pointer(h.$('canvas'), 'pointermove', 150, 130); h.pointer(h.$('canvas'), 'pointerup', 150, 130);
  const changed = await h.download(); assert.notDeepEqual(changed, initial);
  const expected = structuredClone(fixture.state), occurrence = expected.views.find(entry => entry.view.id === fixture.viewId).occurrences.find(item => item.id === fixture.a.occurrenceId);
  occurrence.bounds.x += 50; occurrence.bounds.y += 30; assert.deepEqual(deserializeProjectFile(changed), expected);
  const press = keys => {
    const event = new h.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...keys });
    h.document.body.dispatchEvent(event); return event;
  };
  for (const ignored of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }]) {
    assert.equal(press({ key: 'я', code: 'KeyZ', ctrlKey: true, ...ignored }).defaultPrevented, false);
    assert.deepEqual(await h.download(), changed);
  }
  for (const modifier of ['ctrlKey', 'metaKey']) {
    assert.equal(press({ key: 'я', code: 'KeyZ', [modifier]: true }).defaultPrevented, true); assert.deepEqual(await h.download(), initial);
    assert.equal(press({ key: 'н', code: 'KeyY', [modifier]: true }).defaultPrevented, true); assert.deepEqual(await h.download(), changed);
    press({ key: 'я', code: 'KeyZ', [modifier]: true }); assert.deepEqual(await h.download(), initial);
    assert.equal(press({ key: 'Я', code: 'KeyZ', [modifier]: true, shiftKey: true }).defaultPrevented, true); assert.deepEqual(await h.download(), changed);
  }
  press({ key: 'z', ctrlKey: true }); assert.deepEqual(await h.download(), initial);
  press({ key: 'y', ctrlKey: true }); assert.deepEqual(await h.download(), changed);
});
