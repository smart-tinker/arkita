import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createStore, LIMITS, metadataRecord } from '../../schemka-model-core/src/index.js';
import { customizationProject } from '../../schemka-model-core/fixtures/customization-project.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installDocumentationEditor } from '../src/documentation-editor.js';

function setup(t, raw = ' initial\r\ntext ', kind = 'element') {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id);
  const state = customizationProject(); for (const item of [state.project, ...state.elements, ...state.junctions, ...state.relationships, ...state.views.map(entry => entry.view)]) { if (Object.hasOwn(item, 'label')) item.label = '<img src=x> same'; else item.name = '<img src=x> same'; item.documentation = raw; }
  const store = createStore(state), adapted = Object.create(store), session = createProjectSession(store);
  const concept = { kind, id: (kind === 'project' ? state.project : kind === 'view' ? state.views[0].view : state[`${kind}s`][0]).id }, executions = [], reports = [], flags = {};
  let editor, renders = 0, executeHook = null;
  Object.defineProperty(adapted, 'execute', { value(command, revision) {
    executions.push({ command: structuredClone(command), revision }); executeHook?.(); return store.execute(command, revision);
  } });
  const model = createController(adapted); model.select(['project', 'view'].includes(kind) ? null : concept);
  const dialog = $('documentation-dialog'), event = (target, type) => target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  dialog.close = () => { if (flags.close) throw Error('synthetic close'); dialog.removeAttribute('open'); event(dialog, 'close'); };
  editor = installDocumentationEditor({ document, model, session, blocked: () => flags.blocked,
    openDialog(id) { assert.equal(id, 'documentation-dialog'); if (flags.open) throw Error('synthetic open'); dialog.setAttribute('open', ''); },
    render() { assert.equal(editor.active, false); renders++; if (flags.render) throw Error('synthetic render'); },
    status(message) { reports.push(message); if (flags.status) throw Error('synthetic status'); } });
  return { $, window, document, store, model, session, editor, concept, executions, reports, flags, dialog, event,
    open: () => editor.open(concept), submit: () => event($('documentation-form'), 'submit'),
    value(text, notify = true) { $('documentation-value').value = text; if (notify) event($('documentation-value'), 'input'); },
    capture: () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty }),
    get item() { return metadataRecord(store.snapshot, concept); }, get renders() { return renders; }, set executeHook(value) { executeHook = value; } };
}

test('documentation editor: exact metadata owner reference is literal, read-only and accessible', t => {
  for (const kind of ['project', 'view', 'element', 'junction', 'relationship']) {
    const h = setup(t, ' <svg onload="bad()"> & 😀 ', kind), before = h.capture();
    assert.equal(h.open(), true); assert.equal(h.editor.active, true); assert.ok(h.editor.generation > 0);
    assert.match(h.$('documentation-reference').textContent, /<img src=x> same/); assert.ok(h.$('documentation-reference').textContent.includes(h.concept.id));
    assert.equal(h.$('documentation-value').value, h.item.documentation); assert.equal(h.$('documentation-value').maxLength, LIMITS.string);
    assert.equal(h.document.activeElement, h.$('documentation-value')); assert.equal(h.document.querySelector('#documentation-dialog img'), null);
    assert.equal(h.dialog.getAttribute('aria-labelledby'), 'documentation-title'); assert.equal(h.document.querySelector('label[for="documentation-value"]').textContent, 'Текст документации');
    assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 0);
  }
});

test('documentation editor: unchanged/reverted CR/CRLF and whitespace retain raw bytes and both history stacks', t => {
  for (const raw of ['\r', '\r\n\r\n', 'a\r\nb\rc\n\t', '  日本語 😀  ', 'x'.repeat(8192), '😀'.repeat(4096)]) {
    const h = setup(t, raw); h.model.execute({ type: 'renameProject', name: 'Kept' }); h.model.execute({ type: 'renameProject', name: 'Future' }); h.model.undo();
    const before = h.capture(), count = h.executions.length;
    h.open(); const initial = h.$('documentation-value').value; assert.equal(initial, raw.replace(/\r\n?/g, '\n')); h.submit();
    assert.deepEqual(h.capture(), before);
    h.open(); h.value('temporary'); h.value(initial); h.submit(); h.submit();
    assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, count); assert.equal(h.renders, 0);
    h.model.redo(); assert.equal(h.store.snapshot.project.name, 'Future');
  }
});

