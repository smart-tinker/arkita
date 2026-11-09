import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';

test('relationship drag scrolls at canvas edge, updates its preview and stops after Escape or release', async t => {
  const h = await setup(t), canvas = h.$('canvas');
  let serial = 0; const scheduled = new Map();
  h.window.requestAnimationFrame = callback => { scheduled.set(++serial, callback); return serial; };
  h.window.cancelAnimationFrame = id => scheduled.delete(id);
  const origin = () => Number(canvas.getAttribute('viewBox').split(/\s+/)[0]);
  function frame(time) { const callbacks = [...scheduled.values()]; scheduled.clear(); callbacks.forEach(callback => callback(time)); }
  function start() { h.$('smart-link-tool').click(); h.pointer(canvas.querySelector('.node'), 'pointerdown', 100, 100); h.pointer(canvas, 'pointermove', 899, 300); }
  start(); const before = origin(); frame(16);
  assert.ok(origin() > before); assert.ok(canvas.querySelector('.smart-link-preview'));
  canvas.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const cancelled = origin(); frame(32); assert.equal(origin(), cancelled); assert.equal(canvas.querySelector('.smart-link-preview'), null);
  start(); frame(48); const released = origin(); h.pointer(canvas, 'pointerup', 899, 300); frame(64); assert.equal(origin(), released); assert.equal(canvas.querySelector('.smart-link-preview'), null);
});
