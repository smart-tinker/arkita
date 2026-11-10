import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const mode = production ? 'production' : 'source';

for (const release of ['keyup', 'blur']) test(`${mode} repeated Space pans preserve model/history until ${release} releases the mode`, async t => {
  const h = await setup(t), store = createStore(createProject('Pan regression'));
  const { viewId } = store.execute({ type: 'createView', name: 'View' }, store.revision).created;
  const { occurrenceId } = store.execute({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent',
    name: 'Keep position', bounds: { x: 100, y: 100, width: 210, height: 90 } }, store.revision).created;
  const bytes = Buffer.from(serializeProjectFile(store.snapshot));
  await h.load(bytes);
  const canvas = h.$('canvas'), drawing = () => canvas.querySelector(`[data-id="${occurrenceId}"]`);
  const camera = () => canvas.getAttribute('viewBox');
  canvas.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
  for (let i = 0; i < 2; i++) {
    const before = camera();
    h.pointer(drawing(), 'pointerdown', 120, 120);
    assert.equal(canvas.classList.contains('panning'), true);
    h.pointer(canvas, 'pointermove', 160, 140);
    h.pointer(canvas, 'pointerup', 160, 140);
    assert.notEqual(camera(), before);
    assert.equal(canvas.classList.contains('pan-ready'), true, 'The same held key starts the next pan without key repeat');
  }
  assert.equal(h.$('undo').disabled, true);
  if (release === 'keyup') canvas.dispatchEvent(new h.window.KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
  else h.window.dispatchEvent(new h.window.Event('blur'));
  assert.equal(canvas.classList.contains('pan-ready'), false);
  assert.deepEqual(await h.download(), bytes);

  const before = camera();
  h.pointer(drawing(), 'pointerdown', 120, 120);
  assert.equal(canvas.classList.contains('panning'), false);
  h.pointer(canvas, 'pointermove', 150, 150);
  h.pointer(canvas, 'pointerup', 150, 150);
  assert.equal(camera(), before);
  assert.equal(h.$('undo').disabled, false, 'Normal object dragging resumes after Space release or blur');
});
