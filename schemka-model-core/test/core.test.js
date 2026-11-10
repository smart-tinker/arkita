import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createProject, createStore, deletionImpact, exportFiles, importFiles, validateProject, LIMITS, SchemkaError } from '../src/index.js';
import { canonicalJSON, parseJSON, assertJSON } from '../src/json.js';
import { newId } from '../src/format.js';

async function readFixture(path = fileURLToPath(new URL('../fixtures/two-views/', import.meta.url)), prefix = '') {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await readFixture(`${path}/${entry.name}`, `${prefix}${entry.name}/`));
    else result.push({ path: `${prefix}${entry.name}`, content: await readFile(`${path}/${entry.name}`, 'utf8') });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
const fixture = await readFixture();
const fresh = () => importFiles(fixture);
const clone = (value) => structuredClone(value);
const run = (store, command) => store.execute(command, store.revision);
function ids(state = fresh()) {
  const a = state.views.find((entry) => entry.view.name === 'Обзор');
  const b = state.views.find((entry) => entry.view.name === 'Детали');
  const relationship = state.relationships[0];
  const element = state.elements.find((item) => item.id === relationship.source.id);
  const oa = a.occurrences.find((item) => item.concept.id === element.id);
  const ob = b.occurrences.find((item) => item.concept.id === element.id);
  return { a, b, relationship, element, oa, ob };
}
function error(code) { return (value) => value instanceof SchemkaError && value.code === code; }
function editFile(files, path, edit) {
  const result = clone(files);
  const file = result.find((item) => item.path === path);
  const value = JSON.parse(file.content);
  edit(value);
  file.content = JSON.stringify(value);
  return result;
}
function unchangedAfter(store, action, code) {
  const before = { files: store.exportFiles(), revision: store.revision, history: store.history };
  assert.throws(action, code ? error(code) : SchemkaError);
  assert.deepEqual({ files: store.exportFiles(), revision: store.revision, history: store.history }, before);
}

