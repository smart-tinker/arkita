import { drawingFor } from './visual-drawings.js';

export { GESTURE_DEFAULTS, gesturePreferences } from '../../schemka-model-io/src/preferences-profile.js';
import { GESTURE_DEFAULTS, gesturePreferences } from '../../schemka-model-io/src/preferences-profile.js';

const refKey = ref => ref ? `${ref.kind}:${ref.id}` : 'root';
const round = value => Math.round(value * 10) / 10 || 0;

/** Grid is applied first; a visible sibling guide can take precedence inside a screen-space threshold. */
export function constrainMove(view, refs, anchor, dx, dy, options, threshold, bypass = false) {
  const item = drawingFor(view, anchor); if (!item?.bounds || bypass) return { dx: round(dx), dy: round(dy), guides: [] };
  const guides = [], selected = new Set(refs.map(refKey));
  if (options.snap) { dx = Math.round((item.bounds.x + dx) / options.step) * options.step - item.bounds.x; dy = Math.round((item.bounds.y + dy) / options.step) * options.step - item.bounds.y; }
  if (options.guides) {
    const nodes = [...view.occurrences.map(item => ({ kind: 'occurrence', item })), ...(view.visualNodes ?? []).map(item => ({ kind: 'visualNode', item }))];
    const targets = nodes.filter(node => !selected.has(`${node.kind}:${node.item.id}`) && refKey(node.item.parent) === refKey(item.parent));
    for (const [axis, size, delta] of [['x', 'width', dx], ['y', 'height', dy]]) {
      let best = null;
      for (const node of targets) for (const factor of [0, .5, 1]) for (const other of [0, .5, 1]) {
        const target = node.item.bounds[axis] + node.item.bounds[size] * other, moving = item.bounds[axis] + delta + item.bounds[size] * factor, distance = target - moving;
        if (Math.abs(distance) <= threshold && (!best || Math.abs(distance) < Math.abs(best.distance))) best = { distance, target };
      }
      if (best) { if (axis === 'x') dx += best.distance; else dy += best.distance; guides.push({ axis, coordinate: best.target }); }
    }
  }
  return { dx: round(dx), dy: round(dy), guides };
}

