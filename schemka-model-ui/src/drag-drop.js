import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { shortcutKey } from './workbench.js';

const THRESHOLD = 6;
const WIDTH = 210, HEIGHT = 90;
const SOURCE_SELECTOR = '[data-drag-type],[data-drag-element-id],[data-drag-junction-id],[data-drag-relationship-id]';
const finite = Number.isFinite;
const clips = value => /^(auto|scroll|hidden|clip|overlay)$/.test(value);

/** Only the exact, trusted structural profile may supply palette types. */
export function allowedDragTypes(reference) {
  return CURRENT_CATALOG.id === reference?.id && CURRENT_CATALOG.version === reference?.version ? [...CURRENT_CATALOG.elementTypes, ...CURRENT_CATALOG.junctionTypes] : [];
}

/** DOMMatrix.inverse() includes SVG pan/fit, CSS zoom, layout and scrolling. */
export function inverseScreenPoint(matrix, clientX, clientY) {
  try {
    if (![clientX, clientY].every(finite) || !matrix || matrix.is2D === false ||
        !['a', 'b', 'c', 'd', 'e', 'f'].every(key => finite(matrix[key]))) return null;
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (!finite(determinant) || determinant === 0) return null;
    const inverse = matrix.inverse();
    if (!inverse || !['a', 'b', 'c', 'd', 'e', 'f'].every(key => finite(inverse[key]))) return null;
    const x = inverse.a * clientX + inverse.c * clientY + inverse.e;
    const y = inverse.b * clientX + inverse.d * clientY + inverse.f;
    return [x, y].every(finite) ? { x: x || 0, y: y || 0 } : null;
  } catch { return null; }
}

