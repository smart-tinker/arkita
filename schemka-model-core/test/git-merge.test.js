import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, importFiles, mergeProjectFiles } from '../src/index.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { customizationProject } from '../fixtures/customization-project.js';
import { fixtureId } from '../fixtures/relationship-project.js';
import { viewpointDefinition, viewpointId } from '../fixtures/viewpoint-project.js';

const clone = value => structuredClone(value);
const files = exportFiles;
const merge = (base, local, remote, resolution) => mergeProjectFiles(files(base), files(local), files(remote), resolution);
const run = (store, command) => store.execute(command, store.revision);
const capture = store => ({ files: store.exportFiles(), history: store.history, revision: store.revision });
const elementPath = state => `model/elements/${state.elements[0].id}.json`;
function removeFirstElement(state) {
  const store = createStore(state);
  run(store, { type: 'deleteElementFromModel', elementId: state.elements[0].id });
  return store.snapshot;
}
function addRelationship(state) {
  state.relationships.push({ id: fixtureId('rel', 500), type: 'Association', label: 'New relationship', documentation: '', properties: [],
    source: { kind: 'element', id: fixtureId('el', 1) }, target: { kind: 'element', id: fixtureId('el', 2) } });
}
function conflictsFixture() {
  const base = conceptProject(), local = clone(base), remote = clone(base);
  local.elements[0].name = 'Local element'; remote.elements[0].name = 'Remote element';
  local.views[0].view.name = 'Local view'; remote.views[0].view.name = 'Remote view';
  return { base, local, remote, element: elementPath(base), view: `views/${base.views[0].view.id}/view.json` };
}

test('independent record edits, additions and deletions merge without changing input or stable IDs', () => {
  const base = conceptProject(), local = clone(base), remote = clone(base);
  local.elements[0].name = 'Local name';
  local.views.pop();
  remote.views[0].occurrences[0].bounds.x = 400.5;
  remote.elements.push({ ...clone(base.elements[1]), id: fixtureId('el', 99), name: 'New unshown object' });
  const expected = clone(remote); expected.elements[0].name = local.elements[0].name; expected.views.pop();
  const inputs = [files(base), files(local), files(remote)], before = clone(inputs);
  const result = mergeProjectFiles(...inputs);
  assert.deepEqual(result, { files: files(expected), conflicts: [], structuralError: null });
  assert.deepEqual(inputs, before);
  assert.deepEqual(files(importFiles(result.files)), result.files);
  result.files[0].content = 'detached';
  assert.deepEqual(inputs, before);
});

test('identical edits and removals merge canonically regardless of key order, whitespace or input file order', () => {
  const base = conceptProject(), edited = clone(base);
  edited.elements[0].name = 'Both changed'; edited.views.pop();
  const scrambled = files(edited).reverse().map(file => ({ ...file, content: JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(file.content)).reverse())) }));
  assert.deepEqual(mergeProjectFiles(files(base), files(edited), scrambled), { files: files(edited), conflicts: [], structuralError: null });
  assert.deepEqual(merge(base, base, base), { files: files(base), conflicts: [], structuralError: null });
});

test('conflicts retain exact canonical base/local/remote records and require every choice', () => {
  const { base, local, remote, element, view } = conflictsFixture();
  const result = merge(base, local, remote);
  assert.equal(result.files, null); assert.equal(result.structuralError, null);
  assert.deepEqual(result.conflicts.map(item => item.path), [element, view].sort());
  const conflict = result.conflicts.find(item => item.path === element);
  assert.equal(conflict.label, 'Элемент: Local element');
  for (const [key, state] of Object.entries({ base, local, remote })) assert.equal(conflict[key], files(state).find(file => file.path === element).content);
  const partial = merge(base, local, remote, { records: { [element]: 'local' } });
  assert.equal(partial.files, null); assert.deepEqual(partial.conflicts, result.conflicts);
  const expected = clone(local); expected.views[0].view.name = remote.views[0].view.name;
  const resolved = merge(base, local, remote, { records: { [element]: 'local', [view]: 'remote' } });
  assert.deepEqual(resolved.files, files(expected)); assert.equal(resolved.structuralError, null);
  assert.deepEqual(resolved.conflicts, result.conflicts);
});