test('new projects and created entities use stable lowercase cryptographic UUIDv4 IDs', () => {
  const one = createProject('Одинаковое имя');
  const two = createProject('Одинаковое имя');
  assert.notEqual(one.project.id, two.project.id);
  assert.match(one.project.id, /^prj-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(exportFiles(importFiles(exportFiles(one))), exportFiles(one));
  assert.throws(() => newId('future'), error('ID'));
});

test('full command creation flow creates two views sharing one relationship', () => {
  const store = createStore(createProject('Пример'));
  const a = run(store, { type: 'createView', name: 'A' }).created.viewId;
  const b = run(store, { type: 'createView', name: 'B' }).created.viewId;
  const bounds = { x: 0, y: 0, width: 10, height: 10 };
  const source = run(store, { type: 'createElementAndOccurrence', elementType: 'ApplicationComponent', viewId: a, name: 'Повтор', bounds }).created;
  const target = run(store, { type: 'createElementAndOccurrence', elementType: 'ApplicationComponent', viewId: a, name: 'Повтор', bounds }).created;
  assert.notEqual(source.elementId, target.elementId);
  const relationship = run(store, { type: 'createRelationshipAndConnection', relationshipType: 'Association', viewId: a,
    source: { kind: 'occurrence', id: source.occurrenceId }, target: { kind: 'occurrence', id: target.occurrenceId }, label: '' }).created;
  const sourceB = run(store, { type: 'addOccurrence', viewId: b, concept: { kind: 'element', id: source.elementId }, bounds }).created;
  const targetB = run(store, { type: 'addOccurrence', viewId: b, concept: { kind: 'element', id: target.elementId }, bounds }).created;
  run(store, { type: 'addConnection', viewId: b, relationshipId: relationship.relationshipId,
    source: { kind: 'occurrence', id: sourceB.occurrenceId }, target: { kind: 'occurrence', id: targetB.occurrenceId  }});
  assert.equal(store.snapshot.views.length, 2);
  assert.equal(store.snapshot.elements.length, 2);
  assert.equal(store.snapshot.relationships.length, 1);
  assert.equal(store.snapshot.views[1].connections.length, 1);
  bounds.x = 999;
  assert.equal(store.snapshot.views[0].occurrences[0].bounds.x, 0);
});

test('fixture is complete, canonical and round-trips every supported field', () => {
  const state = fresh();
  assert.equal(fixture.length, 12);
  assert.equal(state.views.length, 2);
  assert.equal(state.elements.length, 2);
  assert.equal(state.relationships.length, 1);
  const upgraded = exportFiles(state);
  assert.equal(state.project.formatVersion, 4);
  assert.deepEqual(upgraded.map(item => item.path), fixture.map(item => item.path).sort());
  for (const file of fixture) {
    const value = JSON.parse(file.content);
    if (Object.hasOwn(value, 'properties')) value.properties = Object.entries(value.properties).map(([key, value]) => ({ key, value }));
    if (file.path === 'schemka.json') Object.assign(value, { formatVersion: 4, documentation: '', properties: [] });
    if (file.path.startsWith('model/relationships/')) value.documentation = '';
    if (file.path.endsWith('/view.json')) value.properties = [];
    if (file.path.includes('/occurrences/')) { delete value.parentOccurrenceId; value.parent = null; value.style = {}; }
    if (file.path.includes('/connections/')) value.style = {};
    assert.equal(upgraded.find(item => item.path === file.path).content, canonicalJSON(value));
  }
  assert.deepEqual(exportFiles(importFiles(upgraded)), upgraded);
  assert.deepEqual(exportFiles(importFiles([...fixture].reverse())), exportFiles(state));
  assert.equal(ids(state).a.connections[0].labelPosition.y, 55.5);
  assert.deepEqual(ids(state).a.connections[0].routePoints, [{ kind: 'bend', point: { x: 260, y: 70 } }, { kind: 'bend', point: { x: 300, y: 70 } }]);
  const serialized = JSON.stringify(exportFiles(state));
  for (const sessionOnly of ['updatedAt', 'revision', 'viewport', 'history']) assert.ok(!serialized.includes(sessionOnly));
});

test('rename is shared while movement changes only one occurrence', () => {
  const store = createStore(fresh());
  const { a, b, element, oa, ob } = ids();
  const before = store.exportFiles();
  const renamed = run(store, { type: 'renameElement', elementId: element.id, name: 'Новое имя' });
  assert.deepEqual(renamed.affectedViewIds, [a.view.id, b.view.id].sort());
  const afterRename = store.exportFiles();
  assert.deepEqual(afterRename.filter((file, i) => file.content !== before[i].content).map((file) => file.path), [`model/elements/${element.id}.json`]);
  run(store, { type: 'moveOccurrence', viewId: a.view.id, occurrenceId: oa.id, x: -12.3, y: 42.1 });
  const moved = ids(store.snapshot);
  assert.equal(moved.oa.bounds.x, -12.3);
  assert.deepEqual(moved.ob.bounds, ob.bounds);
  assert.equal(moved.element.name, 'Новое имя');
  assert.deepEqual(store.exportFiles().filter((file, i) => file.content !== afterRename[i].content).map((file) => file.path), [`views/${a.view.id}/occurrences/${oa.id}.json`]);
});

const renameCases = [
  {
    type: 'renameProject', field: 'name',
    command: () => ({ type: 'renameProject', name: 'Модель 🧩' }),
    target: (state) => state.project,
    path: () => 'schemka.json',
    affected: (state) => state.views.map((entry) => entry.view.id).sort(),
  },
  {
    type: 'renameView', field: 'name', idField: 'viewId',
    command: (state) => ({ type: 'renameView', viewId: state.views[0].view.id, name: 'Вид 🧩' }),
    target: (state) => state.views[0].view,
    path: (state) => `views/${state.views[0].view.id}/view.json`,
    affected: (state) => [state.views[0].view.id],
  },
  {
    type: 'renameRelationship', field: 'label', idField: 'relationshipId',
    command: (state) => ({ type: 'renameRelationship', relationshipId: state.relationships[0].id, label: 'Связь 🧩' }),
    target: (state) => state.relationships[0],
    path: (state) => `model/relationships/${state.relationships[0].id}.json`,
    affected: (state) => state.views.map((entry) => entry.view.id).sort(),
  },
];

for (const example of renameCases) {
  test(`${example.type} changes exactly one field/file, preserving IDs and canonical bytes through undo/redo`, () => {
    const initial = fresh();
    // Input collection order must not affect notification order or canonical output.
    initial.views.sort((a, b) => a.view.id < b.view.id ? 1 : -1);
    const store = createStore(initial);
    const before = store.exportFiles();
    const command = example.command(initial);
    const expected = clone(initial);
    example.target(expected)[example.field] = command[example.field];
    const result = run(store, command);
    assert.deepEqual(result, { command: example.type, created: {}, affectedViewIds: example.affected(initial), revision: 1 });
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    const after = store.exportFiles();
    assert.deepEqual(after.map((file) => file.path), before.map((file) => file.path));
    assert.deepEqual(after.filter((file, i) => file.content !== before[i].content).map((file) => file.path), [example.path(initial)]);
    assert.deepEqual(after, exportFiles(expected));
    assert.deepEqual(exportFiles(importFiles(after)), after);
    assert.deepEqual(store.undo(1), { ...result, revision: 2, action: 'undo' });
    assert.deepEqual(store.snapshot, initial);
    assert.deepEqual(store.exportFiles(), before);
    assert.deepEqual(store.history, { undo: 0, redo: 1 });
    assert.deepEqual(store.redo(2), { ...result, revision: 3, action: 'redo' });
    assert.deepEqual(store.snapshot, expected);
    assert.deepEqual(store.exportFiles(), after);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
  });

  test(`${example.type} accepts bounded and empty text; no-op is a revision and new rename clears redo`, () => {
    const initial = fresh();
    const store = createStore(initial);
    const command = example.command(initial);
    const before = store.exportFiles();
    run(store, { ...command, [example.field]: example.target(initial)[example.field] });
    assert.deepEqual(store.exportFiles(), before);
    assert.equal(store.revision, 1);
    assert.deepEqual(store.history, { undo: 1, redo: 0 });
    run(store, { ...command, [example.field]: 'x'.repeat(LIMITS.string) });
    assert.equal(example.target(store.snapshot)[example.field].length, LIMITS.string);
    store.undo(store.revision);
    assert.deepEqual(store.history, { undo: 1, redo: 1 });
    run(store, { ...command, [example.field]: '' });
    assert.equal(example.target(store.snapshot)[example.field], '');
    assert.equal(store.revision, 4);
    assert.deepEqual(store.history, { undo: 2, redo: 0 });
  });

  test(`${example.type} rejects stale and malformed commands atomically with both history stacks retained`, () => {
    const initial = fresh();
    const store = createStore(initial);
    const command = example.command(initial);
    run(store, command);
    run(store, { ...command, [example.field]: 'Undo this rename' });
    store.undo(store.revision);
    assert.deepEqual(store.history, { undo: 1, redo: 1 });
    for (const revision of [0, 2, 4, undefined, null, -1, 0.5, NaN, Infinity, '3']) {
      unchangedAfter(store, () => store.execute(command, revision), 'REVISION');
    }
    const missingText = clone(command);
    delete missingText[example.field];
    unchangedAfter(store, () => run(store, missingText), 'SCHEMA');
    unchangedAfter(store, () => run(store, { ...command, extra: true }), 'SCHEMA');
    for (const value of [null, 1, true, [], {}, 'x'.repeat(LIMITS.string + 1)]) {
      unchangedAfter(store, () => run(store, { ...command, [example.field]: value }), 'SCHEMA');
    }
    unchangedAfter(store, () => run(store, { ...command, [example.field]: undefined }), 'JSON_VALUE');
    if (example.idField) {
      const missingId = clone(command);
      delete missingId[example.idField];
      unchangedAfter(store, () => run(store, missingId), 'SCHEMA');
      for (const id of ['missing', initial.project.id, null, 1, {}, []]) {
        unchangedAfter(store, () => run(store, { ...command, [example.idField]: id }), 'REFERENCE');
      }
    } else {
      unchangedAfter(store, () => run(store, { ...command, projectId: initial.project.id }), 'SCHEMA');
    }
    const redo = store.redo(store.revision);
    assert.equal(redo.action, 'redo');
    assert.equal(example.target(store.snapshot)[example.field], 'Undo this rename');
  });
}

test('relationship rename notifies only connected views once, and also works without connections', () => {
  const store = createStore(fresh());
  const { a, b, relationship } = ids();
  run(store, { type: 'removeConnection', viewId: b.view.id, connectionId: b.connections[0].id });
  const duplicate = run(store, { type: 'addConnection', viewId: a.view.id, relationshipId: relationship.id,
    source: { kind: 'occurrence', id: a.connections[0].source.id }, target: { kind: 'occurrence', id: a.connections[0].target.id  }}).created;
  run(store, { type: 'createView', name: 'Unrelated' });
  assert.deepEqual(run(store, { type: 'renameRelationship', relationshipId: relationship.id, label: 'Shared' }).affectedViewIds, [a.view.id]);
  run(store, { type: 'removeConnection', viewId: a.view.id, connectionId: a.connections[0].id });
  run(store, { type: 'removeConnection', viewId: a.view.id, connectionId: duplicate.connectionId });
  assert.deepEqual(run(store, { type: 'renameRelationship', relationshipId: relationship.id, label: 'Hidden' }).affectedViewIds, []);
  assert.equal(store.snapshot.relationships[0].label, 'Hidden');
});

test('project rename accepts a project without views', () => {
  const store = createStore(createProject('Empty'));
  const initial = store.snapshot;
  assert.deepEqual(run(store, { type: 'renameProject', name: 'Renamed' }), {
    command: 'renameProject', created: {}, affectedViewIds: [], revision: 1,
  });
  assert.deepEqual(store.snapshot, { ...initial, project: { ...initial.project, name: 'Renamed' } });
});

test('multiple occurrences in one view, parallel relationships and self-links are explicit', () => {
  const store = createStore(fresh());
  const { a, oa, element } = ids();
  const duplicate = run(store, { type: 'addOccurrence', viewId: a.view.id, concept: { kind: 'element', id: element.id }, bounds: oa.bounds }).created;
  assert.notEqual(duplicate.occurrenceId, oa.id);
  for (let i = 0; i < 2; i++) run(store, { type: 'createRelationshipAndConnection', relationshipType: 'Association', viewId: a.view.id,
    source: { kind: 'occurrence', id: oa.id }, target: { kind: 'occurrence', id: duplicate.occurrenceId }, label: '' });
  assert.equal(store.snapshot.relationships.length, 3);
});

test('removing one occurrence preserves its model, relationship and other view', () => {
  const store = createStore(fresh());
  const before = store.exportFiles();
  const { a, b, oa } = ids();
  run(store, { type: 'removeOccurrence', viewId: a.view.id, occurrenceId: oa.id });
  const state = store.snapshot;
  assert.equal(state.elements.length, 2);
  assert.equal(state.relationships.length, 1);
  assert.equal(state.views.find((entry) => entry.view.id === a.view.id).connections.length, 0);
  assert.deepEqual(state.views.find((entry) => entry.view.id === b.view.id), clone(b));
  store.undo(store.revision);
  assert.deepEqual(store.exportFiles(), before);
});

test('element deletion previews dependencies, cascades atomically and restores exact IDs/layout on undo', () => {
  const store = createStore(fresh());
  const before = store.exportFiles();
  const { element } = ids();
  const impact = deletionImpact(store.snapshot, { kind: 'element', id: element.id });
  assert.equal(impact.viewIds.length, 2);
  assert.equal(impact.occurrenceIds.length, 2);
  assert.equal(impact.connectionIds.length, 2);
  assert.equal(impact.relationshipIds.length, 1);
  assert.deepEqual(run(store, { type: 'deleteElementFromModel', elementId: element.id }).impact, impact);
  const deleted = store.exportFiles();
  assert.equal(store.snapshot.elements.length, 1);
  assert.equal(store.snapshot.relationships.length, 0);
  assert.ok(store.snapshot.views.every((entry) => entry.occurrences.length === 1 && !entry.connections.length));
  store.undo(store.revision);
  assert.deepEqual(store.exportFiles(), before);
  store.redo(store.revision);
  assert.deepEqual(store.exportFiles(), deleted);
});

test('connection removal is local; model relationship deletion removes all its connections only', () => {
  const store = createStore(fresh());
  const before = store.exportFiles();
  const { a, relationship } = ids();
  run(store, { type: 'removeConnection', viewId: a.view.id, connectionId: a.connections[0].id });
  assert.equal(store.snapshot.relationships.length, 1);
  assert.equal(store.snapshot.views.reduce((sum, entry) => sum + entry.connections.length, 0), 1);
  store.undo(store.revision);
  assert.deepEqual(store.exportFiles(), before);
  const result = run(store, { type: 'deleteRelationshipFromModel', relationshipId: relationship.id });
  assert.equal(result.impact.connectionIds.length, 2);
  assert.equal(store.snapshot.relationships.length, 0);
  assert.equal(store.snapshot.elements.length, 2);
  assert.ok(store.snapshot.views.every((entry) => entry.occurrences.length === 2 && !entry.connections.length));
  store.undo(store.revision);
  assert.deepEqual(store.exportFiles(), before);
});

test('undo/redo are one session history, monotonic revisions; new command clears redo', () => {
  const store = createStore(fresh());
  const { a, b, oa, ob } = ids();
  run(store, { type: 'moveOccurrence', viewId: a.view.id, occurrenceId: oa.id, x: 1, y: 2 });
  run(store, { type: 'moveOccurrence', viewId: b.view.id, occurrenceId: ob.id, x: 3, y: 4 });
  assert.deepEqual(store.undo(2).affectedViewIds, [b.view.id]);
  assert.deepEqual(store.undo(3).affectedViewIds, [a.view.id]);
  assert.equal(store.redo(4).revision, 5);
  run(store, { type: 'renameElement', elementId: oa.concept.id, name: 'X' });
  assert.deepEqual(store.history, { undo: 2, redo: 0 });
  unchangedAfter(store, () => store.redo(store.revision), 'HISTORY');
});

test('loading starts a new history boundary, increments revision and rejects old clients', () => {
  const store = createStore(fresh());
  run(store, { type: 'createView', name: 'Temporary' });
  assert.deepEqual(store.load(fixture, 1), { revision: 2 });
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
  unchangedAfter(store, () => store.undo(2), 'HISTORY');
  unchangedAfter(store, () => store.execute({ type: 'createView', name: 'Stale' }, 1), 'REVISION');
  assert.deepEqual(store.exportFiles(), exportFiles(fresh()));
});

test('stale/missing revisions cannot execute, undo, redo or load', () => {
  const store = createStore(fresh());
  for (const revision of [undefined, null, -1, 0.5, 1, NaN, Infinity, '0']) {
    for (const action of [() => store.execute({ type: 'createView', name: '' }, revision), () => store.undo(revision),
      () => store.redo(revision), () => store.load(fixture, revision)]) unchangedAfter(store, action, 'REVISION');
  }
});

test('failed command/import preserves state, both history stacks and revision', () => {
  const store = createStore(fresh());
  const { a, b, oa, element, relationship } = ids();
  run(store, { type: 'renameElement', elementId: element.id, name: 'Saved' });
  run(store, { type: 'createView', name: 'Undo me' });
  store.undo(store.revision);
  const badCommands = [
    {}, null, [], { type: 'patch', patch: {} },
    { type: 'renameElement', elementId: element.id },
    { type: 'renameElement', elementId: element.id, name: 'Ignored?', extra: 1 },
    { type: 'renameElement', elementId: 'missing', name: 'X' },
    { type: 'createElementAndOccurrence', elementType: 'ApplicationComponent', viewId: a.view.id, name: '', bounds: { ...oa.bounds, width: 0 } },
    { type: 'createView', name: 'X', documentation: null },
    { type: 'createView', name: 'X', documentation: undefined },
    { type: 'createElementAndOccurrence', elementType: 'ApplicationComponent', viewId: a.view.id, name: '', bounds: oa.bounds, properties: null },
    { type: 'addOccurrence', viewId: a.view.id, concept: { kind: 'element', id: element.id }, bounds: oa.bounds, zIndex: null },
    { type: 'createRelationshipAndConnection', relationshipType: 'Association', viewId: a.view.id, source: { kind: 'occurrence', id: oa.id }, target: { kind: 'occurrence', id: 'missing' }, label: '' },
    { type: 'addConnection', viewId: b.view.id, relationshipId: relationship.id, source: { kind: 'occurrence', id: oa.id }, target: { kind: 'occurrence', id: oa.id  }},
    { type: 'removeOccurrence', viewId: 'missing', occurrenceId: oa.id },
    { type: 'deleteRelationshipFromModel', relationshipId: 'missing' },
  ];
  for (const command of badCommands) unchangedAfter(store, () => store.execute(command, store.revision));
  unchangedAfter(store, () => store.load([{ path: 'schemka.json', content: '{' }], store.revision), 'JSON_SYNTAX');
});

test('snapshots, initial inputs and result objects cannot mutate stored state or history', () => {
  const initial = fresh();
  const store = createStore(initial);
  initial.elements[0].name = 'Outside';
  const snapshot = store.snapshot;
  snapshot.elements[0].name = 'Outside';
  snapshot.views.length = 0;
  assert.notEqual(store.snapshot.elements[0].name, 'Outside');
  const result = run(store, { type: 'createView', name: 'New' });
  result.affectedViewIds.length = 0;
  assert.equal(store.undo(store.revision).affectedViewIds.length, 1);
});

const graphCases = [
  ['future root field', (s) => { s.future = true; }, 'SCHEMA'],
  ['missing field', (s) => { delete s.elements[0].documentation; }, 'SCHEMA'],
  ['future element field', (s) => { s.elements[0].future = 1; }, 'SCHEMA'],
  ['future format', (s) => { s.project.formatVersion = 5; }, 'VERSION'],
  ['foreign format', (s) => { s.project.format = 'skhemka-source'; }, 'VERSION'],
  ['future profile', (s) => { s.project.metamodel.version = 3; }, 'VERSION'],
  ['unknown element type', (s) => { s.elements[0].type = 'UnknownElement'; }, 'TYPE'],
  ['future relationship', (s) => { s.relationships[0].type = 'UnknownRelationship'; }, 'TYPE'],
  ['UUID wrong version', (s) => { s.project.id = 'prj-11111111-1111-1111-8111-111111111111'; }, 'ID'],
  ['UUID uppercase', (s) => { s.project.id = s.project.id.toUpperCase(); }, 'ID'],
  ['duplicate element', (s) => { s.elements.push(clone(s.elements[0])); }, 'DUPLICATE_ID'],
  ['duplicate view', (s) => { s.views.push(clone(s.views[0])); }, 'DUPLICATE_ID'],
  ['duplicate occurrence across views', (s) => { s.views[1].occurrences[0].id = s.views[0].occurrences[0].id; }, 'DUPLICATE_ID'],
  ['duplicate connection', (s) => { s.views[0].connections.push(clone(s.views[0].connections[0])); }, 'DUPLICATE_ID'],
  ['dangling relationship endpoint', (s) => { s.relationships[0].source.id = 'missing'; }, 'REFERENCE'],
  ['unsupported endpoint kind', (s) => { s.relationships[0].source.kind = 'relationship'; }, 'REFERENCE'],
  ['dangling occurrence', (s) => { s.views[0].occurrences[0].concept.id = 'missing'; }, 'REFERENCE'],
  ['cyclic nesting', (s) => { s.views[0].occurrences[0].parent = { kind: 'occurrence', id: s.views[0].occurrences[0].id }; }, 'REFERENCE'],
  ['dangling relationship connection', (s) => { s.views[0].connections[0].relationshipId = 'missing'; }, 'REFERENCE'],
  ['foreign-view connection endpoint', (s) => { s.views[0].connections[0].source.id = s.views[1].occurrences[0].id; }, 'REFERENCE'],
  ['reversed endpoint mapping', (s) => { const c = s.views[0].connections[0]; [c.source.id, c.target.id] = [c.target.id, c.source.id]; }, 'REFERENCE'],
  ['non-string property', (s) => { s.elements[0].properties = { value: 1 }; }, 'SCHEMA'],
  ['long text', (s) => { s.elements[0].name = 'x'.repeat(LIMITS.string + 1); }, 'SCHEMA'],
  ['many properties', (s) => { s.elements[0].properties = Array.from({ length: LIMITS.properties + 1 }, (_, i) => ({ key: `p${i}`, value: '' })); }, 'LIMIT'],
  ['fractional z-order', (s) => { s.views[0].occurrences[0].zIndex = 1.5; }, 'GEOMETRY'],
  ['many routePoints', (s) => { s.views[0].connections[0].routePoints = Array.from({ length: LIMITS.routePoints + 1 }, () => ({ x: 0, y: 0 })); }, 'LIMIT'],
];
for (const [name, mutate, code] of graphCases) test(`strict graph rejects ${name}`, () => {
  const state = fresh(); mutate(state);
  assert.throws(() => validateProject(state), error(code));
  assert.throws(() => exportFiles(state), error(code));
});

for (const value of [NaN, Infinity, -Infinity, -0, 0.01, 1000000.1, '1', null]) {
  test(`geometry rejects ${String(value)} (${Object.is(value, -0) ? '-0' : typeof value})`, () => {
    const store = createStore(fresh());
    const { a, oa } = ids();
    unchangedAfter(store, () => run(store, { type: 'moveOccurrence', viewId: a.view.id, occurrenceId: oa.id, x: value, y: 0 }));
  });
}

test('JSON validator rejects coercion, hidden/accessor fields, non-JSON values and unsafe keys', () => {
  const sparse = []; sparse.length = 1;
  const extended = []; extended.extra = 1;
  const hidden = {}; Object.defineProperty(hidden, 'x', { value: 1 });
  const accessor = {}; Object.defineProperty(accessor, 'x', { enumerable: true, get() { throw new Error('Must not run'); } });
  const symbol = { [Symbol('x')]: 1 };
  const cycle = {}; cycle.self = cycle;
  const inherited = Object.create({ x: 1 });
  const arraySubclass = new (class extends Array {})();
  for (const value of [undefined, NaN, Infinity, -0, 1n, () => {}, new Date(), new Map(), sparse, extended, hidden,
    accessor, symbol, cycle, inherited, arraySubclass, JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: 'bad' }, { prototype: 'bad' }]) {
    assert.throws(() => assertJSON(value), SchemkaError);
  }
  assert.equal({}.polluted, undefined);
});

