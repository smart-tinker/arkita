import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production, richLifecycleFixture } from './app-test-fixture.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test(`${production ? 'production' : 'source'} advanced search is reachable, applies one rename command, preserves metadata and roundtrips through Save/Undo`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), original = Buffer.from(serializeProjectFile(fixture.state));
  await h.load(original);
  assert.equal(h.$('model-search-advanced').hidden, true); assert.equal(h.$('model-search-region').contains(h.$('model-search-advanced')), false);
  const command = h.document.querySelector('[data-command="model-search-advanced"]'); assert.ok(command); command.closest('.app-menu').open = true; command.click(); assert.equal(h.$('advanced-search-dialog').open, true); await tick();
  const input = (id, value) => { h.$(id).value = value; h.$(id).dispatchEvent(new h.window.Event('input', { bubbles: true })); };
  input('advanced-query', 'Shared'); h.$('advanced-search-run').click(); await tick();
  input('advanced-replacement', 'Updated'); h.$('advanced-replace-all').click(); await tick();
  assert.match(h.$('advanced-search-preview').textContent, /Updated collaboration/);
  assert.equal(h.$('file-state').dataset.dirty, 'false');
  h.$('advanced-search-apply').click(); await tick(); h.$('advanced-search-close').click();
  assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.match(h.$('history-state').textContent, /1 действий/);
  const saved = await h.download(), state = deserializeProjectFile(saved);
  assert.equal(state.elements.find(item => item.id === fixture.a.elementId).name, 'Updated collaboration');
  assert.deepEqual(state.elements.find(item => item.id === fixture.a.elementId).properties, fixture.state.elements.find(item => item.id === fixture.a.elementId).properties);
  h.$('undo').click(); assert.deepEqual(await h.download(), original);
  h.$('redo').click(); assert.deepEqual(await h.download(), saved);
});

test(`${production ? 'production' : 'source'} global property manager previews collisions, cancels safely and applies one undoable rename`, async t => {
  const h = await setup(t), fixture = richLifecycleFixture(), stateWithProjectProperty = structuredClone(fixture.state);
  stateWithProjectProperty.project.properties = [{ key: 'owner', value: 'Project' }];
  const original = Buffer.from(serializeProjectFile(stateWithProjectProperty));
  await h.load(original);
  const command = h.document.querySelector('[data-command="user-properties-manager"]'); assert.ok(command);
  command.closest('.app-menu').open = true; command.click(); await tick();
  assert.equal(h.$('advanced-search-dialog').dataset.mode, 'properties');
  assert.equal(h.$('advanced-search-properties').open, true);
  assert.equal(h.$('advanced-search-dialog').querySelector('form').hidden, true);
  await tick();
  const ownerKey = () => [...h.$('advanced-property-common').querySelectorAll('button')].find(item => item.textContent.startsWith('owner:'));
  assert.match(ownerKey().textContent, /владельцев 2, записей 2/);
  ownerKey().click();
  const input = (id, value) => { h.$(id).value = value; h.$(id).dispatchEvent(new h.window.Event('input', { bubbles: true })); };
  input('advanced-property-new-key', 'escaped'); h.$('advanced-property-rename').click(); await tick();
  assert.match(h.$('advanced-search-preview').textContent, /Коллизии ключей/);
  assert.equal(h.$('advanced-search-apply').disabled, true);
  h.$('advanced-search-close').click();
  assert.deepEqual(await h.download(), original, 'Cancel after a collision leaves the model unchanged');

  command.closest('.app-menu').open = true; command.click(); await tick(); await tick(); ownerKey().click();
  input('advanced-property-new-key', 'owner-renamed'); h.$('advanced-property-rename').click(); await tick();
  assert.match(h.$('advanced-search-preview').textContent, /Будут изменены объекты: 2/);
  assert.match(h.$('advanced-search-preview').textContent, /owner-renamed/);
  h.$('advanced-search-apply').click(); await tick(); h.$('advanced-search-close').click();
  assert.match(h.$('history-state').textContent, /1 действий/);
  const saved = await h.download(), state = deserializeProjectFile(saved);
  assert.deepEqual(state.project.properties, [{ key: 'owner-renamed', value: 'Project' }]);
  assert.deepEqual(state.elements.find(item => item.id === fixture.a.elementId).properties, [
    { key: 'owner-renamed', value: 'Synthetic' },
    ...fixture.state.elements.find(item => item.id === fixture.a.elementId).properties.slice(1),
  ]);
  h.$('undo').click(); assert.deepEqual(await h.download(), original);
  h.$('redo').click(); assert.deepEqual(await h.download(), saved);
});
