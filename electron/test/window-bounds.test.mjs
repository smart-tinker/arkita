import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { watchWindowBounds } from '../window-bounds.mjs';

for (const event of ['move', 'resize', 'closed']) test(`failed bounds save after ${event} is diagnosed without interrupting the window lifecycle`, async t => {
  const diagnostics = t.mock.method(console, 'error', () => {});
  const failure = Object.assign(new Error('Synthetic preferences write denied'), { code: 'EACCES' });
  const window = new EventEmitter(), saved = [];
  let bounds = { x: 20, y: 30, width: 1000, height: 700 }, closed = false;
  window.isDestroyed = () => false;
  window.getNormalBounds = () => bounds;
  watchWindowBounds(window, async next => { saved.push(next); if (saved.length === 1) throw failure; }, bounds);
  window.once('closed', () => { closed = true; });

  window.emit(event);
  if (event !== 'closed') await setTimeout(300);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(diagnostics.mock.calls.length, 1, 'the failed preferences write must be reported');
  assert.ok(diagnostics.mock.calls[0].arguments.includes(failure), 'keep the original error for diagnosis');

  if (event !== 'closed') {
    bounds = { x: 80, y: 90, width: 1100, height: 750 };
    window.emit('resize'); await setTimeout(300);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(saved, [{ x: 20, y: 30, width: 1000, height: 700 }, bounds]);
    assert.equal(diagnostics.mock.calls.length, 1, 'successful later writes must stay quiet');
    window.emit('closed');
  }
  assert.equal(closed, true, 'other close handlers must still run');
});
