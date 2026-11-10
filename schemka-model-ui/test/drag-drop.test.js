import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createController } from '../src/controller.js';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createStore, createProject, CURRENT_CATALOG, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { allowedDragTypes, inverseScreenPoint, pointInsideRect, canvasDropPoint, installInternalDrag } from '../src/drag-drop.js';

function matrix(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
  return { a, b, c, d, e, f, inverse() {
    const det = a * d - b * c;
    return matrix(d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det);
  } };
}
const rect = (left = 100, top = 100, right = 1000, bottom = 740) => ({ left, top, right, bottom });

// Minimal DOM-policy harness with capture/bubble ordering, pointer capture and timers.
// It deliberately has no native DataTransfer, HTML insertion or browser dependency.
class Node {
  constructor(tag = 'div') {
    this.tag = tag; this.dataset = {}; this.style = {}; this.children = []; this.listeners = new Map();
    this.attributes = new Map(); this.classes = new Set(); this.parentElement = null; this.parentNode = null;
    this.isConnected = true; this.captured = new Set(); this.captureCalls = []; this.releaseCalls = [];
    this.rect = rect(); this.computedStyle = { overflow: 'visible', display: 'block', visibility: 'visible' };
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value),
      toggle: (value, force = !this.classes.has(value)) => { force ? this.classes.add(value) : this.classes.delete(value); return force; },
    };
  }
  set className(value) { this.classes = new Set(value.split(' ')); }
  get className() { return [...this.classes].join(' '); }
  addEventListener(type, handler, options) {
    const handlers = this.listeners.get(type) || [];
    handlers.push({ handler, capture: options === true || Boolean(options?.capture) }); this.listeners.set(type, handlers);
  }
  removeEventListener(type, handler, options) {
    const capture = options === true || Boolean(options?.capture);
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.handler !== handler || item.capture !== capture));
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  contains(target) { for (let node = target; node; node = node.parentNode) if (node === this) return true; return false; }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; node.parentElement = this.tag === 'document' ? null : this; node.ownerDocument = this.ownerDocument; this.children.push(node); } }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    this.parentNode = null; this.parentElement = null; this.isConnected = false;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.includes('data-drag-type') && ('dragType' in node.dataset || 'dragElementId' in node.dataset)) return node;
      if (selector.includes('inert') && (node.attributes.has('inert') || node.getAttribute('aria-disabled') === 'true')) return node;
    }
    return null;
  }
  getBoundingClientRect() { return this.rect; }
  getClientRects() { return this.hidden ? [] : [this.rect]; }
  setPointerCapture(id) { this.captureCalls.push(id); if (this.captureError) throw Error('capture unavailable'); this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) {
    this.releaseCalls.push(id); this.captured.delete(id);
    if (this.releaseError) throw Error('capture already gone');
    dispatch(this, 'lostpointercapture', { pointerId: id });
  }
}

function dispatch(target, type, fields = {}) {
  const event = { target, type, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 7, isPrimary: true,
    clientX: 20, clientY: 20, detail: type === 'click' || type === 'dblclick' ? 1 : 0, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.immediate = true; this.stopped = true; }, ...fields };
  Object.defineProperties(event, Object.getOwnPropertyDescriptors(fields));
  const path = []; for (let node = target; node; node = node.parentNode) path.push(node);
  for (const capture of [true, false]) {
    for (const current of capture ? [...path].reverse() : path) {
      event.currentTarget = current;
      for (const item of [...current.listeners.get(type) || []]) {
        if (item.capture === capture) item.handler(event);
        if (event.immediate) break;
      }
      if (event.stopped) return event;
    }
  }
  return event;
}

