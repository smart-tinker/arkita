import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installViewport, visibleCanvasBox, zoomBox } from '../src/viewport.js';

test('camera zoom preserves its anchor and aspect ratio within bounded scales', () => {
  const box = { x: -20, y: 30, width: 900, height: 640 }, anchor = { x: 80, y: 90 };
  const zoomed = zoomBox(box, 2, anchor);
  assert.deepEqual(zoomed, { x: 30, y: 60, width: 450, height: 320 });
  assert.deepEqual(zoomBox(zoomed, .5, anchor), box);
  assert.equal(zoomBox(box, 1e9).width, 180);
  assert.equal(zoomBox(box, 1e-9).width, 9000);
  for (const factor of [0, -1, NaN, Infinity]) assert.throws(() => zoomBox(box, factor));
});

test('zoom outside the manual range stays monotonic and preserves the anchor without a boundary jump', () => {
  const anchor = { x: 80, y: 90 };
  for (const [width, factor, expected] of [[15350, .8, 15350], [15350, 1, 15350], [15350, 1.25, 12280], [100, 1.25, 100], [100, 1, 100], [100, .8, 125]]) {
    const box = { x: -20, y: 30, width, height: width / 2 }, zoomed = zoomBox(box, factor, anchor);
    assert.equal(zoomed.width, expected);
    assert.equal(zoomed.height / zoomed.width, box.height / box.width);
    assert.ok(Math.abs((anchor.x - zoomed.x) / zoomed.width - (anchor.x - box.x) / box.width) < 1e-12);
    assert.ok(Math.abs((anchor.y - zoomed.y) / zoomed.height - (anchor.y - box.y) / box.height) < 1e-12);
    if (expected === width) assert.deepEqual(zoomed, box);
  }
});

test('camera survives rerenders per view; reset, new file and a blocked draft behave independently', () => {
  const dom = new JSDOM('<svg id="canvas" viewBox="0 0 900 640"></svg><button id="zoom-in"></button><button id="zoom-out"></button><button id="zoom-value"></button>');
  const { document } = dom.window, canvas = document.getElementById('canvas');
  let view = 'first', blocked = false;
  const viewport = installViewport({ document, window: dom.window, canvas, viewId: () => view, blocked: () => blocked, beforeChange() {}, status() {} });
  const box = () => canvas.getAttribute('viewBox');
  document.getElementById('zoom-in').click(); const first = box();
  assert.equal(document.getElementById('zoom-value').textContent, '125%');
  canvas.setAttribute('viewBox', '0 0 900 640'); viewport.restore(); assert.equal(box(), first);
  blocked = true; document.getElementById('zoom-out').click(); assert.equal(box(), first);
  blocked = false; view = 'second'; canvas.setAttribute('viewBox', '0 0 900 640'); viewport.restore(); assert.equal(box(), '0 0 900 640');
  document.getElementById('zoom-out').click(); const second = box();
  view = 'first'; viewport.restore(); assert.equal(box(), first);
  document.getElementById('zoom-value').click(); assert.equal(box().split(' ')[2], '900');
  view = 'second'; viewport.restore(); assert.equal(box(), second);
  viewport.clear(); canvas.setAttribute('viewBox', '0 0 900 640'); viewport.restore(); assert.equal(box(), '0 0 900 640');
  dom.window.close();
});

function panSetup(t) {
  const dom = new JSDOM('<svg id="canvas" viewBox="0 0 900 640"></svg><button id="zoom-in"></button><button id="zoom-out"></button><button id="zoom-value"></button>');
  t.after(() => dom.window.close());
  const { document } = dom.window, canvas = document.getElementById('canvas'), captured = new Set();
  canvas.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } });
  canvas.setPointerCapture = id => captured.add(id); canvas.hasPointerCapture = id => captured.has(id); canvas.releasePointerCapture = id => captured.delete(id);
  let view = 'first';
  const viewport = installViewport({ document, window: dom.window, canvas, viewId: () => view, blocked: () => false, beforeChange() {}, status() {} });
  const pointer = (type, x = 100, y = 80) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 1, pointerId: 7, clientX: x, clientY: y }); canvas.dispatchEvent(event); return event;
  };
  const escape = () => canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return { document, window: dom.window, canvas, viewport, captured, pointer, escape,
    setView(value) { view = value; }, box: () => canvas.getAttribute('viewBox') };
}

