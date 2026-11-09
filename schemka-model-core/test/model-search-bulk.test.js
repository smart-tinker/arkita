import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportFiles, importFiles, validateProject } from '../src/index.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { fixtureId as id } from '../fixtures/relationship-project.js';
import { modelSearchRecords, searchModel, planNameReplacement } from '../src/model-search.js';
import { ownerKey, planProperties, propertySuggestions, commonProperties, applyBulkMetadata } from '../src/bulk-metadata.js';

function fixture() {
  const state = conceptProject();
  state.elements[0].name = 'Сервер 2'; state.elements[1].name = 'Сервер 10';
  state.elements[0].documentation = 'Документ НеИМЯ';
  state.elements[0].properties = [{ key: 'owner', value: 'Команда' }, { key: 'owner', value: '' }, { key: 'other', value: 'секрет-поиска' }];
  state.elements[1].properties = [{ key: 'owner', value: 'Другая' }, { key: 'z', value: 'last' }];
  state.folders.push({ id: id('fld', 1), name: 'Каталог', documentation: 'папка', properties: [{ key: 'owner', value: 'Folder' }], parentFolderId: null, members: [{ kind: 'element', id: state.elements[0].id }] });
  const entry = state.views[0];
  entry.visualNodes.push({ id: id('vnd', 1), kind: 'note', name: 'Заметка', documentation: 'Визуальная', properties: [{ key: 'owner', value: 'Note' }], bounds: { x: 0, y: 0, width: 100, height: 50 }, zIndex: 0, parent: null, style: {}, text: 'Text' });
  entry.visualConnectors.push({ id: id('vcn', 1), name: 'Соединитель', documentation: '', properties: [{ key: 'owner', value: 'Connector' }], source: { kind: 'visualNode', id: id('vnd', 1) }, target: { kind: 'occurrence', id: entry.occurrences[0].id }, routePoints: [], labelPosition: null, style: {} });
  return validateProject(state);
}

test('search combines fields, Cyrillic case, whole words, selected keys, types, views and profiles without mutations', () => {
  const state = fixture(), before = structuredClone(state);
  const find = options => searchModel(state, options).map(row => row.owner.id);
  assert.deepEqual(find({ query: 'сервер', fields: ['name'] }), state.elements.map(item => item.id));
  assert.deepEqual(find({ query: 'сервер', fields: ['name'], caseSensitive: true }), []);
  assert.deepEqual(find({ query: 'вер', fields: ['name'], wholeWord: true }), []);
  assert.deepEqual(find({ query: 'Сервер', fields: ['name'], wholeWord: true }), state.elements.map(item => item.id));
  assert.deepEqual(find({ query: 'НеИМЯ', fields: ['name'] }), []);
  assert.deepEqual(find({ query: 'НеИМЯ', fields: ['documentation'] }), [state.elements[0].id]);
  assert.deepEqual(find({ query: 'секрет', fields: ['properties'], propertyKeys: ['owner'] }), []);
  assert.deepEqual(find({ query: 'секрет', fields: ['properties'], propertyKeys: ['owner', 'other'] }), [state.elements[0].id]);
  assert.equal(searchModel(state, { query: '^$', regex: true, fields: ['properties'], propertyKeys: ['owner'], kinds: ['element'] })[0].matches[0].key, 'owner');
  assert.deepEqual(find({ query: 'сервер', types: ['Grouping', 'Service'], views: [state.views[0].view.id] }), [state.elements[0].id]);
  assert.deepEqual(find({ query: 'сервер', profiles: ['missing'] }), []);
  state.elements[0].profileApplications = [{ profileId: 'profile-test', values: {} }];
  assert.deepEqual(find({ query: 'сервер', profiles: ['profile-test'] }), [state.elements[0].id]);
  delete state.elements[0].profileApplications;
  assert.deepEqual(state, before);
  assert.throws(() => searchModel(state, { query: '[', regex: true }), /Некорректное/);
});

