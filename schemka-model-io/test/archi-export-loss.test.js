import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createProject, exportFiles } from '../../schemka-model-core/src/index.js';
import { newId } from '../../schemka-model-core/src/format.js';
import { importArchiXml } from '../src/archi-native.js';
import { exportCSV } from '../src/csv.js';
import { exportXLSX } from '../src/xlsx.js';
import { exportExchangeXml } from '../src/exchange-xml.js';
import { serializeProjectFile, deserializeProjectFile } from '../src/project-file.js';
const { DOMParser } = new JSDOM('').window;
const fixture = await readFile(new URL('./fixtures/archi-v5-synthetic.archimate', import.meta.url));
const exporters = [exportCSV, exportXLSX, state => exportExchangeXml(state, { typeMap: { Role: 'BusinessRole' } })];
const notice = /Исходные ID, типы и домены Archi \(archiSource\) не входят/;
const records = state => [state.project, ...state.folders, ...state.elements, ...state.junctions, ...state.relationships,
  ...state.views.flatMap(entry => [entry.view, ...entry.occurrences, ...entry.connections, ...entry.visualNodes, ...entry.visualConnectors])];
function model() {
  const state = importArchiXml(fixture, { DOMParser }).snapshot, view = state.views[0];
  state.junctions.push({ id: newId('jct'), type: 'AndJunction', name: 'Junction', documentation: '', properties: [] });
  view.visualConnectors.push({ id: newId('vcn'), name: 'Visual', documentation: '', properties: [], source: { kind: 'occurrence', id: view.occurrences[0].id }, target: { kind: 'visualNode', id: view.visualNodes[0].id }, routePoints: [], labelPosition: null, style: {} });
  for (const item of records(state)) delete item.archiSource;
  return state;
}

test('CSV, XLSX and Exchange explicitly report provenance loss even when only a folder or drawing carries it', () => {
  const plain = model();
  for (const run of exporters) assert.ok(!run(plain).losses.some(loss => notice.test(loss)));
  for (const original of records(plain)) {
    const state = structuredClone(plain), item = records(state).find(item => item.id === original.id);
    item.archiSource = { modelId: 'source-model', id: item.id, type: 'OriginalType', version: '5.0.0', domain: 'Business' };
    const before = exportFiles(state);
    for (const run of exporters) assert.equal(run(state).losses.filter(loss => notice.test(loss)).length, 1, item.id);
    assert.deepEqual(exportFiles(state), before); assert.deepEqual(exportFiles(deserializeProjectFile(serializeProjectFile(state))), before);
  }
  const empty = createProject('No diagrams'); empty.project.archiSource = { modelId: 'source', id: 'model', type: 'ArchimateModel', version: '5.0.0' };
  assert.equal(exportCSV(empty).losses.length, 1, 'provenance loss is not hidden by a no-diagrams export');
});

test('export notices cannot coerce malformed provenance past strict native validation', () => {
  for (const patch of [{ id: 7 }, { modelId: null }, { type: '' }, { version: '6.0.0' }, { domain: {} }]) {
    const state = createProject('Invalid source'); state.project.archiSource = { modelId: 'source', id: 'model', type: 'ArchimateModel', version: '5.0.0', ...patch };
    for (const run of exporters) assert.throws(() => run(state));
  }
});
