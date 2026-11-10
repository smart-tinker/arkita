import test from 'node:test';
import assert from 'node:assert/strict';
import { createMermaidState } from '../src/mermaid-state.js';

function harness() {
  const state = {
    text: 'flowchart LR\r\n  A --> B\r\n',
    filename: 'Схема.mmd',
    view: { x: 40, y: 40, scale: 1 },
    sourceDirty: false,
    transient: false,
    ready: true,
  };
  const tracker = createMermaidState({
    snapshot: () => state,
    sourceDirty: () => state.sourceDirty,
    transient: () => state.transient,
    ready: () => state.ready,
  });
  const accept = (ticket, format) => {
    const result = tracker.acceptDownload(ticket, format);
    if (result) state.sourceDirty = result.sourceDirty;
    return result;
  };
  return { state, tracker, accept };
}

test('read returns a frozen minimal status with no source, filename or mutable view', () => {
  const { tracker } = harness();
  const result = tracker.read();
  assert.deepEqual(result, { ready: true, dirty: false, transient: false, generation: 0 });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(tracker));
  assert.throws(() => { result.dirty = true; }, TypeError);
  assert.deepEqual(tracker.read(), result);
});

test('source latch stays conservative after exact undo and remains owned by host', () => {
  const { state, tracker } = harness();
  const text = state.text;
  state.text += '  C --> D\n';
  state.sourceDirty = true;
  assert.equal(tracker.read().dirty, true);
  state.text = text;
  assert.equal(tracker.read().dirty, true);
  state.sourceDirty = false;
  assert.equal(tracker.read().dirty, false);
});

test('view coordinates, scale and filename use exact saved-baseline equality', () => {
  const { state, tracker } = harness();
  for (const key of ['x', 'y', 'scale']) {
    const before = state.view[key];
    state.view[key] += Number.EPSILON * Math.max(1, before);
    assert.equal(tracker.read().dirty, true, key);
    state.view[key] = before;
    assert.equal(tracker.read().dirty, false, key);
  }
  state.filename = 'схема.mmd';
  assert.equal(tracker.read().dirty, true);
  state.filename = 'Схема.mmd';
  assert.equal(tracker.read().dirty, false);
});

test('generation observes source, view, filename, latch, readiness and transient changes', () => {
  const { state, tracker } = harness();
  let before = tracker.read().generation;
  for (const change of [
    () => { state.text += ' '; },
    () => { state.view.x += 1; },
    () => { state.filename += '.mmd'; },
    () => { state.sourceDirty = true; },
    () => { state.ready = false; },
    () => { state.transient = true; },
  ]) {
    change();
    const result = tracker.read();
    assert.ok(result.generation > before);
    assert.equal(tracker.read().generation, result.generation);
    before = result.generation;
  }
  assert.equal(tracker.read().ready, false);
  assert.equal(tracker.read().transient, true);
});

test('a ticket copies exact bytes and whitelisted fields and is deeply frozen', () => {
  const { state, tracker } = harness();
  const ticket = tracker.captureDownload();
  assert.deepEqual(Object.keys(ticket), ['snapshot']);
  assert.deepEqual(Object.keys(ticket.snapshot), ['text', 'view', 'filename']);
  assert.equal(ticket.snapshot.text, state.text);
  for (const value of [ticket, ticket.snapshot, ticket.snapshot.view]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { ticket.snapshot.view.x = 999; }, TypeError);
  assert.throws(() => { ticket.snapshot.text = 'changed'; }, TypeError);
  assert.throws(() => { ticket.snapshot = state; }, TypeError);
  state.view.x = 120;
  state.text = 'new text';
  state.filename = 'new.mmd';
  assert.equal(ticket.snapshot.view.x, 40);
  assert.equal(ticket.snapshot.filename, 'Схема.mmd');
  assert.equal(ticket.snapshot.text, 'flowchart LR\r\n  A --> B\r\n');
});

