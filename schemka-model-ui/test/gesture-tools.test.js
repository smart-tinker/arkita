import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { constrainMove, installGestureTools } from '../src/gesture-tools.js';
import { marqueeDrawings, marqueeRectangle } from '../src/drawing-selection.js';
const view = { occurrences: [{ id: 'a', bounds: { x: -13, y: 5, width: 20, height: 20 }, parent: null }, { id: 'b', bounds: { x: 50, y: 40, width: 20, height: 20 }, parent: null }, { id: 'child', bounds: { x: 8, y: 8, width: 5, height: 5 }, parent: { kind: 'occurrence', id: 'a' } }], connections: [{ id: 'c', source: { kind: 'occurrence', id: 'a' }, target: { kind: 'occurrence', id: 'b' } }], visualNodes: [{ id: 'n', kind: 'note', bounds: { x: 25, y: 10, width: 20, height: 20 }, parent: null }], visualConnectors: [{ id: 'v', source: { kind: 'occurrence', id: 'a' }, target: { kind: 'visualNode', id: 'n' } }] };
const a = { kind: 'occurrence', id: 'a' };

test('grid supports negative coordinates, temporary bypass and guides only in the same geometric parent', () => {
  assert.deepEqual(constrainMove(view, [a], a, 4, 8, { snap: true, step: 10 }, 5), { dx: 3, dy: 5, guides: [] });
  assert.deepEqual(constrainMove(view, [a], a, 4, 8, { snap: true, step: 10, guides: true }, 5, true), { dx: 4, dy: 8, guides: [] });
  const out = constrainMove(view, [a], a, 43, 15, { guides: true }, 5); assert.equal(out.dx, 43); assert.ok(out.guides.some(item => item.axis === 'x' && item.coordinate === 50));
  const distantParent = { ...view, occurrences: [view.occurrences[0], { ...view.occurrences[1], parent: a }], visualNodes: [] }; assert.deepEqual(constrainMove(distantParent, [a], a, 43, 15, { guides: true }, 5).guides, []);
});

test('marquee modes distinguish full containment, touching, visual records, lines and associated closure', () => {
  const bounds = () => ({ x: -13, y: 5, width: 83, height: 55 }), rectangle = marqueeRectangle({ x: 46, y: 31 }, { x: -14, y: 4 });
  const full = marqueeDrawings(view, rectangle, bounds); assert.ok(full.some(ref => ref.kind === 'visualNode')); assert.ok(!full.some(ref => ref.id === 'b')); assert.ok(!full.some(ref => ref.kind === 'connection'));
  assert.ok(marqueeDrawings(view, rectangle, bounds, { mode: 'touch', scope: 'lines' }).some(ref => ref.kind === 'visualConnector'));
  const linked = marqueeDrawings(view, rectangle, bounds, { scope: 'associated' }); assert.ok(linked.some(ref => ref.id === 'v')); assert.ok(!linked.some(ref => ref.id === 'c'));
  assert.deepEqual(marqueeDrawings(view, rectangle, bounds, { scope: 'nodes' }), full);
});

test('autoscroll is bounded, stops on cancellation/blur and ignores a late scheduled callback', t => {
  const dom = new JSDOM('<body><details class="app-menu"><summary>Вид</summary><div class="menu-items"></div></details><div class="canvas-scroll"><svg id="canvas" viewBox="0 0 900 640"><defs/></svg></div></body>', { url: 'https://arkita.test' }); t.after(() => dom.window.close());
  const { window } = dom, { document } = window, canvas = document.getElementById('canvas');
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  let sequence = 0, callbacks = new Map(), scrolls = []; window.requestAnimationFrame = fn => { callbacks.set(++sequence, fn); return sequence; }; window.cancelAnimationFrame = id => callbacks.delete(id);
  canvas.parentElement.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 640 });
  const ui = installGestureTools({ document, window, model: {}, canvas, viewport: () => ({ scrollCamera: (dx, dy) => scrolls.push({ dx, dy }), subscribe: () => () => {} }), openDialog: id => document.getElementById(id).showModal(), blocked: () => false, status() {}, redraw() {}, onScroll() {} });
  ui.track({ clientX: 899, clientY: 300 }); const late = [...callbacks.values()][0]; callbacks.clear(); late(16); assert.equal(scrolls.length, 1); assert.ok(scrolls[0].dx > 0 && scrolls[0].dx < 18); assert.equal(scrolls[0].dy, 0);
  ui.stop(); late(100); assert.equal(scrolls.length, 1); assert.equal(callbacks.size, 0);
  ui.track({ clientX: 899, clientY: 300 }); window.dispatchEvent(new window.Event('blur')); assert.equal(callbacks.size, 0);
  document.getElementById('gesture-settings-button').click(); document.getElementById('gesture-grid').checked = true; document.getElementById('gesture-snap').checked = false; document.getElementById('gesture-settings-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.equal(ui.options.grid, true); assert.equal(ui.options.snap, false); assert.deepEqual(ui.snapPoint({ x: 13, y: -13 }), { x: 13, y: -13 }); ui.paintGrid(); assert.ok(canvas.querySelector('.editor-grid'));
});