function setup({ store = createDemo(), beforeStart, onCommitted } = {}) {
  const window = new Node('window'), document = new Node('document'), body = new Node('body');
  document.ownerDocument = document; document.body = body; document.defaultView = window;
  window.append(document); document.ownerDocument = document; document.append(body);
  window.innerWidth = 1600; window.innerHeight = 1000;
  window.getComputedStyle = element => element.computedStyle;
  const timers = new Map(); let nextTimer = 1;
  window.setTimeout = callback => { const id = nextTimer++; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.flushTimers = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); };
  document.createElement = tag => { const node = new Node(tag); node.ownerDocument = document; return node; };
  const canvas = document.createElement('svg'), scroll = document.createElement('div'), palette = document.createElement('aside');
  scroll.computedStyle.overflow = 'auto'; scroll.rect = rect(); body.append(scroll, palette); scroll.append(canvas);
  canvas.viewBox = { baseVal: { x: 0, y: 0, width: 900, height: 640 } };
  canvas.ctm = matrix(1, 0, 0, 1, 100, 100); canvas.getScreenCTM = () => canvas.ctm;
  document.elementFromPoint = () => canvas;
  const model = createController(store);
  const commands = [], reports = [], commits = [];
  let executeError = false, selectError = false;
  const adapted = Object.create(model);
  adapted.execute = command => { if (executeError) throw Error('command failed'); const result = model.execute(command); commands.push(command); return result; };
  adapted.select = selection => { if (selectError) throw Error('selection failed'); model.select(selection); };
  const ui = installInternalDrag({ document, window, canvas, model: adapted, beforeStart,
    onCommitted(result, command) { commits.push({ result, command }); onCommitted?.(result, command); }, status: text => reports.push(text) });
  function source(type = 'Service') { const node = document.createElement('button'); node.dataset.dragType = type; palette.append(node); return node; }
  function tree(elementId = model.store.snapshot.elements[0].id) { const node = document.createElement('button'); node.dataset.dragElementId = elementId; palette.append(node); return node; }
  const move = (target, x = 400, y = 350, fields = {}) => dispatch(target, 'pointermove', { clientX: x, clientY: y, ...fields });
  const up = (target, x = 400, y = 350, fields = {}) => dispatch(target, 'pointerup', { clientX: x, clientY: y, ...fields });
  function drag(target, x = 400, y = 350) { dispatch(target, 'pointerdown'); move(target, x, y); return up(target, x, y); }
  return { ui, model, adapted, document, window, body, canvas, scroll, palette, source, tree, move, up, drag, commands, reports, commits, timers,
    set executeError(value) { executeError = value; }, set selectError(value) { selectError = value; },
    get ghost() { return body.children.find(node => node.classList.contains('internal-drag-ghost')); } };
}

test('palette types use the exact current trusted catalogue with no unknown-version fallback', () => {
  assert.deepEqual(allowedDragTypes(CURRENT_METAMODEL), [...CURRENT_CATALOG.elementTypes, ...CURRENT_CATALOG.junctionTypes]);
  assert.equal(allowedDragTypes(CURRENT_METAMODEL).length,44);
  for (const reference of [null, {}, { ...CURRENT_METAMODEL, version: 999 }, { id: 'untrusted', version: 1 }]) assert.deepEqual(allowedDragTypes(reference), []);
});

test('each typed drag creates one correctly named element and centered 210×90 occurrence in one history step', () => {
  const h = setup();
  for (const type of CURRENT_CATALOG.elementTypes) {
    const source = h.source(type), before = h.model.store.history.undo;
    h.drag(source); h.up(source); h.up(source);
    assert.equal(h.model.store.history.undo, before + 1);
    const command = h.commands.at(-1), element = h.model.store.snapshot.elements.at(-1), occurrence = h.model.view.occurrences.at(-1);
    assert.equal(command.type, 'createElementAndOccurrence'); assert.equal(command.elementType, type);
    assert.equal(element.name, `Новый ${type}`); assert.equal(element.type, type);
    assert.deepEqual(occurrence.bounds, { x: 195, y: 205, width: 210, height: 90 }); assert.equal(occurrence.concept.id, element.id);
    assert.deepEqual(h.model.selection, { kind: 'occurrence', id: occurrence.id });
    assert.equal(h.ui.active, false); assert.equal(h.ghost, undefined); assert.equal(source.captured.size, 0);
  }
  assert.equal(h.commands.length, 42); assert.equal(h.commits.length, 42);
});