const unsafePaths = ['../schemka.json', '/schemka.json', './schemka.json', 'views//view.json', 'views\\x\\view.json',
  'SCHEMKA.JSON', 'schemka.json/', 'schemka.json\0', 'schemka.json:stream', 'é.json', 'e\u0301.json',
  'views/%2e%2e/schemka.json', 'views/unknown/decorations/x.json'];
for (const path of unsafePaths) test(`import rejects unsafe/unknown path ${JSON.stringify(path)}`, () => {
  assert.throws(() => importFiles([{ path, content: '{}' }]), error('PATH'));
});

test('import rejects duplicate paths, ID/path mismatches, missing view/root and unknown content', () => {
  assert.throws(() => importFiles([...fixture, fixture[0]]), error('DUPLICATE_PATH'));
  const elementFile = fixture.find((file) => file.path.startsWith('model/elements/'));
  assert.throws(() => importFiles(editFile(fixture, elementFile.path, (value) => { value.id = `el-${randomUUID()}`; })), error('PATH_ID'));
  const viewFile = fixture.find((file) => file.path.endsWith('/view.json'));
  assert.throws(() => importFiles(editFile(fixture, viewFile.path, (value) => { value.id = `view-${randomUUID()}`; })), error('PATH_ID'));
  const occurrenceFile = fixture.find((file) => file.path.includes('/occurrences/'));
  assert.throws(() => importFiles(editFile(fixture, occurrenceFile.path, (value) => { value.id = `occ-${randomUUID()}`; })), error('PATH_ID'));
  assert.throws(() => importFiles(fixture.filter((file) => file.path !== viewFile.path)), error('REFERENCE'));
  assert.throws(() => importFiles(fixture.filter((file) => file.path !== 'schemka.json')), error('SCHEMA'));
  assert.throws(() => importFiles(editFile(fixture, elementFile.path, (value) => { value.future = true; })), error('SCHEMA'));
  assert.throws(() => importFiles([{ ...fixture[0], ignored: true }]), error('SCHEMA'));
  assert.throws(() => importFiles([{ path: 1, content: '{}' }]), error('SCHEMA'));
});

