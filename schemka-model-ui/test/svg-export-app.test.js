import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, setStoredGeometry } from './app-test-fixture.js';
import { svgExportProject } from '../fixtures/svg-export-project.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { exportViewSvg } from '../src/svg-export.js';
import { connectionGeometry, viewGeometryBounds } from '../src/connection-geometry.js';
import { createController } from '../src/controller.js';
import { createProject, createStore, CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { outlineSvgText } from '../src/svg-text-outlines.js';
import { outlineTextRuns } from '../../electron/text-outline-service.mjs';
import { assertSvgExport } from '../src/svg-export.js';
import { MARKER_KINDS, relationMarkerUrl } from '../src/relation-markers.js';
import { notationRelationship } from '../src/notation.js';

function loadStyle(h) {
  const style = h.document.createElement('style'); style.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8'); h.document.head.append(style);
}
const svgDocument = (h, text) => new h.window.DOMParser().parseFromString(text, 'image/svg+xml');

test('actual app canvas SVG snapshot retains only active projection, junctions, self-links, anchors and both geometry modes', async t => {
  const h = await setup(t), fixture = svgExportProject(), bytes = serializeProjectFile(fixture.state);
  loadStyle(h); await h.load(bytes);
  const controller = createController(createStore(fixture.state)), view = controller.view;
  assert.equal(view.occurrences.length, 5); assert.equal(view.connections.length, 5);
  for (const stored of [false, true]) {
    setStoredGeometry(h, stored);
    const canvas = h.$('canvas'), group = canvas.querySelector(`[data-id="${fixture.draws.A}"]`);
    group.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const prior = canvas.outerHTML, history = h.$('history-state').textContent;
    for (const theme of ['light', 'dark']) {
      h.document.documentElement.dataset.theme = theme;
      const text = exportViewSvg({ canvas, bounds: viewGeometryBounds(view.occurrences, view.connections, () => 0, stored), title: view.view.name });
      const exported = svgDocument(h, text);
      assert.equal(exported.querySelector('parsererror'), null);
      assert.equal([...exported.documentElement.children].filter(item => item.localName === 'g').length, 10);
      assert.doesNotMatch(text, /HIDDEN|Other view excluded|PRIVATE documentation|class=|tabindex=|data-/);
      assert.ok([...exported.querySelectorAll('title')].some(item => item.textContent.includes('日本語 😀')));
      for (const line of canvas.querySelectorAll('.connection .line')) {
        const path = [...exported.querySelectorAll('path')].find(item => item.getAttribute('d') === line.getAttribute('d'));
        assert.ok(path, 'every exported path is the actual renderer path');
        for (const property of ['marker-start', 'marker-end']) assert.equal(path.getAttribute(property), line.getAttribute(property));
      }
      assert.ok([...exported.querySelectorAll('text')].some(item => item.firstChild?.textContent === '1..*'));
      assert.ok([...exported.querySelectorAll('text')].some(item => item.textContent.includes('AND')));
      assert.ok([...exported.querySelectorAll('text')].some(item => item.textContent.includes('OR')));
      assert.equal(exported.querySelector('[tabindex],foreignObject,script,image,use'), null);
      assert.equal(canvas.outerHTML, prior); assert.equal(h.$('history-state').textContent, history);
    }
    const self = view.connections.find(item => item.id === fixture.draws.U), shape = connectionGeometry(self, view.occurrences, () => 12, stored, view.connections);
    assert.match(shape.d, /C /, 'the self-link remains the same automatic curve');
    assert.deepEqual(await h.download(), Buffer.from(bytes));
  }
});

test('actual SVG file control exports a dirty selected diagram twice without clearing edits, redo or selection', async t => {
  const h = await setup(t), fixture = svgExportProject(); loadStyle(h); await h.load(serializeProjectFile(fixture.state));
  h.$('project-name').click(); let input = h.document.querySelector('.inline-editor input'); input.value = 'First unsaved'; input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  h.$('project-name').click(); input = h.document.querySelector('.inline-editor input'); input.value = 'Redo value'; input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); h.$('undo').click();
  const group = h.$('canvas').querySelector(`[data-id="${fixture.draws.A}"]`); group.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const history = h.$('history-state').textContent, selected = [...h.$('canvas').querySelectorAll('.selected')].map(item => item.dataset.id);
  assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.equal(h.$('redo').disabled, false);
  const first = await h.download('download-svg'), second = await h.download('download-svg');
  assert.deepEqual(second, first); assert.equal(svgDocument(h, first.toString()).querySelector('parsererror'), null);
  assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
  assert.deepEqual([...h.$('canvas').querySelectorAll('.selected')].map(item => item.dataset.id), selected);
});