test('tree repeated drags add distinct occurrences retaining the same shared identity and relationships', () => {
  const h = setup(), source = h.tree(), before = h.model.store.snapshot, start = h.model.view.occurrences.length;
  h.drag(source, 430, 380); const first = h.model.view.occurrences.at(-1);
  h.drag(source, 520, 390); const second = h.model.view.occurrences.at(-1);
  assert.notEqual(first.id, second.id); assert.equal(first.concept.id, source.dataset.dragElementId); assert.equal(second.concept.id, first.concept.id);
  assert.equal(h.model.view.occurrences.length, start + 2); assert.deepEqual(h.model.store.snapshot.elements, before.elements);
  assert.deepEqual(h.model.store.snapshot.relationships, before.relationships);
  assert.deepEqual(h.model.store.snapshot.views[1], before.views[1]);
  assert.deepEqual(h.commands.map(command => command.type), ['addOccurrence', 'addOccurrence']);
  h.model.undo(); assert.equal(h.model.view.occurrences.length, start + 1); h.model.undo(); assert.deepEqual(h.model.store.snapshot, before);
  h.model.redo(); h.model.redo(); assert.equal(h.model.view.occurrences.at(-1).id, second.id);
});

test('preview and subthreshold pointer movement never mutate snapshots, exports, history or selection', () => {
  const h = setup(), source = h.source(), before = h.model.store.exportFiles(), history = h.model.store.history;
  const down = dispatch(source, 'pointerdown'); assert.equal(down.defaultPrevented, false); assert.equal(h.ui.active, true);
  const small = h.move(source, 23, 24); assert.equal(small.defaultPrevented, false); assert.equal(h.ui.dragging, false);
  h.up(source, 23, 24); assert.equal(h.timers.size, 0);
  assert.equal(dispatch(source, 'click').defaultPrevented, false);
  dispatch(source, 'pointerdown'); const moved = h.move(source, 26, 20); // Exactly six CSS pixels.
  assert.equal(moved.defaultPrevented, true); assert.equal(h.ui.dragging, true); assert.ok(h.ghost); assert.equal(h.ghost.dataset.valid, 'false');
  h.move(source, 400, 350); assert.equal(h.ghost.dataset.valid, 'true');
  assert.equal(h.canvas.classList.contains('internal-drop-valid'), true);
  assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.equal(h.model.selection, null);
  h.ui.cancel(); assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.commands.length, 0);
});

test('right button, secondary pointer, unsupported type, disabled/inert sources, missing model and unknown tree IDs cannot begin', () => {
  const h = setup();
  for (const fields of [{ button: 2 }, { isPrimary: false }, { pointerId: NaN }, { clientX: Infinity }, { defaultPrevented: true }]) {
    const source = h.source(); dispatch(source, 'pointerdown', fields); h.move(source); h.up(source); assert.equal(source.captureCalls.length, 0);
  }
  for (const type of ['UnsupportedElement', 'UnsupportedRelation', 'Realization', '<script>', 'Unknown', '']) h.drag(h.source(type));
  const disabled = h.source(); disabled.disabled = true; h.drag(disabled);
  const inert = h.source(); inert.setAttribute('inert', ''); h.drag(inert);
  const aria = h.source(); aria.setAttribute('aria-disabled', 'true'); h.drag(aria);
  h.drag(h.tree('not-an-element')); assert.equal(h.commands.length, 0);
  const empty = createProject('No views'); empty.views = [];
  const noView = setup({ store: createStore(empty) }); noView.drag(noView.source()); assert.equal(noView.ui.active, false);
});

test('tree drag reuses a shared typed object while unsupported palette types cannot create objects', () => {
  const h = setup(); h.drag(h.tree()); assert.equal(h.commands[0].type, 'addOccurrence');
  h.drag(h.source('UnsupportedElement')); assert.equal(h.commands.length, 1);
});

test('descendant pointer targets use their stable source; sources inside canvas are excluded', () => {
  const h = setup(), source = h.source(), span = h.document.createElement('span'); source.append(span);
  h.drag(span); assert.deepEqual(source.captureCalls, [7]); assert.equal(h.commands.length, 1);
  const internal = h.source(); h.canvas.append(internal); h.drag(internal); assert.equal(h.commands.length, 1);
});

for (const reason of ['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'resize', 'explicit cancel']) {
  test(`${reason} cancels transient drag without mutation and suppresses its synthetic activation`, () => {
    const h = setup(), source = h.source(), before = h.model.store.exportFiles();
    dispatch(source, 'pointerdown'); h.move(source);
    if (reason === 'Escape') {
      const event = dispatch(source, 'keydown', { key: 'Escape' }); assert.equal(event.defaultPrevented, true); assert.equal(event.immediate, true);
    } else if (reason === 'explicit cancel') h.ui.cancel();
    else dispatch(reason === 'blur' || reason === 'resize' ? h.window : source, reason);
    h.up(source); assert.equal(h.ui.active, false); assert.equal(h.ghost, undefined); assert.equal(source.captured.size, 0);
    assert.equal(h.body.classList.contains('is-dragging'), false); assert.equal(h.canvas.classList.contains('internal-drop-target'), false);
    assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.commands.length, 0);
    assert.equal(dispatch(source, 'click', { clientX: 400, clientY: 350 }).defaultPrevented, true);
  });
}