test('pan ends at view restore/reset/clear; late pointer and Escape events cannot move the destination camera', t => {
  for (const boundary of ['restore', 'reset', 'clear']) {
    const h = panSetup(t);
    h.document.getElementById('zoom-in').click(); const first = h.box();
    h.setView('second'); h.canvas.setAttribute('viewBox', '0 0 900 640'); h.viewport.restore();
    h.document.getElementById('zoom-out').click(); const second = h.box();
    h.setView('first'); h.viewport.restore(); assert.equal(h.box(), first);
    h.pointer('pointerdown'); h.pointer('pointermove', 140, 110);
    assert.equal(h.viewport.active, true); assert.notEqual(h.box(), first);
    h.setView('second'); h.canvas.setAttribute('viewBox', '0 0 900 640'); h.viewport[boundary](); h.viewport.restore();
    const destination = h.box(); assert.equal(destination, boundary === 'restore' ? second : '0 0 900 640');
    assert.equal(h.viewport.active, false); assert.equal(h.captured.size, 0); assert.equal(h.canvas.classList.contains('panning'), false);
    assert.equal(h.pointer('pointermove', 500, 400).defaultPrevented, false);
    assert.equal(h.pointer('pointerup', 500, 400).defaultPrevented, false);
    h.escape(); assert.equal(h.box(), destination);
  }
});

test('unrestored view changes reject late movement and cancellation never paints the old view box into the new view', t => {
  for (const completion of ['move', 'escape', 'blur', 'cancel']) {
    const h = panSetup(t); h.pointer('pointerdown'); h.pointer('pointermove', 140, 110);
    h.setView('second'); const destination = '400 300 600 420'; h.canvas.setAttribute('viewBox', destination);
    if (completion === 'move') h.pointer('pointermove', 500, 400);
    if (completion === 'escape') h.escape();
    if (completion === 'blur') h.window.dispatchEvent(new h.window.Event('blur'));
    if (completion === 'cancel') h.viewport.cancel();
    assert.equal(h.viewport.active, false); assert.equal(h.box(), destination); assert.equal(h.captured.size, 0);
    h.pointer('pointerup', 500, 400); assert.equal(h.box(), destination);
  }
});

test('cancelling pan in its owning view restores that camera and releases pointer capture', t => {
  const h = panSetup(t), before = h.box();
  h.pointer('pointerdown'); h.pointer('pointermove', 140, 110); assert.notEqual(h.box(), before);
  h.viewport.cancel(); assert.equal(h.viewport.active, false); assert.equal(h.box(), before); assert.equal(h.captured.size, 0);
  h.canvas.setAttribute('viewBox', '1 2 3 4'); h.viewport.restore(); assert.equal(h.box(), before);
});

test('visible camera inverts the clipped client area including SVG letterboxes, borders and scrollbars', t => {
  const dom = new JSDOM('<div id="scroll"><svg></svg></div>'); t.after(() => dom.window.close());
  const scroll = dom.window.document.getElementById('scroll'), canvas = scroll.firstElementChild;
  canvas.getClientRects = () => [{}];
  canvas.getBoundingClientRect = () => ({ left: 80, top: 60, right: 980, bottom: 700, width: 900, height: 640 });
  scroll.getBoundingClientRect = () => ({ left: 100, top: 100, right: 700, bottom: 500, width: 600, height: 400 });
  for (const [key, value] of Object.entries({ offsetWidth: 300, offsetHeight: 200, clientLeft: 2, clientTop: 3, clientWidth: 286, clientHeight: 184 })) Object.defineProperty(scroll, key, { value });
  canvas.getScreenCTM = () => ({ a: .5, b: 0, c: 0, d: .5, e: 240, f: 60,
    inverse: () => ({ a: 2, b: 0, c: 0, d: 2, e: -480, f: -120 }) });
  assert.deepEqual(visibleCanvasBox(canvas, scroll), { x: -272, y: 92, width: 1144, height: 736 });
  canvas.getScreenCTM = () => null; assert.equal(visibleCanvasBox(canvas, scroll), null);
  canvas.getClientRects = () => []; assert.equal(visibleCanvasBox(canvas, scroll), null);
});

