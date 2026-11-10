import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore, capturePortableFragment } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { serializeFragmentText } from '../../schemka-model-io/src/fragment-file.js';
import { installFragmentClipboard } from '../src/fragment-clipboard.js';
import { createClipboardService } from '../../electron/clipboard-service.mjs';

function fixture() {
  const store = createStore(createProject('Clipboard model')), run = c => store.execute(c, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Source' }), { viewId: otherViewId } = run({ type: 'createView', name: 'Target' });
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent', name: 'Общий <script> текст',
    properties: [{ key: 'empty', value: '' }, { key: 'unicode', value: '🙂\r\nе\u0301' }], bounds: { x: -20, y: -10, width: 120, height: 60 } });
  const b = run({ type: 'addOccurrence', viewId, concept: { kind: 'element', id: a.elementId }, bounds: { x: 140, y: 100, width: 120, height: 60 } });
  run({ type: 'createRelationshipAndConnection', viewId, source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: b.occurrenceId },
    relationshipType: 'Association', label: 'Общая связь', routePoints: [{ kind: 'bend', point: { x: 100, y: 0 } }], labelPosition: { x: 100, y: 30 } });
  return { state: store.snapshot, viewId, otherViewId, a, b };
}
function setup(t,options = {}) {
  const dom = new JSDOM('<button id="fragment-copy"></button><button id="fragment-cut"></button><button id="fragment-copy-image"></button><button id="fragment-paste-reuse"></button><button id="fragment-paste-clone"></button><button data-command="fragment-copy">Copy menu</button><svg id="canvas" tabindex="0"><g tabindex="0"></g></svg><input id="text"><section id="model-search-region"><button>Search result</button></section>');
  const { document } = dom.window; t.after(() => dom.window.close());
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); }; dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

  const f = fixture(), model = createController(createStore(f.state)), session = createProjectSession(model.store);
  options.desktop?.bindSession?.(session);
  model.switchView(f.viewId); model.selectMany([{ kind: 'occurrence', id: f.a.occurrenceId }, { kind: 'occurrence', id: f.b.occurrenceId }]);
  let blocked = false, message = '', focused = 0, renders = 0, ui, postCommitFailure = '';
  const $ = id => document.getElementById(id);
  ui = installFragmentClipboard({ document, model, session, desktop:options.desktop, imageSnapshot:options.imageSnapshot, readPasteMode:options.readPasteMode, blocked: () => blocked, status: value => { message = value; }, readPastePoint: () => ({ x: 40, y: 40 }),
    focus: () => { focused++; if (postCommitFailure === 'focus') throw Error('focus failed'); $('canvas').focus(); },
    render: () => { renders++; if (postCommitFailure === 'render') throw Error('render failed'); ui?.refresh(); },
    perform: (command, text) => { try { const result = model.execute(command); message = text; return result; } catch (error) { message = error.message; return null; } } });
  const key = (target, code, options = {}) => { const e = new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: code.slice(-1).toLowerCase(), code, ctrlKey: true, ...options }); target.dispatchEvent(e); return e; };
  const state = () => ({ files: model.store.exportFiles(), history: model.store.history, revision: model.store.revision, dirty: session.dirty, selection: model.selections });
  return { $, ...f, document, window: dom.window, model, session, ui, key, state, setBlocked: value => { blocked = value; },
    failAfterCommit: value => { postCommitFailure = value; }, get message() { return message; }, get focused() { return focused; }, get renders() { return renders; } };
}