test('another pointer cannot move, cancel or finish the captured primary drag', () => {
  const h = setup(), source = h.source(); dispatch(source, 'pointerdown'); h.move(source);
  h.move(source, 700, 400, { pointerId: 99 }); h.up(source, 700, 400, { pointerId: 99 });
  dispatch(source, 'pointercancel', { pointerId: 99 }); dispatch(source, 'lostpointercapture', { pointerId: 99 });
  assert.equal(h.ui.active, true); assert.equal(h.commands.length, 0); h.up(source); assert.equal(h.commands.length, 1);
});

test('a fresh primary press retires a lost old gesture while a nonprimary press cannot replace it', () => {
  const h = setup(), old = h.source('Service'), next = h.source('Process');
  dispatch(old, 'pointerdown'); h.move(old);
  dispatch(next, 'pointerdown', { pointerId: 12, isPrimary: false });
  assert.equal(next.captureCalls.length, 0); assert.equal(h.ui.active, true);
  dispatch(next, 'pointerdown', { pointerId: 12 });
  assert.equal(old.captured.size, 0); assert.equal(h.ghost, undefined);
  h.up(old, 400, 350); assert.equal(h.commands.length, 0);
  h.move(next, 400, 350, { pointerId: 12 }); h.up(next, 400, 350, { pointerId: 12 });
  assert.equal(h.commands.length, 1); assert.equal(h.commands[0].elementType, 'Process');
});

test('lost left button cancels; wrong release button cannot commit', () => {
  for (const failure of ['buttons', 'button']) {
    const h = setup(), source = h.source(); dispatch(source, 'pointerdown'); h.move(source);
    if (failure === 'buttons') h.move(source, 400, 350, { buttons: 0 }); else h.up(source, 400, 350, { button: 2 });
    h.up(source); assert.equal(h.ui.active, false); assert.equal(h.commands.length, 0);
  }
});

test('stale revisions from an edit, undo, redo or load and a changed active view cannot commit', () => {
  for (const change of ['edit', 'undo', 'redo', 'load', 'view']) {
    const h = setup(), source = h.source();
    if (change === 'undo') h.model.execute({ type: 'renameProject', name: 'Temporary' });
    if (change === 'redo') { h.model.execute({ type: 'renameProject', name: 'Temporary' }); h.model.undo(); }
    dispatch(source, 'pointerdown'); h.move(source);
    if (change === 'edit') h.model.execute({ type: 'renameProject', name: 'New revision' });
    if (change === 'undo') h.model.undo();
    if (change === 'redo') h.model.redo();
    if (change === 'load') h.model.store.load(h.model.store.exportFiles(), h.model.store.revision);
    if (change === 'view') h.model.switchView(h.model.store.snapshot.views[1].view.id);
    const before = h.model.store.exportFiles(), history = h.model.store.history;
    h.up(source); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history);
    assert.equal(h.commands.length, 0); assert.equal(h.ui.active, false); assert.match(h.reports.at(-1), /изменились/);
  }
});

test('a detached source or a revision change noticed during movement cancels early', () => {
  for (const mutate of [source => source.remove(), (source, h) => h.model.execute({ type: 'renameProject', name: 'Changed' })]) {
    const h = setup(), source = h.source(); dispatch(source, 'pointerdown'); h.move(source); mutate(source, h);
    h.move(h.document); assert.equal(h.ui.active, false); h.up(h.document); assert.equal(h.commands.length, 0);
  }
});

