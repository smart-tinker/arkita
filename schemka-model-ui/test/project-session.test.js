import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, SchemkaError } from '../../schemka-model-core/src/index.js';
import {
  PROJECT_FILE_LIMITS, deserializeProjectFile, projectFileName, serializeProjectFile,
} from '../../schemka-model-io/src/project-file.js';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createProjectSession } from '../src/project-session.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const error = code => value => value instanceof SchemkaError && value.code === code;
const fresh = () => {
  const store = createDemo();
  return { store, session: createProjectSession(store) };
};
const rename = (store, name) => store.execute({ type: 'renameProject', name }, store.revision);
const source = name => serializeProjectFile(createProject(name));
function file(input = source('Opened project'), name = 'selected.schemka.json') {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
}
function deferredFile(input = source('Deferred project')) {
  let resolve, reject, reads = 0;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {
    file: { name: 'deferred.schemka.json', size: input.length, arrayBuffer: () => { reads++; return promise; } },
    resolve: () => resolve(input.slice().buffer), reject, get reads() { return reads; },
  };
}
function capture(store, session) {
  return { snapshot: store.snapshot, history: store.history, revision: store.revision, dirty: session.dirty };
}
function unchanged(store, session, before) {
  assert.deepEqual(capture(store, session), before);
}
function historyOnBothSides(store) {
  rename(store, 'First edit');
  rename(store, 'Second edit');
  store.undo(store.revision);
  assert.deepEqual(store.history, { undo: 1, redo: 1 });
}

test('initial synthetic state is canonically clean, without changing model or histories', () => {
  const store = createDemo(), before = { state: store.snapshot, revision: store.revision, history: store.history };
  const session = createProjectSession(store);
  assert.equal(session.dirty, false);
  assert.equal(session.dirty, false);
  assert.ok(Object.isFrozen(session));
  assert.deepEqual({ state: store.snapshot, revision: store.revision, history: store.history }, before);
});

test('constructor rejects a missing or invalid core store', () => {
  for (const store of [null, undefined, {}, { load() {}, revision: -1 }, { load() {}, revision: 1.5 }]) {
    assert.throws(() => createProjectSession(store), error('FILE_STORE'));
  }
});

test('undo to the exact canonical baseline clears dirty despite a newer revision; redo restores it', () => {
  const { store, session } = fresh();
  rename(store, 'Changed');
  assert.equal(session.dirty, true);
  store.undo(store.revision);
  assert.equal(store.revision, 2);
  assert.equal(session.dirty, false);
  store.redo(store.revision);
  assert.equal(session.dirty, true);
});

test('a merged project snapshot preserves file identity and baseline while normal undo and save tickets remain exact', () => {
  const { store, session } = fresh(), before = store.exportFiles(), documentToken = session.documentToken;
  const savedBeforeMerge = session.prepareSave();
  const merged = createStore(store.snapshot);
  rename(merged, 'Merged changes from Git');
  store.execute({ type: 'applyProjectSnapshot', files: merged.exportFiles() }, store.revision);
  assert.equal(session.documentToken, documentToken); assert.equal(session.dirty, true);
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
  assert.equal(session.completeSave(savedBeforeMerge).dirty, true);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); assert.equal(session.dirty, false);
  store.redo(store.revision); assert.equal(session.dirty, true);
  const mergedSave = session.prepareSave(); session.completeSave(mergedSave);
  assert.equal(session.dirty, false); assert.equal(session.documentToken, documentToken);
  store.undo(store.revision); assert.equal(session.dirty, true);
});

test('a same-value command has a revision/history entry but does not make the file dirty', () => {
  const { store, session } = fresh();
  rename(store, store.snapshot.project.name);
  assert.equal(store.revision, 1);
  assert.equal(store.history.undo, 1);
  assert.equal(session.dirty, false);
});

test('dirty tracks complete model and view geometry, not only project name', () => {
  const { store, session } = fresh(), original = store.snapshot;
  const view = original.views[1], occurrence = view.occurrences[0];
  store.execute({ type: 'moveOccurrence', viewId: view.view.id, occurrenceId: occurrence.id, x: 500, y: 600 }, store.revision);
  assert.equal(session.dirty, true);
  store.undo(store.revision);
  assert.equal(session.dirty, false);
  store.execute({ type: 'renameRelationship', relationshipId: original.relationships[0].id, label: 'Changed shared link' }, store.revision);
  assert.equal(session.dirty, true);
});