test('clipboard commands copy without mutation and paste reuse/clone with predictable placement and one undo', t => {
  const h = setup(t), before = h.state(); h.$('fragment-copy').click();
  assert.deepEqual(h.state(), before); assert.match(h.message, /2 фигур, 1 внутренних связей/);
  h.model.switchView(h.otherViewId); h.ui.refresh(); h.$('fragment-paste-reuse').click();
  let state = h.model.store.snapshot, target = state.views.find(entry => entry.view.id === h.otherViewId);
  assert.equal(state.elements.length, 1); assert.equal(state.relationships.length, 1);
  assert.equal(target.occurrences.length, 2); assert.equal(target.connections.length, 1);
  assert.equal(Math.min(...target.occurrences.map(item => item.bounds.x)), 40);
  assert.equal(Math.min(...target.occurrences.map(item => item.bounds.y)), 40);
  assert.equal(h.model.selections.length, 3); assert.equal(h.model.store.history.undo, 1); assert.equal(h.session.dirty, true);
  const reuse = h.model.store.exportFiles(); h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before.files);
  h.model.redo(); assert.deepEqual(h.model.store.exportFiles(), reuse);
  h.$('fragment-paste-clone').click(); state = h.model.store.snapshot; target = state.views.find(entry => entry.view.id === h.otherViewId);
  assert.equal(state.elements.length, 2); assert.equal(state.relationships.length, 2);
  const clones = target.occurrences.filter(item => item.concept.id !== h.a.elementId);
  assert.equal(clones.length, 2); assert.equal(new Set(clones.map(item => item.concept.id)).size, 1);
  assert.equal(Math.min(...clones.map(item => item.bounds.x)), 64); assert.equal(h.model.store.history.undo, 2);
  assert.equal(h.focused, 2); assert.equal(h.renders, 2);
});

test('physical copy/paste keys work on canvas and leave text, search, Alt and composition alone', t => {
  const h = setup(t), initial = h.state();
  for (const target of [h.$('text'), h.document.querySelector('#model-search-region button')]) {
    assert.equal(h.key(target, 'KeyC').defaultPrevented, false); assert.equal(h.key(target, 'KeyV').defaultPrevented, false);
  }
  for (const options of [{ isComposing: true }, { altKey: true }, { ctrlKey: false }]) assert.equal(h.key(h.$('canvas'), 'KeyC', options).defaultPrevented, false);
  assert.deepEqual(h.state(), initial);
  assert.equal(h.key(h.$('canvas'), 'KeyC', { key: 'с' }).defaultPrevented, true);
  assert.deepEqual(h.state(), initial);
  assert.equal(h.key(h.$('canvas'), 'KeyV', { key: 'м', metaKey: true, ctrlKey: false }).defaultPrevented, true);
  assert.equal(h.model.store.history.undo, 1);
  assert.equal(h.key(h.$('canvas'), 'KeyV', { key: 'М', shiftKey: true }).defaultPrevented, true);
  assert.equal(h.model.store.snapshot.elements.length, 2); assert.equal(h.model.store.history.undo, 2);
});

test('capture guards preserve unfinished edits, clipboard and both histories across actual pointer/click order', t => {
  const h = setup(t); h.$('fragment-copy').click();
  h.model.execute({ type: 'renameProject', name: 'Later' }); h.model.undo();
  const before = h.state(); h.setBlocked(true); let lostDraft = false;
  h.document.addEventListener('pointerdown', () => { lostDraft = true; }, true);
  for (const button of [h.$('fragment-copy'), h.$('fragment-paste-reuse'), h.$('fragment-paste-clone'), h.document.querySelector('[data-command]')]) {
    const event = new h.window.Event('pointerdown', { bubbles: true, cancelable: true }); button.dispatchEvent(event); button.click();
    assert.equal(event.defaultPrevented, true); assert.equal(lostDraft, false);
  }
  h.key(h.$('canvas'), 'KeyV'); assert.deepEqual(h.state(), before); assert.match(h.message, /Завершите/);
  h.setBlocked(false); h.$('fragment-paste-reuse').click(); assert.equal(h.model.store.history.undo, 1);
});

test('stale source fails without changing selection/dirty/histories; restored source can be pasted again', t => {
  const h = setup(t); h.$('fragment-copy').click();
  h.model.execute({ type: 'renameElement', elementId: h.a.elementId, name: 'Changed' });
  const before = h.state(); h.$('fragment-paste-clone').click(); assert.deepEqual(h.state(), before); assert.match(h.message, /изменён|заново/);
  h.model.undo(); h.$('fragment-paste-clone').click(); assert.equal(h.model.store.history.undo, 1);
  assert.equal(h.model.store.snapshot.elements.length, 2);
});