test('capture failure, release failure and reentrant lostpointercapture leave no stuck or duplicate command', () => {
  const failed = setup(), unavailable = failed.source(); unavailable.captureError = true; failed.drag(unavailable);
  assert.equal(failed.ui.active, false); assert.equal(failed.commands.length, 0); assert.match(failed.reports.at(-1), /capture unavailable/);
  const h = setup(), source = h.source(); source.releaseError = true; h.drag(source); h.up(source);
  assert.equal(h.commands.length, 1); assert.equal(h.ui.active, false); assert.equal(h.ghost, undefined);
  const normal = setup(), stable = normal.source(); normal.drag(stable); assert.equal(normal.commands.length, 1);
  assert.deepEqual(stable.releaseCalls, [7]);
});

test('beforeStart may veto or fail; a successful callback runs once before capture', () => {
  for (const beforeStart of [() => false, () => { throw Error('start failed'); }]) {
    const h = setup({ beforeStart }), source = h.source(); h.drag(source); assert.equal(h.ui.active, false); assert.equal(source.captureCalls.length, 0);
  }
  let count = 0;
  const h = setup({ beforeStart(source) { count++; assert.equal(source.captureCalls.length, 0); } });
  h.drag(h.source()); assert.equal(count, 1); assert.equal(h.commands.length, 1);
});

test('core rejection is truthful and cannot be retried by duplicate pointerup', () => {
  const h = setup(), source = h.source(), before = h.model.store.exportFiles(); h.executeError = true;
  h.drag(source); h.up(source); assert.equal(h.ui.active, false); assert.deepEqual(h.model.store.exportFiles(), before);
  assert.match(h.reports.at(-1), /^Не выполнено: command failed/); assert.equal(h.commits.length, 0);
});

test('selection or postcommit render failure reports the already-created object and never repeats the commit', () => {
  for (const failure of ['selection', 'callback']) {
    const h = setup({ onCommitted() { if (failure === 'callback') throw Error('render failed'); } });
    h.selectError = failure === 'selection'; const source = h.source(), before = h.model.store.history.undo;
    h.drag(source); h.up(source); h.up(source);
    assert.equal(h.commands.length, 1); assert.equal(h.model.store.history.undo, before + 1);
    assert.match(h.reports.at(-1), /^Экземпляр уже добавлен, но интерфейс не обновлён полностью:/);
  }
});

test('actual drag blocks only related synthetic click/dblclick, including common-ancestor dispatch, and expires', () => {
  const h = setup(), source = h.source(), other = h.document.createElement('button'); h.body.append(other);
  let opened = 0; source.addEventListener('click', () => opened++); source.addEventListener('dblclick', () => opened++);
  h.drag(source);
  for (const type of ['click', 'dblclick']) {
    assert.equal(dispatch(source, type, { clientX: 400, clientY: 350 }).defaultPrevented, true);
    assert.equal(dispatch(h.canvas, type, { clientX: 400, clientY: 350 }).defaultPrevented, true);
    assert.equal(dispatch(h.body, type, { clientX: 400, clientY: 350 }).defaultPrevented, true);
    assert.equal(dispatch(other, type, { clientX: 400, clientY: 350 }).defaultPrevented, false);
    assert.equal(dispatch(h.body, type, { clientX: 10, clientY: 10 }).defaultPrevented, false);
  }
  assert.equal(opened, 0);
  assert.equal(dispatch(source, 'click', { detail: 0 }).defaultPrevented, false); assert.equal(opened, 1);
  assert.equal(dispatch(source, 'click', { pointerId: 99 }).defaultPrevented, false);
  h.window.flushTimers(); assert.equal(h.timers.size, 0); assert.equal(dispatch(source, 'click').defaultPrevented, false);
});

test('a fresh pointerdown or keyboard use clears suppression immediately instead of making a click blackhole', () => {
  for (const fresh of ['pointerdown', 'keydown']) {
    const h = setup(), source = h.source(); h.drag(source);
    dispatch(source, fresh, fresh === 'keydown' ? { key: 'Enter' } : {});
    if (fresh === 'pointerdown') h.up(source, 20, 20);
    assert.equal(dispatch(source, 'click').defaultPrevented, false); assert.equal(h.timers.size, 0);
    assert.equal(h.commands.length, 1);
  }
});

test('a delayed release after cancellation suppresses only that release activation, without a permanent click filter', () => {
  const h = setup(), source = h.source(); dispatch(source, 'pointerdown'); h.move(source);
  dispatch(source, 'keydown', { key: 'Escape' }); h.window.flushTimers();
  assert.equal(dispatch(source, 'click', { detail: 0 }).defaultPrevented, false);
  h.up(source); assert.equal(dispatch(source, 'click').defaultPrevented, true); assert.equal(h.commands.length, 0);
  h.window.flushTimers(); assert.equal(dispatch(source, 'click').defaultPrevented, false);
});

