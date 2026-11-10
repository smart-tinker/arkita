import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installAutomationUI, createAutomationLibrary } from '../src/automation-ui.js';
import { EXAMPLE_AUTOMATION } from '../../schemka-model-io/src/automation.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
const writable = { ...EXAMPLE_AUTOMATION, id: 'rename.model', capabilities: ['model.read', 'model.write'], steps: [{ action: 'rename', query: { kind: 'project' }, prefix: 'New ' }] };
function setup(t) {
  const dom = new JSDOM('<body><details class="app-menu"><div class="menu-items"></div></details></body>', { url: 'https://test.invalid', pretendToBeVisual: true }); t.after(() => dom.window.close());
  const { document } = dom.window, $ = id => document.getElementById(id), store = createStore(createProject('Before')), model = createController(store), session = createProjectSession(store), messages = [];
  dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); };
  const ui = installAutomationUI({ document, window: dom.window, model, session, status: text => messages.push(text), render() {}, openDialog: id => $(id).setAttribute('open', '') }); ui.open();
  function check(id, value = true) { $(id).checked = value; $(id).dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
  function install(manifest = writable) { $('automation-editor').value = JSON.stringify(manifest); $('automation-inspect').click(); check('automation-install-consent'); $('automation-install').click(); }
  return { dom, $, store, model, session, messages, ui, check, install };
}
test('installed automation requires explicit permissions and enable; preview is inert, apply is one Undo, disable/uninstall preserves model', async t => {
  const h = setup(t), before = h.store.exportFiles(); h.install(); assert.equal(h.$('automation-run').disabled, true); assert.deepEqual(h.store.exportFiles(), before);
  h.check('automation-enabled'); h.$('automation-run').click(); await tick(); assert.match(h.$('automation-report').textContent, /New Before/); assert.deepEqual(h.store.exportFiles(), before); assert.equal(h.$('automation-apply').disabled, true);
  h.check('automation-apply-consent'); h.$('automation-apply').click(); assert.equal(h.store.snapshot.project.name, 'New Before'); assert.equal(h.store.history.undo, 1); h.model.undo(); assert.deepEqual(h.store.exportFiles(), before);
  h.check('automation-enabled', false); assert.equal(h.$('automation-run').disabled, true); h.check('automation-remove-consent'); h.$('automation-remove').click(); assert.equal(h.$('automation-choice').options.length, 0); assert.deepEqual(h.store.exportFiles(), before);
});
test('cancel/stale model/late import cannot apply automation; readonly query cannot change model or focus log', async t => {
  const h = setup(t); h.install(); h.check('automation-enabled'); const before = h.store.exportFiles();
  h.$('automation-run').click(); h.$('automation-cancel-run').click(); await tick(); assert.deepEqual(h.store.exportFiles(), before); assert.equal(h.$('automation-apply').disabled, true);
  h.$('automation-run').click(); await tick(); h.model.execute({ type: 'renameProject', name: 'Other' }); h.check('automation-apply-consent'); h.ui.refresh(); h.$('automation-apply').click(); assert.equal(h.store.snapshot.project.name, 'Other');
  h.$('automation-query').value = '{"kind":"project"}'; h.$('automation-query-run').focus(); h.$('automation-query-run').click(); assert.match(h.$('automation-report').textContent, /Other/); assert.equal(h.dom.window.document.activeElement.id, 'automation-query-run');
  h.$('automation-editor').value = JSON.stringify({ ...EXAMPLE_AUTOMATION, capabilities: ['model.read', 'network'] }); h.$('automation-inspect').click(); assert.match(h.messages.at(-1), /AUTOMATION_CAPABILITY/); assert.equal(h.store.snapshot.project.name, 'Other');
});
test('library invalid install and quota failure preserve previous packages, updates disable execution atomically', () => {
  let content = null, full = false; const storage = { getItem: () => content, setItem: (_, value) => { if (full) throw Error('quota'); content = value; } }, library = createAutomationLibrary(storage);
  library.install(EXAMPLE_AUTOMATION); library.enable(EXAMPLE_AUTOMATION.id, true); const before = content; full = true; assert.throws(() => library.install(writable), /quota/); assert.equal(content, before); full = false;
  assert.throws(() => library.install({ ...EXAMPLE_AUTOMATION, engineVersion: 2 })); assert.equal(content, before); library.install(EXAMPLE_AUTOMATION); assert.equal(library.list()[0].enabled, false);
});