test('prepareSave captures exact canonical bytes and sanitized name without clearing dirty/history', () => {
  const { store, session } = fresh();
  rename(store, '../ unsafe : project');
  const before = capture(store, session), ticket = session.prepareSave();
  assert.ok(Object.isFrozen(ticket));
  assert.ok(ticket.bytes instanceof Uint8Array);
  assert.deepEqual(ticket.bytes, serializeProjectFile(store.snapshot));
  assert.equal(ticket.name, projectFileName(store.snapshot.project.name));
  assert.equal(ticket.revision, store.revision);
  unchanged(store, session, before);
  // A failed browser download simply never calls completeSave.
  assert.equal(session.dirty, true);
});

test('completeSave records only successful dispatch baseline, keeping undo/redo available', () => {
  const { store, session } = fresh();
  rename(store, 'Saved change');
  const ticket = session.prepareSave(), before = store.history;
  assert.deepEqual(session.completeSave(ticket), { revision: ticket.revision, name: ticket.name, dirty: false });
  assert.equal(session.dirty, false);
  assert.deepEqual(store.history, before);
  store.undo(store.revision);
  assert.equal(session.dirty, true);
  store.redo(store.revision);
  assert.equal(session.dirty, false);
  assert.throws(() => session.completeSave(ticket), error('SESSION_STALE'));
});

test('saving an older snapshot does not mark newer edits clean; undo to those saved bytes does', () => {
  const { store, session } = fresh();
  rename(store, 'Captured file');
  const ticket = session.prepareSave();
  rename(store, 'Newer edit');
  assert.equal(session.completeSave(ticket).dirty, true);
  assert.equal(session.dirty, true);
  assert.equal(deserializeProjectFile(ticket.bytes).project.name, 'Captured file');
  store.undo(store.revision);
  assert.equal(session.dirty, false);
});

test('superseded save completions cannot rewind a newer save baseline', () => {
  const { store, session } = fresh();
  rename(store, 'Old save');
  const old = session.prepareSave();
  rename(store, 'New save');
  const latest = session.prepareSave(), before = capture(store, session);
  assert.throws(() => session.completeSave(old), error('SESSION_STALE'));
  unchanged(store, session, before);
  session.completeSave(latest);
  assert.throws(() => session.completeSave(old), error('SESSION_STALE'));
  assert.equal(session.dirty, false);
});

test('save tickets from another session, forged copies, load tickets and primitives are rejected', () => {
  const { store, session } = fresh(), other = createProjectSession(store);
  const ticket = session.prepareSave();
  for (const invalid of [other.prepareSave(), { ...ticket }, session.beginLoad(), null, 1, 'ticket']) {
    assert.throws(() => session.completeSave(invalid), error('SESSION_STALE'));
  }
  assert.equal(session.dirty, false);
  session.completeSave(ticket);
});

test('mutating prepared bytes cannot mutate baseline or silently mark the file clean', () => {
  const { store, session } = fresh();
  rename(store, 'Edited');
  const ticket = session.prepareSave(), before = capture(store, session);
  ticket.bytes[0] = 0;
  assert.throws(() => session.completeSave(ticket), error('FILE_INPUT'));
  unchanged(store, session, before);
  assert.throws(() => session.completeSave(ticket), error('SESSION_STALE'));
  const next = session.prepareSave();
  assert.deepEqual(next.bytes, serializeProjectFile(store.snapshot));
});

test('mutating download bytes after successful completion cannot mutate the internal baseline', () => {
  const { store, session } = fresh();
  rename(store, 'Saved');
  const ticket = session.prepareSave();
  session.completeSave(ticket);
  ticket.bytes.fill(0);
  assert.equal(session.dirty, false);
  store.undo(store.revision);
  assert.equal(session.dirty, true);
});

test('successful file load is one atomic revision, canonical clean and clears undo plus redo', async () => {
  const { store, session } = fresh();
  historyOnBothSides(store);
  const bytes = source('Loaded zero-view project'), ticket = session.beginLoad();
  const result = await session.loadFile(ticket, file(bytes));
  assert.deepEqual(result, { revision: ticket.revision + 1, name: 'Loaded zero-view project', fileName: 'selected.schemka.json', dirty: false });
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
  assert.equal(session.dirty, false);
  assert.equal(store.snapshot.views.length, 0);
  assert.deepEqual(serializeProjectFile(store.snapshot), bytes);
  assert.deepEqual(session.prepareSave().bytes, bytes);
  await assert.rejects(session.loadFile(ticket, file(bytes)), error('SESSION_STALE'));
});