test('all metadata owners have typed identity, path and exact view drawing; empty queries differ from no matches', () => {
  const state = fixture(), records = modelSearchRecords(state);
  assert.equal(new Set(records.map(row => ownerKey(row.owner))).size, records.length);
  assert.match(records.find(row => row.owner.id === state.elements[0].id).path, /Каталог \/ Сервер 2/);
  assert.deepEqual(records.find(row => row.owner.kind === 'visualNode').owner, { kind: 'visualNode', viewId: state.views[0].view.id, id: id('vnd', 1) });
  assert.equal(searchModel(state, { query: '' }).length, records.length);
  assert.equal(searchModel(state, { query: 'absent' }).length, 0);
  assert.deepEqual(searchModel(state, { query: 'absent', showAllFolders: true }).map(row => row.owner.kind), ['folder']);
  const relationship = records.find(row => row.owner.id === state.relationships[0].id);
  assert.equal(relationship.drawings.length, 2);
});

test('name replacement deduplicates shared drawings, previews exact owners and commits/undoes once', () => {
  const state = fixture(), store = createStore(state), before = store.exportFiles();
  const plan = planNameReplacement(state, { query: 'Link', fields: ['name'], views: [state.views[0].view.id], kinds: ['relationship'] }, 'Связь');
  assert.equal(plan.changes.length, state.relationships.length);
  assert.deepEqual(store.exportFiles(), before);
  store.execute({ type: 'bulkUpdateMetadata', changes: plan.changes }, 0);
  const after = store.exportFiles(); assert.equal(store.history.undo, 1);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  assert.deepEqual(exportFiles(importFiles(after)), after);
  assert.deepEqual(planNameReplacement(state, { query: 'Сервер', fields: ['name'] }, 'Сервер').changes, []);
  const literal = planNameReplacement(state, { query: 'Сервер', fields: ['name'] }, '$&');
  assert.equal(literal.changes[0].after.name, '$& 2');
});

test('bulk commands reject stale, duplicate, invalid and noop plans atomically', () => {
  const store = createStore(fixture()), initial = store.exportFiles();
  const plan = planNameReplacement(store.snapshot, { query: 'Сервер' }, 'Host').changes;
  const invalid = structuredClone(plan); invalid[1].after.name = 'x'.repeat(8193);
  for (const changes of [[], [plan[0], plan[0]], invalid, [{ ...plan[0], after: plan[0].before }]]) {
    assert.throws(() => store.execute({ type: 'bulkUpdateMetadata', changes }, store.revision));
    assert.deepEqual(store.exportFiles(), initial); assert.equal(store.history.undo, 0);
  }
  store.execute({ type: 'renameProject', name: 'Changed' }, 0);
  assert.throws(() => store.execute({ type: 'bulkUpdateMetadata', changes: plan }, 0), /revision/i);
  store.execute({ type: 'bulkUpdateMetadata', changes: plan }, store.revision);
  const after = store.exportFiles(); assert.throws(() => store.execute({ type: 'bulkUpdateMetadata', changes: plan }, store.revision), /предпросмотра/); assert.deepEqual(store.exportFiles(), after);
  const raw = fixture(), before = structuredClone(raw), bad = structuredClone(plan); bad[1].before.name = 'wrong';
  assert.throws(() => applyBulkMetadata(raw, bad), /предпросмотра/); assert.deepEqual(raw, before);
});

test('global properties counts duplicates, preserves mixed values, reports collisions and explicitly merges', () => {
  const state = fixture(), records = modelSearchRecords(state), elements = records.filter(row => row.owner.kind === 'element');
  const common = commonProperties(elements).find(row => row.key === 'owner');
  assert.deepEqual({ count: common.count, owners: common.owners, common: common.common, mixed: common.mixed }, { count: 3, owners: 2, common: true, mixed: true });
  assert.deepEqual(propertySuggestions(records).find(row => row.key === 'owner').values, ['', 'Connector', 'Folder', 'Note', 'Другая', 'Команда']);
  const conflict = planProperties(elements, { type: 'rename', key: 'owner', newKey: 'z' });
  assert.equal(conflict.collisions.length, 1); assert.deepEqual(conflict.changes, []);
  const merged = planProperties(elements, { type: 'rename', key: 'owner', newKey: 'z', collision: 'merge' });
  assert.deepEqual(merged.changes[1].after.properties, [{ key: 'z', value: 'Другая' }, { key: 'z', value: 'last' }]);
  const missing = planProperties(elements, { type: 'add', mode: 'missing', entries: [{ key: 'owner', value: 'not overwrite' }] });
  assert.deepEqual(missing.changes, []);
  const all = planProperties(elements, { type: 'add', mode: 'all', entries: [{ key: 'owner', value: 'new' }] });
  assert.equal(all.changes[0].after.properties.length, 4); assert.equal(all.changes[0].after.properties[0].value, 'Команда');
  const remove = planProperties(records, { type: 'remove', key: 'owner' });
  assert.equal(remove.changes.length, 5);
  const store = createStore(state), before = store.exportFiles(); store.execute({ type: 'bulkUpdateMetadata', changes: remove.changes }, 0); store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
});

