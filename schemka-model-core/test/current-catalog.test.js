import { expectedEndpointDecision } from '../../schemka-model-ui/test/endpoint-oracle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/index.js';
import { relationshipProject } from '../fixtures/relationship-project.js';
const { CURRENT_METAMODEL, CURRENT_CATALOG, createProject, createStore, exportFiles, importFiles, validateProject } = core;
const run = (store, command) => store.execute(command, store.revision);
const capture = store => ({ state: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history });

test('one frozen current catalogue is available from every fresh project', () => {
  assert.deepEqual(Object.keys(core).sort(), ['CURRENT_CATALOG', 'CURRENT_METAMODEL', 'CUSTOMIZATION_BASIC_TYPES', 'FORMAT', 'FORMAT_VERSION', 'LIMITS', 'SchemkaError', 'VIEWPOINT_PURPOSES', 'VIEWPOINT_CONTENTS', 'projectView', 'selectViewpointConcepts', 'createProject', 'createProjectResolver', 'resolveConcept', 'resolveProfileValue', 'resolveViewEndpoint', 'specializationLabel', 'specializationNameConflicts', 'drawingDeletionImpact', 'drawingSelectionDeletionImpact', 'createStore', 'createCustomizationResolver', 'customizationProfileUsages', 'deletionImpact', 'exportFiles', 'importFiles', 'mergeProjectFiles', 'profileAppliesTo', 'validateProject', 'moveDrawingGeometry', 'applyDrawingGeometry', 'alignDrawingGeometry', 'captureFragment', 'capturePortableFragment', 'remapProject', 'readPortableFragment', 'portableFragmentInfo', 'readProjectFiles', 'normalizeProject', 'validateProjectV2', 'metadataRecord', 'MODEL_GRAPH_LIMIT', 'MODEL_QUALITY_RULES', 'queryModelGraph', 'planGeneratedView', 'analyzeModelQuality', 'DRAWING_COLLECTIONS', 'STYLE_FIELDS', 'VISUAL_NODE_KINDS', 'assetUsages', 'drawingRecord', 'validateDrawingStyle', 'validateInactiveSvg', 'validateProjectV3', 'validatePropertyRows', 'visualEndpointRecord', 'ASSET_LIMITS', 'conceptTypeChangeImpact', 'conceptTypeChangesImpact', 'catalogSelectionMovePlan', 'assertUnlockedDrawings'].sort());
  assert.deepEqual(CURRENT_METAMODEL, { id: 'schemka-archimate4', version: 2 });
  assert.deepEqual(createProject('Ready').project.metamodel, CURRENT_METAMODEL);
  assert.equal(CURRENT_CATALOG.elementTypes.length, 42);
  assert.equal(CURRENT_CATALOG.relationshipTypes.length, 15);
  assert.deepEqual(CURRENT_CATALOG.junctionTypes, ['AndJunction', 'OrJunction']);
  assert.equal(new Set([...CURRENT_CATALOG.elementTypes, ...CURRENT_CATALOG.relationshipTypes]).size, 57);
  for (const value of [CURRENT_METAMODEL, CURRENT_CATALOG, CURRENT_CATALOG.elementTypes, CURRENT_CATALOG.junctionTypes, CURRENT_CATALOG.relationshipTypes]) assert.ok(Object.isFrozen(value));
});