test('only successful JSON handoff adopts captured view/name, without changing host state', () => {
  const { state, tracker, accept } = harness();
  state.view.x += 100;
  state.filename = 'Saved.mmd';
  state.sourceDirty = true;
  const ticket = tracker.captureDownload();
  assert.equal(tracker.read().dirty, true);
  const stateBefore = structuredClone(state);
  const result = tracker.acceptDownload(ticket);
  assert.deepEqual(result, { sourceDirty: false });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(state, stateBefore);
  state.sourceDirty = result.sourceDirty;
  assert.equal(tracker.read().dirty, false);
  assert.equal(accept(ticket), null);
  state.view.x = 40;
  assert.equal(tracker.read().dirty, true);
});

test('.mmd handoff clears only the source latch, preserving changed view and filename', () => {
  const { state, tracker, accept } = harness();
  state.text += '\n';
  state.sourceDirty = true;
  state.view.y += 80;
  state.filename = 'New.mmd';
  assert.deepEqual(accept(tracker.captureDownload(), 'mmd'), { sourceDirty: false });
  assert.equal(state.sourceDirty, false);
  assert.equal(tracker.read().dirty, true);
  state.view.y = 40;
  assert.equal(tracker.read().dirty, true);
  state.filename = 'Схема.mmd';
  assert.equal(tracker.read().dirty, false);
});

test('failed or abandoned dispatch cannot accept a baseline', () => {
  const { state, tracker } = harness();
  state.view.scale = 2;
  const ticket = tracker.captureDownload();
  assert.throws(() => { throw new Error('Dispatch failed'); }, /Dispatch failed/);
  assert.equal(tracker.read().dirty, true);
  assert.equal(tracker.acceptDownload({ ...ticket }), null);
  assert.equal(tracker.acceptDownload({ snapshot: state }), null);
  assert.equal(tracker.acceptDownload(null), null);
  assert.equal(tracker.acceptDownload(undefined), null);
  assert.equal(tracker.acceptDownload('forged'), null);
  assert.equal(tracker.acceptDownload(ticket, 'svg'), null);
  assert.equal(tracker.read().dirty, true);
  state.view.scale = 1;
  assert.equal(tracker.read().dirty, false);
});

test('foreign tracker tickets cannot clear a baseline', () => {
  const first = harness(), second = harness();
  second.state.view.x = 800;
  assert.equal(second.tracker.acceptDownload(first.tracker.captureDownload()), null);
  assert.equal(second.tracker.read().dirty, true);
});

test('JSON dispatch reentrancy accepts the exported snapshot, not synchronous source/view/name edits', () => {
  const { state, tracker, accept } = harness();
  state.sourceDirty = true;
  state.view.x = 90;
  state.filename = 'Exported.mmd';
  const ticket = tracker.captureDownload();
  // A click/download hook may run application code before dispatch returns.
  state.text += '  B --> C\n';
  state.view.x = 100;
  state.filename = 'Edited during dispatch.mmd';
  assert.deepEqual(accept(ticket), { sourceDirty: true });
  assert.equal(tracker.read().dirty, true);
  state.text = ticket.snapshot.text;
  state.sourceDirty = false;
  assert.equal(tracker.read().dirty, true);
  state.view = { ...ticket.snapshot.view };
  state.filename = ticket.snapshot.filename;
  assert.equal(tracker.read().dirty, false);
});

test('.mmd dispatch reentrancy cannot clear a new source edit', () => {
  const { state, tracker, accept } = harness();
  const ticket = tracker.captureDownload();
  state.text += ' ';
  assert.deepEqual(accept(ticket, 'mmd'), { sourceDirty: true });
  assert.equal(tracker.read().dirty, true);
});

for (const newerFormat of ['json', 'mmd']) {
  test(`late old completion cannot roll back a newer ${newerFormat} handoff`, () => {
    const { state, tracker, accept } = harness();
    state.view.x = 100;
    const old = tracker.captureDownload();
    state.view.x = 200;
    const newer = tracker.captureDownload();
    assert.ok(accept(newer, newerFormat));
    const before = tracker.read();
    assert.equal(accept(old), null);
    assert.deepEqual(tracker.read(), before);
    state.view.x = newerFormat === 'json' ? 200 : 40;
    assert.equal(tracker.read().dirty, false);
  });
}

test('a later captured but failed dispatch does not prevent the earlier successful handoff', () => {
  const { state, tracker, accept } = harness();
  state.view.x = 100;
  const first = tracker.captureDownload();
  state.view.x = 200;
  tracker.captureDownload();
  assert.ok(accept(first));
  assert.equal(tracker.read().dirty, true);
  state.view.x = 100;
  assert.equal(tracker.read().dirty, false);
});