test('sort and multirow reorder preserve duplicates and exact values, disallow ambiguous group order', () => {
  const state = fixture(), row = modelSearchRecords(state).find(row => row.owner.id === state.elements[0].id);
  const sorted = planProperties([row], { type: 'sort' }).changes[0].after.properties;
  assert.deepEqual(sorted.map(row => row.key), ['other', 'owner', 'owner']); assert.deepEqual(sorted.slice(1).map(row => row.value), ['Команда', '']);
  const reordered = planProperties([row], { type: 'reorder', order: [1, 2, 0] }).changes[0].after.properties;
  assert.deepEqual(reordered.map(row => row.value), ['', 'секрет-поиска', 'Команда']);
  assert.throws(() => planProperties([row, row], { type: 'sort' }), /одного объекта/);
  assert.throws(() => planProperties([row], { type: 'reorder', order: [0, 0, 1] }), /перестановка/);
  assert.equal(planProperties([row], { type: 'reorder', order: [0, 1, 2] }).changes.length, 0);
});

test('V4 property-key strings stay inert even when they resemble JavaScript prototype keys', () => {
  const state = fixture(), rows = modelSearchRecords(state).filter(row => row.owner.kind === 'element');
  const plan = planProperties(rows, { type: 'add', mode: 'all', entries: [{ key: '__proto__', value: 'literal' }, { key: 'constructor', value: 'text' }] });
  const store = createStore(state); store.execute({ type: 'bulkUpdateMetadata', changes: plan.changes }, 0);
  assert.deepEqual(store.snapshot.elements[0].properties.slice(-2), [{ key: '__proto__', value: 'literal' }, { key: 'constructor', value: 'text' }]);
  assert.equal(Object.prototype.literal, undefined);
  assert.equal(propertySuggestions(modelSearchRecords(store.snapshot)).find(row => row.key === '__proto__').values[0], 'literal');
});


test('common property overview reads each owner once and distinguishes absent, empty and ordered duplicate values', () => {
  const records = [
    { item: { properties: [{ key: 'same', value: '' }, { key: 'same', value: '2' }, { key: 'only-first', value: '' }, { key: 'order', value: 'a' }, { key: 'order', value: 'b' }] } },
    { item: { properties: [{ key: 'same', value: '' }, { key: 'same', value: '2' }, { key: 'only-later', value: '' }, { key: 'order', value: 'b' }, { key: 'order', value: 'a' }] } },
  ];
  const before = structuredClone(records), summary = commonProperties(records), find = key => summary.find(row => row.key === key);
  assert.deepEqual(find('same'), { key: 'same', count: 4, owners: 2, common: true, mixed: false, values: ['', '2'] });
  assert.deepEqual(find('only-first'), { key: 'only-first', count: 1, owners: 1, common: false, mixed: true, values: [''] });
  assert.deepEqual(find('only-later'), { key: 'only-later', count: 1, owners: 1, common: false, mixed: true, values: [] });
  assert.equal(find('order').mixed, true); assert.deepEqual(find('order').values, ['a', 'b']);
  assert.deepEqual(commonProperties([]), []); assert.deepEqual(records, before);
  assert.deepEqual(commonProperties([{ item: { properties: { old: 'value' } } }]), [{ key: 'old', count: 1, owners: 1, common: true, mixed: false, values: ['value'] }]);
  let reads = 0;
  const many = Array.from({ length: 1000 }, (_, owner) => ({ item: { get properties() { reads++; return Array.from({ length: 32 }, (_, row) => ({ key: `owner-${owner}-key-${row}`, value: `${row}` })); } } }));
  const overview = commonProperties(many);
  assert.equal(reads, many.length, 'large mixed catalogue selection must not reread every owner for every distinct key');
  assert.equal(overview.length, 32000); assert.ok(overview.every(row => row.count === 1 && row.owners === 1 && !row.common && row.mixed));
  assert.deepEqual(overview.find(row => row.key === 'owner-0-key-0').values, ['0']); assert.deepEqual(overview.find(row => row.key === 'owner-999-key-0').values, []);
});
