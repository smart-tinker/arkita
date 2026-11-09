import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createStore } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { createController } from '../src/controller.js';
import { installCatalogSelection } from '../src/catalog-selection.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(t) {
 const dom = new JSDOM('<body><aside class="catalog"><section id="model-search-region"><input id="model-search"></section><ul id="model-search-results" hidden></ul><details id="tree-model" open><summary>Модель</summary><div id="rows"></div><details id="closed-group"><summary>Скрытая группа</summary><div id="hidden-rows"></div></details></details><section id="catalog-folders"></section></aside><div id="inspector"></div></body>', { pretendToBeVisual: true }); t.after(() => dom.window.close()); const { document } = dom.window, $ = id => document.getElementById(id), state = conceptProject();
 state.project.properties = [{ key: 'owner', value: 'A' }]; state.elements[0].properties = [{ key: 'owner', value: 'B' }, { key: 'only', value: '<script>bad</script>' }];
 const model = createController(createStore(state)), primary = [], edited = [];
 function row(owner, container = $('rows'), name = '') { const button = document.createElement('button'); button.dataset.renameKind = owner.kind; button.dataset.renameId = owner.id; button.textContent = name || owner.id; container.append(button); return button; }
 const owners = [{ kind: 'project', id: state.project.id }, { kind: 'view', id: state.views[0].view.id }, ...state.elements.map(item => ({ kind: 'element', id: item.id }))]; const buttons = owners.map(owner => row(owner));
 const hidden = row({ kind: 'relationship', id: state.relationships[0].id }, $('hidden-rows')); row(owners[2], $('catalog-folders'));
 dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); };
 const ui = installCatalogSelection({ document, model, openDialog: id => $(id).setAttribute('open', ''), onPrimary: owner => primary.push(owner), editProperties: owners => edited.push(owners) }); ui.refresh();
 const click = (button, options = {}) => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, ...options }));
 const key = (button, value, options = {}) => button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value, ...options }));
 return { dom, $, model, ui, owners, buttons, hidden, primary, edited, click, key, before: { files: model.store.exportFiles(), history: model.store.history, selection: model.selections } };
}
test('normal catalogue mixed Ctrl/Shift selection has primary/common/mixed inspector and does not enter model Undo or canvas selections', t => {
 const h = setup(t); assert.equal(h.$('catalog-selection-properties'), null); h.click(h.buttons[0]); h.click(h.buttons[2], { ctrlKey: true }); assert.equal(h.ui.count, 2); assert.deepEqual(h.ui.primary, h.owners[2]); assert.equal(h.ui.renderInspector(h.$('inspector')), true); assert.match(h.$('inspector').textContent, /owner: Разные значения/); assert.match(h.$('inspector').textContent, /есть у 1 из 2/); assert.equal(h.$('inspector').querySelector('script'), null);
 h.ui.openProperties(); assert.equal(h.ui.active, true); h.$('catalog-selection-edit').click(); assert.equal(h.ui.active, false); assert.deepEqual(h.edited[0], [h.owners[0], h.owners[2]]);
 h.click(h.buttons[1]); h.click(h.buttons[3], { shiftKey: true }); assert.deepEqual(h.ui.owners, h.owners.slice(1, 4)); assert.deepEqual(h.model.store.exportFiles(), h.before.files); assert.deepEqual(h.model.store.history, h.before.history); assert.deepEqual(h.model.selections, h.before.selection);
});
test('Select All includes only unique currently visible filtered/page rows; input shortcuts and canvas scope remain independent', async t => {
 const h = setup(t); h.key(h.buttons[0], 'a', { ctrlKey: true }); assert.equal(h.ui.count, h.owners.length); assert.ok(!h.ui.owners.some(owner => owner.id === h.hidden.dataset.renameId));
 h.$('tree-model').hidden = true; h.$('catalog-folders').hidden = true; h.$('model-search-results').hidden = false;
 const result = h.dom.window.document.createElement('button'); result.dataset.searchKind = h.owners[2].kind; result.dataset.searchId = h.owners[2].id; h.$('model-search-results').append(result); await tick(); h.key(result, 'a', { metaKey: true }); assert.deepEqual(h.ui.owners, [h.owners[2]]);
 h.key(h.$('model-search'), 'a', { ctrlKey: true }); assert.equal(h.ui.count, 1); h.ui.scopeFromCanvas(); assert.equal(h.ui.count, 0); assert.deepEqual(h.model.store.exportFiles(), h.before.files); assert.deepEqual(h.model.store.history, h.before.history);
});
test('group collapse/model replacement removes stale UI owners and range keyboard selection stays scoped', async t => {
 const h = setup(t); h.click(h.buttons[1]); h.buttons[1].focus(); h.key(h.buttons[1], 'ArrowDown', { shiftKey: true }); assert.deepEqual(h.ui.owners, h.owners.slice(1, 3));
 h.$('tree-model').open = false; await tick(); assert.equal(h.ui.count, 1); // duplicate concept row in visible folder remains selectable
 h.ui.reset(); assert.equal(h.ui.count, 0); assert.deepEqual(h.model.store.history, h.before.history);
});