for (const [input, code] of [
  ['{"x":1,"x":2}', 'DUPLICATE_KEY'], ['{"name":1,"n\\u0061me":2}', 'DUPLICATE_KEY'],
  ['{"x":{"a":1,"a":2}}', 'DUPLICATE_KEY'], ['{"__proto__":{}}', 'UNSAFE_KEY'],
  ['{"constructor":0}', 'UNSAFE_KEY'], ['{"prototype":0}', 'UNSAFE_KEY'],
  ['', 'JSON_SYNTAX'], ['{', 'JSON_SYNTAX'], ['[1,]', 'JSON_SYNTAX'], ['{"x":1,}', 'JSON_SYNTAX'],
  ['{"x" 1}', 'JSON_SYNTAX'], ['{"x":1 "y":2}', 'JSON_SYNTAX'], ['[1 2]', 'JSON_SYNTAX'],
  ['"unterminated', 'JSON_SYNTAX'], ['"\\q"', 'JSON_SYNTAX'], ['"\n"', 'JSON_SYNTAX'],
  ['01', 'JSON_SYNTAX'], ['1e', 'JSON_SYNTAX'], ['true false', 'JSON_SYNTAX'], ['/*x*/{}', 'JSON_SYNTAX'],
  ['\ufeff{}', 'JSON_SYNTAX'], ['1e999', 'JSON_VALUE'], ['-0', 'JSON_VALUE'], ['-0.0', 'JSON_VALUE'],
]) test(`strict JSON rejects ${JSON.stringify(input)}`, () => assert.throws(() => parseJSON(input), error(code)));