test('noncanonical JSON input establishes the canonical saved baseline and fallback filename', async () => {
  const { store, session } = fresh(), canonical = source('Unicode модель');
  const envelope = JSON.parse(decoder.decode(canonical));
  const noncanonical = JSON.stringify({ files: envelope.files.map(item => ({
    content: JSON.stringify(JSON.parse(item.content)), path: item.path,
  })), formatVersion: envelope.formatVersion, format: envelope.format });
  const selected = file(noncanonical);
  delete selected.name;
  const result = await session.loadFile(session.beginLoad(), selected);
  assert.equal(result.fileName, projectFileName('Unicode модель'));
  assert.equal(session.dirty, false);
  assert.deepEqual(session.prepareSave().bytes, canonical);
  rename(store, 'Different');
  store.undo(store.revision);
  assert.equal(session.dirty, false);
});

test('a full model load preserves unshown objects, relationships, IDs and all view layouts', async () => {
  const { store, session } = fresh();
  const candidate = createDemo().snapshot;
  const emptyViewId = candidate.views[1].view.id;
  candidate.views[1].occurrences = [];
  candidate.views[1].connections = [];
  const bytes = serializeProjectFile(candidate);
  await session.loadFile(session.beginLoad(), file(bytes));
  assert.deepEqual(serializeProjectFile(store.snapshot), bytes);
  assert.equal(store.snapshot.elements.length, 3);
  assert.equal(store.snapshot.relationships.length, 2);
  assert.equal(store.snapshot.views.length, 2);
  assert.equal(store.snapshot.views.find(entry => entry.view.id === emptyViewId).occurrences.length, 0);
  assert.equal(session.dirty, false);
});

test('successful load invalidates every previously prepared save', async () => {
  const { store, session } = fresh();
  const old = session.prepareSave();
  await session.loadFile(session.beginLoad(), file());
  const before = capture(store, session);
  assert.throws(() => session.completeSave(old), error('SESSION_STALE'));
  unchanged(store, session, before);
});

test('cancel before reading preserves history, dirty baseline and a pending save', async () => {
  const { store, session } = fresh();
  historyOnBothSides(store);
  const save = session.prepareSave(), before = capture(store, session);
  const ticket = session.beginLoad(), pending = deferredFile();
  assert.equal(session.cancelLoad(ticket), true);
  assert.equal(session.cancelLoad(ticket), false);
  await assert.rejects(session.loadFile(ticket, pending.file), error('SESSION_STALE'));
  assert.equal(pending.reads, 0);
  unchanged(store, session, before);
  assert.equal(session.completeSave(save).dirty, false);
});

test('cancel during async reading never applies the file after its promise settles', async () => {
  const { store, session } = fresh();
  historyOnBothSides(store);
  const before = capture(store, session), pending = deferredFile(), ticket = session.beginLoad();
  const result = session.loadFile(ticket, pending.file);
  assert.equal(pending.reads, 1);
  assert.equal(session.cancelLoad(ticket), true);
  pending.resolve();
  await assert.rejects(result, error('SESSION_STALE'));
  unchanged(store, session, before);
});

test('latest simultaneous open wins even if the older read resolves last', async () => {
  const { store, session } = fresh(), oldFile = deferredFile(source('Old')), newFile = deferredFile(source('New'));
  const oldTicket = session.beginLoad(), oldResult = session.loadFile(oldTicket, oldFile.file);
  const newTicket = session.beginLoad(), newResult = session.loadFile(newTicket, newFile.file);
  assert.equal(session.cancelLoad(oldTicket), false);
  newFile.resolve();
  await newResult;
  const before = capture(store, session);
  oldFile.resolve();
  await assert.rejects(oldResult, error('SESSION_STALE'));
  unchanged(store, session, before);
  assert.equal(store.snapshot.project.name, 'New');
});

test('a superseded earlier read is stale even if it resolves before the newer one', async () => {
  const { store, session } = fresh(), first = deferredFile(), second = deferredFile(source('Second'));
  const before = capture(store, session), old = session.loadFile(session.beginLoad(), first.file);
  const latest = session.loadFile(session.beginLoad(), second.file);
  first.resolve();
  await assert.rejects(old, error('SESSION_STALE'));
  unchanged(store, session, before);
  second.resolve();
  await latest;
  assert.equal(store.snapshot.project.name, 'Second');
});

