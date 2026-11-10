import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createProject, createStore, exportFiles, importFiles } from '../../schemka-model-core/src/index.js';
import * as io from '../src/index.js';

async function fixture() {
  const root = new URL('../../schemka-model-core/fixtures/two-views/', import.meta.url);
  const files = [];
  async function walk(relative = '') {
    for (const item of await readdir(new URL(relative, root), { withFileTypes: true })) {
      const path = relative + item.name;
      if (item.isDirectory()) await walk(path + '/');
      else files.push({ path, content: await readFile(new URL(path, root), 'utf8') });
    }
  }
  await walk();
  return importFiles(files);
}

test('public package surface is explicit and has no UI or filesystem operations', () => {
  assert.deepEqual(Object.keys(io).sort(), [
    'ARCHI_NAMESPACE', 'ARCHI_NATIVE_VERSION', 'CSV_LIMITS', 'CSV_VERSION',
    'EXCHANGE_NAMESPACE', 'EXCHANGE_TYPE_CHOICES', 'EXCHANGE_VERSION', 'MERMAID_LIMITS',
    'PROJECT_FILE_EXTENSION', 'PROJECT_FILE_FORMAT', 'PROJECT_FILE_LIMITS', 'PROJECT_FILE_VERSION',
    'TEMPLATE_LIMIT', 'TEMPLATE_VERSION', 'XML_LIMITS', 'collectArchiMappings', 'createBoardPlan', 'createTemplate',
    'createTemplateLibrary', 'csvTables', 'deserializeProjectFile', 'exportCSV', 'exportExchangeXml',
    'exportMermaid', 'exportXLSX', 'importArchiXml', 'importExchangeXml', 'insertBoardTemplate',
    'insertPatternTemplate', 'instantiateTemplate', 'loadProjectFile', 'parseCSV', 'previewArchiXml', 'previewCSVImport',
    'previewNativeMerge', 'projectFileName', 'readProjectFile', 'readTemplate', 'remapProject',
    'safeXmlText', 'serializeNativeFiles', 'serializeProjectFile', 'serializeTemplate',
    'sketchConversionPlan', 'templatePreviewSVG', 'transferChanges',
  ].sort());
});

test('fixture edit -> portable bytes -> load -> canonical tree and both projections are preserved', async () => {
  const store = createStore(await fixture());
  const state = store.snapshot;
  const view = state.views[0];
  const occurrence = view.occurrences[0];
  store.execute({ type: 'renameElement', elementId: occurrence.concept.id,
    name: 'Общий узел 😀 <tag> #34; "quote"' }, store.revision);
  store.execute({ type: 'moveOccurrence', viewId: view.view.id, occurrenceId: occurrence.id,
    x: 112.3, y: -4.5 }, store.revision);
  const expected = store.exportFiles();
  const projections = new Map(store.snapshot.views.map(item => [item.view.id, io.exportMermaid(store.snapshot, item.view.id)]));
  const bytes = io.serializeProjectFile(store.snapshot);
  const decoded = io.deserializeProjectFile(bytes);
  assert.deepEqual(exportFiles(decoded), expected);
  assert.deepEqual(io.serializeProjectFile(decoded), bytes);
  assert.equal(decoded.project.id, state.project.id);
  assert.deepEqual(decoded.elements.map(item => item.id).sort(), state.elements.map(item => item.id).sort());
  for (const item of decoded.views) assert.equal(io.exportMermaid(decoded, item.view.id), projections.get(item.view.id));
  const destination = createStore(createProject('Temporary session'));
  destination.execute({ type: 'createView', name: 'Discarded view' }, destination.revision);
  const revision = destination.revision;
  io.loadProjectFile(destination, bytes, revision);
  assert.equal(destination.revision, revision + 1);
  assert.deepEqual(destination.history, { undo: 0, redo: 0 });
  assert.deepEqual(destination.exportFiles(), expected);
  // Loading into a separate session never changes the source session/history.
  assert.deepEqual(store.exportFiles(), expected);
  assert.deepEqual(store.history, { undo: 2, redo: 0 });
});

test('failed load and failed projection leave the previously edited session recoverable', async () => {
  const store = createStore(await fixture());
  const element = store.snapshot.elements[0];
  store.execute({ type: 'renameElement', elementId: element.id, name: 'Kept edit' }, store.revision);
  store.undo(store.revision);
  const before = { files: store.exportFiles(), revision: store.revision, history: store.history };
  assert.throws(() => io.loadProjectFile(store, new Uint8Array([0xff]), store.revision), { code: 'FILE_ENCODING' });
  assert.throws(() => io.loadProjectFile(store, io.serializeProjectFile(store.snapshot), store.revision - 1), { code: 'REVISION' });
  assert.throws(() => io.exportMermaid(store.snapshot, 'missing'), { code: 'MERMAID_VIEW' });
  assert.deepEqual({ files: store.exportFiles(), revision: store.revision, history: store.history }, before);
  store.redo(store.revision);
  assert.equal(store.snapshot.elements.find(item => item.id === element.id).name, 'Kept edit');
});

test('portable IO retains relative imports and forbids host APIs; offline report navigation takes an explicit DOM root', async () => {
  const root = new URL('../src/', import.meta.url);
  for (const name of await readdir(root)) {
    const source = await readFile(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /\b(?:Buffer|process|require)\b|['"]node:|\b(?:window|localStorage)\s*\.|\bfetch\s*\(/, name);
    // The report ships one fixed browser program and reuses it with an injected root for preview.
    if (name === 'report.js') assert.match(source, /const document = root\.ownerDocument \?\? root/);
    else assert.doesNotMatch(source, /\bdocument\s*\./, name);
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) assert.match(match[1], /^\.\.?\//, name);
  }
});
