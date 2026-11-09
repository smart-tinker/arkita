import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, importFiles, validateProject, LIMITS, SchemkaError } from '../src/index.js';
import { byteLength, canonicalJSON } from '../src/json.js';
import { newId } from '../src/format.js';

const run = (store, command) => store.execute(command, store.revision);
const error = (code) => (value) => value instanceof SchemkaError && value.code === code;
const viewById = (state, id) => state.views.find((entry) => entry.view.id === id);
const persisted = (store) => ({ snapshot: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history });
function unchangedAfter(store, command, code, revision = store.revision) {
  const before = persisted(store);
  assert.throws(() => store.execute(command, revision), error(code));
  assert.deepEqual(persisted(store), before);
}
function element(name = '') {
  return { id: newId('el'), type: 'ApplicationComponent', name, documentation: '', properties: [] };
}
function emptyView(name = '') {
  return { view: { id: newId('view'), name, documentation: '', properties: [] }, occurrences: [], connections: [], visualNodes: [], visualConnectors: [] };
}
function richState() {
  const state = createProject('Общая модель');
  const a = element('A'), b = element('B');
  state.elements.push(a, b);
  const source = emptyView('Исходный вид');
  source.view.documentation = 'Документация 漢字 🙂\n<plain text>\t e\u0301';
  const oa = { id: newId('occ'), concept: { kind: 'element', id: a.id },
    bounds: { x: -12.3, y: 45.6, width: 200.1, height: 88.8 }, parent: null, style: {}, zIndex: -17 };
  const ob = { id: newId('occ'), concept: { kind: 'element', id: b.id },
    bounds: { x: 1000000, y: -1000000, width: 0.1, height: 1000000 }, parent: null, style: {}, zIndex: 1000000 };
  const repeated = { id: newId('occ'), concept: { kind: 'element', id: a.id },
    bounds: { x: 27, y: 9.1, width: 10, height: 12 }, parent: null, style: {}, zIndex: 0 };
  // Deliberately put the first endpoint last; remapping cannot rely on edge order.
  source.occurrences.push(repeated, ob, oa);
  const relationship = (from, to, label) => ({ id: newId('rel'), type: 'Association',
    source: { kind: 'element', id: from.id }, target: { kind: 'element', id: to.id }, label, documentation: '', properties: [] });
  const link = relationship(a, b, 'shared'), parallel = relationship(a, b, 'parallel'), self = relationship(a, a, 'loop');
  state.relationships.push(link, parallel, self);
  const connection = (rel, from, to, routePoints = [], labelPosition = null) => ({ id: newId('conn'),
    relationshipId: rel.id, source: { kind: 'occurrence', id: from.id }, target: { kind: 'occurrence', id: to.id }, routePoints: routePoints.map(point => ({ kind: 'bend', point })), labelPosition, style: {} });
  source.connections.push(
    connection(link, oa, ob, [{ x: 0.1, y: -4.5 }, { x: 7.8, y: 0 }, { x: 0.1, y: -4.5 }], { x: 22.2, y: 33.3 }),
    connection(link, repeated, ob),
    connection(parallel, oa, ob, [{ x: -1000000, y: 1000000 }]),
    connection(self, oa, oa, [{ x: 30, y: 40 }], { x: -10.1, y: 2.9 }),
    connection(self, oa, repeated),
  );
  state.views.push(source, emptyView('Другой вид'));
  return validateProject(state);
}
function historyOnBothSides(store) {
  const undo = store.history.undo;
  run(store, { type: 'renameProject', name: 'Keep this' });
  run(store, { type: 'renameProject', name: 'Redo this' });
  store.undo(store.revision);
  assert.deepEqual(store.history, { undo: undo + 1, redo: 1 });
}