test('modify/delete conflicts distinguish absent records and allow either explicit outcome', () => {
  const base = conceptProject(), modified = clone(base), deleted = removeFirstElement(base), path = elementPath(base);
  modified.elements[0].name = 'Retained by explicit decision';
  for (const [local, remote, deletedSide, keptSide] of [[modified, deleted, 'remote', 'local'], [deleted, modified, 'local', 'remote']]) {
    const result = merge(base, local, remote);
    assert.equal(result.files, null); assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0][deletedSide], null);
    assert.equal(JSON.parse(result.conflicts[0][keptSide]).name, modified.elements[0].name);
    assert.deepEqual(merge(base, local, remote, { records: { [path]: deletedSide } }).files, files(deleted));
    const expected = clone(deleted); expected.elements.push(modified.elements[0]);
    assert.deepEqual(merge(base, local, remote, { records: { [path]: keptSide } }).files, files(expected));
  }
});

test('concurrent additions of the same stable ID conflict with an absent base; identical additions do not', () => {
  const base = conceptProject(), local = clone(base), remote = clone(base);
  const added = { ...clone(base.elements[0]), id: fixtureId('el', 99), name: 'Local addition' };
  local.elements.push(added); remote.elements.push({ ...added, name: 'Remote addition' });
  const result = merge(base, local, remote), path = `model/elements/${added.id}.json`;
  assert.equal(result.conflicts.length, 1); assert.equal(result.conflicts[0].base, null); assert.equal(result.conflicts[0].path, path);
  assert.deepEqual(merge(base, local, remote, { records: { [path]: 'remote' } }).files, files(remote));
  assert.deepEqual(merge(base, local, local), { files: files(local), conflicts: [], structuralError: null });
});

test('a graph conflict without textual conflicts returns no partial model; whole-side choice stays explicit', () => {
  const base = conceptProject(), local = removeFirstElement(base), remote = clone(base);
  addRelationship(remote);
  const result = merge(base, local, remote);
  assert.equal(result.files, null); assert.deepEqual(result.conflicts, []);
  assert.match(result.structuralError, /REFERENCE/);
  for (const [whole, state] of [['local', local], ['remote', remote]]) {
    assert.deepEqual(merge(base, local, remote, { whole }), { files: files(state), conflicts: [], structuralError: null });
  }
});

test('resolved records still require complete graph validation, including delete versus new dependency', () => {
  const base = conceptProject(), local = removeFirstElement(base), remote = clone(base), path = elementPath(base);
  remote.elements[0].name = 'Remote changed'; addRelationship(remote);
  const invalid = merge(base, local, remote, { records: { [path]: 'local' } });
  assert.equal(invalid.files, null); assert.match(invalid.structuralError, /REFERENCE/);
  const valid = merge(base, local, remote, { records: { [path]: 'remote' } });
  assert.equal(valid.structuralError, null); assert.ok(valid.files);
  assert.equal(importFiles(valid.files).relationships.find(item => item.id === fixtureId('rel', 500)).source.id, base.elements[0].id);
});

test('merge preserves optional profiles, applications, viewpoints, multiplicities and connection anchors exactly', () => {
  const base = customizationProject({ enabled: { type: 'Boolean', default: true }, count: { type: 'Integer' }, tags: { type: { kind: 'List', itemType: 'String' } } });
  base.elements[0].profileApplications[0].values = { enabled: false, count: 0, tags: ['<literal>', ''] };
  base.viewpoints = [{ id: viewpointId, ...viewpointDefinition() }]; base.views[0].view.viewpointId = viewpointId;
  base.relationships[1].junctionRole = 'container';
  const local = clone(base), remote = clone(base), expected = clone(base);
  local.customizationProfiles[0].name = expected.customizationProfiles[0].name = 'Local profile';
  remote.viewpoints[0].documentation = expected.viewpoints[0].documentation = 'Remote viewpoint';
  assert.deepEqual(merge(base, local, remote), { files: files(expected), conflicts: [], structuralError: null });
});