test('actual export preview shares one canvas marker set across two complete relationship legends, annotations and an embedded asset', async t => {
  const store = createStore(createProject('Two relationship legends')), run = command => store.execute(command, store.revision).created, viewId = run({ type: 'createView', name: 'Legend export' }).viewId;
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Service', name: 'Service', bounds: { x: 20, y: 20, width: 180, height: 80 } }), b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Process', name: 'Process', bounds: { x: 300, y: 20, width: 180, height: 80 } });
  const groupId = run({ type: 'createVisualNode', viewId, kind: 'group', name: 'Заметки', bounds: { x: 0, y: 250, width: 500, height: 200 } }).visualNodeId;
  run({ type: 'createVisualNode', viewId, kind: 'note', name: 'Note', text: 'Первая строка\nВторая строка', parent: { kind: 'visualNode', id: groupId }, bounds: { x: 20, y: 280, width: 260, height: 100 } });
  const data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#123456"/></svg>').toString('base64'), assetId = run({ type: 'createAsset', name: 'Embedded SVG', mediaType: 'image/svg+xml', data }).assetId;
  run({ type: 'createVisualNode', viewId, kind: 'image', assetId, parent: { kind: 'visualNode', id: groupId }, bounds: { x: 320, y: 280, width: 80, height: 80 } });
  for (const x of [600, 1050]) run({ type: 'createVisualNode', viewId, kind: 'legend', name: 'All relationships', bounds: { x, y: 0, width: 400, height: 700 }, legend: { sort: 'type', columns: 1, showRelationships: true, showElements: false } });
  // Imported diagrams may retain forbidden relationships; rendering must preserve
  // their declared notation without granting any new creation permission.
  const state = store.snapshot, entry = state.views[0];
  CURRENT_CATALOG.relationshipTypes.forEach((type, index) => {
    const id = fixtureId('rel', 1000 + index); state.relationships.push({ id, type, source: { kind: 'element', id: a.elementId }, target: { kind: 'element', id: b.elementId }, label: type, documentation: '', properties: [] });
    entry.connections.push({ id: fixtureId('conn', 1000 + index), relationshipId: id, source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: b.occurrenceId }, routePoints: [], labelPosition: null, style: {} });
  });
  const h = await setup(t); loadStyle(h); const bytes = Buffer.from(serializeProjectFile(state)); await h.load(bytes);
  const geometry = () => [...h.$('canvas').querySelectorAll('[data-kind][data-id]')].map(node => ({ kind: node.dataset.kind, id: node.dataset.id, transform: node.getAttribute('transform'), path: node.querySelector('.line')?.getAttribute('d') ?? null }));
  const before = geometry(), history = h.$('history-state').textContent;
  const legends = [...h.$('canvas').querySelectorAll('.visual-legend')]; assert.equal(legends.length, 2);
  for (const legend of legends) {
    const entries = [...legend.querySelectorAll('.legend-entry')]; assert.equal(entries.length, 15); assert.equal(legend.querySelector('defs'), null, 'legend samples use the existing canvas definitions');
    for (const row of entries) { const type = row.querySelector('.legend-label').textContent, appearance = notationRelationship(state.project.metamodel, type), line = row.querySelector('.line'); assert.equal(line.getAttribute('marker-start'), relationMarkerUrl(appearance.startMarkerKind)); assert.equal(line.getAttribute('marker-end'), relationMarkerUrl(appearance.markerKind)); }
  }
  const ids = [...h.$('canvas').querySelectorAll('[id]')].map(node => node.id); assert.equal(new Set(ids).size, ids.length); assert.equal(h.$('canvas').querySelectorAll('marker').length, MARKER_KINDS.length);
  h.$('export-report-button').click(); h.change('export-report-format', 'svg'); h.change('export-report-text-mode', 'text'); h.$('export-report-generate').click();
  const image = h.$('export-report-preview').querySelector('img'); assert.ok(image, h.$('export-report-feedback').textContent); assert.equal(h.$('export-report-save').disabled, false);
  const svg = decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1)); assert.equal(assertSvgExport(svg), svg); const exported = svgDocument(h, svg);
  assert.equal(exported.querySelectorAll('marker').length, MARKER_KINDS.length); assert.ok(exported.querySelector('image[href^="data:image/svg+xml;base64,"]')); assert.match(exported.documentElement.textContent, /Первая строка/);
  const outlined = await outlineSvgText(svg, { document: h.document, window: h.window, outlineText: runs => outlineTextRuns(runs) }); assert.equal(assertSvgExport(outlined.svg), outlined.svg); assert.equal(svgDocument(h, outlined.svg).querySelector('text,tspan'), null);
  assert.deepEqual(geometry(), before); assert.equal(h.$('history-state').textContent, history); h.$('export-report-cancel').click(); assert.deepEqual(await h.download(), bytes);
});