// UUID fields are new; everything else in the view is preserved, including
// repeated occurrences, multiple drawings of one relationship and self-loops.
test('duplicateView clones the entire supported layout while reusing shared model IDs', () => {
  const initial = richState();
  const store = createStore(initial);
  const source = initial.views[0];
  const before = store.exportFiles();
  const name = 'Копия 🧩 漢字 e\u0301';
  const result = run(store, { type: 'duplicateView', viewId: source.view.id, name });
  const after = store.snapshot;
  const copy = viewById(after, result.created.viewId);
  assert.deepEqual(result, { command: 'duplicateView', created: { viewId: copy.view.id }, affectedViewIds: [copy.view.id], revision: 1 });
  assert.deepEqual(after.views.slice(0, initial.views.length), initial.views);
  assert.deepEqual(after.elements, initial.elements);
  assert.deepEqual(after.relationships, initial.relationships);
  assert.deepEqual(after.project, initial.project);
  assert.equal(after.views.length, initial.views.length + 1);
  assert.deepEqual(copy.view, { ...source.view, id: result.created.viewId, name });
  const occurrenceIds = new Map(source.occurrences.map((item, index) => [item.id, copy.occurrences[index].id]));
  assert.deepEqual(copy.occurrences, source.occurrences.map((item) => ({ ...item, id: occurrenceIds.get(item.id) })));
  assert.deepEqual(copy.connections, source.connections.map((item, index) => ({ ...item, id: copy.connections[index].id,
    source: { kind: 'occurrence', id: occurrenceIds.get(item.source.id) }, target: { kind: 'occurrence', id: occurrenceIds.get(item.target.id)  }})));
  const sourceIds = new Set([source.view.id, ...source.occurrences.map((item) => item.id), ...source.connections.map((item) => item.id)]);
  const copyIds = [copy.view.id, ...copy.occurrences.map((item) => item.id), ...copy.connections.map((item) => item.id)];
  assert.equal(new Set(copyIds).size, copyIds.length);
  for (const id of copyIds) {
    assert.ok(!sourceIds.has(id));
    assert.match(id, /^(?:view|occ|conn)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  const afterFiles = store.exportFiles();
  const filesByPath = new Map(afterFiles.map((file) => [file.path, file.content]));
  for (const file of before) assert.equal(filesByPath.get(file.path), file.content, file.path);
  assert.equal(afterFiles.length - before.length, 1 + source.occurrences.length + source.connections.length);
  assert.deepEqual(exportFiles(importFiles(afterFiles)), afterFiles);
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
});

test('duplicateView retains drawing ID order for tied layers without changing stored zIndex or array order', () => {
  const initial = richState(), source = initial.views[0];
  source.occurrences.sort((a, b) => a.id < b.id ? 1 : -1);
  source.connections.sort((a, b) => a.id < b.id ? 1 : -1);
  for (const occurrence of source.occurrences) occurrence.zIndex = LIMITS.coordinate;
  const store = createStore(initial), descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let sequence = 0, result;
  try {
    // Ascending fresh IDs must not turn descending insertion order into paint order.
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
      randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    } });
    result = run(store, { type: 'duplicateView', viewId: source.view.id, name: 'Same stacking' });
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
  const copy = viewById(store.snapshot, result.created.viewId);
  for (const key of ['occurrences', 'connections']) {
    const ids = new Map(source[key].map((item, index) => [item.id, copy[key][index].id]));
    const mappedOrder = source[key].map(item => item.id).sort().map(id => ids.get(id));
    assert.deepEqual(mappedOrder, copy[key].map(item => item.id).sort(), `${key} retain their relative ID order`);
  }
  assert.deepEqual(copy.occurrences.map(({ id, ...item }) => item), source.occurrences.map(({ id, ...item }) => item));
  assert.deepEqual(store.snapshot.views.slice(0, initial.views.length), initial.views);
  const after = store.exportFiles();
  store.undo(store.revision); assert.deepEqual(store.snapshot, initial);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  assert.deepEqual(exportFiles(importFiles(after)), after);
});

test('duplicateView is one exact undo/redo step and redo never allocates replacement IDs', () => {
  const store = createStore(richState());
  const before = persisted(store);
  const result = run(store, { type: 'duplicateView', viewId: store.snapshot.views[0].view.id, name: 'Copy' });
  const after = persisted(store);
  assert.deepEqual(store.undo(store.revision), { ...result, revision: 2, action: 'undo' });
  assert.deepEqual(store.snapshot, before.snapshot);
  assert.deepEqual(store.exportFiles(), before.files);
  assert.deepEqual(store.history, { undo: 0, redo: 1 });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    assert.deepEqual(store.redo(store.revision), { ...result, revision: 3, action: 'redo' });
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
  assert.deepEqual(store.snapshot, after.snapshot);
  assert.deepEqual(store.exportFiles(), after.files);
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
});