test('newest cancelled or invalid open still supersedes an older in-flight read', async () => {
  for (const newest of ['cancelled', 'invalid']) {
    const { store, session } = fresh(), pending = deferredFile();
    historyOnBothSides(store);
    const before = capture(store, session), oldResult = session.loadFile(session.beginLoad(), pending.file);
    const latest = session.beginLoad();
    if (newest === 'cancelled') session.cancelLoad(latest);
    else await assert.rejects(session.loadFile(latest, file('{')), error('JSON_SYNTAX'));
    pending.resolve();
    await assert.rejects(oldResult, error('SESSION_STALE'));
    unchanged(store, session, before);
  }
});

test('a command during the read makes the load stale without discarding that edit/history', async () => {
  const { store, session } = fresh(), pending = deferredFile();
  const result = session.loadFile(session.beginLoad(), pending.file);
  rename(store, 'Must survive');
  const before = capture(store, session);
  pending.resolve();
  await assert.rejects(result, error('SESSION_STALE'));
  unchanged(store, session, before);
});

test('edit then undo to identical canonical bytes still invalidates an older load revision', async () => {
  const { store, session } = fresh(), pending = deferredFile();
  const result = session.loadFile(session.beginLoad(), pending.file);
  rename(store, 'Transient edit');
  store.undo(store.revision);
  assert.equal(session.dirty, false);
  const before = capture(store, session);
  pending.resolve();
  await assert.rejects(result, error('SESSION_STALE'));
  unchanged(store, session, before);
});

test('revision changes during file picker/confirmation are rejected before any file read', async () => {
  const { store, session } = fresh(), pending = deferredFile(), ticket = session.beginLoad();
  rename(store, 'Changed before read');
  const before = capture(store, session);
  await assert.rejects(session.loadFile(ticket, pending.file), error('SESSION_STALE'));
  assert.equal(pending.reads, 0);
  unchanged(store, session, before);
});

test('UI guard cancellation before and after a read preserves drafts via a stale result', async () => {
  for (const when of ['before', 'after']) {
    const { store, session } = fresh(), pending = deferredFile();
    historyOnBothSides(store);
    const before = capture(store, session);
    let current = when !== 'before';
    const result = session.loadFile(session.beginLoad(), pending.file, { isCurrent: () => current });
    assert.equal(pending.reads, when === 'before' ? 0 : 1);
    current = false;
    pending.resolve();
    await assert.rejects(result, error('SESSION_STALE'));
    unchanged(store, session, before);
  }
});

test('UI guard is checked immediately before commit after full file validation', async () => {
  const { store, session } = fresh(), before = capture(store, session);
  let checks = 0;
  const result = session.loadFile(session.beginLoad(), file(), { isCurrent: () => ++checks < 4 });
  await assert.rejects(result, error('SESSION_STALE'));
  assert.equal(checks, 4);
  unchanged(store, session, before);
});

test('a UI guard cannot authorize a command made while evaluating that guard', async () => {
  const { store, session } = fresh();
  let checks = 0;
  await assert.rejects(session.loadFile(session.beginLoad(), file(), { isCurrent() {
    if (++checks === 4) rename(store, 'Guard-time edit');
    return true;
  } }), error('SESSION_STALE'));
  assert.equal(store.snapshot.project.name, 'Guard-time edit');
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
  assert.equal(session.dirty, true);
});

test('forged, foreign, reused and already-reading load tickets cannot start another read', async () => {
  const { store, session } = fresh(), other = createProjectSession(store);
  const ticket = session.beginLoad(), pending = deferredFile();
  for (const invalid of [{ ...ticket }, other.beginLoad(), session.prepareSave(), null, 1, 'ticket']) {
    await assert.rejects(session.loadFile(invalid, pending.file), error('SESSION_STALE'));
    assert.equal(session.cancelLoad(invalid), false);
  }
  const result = session.loadFile(ticket, pending.file);
  await assert.rejects(session.loadFile(ticket, pending.file), error('SESSION_STALE'));
  assert.equal(pending.reads, 1);
  pending.resolve();
  await result;
});

test('invalid, empty, fractional and oversized File.size values fail before touching arrayBuffer', async () => {
  for (const size of [0, -1, 1.5, NaN, Infinity, '10', undefined, Number.MAX_SAFE_INTEGER + 1, PROJECT_FILE_LIMITS.bytes + 1]) {
    const { store, session } = fresh();
    historyOnBothSides(store);
    const before = capture(store, session);
    let touched = false;
    const selected = { size, get arrayBuffer() { touched = true; throw new Error('Must not allocate'); } };
    await assert.rejects(session.loadFile(session.beginLoad(), selected), error('FILE_SIZE'));
    assert.equal(touched, false);
    unchanged(store, session, before);
  }
});

