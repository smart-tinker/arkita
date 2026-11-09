import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createController, orderedViews } from '../src/controller.js';
import { installViewTabs } from '../src/view-tabs.js';
function setup(t) {
  const dom = new JSDOM('<body><div id="view-tabs"></div><div id="views"></div></body>', { pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { document } = dom.window; dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const store = createStore(createProject('Tabs')), run = command => store.execute(command, store.revision).created;
  const a = run({ type: 'createView', name: 'A' }).viewId, b = run({ type: 'createView', name: 'B' }).viewId, c = run({ type: 'createView', name: 'C' }).viewId;
  const occurrenceId = run({ type: 'createElementAndOccurrence', viewId: a, elementType: 'ApplicationComponent', name: 'One', bounds: { x: 0, y: 0, width: 120, height: 60 } }).occurrenceId;
  const model = createController(store); let tabs;
  const activateView = id => { tabs.beforeActivate(id); model.switchView(id); tabs.afterActivate(id); tabs.render(); };
  tabs = installViewTabs({ document, window: dom.window, model, activateView, render: () => tabs.render(), blocked: () => Boolean(document.querySelector('dialog[open]')), status() {} }); tabs.render();
  return { model, tabs, activateView, document, window: dom.window, a, b, c, occurrenceId };
}
test('view tabs deduplicate/reorder/restore selection, close independently of view deletion and keep history/dirty model exact', t => {
  const h = setup(t), before = h.model.store.exportFiles(), history = h.model.store.history;
  h.activateView(h.a); h.model.select({ kind: 'occurrence', id: h.occurrenceId }); h.activateView(h.b); h.activateView(h.a); assert.equal(h.model.selection.id, h.occurrenceId);
  h.activateView(h.b); assert.equal(h.tabs.ids.filter(id => id === h.b).length, 1); h.tabs.reorder(h.b, h.a); assert.ok(h.tabs.ids.indexOf(h.b) < h.tabs.ids.indexOf(h.a));
  h.tabs.close(h.b); assert.equal(h.model.store.snapshot.views.length, 3); for (const id of h.tabs.ids) h.tabs.close(id); assert.equal(h.model.viewId, null); h.model.sanitizeSelection(); assert.equal(h.model.viewId, null); assert.deepEqual(h.tabs.ids, []);
  h.activateView(h.a); assert.equal(h.model.selection.id, h.occurrenceId); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history);
});
test('auto-open none/limited and cancelled bulk opening do not change models; confirmed bulk deduplicates all tabs', async t => {
  const h = setup(t), before = h.model.store.exportFiles(); h.tabs.reset({ openViews: 'none', autoViewLimit: 1 }); h.tabs.render(); assert.equal(h.model.viewId, null); assert.deepEqual(h.tabs.ids, []);
  h.tabs.reset({ openViews: 'limited', autoViewLimit: 2 }); h.tabs.render(); assert.equal(h.tabs.ids.length, 2); assert.equal(h.model.store.snapshot.views.length, 3);
  h.tabs.openMany([h.a, h.b, h.c]); const dialog = h.document.getElementById('open-views-dialog'); dialog.querySelector('[data-cancel]').click(); assert.equal(h.tabs.ids.length, 2);
  h.tabs.openMany([h.a, h.b, h.c, h.a]); dialog.querySelector('[data-confirm]').click(); await new Promise(resolve => h.window.setTimeout(resolve, 30)); assert.equal(h.tabs.ids.length, 3); assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.document.querySelectorAll('[role=tab]').length, 3);
});
