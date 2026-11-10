import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { LIMITS } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

test(`${production ? 'production' : 'source'} duplicate view preserves overlapping element and junction paint order through history and reopen`, async t => {
  const h = await setup(t), initial = conceptProject(), source = initial.views[0];
  source.occurrences.forEach((occurrence, index) => {
    occurrence.bounds = { x: 100, y: 100, width: 180, height: 80 };
    occurrence.zIndex = index < 2 ? -LIMITS.coordinate : LIMITS.coordinate;
  });
  const originalBytes = Buffer.from(serializeProjectFile(initial));
  await h.load(originalBytes);
  const stack = () => [...h.$('canvas').querySelectorAll('[data-kind="occurrence"]')].map(group => group.dataset.renameId);
  const originalStack = stack();
  assert.deepEqual(originalStack, source.occurrences.map(occurrence => occurrence.concept.id));
  let next = 10000;
  function duplicate(name) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      // Force reverse fresh-ID order so this never depends on random luck.
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
        randomUUID: () => `00000000-0000-4000-8000-${String(next--).padStart(12, '0')}`,
      } });
      h.$('duplicate-view').click(); h.$('new-view-name').value = name;
      h.$('view-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
      assert.equal(h.$('view-dialog').open, false, h.$('view-error').textContent);
    } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
    assert.deepEqual(stack(), originalStack);
    return h.$('view-tabs').querySelector('[aria-selected="true"]').dataset.viewId;
  }
  const copyId = duplicate('Same overlap');
  const copiedBytes = await h.download(), copy = deserializeProjectFile(copiedBytes).views.find(entry => entry.view.id === copyId);
  for (const occurrence of source.occurrences) {
    const copied = copy.occurrences.find(item => item.concept.id === occurrence.concept.id);
    assert.notEqual(copied.id, occurrence.id);
    assert.deepEqual({ ...copied, id: occurrence.id }, occurrence);
  }
  h.$('undo').click(); assert.deepEqual(stack(), originalStack); assert.deepEqual(await h.download(), originalBytes);
  h.$('redo').click(); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${copyId}"]`).click();
  assert.deepEqual(stack(), originalStack); assert.deepEqual(await h.download(), copiedBytes);
  await h.load(copiedBytes); h.document.querySelector(`[data-view-scope="tree"][data-view-id="${copyId}"]`).click();
  assert.deepEqual(stack(), originalStack);
  const secondId = duplicate('Same overlap again');
  assert.notEqual(secondId, copyId);
  assert.deepEqual(stack(), originalStack);
});