test('destroy cancels, removes listeners/timers/ghost and preserves later ordinary activations', () => {
  const h = setup(), source = h.source(); dispatch(source, 'pointerdown'); h.move(source); h.ui.destroy(); h.ui.destroy();
  h.drag(source); assert.equal(h.ui.active, false); assert.equal(h.commands.length, 0); assert.equal(h.ghost, undefined); assert.equal(h.timers.size, 0);
  assert.equal(dispatch(source, 'click').defaultPrevented, false);
  for (const target of [h.document, h.canvas, h.window]) for (const handlers of target.listeners.values()) assert.equal(handlers.length, 0);
});

test('external native/file/HTML drops never read a payload or execute commands, even during internal dragging', () => {
  const h = setup(), source = h.source(), before = h.model.store.exportFiles();
  for (const active of [false, true]) {
    if (active) { dispatch(source, 'pointerdown'); h.move(source); }
    for (const type of ['dragover', 'drop']) {
      const fields = {}; Object.defineProperty(fields, 'dataTransfer', { get() { throw Error('must not access transfer'); } });
      const event = dispatch(h.canvas, type, fields); assert.equal(event.defaultPrevented, true);
    }
    assert.deepEqual(h.model.store.exportFiles(), before);
  }
  assert.equal(dispatch(source, 'dragstart').defaultPrevented, true);
  assert.equal(dispatch(h.body, 'dragstart').defaultPrevented, false);
  h.ui.cancel(); assert.equal(h.commands.length, 0);
});

test('ghost text is inert, length-bounded, aria-hidden and pointer-transparent; preview keeps source and SVG DOM stable', () => {
  const h = setup(), id = h.model.store.snapshot.elements[0].id;
  h.model.execute({ type: 'renameElement', elementId: id, name: '<img src=x onerror=alert(1)> 日本語' });
  const source = h.tree(id), sourceParent = source.parentNode, child = h.document.createElement('g'); h.canvas.append(child);
  dispatch(source, 'pointerdown'); h.move(source);
  assert.match(h.ghost.textContent, /<img src=x/); assert.equal(h.ghost.children.length, 0);
  assert.equal(h.ghost.getAttribute('aria-hidden'), 'true'); assert.equal(h.ghost.style.pointerEvents, 'none');
  assert.equal(source.parentNode, sourceParent); assert.deepEqual(h.canvas.children, [child]);
});

test('affine inverse honors translation, uniform/nonuniform zoom, viewBox pan and rotations', () => {
  assert.deepEqual(inverseScreenPoint(matrix(2, 0, 0, 2, 50, 80), 450, 480), { x: 200, y: 200 });
  assert.deepEqual(inverseScreenPoint(matrix(2, 0, 0, 3, -300, -600), 100, 300), { x: 200, y: 300 });
  assert.deepEqual(inverseScreenPoint(matrix(0, 2, -2, 0, 100, 50), 60, 70), { x: 10, y: 20 });
  assert.deepEqual(inverseScreenPoint(matrix(), 0, 0), { x: 0, y: 0 });
});

test('missing, singular, nonfinite, throwing or non-2D screen matrices fail closed', () => {
  const invalid = [null, {}, matrix(0, 0, 0, 0), matrix(1, 2, 2, 4), matrix(Infinity), { ...matrix(), is2D: false },
    { ...matrix(), inverse() { throw Error('singular'); } }, { ...matrix(), inverse() { return matrix(NaN); } }];
  for (const value of invalid) assert.equal(inverseScreenPoint(value, 200, 200), null);
  assert.equal(inverseScreenPoint(matrix(), NaN, 0), null); assert.equal(inverseScreenPoint(matrix(), 0, Infinity), null);
});

test('geometry accepts visible boundaries and rejects degenerate/nonfinite rectangles', () => {
  assert.equal(pointInsideRect({ x: 100, y: 100 }, rect()), true);
  assert.equal(pointInsideRect({ x: 1000, y: 740 }, rect()), true);
  for (const box of [null, rect(1, 1, 1, 1), rect(10, 10, 0, 0), rect(0, 0, Infinity, 100)]) assert.equal(pointInsideRect({ x: 10, y: 10 }, box), false);
});