test('strict JSON accepts standard literals, escaped keys/strings, arrays and whitespace', () => {
  const input = ' \r\n {"s":"a\\\\b\\\"c\\n\\u0430","a":[true,false,null,-1.2e3,{},[]]}\t';
  assert.deepEqual(JSON.parse(canonicalJSON(parseJSON(input))), JSON.parse(input));
});

test('canonical encoding sorts all keys by UTF-16 code units, including numeric-looking keys', () => {
  const output = canonicalJSON({ z: ['b', 'a'], properties: { '2': 'two', '10': 'ten', А: 'Cyrillic', a: 'Latin' }, a: {} });
  assert.ok(output.indexOf('"10"') < output.indexOf('"2"'));
  assert.ok(output.indexOf('"a": "Latin"') < output.indexOf('"А"'));
  assert.ok(output.endsWith('\n') && !output.endsWith('\n\n') && !output.includes('\r'));
  assert.equal(canonicalJSON(parseJSON(output)), output);
});

test('bounded input rejects excessive file count, bytes, nesting and total bytes', () => {
  assert.throws(() => importFiles(Array.from({ length: LIMITS.files + 1 }, () => fixture[0])), error('LIMIT'));
  assert.throws(() => parseJSON(' '.repeat(LIMITS.fileBytes + 1)), error('LIMIT'));
  assert.throws(() => parseJSON('['.repeat(LIMITS.depth + 1) + '0' + ']'.repeat(LIMITS.depth + 1)), error('LIMIT'));
  const files = [fixture.find((file) => file.path === 'schemka.json')];
  for (let i = 0; i < 33; i++) {
    const element = { ...fresh().elements[0], id: `el-${randomUUID()}` };
    const content = JSON.stringify(element);
    files.push({ path: `model/elements/${element.id}.json`, content: content + ' '.repeat(LIMITS.fileBytes - Buffer.byteLength(content)) });
  }
  assert.throws(() => importFiles(files), error('LIMIT'));
});

