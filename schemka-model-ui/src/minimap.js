import { inverseScreenPoint } from './drag-drop.js';
import { visibleCanvasBox } from './viewport.js';

const validBox = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
const contains = (box, point) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
const setBox = (element, box) => { for (const key of ['x', 'y', 'width', 'height']) element.setAttribute(key, box[key]); };

/** A disposable picture of the projected canvas; camera changes stay in viewport. */
export function installMinimap({ document, window, canvas, viewport, viewId, fallbackBounds, blocked, status }) {
  const $ = id => document.getElementById(id), panel = $('minimap-panel'), map = $('minimap');
  const drawing = $('minimap-drawing'), frame = $('minimap-camera'), scroll = $('canvas-scroll');
  const toggle = $('minimap-toggle'), abort = new window.AbortController();
  const on = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...options, signal: abort.signal });
  let world = null, drag = null, disposed = false;

  // Run before app.js cancels an inline draft on outside pointer/focus changes.
  for (const type of ['pointerdown', 'click']) on(document, type, event => {
    if (event.target.closest?.('#minimap-panel,#minimap-toggle,[data-command="minimap-toggle"]') && !viewport.isPanning(drag?.token) && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation();
      status('Завершите или отмените текущую правку перед работой с мини-картой.');
    }
  }, { capture: true });

  function sync() {
    if (drag && !viewport.isPanning(drag.token)) drag = null;
    map.classList.toggle('minimap-panning', Boolean(drag));
    if (panel.hidden || disposed) return;
    const camera = visibleCanvasBox(canvas, scroll);
    frame.toggleAttribute('hidden', !validBox(camera));
    if (!validBox(camera)) return;
    setBox(frame, camera);
    if (drag) return; // Keep the pointer's map transform fixed until its gesture ends.
    const bounds = validBox(world) ? world : camera;
    const left = Math.min(bounds.x, camera.x), top = Math.min(bounds.y, camera.y);
    const right = Math.max(bounds.x + bounds.width, camera.x + camera.width), bottom = Math.max(bounds.y + bounds.height, camera.y + camera.height);
    const margin = Math.max(12, Math.max(right - left, bottom - top) * .04);
    map.setAttribute('viewBox', `${left - margin} ${top - margin} ${right - left + margin * 2} ${bottom - top + margin * 2}`);
  }
  function cancel() {
    if (drag) viewport.endPan(drag.token, true);
    drag = null; sync();
  }
  function show(open) {
    cancel();
    panel.hidden = !open || !viewId();
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.hidden) { drawing.replaceChildren(); world = null; }
    else refresh();
  }
  function refresh() {
    if (disposed) return;
    toggle.disabled = !viewId();
    if (toggle.disabled) { show(false); return; }
    if (panel.hidden || !canvas.getClientRects().length) return;
    const copies = [...canvas.children].filter(item => item.matches('defs,g.node,g.connection')).map(item => item.cloneNode(true));
    drawing.replaceChildren(...copies);
    // Clones keep notation styles, but never editor targets, state or executable attributes.
    for (const item of drawing.querySelectorAll('.hit,.junction-hit,.inline-editor,.layout-handle,script,foreignObject')) item.remove();
    const ids = new Map([...drawing.querySelectorAll('[id]')].map((item, index) => [item.id, `minimap-definition-${index}`]));
    for (const item of drawing.querySelectorAll('*')) {
      item.classList.remove('selected', 'selection-anchor', 'dragging', 'marquee-preview', 'layout-edit-label');
      for (const attribute of [...item.attributes]) {
        const { name, value } = attribute;
        if (/^(?:data-|aria-|on)/i.test(name) || ['tabindex', 'role'].includes(name)) item.removeAttribute(name);
        else if (name === 'id') item.setAttribute(name, ids.get(value));
        else if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
          if (ids.has(value.slice(1))) item.setAttribute(name, `#${ids.get(value.slice(1))}`); else item.removeAttribute(name);
        } else if (value.includes('url(')) item.setAttribute(name, value.replace(/url\(\s*(['"]?)#([^\s)'";]+)\1\s*\)/g, (_, quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : 'none'));
      }
    }
    $('minimap-empty').hidden = Boolean(drawing.querySelector('g.node,g.connection'));
    world = null;
    try {
      const measured = drawing.getBBox({ stroke: true, markers: true });
      if (validBox(measured)) world = measured;
    } catch { /* DOM-only environments use the same projected geometry as Fit. */ }
    if (!world) world = fallbackBounds();
    sync();
  }
  on(toggle, 'click', () => { show(panel.hidden); if (!panel.hidden) map.focus({ preventScroll: true }); });
  on($('minimap-close'), 'click', () => { show(false); toggle.focus({ preventScroll: true }); });
  on(map, 'pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || panel.hidden || drag) return;
    const matrix = map.getScreenCTM(), point = inverseScreenPoint(matrix, event.clientX, event.clientY);
    const camera = visibleCanvasBox(canvas, scroll);
    if (!point || !validBox(camera)) return;
    const token = viewport.beginPan(map, event.pointerId);
    if (!token) return;
    event.preventDefault(); event.stopPropagation(); map.focus({ preventScroll: true });
    const inside = contains(camera, point);
    drag = { token, pointerId: event.pointerId, matrix, start: point,
      dx: inside ? 0 : point.x - camera.x - camera.width / 2,
      dy: inside ? 0 : point.y - camera.y - camera.height / 2 };
    viewport.panBy(token, drag.dx, drag.dy);
  });
  function move(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = inverseScreenPoint(drag.matrix, event.clientX, event.clientY);
    if (point) viewport.panBy(drag.token, drag.dx + point.x - drag.start.x, drag.dy + point.y - drag.start.y);
  }
  on(map, 'pointermove', move);
  on(map, 'pointerup', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const token = drag.token; move(event); viewport.endPan(token); sync();
  });
  on(map, 'pointercancel', event => { if (drag?.pointerId === event.pointerId) cancel(); });
  on(map, 'lostpointercapture', event => { if (drag?.pointerId === event.pointerId) cancel(); });
  on(panel, 'keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (drag) cancel(); else { show(false); toggle.focus({ preventScroll: true }); }
      return;
    }
    if (['Delete', 'F2'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); return; }
    if (event.target !== map || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const camera = visibleCanvasBox(canvas, scroll), token = validBox(camera) && viewport.beginPan();
    if (!token) return;
    const step = event.shiftKey ? .5 : .1;
    const dx = event.key === 'ArrowLeft' ? -camera.width * step : event.key === 'ArrowRight' ? camera.width * step : 0;
    const dy = event.key === 'ArrowUp' ? -camera.height * step : event.key === 'ArrowDown' ? camera.height * step : 0;
    viewport.panBy(token, dx, dy); viewport.endPan(token);
  });
  const unsubscribe = viewport.subscribe(sync);
  const resize = () => { cancel(); sync(); };
  const observer = window.ResizeObserver ? new window.ResizeObserver(resize) : null;
  observer?.observe(canvas); observer?.observe(scroll);
  on(scroll, 'scroll', resize, { passive: true });
  on(window, 'resize', resize); on(window, 'blur', cancel);
  on(document, 'visibilitychange', () => { if (document.hidden) cancel(); else refresh(); });
  function dispose() {
    if (disposed) return;
    show(false); disposed = true; unsubscribe(); observer?.disconnect(); abort.abort();
  }
  on(window, 'pagehide', dispose);
  return { refresh, sync, cancel, dispose };
}
