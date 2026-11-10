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
