import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { catalogTreeIndex, catalogMovePlan, catalogDestinationOptions, destinationSection, folderSectionProperties, FOLDER_SECTION_PROPERTY, CATALOG_SECTIONS } from '../src/catalog-tree.js';

function fixture() {
  const store = createStore(createProject('Tree'));
  const run = command => store.execute(command, store.revision).created;
  const viewId = run({ type: 'createView', name: 'View' }).viewId;
  const common = run({ type: 'createElementInModel', elementType: 'Role', name: 'Role' }).elementId;
  const tech = run({ type: 'createElementInModel', elementType: 'Device', name: 'Device' }).elementId;
  return { store, run, viewId, common, tech };
}
const el = id => ({ kind: 'element', id });

test('mixed imported hierarchy is projected without edits, duplicate concepts or lost ancestors', () => {
  const { store, run, viewId, common, tech } = fixture();
  const parent = run({ type: 'createFolder', name: 'Imported', documentation: 'Original\r\nnotes', properties: [{ key: 'owner', value: 'A' }, { key: 'owner', value: 'B' }] }).folderId;
  const child = run({ type: 'createFolder', name: 'Nested', parentFolderId: parent, members: [el(common), el(tech), { kind: 'view', id: viewId }] }).folderId;
  const before = store.exportFiles(), history = store.history;
  const index = catalogTreeIndex(store.snapshot);
  assert.equal(CATALOG_SECTIONS.length, 9);
  assert.deepEqual([...index.sectionsForFolder.get(parent)].sort(), ['common', 'technology', 'views']);
  assert.deepEqual(index.sectionsForFolder.get(child), index.sectionsForFolder.get(parent));
  assert.equal(index.countsForFolder.get(parent).get('technology'), 1);
  assert.equal(index.counts.get('common'), 1);
  assert.equal(index.owners.get(`element:${common}`), child);
  const projected = CATALOG_SECTIONS.flatMap(section => store.snapshot.folders.flatMap(folder => folder.members.filter(ref => index.sectionFor(ref) === section.id).map(ref => `${ref.kind}:${ref.id}`)));
  assert.equal(projected.length, 3); assert.equal(new Set(projected).size, 3);
  assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, history);
});

test('empty folders inherit a sole branch; a new empty section survives file roundtrip', () => {
  const { store, run, tech } = fixture();
  const parent = run({ type: 'createFolder', name: 'Tech', members: [el(tech)] }).folderId;
  const child = run({ type: 'createFolder', name: 'Empty child', parentFolderId: parent }).folderId;
  const legacy = run({ type: 'createFolder', name: 'Unknown legacy' }).folderId;
  const views = run({ type: 'createFolder', name: 'Empty views', properties: folderSectionProperties(null, 'views') }).folderId;
  const index = catalogTreeIndex(deserializeProjectFile(serializeProjectFile(store.snapshot)));
  assert.deepEqual([...index.sectionsForFolder.get(child)], ['technology']);
  assert.deepEqual([...index.sectionsForFolder.get(legacy)], ['common']);
  assert.deepEqual([...index.sectionsForFolder.get(views)], ['views']);
  assert.equal(destinationSection(store.snapshot, '@views'), 'views');
  assert.equal(destinationSection(store.snapshot, views), 'views');
  assert.equal(destinationSection(store.snapshot, '@invented'), null);
});

test('same-section move is atomic with exact undo; wrong-section/mixed drops leave bytes and history intact', () => {
  const { store, run, common, tech } = fixture();
  const target = run({ type: 'createFolder', name: 'Target', properties: folderSectionProperties(null, 'technology') }).folderId;
  const before = store.exportFiles(), history = store.history;
  for (const [refs, destination] of [[[el(common)], target], [[el(tech)], '@common'], [[el(tech), el(common)], target]]) {
    assert.throws(() => catalogMovePlan(store.snapshot, refs, destination), /раздел/);
    assert.deepEqual(store.exportFiles(), before); assert.deepEqual(store.history, history);
  }
  const plan = catalogMovePlan(store.snapshot, [el(tech)], target);
  assert.equal(plan.unchanged, false);
  run({ type: 'applyProjectSnapshot', files: exportFiles(plan.snapshot) });
  assert.equal(store.history.undo, history.undo + 1);
  assert.equal(store.snapshot.folders.find(folder => folder.id === target).members[0].id, tech);
  const saved = serializeProjectFile(store.snapshot);
  assert.deepEqual(serializeProjectFile(deserializeProjectFile(saved)), saved);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
});