test('fresh project creates all 42 element types and 15 relationship identifiers without activation', () => {
  const store = createStore(createProject('Complete catalogue'));
  const { viewId } = run(store, { type: 'createView', name: 'All types' }).created;
  const occurrences = [];
  for (const elementType of CURRENT_CATALOG.elementTypes) {
    occurrences.push(run(store, { type: 'createElementAndOccurrence', elementType, viewId, name: elementType,
      bounds: { x: 0, y: 0, width: 120, height: 60 } }).created.occurrenceId);
  }
  for (const relationshipType of CURRENT_CATALOG.relationshipTypes) {
    const before = store.exportFiles();
    const sourceIndex = CURRENT_CATALOG.elementTypes.findIndex(a => CURRENT_CATALOG.elementTypes.some(b => expectedEndpointDecision(a, relationshipType, b).status === 'ALLOWED'));
    const targetIndex = CURRENT_CATALOG.elementTypes.findIndex(b => expectedEndpointDecision(CURRENT_CATALOG.elementTypes[sourceIndex], relationshipType, b).status === 'ALLOWED');
    assert.ok(sourceIndex >= 0 && targetIndex >= 0);
    run(store, { type: 'createRelationshipAndConnection', relationshipType, viewId,
      source: { kind: 'occurrence', id: occurrences[sourceIndex] }, target: { kind: 'occurrence', id: occurrences[targetIndex] }, label: relationshipType,
      routePoints: ([{ x: 1.2, y: -3.4 }]).map(point => ({ kind: 'bend', point })), labelPosition: { x: 5.6, y: -7.8 } });
    const after = store.exportFiles();
    store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
    store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  }
  assert.deepEqual(store.snapshot.elements.map(item => item.type), CURRENT_CATALOG.elementTypes);
  assert.deepEqual(store.snapshot.relationships.map(item => item.type), CURRENT_CATALOG.relationshipTypes);
  assert.deepEqual(exportFiles(importFiles(store.exportFiles())), store.exportFiles());
});

test('creation requires explicit correctly kinded types and invalid commands preserve redo', () => {
  const store = createStore(relationshipProject());
  run(store, { type: 'renameProject', name: 'Kept' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const view = store.snapshot.views[0];
  const commands = [
    { type: 'createElementAndOccurrence', viewId: view.view.id, name: '', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    { type: 'createRelationshipAndConnection', viewId: view.view.id, source: { kind: 'occurrence', id: view.occurrences[0].id }, target: { kind: 'occurrence', id: view.occurrences[1].id }, label: '' },
  ];
  for (const [index, command] of commands.entries()) {
    const field = index ? 'relationshipType' : 'elementType';
    for (const [value, code] of [[null, 'TYPE'], ['', 'TYPE'], [index ? 'ApplicationComponent' : 'Association', 'TYPE'], [index ? 'Link' : 'Element', 'TYPE']]) {
      const before = capture(store); assert.throws(() => run(store, { ...command, [field]: value }), { code }); assert.deepEqual(capture(store), before);
    }
    const before = capture(store); assert.throws(() => run(store, command), { code: 'SCHEMA' }); assert.deepEqual(capture(store), before);
  }
  const before = capture(store); assert.throws(() => run(store, { type: 'unknownCommand' }), { code: 'COMMAND' }); assert.deepEqual(capture(store), before);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});

test('unsupported identities and removed types fail every current structural boundary atomically', () => {
  const original = relationshipProject(), store = createStore(original);
  run(store, { type: 'renameProject', name: 'Kept' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
  const cases = [
    [state => { state.project.metamodel = { id: 'schemka-generic', version: 1 }; }, 'VERSION'],
    [state => { state.project.metamodel = { id: 'schemka-archimate4-subset-preview', version: 7 }; }, 'VERSION'],
    [state => { state.project.metamodel.version = 3; }, 'VERSION'],
    [state => { state.elements[0].type = 'Element'; }, 'TYPE'],
    [state => { state.relationships[0].type = 'Link'; }, 'TYPE'],
  ];
  for (const [change, code] of cases) {
    const invalid = structuredClone(original); change(invalid);
    const beforeInvalid = structuredClone(invalid);
    for (const action of [validateProject, createStore, exportFiles]) assert.throws(() => action(invalid), { code });
    assert.deepEqual(invalid, beforeInvalid);
    const records = new Map([[invalid.project.id, invalid.project], ...invalid.elements.map(item => [item.id, item]), ...invalid.relationships.map(item => [item.id, item])]);
    const files = exportFiles(original).map(file => {
      const previous = JSON.parse(file.content); return records.has(previous.id) ? { ...file, content: JSON.stringify(records.get(previous.id)) } : file;
    });
    assert.throws(() => importFiles(files), { code });
    const before = capture(store); assert.throws(() => store.load(files, store.revision), { code }); assert.deepEqual(capture(store), before);
  }
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
});