test('native File loading ignores shadowed size and arrayBuffer properties', async () => {
  const { store, session } = fresh(), bytes = source('Native File');
  const selected = new File([bytes], 'native.schemka.json', { type: 'application/json' });
  let touched = false;
  Object.defineProperties(selected, {
    size: { get() { touched = true; throw new Error('Shadowed size'); } },
    arrayBuffer: { get() { touched = true; throw new Error('Shadowed reader'); } },
  });
  const result = await session.loadFile(session.beginLoad(), selected);
  assert.equal(touched, false);
  assert.equal(result.fileName, 'native.schemka.json');
  assert.deepEqual(serializeProjectFile(store.snapshot), bytes);
  assert.equal(session.dirty, false);
});

test('an oversized native File cannot bypass the pre-read limit with a shadowed size', async () => {
  const { store, session } = fresh(), before = capture(store, session);
  const selected = new File([new Uint8Array(PROJECT_FILE_LIMITS.bytes + 1)], 'too-big.schemka.json');
  let touched = false;
  Object.defineProperties(selected, {
    size: { value: 1 },
    arrayBuffer: { get() { touched = true; throw new Error('Must not allocate'); } },
  });
  await assert.rejects(session.loadFile(session.beginLoad(), selected), error('FILE_SIZE'));
  assert.equal(touched, false);
  unchanged(store, session, before);
});

test('native Blob is accepted with a canonical fallback filename', async () => {
  const { store, session } = fresh(), bytes = source('Native Blob');
  const result = await session.loadFile(session.beginLoad(), new Blob([bytes]));
  assert.equal(result.fileName, 'Native Blob.arkita');
  assert.deepEqual(serializeProjectFile(store.snapshot), bytes);
});

test('a nonboolean async UI guard never authorizes replacement', async () => {
  const { store, session } = fresh(), before = capture(store, session), pending = deferredFile();
  await assert.rejects(session.loadFile(session.beginLoad(), pending.file, { isCurrent: async () => false }), error('SESSION_STALE'));
  assert.equal(pending.reads, 0);
  unchanged(store, session, before);
});

test('the exact 18 MiB File limit is permitted and validated by IO', async () => {
  const { store, session } = fresh(), canonical = source('At limit');
  const bytes = new Uint8Array(PROJECT_FILE_LIMITS.bytes).fill(32);
  bytes.set(canonical);
  await session.loadFile(session.beginLoad(), file(bytes));
  assert.equal(store.snapshot.project.name, 'At limit');
  assert.equal(session.dirty, false);
  assert.deepEqual(session.prepareSave().bytes, canonical);
});

test('actual ArrayBuffer length must equal declared size, including zero or oversized reads', async () => {
  for (const actual of [0, 2, PROJECT_FILE_LIMITS.bytes + 1]) {
    const { store, session } = fresh();
    historyOnBothSides(store);
    const before = capture(store, session);
    await assert.rejects(session.loadFile(session.beginLoad(), { size: 1, arrayBuffer: async () => new ArrayBuffer(actual) }), error('FILE_SIZE'));
    unchanged(store, session, before);
  }
});

test('spoofed ArrayBuffer byteLength cannot bypass actual-length validation', async () => {
  const { store, session } = fresh(), before = capture(store, session), buffer = new ArrayBuffer(2);
  Object.defineProperty(buffer, 'byteLength', { value: 1 });
  await assert.rejects(session.loadFile(session.beginLoad(), { size: 1, arrayBuffer: async () => buffer }), error('FILE_SIZE'));
  unchanged(store, session, before);
});

test('unsupported File input and non-ArrayBuffer readers are rejected without model changes', async () => {
  const { store, session } = fresh();
  historyOnBothSides(store);
  const before = capture(store, session);
  for (const selected of [null, 'file', { size: 1 }, { size: 1, arrayBuffer: 1 }]) {
    await assert.rejects(session.loadFile(session.beginLoad(), selected), error('FILE_INPUT'));
  }
  for (const result of [null, {}, new Uint8Array(1), 'x', new SharedArrayBuffer(1)]) {
    await assert.rejects(session.loadFile(session.beginLoad(), { size: 1, arrayBuffer: async () => result }), error('FILE_READ'));
  }
  unchanged(store, session, before);
});

