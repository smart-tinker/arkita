import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';

const mode = production ? 'production' : 'source';
const box = h => { const [x, y, width, height] = h.$('canvas').getAttribute('viewBox').split(/\s+/).map(Number); return { x, y, width, height }; };

test(`${mode} plus/minus and Ctrl/Meta wheel remain monotonic after fitting a wide view without changing model/history`, async t => {
  const h = await setup(t), store = createStore(createProject('Wide Fit regression'));
  const { viewId } = store.execute({ type: 'createView', name: 'Wide view' }, store.revision).created;
  for (const [name, x] of [['Left', 0], ['Right', 15000]]) {
    store.execute({ type: 'createElementAndOccurrence', viewId, elementType: 'ApplicationComponent', name,
      bounds: { x, y: 100, width: 210, height: 90 } }, store.revision);
  }
  await h.load(serializeProjectFile(store.snapshot)); const bytes = await h.download();
  const controls = [
    direction => h.$(direction === 'in' ? 'zoom-in' : 'zoom-out').click(),
    ...['ctrlKey', 'metaKey'].map(modifier => direction => h.$('canvas').dispatchEvent(new h.window.WheelEvent('wheel', {
      bubbles: true, cancelable: true, [modifier]: true, deltaY: direction === 'in' ? -120 : 120, clientX: 220, clientY: 140,
    }))),
  ];
  for (const zoom of controls) {
    h.$('fit-button').click(); const fitted = box(h), percent = h.$('zoom-value').textContent;
    assert.ok(fitted.width > 9000);
    zoom('out'); assert.deepEqual(box(h), fitted, 'An outward step at the limit keeps the fitted region instead of clipping it');
    assert.equal(h.$('zoom-value').textContent, percent);
    zoom('in'); const closer = box(h);
    assert.ok(closer.width < fitted.width && closer.width > 9000, 'An inward step follows its factor instead of jumping to the manual maximum');
    assert.ok(Math.abs(closer.height / closer.width - fitted.height / fitted.width) < 1e-12);
    assert.equal(h.$('undo').disabled, true); assert.equal(h.$('redo').disabled, true);
  }
  assert.deepEqual(await h.download(), bytes);
});