test('canonical output size is checked too; a small input cannot inflate beyond the limit', () => {
  const state = fresh();
  state.elements[0].properties = Array.from({ length: 40 }, (_, i) => ({ key: `key${i}`, value: 'x'.repeat(LIMITS.string) }));
  assert.throws(() => validateProject(state), error('LIMIT'));
});

test('history is bounded and reopening never restores a persisted session counter', () => {
  const store = createStore(createProject('History'));
  for (let i = 0; i <= LIMITS.history; i++) run(store, { type: 'createView', name: String(i) });
  assert.equal(store.history.undo, LIMITS.history);
  const reopened = createStore(importFiles(store.exportFiles()));
  assert.equal(reopened.revision, 0);
  assert.deepEqual(reopened.history, { undo: 0, redo: 0 });
});

test('independent file edits combine without altering identity; validate catches delete/use merges', () => {
  const { a, b, oa, ob, element } = ids();
  const firstPath = `model/elements/${element.id}.json`;
  const secondPath = `views/${b.view.id}/occurrences/${ob.id}.json`;
  const firstBranch = editFile(fixture, firstPath, (value) => { value.name = 'Branch A'; });
  const secondBranch = editFile(fixture, secondPath, (value) => { value.bounds.y = 777; });
  const merged = fixture.map((file) => file.path === firstPath ? firstBranch.find((item) => item.path === firstPath)
    : file.path === secondPath ? secondBranch.find((item) => item.path === secondPath) : file);
  const state = importFiles(merged);
  assert.equal(ids(state).element.name, 'Branch A');
  assert.equal(ids(state).ob.bounds.y, 777);
  assert.deepEqual(ids(state).oa.bounds, oa.bounds);
  assert.deepEqual(exportFiles(importFiles(exportFiles(state))), exportFiles(state));
  assert.throws(() => importFiles(merged.filter((file) => file.path !== firstPath)), error('REFERENCE'));
  const occurrencePath = `views/${a.view.id}/occurrences/${oa.id}.json`;
  assert.throws(() => importFiles(merged.filter((file) => file.path !== occurrencePath)), error('REFERENCE'));
});