test('documentation editor: changed text and empty string commit exactly once with exact undo/redo', t => {
  for (const kind of ['project', 'view', 'element', 'junction', 'relationship']) for (const text of ['', ' <img src=x onerror=bad()>\n\t日本語 😀 ', '😀'.repeat(4096)]) {
    const h = setup(t, 'old\r\nraw', kind), before = h.capture(), expected = h.store.snapshot;
    h.open(); h.value(text); const revision = h.store.revision; h.submit(); h.submit();
    metadataRecord(expected, h.concept).documentation = text;
    assert.deepEqual(h.store.snapshot, expected); assert.equal(Object.hasOwn(h.item, 'documentation'), true);
    assert.deepEqual(h.executions, [{ command: { type: 'updateMetadata', owner: h.concept, documentation: text }, revision }]);
    assert.equal(h.session.dirty, true); assert.equal(h.editor.active, false); assert.equal(h.dialog.open, false);
    assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.renders, 1);
    const changed = h.capture(); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files); assert.equal(h.session.dirty, false);
    h.model.redo(); assert.deepEqual(h.store.exportFiles(), changed.files); assert.equal(h.session.dirty, true);
  }
});

test('documentation editor: intentional changed CRLF uses textarea submitted LF without trimming', t => {
  const h = setup(t); h.open(); h.value(' new\r\nline\rtext '); h.submit(); assert.equal(h.item.documentation, ' new\nline\ntext ');
});

test('documentation editor: 8193-unit programmatic overflow keeps the draft and commits nothing until corrected', t => {
  const h = setup(t), before = h.capture(); h.open(); h.value('😀'.repeat(4096) + 'x', false); h.submit();
  assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, true); assert.equal(h.$('documentation-apply').disabled, true);
  assert.match(h.$('documentation-error').textContent, /8192.*8193/); assert.equal(h.executions.length, 0);
  h.value('😀'.repeat(4096)); assert.equal(h.$('documentation-apply').disabled, false); h.submit(); assert.equal(h.item.documentation.length, 8192);
});

test('documentation editor: cancel, Escape, native close and late submit cannot commit abandoned text', t => {
  for (const cancel of [h => h.editor.cancel(), h => h.event(h.dialog, 'cancel'), h => h.dialog.close(), h => h.dialog.removeAttribute('open')]) {
    const h = setup(t), before = h.capture(); h.open(); h.value('abandoned'); cancel(h); h.submit(); h.submit();
    assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false); assert.equal(h.executions.length, 0);
  }
  const h = setup(t); h.open(); h.editor.cancel(); h.open(); h.event(h.dialog, 'close');
  assert.equal(h.editor.active, true); h.value('new draft'); h.submit(); assert.equal(h.item.documentation, 'new draft');
});

test('documentation editor: stale revision, replacement store, selection and view reject without applying to any concept', t => {
  for (const stale of [h => h.model.execute({ type: 'renameProject', name: 'newer' }), h => { h.model.store = createStore(h.store.snapshot); },
    h => h.model.select({ kind: 'element', id: h.store.snapshot.elements[1].id }), h => h.model.select({ kind: 'occurrence', id: h.store.snapshot.views[0].occurrences[0].id }),
    h => h.model.switchView(h.store.snapshot.views[1].view.id)]) {
    const h = setup(t); h.open(); h.value('stale'); stale(h); const before = h.capture(), count = h.executions.length;
    h.submit(); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, count); assert.equal(h.editor.active, false);
    assert.match(h.$('documentation-error').textContent, /изменились/); assert.equal(h.$('documentation-apply').disabled, true);
  }
});

test('documentation editor: blocked, missing, wrong-kind and repeated opens leave no replacement draft', t => {
  const h = setup(t); h.flags.blocked = true; assert.equal(h.open(), false); assert.equal(h.editor.generation, 0); h.flags.blocked = false;
  for (const concept of [null, { kind: 'element', id: 'missing' }, { kind: 'relationship', id: h.store.snapshot.elements[0].id }, { kind: 'element', id: h.store.snapshot.junctions[0].id }]) assert.equal(h.editor.open(concept), false);
  assert.equal(h.open(), true); h.value('kept'); const generation = h.editor.generation; assert.equal(h.open(), false); assert.equal(h.editor.generation, generation);
  assert.equal(h.$('documentation-value').value, 'kept'); h.submit(); assert.equal(h.item.documentation, 'kept');
});

test('documentation editor: failed open and command rejection are noncommitting and late submissions cannot retry', t => {
  const h = setup(t), before = h.capture(); h.flags.open = true; assert.equal(h.open(), false); h.submit(); assert.deepEqual(h.capture(), before);
  h.flags.open = false; h.open(); h.value('rejected'); h.executeHook = () => { throw Error('synthetic command rejection'); };
  h.submit(); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.executions.length, 1); assert.equal(h.editor.active, false);
  assert.match(h.$('documentation-error').textContent, /не изменена.*synthetic command rejection/);
});

