import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createInlineEditor } from '../src/inline-editor.js';

// Minimal event/element harness checks transaction policy, not browser rendering.
function harness() {
  const doc = { activeElement: null };
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.attrs = {}; this.value = ''; }
    setAttribute(key, value) { this.attrs[key] = value; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceWith(next) { const parent = this.parent; if (parent) { parent.children[parent.children.indexOf(this)] = next; next.parent = parent; this.parent = null; } }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1); this.parent = null; }
    addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
    focus() { doc.activeElement = this; }
    select() {}
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    event(name, options = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...options };
      for (const handler of this.handlers[name] || []) handler(event);
      return event;
    }
  }
  doc.createElement = tag => new Element(tag); doc.createElementNS = (_, tag) => new Element(tag);
  const parent = new Element('div'), anchor = new Element('button'); parent.append(anchor); anchor.focus();
  const store = createDemo(), reports = []; let renders = 0, restores = 0;
  const target = { kind: 'project', id: store.snapshot.project.id };
  const editor = createInlineEditor({ document: doc, read: () => store.snapshot, revision: () => store.revision, execute: command => store.execute(command, store.revision), render: () => renders++, report: value => reports.push(value), restore: () => { restores++; anchor.focus(); } });
  const start = () => { editor.start(target, anchor, {}); return parent.children[0]; };
  return { doc, store, editor, start, parent, anchor, reports, get renders() { return renders; }, get restores() { return restores; } };
}
test('Enter input commits once; no-op and invalid drafts add no history', () => {
  const h = harness(), first = h.start(); const input = first.children[0]; input.value = 'Renamed';
  first.event('keydown', { target: input, key: 'Enter' }); first.event('keydown', { target: input, key: 'Enter' });
  assert.equal(h.store.snapshot.project.name, 'Renamed'); assert.equal(h.store.history.undo,1); assert.equal(h.renders,1); assert.equal(h.restores,1);
  const same = h.start(); same.event('keydown', { target: same.children[0], key: 'Enter' }); assert.equal(h.store.history.undo,1);
  const bad = h.start(); bad.children[0].value = 'x'.repeat(8193); bad.event('keydown', { target: bad.children[0], key: 'Enter' });
  assert.equal(h.editor.active,true); assert.equal(h.store.history.undo,1); assert.equal(bad.children[0].attrs['aria-invalid'],'true'); h.editor.cancel();
});
test('Escape, outside blur and explicit cancellation never commit a draft', async () => {
  const h = harness(), before = h.store.exportFiles();
  assert.equal(h.editor.generation,0);
  const escape = h.start(); escape.children[0].value = 'Discard'; escape.event('keydown', { target: escape.children[0], key: 'Escape' });
  assert.equal(h.editor.active,false); assert.equal(h.restores,1); assert.equal(h.editor.generation,2);
  const blur = h.start(); blur.children[0].value = 'Discard'; h.doc.activeElement = h.anchor; blur.event('focusout'); await Promise.resolve();
  assert.equal(h.editor.active,false); assert.equal(h.restores,1);
  const switched = h.start(); switched.children[0].value='Discard'; h.editor.cancel(false);
  assert.deepEqual(h.store.exportFiles(),before); assert.equal(h.store.history.undo,0);
});
test('Enter/Space on accept or cancel preserve native button activation and correct action', () => {
  for (const index of [1,2]) for (const key of ['Enter',' ']) {
    const h = harness(), entry = h.start(), control = entry.children[index]; entry.children[0].value='Draft';
    const event = entry.event('keydown',{ target:control,key });
    assert.ok(!event.prevented); assert.equal(h.editor.active,true); assert.equal(h.store.history.undo,0);
    control.event('click');
    assert.equal(h.editor.active,false); assert.equal(h.store.history.undo,index===1?1:0);
    assert.equal(h.store.snapshot.project.name,index===1?'Draft':'Учебная модель');
  }
});
test('IME Enter/Escape and keyCode229 never commit or cancel composition', () => {
  const h = harness(), entry = h.start(), input = entry.children[0]; input.value='日本語';
  input.event('compositionstart');
  for (const key of ['Enter','Escape']) entry.event('keydown',{ target:input,key });
  assert.equal(h.editor.active,true); assert.equal(h.store.history.undo,0);
  input.event('compositionend');
  entry.event('keydown',{ target:input,key:'Enter',isComposing:true });
  entry.event('keydown',{ target:input,key:'Escape',keyCode:229 });
  assert.equal(h.editor.active,true); assert.equal(h.store.history.undo,0);
  entry.event('keydown',{ target:input,key:'Enter' }); assert.equal(h.store.snapshot.project.name,'日本語'); assert.equal(h.store.history.undo,1);
});
test('moving focus within editor does not cancel; stale revision cannot overwrite newer state', async () => {
  const h=harness(),entry=h.start(),input=entry.children[0]; input.value='Older draft'; entry.children[1].focus(); entry.event('focusout'); await Promise.resolve();
  assert.equal(h.editor.active,true);
  h.store.execute({type:'renameProject',name:'Newer state'},h.store.revision);
  entry.event('keydown',{target:input,key:'Enter'});
  assert.equal(h.store.snapshot.project.name,'Newer state'); assert.equal(h.store.history.undo,1); assert.equal(h.editor.active,true); h.editor.cancel();
});
