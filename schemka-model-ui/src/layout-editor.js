import { inverseScreenPoint } from './drag-drop.js';
import { copyLayout, sameLayout, moveLayout, nudgeLayout, insertBendpoint, removeBendpoint, resetBendpoints, resetLabelPosition } from './layout-edit.js';

/** Explicit, selected-connection editor. Previews never mutate the core store. */
export function installLayoutEditor({ document, window, canvas, model, enabled, blocked, geometryFor, preview, redraw, status, storedGeometry = () => true, constrainLayout = layout => layout }) {
  let editing = null, selectedIndex = -1, pending = null, armed = null, generation = 0;
  let suppression = null, timer = null;
  const svg = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const editable = kind => kind === 'anchor' || storedGeometry();
  const hiddenGeometryMessage = 'Сейчас доступны только закреплённые якоря. Для правки изгибов и подписи включите показ сохранённых маршрутов и подписей.';
  const report = text => { try { status(text); } catch { /* Feedback cannot repeat a commit. */ } };
  function context() {
    const view = model.view, selection = model.selection;
    const connection = selection?.kind === 'connection' && view?.connections.find(item => item.id === selection.id);
    return connection ? { view, connection, viewId: model.viewId, revision: model.store.revision } : null;
  }
  function valid(request) {
    const current = context();
    return Boolean(enabled() && !blocked() && current && current.viewId === request.viewId && current.connection.id === request.connectionId &&
      current.revision === request.revision && editing === request.connectionId && (!request.kind || editable(request.kind)));
  }
  function capture(current) {
    return { viewId: current.viewId, connectionId: current.connection.id, revision: current.revision, layout: copyLayout(current.connection) };
  }
  function clearSuppression() { suppression = null; if (timer !== null) window.clearTimeout(timer); timer = null; }
  function suppress(prior) {
    clearSuppression(); suppression = { connectionId: prior.connectionId, x: prior.clientX, y: prior.clientY };
    timer = window.setTimeout(clearSuppression, 600);
  }
  function clean(prior) {
    try { if (canvas.hasPointerCapture?.(prior.pointerId)) canvas.releasePointerCapture(prior.pointerId); } catch { /* Lost capture already cancelled. */ }
    canvas.classList.remove('layout-dragging');
  }
  function cancel() {
    const prior = pending, wasActive = Boolean(prior || armed);
    pending = null; armed = null; canvas.classList.remove('layout-add-armed');
    const addButton = document.getElementById('layout-add-point'); if (addButton) addButton.textContent = 'Добавить после выбранной';
    if (wasActive) generation++;
    if (prior) { if (prior.dragging || prior.kind === 'add') suppress(prior); clean(prior); }
    if (wasActive) { if (model.view) preview(model.view); update(model.view); report('Изменение геометрии отменено'); }
    return wasActive;
  }
  function reset() { cancel(); editing = null; selectedIndex = -1; clearSuppression(); refresh(); }
  function update(view) {
    const connection = view?.connections.find(item => item.id === editing);
    if (!connection) return;
    const anchor = geometryFor(connection, view);
    for (const handle of canvas.querySelectorAll('.layout-handle')) {
      const point = handle.dataset.layoutKind === 'label' ? anchor : connection.routePoints[Number(handle.dataset.layoutIndex)]?.point;
      if (point) handle.setAttribute('transform', `translate(${point.x} ${point.y})`);
    }
  }
  function refresh() {
    const current = context();
    if (!enabled() || !current || current.connection.id !== editing) {
      if (editing !== null) cancel(); editing = null; selectedIndex = -1;
    }
    if (pending) return;
    canvas.querySelector('.connection-layout-handles')?.remove();
    for (const text of canvas.querySelectorAll('.layout-edit-label')) text.classList.remove('layout-edit-label');
    canvas.classList.toggle('layout-add-armed', Boolean(armed));
    if (!editing) return;
    selectedIndex = Math.min(selectedIndex, current.connection.routePoints.length - 1);
    if (selectedIndex >= 0 && !editable(current.connection.routePoints[selectedIndex].kind)) selectedIndex = -1;
    const overlay = svg('g', { class: 'connection-layout-handles', 'aria-label': 'Геометрия выбранного соединения' });
    let scale = 1;
    try { const matrix = canvas.getScreenCTM(); scale = Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) || 1; } catch { /* Default-size focus handles. */ }
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    const r = 6 / scale;
    const makeHandle = (kind, index, label) => {
      const handle = svg('g', { class: `layout-handle${kind !== 'label' && index === selectedIndex ? ' selected' : ''}`, tabindex: 0, role: 'button',
        'aria-label': label, 'aria-disabled': String(!editable(kind)), 'data-focus-key': `layout-${editing}-${kind}-${index}`, 'data-layout-kind': kind, ...(kind !== 'label' ? { 'data-layout-index': index } : {}) });
      handle.append(svg('circle', { class: 'layout-handle-hit', r: r * 1.7 }), kind === 'label'
        ? svg('path', { class: 'layout-handle-mark', d: `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z` })
        : svg('circle', { class: 'layout-handle-mark', r }));
      return handle;
    };
    const handles = current.connection.routePoints.map((record, index) => !editable(record.kind) ? null : makeHandle(record.kind, index, `${record.kind === 'anchor' ? 'Якорь присоединения' : 'Точка'} ${index + 1}: ${record.point.x}, ${record.point.y}. Стрелки: 10 единиц; Shift: 1${record.kind === 'bend' ? '; Delete: удалить точку' : ''}`));
    handles.forEach((handle, index) => { if (handle && index !== selectedIndex) overlay.append(handle); });
    overlay.append(makeHandle('label', -1, storedGeometry() ? 'Положение подписи. Стрелки: 10 единиц; Shift: 1; Delete: автоматическое положение' : `Положение отображаемой подписи. ${hiddenGeometryMessage}`));
    if (handles[selectedIndex]) overlay.append(handles[selectedIndex]);
    canvas.append(overlay);
    canvas.querySelector(`[data-id="${editing}"] > .relationship-label`)?.classList.add('layout-edit-label');
    update(current.view);
  }
  function focusHandle(target) {
    const selector = target.kind === 'label' ? '[data-layout-kind="label"]' : `[data-layout-index="${target.index}"]`;
    canvas.querySelector(selector)?.focus({ preventScroll: true });
  }
  function apply(layout, request, message, focusTarget = null) {
    if (!valid(request)) { report('Модель или представление изменились. Начните изменение геометрии заново.'); return false; }
    if (sameLayout(layout, request.layout)) return false;
    let committed = false;
    try {
      model.store.execute({ type: 'updateConnectionLayout', viewId: request.viewId, connectionId: request.connectionId, ...layout }, request.revision);
      committed = true;
      if (focusTarget && focusTarget.kind !== 'label') selectedIndex = focusTarget.index;
      model.select({ kind: 'connection', id: request.connectionId }); redraw();
      if (focusTarget) focusHandle(focusTarget);
      else document.getElementById('layout-point-select')?.focus({ preventScroll: true });
      report(message); return true;
    } catch (error) {
      report(committed ? `Геометрия сохранена, но интерфейс не обновлён полностью: ${error.message}` : `Геометрия не изменена: ${error.message}`);
      return committed;
    }
  }
  function appendInspector(container) {
    const current = context();
    if (!current) return;
    if (!enabled() || editing !== current.connection.id) { editing = null; selectedIndex = -1; }
    const section = document.createElement('section'); section.className = 'layout-editor-controls';
    const button = (id, text, action, disabled = false) => {
      const node = document.createElement('button'); node.id = id; node.type = 'button'; node.textContent = text; node.disabled = disabled;
      node.addEventListener('click', action); section.append(node); return node;
    };
    const toggle = button('layout-edit-toggle', editing ? 'Завершить правку геометрии' : 'Редактировать геометрию', () => {
      if (blocked() || !enabled()) return;
      cancel(); editing = editing ? null : current.connection.id; selectedIndex = -1; redraw();
    }, !enabled());
    toggle.setAttribute('aria-pressed', String(Boolean(editing)));
    const note = document.createElement('p'); note.className = 'inspector-note';
    note.textContent = enabled() && !storedGeometry() ? hiddenGeometryMessage : enabled() ? 'Только это соединение в этом виде. Точки и подпись: перетащить или сфокусировать и двигать стрелками на 10 единиц; Shift: 1. Esc: отмена. Изменения сохраняются в JSON.'
      : 'Для правки включите показ сохранённых маршрутов и подписей.';
    section.append(note); container.append(section);
    if (!editing) return;
    const select = document.createElement('select'); select.id = 'layout-point-select'; select.setAttribute('aria-label', 'Исходная точка маршрута');
    for (const [value, text] of [[-1, 'Перед первой точкой'], ...current.connection.routePoints.flatMap((record, index) => editable(record.kind) ? [[index, `${record.kind === 'anchor' ? 'Якорь' : 'Точка'} ${index + 1}: ${record.point.x}; ${record.point.y}`]] : [])]) {
      const option = document.createElement('option'); option.value = String(value); option.textContent = text; select.append(option);
    }
    selectedIndex = Math.min(selectedIndex, current.connection.routePoints.length - 1); select.value = String(selectedIndex);
    select.addEventListener('change', () => { if (pending) return; cancel(); selectedIndex = Number(select.value); redraw(); }); section.append(select);
    button('layout-add-point', armed ? 'Отменить добавление точки' : 'Добавить после выбранной', () => {
      if (blocked()) return;
      if (!storedGeometry()) { report(hiddenGeometryMessage); return; }
      if (armed) { cancel(); redraw(); return; }
      const value = context(); if (!value || value.connection.routePoints.length >= 128) return;
      cancel(); armed = { ...capture(value), afterIndex: selectedIndex }; generation++; redraw();
      report('Щёлкните на полотне: точка будет добавлена после выбранного индекса. Esc: отмена.');
    }, !storedGeometry() || current.connection.routePoints.length >= 128);
    const action = (transform, message) => {
      if (blocked()) return;
      if (!storedGeometry()) { report(hiddenGeometryMessage); return; }
      cancel();
      const value = context(); if (!value) return; const request = capture(value);
      try { const layout = transform(request.layout); selectedIndex = Math.min(selectedIndex, layout.routePoints.length - 1); apply(layout, request, message); }
      catch (error) { report(`Геометрия не изменена: ${error.message}`); }
    };
    button('layout-delete-point', 'Удалить выбранную точку', () => action(layout => removeBendpoint(layout, selectedIndex), 'Точка удалена только из этого соединения'), !storedGeometry() || selectedIndex < 0 || current.connection.routePoints[selectedIndex]?.kind === 'anchor');
    button('layout-reset-route', 'Сбросить маршрут', () => action(resetBendpoints, 'Изгибы сброшены; якоря и подпись сохранены'), !storedGeometry() || !current.connection.routePoints.some(point => point.kind === 'bend'));
    button('layout-reset-label', 'Сбросить подпись', () => action(resetLabelPosition, 'Положение подписи сброшено; маршрут сохранён'), !storedGeometry() || current.connection.labelPosition === null);
  }
  function pointerPoint(event) {
    try {
      const matrix = canvas.getScreenCTM(), point = inverseScreenPoint(matrix, event.clientX, event.clientY);
      return point ? { point, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].join(',') } : null;
    } catch { return null; }
  }
  function down(event) {
    // Mouse and pen may each be primary; only the captured pointer owns this transaction.
    if (pending) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    clearSuppression();
    if (event.button !== 0 || event.isPrimary !== true || !Number.isFinite(event.pointerId)) return;
    const handle = event.target.closest?.('.layout-handle,.layout-edit-label');
    if (!armed && (!handle || !editing)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!enabled() || blocked()) { report('Сначала завершите текущее действие'); return; }
    const current = context(); if (!current || editing !== current.connection.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const coordinates = pointerPoint(event); if (!coordinates) { cancel(); report('Преобразование полотна недоступно; геометрия не изменена'); return; }
    const kind = armed ? 'add' : handle.dataset.layoutKind === 'anchor' ? 'anchor' : handle.dataset.layoutKind === 'bend' ? 'bend' : 'label';
    if (!editable(kind)) { report(hiddenGeometryMessage); return; }
    const request = armed || capture(current);
    if (!valid(request)) { cancel(); report('Модель изменилась; повторите действие'); return; }
    const index = ['bend', 'anchor'].includes(kind) ? Number(handle.dataset.layoutIndex) : -1;
    if (['bend', 'anchor'].includes(kind)) {
      selectedIndex = index;
      const select = document.getElementById('layout-point-select'); if (select) select.value = String(index);
      const remove = document.getElementById('layout-delete-point'); if (remove) remove.disabled = kind === 'anchor';
      for (const item of canvas.querySelectorAll('.layout-handle')) item.classList.toggle('selected', item === handle);
      handle.parentElement.append(handle);
    }
    if (kind !== 'add') {
      const focusTarget = handle.classList.contains('layout-handle') ? handle : canvas.querySelector('[data-layout-kind="label"]');
      focusTarget?.focus({ preventScroll: true });
    }
    const anchor = ['bend', 'anchor'].includes(kind) ? current.connection.routePoints[index].point : geometryFor(current.connection, current.view);
    pending = { ...request, kind, index, anchor: { x: anchor.x, y: anchor.y }, start: coordinates.point, matrix: coordinates.matrix,
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, dragging: false };
    armed = null; generation++;
    try { canvas.setPointerCapture(event.pointerId); } catch { cancel(); report('Захват указателя недоступен; геометрия не изменена'); }
  }
  function candidate(event) {
    const prior = pending; if (!prior || event.pointerId !== prior.pointerId) return null;
    if (!valid(prior)) { cancel(); report('Модель или представление изменились. Правка отменена.'); return null; }
    const coordinates = pointerPoint(event);
    if (!coordinates || coordinates.matrix !== prior.matrix) { cancel(); report('Преобразование полотна изменилось. Правка отменена.'); return null; }
    prior.clientX = event.clientX; prior.clientY = event.clientY;
    if (Math.hypot(event.clientX - prior.startX, event.clientY - prior.startY) >= 6) prior.dragging = true;
    if (prior.kind !== 'add' && !prior.dragging) return null;
    const next = prior.kind === 'add' ? insertBendpoint(prior.layout, prior.afterIndex, coordinates.point)
      : moveLayout(prior.layout, { kind: prior.kind, index: prior.index, anchor: prior.anchor }, coordinates.point.x - prior.start.x, coordinates.point.y - prior.start.y);
    return constrainLayout(next, { kind: prior.kind, index: prior.kind === 'add' ? prior.afterIndex + 1 : prior.index }, event);
  }
  // Capture before app-level inline-editor dismissal and ordinary node dragging.
  document.addEventListener('pointerdown', event => {
    if (event.target.closest?.('.layout-editor-controls') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation(); report('Сначала завершите текущее действие'); return;
    }
    if (canvas.contains(event.target)) down(event);
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (typeof event.buttons === 'number' && !(event.buttons & 1)) { cancel(); return; }
    try {
      const layout = candidate(event); if (!layout || !pending) return;
      const view = model.view, connection = view.connections.find(item => item.id === pending.connectionId);
      Object.assign(connection, layout); canvas.classList.add('layout-dragging'); preview(view); update(view);
    } catch (error) { cancel(); report(`Правка отменена: ${error.message}`); }
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.button !== 0 || event.isPrimary !== true) { cancel(); return; }
    const prior = pending;
    try {
      const layout = candidate(event); if (!pending) return;
      pending = null; generation++; clean(prior);
      if (prior.dragging || prior.kind === 'add') suppress(prior);
      if (!layout || !apply(layout, prior, 'Геометрия изменена только в текущем соединении')) { preview(model.view); update(model.view); }
      if (prior.kind === 'add') { selectedIndex = prior.afterIndex + 1; redraw(); }
    } catch (error) { cancel(); report(`Правка отменена: ${error.message}`); }
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (pending?.pointerId === event.pointerId) cancel(); }, true);
  for (const type of ['blur', 'resize']) window.addEventListener(type, cancel);
  window.addEventListener('scroll', () => { if (pending) cancel(); }, true);
  for (const type of ['click', 'dblclick']) document.addEventListener(type, event => {
    const handle = event.target.closest?.('.layout-handle');
    const related = suppression && (event.target.closest?.(`[data-id="${suppression.connectionId}"]`) || handle);
    if (handle || (related && event.detail !== 0)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => {
    const handle = event.target.closest?.('.layout-handle');
    if (event.key === 'Escape' && (pending || armed)) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); redraw(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      // Native text/selector navigation and modified/browser/IME shortcuts remain untouched.
      if (!handle || handle.parentElement !== canvas.querySelector('.connection-layout-handles') || document.activeElement !== handle || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const target = { kind: handle.dataset.layoutKind, index: Number(handle.dataset.layoutIndex) };
      if (pending || armed) { cancel(); redraw(); focusHandle(target); return; }
      if (!editable(target.kind)) { report(hiddenGeometryMessage); return; }
      if (blocked()) return;
      const current = context(); if (!current || !enabled() || current.connection.id !== editing) return;
      const request = capture(current), step = event.shiftKey ? 1 : 10;
      const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
      const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
      try {
        if (target.kind === 'label') target.anchor = geometryFor(current.connection, current.view);
        // Each accepted key event (including deliberate key repeat) is one undoable step.
        apply(nudgeLayout(request.layout, target, dx, dy), request, 'Геометрия сдвинута только в текущем соединении', target);
      } catch (error) { report(`Геометрия не изменена: ${error.message}`); }
      return;
    }
    if (!handle || !['Delete', 'Backspace'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (pending || armed) { cancel(); redraw(); return; }
    if (blocked()) return;
    const current = context(); if (!current || !enabled() || current.connection.id !== editing) return;
    if (!editable(handle.dataset.layoutKind)) { report(hiddenGeometryMessage); return; }
    const request = capture(current), label = handle.dataset.layoutKind === 'label';
    const index = Number(handle.dataset.layoutIndex);
    try { apply(label ? resetLabelPosition(request.layout) : removeBendpoint(request.layout, index), request, label ? 'Положение подписи сброшено' : 'Точка удалена'); }
    catch (error) { report(`Геометрия не изменена: ${error.message}`); }
  }, true);
  window.addEventListener('pagehide', () => { cancel(); clearSuppression(); });
  return { get active() { return Boolean(pending || armed); }, get generation() { return generation; }, appendInspector, refresh, update, cancel, reset };
}