test('read rejection and synchronous read failure preserve both histories, dirty and pending saves', async () => {
  for (const asynchronous of [false, true]) {
    const { store, session } = fresh();
    historyOnBothSides(store);
    const save = session.prepareSave(), before = capture(store, session);
    const selected = { size: 1, arrayBuffer: asynchronous
      ? () => Promise.reject(new Error('Read failed'))
      : () => { throw new Error('Read failed'); } };
    await assert.rejects(session.loadFile(session.beginLoad(), selected), error('FILE_READ'));
    unchanged(store, session, before);
    assert.equal(session.completeSave(save).dirty, false);
  }
});

test('a cancelled read that rejects reports stale, without misleading current-operation failure', async () => {
  const { store, session } = fresh(), pending = deferredFile(), ticket = session.beginLoad();
  const before = capture(store, session), result = session.loadFile(ticket, pending.file);
  session.cancelLoad(ticket);
  pending.reject(new Error('Late rejection'));
  await assert.rejects(result, error('SESSION_STALE'));
  unchanged(store, session, before);
});

test('strict UTF-8, BOM, JSON and container validation errors cannot mutate state or either history', async () => {
  const cases = [
    [new Uint8Array([0xff]), 'FILE_ENCODING'],
    [encoder.encode('\ufeff{}'), 'FILE_ENCODING'],
    ['{', 'JSON_SYNTAX'],
    ['{}', 'FILE_SCHEMA'],
    ['{"format":"wrong","formatVersion":1,"files":[]}', 'FILE_VERSION'],
    ['{"format":"schemka-project-file","formatVersion":2,"files":[]}', 'FILE_VERSION'],
    ['{"format":"schemka-project-file","format":"schemka-project-file","formatVersion":1,"files":[]}', 'DUPLICATE_KEY'],
  ];
  for (const [input, code] of cases) {
    const { store, session } = fresh();
    historyOnBothSides(store);
    const before = capture(store, session), save = session.prepareSave();
    await assert.rejects(session.loadFile(session.beginLoad(), file(input)), error(code));
    unchanged(store, session, before);
    assert.equal(session.completeSave(save).dirty, false);
  }
});

test('core schema/reference validation occurs before replacement; failed load keeps its old baseline', async () => {
  const { store, session } = fresh();
  const baselineName = store.snapshot.project.name;
  historyOnBothSides(store);
  const invalid = JSON.parse(decoder.decode(serializeProjectFile(store.snapshot)));
  const relation = invalid.files.find(item => item.path.startsWith('model/relationships/'));
  const value = JSON.parse(relation.content);
  value.source.id = 'el-00000000-0000-4000-8000-000000000000';
  relation.content = JSON.stringify(value);
  const before = capture(store, session);
  await assert.rejects(session.loadFile(session.beginLoad(), file(JSON.stringify(invalid))), error('REFERENCE'));
  unchanged(store, session, before);
  store.undo(store.revision);
  assert.equal(store.snapshot.project.name, baselineName);
  assert.equal(session.dirty, false);
  store.redo(store.revision);
  assert.equal(session.dirty, true);
});

test('a later valid open works after failures and cancelled reads', async () => {
  const { store, session } = fresh();
  await assert.rejects(session.loadFile(session.beginLoad(), file('{')), error('JSON_SYNTAX'));
  const ticket = session.beginLoad();
  session.cancelLoad(ticket);
  await session.loadFile(session.beginLoad(), file(source('Recovery')));
  assert.equal(store.snapshot.project.name, 'Recovery');
  assert.equal(session.dirty, false);
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
});

test('preparing/completing a save while a load is pending does not invalidate the load revision', async () => {
  const { store, session } = fresh(), pending = deferredFile();
  rename(store, 'Saved before open finishes');
  const result = session.loadFile(session.beginLoad(), pending.file);
  session.completeSave(session.prepareSave());
  assert.equal(session.dirty, false);
  pending.resolve();
  await result;
  assert.equal(store.snapshot.project.name, 'Deferred project');
  assert.equal(session.dirty, false);
});


test('current-operation guard must synchronously return the literal true', async () => {
  for (const isCurrent of [async () => false, async () => true, () => 1, () => 'true']) {
    const { store, session } = fresh(), before = capture(store, session);
    await assert.rejects(session.loadFile(session.beginLoad(), file(), { isCurrent }), error('SESSION_STALE'));
    unchanged(store, session, before);
  }
});
