import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createStore } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installWhereUsed } from '../src/where-used-ui.js';
import { usageFixture } from './where-used-fixture.js';

function setup(t) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id), fixture = usageFixture();
  const store = createStore(fixture.state), model = createController(store), session = createProjectSession(store);
  model.select(fixture.refs.element);
  const flags = {}, navigations = [], restored = [], messages = [], dialog = $('where-used-dialog');
  const event = (target, name) => target.dispatchEvent(new window.Event(name, { bubbles: true, cancelable: true }));
  dialog.close = () => { dialog.removeAttribute('open'); event(dialog, 'close'); };
  const ui = installWhereUsed({ document, model, blocked: () => flags.blocked,
    openDialog(id) { assert.equal(id, 'where-used-dialog'); if (flags.open) throw Error('open failed'); dialog.setAttribute('open', ''); },
    navigate(usage, concept) { assert.equal(ui.active, false); navigations.push({ usage, concept }); },
    restoreFocus(unchanged) { restored.push(unchanged); }, status(text) { messages.push(text); } });
  return { $, window, document, fixture, store, model, session, ui, flags, navigations, restored, messages, dialog, event,
    capture: () => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty }),
    open: (reference = fixture.refs.element) => ui.open(reference), results: () => [...$('where-used-list').querySelectorAll('button')] };
}

test('where-used dialog: literal accessible results, exact typed navigation and repeat clicks are read-only with both history stacks', t => {
  const h = setup(t); h.model.execute({ type: 'renameProject', name: 'Past' }); h.model.execute({ type: 'renameProject', name: 'Future' }); h.model.undo();
  const before = h.capture(); assert.equal(before.dirty, true); assert.deepEqual(before.history, { undo: 1, redo: 1 });
  for (const reference of [h.fixture.refs.element, h.fixture.refs.junction, h.fixture.refs.relationship]) {
    assert.equal(h.open(reference), true); assert.equal(h.ui.active, true);
    assert.equal(h.dialog.getAttribute('aria-labelledby'), 'where-used-title');
    assert.equal(h.dialog.getAttribute('aria-describedby'), 'where-used-reference');
    assert.equal(h.document.activeElement, h.results()[0]); assert.match(h.$('where-used-reference').textContent, /<img|<svg/);
    assert.equal(h.dialog.querySelector('img,svg,script'), null);
    const target = h.results().at(-1), count = h.navigations.length;
    assert.ok(target.textContent.includes(target.dataset.drawingId)); assert.ok(target.textContent.includes(target.dataset.viewId));
    target.click(); target.click(); assert.equal(h.navigations.length, count + 1);
    assert.deepEqual(h.navigations.at(-1).concept, reference);
    assert.equal(h.navigations.at(-1).usage.id, target.dataset.drawingId);
    assert.equal(h.navigations.at(-1).usage.kind, target.dataset.drawingKind);
    assert.deepEqual(h.capture(), before);
  }
  h.model.redo(); assert.equal(h.store.snapshot.project.name, 'Future');
});

test('where-used dialog: empty state, Escape, native close, repeated opens and abandoned result preserve state and restore focus', t => {
  const h = setup(t), before = h.capture();
  h.open(h.fixture.refs.unused); assert.match(h.$('where-used-count').textContent, /пока нет рисунков/);
  assert.equal(h.results().length, 0); assert.equal(h.document.activeElement, h.$('where-used-close'));
  h.$('where-used-close').click(); assert.equal(h.restored.at(-1), true);
  for (const cancel of [() => h.event(h.dialog, 'cancel'), () => h.dialog.close(), () => h.ui.cancel(true)]) {
    h.open(); const button = h.results()[0], generation = h.ui.generation;
    assert.equal(h.open(h.fixture.refs.relationship), false); assert.equal(h.ui.generation, generation);
    cancel(); assert.equal(h.dialog.open, false); assert.equal(h.ui.active, false); assert.equal(h.restored.at(-1), true);
    h.open(); button.click(); assert.equal(h.navigations.length, 0); assert.equal(h.dialog.open, true);
    h.ui.cancel();
  }
  assert.deepEqual(h.capture(), before);
});

test('where-used dialog: stale store, revision, view and selection reject results without navigating', t => {
  for (const change of [h => h.model.execute({ type: 'renameProject', name: 'New state' }),
    h => { h.model.store = createStore(h.store.snapshot); }, h => h.model.switchView(h.fixture.otherViewId),
    h => h.model.select(h.fixture.refs.junction)]) {
    const h = setup(t); h.open(); const target = h.results()[0]; change(h); const before = h.capture();
    target.click(); target.click(); assert.equal(h.navigations.length, 0); assert.equal(h.ui.active, false);
    assert.ok(h.results().every(button => button.disabled)); assert.match(h.$('where-used-error').textContent, /изменились/);
    assert.deepEqual(h.capture(), before); h.$('where-used-close').click(); assert.equal(h.restored.at(-1), false);
  }
});

test('where-used dialog: missing or blocked open, failed modal, and a transient operation during navigation are noncommitting', t => {
  const h = setup(t), before = h.capture();
  for (const ref of [null, { kind: 'element', id: h.fixture.refs.junction.id }]) assert.equal(h.open(ref), false);
  h.flags.blocked = true; assert.equal(h.open(), false); h.flags.blocked = false;
  h.flags.open = true; assert.equal(h.open(), false); h.flags.open = false; assert.equal(h.ui.active, false);
  h.open(); h.flags.blocked = true; h.results()[0].click();
  assert.equal(h.navigations.length, 0); assert.equal(h.ui.active, false); assert.match(h.messages.at(-1), /Переход отменён/);
  assert.deepEqual(h.capture(), before);
});

test('where-used dialog: hidden result carries its explanation without treating it as visible', t => {
  const h = setup(t), before = h.capture(); h.open();
  const target = h.results().find(button => button.dataset.hidden === 'true');
  assert.match(target.textContent, /Скрыт viewpoint/); target.click();
  assert.equal(h.navigations.length, 1); assert.equal(h.navigations[0].usage.hidden, true);
  assert.match(h.messages.at(-1), /Выбран общий концепт; viewpoint не изменён/); assert.deepEqual(h.capture(), before);
});

test('where-used shows literal parent paths without hover; folder rename preserves exact view and drawing identities',t=>{
 const h=setup(t),parent=h.model.execute({type:'createFolder',name:'Дом <img src=x>'}).created.folderId;
 const folder=h.model.execute({type:'createFolder',name:'Сеть',parentFolderId:parent,members:[{kind:'view',id:h.fixture.otherViewId}]}).created.folderId;
 const before=h.capture();h.open();const first=h.results().find(item=>item.dataset.viewId===h.fixture.otherViewId),drawingId=first.dataset.drawingId;
 assert.match(first.textContent,/Дом <img src=x> \/ Сеть/);assert.equal(first.querySelector('[title]'),null);assert.equal(first.querySelector('img'),null);h.ui.cancel();
 h.model.execute({type:'updateFolder',folderId:folder,name:'Инфраструктура'});const renamed=h.capture();h.open();const current=h.results().find(item=>item.dataset.drawingId===drawingId);assert.match(current.textContent,/Дом <img src=x> \/ Инфраструктура/);current.click();assert.equal(h.navigations.at(-1).usage.id,drawingId);assert.equal(h.navigations.at(-1).usage.viewId,h.fixture.otherViewId);assert.deepEqual(h.capture(),renamed);assert.notDeepEqual(renamed.files,before.files);
});