test('reopening the same project ID forbids implicit reuse while portable clone requires an explicit confirmation', async t => {
  const h = setup(t); h.$('fragment-copy').click(); assert.equal(h.$('fragment-paste-reuse').disabled, false);
  const bytes = serializeProjectFile(h.model.store.snapshot), token = h.session.documentToken;
  await h.session.loadFile(h.session.beginLoad(), new Blob([bytes])); h.model.afterLoad(); h.ui.refresh();
  assert.notEqual(h.session.documentToken, token); assert.equal(h.$('fragment-paste-reuse').disabled, true);
  const before = h.state(); h.key(h.$('canvas'), 'KeyV'); assert.deepEqual(h.state(), before); assert.equal(h.$('fragment-dialog').open,true); h.$('fragment-cancel').click(); assert.deepEqual(h.state(),before);
});

test('a failed post-commit render or focus reports the saved paste and leaves one recoverable Undo', t => {
  for (const phase of ['render', 'focus']) {
    const h = setup(t), before = h.model.store.exportFiles(); h.$('fragment-copy').click(); h.failAfterCommit(phase);
    h.$('fragment-paste-reuse').click();
    assert.equal(h.model.store.history.undo, 1); assert.equal(h.session.dirty, true);
    assert.match(h.message, /^Вставка сохранена, но интерфейс/); assert.match(h.message, /Не повторяйте вставку/);
    assert.equal(h.model.store.snapshot.views.find(entry => entry.view.id === h.viewId).occurrences.length, 4);
    h.model.undo(); assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.session.dirty, false);
  }
});


const settle = async () => { for (let i=0;i<4;i++) await new Promise(resolve => setImmediate(resolve)); };
function nativeClipboard({ timeoutMs = 3000, deferDelivery = false, afterClaim = async () => {} } = {}) {
  let text = ''; const deliveries = [], acknowledgements = [], completions = [];
  const service = createClipboardService({ clipboard: { readText: () => text, writeText: value => { text = value; } }, timeoutMs });
  function client() {
    let delivered = null, session;
    const record = { window: { isDestroyed: () => false, webContents: { send(channel, request) {
      assert.equal(channel, 'schemka:clipboard-cut-delivered');
      if (deferDelivery) deliveries.push(() => delivered(request)); else void delivered(request);
    } } }, files: { get documentToken() { return session.documentToken; }, busy: false }, git: { busy: false } };
    return {
      bindSession: value => { session = value; },
      close: () => service.closed(record),
      async clipboardWriteFragment(input) { return service.write(record, input); },
      async clipboardReadFragment() { return service.read(); },
      async clipboardAcknowledgeCut(id, token) { const result = await service.acknowledge(record, id, token); acknowledgements.push(result); return result; },
      async clipboardClaimCut(id, token) { const result = service.claim(record, id, token); await afterClaim(result); return result; },
      onClipboardCutDelivered(callback) { delivered = callback; },
      async clipboardCompleteCut(id, token, result) { const completed = service.complete(record, id, token, result); completions.push(completed); return completed; },
    };
  }
  return { client, acknowledgements, completions, async deliver() { for (const run of deliveries.splice(0)) await run(); } };
}