test('drop placement uses current transformed pointer on release after CSS zoom and scrolled/panned viewBox', () => {
  const h = setup(), source = h.source();
  h.canvas.viewBox.baseVal = { x: -300, y: -200, width: 900, height: 640 };
  // Zoom 1.5 with a scrolled SVG left of the viewport; panned model origin is included in CTM.
  h.canvas.rect = rect(-100, 20, 1250, 980); h.scroll.rect = rect(100, 100, 1000, 740);
  h.canvas.ctm = matrix(1.5, 0, 0, 1.5, 350, 320);
  dispatch(source, 'pointerdown'); h.move(source, 400, 350); h.up(source, 650, 620);
  assert.deepEqual(h.commands[0].bounds, { x: 95, y: 155, width: 210, height: 90 });
});

test('final centered fractional bounds round onto the 0.1-unit core grid and normalize negative zero', () => {
  const h = setup(), source = h.source(); h.canvas.ctm = matrix(1.3, 0, 0, 1.3, 100, 100);
  h.drag(source, 400.2, 350.7);
  assert.deepEqual(h.commands[0].bounds, { x: 125.9, y: 147.8, width: 210, height: 90 });
  h.canvas.ctm = matrix(1, 0, 0, 1, 100, 100); h.drag(source, 204.99, 144.99);
  assert.deepEqual(h.commands[1].bounds, { x: 0, y: 0, width: 210, height: 90 });
  assert.equal(Object.is(h.commands[1].bounds.x, -0), false);
});

test('commit callback runs only after gesture and pointer capture are retired, so rendering cannot repeat the command', () => {
  let h, source;
  h = setup({ onCommitted() {
    assert.equal(h.ui.active, false); assert.equal(h.ghost, undefined); assert.equal(source.captured.size, 0);
    h.ui.cancel(); h.up(source); source.remove();
  } });
  source = h.source(); h.drag(source); assert.equal(h.commands.length, 1); assert.equal(h.commits.length, 1);
});

test('letterboxed margins inside SVG bounds reject a drop outside the actual viewBox', () => {
  const h = setup(); h.canvas.rect = rect(100, 100, 1000, 740);
  h.canvas.viewBox.baseVal = { x: 0, y: 0, width: 640, height: 640 };
  h.canvas.ctm = matrix(1, 0, 0, 1, 230, 100); // Horizontal xMidYMid meet margins are 130px.
  assert.equal(canvasDropPoint(h.canvas, 150, 350, h.window), null);
  assert.deepEqual(canvasDropPoint(h.canvas, 230, 350, h.window), { x: 0, y: 250 });
  assert.equal(canvasDropPoint(h.canvas, 950, 350, h.window), null);
  h.drag(h.source(), 150, 350); assert.equal(h.commands.length, 0);
});

test('scroll clipping rejects hidden SVG regions independently of valid transformed model coordinates', () => {
  const h = setup(); h.scroll.rect = rect(200, 200, 700, 500);
  assert.equal(canvasDropPoint(h.canvas, 150, 350, h.window), null);
  assert.equal(canvasDropPoint(h.canvas, 400, 550, h.window), null);
  assert.deepEqual(canvasDropPoint(h.canvas, 400, 350, h.window), { x: 300, y: 250 });
  h.drag(h.source(), 150, 350); assert.equal(h.commands.length, 0);
});

test('clip border and scrollbar exclusion scales correctly under CSS zoom', () => {
  const h = setup();
  Object.assign(h.scroll, { rect: rect(100, 100, 900, 700), offsetWidth: 400, offsetHeight: 300,
    clientLeft: 2, clientTop: 2, clientWidth: 380, clientHeight: 280 });
  assert.equal(canvasDropPoint(h.canvas, 102, 350, h.window), null); // 4px zoomed left border.
  assert.equal(canvasDropPoint(h.canvas, 880, 350, h.window), null); // Scrollbar strip.
  assert.equal(canvasDropPoint(h.canvas, 400, 690, h.window), null);
  assert.ok(canvasDropPoint(h.canvas, 104, 104, h.window));
  assert.ok(canvasDropPoint(h.canvas, 860, 650, h.window));
});