test('duplicateView accepts empty views, empty or reused names and exact Unicode limits', () => {
  for (const name of ['', 'Original', '漢字\n<text>\0e\u0301\ud800', '🙂'.repeat(LIMITS.string / 2)]) {
    const initial = createProject('Empty');
    const source = emptyView('Original');
    source.view.documentation = '文書 🙂';
    initial.views.push(source);
    const store = createStore(initial);
    const result = run(store, { type: 'duplicateView', viewId: source.view.id, name });
    assert.deepEqual(viewById(store.snapshot, result.created.viewId), {
      view: { id: result.created.viewId, name, documentation: source.view.documentation, properties: [] }, occurrences: [], connections: [], visualNodes: [], visualConnectors: [],
    });
    assert.deepEqual(store.snapshot.elements, []);
    assert.deepEqual(store.snapshot.relationships, []);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    assert.deepEqual(exportFiles(importFiles(store.exportFiles())), store.exportFiles());
  }
});

test('duplicateView rejects malformed names, shapes and missing sources without changing either history stack', () => {
  const store = createStore(richState());
  historyOnBothSides(store);
  const command = { type: 'duplicateView', viewId: store.snapshot.views[0].view.id, name: 'Copy' };
  for (const name of [null, 1, false, [], {}, 'x'.repeat(LIMITS.string + 1)]) {
    unchangedAfter(store, { ...command, name }, 'SCHEMA');
  }
  unchangedAfter(store, { ...command, name: undefined }, 'JSON_VALUE');
  for (const key of ['viewId', 'name']) {
    const missing = { ...command };
    delete missing[key];
    unchangedAfter(store, missing, 'SCHEMA');
  }
  for (const extra of [{ documentation: 'override' }, { id: newId('view') }, { extra: true }]) {
    unchangedAfter(store, { ...command, ...extra }, 'SCHEMA');
  }
  for (const viewId of ['missing', newId('view'), store.snapshot.project.id, null, false, 12, {}, []]) {
    unchangedAfter(store, { ...command, viewId }, 'REFERENCE');
  }
  assert.equal(store.redo(store.revision).action, 'redo');
  assert.equal(store.snapshot.project.name, 'Redo this');
});

test('duplicateView rejects stale and invalid revisions before allocating any IDs', () => {
  const store = createStore(richState());
  historyOnBothSides(store);
  const command = { type: 'duplicateView', viewId: store.snapshot.views[0].view.id, name: 'Copy' };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID() { assert.fail('Stale command allocated an ID'); } } });
    for (const revision of [0, 2, 4, undefined, null, -1, 0.5, NaN, Infinity, '3']) {
      // Pass undefined directly: the helper's default intentionally means current revision.
      const before = persisted(store);
      assert.throws(() => store.execute(command, revision), error('REVISION'));
      assert.deepEqual(persisted(store), before);
    }
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});

test('duplicateView isolates all caller snapshots and later moves while retaining shared model identity', () => {
  const initial = richState();
  const store = createStore(initial);
  const source = initial.views[0];
  const command = { type: 'duplicateView', viewId: source.view.id, name: 'Copy' };
  const result = run(store, command);
  const copyId = result.created.viewId;
  const after = persisted(store);
  command.name = 'External mutation';
  initial.views[0].view.documentation = 'External mutation';
  initial.views[0].occurrences[0].bounds.x = 999;
  const exposed = store.snapshot;
  const exposedCopy = viewById(exposed, copyId);
  exposedCopy.view.documentation = 'External mutation';
  exposedCopy.occurrences[0].bounds.x = 777;
  exposedCopy.connections[0].routePoints[0].point.x = 666;
  exposedCopy.connections[0].labelPosition.y = 555;
  result.created.viewId = source.view.id;
  result.affectedViewIds.push(source.view.id);
  assert.deepEqual(persisted(store), after);

  const originalBefore = viewById(store.snapshot, source.view.id);
  const copyBefore = viewById(store.snapshot, copyId);
  run(store, { type: 'moveOccurrence', viewId: copyId, occurrenceId: copyBefore.occurrences[0].id, x: 123.4, y: -56.7 });
  assert.deepEqual(viewById(store.snapshot, source.view.id), originalBefore);
  store.undo(store.revision);
  run(store, { type: 'moveOccurrence', viewId: source.view.id, occurrenceId: source.occurrences[0].id, x: -222.2, y: 333.3 });
  assert.deepEqual(viewById(store.snapshot, copyId), copyBefore);
  const renamed = run(store, { type: 'renameElement', elementId: copyBefore.occurrences[0].concept.id, name: 'Shared rename' });
  assert.deepEqual(renamed.affectedViewIds, [source.view.id, copyId].sort());
  const relabeled = run(store, { type: 'renameRelationship', relationshipId: copyBefore.connections[0].relationshipId, label: 'Shared label' });
  assert.deepEqual(relabeled.affectedViewIds, [source.view.id, copyId].sort());
});