test('native portable clone previews dependencies before Apply; cancel, stale read and stale confirmation preserve bytes and history', async t => {
  const native = nativeClipboard(), source = setup(t,{ desktop:native.client() }), destination = setup(t,{ desktop:native.client() });
  const sourceBefore = source.model.store.exportFiles(); source.$('fragment-copy').click(); await settle(); const before = destination.state(); destination.$('fragment-paste-clone').click(); await settle();
  assert.equal(destination.$('fragment-dialog').open,true); assert.match(destination.$('fragment-dialog').textContent,/Все концепты и ресурсы получат новые ID/); assert.deepEqual(destination.state(),before);
  destination.$('fragment-cancel').click(); assert.deepEqual(destination.state(),before);
  destination.$('fragment-paste-clone').click(); await settle(); destination.$('fragment-form').dispatchEvent(new destination.window.Event('submit',{ bubbles:true,cancelable:true })); await settle();
  assert.equal(destination.model.store.history.undo,1); assert.equal(destination.model.store.snapshot.elements.length,2); assert.deepEqual(source.model.store.exportFiles(),sourceBefore);
  destination.model.undo(); assert.deepEqual(destination.model.store.exportFiles(),before.files);
  destination.$('fragment-paste-clone').click(); await settle(); destination.model.execute({ type:'renameProject',name:'Changed during preview' }); destination.ui.refresh(); const changed = destination.state();
  destination.$('fragment-form').dispatchEvent(new destination.window.Event('submit',{ bubbles:true,cancelable:true })); await settle(); assert.deepEqual(destination.state(),changed);
  let complete; const delayed = setup(t,{ desktop:{ clipboardReadFragment:() => new Promise(resolve => { complete = resolve; }) } });
  delayed.$('fragment-paste-clone').click(); delayed.model.execute({ type:'renameProject',name:'Changed during read' }); const stale = delayed.state();
  complete({ status:'ok',text:serializeFragmentText(capturePortableFragment(source.model.store.snapshot,source.model.viewId,source.model.selections)) }); await settle(); assert.deepEqual(delayed.state(),stale); assert.equal(delayed.$('fragment-dialog').open,false);
});

test('Cut preserves source until paste, a local move has one Undo, and repeated paste cannot delete twice', async t => {
  const h = setup(t), before = h.state(); h.$('fragment-cut').click(); assert.deepEqual(h.state(),before); assert.match(h.message,/Исходник остаётся/);
  h.model.switchView(h.otherViewId); h.ui.refresh(); h.$('fragment-paste-reuse').click(); assert.equal(h.model.store.history.undo,1); assert.equal(h.model.store.snapshot.views.find(entry => entry.view.id === h.viewId).occurrences.length,0);
  h.model.undo(); assert.deepEqual(h.model.store.exportFiles(),before.files); h.model.redo(); const moved = h.model.store.exportFiles();
  h.key(h.$('canvas'),'KeyV'); assert.deepEqual(h.model.store.exportFiles(),moved,'a second portable paste awaits explicit confirmation'); h.$('fragment-cancel').click();
});

test('cross-window Cut removes only acknowledged unchanged source and each document has its own exact Undo', async t => {
  const native = nativeClipboard(), a = setup(t,{ desktop:native.client() }), b = setup(t,{ desktop:native.client() }); const sourceBefore = a.state(), destinationBefore = b.state();
  a.$('fragment-cut').click(); await settle(); assert.deepEqual(a.state(),sourceBefore); b.$('fragment-paste-clone').click(); await settle(); assert.match(b.$('fragment-dialog').textContent,/отдельные Undo/);
  b.$('fragment-form').dispatchEvent(new b.window.Event('submit',{ bubbles:true,cancelable:true })); await settle();
  assert.equal(a.model.store.history.undo,1); assert.equal(b.model.store.history.undo,1); assert.equal(a.model.store.snapshot.views.find(entry => entry.view.id === a.viewId).occurrences.length,0); assert.match(b.message,/Фрагмент перенесён/);
  a.model.undo(); b.model.undo(); assert.deepEqual(a.model.store.exportFiles(),sourceBefore.files); assert.deepEqual(b.model.store.exportFiles(),destinationBefore.files);
});

