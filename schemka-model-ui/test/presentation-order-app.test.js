import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const id = (prefix, number) => `${prefix}-00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function withUUID(number, action) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
      randomUUID: () => id('', number).slice(1),
    } });
    action();
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
}

test(`${production ? 'production' : 'source'} tabs, keyboard navigation and connection paint order survive editing, history and save/reopen`, async t => {
  const h = await setup(t), state = conceptProject(), view = state.views[0];
  state.views = [view]; view.view.id = id('view', 3);
  state.junctions = []; state.relationships = state.relationships.slice(0, 1);
  view.occurrences = view.occurrences.slice(0, 2);
  const template = view.connections[0];
  view.connections = [2, 3].map(number => ({ ...structuredClone(template), id: id('conn', number),
    routePoints: [{ kind: 'anchor', id: id('anc', number), point: { x: 150, y: 25 } }],
  }));
  await h.load(serializeProjectFile(state));
  for (const number of [2, 1]) withUUID(number, () => {
    h.$('new-view').click(); h.$('new-view-name').value = 'Same name';
    h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(h.$('view-dialog').open, false, h.$('view-error').textContent);
  });
  const tabs = () => [...h.$('view-tabs').querySelectorAll('[data-view-id]')];
  const tabOrder = () => tabs().map(tab => tab.dataset.viewId);
  let expectedTabs = [3, 2, 1].map(number => id('view', number));
  function checkTabs() {
    assert.deepEqual(tabOrder(), expectedTabs);
    assert.deepEqual([...h.$('views').querySelectorAll('[data-view-id]')].map(tab => tab.dataset.viewId), [3, 1, 2].map(number => id('view', number)));
    assert.deepEqual(tabs().map(tab => tab.querySelector('.view-symbol').textContent), ['01', '02', '03']);
  }
  function checkKeyboard() {
    for (const [key, number] of [['Home', 0], ['ArrowRight', 1], ['End', 2], ['ArrowRight', 0], ['ArrowLeft', 2], ['Home', 0]]) {
      const current = h.$('view-tabs').querySelector('[aria-selected="true"]'); current.focus();
      const event = new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      current.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, expectedTabs[number]);
      assert.equal(h.document.activeElement.dataset.viewId, expectedTabs[number]);
    }
  }
  const openMain = () => h.document.querySelector(`[data-view-scope="tree"][data-view-id="${view.view.id}"]`).click();
  const connections = () => [...h.$('canvas').querySelectorAll('[data-kind="connection"]:not([data-anchor-id])')].map(group => group.dataset.id);
  const anchors = () => [...h.$('canvas').querySelectorAll('[data-anchor-id]')].map(group => group.dataset.anchorId);
  checkTabs(); checkKeyboard(); openMain();
  const relationship = h.$('relationships').querySelector(`[data-relationship-id="${state.relationships[0].id}"]`);
  relationship.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 40 }));
  h.$('context-menu').querySelector('[data-context-action="reuse-relationship"]').click();
  assert.equal(h.$('link-dialog').open, true);
  withUUID(1, () => h.$('link-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(h.$('link-dialog').open, false, h.$('link-note').textContent);
  const expectedConnections = [1, 2, 3].map(number => id('conn', number));
  assert.deepEqual(connections(), expectedConnections);
  assert.deepEqual(anchors(), [id('anc', 2), id('anc', 3)]);
  h.$('undo').click(); assert.deepEqual(connections(), expectedConnections.slice(1));
  h.$('redo').click(); assert.deepEqual(connections(), expectedConnections);
  checkTabs();
  const saved = await h.download();
  checkKeyboard(); assert.equal(h.$('file-state').dataset.dirty, 'false');
  await h.load(saved); assert.deepEqual(tabOrder(), [id('view', 1)]);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${id('view', 3)}"]`).click();
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${id('view', 2)}"]`).click();
  expectedTabs = [1, 3, 2].map(number => id('view', number)); checkTabs();
  checkKeyboard(); openMain();
  assert.deepEqual(connections(), expectedConnections);
  assert.deepEqual(anchors(), [id('anc', 2), id('anc', 3)]);
  assert.deepEqual(await h.download(), saved);
});