test('repeated duplicates are distinct and a successful duplicate clears redo in the shared history', () => {
  const store = createStore(richState());
  historyOnBothSides(store);
  const sourceId = store.snapshot.views[0].view.id;
  const first = run(store, { type: 'duplicateView', viewId: sourceId, name: 'Same' });
  assert.deepEqual(store.history, { undo: 2, redo: 0 });
  const second = run(store, { type: 'duplicateView', viewId: first.created.viewId, name: 'Same' });
  assert.notEqual(first.created.viewId, second.created.viewId);
  assert.deepEqual(second.affectedViewIds, [second.created.viewId]);
  const after = store.exportFiles();
  store.undo(store.revision);
  assert.ok(!viewById(store.snapshot, second.created.viewId));
  assert.ok(viewById(store.snapshot, first.created.viewId));
  store.redo(store.revision);
  assert.deepEqual(store.exportFiles(), after);
});

test('duplicateView remaps supported local parents and rejects self, other-view and missing parents', () => {
  for (const parent of ['local', 'self', 'other-view', 'missing']) {
    const state = richState(), source = state.views[0], target = source.occurrences[0], remote = structuredClone(source.occurrences[1]);
    remote.id = newId('occ'); state.views[1].occurrences.push(remote);
    target.parent = { kind: 'occurrence', id: parent === 'local' ? source.occurrences[1].id : parent === 'self' ? target.id : parent === 'other-view' ? remote.id : newId('occ') };
    if (parent !== 'local') { assert.throws(() => createStore(state), error('REFERENCE')); continue; }
    const store = createStore(state), result = run(store, { type: 'duplicateView', viewId: source.view.id, name: 'Nested copy' });
    const copied = viewById(store.snapshot, result.created.viewId);
    assert.equal(copied.occurrences[0].parent.id, copied.occurrences[1].id);
  }
});

test('duplicateView rolls back secure UUID unavailability, collisions and partial allocation failures', () => {
  const store = createStore(richState());
  historyOnBothSides(store);
  const command = { type: 'duplicateView', viewId: store.snapshot.views[0].view.id, name: 'Copy' };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const random = Math.random;
  try {
    Math.random = () => assert.fail('Weak UUID fallback used');
    for (const crypto of [undefined, {}, { randomUUID: null }]) {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
      unchangedAfter(store, command, 'RUNTIME');
    }
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => command.viewId.slice(5) } });
    unchangedAfter(store, command, 'DUPLICATE_ID');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => 'not-a-uuid' } });
    unchangedAfter(store, command, 'ID');
    const before = persisted(store);
    let calls = 0;
    const crypto = { randomUUID() {
      assert.equal(this, crypto);
      if (++calls === 3) throw new Error('UUID source failed mid-command');
      return descriptor.get ? descriptor.get.call(globalThis).randomUUID() : descriptor.value.randomUUID();
    } };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
    assert.throws(() => run(store, command), /UUID source failed mid-command/);
    assert.equal(calls, 3);
    assert.deepEqual(persisted(store), before);
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
    Math.random = random;
  }
});

test('duplicateView enforces the exact file limit atomically, with no partially copied view', () => {
  const state = createProject('Entity boundary');
  const source = emptyView('Source');
  const shared = element();
  state.elements.push(shared);
  source.occurrences.push({ id: newId('occ'), concept: { kind: 'element', id: shared.id }, bounds: { x: 0, y: 0, width: 1, height: 1 }, parent: null, style: {}, zIndex: 0 });
  state.views.push(source);
  // Project + element + source view/occurrence + fillers leaves exactly two slots.
  while (state.views.length + state.elements.length + 2 < LIMITS.files - 2) state.views.push(emptyView());
  const store = createStore(state);
  assert.equal(store.exportFiles().length, LIMITS.files - 2);
  const command = { type: 'duplicateView', viewId: source.view.id, name: 'Copy' };
  const result = run(store, command);
  assert.equal(store.exportFiles().length, LIMITS.files);
  assert.equal(viewById(store.snapshot, result.created.viewId).occurrences.length, 1);
  unchangedAfter(store, command, 'LIMIT');
  store.undo(store.revision);
  run(store, { type: 'createView', name: 'Only one slot left' });
  assert.equal(store.exportFiles().length, LIMITS.files - 1);
  historyOnBothSides(store);
  unchangedAfter(store, command, 'LIMIT');
  assert.equal(store.redo(store.revision).action, 'redo');
});