test('changed, busy or reopened Cut source remains recoverable after destination success; stale image capture never overwrites clipboard', async t => {
  for (const change of ['edit','blocked','reopen']) {
    const native = nativeClipboard(), a = setup(t,{ desktop:native.client() }), b = setup(t,{ desktop:native.client() }); a.$('fragment-cut').click(); await settle();
    if (change === 'edit') a.model.execute({ type:'renameProject',name:'New edit' });
    if (change === 'blocked') a.setBlocked(true);
    if (change === 'reopen') { await a.session.loadFile(a.session.beginLoad(),new Blob([serializeProjectFile(a.model.store.snapshot)])); a.model.afterLoad(); a.ui.refresh(); }
    const before = a.model.store.exportFiles(); b.$('fragment-paste-clone').click(); await settle(); b.$('fragment-form').dispatchEvent(new b.window.Event('submit',{ bubbles:true,cancelable:true })); await settle();
    assert.deepEqual(a.model.store.exportFiles(),before); assert.equal(b.model.store.history.undo,1); assert.match(b.message, change === 'reopen' ? /копия/ : /Вставлено как копия/);
  }
  let finish,writes=0; const h = setup(t,{ desktop:{ clipboardWriteImage:async () => { writes++; return { status:'ok' }; } },imageSnapshot:() => new Promise(resolve => { finish = resolve; }) });
  h.$('fragment-copy-image').click(); h.model.execute({ type:'renameProject',name:'Changed during raster' }); finish(new Uint8Array([1,2,3])); await settle(); assert.equal(writes,0); assert.match(h.message,/изменилось/);
});


test('a cancelled native read cannot clear a newer clipboard operation or replace its draft', async t => {
  const reads = [], h = setup(t,{ desktop:{ clipboardReadFragment:() => new Promise(resolve => reads.push(resolve)) } });
  const text = serializeFragmentText(capturePortableFragment(h.model.store.snapshot,h.model.viewId,h.model.selections)), before = h.state(), initial = h.ui.generation;
  h.$('fragment-paste-clone').click(); assert.equal(h.ui.active,true); assert.ok(h.ui.generation > initial); h.ui.cancel(); const cancelled = h.ui.generation;
  h.$('fragment-paste-clone').click(); reads[0]({ status:'ok',text }); await settle(); assert.equal(h.ui.active,true); assert.equal(h.$('fragment-dialog').open,false); assert.ok(h.ui.generation > cancelled);
  reads[1]({ status:'ok',text }); await settle(); assert.equal(h.$('fragment-dialog').open,true); assert.deepEqual(h.state(),before); h.$('fragment-cancel').click(); assert.equal(h.ui.active,false); assert.deepEqual(h.state(),before);
});

test('default Paste follows the declared policy and visible menu choice while explicit reuse stays stable, with one Undo and no empty history',t=>{
 const h=setup(t,{readPasteMode:()=> 'clone'}),before=h.state();h.$('fragment-copy').click();h.ui.refresh();assert.match(h.$('fragment-paste-default').textContent,/независимые/);h.model.switchView(h.otherViewId);h.ui.run('paste');assert.equal(h.model.store.snapshot.elements.length,2);assert.equal(h.model.store.history.undo,1);h.model.undo();assert.deepEqual(h.model.store.exportFiles(),before.files);h.$('fragment-paste-reuse').click();assert.equal(h.model.store.snapshot.elements.length,1);assert.equal(h.model.store.history.undo,1);
});


