import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { createInlineEditor } from '../src/inline-editor.js';
import { createProjectSession } from '../src/project-session.js';

const id = (prefix, number) => `${prefix}-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const kinds = ['project', 'view', 'element', 'relationship'];
const breaks = ['\n', '\r\n', '\r'];
function fixture(lineBreak) {
  const state = createProject(`Project${lineBreak}name`);
  state.project.id = id('prj', 1); state.project.metamodel = { ...CURRENT_METAMODEL };
  state.elements = ['Collaboration', 'Role'].map((type, index) => ({
    id: id('el', index + 1), type, name: index ? 'Other shared element' : `Element${lineBreak}name`,
    documentation: 'Synthetic documentation\r\nretained exactly', properties: propertyEntries({ sample: 'Synthetic only', unicode: '日本語 😀' }),
  }));
  state.relationships = [{ id: id('rel', 1), type: 'Flow', source: { kind: 'element', id: id('el', 1) },
    target: { kind: 'element', id: id('el', 2) }, label: `Relation${lineBreak}name`, documentation: '', properties: propertyEntries({ note: 'Preserve me' }) }];
  state.views = [1, 2, 3].map(number => ({
    view: { id: id('view', number), name: number === 1 ? `View${lineBreak}name` : `Other view ${number}`, documentation: 'Preserve every view', properties: propertyEntries({}) },
    visualNodes: [], visualConnectors: [],
    occurrences: number === 3 ? [] : state.elements.map((element, index) => ({
      id: id('occ', number * 10 + index), concept: { kind: 'element', id: element.id },
      bounds: { x: index * 300 + number, y: number * 100, width: 200.3, height: 90.4 }, parent: null, style: {}, zIndex: index - number,
    })),
    connections: number === 3 ? [] : [{ id: id('conn', number), relationshipId: id('rel', 1),
      source: { kind: 'occurrence', id: id('occ', number * 10) }, target: { kind: 'occurrence', id: id('occ', number * 10 + 1) },
      routePoints: ([{ x: 1.1, y: 2.2 }]).map(point => ({ kind: 'bend', point })), labelPosition: { x: 3.3, y: 4.4 }, style: {} }],
  }));
  return deserializeProjectFile(serializeProjectFile(state));
}
function field(state, kind) {
  if (kind === 'project') return [state.project, 'name'];
  if (kind === 'view') return [state.views.find(entry => entry.view.id === id('view', 1)).view, 'name'];
  if (kind === 'element') return [state.elements.find(element => element.id === id('el', 1)), 'name'];
  return [state.relationships.find(relationship => relationship.id === id('rel', 1)), 'label'];
}
const capture = h => ({ bytes: Buffer.from(serializeProjectFile(h.store.snapshot)), revision: h.store.revision,
  history: h.store.history, dirty: h.session.dirty });
async function setup(kind, lineBreak) {
  const initial = fixture(lineBreak), bytes = Buffer.from(serializeProjectFile(initial));
  const store = createStore(createProject('Before import')), session = createProjectSession(store);
  await session.loadFile(session.beginLoad(), new Blob([bytes]));
  const svg = kind === 'element' || kind === 'relationship';
  const dom = new JSDOM(svg ? '<svg><g id="anchor"></g></svg>' : '<div><button id="anchor">Name</button></div>');
  const { document } = dom.window, anchor = document.getElementById('anchor'), reports = [];
  const target = { kind, id: field(initial, kind)[0].id };
  const editor = createInlineEditor({ document, read: () => store.snapshot, revision: () => store.revision,
    execute: command => store.execute(command, store.revision), render() {}, report: text => reports.push(text), restore() { anchor.focus(); } });
  return { initial, bytes, store, session, document, window: dom.window, editor, reports,
    start() {
      editor.start(target, anchor, {}, svg ? { x: 0, y: 0, width: 220, height: 82 } : null);
      return document.querySelector('.inline-editor input');
    },
    confirm(method = 'enter') {
      if (method === 'button') document.querySelector('.inline-editor button').click();
      else document.querySelector('.inline-editor input').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }, close() { dom.window.close(); },
  };
}
async function saveAndReopen(h, expected) {
  const ticket = h.session.prepareSave(), bytes = Buffer.from(ticket.bytes);
  h.session.completeSave(ticket);
  assert.deepEqual(deserializeProjectFile(bytes), expected);
  const reopenedStore = createStore(createProject('Reopen destination')), reopenedSession = createProjectSession(reopenedStore);
  await reopenedSession.loadFile(reopenedSession.beginLoad(), new Blob([bytes]));
  assert.deepEqual(reopenedStore.snapshot, expected);
  assert.deepEqual(Buffer.from(serializeProjectFile(reopenedStore.snapshot)), bytes);
  assert.equal(reopenedSession.dirty, false);
  return bytes;
}

test('real text inputs preserve imported LF/CRLF/CR names on untouched Enter or accept across all rename targets and file roundtrip', async () => {
  for (const kind of kinds) for (const lineBreak of breaks) for (const method of ['enter', 'button']) {
    const h = await setup(kind, lineBreak);
    try {
      const before = capture(h), input = h.start(), [record, key] = field(h.initial, kind);
      assert.equal(input.type, 'text');
      assert.equal(input.value, record[key].replace(/[\r\n]/g, ''), 'The real DOM sanitizer must be exercised');
      assert.notEqual(input.value, record[key]);
      const hint = h.document.getElementById('rename-hint');
      assert.match(hint.textContent, /переносы строк.*без правок они сохранятся.*Изменение поля заменит имя одной строкой/);
      assert.equal(hint.hidden, false); assert.ok(hint.isConnected);
      assert.ok(input.getAttribute('aria-describedby').split(' ').includes(hint.id));
      h.confirm(method);
      assert.equal(h.editor.active, false); assert.deepEqual(capture(h), before);
      assert.deepEqual(await saveAndReopen(h, h.initial), h.bytes);
    } finally { h.close(); }
  }
});

test('ordinary rename help remains accessible without adding visible text below the name', async () => {
  const h=await setup('project','');
  try {
    const before=capture(h), input=h.start(), hint=h.document.getElementById('rename-hint');
    assert.equal(hint.classList.contains('sr-only'),true);
    assert.match(hint.textContent,/Enter.*Esc/);
    assert.ok(input.getAttribute('aria-describedby').split(' ').includes(hint.id));
    h.editor.cancel(); assert.deepEqual(capture(h),before);
  } finally { h.close(); }
});

test('reverting a real input to its initial displayed value preserves exact names, dirty baseline and both history stacks', async () => {
  for (const kind of kinds) for (const lineBreak of breaks) {
    const h = await setup(kind, lineBreak);
    try {
      h.store.execute({ type: 'renameView', viewId: id('view', 2), name: 'Committed unrelated edit' }, h.store.revision);
      h.store.execute({ type: 'renameView', viewId: id('view', 2), name: 'Future unrelated edit' }, h.store.revision);
      h.store.undo(h.store.revision);
      const before = capture(h); assert.deepEqual(before.history, { undo: 1, redo: 1 }); assert.equal(before.dirty, true);
      const input = h.start(), displayed = input.value;
      input.value += ' temporary'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
      input.value = displayed; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
      h.confirm(); assert.deepEqual(capture(h), before);
      h.store.redo(h.store.revision); assert.equal(h.store.snapshot.views[1].view.name, 'Future unrelated edit');
    } finally { h.close(); }
  }
});

test('an explicitly changed single-line draft changes only its named field, keeps shared data, and roundtrips with reversible history', async () => {
  for (const kind of kinds) for (const lineBreak of breaks) {
    const h = await setup(kind, lineBreak);
    try {
      const input = h.start(); assert.match(h.document.getElementById('rename-hint').textContent, /Изменение поля заменит имя одной строкой/);
      input.value += ' edited'; input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
      const expected = structuredClone(h.initial), [record, key] = field(expected, kind); record[key] = input.value;
      h.confirm('button');
      assert.deepEqual(h.store.snapshot, expected); assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.session.dirty, true);
      const saved = await saveAndReopen(h, expected); assert.equal(h.session.dirty, false);
      h.store.undo(h.store.revision); assert.deepEqual(h.store.snapshot, h.initial); assert.equal(h.session.dirty, true);
      h.store.redo(h.store.revision); assert.deepEqual(Buffer.from(serializeProjectFile(h.store.snapshot)), saved); assert.equal(h.session.dirty, false);
    } finally { h.close(); }
  }
});

test('stale real-DOM no-op drafts fail before preservation logic and cannot overwrite a later rename', async () => {
  for (const kind of kinds) {
    const h = await setup(kind, '\r\n');
    try {
      h.start(); h.store.execute({ type: 'renameProject', name: 'Later committed project name' }, h.store.revision);
      const before = capture(h); h.confirm();
      assert.equal(h.editor.active, true); assert.match(h.document.getElementById('rename-error').textContent, /Модель изменилась/);
      assert.deepEqual(capture(h), before); h.editor.cancel(); assert.deepEqual(capture(h), before);
    } finally { h.close(); }
  }
});

// Browsers may leave a text input unfocused rather than focus a clicked button.
// Model that native default explicitly: jsdom .click() alone has no focus phase.
async function mouseActivate(h, control, input) {
  control.dispatchEvent(new h.window.MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
  const down = new h.window.MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
  control.dispatchEvent(down);
  if (!down.defaultPrevented) input.blur();
  await Promise.resolve(); // focusout cancellation runs before mouseup/click
  if (control.isConnected) {
    control.dispatchEvent(new h.window.MouseEvent('mouseup', { button: 0, bubbles: true, cancelable: true }));
    control.click();
  }
}

test('real mouse Apply and Cancel survive mousedown focus loss before click across HTML and SVG rename targets', async () => {
  for (const kind of kinds) for (const action of ['apply', 'cancel']) {
    const h = await setup(kind, '\r\n');
    try {
      const before = capture(h), input = h.start(); input.value = `Mouse ${kind} edited`;
      const control = h.document.querySelectorAll('.inline-editor button')[action === 'apply' ? 0 : 1];
      await mouseActivate(h, control, input);
      assert.equal(h.editor.active, false, `${kind}: ${action} closes the editor`);
      if (action === 'apply') {
        const expected = structuredClone(h.initial), [record, key] = field(expected, kind); record[key] = `Mouse ${kind} edited`;
        assert.deepEqual(h.store.snapshot, expected, `${kind}: the mouse click commits the intended field`);
        assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.session.dirty, true);
        await saveAndReopen(h, expected); h.store.undo(h.store.revision); assert.deepEqual(h.store.snapshot, h.initial);
      } else assert.deepEqual(capture(h), before, `${kind}: Cancel never commits the draft`);
    } finally { h.close(); }
  }
});

test('mouse Apply preserves untouched imported text and redo; pointer press alone never commits and outside blur still cancels', async () => {
  const h = await setup('project', '\r\n');
  try {
    h.store.execute({ type: 'renameView', viewId: id('view', 2), name: 'Undo this unrelated edit' }, h.store.revision); h.store.undo(h.store.revision);
    const before = capture(h), input = h.start(), apply = h.document.querySelector('.inline-editor button');
    const down = new h.window.MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }); apply.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true); await Promise.resolve();
    assert.equal(h.editor.active, true); assert.equal(h.document.activeElement, input); assert.deepEqual(capture(h), before);
    await mouseActivate(h, apply, input); assert.deepEqual(capture(h), before);
    const changed = h.start(); changed.value = 'Discard on real outside blur'; changed.blur(); await Promise.resolve();
    assert.equal(h.editor.active, false); assert.deepEqual(capture(h), before);
  } finally { h.close(); }
});