test('folder destination options exclude descendants and movement retains metadata with a typed root', () => {
  const { store, run, tech } = fixture();
  const source = run({ type: 'createFolder', name: 'Source', properties: [{ key: 'owner', value: 'Exact' }], members: [el(tech)] }).folderId;
  const child = run({ type: 'createFolder', name: 'Child', parentFolderId: source }).folderId;
  const refs = [{ kind: 'folder', id: source }], before = store.exportFiles();
  const options = catalogDestinationOptions(store.snapshot, refs, source);
  assert.ok(options.some(([value]) => value === '@technology'));
  assert.ok(!options.some(([value]) => [source, child, '@common'].includes(value)));
  assert.throws(() => catalogMovePlan(store.snapshot, refs, child), { code: 'FOLDER_CYCLE' });
  const plan = catalogMovePlan(store.snapshot, refs, '@technology');
  const folder = plan.snapshot.folders.find(item => item.id === source);
  assert.deepEqual(folder.properties, [{ key: 'owner', value: 'Exact' }, { key: FOLDER_SECTION_PROPERTY, value: 'technology' }]);
  assert.deepEqual(folder.members, [el(tech)]);
  assert.equal(plan.snapshot.folders.find(item => item.id === child).parentFolderId, source);
  assert.deepEqual(store.exportFiles(), before);
});

test('section marking never drops user properties to fit resource limits or overwrites a colliding key', () => {
  const properties = Array.from({ length: 64 }, (_, i) => ({ key: `key${i}`, value: `${i}` })), folder = { properties };
  assert.throws(() => folderSectionProperties(folder, 'views'), /64/);
  assert.equal(folder.properties.length, 64);
  assert.throws(() => folderSectionProperties({ properties: [{ key: FOLDER_SECTION_PROPERTY, value: 'user data' }] }, 'views'), /уже занято/);
  assert.throws(() => folderSectionProperties({ properties: [{ key: FOLDER_SECTION_PROPERTY, value: 'views' }, { key: FOLDER_SECTION_PROPERTY, value: 'common' }] }, 'views'), /уже занято/);
  const marked = { properties: [{ key: FOLDER_SECTION_PROPERTY, value: 'common' }] };
  assert.equal(folderSectionProperties(marked, 'views')[0].value, 'views');
  assert.equal(marked.properties[0].value, 'common');
});

test('a practical long chain is indexed iteratively with bounded destination labels', () => {
  const state = createProject('Deep');
  for (let at = 0; at < 2000; at++) state.folders.push({ id: `folder-${at}`, name: `Folder ${at}`, documentation: '', properties: [], members: [], parentFolderId: at ? `folder-${at - 1}` : null });
  const index = catalogTreeIndex(state);
  assert.equal(index.sectionsForFolder.size, 2000);
  assert.deepEqual([...index.sectionsForFolder.get('folder-1999')], ['common']);
  const options = catalogDestinationOptions(state, [], null, 'common');
  assert.equal(options.length, 2001);
  assert.ok(options.every(([, label]) => label.length < 410));
});


test('a drop onto a projected mixed folder obeys the visible target branch', () => {
  const { store, run, common, tech } = fixture();
  const mixed = run({ type: 'createFolder', name: 'Mixed', members: [el(common), el(tech)] }).folderId;
  const second = run({ type: 'createElementInModel', elementType: 'Role', name: 'Second' }).elementId;
  const before = store.exportFiles();
  assert.throws(() => catalogMovePlan(store.snapshot, [el(second)], mixed, 'technology'), /ветвь/);
  const plan = catalogMovePlan(store.snapshot, [el(second)], mixed, 'common');
  assert.equal(plan.snapshot.folders.find(folder => folder.id === mixed).members.length, 3);
  assert.deepEqual(store.exportFiles(), before);
});