test('duplicateView rejects canonical byte overflow while preserving revision and both history stacks', () => {
  const state = richState();
  // Fill the shared model, which a duplicate must reuse rather than copy. Each
  // filler file remains within its own bound, and the project is valid before duplication.
  const padding = 'x'.repeat(LIMITS.string);
  for (let i = 0; i < 32; i++) {
    const item = element();
    item.properties = Array.from({ length: 31 }, (_, key) => ({ key: `p${key}`, value: padding }));
    state.elements.push(item);
  }
  const last = element();
  state.elements.push(last);
  let remaining = LIMITS.totalBytes - exportFiles(state).reduce((total, file) => total + byteLength(file.content), 0) - 100;
  for (let i = 0; remaining > 0; i++) {
    const key = `p${i}`;
    const before = byteLength(canonicalJSON(last));
    last.properties.push({ key, value: '' });
    const overhead = byteLength(canonicalJSON(last)) - before;
    assert.ok(remaining >= overhead);
    const length = Math.min(LIMITS.string, remaining - overhead);
    last.properties.at(-1).value = 'x'.repeat(length);
    remaining -= overhead + length;
  }
  const store = createStore(state);
  historyOnBothSides(store);
  const size = store.exportFiles().reduce((total, file) => total + byteLength(file.content), 0);
  assert.ok(size <= LIMITS.totalBytes && size > LIMITS.totalBytes - 200);
  unchangedAfter(store, { type: 'duplicateView', viewId: state.views[0].view.id, name: 'Copy' }, 'LIMIT');
  assert.equal(store.redo(store.revision).action, 'redo');
});

test('duplicateView preserves dense routed diagrams beyond the former aggregate JSON node limit', () => {
  const state = createProject('Node boundary');
  const shared = element();
  const source = emptyView('Source');
  const occurrence = { id: newId('occ'), concept: { kind: 'element', id: shared.id }, bounds: { x: 0, y: 0, width: 10, height: 10 }, parent: null, style: {}, zIndex: 0 };
  const relationship = { id: newId('rel'), type: 'Association', source: { kind: 'element', id: shared.id },
    target: { kind: 'element', id: shared.id }, label: '', documentation: '', properties: [] };
  state.elements.push(shared);
  state.relationships.push(relationship);
  source.occurrences.push(occurrence);
  for (let i = 0; i < 100; i++) source.connections.push({ id: newId('conn'), relationshipId: relationship.id,
    source: { kind: 'occurrence', id: occurrence.id }, target: { kind: 'occurrence', id: occurrence.id },
    routePoints: (Array.from({ length: LIMITS.routePoints }, (_, index) => ({ x: index, y: -1 }))).map(point => ({ kind: 'bend', point })), labelPosition: null, style: {} });
  state.views.push(source);
  const store = createStore(state);
  const files = store.exportFiles();
  assert.ok(files.length * 2 < LIMITS.files);
  assert.ok(files.reduce((total, file) => total + byteLength(file.content), 0) * 2 < LIMITS.totalBytes);
  historyOnBothSides(store);
  const before = persisted(store), result = run(store, { type: 'duplicateView', viewId: source.view.id, name: 'Copy' });
  const after = persisted(store), copy = viewById(after.snapshot, result.created.viewId);
  const nodes = value => 1 + (value && typeof value === 'object' ? Object.values(value).reduce((total, child) => total + nodes(child), 0) : 0);
  assert.ok(nodes(after.snapshot) > 100000 && nodes(after.snapshot) < LIMITS.nodes);
  assert.ok(after.files.reduce((total, file) => total + byteLength(file.content), 0) < LIMITS.totalBytes);
  assert.deepEqual(after.snapshot.elements, before.snapshot.elements);
  assert.deepEqual(after.snapshot.relationships, before.snapshot.relationships);
  assert.deepEqual(after.snapshot.views[0], before.snapshot.views[0]);
  assert.deepEqual(copy.connections.map(item => item.routePoints), source.connections.map(item => item.routePoints));
  assert.deepEqual(store.history, { undo: before.history.undo + 1, redo: 0 });
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
  assert.deepEqual(store.snapshot, before.snapshot);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), after.files);
});