test('valid merged graph does not imply conflict-free intent or choose a last writer', () => {
  const { element } = ids();
  const path = `model/elements/${element.id}.json`;
  const ours = editFile(fixture, path, (value) => { value.name = 'Ours'; });
  const theirs = editFile(fixture, path, (value) => { value.name = 'Theirs'; });
  assert.equal(ids(importFiles(ours)).element.name, 'Ours');
  assert.equal(ids(importFiles(theirs)).element.name, 'Theirs');
  assert.notDeepEqual(exportFiles(importFiles(ours)), exportFiles(importFiles(theirs)));
  const conflict = clone(ours);
  conflict.find((file) => file.path === path).content = '<<<<<<< ours\n{}\n=======\n{}\n>>>>>>> theirs\n';
  assert.throws(() => importFiles(conflict), error('JSON_SYNTAX'));
});

test('sparse arrays with out-of-range numeric keys cannot spoof dense JSON arrays', () => {
  const spoof = [];
  spoof.length = 1;
  spoof['4294967295'] = { x: 1, y: 1 };
  assert.throws(() => assertJSON(spoof), error('JSON_VALUE'));
  const state = fresh();
  state.views[0].connections[0].routePoints = spoof;
  assert.throws(() => exportFiles(state), error('JSON_VALUE'));
});

