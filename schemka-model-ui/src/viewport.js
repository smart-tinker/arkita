import { inverseScreenPoint } from './drag-drop.js';

/** The rendered SVG may be letterboxed and clipped by its scroll container. */
export function visibleCanvasBox(canvas, scroll) {
  if (!canvas.getClientRects().length) return null;
  const rect = canvas.getBoundingClientRect(), clip = scroll.getBoundingClientRect();
  const sx = scroll.offsetWidth > 0 ? clip.width / scroll.offsetWidth : 1;
  const sy = scroll.offsetHeight > 0 ? clip.height / scroll.offsetHeight : 1;
  const clipLeft = clip.left + scroll.clientLeft * sx, clipTop = clip.top + scroll.clientTop * sy;
  const left = Math.max(rect.left, clipLeft), top = Math.max(rect.top, clipTop);
  const right = Math.min(rect.right, scroll.offsetWidth > 0 ? clipLeft + scroll.clientWidth * sx : clip.right);
  const bottom = Math.min(rect.bottom, scroll.offsetHeight > 0 ? clipTop + scroll.clientHeight * sy : clip.bottom);
  if (right <= left || bottom <= top) return null;
  const matrix = canvas.getScreenCTM();
  const points = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => inverseScreenPoint(matrix, x, y));
  if (points.some(point => !point)) return null;
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  return { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
}

export function zoomBox(box, factor, center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }) {
  if (![box.x, box.y, box.width, box.height, factor, center.x, center.y].every(Number.isFinite) || box.width <= 0 || box.height <= 0 || factor <= 0) throw Error('Некорректный масштаб');
  // Fit may leave the manual range; a limit must never reverse the requested zoom.
  const minimum = Math.min(180, box.width), maximum = Math.max(9000, box.width);
  const width = Math.max(minimum, Math.min(maximum, box.width / factor)), ratio = width / box.width;
  return { x: center.x + (box.x - center.x) * ratio, y: center.y + (box.y - center.y) * ratio, width, height: box.height * ratio };
}