export function installGestureTools({ document, window, model, canvas, viewport, openDialog, blocked, status, redraw, onScroll, preferences = null }) {
  let options = { ...GESTURE_DEFAULTS }, draft = null, generation = 0, tracking = null, frame = null, lastTime = null;
  try { options = preferences ? preferences.get('gestures') : gesturePreferences(JSON.parse(window.localStorage.getItem('arkita.diagram-gestures') ?? '{}')); } catch { /* Invalid local settings use defaults. */ }
  const ns = 'http://www.w3.org/2000/svg', node = (tag, text) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; };
  const svg = (tag, attributes) => { const item = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value); return item; };
  const dialog = node('dialog'), form = node('form'), title = node('h2', 'Выделение, сетка и привязка'), fields = node('div'), actions = node('div'); dialog.id = 'gesture-settings-dialog'; title.id = 'gesture-settings-title'; dialog.setAttribute('aria-labelledby', title.id); form.id = 'gesture-settings-form'; actions.className = 'dialog-actions';
  const controls = {};
  const add = (key, label, choices = null) => { const row = node('label', label), input = node(choices ? 'select' : 'input'); input.id = `gesture-${key}`; if (choices) for (const [value, text] of choices) { const option = node('option', text); option.value = value; input.append(option); } else input.type = 'checkbox'; row.append(input); fields.append(row); controls[key] = input; };
  add('grid', 'Показывать сетку'); add('snap', 'Привязывать к сетке'); add('step', 'Шаг сетки', [1, 5, 10, 20, 50, 100].map(value => [value, `${value}`])); add('guides', 'Привязывать к направляющим'); add('autoscroll', 'Прокручивать у края во время перемещения'); add('mode', 'Правило рамки', [['contain', 'Полностью внутри'], ['touch', 'Касание']]); add('scope', 'Что выбирать рамкой', [['all', 'Фигуры и линии'], ['nodes', 'Только фигуры'], ['lines', 'Только линии'], ['associated', 'Фигуры и внутренние связи']]);
  fields.append(node('p', 'Alt временно отключает привязку к сетке и направляющим. Настройки не изменяют модель.'));
  const cancelButton = node('button', 'Отмена'); cancelButton.type = 'button'; cancelButton.addEventListener('click', cancel); const apply = node('button', 'Применить'); apply.type = 'submit'; actions.append(cancelButton, apply); form.append(title, fields, actions); dialog.append(form); document.body.append(dialog);
  const trigger = node('button', 'Выделение и привязка…'); trigger.type = 'button'; trigger.id = 'gesture-settings-button';
  [...document.querySelectorAll('.app-menu')].find(item => item.querySelector('summary')?.textContent === 'Вид')?.querySelector('.menu-items')?.append(trigger);
  trigger.addEventListener('click', () => { if (blocked()) return; for (const [key, input] of Object.entries(controls)) if (input.type === 'checkbox') input.checked = options[key]; else input.value = options[key]; openDialog(dialog.id); draft = true; generation++; });
  function cancel() { draft = null; generation++; if (dialog.open) dialog.close(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }); dialog.addEventListener('close', () => { draft = null; generation++; }); fields.addEventListener('input', () => generation++); fields.addEventListener('change', () => generation++);
  form.addEventListener('submit', event => { event.preventDefault(); if (!draft) return; options = gesturePreferences({...options,...Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : key === 'step' ? Number(input.value) : input.value]))}); try { if (preferences) preferences.update('gestures',options); else window.localStorage.setItem('arkita.diagram-gestures', JSON.stringify(options)); } catch { status('Настройки применены на эту сессию; сохранить их локально не удалось.'); } cancel(); redraw(); });
  function paintGrid() {
    canvas.querySelector('.editor-grid')?.remove(); canvas.querySelector('#arkita-editor-grid')?.remove(); if (!options.grid) return;
    const [x, y, width, height] = canvas.getAttribute('viewBox').split(/\s+/).map(Number), pattern = svg('pattern', { id: 'arkita-editor-grid', width: options.step, height: options.step, patternUnits: 'userSpaceOnUse' }); pattern.append(svg('path', { d: `M ${options.step} 0 L 0 0 0 ${options.step}`, fill: 'none', stroke: 'var(--muted)', 'stroke-opacity': '.18', 'stroke-width': '.5' }));
    canvas.querySelector('defs')?.append(pattern); const grid = svg('g', { class: 'editor-grid', 'pointer-events': 'none', 'aria-hidden': 'true' }); grid.append(svg('rect', { x, y, width, height, fill: 'url(#arkita-editor-grid)' })); canvas.insertBefore(grid, [...canvas.children].find(item => item.localName !== 'defs') ?? null);
  }
  function paintGuides(guides) {
    canvas.querySelector('.editor-guides')?.remove(); if (!guides.length) return;
    const [x, y, width, height] = canvas.getAttribute('viewBox').split(/\s+/).map(Number), group = svg('g', { class: 'editor-guides', 'pointer-events': 'none', 'aria-hidden': 'true' });
    for (const guide of guides) group.append(svg('line', guide.axis === 'x' ? { x1: guide.coordinate, x2: guide.coordinate, y1: y, y2: y + height } : { y1: guide.coordinate, y2: guide.coordinate, x1: x, x2: x + width })); canvas.append(group);
  }
  function stop() { tracking = null; lastTime = null; if (frame !== null) window.cancelAnimationFrame(frame); frame = null; paintGuides([]); }
  function tick(time) {
    frame = null; if (!tracking || !options.autoscroll) return;
    const event = tracking, rect = canvas.closest('.canvas-scroll')?.getBoundingClientRect() ?? canvas.getBoundingClientRect(), elapsed = Math.min(50, lastTime === null ? 16 : time - lastTime); lastTime = time;
    const speed = (point, low, high) => point < low || point > high ? 0 : point < low + 32 ? -(1 - (point - low) / 32) : point > high - 32 ? 1 - (high - point) / 32 : 0;
    const dx = speed(event.clientX, rect.left, rect.right) * elapsed * .35, dy = speed(event.clientY, rect.top, rect.bottom) * elapsed * .35;
    if (dx || dy) { viewport()?.scrollCamera(dx, dy); paintGrid(); onScroll(event); }
    if (tracking) frame = window.requestAnimationFrame(tick);
  }
  function track(event) { if (!options.autoscroll) return; tracking = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey, pointerId: event.pointerId }; if (frame === null) frame = window.requestAnimationFrame(tick); }
  preferences?.subscribe((value,changed) => { if (changed.includes('gestures')) { options = value.gestures; stop(); paintGrid(); } });
  const unsubscribe = viewport()?.subscribe(paintGrid); window.addEventListener('pagehide', () => { stop(); unsubscribe?.(); }); window.addEventListener('blur', stop);
  return { cancel, stop, track, paintGrid, snapPoint(point, bypass = false) { return options.snap && !bypass ? { x: round(Math.round(point.x / options.step) * options.step), y: round(Math.round(point.y / options.step) * options.step) } : { ...point }; }, get options() { return { ...options }; }, get active() { return Boolean(draft); }, get generation() { return generation; }, constrain(view, refs, anchor, dx, dy, event) { const matrix = canvas.getScreenCTM(), scale = matrix ? Math.hypot(matrix.a, matrix.b) || 1 : 1, result = constrainMove(view, refs, anchor, dx, dy, options, 5 / scale, event.altKey); paintGuides(result.guides); return result; } };
}