export function pointInsideRect(point, rect) {
  return Boolean(point && rect && [point.x, point.y, rect.left, rect.top, rect.right, rect.bottom].every(finite) &&
    rect.right > rect.left && rect.bottom > rect.top &&
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
}

// clientWidth excludes borders and scrollbars; account for their CSS-zoom scale.
function clippingRect(element) {
  const rect = element.getBoundingClientRect();
  const sx = element.offsetWidth > 0 ? (rect.right - rect.left) / element.offsetWidth : 1;
  const sy = element.offsetHeight > 0 ? (rect.bottom - rect.top) / element.offsetHeight : 1;
  const left = rect.left + (element.clientLeft || 0) * sx;
  const top = rect.top + (element.clientTop || 0) * sy;
  return {
    left, top,
    right: finite(element.clientWidth) ? left + element.clientWidth * sx : rect.right,
    bottom: finite(element.clientHeight) ? top + element.clientHeight * sy : rect.bottom,
  };
}

/** Reject clipped SVG portions and preserveAspectRatio letterboxes separately. */
export function canvasDropPoint(canvas, clientX, clientY, window = canvas?.ownerDocument?.defaultView) {
  try {
    const client = { x: clientX, y: clientY };
    if (canvas.isConnected === false || (canvas.getClientRects && !canvas.getClientRects().length) ||
        !pointInsideRect(client, canvas.getBoundingClientRect())) return null;
    if (window && finite(window.innerWidth) && finite(window.innerHeight) &&
        !pointInsideRect(client, { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight })) return null;
    const viewport = window?.visualViewport;
    if (viewport && !pointInsideRect(client, { left: viewport.offsetLeft, top: viewport.offsetTop,
      right: viewport.offsetLeft + viewport.width, bottom: viewport.offsetTop + viewport.height })) return null;
    for (let element = canvas; element; element = element.parentElement) {
      const style = window?.getComputedStyle?.(element);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return null;
      if (element === canvas || !style) continue;
      const clipX = clips(style.overflowX || style.overflow), clipY = clips(style.overflowY || style.overflow);
      if (!clipX && !clipY) continue;
      const rect = clippingRect(element);
      if (![rect.left, rect.top, rect.right, rect.bottom].every(finite) ||
          (clipX && (rect.right <= rect.left || clientX < rect.left || clientX > rect.right)) ||
          (clipY && (rect.bottom <= rect.top || clientY < rect.top || clientY > rect.bottom))) return null;
    }
    // Capture retargets pointer events, but elementFromPoint still tests the actual drop surface.
    const document = canvas.ownerDocument;
    if (document?.elementFromPoint) {
      const hit = document.elementFromPoint(clientX, clientY);
      if (!hit || (hit !== canvas && !canvas.contains(hit))) return null;
    }
    const point = inverseScreenPoint(canvas.getScreenCTM(), clientX, clientY);
    const values = canvas.getAttribute?.('viewBox')?.trim().split(/[\s,]+/).map(Number);
    const box = canvas.viewBox?.baseVal || (values?.length === 4 ? { x: values[0], y: values[1], width: values[2], height: values[3] } : null);
    return point && box && pointInsideRect(point, { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }) ? point : null;
  } catch { return null; }
}

/** Internal Pointer Events only; never read native/file/HTML transfer payloads.
 * beforeStart(source) may return false. onCommitted(result, command) may render/focus.
 * Call cancel() before changing views, fitting, replacing DOM or opening a dialog.
 */
export function installInternalDrag({ document, window, canvas, model, beforeStart = () => {}, onCommitted = () => {}, status = () => {}, readCreationSize = () => ({ width: WIDTH, height: HEIGHT }), onRelationshipDrop = null, previewPlacement = () => {}, clearPlacementPreview = () => {} }) {
  let pending = null, ghost = null, suppression = null, suppressionTimer = null, cancelledRelease = null, destroyed = false;
  const listeners = [];
  function listen(target, type, handler, options = false) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function report(text) { try { status(text); } catch { /* A status renderer must never repeat a committed command. */ } }
  function clearSuppression() {
    suppression = null;
    if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
    suppressionTimer = null;
  }
  function suppressAfterDrag(prior) {
    clearSuppression();
    suppression = { source: prior.source, pointerId: prior.pointerId, x: prior.x, y: prior.y };
    suppressionTimer = window.setTimeout(clearSuppression, 600);
  }
  function suppressActivation(event) {
    if (!suppression || event.detail === 0) return; // Native keyboard/button activation remains available.
    const { source, pointerId, x, y } = suppression, target = event.target;
    if (finite(event.pointerId) && event.pointerId >= 0 && event.pointerId !== pointerId) return;
    const related = target === source || source.contains?.(target) || target === canvas || canvas.contains?.(target);
    const commonAncestor = target?.contains?.(source) || target?.contains?.(canvas);
    const sameRelease = finite(event.clientX) && finite(event.clientY) && Math.hypot(event.clientX - x, event.clientY - y) <= 2;
    if (!related && !(commonAncestor && sameRelease)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function clean(prior) {
    clearPlacementPreview();
    ghost?.remove(); ghost = null;
    prior.source.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging');
    canvas.classList.remove('internal-drop-target', 'internal-drop-valid');
    // Clear pending before release: lostpointercapture may fire synchronously.
    try {
      if (!prior.source.hasPointerCapture || prior.source.hasPointerCapture(prior.pointerId)) prior.source.releasePointerCapture(prior.pointerId);
    } catch { /* Detached nodes/capture lost outside this helper are already cancelled. */ }
  }
  function cancel(reason) {
    const prior = pending; pending = null;
    if (!prior) return false;
    if (prior.dragging) { cancelledRelease = prior; suppressAfterDrag(prior); }
    clean(prior);
    if (prior.dragging) report(typeof reason === 'string' && reason ? reason : 'Перетаскивание отменено');
    return true;
  }
  function sourceData(source) {
    if (!source || source.isConnected === false || source.disabled || source.closest?.('[inert],[aria-disabled="true"]')) return null;
    if (source.dataset.dragRelationshipId && onRelationshipDrop) { const relationship = model.store.snapshot.relationships.find(item => item.id === source.dataset.dragRelationshipId); return relationship && model.conceptVisible({ kind: 'relationship', id: relationship.id }) ? { kind: 'relationship', id: relationship.id, label: `${relationship.type}: ${relationship.label || '(без подписи)'}` } : null; }
    if (source.dataset.dragJunctionId) {
      const junction = model.store.snapshot.junctions.find(item => item.id === source.dataset.dragJunctionId);
      return junction && (model.conceptVisible?.({ kind: 'junction', id: junction.id }) ?? true) ? { kind: 'junction', id: junction.id, label: `${junction.type}: ${junction.name || '(без названия)'}` } : null;
    }
    if (source.dataset.dragElementId) {
      const element = model.store.snapshot.elements.find(item => item.id === source.dataset.dragElementId);
      return element && (model.conceptVisible?.({ kind: 'element', id: element.id }) ?? true) ? { kind: 'element', id: element.id, label: `${element.type}: ${element.name || '(без названия)'}` } : null;
    }
    const type = source.dataset.dragType;
    return allowedDragTypes(model.store.snapshot.project.metamodel).includes(type) && (model.typeVisible?.(CURRENT_CATALOG.junctionTypes.includes(type) ? 'junction' : 'element', type) ?? true) ? { kind: 'palette', type, label: `Новый ${type}` } : null;
  }
  function stale(prior) {
    return prior.revision !== model.store.revision || prior.viewId !== model.viewId || !model.view || prior.source.isConnected === false;
  }
  function down(event) {
    clearSuppression(); // A fresh physical interaction can never be swallowed by a previous drag.
    cancelledRelease = null;
    if (destroyed || event.button !== 0 || event.isPrimary !== true || !finite(event.pointerId) ||
        ![event.clientX, event.clientY].every(finite)) return;
    // Recover if an earlier pointerup was lost; a second primary press starts a new gesture.
    if (pending) { cancel(); clearSuppression(); cancelledRelease = null; }
    if (!model.view || event.defaultPrevented) return;
    const source = event.target?.closest?.(SOURCE_SELECTOR);
    if (!source || canvas.contains(source) || !sourceData(source)) return;
    try { if (beforeStart(source) === false) return; }
    catch (error) { report(`Не выполнено: ${error.message}`); return; }
    const data = sourceData(source);
    if (!data || !model.view) return;
    pending = { source, data, pointerId: event.pointerId, viewId: model.viewId, revision: model.store.revision,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragging: false };
    try { source.setPointerCapture(event.pointerId); }
    catch (error) { cancel(); report(`Перетаскивание недоступно: ${error.message}`); }
    // No preventDefault before the threshold: ordinary clicks and focus are unchanged.
  }
  function preview(event) {
    const prior = pending;
    if (!prior || event.pointerId !== prior.pointerId) return null;
    if (stale(prior)) { cancel('Модель или представление изменились. Начните перетаскивание заново.'); return null; }
    if (![event.clientX, event.clientY].every(finite)) { cancel(); return null; }
    prior.x = event.clientX; prior.y = event.clientY;
    if (!prior.dragging && Math.hypot(prior.x - prior.startX, prior.y - prior.startY) < THRESHOLD) return null;
    if (!prior.dragging) {
      prior.dragging = true;
      ghost = document.createElement('div');
      ghost.className = 'internal-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = Array.from(prior.data.label).slice(0, 140).join('');
      Object.assign(ghost.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '10000' });
      document.body.append(ghost);
      prior.source.classList.add('is-dragging'); document.body.classList.add('is-dragging');
      canvas.classList.add('internal-drop-target');
      report('Перетащите на полотно · Esc: отмена');
    }
    const point = canvasDropPoint(canvas, prior.x, prior.y, window);
    ghost.style.transform = `translate(${prior.x + 14}px, ${prior.y + 14}px)`;
    ghost.dataset.valid = String(Boolean(point));
    canvas.classList.toggle('internal-drop-valid', Boolean(point));
    if(point && prior.data.kind!=='relationship'){const junction=prior.data.kind==='junction'||CURRENT_CATALOG.junctionTypes.includes(prior.data.type),size=readCreationSize(),width=junction?36:size.width,height=junction?36:size.height;previewPlacement({x:point.x-width/2,y:point.y-height/2,width,height});}else clearPlacementPreview();
    event.preventDefault();
    return point;
  }
  function move(event) {
    if (pending && event.pointerId === pending.pointerId && event.buttons !== undefined && !(event.buttons & 1)) { cancel(); return; }
    try { preview(event); } catch (error) { cancel(); report(`Перетаскивание отменено: ${error.message}`); }
  }
  function up(event) {
    const prior = pending;
    // Escape/blur may precede release by seconds. Re-arm only for that one pointer's
    // eventual release; the intervening period has no persistent click blackhole.
    if (!prior && cancelledRelease?.pointerId === event.pointerId) {
      const cancelled = cancelledRelease; cancelledRelease = null;
      if ([event.clientX, event.clientY].every(finite)) { cancelled.x = event.clientX; cancelled.y = event.clientY; }
      suppressAfterDrag(cancelled);
      return;
    }
    if (!prior || event.pointerId !== prior.pointerId) return;
    let point;
    try { point = preview(event); }
    catch (error) { cancel(); report(`Перетаскивание отменено: ${error.message}`); return; }
    if (pending !== prior) return;
    // Retire the gesture before release, core execution or callbacks. Repeated pointerup is inert.
    pending = null;
    if (prior.dragging) suppressAfterDrag(prior);
    clean(prior);
    if (!prior.dragging) return;
    event.preventDefault();
    if (!point || event.button !== 0 || stale(prior)) { report('Перетаскивание отменено: отпустите внутри полотна'); return; }
    if (prior.data.kind === 'relationship') { try { onRelationshipDrop(prior.data.id, point); } catch (error) { report(`Отношение не добавлено: ${error.message}`); } return; }
    // Core geometry has a 0.1-unit grid. Round the final centered bounds, not the pointer.
    const junction = prior.data.kind === 'junction' || CURRENT_CATALOG.junctionTypes.includes(prior.data.type);
    const size = readCreationSize(), width = junction ? 36 : size.width, height = junction ? 36 : size.height;
    const bounds = { x: Math.round((point.x - width / 2) * 10) / 10 || 0,
      y: Math.round((point.y - height / 2) * 10) / 10 || 0, width, height };
    const command = prior.data.kind === 'palette'
      ? { type: junction ? 'createJunctionAndOccurrence' : 'createElementAndOccurrence', viewId: prior.viewId, [junction ? 'junctionType' : 'elementType']: prior.data.type, name: `Новый ${prior.data.type}`, bounds }
      : { type: 'addOccurrence', viewId: prior.viewId, concept: { kind: prior.data.kind, id: prior.data.id }, bounds };
    let result;
    try { result = model.execute(command); }
    catch (error) { report(`Не выполнено: ${error.message}`); return; }
    if (result?.deferred) return;
    try {
      model.select({ kind: 'occurrence', id: result.created.occurrenceId });
      onCommitted(result, command);
      report(prior.data.kind === 'palette' ? `${prior.data.type} и его экземпляр созданы · семантика UNKNOWN` : 'Экземпляр общего элемента добавлен в текущий вид');
    } catch (error) { report(`Экземпляр уже добавлен, но интерфейс не обновлён полностью: ${error.message}`); }
  }
  function cancelled(event) { if (pending?.pointerId === event.pointerId) cancel(); }
  listen(document, 'pointerdown', down, true);
  listen(document, 'pointermove', move, { capture: true, passive: false });
  listen(document, 'pointerup', up, true);
  listen(document, 'pointercancel', cancelled, true);
  listen(document, 'lostpointercapture', cancelled, true);
  listen(document, 'keydown', event => {
    clearSuppression();
    if (event.key === 'Escape' && pending) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
    else if (pending && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(shortcutKey(event))) cancel();
  }, true);
  listen(window, 'blur', () => cancel());
  listen(window, 'resize', () => cancel());
  listen(document, 'click', suppressActivation, true);
  listen(document, 'dblclick', suppressActivation, true);
  listen(document, 'dragstart', event => {
    if (event.target?.closest?.(SOURCE_SELECTOR)) { event.preventDefault(); }
  }, true);
  // Prevent browser navigation for external file/HTML drops; there is no importing path.
  for (const type of ['dragover', 'drop']) listen(canvas, type, event => event.preventDefault());
  return {
    cancel,
    get active() { return Boolean(pending); },
    get dragging() { return Boolean(pending?.dragging); },
    destroy() { cancel(); clearSuppression(); cancelledRelease = null; listeners.splice(0).forEach(remove => remove()); destroyed = true; },
  };
}