test('documentation editor: reentrant submit and post-commit render/status/close failures never duplicate or claim rollback', t => {
  for (const failure of ['render', 'status', 'close', 'none']) {
    const h = setup(t); h.open(); h.value('accepted'); h.flags[failure] = true;
    h.executeHook = () => { assert.equal(h.editor.active, false); h.submit(); };
    h.submit(); h.submit(); assert.equal(h.item.documentation, 'accepted'); assert.equal(h.executions.length, 1);
    assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.editor.active, false);
    assert.match(h.reports.at(-1), /[Дд]окументация.*сохранена/); assert.doesNotMatch(h.reports.at(-1), /не изменена/);
  }
});

test('documentation editor: cancel clears request even if closing fails', t => {
  const h = setup(t), before = h.capture(); h.open(); h.value('cancelled'); h.flags.close = true;
  assert.equal(h.editor.cancel(), true); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false);
  assert.match(h.reports.at(-1), /Правка отменена/);
});


test('documentation editor: safe Markdown Edit/View preserves exact CRLF draft, lists, no-op and Undo', t => {
  const raw = '# Заголовок\r\n\r\n- Первый\r\n- **Второй**\r\n\r\n1. Раз\r\n2. Два\r\n\r\n[Сайт](https://example.test/doc)\r\n<img src=x onerror=bad()>', h = setup(t, raw), before = h.capture();
  h.open(); assert.ok(h.$('documentation-view')); h.$('documentation-view').click();
  const preview = h.$('documentation-preview'); assert.equal(preview.hidden, false); assert.equal(h.$('documentation-value').hidden, true);
  assert.equal(preview.querySelector('h3').textContent, 'Заголовок'); assert.equal(preview.querySelectorAll('ul li').length, 2); assert.equal(preview.querySelectorAll('ol li').length, 2);
  assert.equal(preview.querySelector('img'), null); assert.match(preview.textContent, /<img src=x onerror=bad\(\)>/);
  h.$('documentation-edit').click(); assert.equal(h.$('documentation-value').hidden, false); assert.equal(preview.hidden, true); h.submit(); assert.deepEqual(h.capture(), before); assert.equal(h.item.documentation, raw);
  h.open(); h.value('## Изменено\n- пункт'); h.$('documentation-view').click(); h.submit(); assert.equal(h.item.documentation, '## Изменено\n- пункт'); assert.equal(h.store.history.undo, 1); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before.files);
});

test('documentation editor: explicit link actions use native document token and reject stale/unsupported sources', async t => {
  const h = setup(t, '[Go](https://example.test) [Mail](mailto:someone@example.test)'), calls = [], before = h.capture();
  h.window.schemkaDesktop = { async openExternalLink(url, token) { calls.push({url, token}); return {status: 'opened'}; } };
  h.open(); assert.ok(h.$('documentation-view')); h.$('documentation-view').click();
  const link = h.$('documentation-preview').querySelector('a'); assert.equal(h.event(link, 'click'), false); await Promise.resolve();
  assert.deepEqual(calls, [{url:'https://example.test/',token:h.session.documentToken}]); assert.deepEqual(h.capture(), before);
  await h.editor.openLink('file:///C:/private.txt'); await h.editor.openLink('javascript:alert(1)'); await h.editor.openLink('https://user:pass@example.test'); assert.equal(calls.length, 1); assert.match(h.reports.at(-1), /HTTP|HTTPS/);
  h.model.execute({type:'renameProject',name:'Newer'}); await h.editor.openLink('https://example.test/stale'); assert.equal(calls.length, 1); assert.match(h.$('documentation-error').textContent, /изменил/);
  h.editor.cancel(); delete h.window.schemkaDesktop; await h.editor.openLink('https://example.test'); assert.match(h.reports.at(-1), /настольном/);
});

test('documentation editor: late external link result does not alter a new draft or canceled model', async t => {
  const h = setup(t, '[Go](https://example.test)'), before = h.capture(); let resolve;
  h.window.schemkaDesktop = {openExternalLink:()=>new Promise(done=>{resolve=done;})};
  h.open(); assert.equal(typeof h.editor.openLink, 'function'); const pending=h.editor.openLink('https://example.test'); h.editor.cancel(); h.open(); h.value('New draft'); resolve({status:'error',message:'late failure'}); await pending;
  assert.equal(h.$('documentation-value').value, 'New draft'); assert.equal(h.$('documentation-error').textContent,''); assert.deepEqual(h.capture(),before);
});