async function pasteAcrossWindows(source, destination) {
  source.$('fragment-cut').click(); await settle();
  destination.$('fragment-paste-clone').click(); await settle();
  destination.$('fragment-form').dispatchEvent(new destination.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
}

test('a cut delivered after main timeout leaves source unchanged and destination copy undoable', async t => {
  const native = nativeClipboard({ timeoutMs: 10, deferDelivery: true });
  const source = setup(t, { desktop: native.client() }), destination = setup(t, { desktop: native.client() });
  const before = source.state(), destinationBefore = destination.state();
  await pasteAcrossWindows(source, destination);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(native.acknowledgements[0].sourceRemoved, false);
  await native.deliver();
  assert.deepEqual(source.state(), before);
  assert.equal(destination.model.store.history.undo, 1);
  destination.model.undo(); assert.deepEqual(destination.model.store.exportFiles(), destinationBefore.files);
});

test('clipboard replacement before queued cut delivery cancels deletion in the real source renderer', async t => {
  const native = nativeClipboard({ deferDelivery: true });
  const source = setup(t, { desktop: native.client() }), destination = setup(t, { desktop: native.client() });
  const before = source.state();
  await pasteAcrossWindows(source, destination);
  destination.$('fragment-copy').click(); await settle();
  assert.equal(native.acknowledgements[0].sourceRemoved, false);
  await native.deliver(); assert.deepEqual(source.state(), before);
});

test('source edit, replacement or busy state while awaiting claim is checked before deletion and claim always completes', async t => {
  for (const change of ['edit', 'reopen', 'blocked']) {
    let release; const native = nativeClipboard({ afterClaim: () => new Promise(resolve => { release = resolve; }) });
    const source = setup(t, { desktop: native.client() }), destination = setup(t, { desktop: native.client() });
    await pasteAcrossWindows(source, destination);
    assert.equal(typeof release, 'function');
    if (change === 'edit') source.model.execute({ type: 'renameProject', name: 'Changed during claim' });
    if (change === 'blocked') source.setBlocked(true);
    if (change === 'reopen') { await source.session.loadFile(source.session.beginLoad(), new Blob([serializeProjectFile(source.model.store.snapshot)])); source.model.afterLoad(); source.ui.refresh(); }
    const before = source.state(); release(); await settle();
    assert.deepEqual(source.state(), before, change);
    assert.equal(native.acknowledgements[0].sourceRemoved, false, change);
    assert.deepEqual(native.completions, [{ status: 'ok' }], change);
  }
});

test('a claimed cut survives later clipboard replacement and timeout with exact source and destination Undo', async t => {
  let release; const native = nativeClipboard({ timeoutMs: 10, afterClaim: () => new Promise(resolve => { release = resolve; }) });
  const source = setup(t, { desktop: native.client() }), destination = setup(t, { desktop: native.client() });
  const before = source.state(), destinationBefore = destination.state();
  await pasteAcrossWindows(source, destination); assert.equal(typeof release, 'function');
  destination.$('fragment-copy').click(); await settle();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(native.acknowledgements.length, 0);
  release(); await settle();
  assert.equal(native.acknowledgements[0].sourceRemoved, true);
  assert.deepEqual(native.completions, [{ status: 'ok' }]);
  assert.equal(source.model.store.history.undo, 1); assert.equal(destination.model.store.history.undo, 1);
  source.model.undo(); destination.model.undo();
  assert.deepEqual(source.model.store.exportFiles(), before.files);
  assert.deepEqual(destination.model.store.exportFiles(), destinationBefore.files);
});


test('closing destination after a claim resolves acknowledgement without claiming source preservation', async t => {
  let release; const native = nativeClipboard({ afterClaim: () => new Promise(resolve => { release = resolve; }) });
  const source = setup(t, { desktop: native.client() }), destinationBridge = native.client(), destination = setup(t, { desktop: destinationBridge });
  await pasteAcrossWindows(source, destination); assert.equal(typeof release, 'function');
  destinationBridge.close(); await settle();
  assert.equal(native.acknowledgements[0].sourceRemoved, null);
  assert.match(destination.message, /Результат удаления исходника не подтверждён/);
  release(); await settle();
});


test('lost acknowledgement after source deletion reports an unconfirmed result instead of source preservation', async t => {
  const native = nativeClipboard(), source = setup(t, { desktop: native.client() }), bridge = native.client();
  const acknowledge = bridge.clipboardAcknowledgeCut;
  bridge.clipboardAcknowledgeCut = async (...args) => { await acknowledge(...args); throw Error('IPC response lost'); };
  const destination = setup(t, { desktop: bridge });
  await pasteAcrossWindows(source, destination);
  assert.equal(source.model.store.history.undo, 1); assert.equal(destination.model.store.history.undo, 1);
  assert.match(destination.message, /Результат удаления исходника не подтверждён.*Проверьте обе модели/);
  assert.doesNotMatch(destination.message, /Исходник переноса сохранён/);
});