test('aliased input bounds are normalized to independent JSON records before editing', () => {
  const initial = fresh();
  const { a, b, oa, ob } = ids(initial);
  ob.bounds = oa.bounds;
  assert.equal(oa.bounds, ob.bounds);
  const store = createStore(initial);
  const before = ids(store.snapshot).ob.bounds;
  run(store, { type: 'moveOccurrence', viewId: a.view.id, occurrenceId: oa.id, x: 777, y: 555 });
  assert.deepEqual(ids(store.snapshot).ob.bounds, before);
  assert.equal(ids(store.snapshot).oa.bounds.x, 777);
  assert.equal(store.snapshot.views.find((entry) => entry.view.id === b.view.id).occurrences.length, 2);
});

test('explicit null routePoints are not silently defaulted; supported null labelPosition is retained', () => {
  const store = createStore(fresh());
  const { a, relationship } = ids();
  const base = { type: 'addConnection', viewId: a.view.id, relationshipId: relationship.id,
    source: { kind: 'occurrence', id: a.connections[0].source.id }, target: { kind: 'occurrence', id: a.connections[0].target.id  }};
  unchangedAfter(store, () => run(store, { ...base, routePoints: null }), 'SCHEMA');
  run(store, { ...base, labelPosition: null });
  assert.equal(store.snapshot.views.find((entry) => entry.view.id === a.view.id).connections.at(-1).labelPosition, null);
});

test('successful no-op commands still record one revision and undo step', () => {
  const store = createStore(fresh());
  const { element } = ids();
  const before = store.exportFiles();
  run(store, { type: 'renameElement', elementId: element.id, name: element.name });
  assert.equal(store.revision, 1);
  assert.deepEqual(store.history, { undo: 1, redo: 0 });
  assert.deepEqual(store.exportFiles(), before);
});
