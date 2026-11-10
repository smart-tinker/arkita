import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, exportFiles, importFiles, validateProject } from '../src/index.js';
import { viewpointGraph, viewpointDefinition, viewpointId } from '../fixtures/viewpoint-project.js';
import { fixtureId } from '../fixtures/relationship-project.js';
import { canonicalJSON } from '../src/json.js';
const rewriteHeader = (files, change) => files.map(file => file.path === 'schemka.json' ? { ...file, content: canonicalJSON(change(JSON.parse(file.content))) } : file);
const capture = store => ({ files: store.exportFiles(), history: store.history, revision: store.revision });

test('viewpoint metadata is derived only for complete definitions, independent of binding and selection', () => {
  const bound = viewpointGraph().state, unbound = structuredClone(bound); delete unbound.views[0].view.viewpointId;
  const empty = createProject('Definition only'); empty.viewpoints = [{ id: viewpointId, ...viewpointDefinition({ elementTypes: [], junctionTypes: [], relationshipTypes: [] }) }];
  for (const state of [bound, unbound, empty]) {
    const files = exportFiles(state), header = JSON.parse(files.find(f => f.path === 'schemka.json').content);
    assert.equal(header.viewpointFormat, 1); assert.equal(header.formatVersion, 4);
    const reopened = importFiles(files.slice().reverse()); assert.deepEqual(exportFiles(reopened), files);
    assert.equal(Object.hasOwn(reopened.project, 'viewpointFormat'), false); assert.equal(Object.hasOwn(state.project, 'viewpointFormat'), false);
    const editable = structuredClone(state); editable.project.viewpointFormat = 1; assert.throws(() => validateProject(editable), { code: 'SCHEMA' });
  }
});

test('missing, mismatched, unsupported, duplicate and unknown metadata rejects atomically; dangling references stay strict', () => {
  const store = createStore(viewpointGraph().state);
  for (const name of ['Past', 'Future']) store.execute({ type: 'renameProject', name }, store.revision); store.undo(store.revision);
  const files = store.exportFiles();
  const bad = [
    [rewriteHeader(files, header => { delete header.viewpointFormat; return header; }), 'VIEWPOINT_FORMAT'],
    ...[0, 2, '1', null, {}, true].map(value => [rewriteHeader(files, header => ({ ...header, viewpointFormat: value })), 'VIEWPOINT_FORMAT']),
    [files.filter(f => !f.path.startsWith('viewpoints/')), 'VIEWPOINT_FORMAT'],
    [rewriteHeader(files, header => ({ ...header, unknownCapability: 1 })), 'SCHEMA'],
    [files.map(f => f.path === 'schemka.json' ? { ...f, content: f.content.replace('"viewpointFormat":', '"viewpointFormat": 1, "viewpointFormat":') } : f), 'DUPLICATE_KEY'],
    [files.map(f => f.path === 'schemka.json' ? { ...f, content: f.content.replace('"viewpointFormat":', '"viewpoint\\u0046ormat": 1, "viewpointFormat":') } : f), 'DUPLICATE_KEY'],
    [files.map(f => f.path.endsWith('/view.json') ? { ...f, content: canonicalJSON({ ...JSON.parse(f.content), viewpointId: fixtureId('vpt', 99) }) } : f), 'REFERENCE'],
    [rewriteHeader(exportFiles(createProject('Ordinary')), header => ({ ...header, viewpointFormat: 1 })), 'VIEWPOINT_FORMAT'],
  ];
  for (const [input, code] of bad) {
    const before = capture(store); assert.throws(() => store.load(input, store.revision), { code }); assert.deepEqual(capture(store), before);
  }
});

test('first and last definition commands add and remove only expected header metadata, including exact undo/redo', () => {
  const store = createStore(createProject('Ordinary')), before = store.exportFiles();
  const id = store.execute({ type: 'createViewpoint', definition: viewpointDefinition() }, store.revision).created.viewpointId;
  const after = store.exportFiles(); assert.equal(after.length, before.length + 1);
  assert.equal(JSON.parse(after.find(f => f.path === 'schemka.json').content).viewpointFormat, 1);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before); store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  store.execute({ type: 'deleteViewpoint', viewpointId: id }, store.revision); assert.deepEqual(store.exportFiles(), before);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), after);
});
