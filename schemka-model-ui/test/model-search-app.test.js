import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production, richLifecycleFixture } from './app-test-fixture.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { readFileSync } from 'node:fs';

test(`${production ? 'production' : 'source'} model search selects without a modal and opens exact context properties and views without consuming redo or changing saved bytes`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), state = fixture.state;
  const original = Buffer.from(serializeProjectFile(state)); await h.load(original);
  h.$('new-view').click(); h.$('new-view-name').value = 'Future view';
  h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })); h.$('undo').click();
  assert.equal(h.$('redo').disabled, false);
  const dirty = h.$('file-state').dataset.dirty, history = h.$('history-state').textContent;
  const search = text => {
    h.$('model-search').value = text; h.$('model-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
    return [...h.$('model-search-results').querySelectorAll('button')];
  };
  const hidden = state.elements.find(item => item.name === 'Unshown object');
  const hiddenResult = search(hidden.id)[0]; hiddenResult.focus(); hiddenResult.click();
  assert.equal(h.document.querySelector('dialog[open]'), null);
  const current = h.$('model-search-results').querySelector(`[data-search-id="${hidden.id}"]`); current.focus(); current.dispatchEvent(new h.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 220 }));
  assert.equal(h.$('context-menu').hidden, false);
  const properties = h.$('context-menu').querySelector('[data-context-action="properties"]'); assert.equal(properties.getAttribute('role'), 'menuitem'); properties.click();
  assert.equal(h.$('inspector-panel').open, true); assert.ok(h.$('inspector-content').textContent.includes(hidden.id));
  h.$('inspector-close').click();
  assert.equal(h.document.activeElement.dataset.searchId, hidden.id);
  const views = search('Shared names').filter(button => button.dataset.searchKind === 'view'); assert.equal(views.length, 2);
  views.find(button => button.dataset.searchId === fixture.otherViewId).click();
  assert.equal(h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId, fixture.otherViewId);
  assert.equal(h.$('file-state').dataset.dirty, dirty); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
  h.$('model-search-clear').click(); assert.deepEqual(await h.download(), original);
  h.$('redo').click(); assert.ok(h.$('views').textContent.includes('Future view'));
  const replacement = richLifecycleFixture(); await h.load(Buffer.from(serializeProjectFile(replacement.state)));
  assert.equal(h.$('model-search').value, ''); assert.equal(h.$('tree-model').hidden, false);
});

test(`${production ? 'production' : 'source'} keys on a search result never rename or delete the previous canvas selection`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), original = Buffer.from(serializeProjectFile(fixture.state));
  await h.load(original);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const previous = h.$('canvas').querySelector(`[data-id="${fixture.a.occurrenceId}"]`);
  h.pointer(previous, 'pointerdown'); h.pointer(previous, 'pointerup');
  assert.equal(previous.getAttribute('aria-pressed'), 'true');
  h.$('model-search').value = fixture.b.elementId;
  h.$('model-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  const result = h.$('model-search-results').querySelector('button'); result.focus();
  for (const key of ['Delete', 'F2']) {
    result.dispatchEvent(new h.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    assert.equal(h.document.querySelector('dialog[open],.inline-editor'), null, key);
  }
  result.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(h.$('model-search').value, ''); assert.equal(h.document.activeElement, h.$('model-search'));
  assert.equal(previous.getAttribute('aria-pressed'), 'true'); assert.deepEqual(await h.download(), original);
});

test(`${production ? 'production' : 'source'} blocked search navigation announces the reason outside a hidden status bar and preserves editor state`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture();
  const style = h.document.createElement('style'); style.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8'); h.document.head.append(style);
  await h.load(Buffer.from(serializeProjectFile(fixture.state)));
  for (const name of ['Search history A', 'Search history B']) {
    h.$('new-view').click(); h.$('new-view-name').value = name;
    h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  }
  h.$('undo').click();
  assert.equal(h.$('undo').disabled, false); assert.equal(h.$('redo').disabled, false);
  h.document.querySelector(`[data-view-scope="tree"][data-view-id="${fixture.viewId}"]`).click();
  const previous = h.$('canvas').querySelector(`[data-id="${fixture.a.occurrenceId}"]`);
  h.pointer(previous, 'pointerdown'); h.pointer(previous, 'pointerup');
  assert.equal(previous.getAttribute('aria-pressed'), 'true');

  h.$('preferences-button').click(); h.$('preferences-display-statusBar').checked = false;
  h.$('preferences-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.document.body.dataset.preferenceStatus, 'false');
  const footer = h.$('status').closest('footer.statusbar');
  assert.equal(h.window.getComputedStyle(footer).display, 'none');

  const beforeBytes = Buffer.from(await h.download());
  h.$('model-search').value = fixture.b.elementId;
  h.$('model-search').dispatchEvent(new h.window.Event('input', { bubbles: true }));
  const result = [...h.$('model-search-results').querySelectorAll('button')].find(button => button.dataset.searchId === fixture.b.elementId);
  assert.ok(result, 'the other element is available in search results');
  const snapshot = () => ({
    selection: [...h.$('canvas').querySelectorAll('[aria-pressed="true"]')].map(item => item.dataset.id),
    history: h.$('history-state').textContent,
    undoDisabled: h.$('undo').disabled,
    redoDisabled: h.$('redo').disabled,
    dirty: h.$('file-state').dataset.dirty
  });

  h.$('project-name').click(); assert.ok(h.document.querySelector('.inline-editor'));
  const before = snapshot();
  assert.deepEqual(before.selection, [fixture.a.occurrenceId]);
  assert.equal(before.undoDisabled, false); assert.equal(before.redoDisabled, false); assert.equal(before.dirty, 'false');
  result.click();

  const external = h.$('external-feedback');
  assert.equal(external.hidden, false);
  assert.notEqual(h.window.getComputedStyle(external).display, 'none');
  assert.equal(external.dataset.kind, 'blocking');
  assert.equal(external.getAttribute('role'), 'alert');
  assert.equal(external.getAttribute('aria-live'), 'assertive');
  assert.match(external.textContent, /Завершите или отмените текущую правку перед поиском/);
  assert.ok(h.document.querySelector('.inline-editor'));
  assert.deepEqual(snapshot(), before, 'refusal preserves selection, history controls and dirty state');

  h.document.querySelector('.inline-editor input').dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(h.document.querySelector('.inline-editor'), null);
  assert.deepEqual(await h.download(), beforeBytes, 'Save after cancel preserves exact project bytes');
  assert.equal(h.$('file-state').dataset.dirty, 'false');
  h.$('preferences-button').click(); h.$('preferences-display-statusBar').checked = true;
  h.$('preferences-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(h.document.body.dataset.preferenceStatus, 'true');
  h.$('fit-button').click();
  assert.notEqual(h.window.getComputedStyle(footer).display, 'none');
  assert.equal(h.$('status').getAttribute('role'), 'status');
  assert.equal(h.$('status').getAttribute('aria-live'), 'polite');
  assert.equal(h.$('status').textContent, 'Все элементы вписаны в полотно');
  assert.equal(external.hidden, true);
  assert.deepEqual(snapshot(), before, 'normal informational feedback is in the visible footer without model changes');
});
