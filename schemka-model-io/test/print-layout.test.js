import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { calculatePrintLayout, buildPrintDocument } from '../src/print-layout.js';
const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="-20 -20 1000 1000"><text x="10" y="20">Кириллица</text></svg>';
test('fit and tiled print layout cover all content without an extra empty boundary page', () => {
  const fit = calculatePrintLayout(svg); assert.equal(fit.pages, 1); assert.equal(fit.columns, 1); assert.equal(fit.rows, 1);
  const doubled = calculatePrintLayout(svg, { paper: 'A4', scale: 200 }); assert.equal(doubled.columns, 2); assert.equal(doubled.rows, 2); assert.equal(doubled.pages, 4); const last = doubled.tiles.at(-1); assert.ok(last.x + doubled.contentWidthPx >= doubled.renderWidthPx); assert.ok(last.y + doubled.contentHeightPx >= doubled.renderHeightPx);
  const landscape = calculatePrintLayout(svg, { landscape: true }); assert.ok(landscape.pageWidthMm > landscape.pageHeightMm); assert.throws(() => calculatePrintLayout(svg, { scale: 201 })); assert.throws(() => calculatePrintLayout(svg, { html: 'bad' }));
});
test('print wrapper contains only validated static SVG and the exact tile count', () => {
  const { html, layout } = buildPrintDocument(svg, { scale: 200 }), dom = new JSDOM(html); assert.equal(dom.window.document.querySelectorAll('section').length, layout.pages); assert.equal(dom.window.document.querySelector('script,iframe,object'), null); assert.ok(html.includes('Кириллица')); assert.equal(Number(dom.window.document.querySelector('svg').getAttribute('width')), layout.renderWidthPx); dom.window.close();
  assert.throws(() => buildPrintDocument('<svg onload="bad()"/>'));
});
