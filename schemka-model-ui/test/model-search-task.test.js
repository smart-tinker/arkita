import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { createSearchTask } from '../src/model-search-task.js';

function fakeWindow() { return { Worker() {}, setTimeout, clearTimeout }; }
test('search cancellation and timeout terminate the worker; late results cannot settle a new request', async () => {
  const workers = [], task = createSearchTask(fakeWindow(), { workerFactory() {
    const worker = { postMessage() {}, terminate() { this.terminated = true; } }; workers.push(worker); return worker;
  }, timeout: 20 });
  const first = task.run({}, { regex: true }), cancelled = assert.rejects(first, /отменён/); task.cancel(); await cancelled;
  assert.equal(workers[0].terminated, true);
  const next = task.run({}, { regex: true }); workers[0].onmessage({ data: { result: 'late' } }); workers[1].onmessage({ data: { result: 'current' } }); assert.equal(await next, 'current');
  assert.equal(workers[1].terminated, true); assert.equal(task.active, false);
  const timeout = task.run({}, { regex: true }); await assert.rejects(timeout, /превысил/); assert.equal(workers[2].terminated, true); assert.equal(task.active, false);
});

test('an actual pathological regex worker can be killed while the caller remains responsive', async () => {
  const module = new URL('../../schemka-model-core/src/model-search.js', import.meta.url).href;
  const code = `import { parentPort } from 'node:worker_threads'; import { searchModel } from ${JSON.stringify(module)}; parentPort.on('message', ({state,options}) => { try { parentPort.postMessage({result:searchModel(state,options)}); } catch(error){parentPort.postMessage({error:{message:error.message}});} });`;
  let exited, exitPromise;
  const task = createSearchTask(fakeWindow(), { timeout: 200, workerFactory() {
    const node = new Worker(new URL(`data:text/javascript,${encodeURIComponent(code)}`));
    const adapter = { postMessage: data => node.postMessage(data), terminate: () => node.terminate() };
    node.on('message', data => adapter.onmessage?.({ data })); node.on('error', () => adapter.onerror?.());
    exitPromise = new Promise(resolve => node.on('exit', code => { exited = true; resolve(code); })); return adapter;
  } });
  const state = conceptProject(); state.elements[0].name = 'a'.repeat(4000) + '!';
  const pending = task.run(state, { query: '(a+)+$', regex: true, fields: ['name'], kinds: ['element'] });
  let responsive = false; setTimeout(() => { responsive = true; }, 30);
  await assert.rejects(pending, /превысил/); await exitPromise; assert.equal(responsive, true); assert.equal(exited, true); assert.equal(task.active, false);
});

test('regex cannot fall back to the UI thread when worker creation is unavailable', async () => {
  const task = createSearchTask({ setTimeout, clearTimeout });
  await assert.rejects(task.run(conceptProject(), { query: '(a+)+$', regex: true }), /Не удалось запустить поиск/);
  const rows = await task.run(conceptProject(), { query: 'Grouping', fields: ['name'] }); assert.equal(rows.length, 1);
});