test('nested axis-only clipping, viewport and visual viewport exclusions are respected', () => {
  const h = setup(), outer = h.document.createElement('div'); h.body.append(outer); outer.append(h.scroll);
  outer.rect = rect(250, 300, 600, 400); outer.computedStyle = { overflowX: 'hidden', overflowY: 'visible' };
  assert.equal(canvasDropPoint(h.canvas, 200, 350, h.window), null);
  assert.ok(canvasDropPoint(h.canvas, 400, 500, h.window));
  h.window.innerHeight = 450; assert.equal(canvasDropPoint(h.canvas, 400, 500, h.window), null);
  h.window.visualViewport = { offsetLeft: 300, offsetTop: 300, width: 100, height: 100 };
  assert.equal(canvasDropPoint(h.canvas, 450, 350, h.window), null);
  assert.ok(canvasDropPoint(h.canvas, 350, 350, h.window));
});

test('hidden/disconnected/occluded SVG, invalid viewBox and broken geometry APIs reject without history', () => {
  const mutations = [
    h => { h.canvas.isConnected = false; }, h => { h.canvas.hidden = true; },
    h => { h.scroll.computedStyle.display = 'none'; }, h => { h.canvas.computedStyle.visibility = 'hidden'; },
    h => { h.document.elementFromPoint = () => h.palette; }, h => { h.document.elementFromPoint = () => null; },
    h => { h.canvas.ctm = null; }, h => { h.canvas.ctm = matrix(0, 0, 0, 0); },
    h => { h.canvas.getScreenCTM = () => { throw Error('detached'); }; },
    h => { h.canvas.viewBox = null; }, h => { h.canvas.viewBox.baseVal.width = 0; },
    h => { h.canvas.viewBox.baseVal.x = Infinity; }, h => { h.scroll.getBoundingClientRect = () => { throw Error('layout'); }; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const h = setup(), before = h.model.store.exportFiles(); mutate(h); h.drag(h.source());
    assert.equal(h.commands.length, 0, `mutation ${index}`); assert.equal(h.ui.active, false); assert.deepEqual(h.model.store.exportFiles(), before);
  }
});

test('release outside visible canvas cancels even after a valid preview; nonfinite pointer coordinates cannot commit', () => {
  for (const position of [[50, 50], [NaN, 350], [400, Infinity]]) {
    const h = setup(), source = h.source(); dispatch(source, 'pointerdown'); h.move(source); h.up(source, ...position);
    assert.equal(h.commands.length, 0); assert.equal(h.ui.active, false);
  }
});

test('helper has no native transfer import, HTML interpolation, core mutation shortcuts or SVG rerender', async () => {
  const source = await readFile(new URL('../src/drag-drop.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.dataTransfer|\.getData\(|\.files\b|innerHTML|insertAdjacentHTML|replaceChildren|store\.execute|store\.load/);
  assert.match(source, /model\.execute\(command\)/); assert.match(source, /matrix\.inverse\(\)/);
});

test('history shortcuts retire an internal drag before the application performs Undo/Redo', () => {
  for(const modifier of [{key:'z',ctrlKey:true},{key:'Z',metaKey:true,shiftKey:true},{key:'y',ctrlKey:true},
    {key:'я',code:'KeyZ',ctrlKey:true},{key:'Я',code:'KeyZ',metaKey:true,shiftKey:true},{key:'н',code:'KeyY',ctrlKey:true}]) {
    const h=setup(),source=h.source();dispatch(source,'pointerdown');h.move(source);const event=dispatch(source,'keydown',modifier);
    assert.equal(h.ui.active,false);assert.equal(event.defaultPrevented,false);
    h.up(source);assert.equal(h.commands.length,0);
  }
});
test('IME and Alt-modified history letters leave an internal drag active and cancellable', () => {
  for (const ignored of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }]) for (const code of ['KeyZ', 'KeyY']) {
    const h = setup(), source = h.source(), before = h.model.store.exportFiles();
    dispatch(source, 'pointerdown'); h.move(source);
    const event = dispatch(source, 'keydown', { key: code === 'KeyZ' ? 'я' : 'н', code, ctrlKey: true, ...ignored });
    assert.equal(h.ui.active, true); assert.equal(event.defaultPrevented, false); assert.deepEqual(h.model.store.exportFiles(), before);
    h.ui.cancel(); h.up(source); assert.equal(h.commands.length, 0);
  }
});