test('invalid inputs, different project IDs, and invalid or stale resolutions are rejected', () => {
  const { base, local, remote, element } = conflictsFixture();
  for (const resolution of [
    null, [], { unexpected: 'local' }, { whole: 'base' }, { whole: null }, { whole: 'local', records: {} },
    { records: null }, { records: [] }, { records: 'local' }, { records: { [element]: 'base' } },
    { records: { '../outside': 'local' } }, { records: { 'schemka.json': 'local' } },
    { records: JSON.parse('{"__proto__":"local"}') },
  ]) assert.throws(() => merge(base, local, remote, resolution));
  let getterCalls = 0;
  const getter = {}; Object.defineProperty(getter, 'records', { enumerable: true, get() { getterCalls++; return {}; } });
  assert.throws(() => merge(base, local, remote, getter), { code: 'JSON_VALUE' }); assert.equal(getterCalls, 0);
  const other = createProject('Different project');
  for (const side of [0, 1, 2]) {
    const states = [base, local, remote]; states[side] = other;
    assert.throws(() => merge(...states), { code: 'PROJECT_ID' });
    assert.throws(() => merge(...states, { whole: 'local' }), { code: 'PROJECT_ID' });
    const inputs = [files(base), files(local), files(remote)]; inputs[side] = [];
    assert.throws(() => mergeProjectFiles(...inputs));
    assert.throws(() => mergeProjectFiles(...inputs, { whole: 'local' }));
  }
});

test('applyProjectSnapshot is one ordinary undoable command with exact bytes, detached inputs and union of affected views', () => {
  const initial = customizationProject(), replacement = conceptProject();
  initial.viewpoints = [{ id: viewpointId, ...viewpointDefinition() }]; initial.views[0].view.viewpointId = viewpointId;
  replacement.project.name = 'Merged project'; replacement.elements[0].name = 'Merged element';
  replacement.views[1].view.id = fixtureId('view', 99);
  const store = createStore(initial), before = store.exportFiles(), after = files(replacement);
  const command = { type: 'applyProjectSnapshot', files: clone(after) };
  const result = run(store, command);
  assert.deepEqual(result, { command: command.type, created: {}, affectedViewIds: [fixtureId('view', 1), fixtureId('view', 2), fixtureId('view', 99)], revision: 1 });
  assert.deepEqual(store.exportFiles(), after); assert.deepEqual(store.history, { undo: 1, redo: 0 });
  assert.equal(Object.hasOwn(store.snapshot, 'viewpoints'), false); assert.equal(Object.hasOwn(store.snapshot, 'customizationProfiles'), false);
  command.files[0].content = 'mutated after command'; assert.deepEqual(store.exportFiles(), after);
  assert.deepEqual(store.undo(1), { ...result, revision: 2, action: 'undo' }); assert.deepEqual(store.exportFiles(), before);
  assert.deepEqual(store.redo(2), { ...result, revision: 3, action: 'redo' }); assert.deepEqual(store.exportFiles(), after);
  run(store, { type: 'applyProjectSnapshot', files: before }); assert.deepEqual(store.exportFiles(), before);
  assert.deepEqual(store.snapshot.viewpoints, initial.viewpoints); assert.deepEqual(store.snapshot.customizationProfiles, initial.customizationProfiles);
});

test('applyProjectSnapshot rejects stale revisions, incomplete graphs and malformed commands atomically with both histories retained', () => {
  const store = createStore(conceptProject());
  run(store, { type: 'renameProject', name: 'Past' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const valid = store.exportFiles(), command = { type: 'applyProjectSnapshot', files: valid }, before = capture(store);
  const invalid = valid.filter(file => file.path !== elementPath(store.snapshot));
  for (const malformed of [
    { type: command.type }, { ...command, extra: true }, { ...command, files: null },
    { ...command, files: invalid }, { ...command, files: files(createProject('Other project')) },
  ]) { assert.throws(() => run(store, malformed)); assert.deepEqual(capture(store), before); }
  assert.throws(() => store.execute(command, store.revision - 1), { code: 'REVISION' }); assert.deepEqual(capture(store), before);
  const empty = createProject('Empty replacement'); empty.project.id = store.snapshot.project.id;
  const result = run(store, { type: command.type, files: files(empty) });
  assert.deepEqual(result.affectedViewIds, before.files.filter(file => file.path.endsWith('/view.json')).map(file => JSON.parse(file.content).id).sort());
  assert.deepEqual(store.history, { undo: 2, redo: 0 }); assert.deepEqual(store.exportFiles(), files(empty));
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
});
