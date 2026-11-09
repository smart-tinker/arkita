import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { captionGrid, captionSpan } from '../src/element-captions.js';
import { notationElement } from '../src/notation.js';
import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

// DOM-level app regression, not a claim of browser layout/raster or pointer-device QA.
// Aggregate builds dist first; an explicit source-only run remains available for edits.
const production = process.env.SCHEMKA_NOTATION_SOURCE_ONLY !== '1';
const page = new URL(production ? '../../dist/model/index.html' : '../index.html', import.meta.url);
const app = new URL(production ? '../../dist/model/src/app.js' : '../src/app.js', import.meta.url);
let generation = 0;
async function setup(t, desktop) {
  assert.ok(existsSync(fileURLToPath(app)), 'Run npm run build before production jsdom tests');
  if (production) {
    // The editor is independently installable: its HTML is copied verbatim.
    assert.equal(readFileSync(page, 'utf8'), readFileSync(new URL('../index.html', import.meta.url), 'utf8'), 'Production HTML must match exact standalone source; rebuild first');
    assert.equal(readFileSync(new URL('../../dist/model/style.css', import.meta.url), 'utf8'), readFileSync(new URL('../style.css', import.meta.url), 'utf8'), 'Production style.css must match source; rebuild first');
  }
  if (production) for (const name of readdirSync(new URL('../src/', import.meta.url)).filter(name => name.endsWith('.js'))) {
    assert.equal(readFileSync(new URL(`../../dist/model/src/${name}`, import.meta.url), 'utf8'), readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'), `Production ${name} must match source; rebuild first`);
  }
  const errors = [], downloads = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(readFileSync(page, 'utf8'), { url: 'https://schemka.test/model/', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom, { document } = window;
  window.schemkaDesktop = desktop;
  const viewport = { narrow: false }, captionMetrics = { calls: 0, hiddenCalls: 0, disconnectedCalls: 0, mode: 'valid', observed: new WeakSet() };
  window.matchMedia = query => ({ get matches() { return query.includes('850px') && viewport.narrow; }, addEventListener() {}, removeEventListener() {} });
  window.Element.prototype.getClientRects = function () {
    const region = this.closest('.canvas-panel,.catalog,.toolbox');
    const active = { canvas: 'canvas-panel', catalog: 'catalog', inspector: 'toolbox' }[document.body.dataset.mobilePanel];
    const hidden = (viewport.narrow && region && !region.classList.contains(active))
      || (region?.classList.contains('catalog') && document.body.dataset.workspaceCatalog === 'false')
      || (region?.classList.contains('toolbox') && document.body.dataset.workspacePalette === 'false');
    return this.isConnected && !hidden ? [{ x: 0, y: 0, width: 900, height: 640 }] : [];
  };
  // Explicit nonuniform simulated metrics: this exercises connected fitting, never native fonts.
  window.SVGElement.prototype.getBBox = function () {
    if (!this.matches('.node-type,.node-title')) throw new Error('No simulated metrics for other SVG');
    captionMetrics.calls++; captionMetrics.observed.add(this);
    if (!this.isConnected) captionMetrics.disconnectedCalls++;
    if (!this.getClientRects().length) { captionMetrics.hiddenCalls++; return { x: 0, y: 0, width: 0, height: 0 }; }
    if (captionMetrics.mode === 'throw') throw new Error('Simulated unavailable font');
    if (captionMetrics.mode === 'missing') return undefined;
    if (captionMetrics.mode === 'zero') return { x: 0, y: 0, width: 0, height: 0 };
    if (captionMetrics.mode === 'nan') return { x: NaN, y: 0, width: 10, height: 10 };
    return simulatedCaptionBox(this);
  };
  window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 900, height: 640, right: 900, bottom: 640 });
  window.Element.prototype.setPointerCapture = function (id) { this._capture = id; };
  window.Element.prototype.hasPointerCapture = function (id) { return this._capture === id; };
  window.Element.prototype.releasePointerCapture = function () { delete this._capture; };
  window.SVGElement.prototype.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  window.Blob = Blob;
  const blobs = new Map(); let urlNumber = 0;
  window.URL.createObjectURL = blob => { const url = `blob:https://schemka.test/${++urlNumber}`; blobs.set(url, blob); return url; };
  window.URL.revokeObjectURL = url => blobs.delete(url);
  window.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) }); };
  const saved = Object.fromEntries(['document', 'window', 'DOMPoint'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window, document, DOMPoint: class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return { x: this.x, y: this.y }; } } });
  t.after(() => {
    window.dispatchEvent(new window.Event('pagehide')); dom.window.close();
    for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    assert.deepEqual(errors.map(e => e.message), [], 'No app runtime errors');
  });
  await import(`${pathToFileURL(fileURLToPath(app)).href}?notation-test=${++generation}`);
  const $ = id => document.getElementById(id);
  const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new window.Event('change', { bubbles: true })); };
  const pointer = (target, name, x = 100, y = 100, id = 1) => {
    const event = new window.Event(name, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, isPrimary: true, pointerId: id, clientX: x, clientY: y }); target.dispatchEvent(event); return event;
  };
  async function load(bytes, name = 'synthetic.schemka.json') {
    $('file-button').click();
    const file = new Blob([bytes]); Object.defineProperty(file, 'name', { value: name });
    Object.defineProperty($('project-file'), 'files', { value: [file], configurable: true });
    $('project-file').dispatchEvent(new window.Event('change', { bubbles: true })); $('load-project').click();
    for (let attempt = 0; attempt < 40 && $('file-dialog').open; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal($('file-dialog').open, false, $('file-feedback').textContent);
  }
  async function download(id = 'save-project') {
    const before = downloads.length;
    $('file-button').click(); $(id).click();
    assert.equal(downloads.length, before + 1, `Expected one new ${id} download: ${$('file-feedback').textContent}`);
    const result = downloads[before]; assert.ok(result?.blob); $('file-dialog').close();
    return Buffer.from(await result.blob.arrayBuffer());
  }
  return { $, document, window, change, pointer, load, download, viewport, captionMetrics };
}
function richLifecycleFixture() {
  const store = createStore(createProject('Synthetic rich lifecycle'));
  // These are current synthetic commands, never captured legacy fixture bytes.
  const run = command => store.execute({ ...command, ...(Object.hasOwn(command, 'properties') ? { properties: propertyEntries(command.properties) } : {}) }, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Shared names', documentation: 'Main documentation\n日本語 <img>' });
  const { viewId: otherViewId } = run({ type: 'createView', name: 'Shared names', documentation: 'Independent layout\r\nretained' });
  const { viewId: emptyViewId } = run({ type: 'createView', name: 'Empty retained view', documentation: 'No occurrences, still saved' });
  const a = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Collaboration', name: 'Shared collaboration', documentation: 'Private synthetic notes\nsecond line', properties: { owner: 'Synthetic', escaped: '<script>\r\n日本語 & "' }, zIndex: -7, bounds: { x: 40.1, y: 80.2, width: 220, height: 90 } });
  const b = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Role', name: 'Shared role', documentation: 'Role documentation', properties: { untouched: 'retained' }, zIndex: 19, bounds: { x: 360, y: 80, width: 190.5, height: 85 } });
  const relation = run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Flow', source: { kind: 'occurrence', id: a.occurrenceId }, target: { kind: 'occurrence', id: b.occurrenceId }, label: 'Shared flow', properties: { payload: 'Synthetic\nmessage', note: '<script>' }, routePoints: ([{ x: 280.1, y: 25.2 }, { x: 310, y: 28 }]).map(point => ({ kind: 'bend', point })), labelPosition: { x: 300.5, y: 18.2 } });
  const otherA = run({ type: 'addOccurrence', viewId: otherViewId, concept: { kind: 'element', id: a.elementId }, zIndex: 3, bounds: { x: 500, y: 310, width: 180, height: 80 } });
  const otherB = run({ type: 'addOccurrence', viewId: otherViewId, concept: { kind: 'element', id: b.elementId }, zIndex: -3, bounds: { x: 90, y: 205, width: 210, height: 90 } });
  run({ type: 'addConnection', viewId: otherViewId, relationshipId: relation.relationshipId, source: { kind: 'occurrence', id: otherA.occurrenceId }, target: { kind: 'occurrence', id: otherB.occurrenceId }, routePoints: ([{ x: 470, y: 380 }, { x: 260, y: 395 }]).map(point => ({ kind: 'bend', point })), labelPosition: { x: 330, y: 400.1 } });
  const hidden = run({ type: 'createElementAndOccurrence', viewId, elementType: 'Node', name: 'Unshown object', documentation: 'Retained without occurrences', properties: { hidden: 'yes' }, bounds: { x: 900, y: 0, width: 100, height: 60 } });
  run({ type: 'createRelationshipAndConnection', viewId, relationshipType: 'Association', source: { kind: 'occurrence', id: hidden.occurrenceId }, target: { kind: 'occurrence', id: a.occurrenceId }, label: 'Unshown relationship', properties: { hidden: 'yes' } });
  run({ type: 'removeOccurrence', viewId, occurrenceId: hidden.occurrenceId });
  return { state: deserializeProjectFile(serializeProjectFile(store.snapshot)), viewId, otherViewId, emptyViewId, a, b, relation };
}

const setStoredGeometry = (h, value) => {
  h.$('stored-geometry').checked = value;
  h.$('stored-geometry').dispatchEvent(new h.window.Event('change', { bubbles: true, cancelable: true }));
};

export { production, app, setup, richLifecycleFixture, setStoredGeometry };

export function simulatedCaptionBox(node) {
  const header = node.matches('.node-type'), size = header ? 10 : 14;
  const units = [...node.textContent].reduce((sum, char) => sum + (/\p{Mark}|\u200d|\ufe0f/u.test(char) ? 0 : /[WiMW]/.test(char) ? char === 'i' ? .25 : .95 : char === ' ' ? .3 : /[\u2e80-\uffff]|\p{Extended_Pictographic}/u.test(char) ? 1 : .56), 0);
  const width = size * units + (header ? [...node.textContent].length * (node.closest('.unknown-type') ? .8 : .35) : 0);
  const x = Number(node.getAttribute('x')) - (node.getAttribute('text-anchor') === 'middle' ? width / 2 : 0), y = Number(node.getAttribute('y')) - size * .75;
  return { x, y, width, height: size * .9 };
}

export function assertFittedCaption(node, type, bounds, index, rawName, reference = CURRENT_METAMODEL) {
  const appearance = notationElement(reference, type), slots = captionGrid(appearance, bounds);
  const header = node.querySelector('.node-type'), names = [...node.querySelectorAll('.node-title')];
  if (header) {
    const suffix = ` · ${String(index).padStart(2, '0')}`, badge = appearance.badge.toUpperCase();
    assert.ok(header.textContent.endsWith(suffix), 'Complete occurrence index');
    const shown = header.textContent.slice(0, -suffix.length);
    assert.ok(shown === badge || shown.endsWith('…') && badge.startsWith(shown.slice(0, -1)), 'Only badge may shorten');
    if (badge.startsWith('?')) assert.ok(shown.startsWith('?'));
  }
  assert.ok(names.length <= slots.filter(slot => !slot.header).length && names.length <= 2);
  for (const text of node.querySelectorAll('.node-type,.node-title')) {
    const ink = simulatedCaptionBox(text), slot = slots.find(item => ink.y >= item.top - 1e-7 && ink.y + ink.height <= item.top + item.height + 1e-7);
    assert.ok(slot, 'Measured ink stays in an eligible row');
    const span = captionSpan(appearance, bounds, slot, ink.height);
    assert.ok(ink.x >= span.left - 1e-7 && ink.x + ink.width <= span.right + 1e-7, 'Measured ink stays inside contour and clear of header glyph');
  }
  assert.ok(node.getAttribute('aria-label').includes(rawName));
  assert.ok(node.querySelector('title').textContent.includes(rawName));
  assert.equal(node.querySelector('img,script,foreignObject'), null);
}