test('external camera gestures own a token, bypass their own blocked state and reject revision/view changes', t => {
  const dom = new JSDOM('<svg id="canvas" viewBox="0 0 900 640"></svg><svg id="map"></svg><button id="zoom-in"></button><button id="zoom-out"></button><button id="zoom-value"></button>');
  t.after(() => dom.window.close());
  const { document } = dom.window, canvas = document.getElementById('canvas'), map = document.getElementById('map');
  let view = 'first', revision = 0, changes = 0, captured;
  map.setPointerCapture = id => { captured = id; }; map.hasPointerCapture = id => captured === id; map.releasePointerCapture = () => { captured = undefined; };
  const viewport = installViewport({ document, window: dom.window, canvas, viewId: () => view, revision: () => revision,
    blocked: () => viewport.active, beforeChange() {}, status() {} });
  const unsubscribe = viewport.subscribe(() => changes++);
  const token = viewport.beginPan(map, 7); assert.equal(captured, 7); assert.equal(viewport.active, true);
  assert.equal(viewport.beginPan(map, 8), null); assert.equal(viewport.panBy({}, 200, 50), false);
  assert.equal(viewport.panBy(token, 200, 50), true); assert.deepEqual(viewport.camera, { x: 200, y: 50, width: 900, height: 640 });
  assert.equal(viewport.panBy(token, 400, -80), true); assert.equal(viewport.camera.x, 400, 'Deltas use the original camera');
  document.dispatchEvent(new dom.window.KeyboardEvent('keyup', { code: 'Space' })); assert.equal(viewport.isPanning(token), true, 'An unrelated key release does not finish a minimap drag');
  revision++; assert.equal(viewport.panBy(token, 600, 100), false); assert.equal(captured, undefined); assert.equal(viewport.camera.x, 0);
  const stale = viewport.beginPan(map, 8); viewport.panBy(stale, 40, 50); revision++; viewport.endPan(stale);
  assert.equal(viewport.camera.x, 0, 'Release validates the revision even without another move'); assert.equal(captured, undefined);
  const next = viewport.beginPan(map, 9); viewport.panBy(next, -300, 80);
  view = 'second'; canvas.setAttribute('viewBox', '10 20 600 400'); viewport.restore();
  assert.equal(viewport.active, false); assert.equal(captured, undefined); assert.equal(viewport.panBy(next, 999, 999), false);
  assert.deepEqual(viewport.camera, { x: 10, y: 20, width: 600, height: 400 });
  view = 'first'; viewport.restore(); assert.equal(viewport.camera.x, 0, 'Cancelled camera is retained for its original view');
  assert.ok(changes >= 5); const before = changes; unsubscribe(); document.getElementById('zoom-in').click(); assert.equal(changes, before);
});


test('local reveal margin is honored in negative coordinates and zero margin retains a positive camera',t=>{
 const dom=new JSDOM('<svg id="canvas" viewBox="0 0 100 80"></svg><button id="zoom-in"></button><button id="zoom-out"></button><button id="zoom-value"></button>');t.after(()=>dom.window.close());const {document}=dom.window,canvas=document.getElementById('canvas');let margin=40;const viewport=installViewport({document,window:dom.window,canvas,readMargin:()=>margin,viewId:()=> 'view',blocked:()=>false,beforeChange(){},status(){}}),bounds={x:-200,y:-180,width:120,height:90};viewport.reveal(bounds);let box=viewport.camera;assert.ok(box.x<=bounds.x-margin&&box.y<=bounds.y-margin);assert.ok(box.x+box.width>=bounds.x+bounds.width+margin);assert.ok(box.y+box.height>=bounds.y+bounds.height+margin);margin=0;canvas.setAttribute('viewBox','0 0 100 80');viewport.reveal(bounds);box=viewport.camera;assert.ok(box.width>0&&box.height>0);assert.ok(box.x<=bounds.x&&box.x+box.width>=bounds.x+bounds.width);
});
