import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { exportViewSvg, assertSvgExport, SVG_EXPORT_LIMIT } from '../src/svg-export.js';
import { notationBox, notationElement, notationDefs, notationLine, notationRelationship } from '../src/notation.js';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';

const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
const minimal = `${header}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="8">日本語 &amp; &lt;script&gt; 👩🏽‍💻</text></svg>`;
function fixture(t, theme = 'light') {
  const dom = new JSDOM('<!doctype html><html><head></head><body><svg id="canvas" xmlns="http://www.w3.org/2000/svg"></svg></body></html>', { pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window;
  document.documentElement.dataset.theme = theme;
  const style = document.createElement('style'); style.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8'); document.head.append(style);
  const canvas = document.getElementById('canvas'), svg = (tag, attributes = {}, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  canvas.append(notationDefs(document));
  const node = svg('g', { class: `${notationElement(CURRENT_METAMODEL, 'Goal').className} selected selection-anchor dragging`, 'data-kind': 'occurrence', 'data-id': 'occ-example', transform: 'translate(-460 -120)', tabindex: 0 });
  node.append(notationBox(document, notationElement(CURRENT_METAMODEL, 'Goal'), { width: 160, height: 80 }),
    svg('text', { class: 'node-title', x: 22, y: 36 }, '日本語 <script> & " 😀'),
    svg('text', { class: 'stereotype-label', x: 80, y: -30, 'text-anchor': 'middle' }, '«Outside label»'),
    svg('foreignObject', {}, 'never exported'), svg('script', {}, 'evil()'));
  const connection = svg('g', { class: 'connection selected', 'data-kind': 'connection', 'data-id': 'conn-example' });
  const line = notationLine(document, notationRelationship(CURRENT_METAMODEL, 'ReadWriteAccess'));
  line.setAttribute('d', 'M -300 -80 C -220 -300, 60 -300, 130 -80');
  connection.append(svg('path', { class: 'hit', d: 'M 9999 9999 L 9999 10000' }), line,
    svg('text', { class: 'relationship-label', x: 1800, y: -700, 'text-anchor': 'middle' }, 'Distant label & data'),
    svg('text', { class: 'multiplicity-label', x: -280, y: -75 }, '1..*'));
  const anchor = svg('g', { class: 'view-anchor', 'data-kind': 'connection' }); anchor.append(svg('circle', { cx: 9999, cy: 9999, r: 20 }));
  canvas.append(connection, node, anchor, svg('rect', { class: 'selection-marquee', x: 99999, y: 99999, width: 10, height: 10 }));
  const bounds = { x: -500, y: -320, width: 720, height: 300 };
  return { window, document, canvas, node, connection, line, bounds };
}
const parse = (h, text) => new h.window.DOMParser().parseFromString(text, 'image/svg+xml');

test('SVG snapshot preserves actual shapes, both markers, routes and literal Unicode, resolving the existing theme', t => {
  for (const theme of ['light', 'dark']) {
    const h = fixture(t, theme), before = h.canvas.outerHTML;
    const text = exportViewSvg({ canvas: h.canvas, bounds: h.bounds, title: 'View <svg onload="x"> & 日本語 😀' }), document = parse(h, text);
    assert.equal(document.querySelector('parsererror'), null);
    assert.equal(document.documentElement.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(document.documentElement.querySelector('title').textContent, 'View <svg onload="x"> & 日本語 😀');
    assert.equal(document.querySelector('text[x="22"]').textContent, '日本語 <script> & " 😀');
    assert.equal(document.querySelector('polygon').getAttribute('points'), h.node.querySelector('polygon').getAttribute('points'));
    const line = [...document.querySelectorAll('path')].find(item => item.getAttribute('d') === h.line.getAttribute('d'));
    assert.ok(line); assert.equal(line.getAttribute('marker-start'), 'url(#notation-canvas-open)'); assert.equal(line.getAttribute('marker-end'), 'url(#notation-canvas-open)');
    assert.equal(document.querySelectorAll('marker').length, 7);
    assert.equal(document.querySelector('polygon').getAttribute('stroke'), '#000000', 'selection outline was removed without mutating the selected canvas');
    assert.equal(document.querySelector('polygon').getAttribute('fill'), '#cbcbff');
    assert.equal(line.getAttribute('stroke'), h.window.getComputedStyle(h.document.documentElement).getPropertyValue('--link'));
    assert.equal(document.documentElement.querySelector('rect').getAttribute('fill'), h.window.getComputedStyle(h.document.documentElement).getPropertyValue('--canvas'));
    assert.doesNotMatch(text, /var\(|<script|<foreignObject|class=|tabindex=|data-|selected|9999|@import|<style/);
    assert.equal(document.querySelector('[onload]'), null);
    assert.equal(document.querySelectorAll('g[transform="translate(-460 -120)"]').length, 1);
    assert.ok(document.querySelector('text').getAttribute('font-family'));
    assert.equal(h.canvas.outerHTML, before); assert.equal(h.document.querySelectorAll('#canvas').length, 1);
  }
});

test('bounds cover distant and negative text, include occurrence transforms and do not follow the screen viewBox', t => {
  const h = fixture(t); h.canvas.setAttribute('viewBox', '10000 10000 1 1');
  h.node.querySelector('.stereotype-label').textContent = 'Long '.repeat(35);
  const original = h.canvas.outerHTML;
  const first = parse(h, exportViewSvg({ canvas: h.canvas, bounds: h.bounds }));
  const [x, y, width, height] = first.documentElement.getAttribute('viewBox').split(' ').map(Number);
  assert.ok(x < -1500, 'long translated stereotype fits to the left'); assert.ok(y < -700);
  assert.ok(x + width > 1800); assert.ok(y + height > -20);
  assert.equal(h.canvas.outerHTML, original);
  h.canvas.setAttribute('viewBox', '-10 -10 10 10');
  assert.equal(parse(h, exportViewSvg({ canvas: h.canvas, bounds: h.bounds })).documentElement.getAttribute('viewBox'), first.documentElement.getAttribute('viewBox'));
});

test('measured text preserves its exported width and an export error removes only the temporary clone', t => {
  const h = fixture(t), original = h.canvas.outerHTML;
  h.window.SVGElement.prototype.getBBox = () => ({ x: 0, y: -12, width: 71.25, height: 15 });
  const document = parse(h, exportViewSvg({ canvas: h.canvas, bounds: h.bounds }));
  for (const text of document.querySelectorAll('text')) { assert.equal(text.getAttribute('textLength'), '71.25'); assert.equal(text.getAttribute('lengthAdjust'), 'spacingAndGlyphs'); }
  h.canvas.querySelector('.node-title').textContent = '\u0000';
  assert.throws(() => exportViewSvg({ canvas: h.canvas, bounds: h.bounds }), /Недопустимый статический SVG/);
  assert.equal(h.document.querySelectorAll('#canvas').length, 1);
  h.canvas.querySelector('.node-title').textContent = '日本語 <script> & " 😀'; assert.equal(h.canvas.outerHTML, original);
});

test('Meaning satellite inline widths survive styling for tiny and ordinary silhouettes without exporting a style attribute', t => {
  const h = fixture(t), appearance = notationElement(CURRENT_METAMODEL, 'Meaning');
  for (const size of [20, 180]) {
    h.node.setAttribute('class', `${appearance.className} selected`);
    h.node.replaceChildren(notationBox(h.document, appearance, { width: size, height: size }));
    const source = [...h.node.querySelectorAll('.meaning-bubble')].map(item => item.style.strokeWidth);
    assert.equal(source.length, 2); assert.ok(source.every(value => Number(value) < 1));
    const document = parse(h, exportViewSvg({ canvas: h.canvas, bounds: h.bounds }));
    assert.deepEqual([...document.querySelectorAll('ellipse')].map(item => item.getAttribute('stroke-width')), source);
    assert.equal(document.querySelector('[style]'), null);
    assert.deepEqual([...h.node.querySelectorAll('.meaning-bubble')].map(item => item.style.strokeWidth), source);
  }
});

test('static SVG boundary accepts literal text and rejects active XML, external references, broken XML and oversized UTF-8', () => {
  assert.equal(assertSvgExport(minimal), minimal);
  for (const malicious of [
    '<script>evil()</script>', '<foreignObject><div>HTML</div></foreignObject>', '<image href="https://example.invalid/a"/>',
    '<g onload="evil()"/>', '<style>@import "https://example.invalid/a";</style>', '<animate attributeName="x"/>',
    '<g style="fill:red"/>', '<use href="#id"/>', '<g xmlns="http://example.invalid"/>', '<g fill="url(https://example.invalid/a)"/>',
    '<g fill="&#117;rl(http://example.invalid/a)"/>', '<g fill="u&#x72;l(#external)"/>', '<g fill="var(--missing)"/>',
    '<path marker-end="url(#notation-canvas-missing)"/>', '<!DOCTYPE x>', '<![CDATA[x]]>', '<?xml-stylesheet href="bad"?>',
    '<text>&undefined;</text>', '<text>&AMP;</text>', '<text>&#0;</text>', '<text>&#xD800;</text>', '<g id="same" id="same"/>', '<g></path>',
  ]) assert.throws(() => assertSvgExport(minimal.replace('</svg>', `${malicious}</svg>`)), /Недопустимый статический SVG/, malicious);
  for (const invalid of [null, {}, '<svg/>', minimal + '<svg/>', minimal.replace('</svg>', ''), header + '<'.repeat(128 * 1024), minimal.replace('</text>', 'x'.repeat(SVG_EXPORT_LIMIT) + '</text>'), minimal.replace('</text>', '界'.repeat(Math.floor(SVG_EXPORT_LIMIT / 3)) + '</text>')]) assert.throws(() => assertSvgExport(invalid));
});