test('one explicitly untouched startup fit can set the initial view baseline', () => {
  const { state, tracker } = harness();
  const token = tracker.captureInitialView();
  assert.ok(Object.isFrozen(token));
  assert.equal(tracker.captureInitialView(), null);
  state.view = { x: 150.5, y: 99.1, scale: 0.625 };
  assert.equal(tracker.read().dirty, true);
  assert.equal(tracker.acceptInitialView(token, true), true);
  assert.equal(tracker.read().dirty, false);
  state.view.x += 1;
  assert.equal(tracker.acceptInitialView(token, true), false);
  assert.equal(tracker.captureInitialView(), null);
  assert.equal(tracker.read().dirty, true);
});

for (const scenario of ['user pan', 'theme rerender', 'import', 'stale render']) {
  test(`${scenario} prevents startup-fit baseline acceptance, including retries`, () => {
    const { state, tracker } = harness();
    const token = tracker.captureInitialView();
    state.view.x += 80;
    assert.equal(tracker.acceptInitialView(token, false), false);
    assert.equal(tracker.read().dirty, true);
    assert.equal(tracker.acceptInitialView(token, true), false);
    assert.equal(tracker.captureInitialView(), null);
  });
}

test('startup guard must be explicitly true and authentic', () => {
  const { state, tracker } = harness();
  const token = tracker.captureInitialView();
  state.view.x += 80;
  assert.equal(tracker.acceptInitialView({}, true), false);
  assert.equal(tracker.acceptInitialView(null, true), false);
  assert.equal(tracker.acceptInitialView(token), false);
  assert.equal(tracker.acceptInitialView(token, true), false);
  assert.equal(tracker.read().dirty, true);
});

for (const key of ['text', 'filename', 'sourceDirty']) {
  test(`startup-fit baseline rejects ${key} edits even if caller guard is true`, () => {
    const { state, tracker } = harness();
    const token = tracker.captureInitialView();
    state.view.x += 80;
    state[key] = key === 'sourceDirty' ? true : 'Changed';
    assert.equal(tracker.acceptInitialView(token, true), false);
    assert.equal(tracker.read().dirty, true);
  });
}

test('an observed edit then exact undo cannot re-enable startup-fit baseline', () => {
  const { state, tracker } = harness();
  const token = tracker.captureInitialView();
  const original = state.text;
  state.text += ' ';
  tracker.read();
  state.text = original;
  state.view.x += 80;
  assert.equal(tracker.acceptInitialView(token, true), false);
  assert.equal(tracker.read().dirty, true);
});

test('late initial capture cannot adopt a user-moved view', () => {
  const { state, tracker } = harness();
  state.view.x += 80;
  assert.equal(tracker.captureInitialView(), null);
  assert.equal(tracker.read().dirty, true);
  state.view.x = 40;
  assert.equal(tracker.captureInitialView(), null);
});

test('download capture permanently retires startup-fit baseline, even when dispatch fails', () => {
  const { state, tracker } = harness();
  const token = tracker.captureInitialView();
  tracker.captureDownload();
  state.view.x += 80;
  assert.equal(tracker.acceptInitialView(token, true), false);
  assert.equal(tracker.captureInitialView(), null);
  assert.equal(tracker.read().dirty, true);
});

test('optional readiness/transient readers default to ready and no transient state', () => {
  const state = { text: '', filename: '', view: { x: 0, y: 0, scale: 1 } };
  const tracker = createMermaidState({ snapshot: () => state, sourceDirty: () => false });
  assert.deepEqual(tracker.read(), { ready: true, dirty: false, transient: false, generation: 0 });
});

test('invalid readers and snapshots fail visibly rather than reporting a clean state', () => {
  assert.throws(() => createMermaidState({ snapshot: null, sourceDirty: () => false }), TypeError);
  assert.throws(() => createMermaidState({ snapshot: () => null, sourceDirty: () => false }), TypeError);
  const { state, tracker } = harness();
  state.view.x = NaN;
  assert.throws(() => tracker.read(), TypeError);
  assert.throws(() => tracker.captureDownload(), TypeError);
});