/** The camera belongs to the view session, never to model geometry or history. */
export function installViewport({ document, window, readZoomAtPointer = () => true, readMargin = () => 24, canvas, viewId, revision = () => 0, blocked, beforeChange, status }) {
  const cameras = new Map(), listeners = new Set();
  let pan = null, space = false;
  const read = () => { const [x, y, width, height] = canvas.getAttribute('viewBox').split(/\s+/).map(Number); return { x, y, width, height }; };
  const notify = () => { for (const listener of listeners) listener(); };
  function paint(box, remember = true) {
    canvas.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    if (remember && viewId()) cameras.set(viewId(), box);
    document.getElementById('zoom-value').textContent = `${Math.round(900 / box.width * 100)}%`;
    notify();
  }
  function zoom(factor, center) {
    if (!viewId() || blocked()) return;
    beforeChange(); paint(zoomBox(read(), factor, center || undefined));
  }
  function finish(cancelled = false) {
    if (!pan) return;
    const previous = pan; pan = null;
    if (cancelled) {
      cameras.set(previous.viewId, previous.box);
      if (previous.viewId === viewId()) paint(previous.box);
    }
    if (previous.target?.hasPointerCapture?.(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId);
    canvas.classList.remove('panning');
    notify();
  }
  function beginPan(target, pointerId) {
    if (!viewId() || pan || blocked()) return null;
    beforeChange();
    pan = { viewId: viewId(), revision: revision(), target, pointerId, box: read() };
    target?.setPointerCapture?.(pointerId);
    return pan;
  }
  function panBy(token, dx, dy) {
    if (!token || token !== pan) return false;
    if (token.viewId !== viewId() || token.revision !== revision()) { finish(true); return false; }
    if (![dx, dy, token.box.x + dx, token.box.y + dy].every(Number.isFinite)) return false;
    paint({ ...token.box, x: token.box.x + dx, y: token.box.y + dy });
    return true;
  }
  function cancel() {
    space = false; canvas.classList.remove('pan-ready'); finish(true);
  }
  canvas.addEventListener('wheel', event => {
    if (!viewId() || blocked()) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const center = readZoomAtPointer() ? inverseScreenPoint(canvas.getScreenCTM(), event.clientX, event.clientY) : undefined;
      zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, center);
    } else {
      beforeChange(); const box = read(), rect = canvas.getBoundingClientRect();
      const scale = Math.max(box.width / rect.width, box.height / rect.height);
      if (!Number.isFinite(scale)) return;
      paint({ ...box, x: box.x + (event.shiftKey ? event.deltaY : event.deltaX) * scale, y: box.y + (event.shiftKey ? 0 : event.deltaY) * scale });
    }
  }, { passive: false });
  canvas.addEventListener('pointerdown', event => {
    if ((event.button !== 1 && !(space && event.button === 0)) || !viewId() || blocked()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const matrix = canvas.getScreenCTM(), start = inverseScreenPoint(matrix, event.clientX, event.clientY);
    if (!start) return;
    const token = beginPan(canvas, event.pointerId);
    if (!token) return;
    Object.assign(token, { matrix, start }); canvas.classList.add('panning');
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (!pan || pan.target !== canvas || pan.pointerId !== event.pointerId) return;
    if (pan.viewId !== viewId() || pan.revision !== revision()) { finish(true); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    const point = inverseScreenPoint(pan.matrix, event.clientX, event.clientY);
    if (point) panBy(pan, pan.start.x - point.x, pan.start.y - point.y);
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (pan?.target === canvas && pan.pointerId === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
  }, true);
  canvas.addEventListener('pointercancel', () => finish(true));
  canvas.addEventListener('lostpointercapture', () => { if (pan?.target === canvas) finish(true); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pan) { event.preventDefault(); finish(true); }
    if (event.code === 'Space' && !blocked() && event.target.closest('#canvas')) { event.preventDefault(); space = true; canvas.classList.add('pan-ready'); }
  });
  document.addEventListener('keyup', event => { if (event.code === 'Space') { space = false; canvas.classList.remove('pan-ready'); if (pan?.target === canvas) finish(); } });
  window.addEventListener('blur', cancel);
  document.getElementById('zoom-in').addEventListener('click', () => zoom(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoom(0.8));
  document.getElementById('zoom-value').addEventListener('click', () => {
    if (blocked() || !viewId()) return;
    beforeChange(); paint(zoomBox(read(), read().width / 900));
    status('Масштаб сброшен');
  });
  return {
    get camera() { return read(); },
    scrollCamera(dx, dy) {
      const matrix = canvas.getScreenCTM(), point = inverseScreenPoint(matrix, dx, dy), zero = inverseScreenPoint(matrix, 0, 0);
      if (!point || !zero || !viewId()) return; const box = read();
      paint({ ...box, x: Math.max(-1000000, Math.min(1000000, box.x + point.x - zero.x)), y: Math.max(-1000000, Math.min(1000000, box.y + point.y - zero.y)) });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    beginPan, panBy,
    endPan(token, cancelled = false) { if (token && token === pan) finish(cancelled || token.viewId !== viewId() || token.revision !== revision()); },
    isPanning(token) { return Boolean(token && token === pan); },
    reveal(bounds) {
      if (!viewId()) return;
      const box = read(),requested=readMargin(),margin=Number.isInteger(requested)&&requested>=0&&requested<=500?requested:24,scale = Math.max(1, (bounds.width + margin*2) / box.width, (bounds.height + margin*2) / box.height);
      const width = box.width * scale, height = box.height * scale;
      const x = Math.max(bounds.x + bounds.width + margin - width, Math.min(bounds.x - margin, box.x - (width - box.width) / 2));
      const y = Math.max(bounds.y + bounds.height + margin - height, Math.min(bounds.y - margin, box.y - (height - box.height) / 2));
      if (x !== box.x || y !== box.y || width !== box.width || height !== box.height) { finish(); paint({ x, y, width, height }); }
    },
    restore() { if (pan && (pan.viewId !== viewId() || pan.revision !== revision())) finish(true); paint(cameras.get(viewId()) || read(), false); },
    reset() { finish(true); cameras.delete(viewId()); },
    clear() { finish(true); cameras.clear(); },
    cancel,
    get active() { return Boolean(pan); },
  };
}
