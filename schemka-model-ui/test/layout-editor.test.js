import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { createController } from '../src/controller.js';
import { createDemo } from '../src/demo.js';
import { connectionGeometry } from '../src/connection-geometry.js';
import { createProjectSession } from '../src/project-session.js';
import { installLayoutEditor } from '../src/layout-editor.js';

const svgNS = 'http://www.w3.org/2000/svg';
function matrix(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
  return { a, b, c, d, e, f, inverse() {
    const determinant = a * d - b * c;
    return matrix(d / determinant, -b / determinant, -c / determinant, a / determinant,
      (c * f - d * e) / determinant, (b * e - a * f) / determinant);
  } };
}
const screenPoint = (ctm, point) => ({ x: ctm.a * point.x + ctm.c * point.y + ctm.e,
  y: ctm.b * point.x + ctm.d * point.y + ctm.f });
function fixture({ bends = [{ x: 150, y: 80 }, { x: 250, y: 80 }],
  routePoints = bends.map(point => ({ kind: 'bend', point })), dependent = false, labelPosition = { x: 200, y: -20 } } = {}) {
  const state = createDemo().snapshot;
  state.project.name = 'Synthetic connection layout tests';
  state.views[0].occurrences[0].bounds = { x: 0, y: 0, width: 100, height: 100 };
  state.views[0].occurrences[1].bounds = { x: 300, y: 0, width: 100, height: 100 };
  Object.assign(state.views[0].connections[0], { routePoints: structuredClone(routePoints), labelPosition: structuredClone(labelPosition) });
  state.relationships[0].label = 'Shared relation; retain exact text\r\nand properties';
  state.relationships[0].properties = propertyEntries({ synthetic: 'Keep this shared property' });
  if (dependent) {
    const host = state.views[0].connections[0], source = state.views[0].occurrences[1];
    const relationshipId = 'rel-33333333-3333-4333-8333-333333333333';
    state.relationships.push({ id: relationshipId, type: 'Association', source: { ...source.concept },
      target: { kind: 'relationship', id: host.relationshipId }, label: 'Attached relationship', documentation: '', properties: propertyEntries({}) });
    state.views[0].connections.push({ id: 'conn-44444444-4444-4444-8444-444444444444', relationshipId,
      source: { kind: 'occurrence', id: source.id }, target: { kind: 'connection', id: host.id, anchorId: routePoints.find(item => item.kind === 'anchor').id },
      routePoints: [], labelPosition: null, style: {} });
  }
  return state;
}

// Real DOM event propagation and controls, with only unavailable SVG and pointer-
// capture APIs supplied. Preview painting never replaces a captured handle.
function setup(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="scroll"><svg id="canvas" tabindex="0"></svg></div><aside id="inspector"></aside><input id="ordinary-input"></body>',
    { pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const canvas = document.getElementById('canvas'), inspector = document.getElementById('inspector');
  const store = createStore(fixture(options)), model = createController(store), session = createProjectSession(store);
  const initial = store.snapshot, commands = [], executions = [], previews = [], reports = [], captures = new Map();
  const connectionId = model.view.connections[0].id, viewId = model.viewId;
  let enabled = options.enabled ?? true, blocked = false, ctm = options.ctm ?? matrix(), editor;
  let failCapture = false, failRelease = false;
  const event = (target, type, fields = {}) => {
    const value = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [key, item] of Object.entries({ button: 0, buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 7, isPrimary: true, clientX: 0, clientY: 0, detail: type === 'click' ? 1 : 0, ...fields })) {
      Object.defineProperty(value, key, { configurable: true, value: item });
    }
    target.dispatchEvent(value); return value;
  };
  window.Element.prototype.setPointerCapture = function (pointerId) {
    if (failCapture) throw Error('Synthetic unavailable capture');
    const ids = captures.get(this) ?? new Set(); ids.add(pointerId); captures.set(this, ids);
  };
  window.Element.prototype.hasPointerCapture = function (pointerId) { return captures.get(this)?.has(pointerId) ?? false; };
  window.Element.prototype.releasePointerCapture = function (pointerId) {
    captures.get(this)?.delete(pointerId);
    if (failRelease) throw Error('Synthetic already released capture');
    event(this, 'lostpointercapture', { pointerId });
  };
  canvas.getScreenCTM = () => ctm;
  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 900, width: 1200, height: 900 });
  canvas.getClientRects = () => [canvas.getBoundingClientRect()];
  Object.defineProperty(canvas, 'viewBox', { value: { baseVal: { x: -2000, y: -2000, width: 4000, height: 4000 } } });
  document.elementFromPoint = () => canvas;
  const geometryFor = options.geometryFor ?? ((connection, view) => connectionGeometry(connection, view.occurrences, () => 0, enabled, view.connections));
  function paint(view) {
    for (const connection of view?.connections || []) {
      const group = canvas.querySelector(`[data-id="${connection.id}"]`);
      const geometry = geometryFor(connection, view);
      group?.querySelector('path')?.setAttribute('d', geometry.d);
      const label = group?.querySelector('text');
      label?.setAttribute('x', geometry.x); label?.setAttribute('y', geometry.y);
    }
    editor?.update(view);
  }
  function render() {
    canvas.replaceChildren();
    for (const connection of model.view?.connections || []) {
      const group = document.createElementNS(svgNS, 'g');
      group.dataset.kind = 'connection'; group.dataset.id = connection.id;
      group.setAttribute('tabindex', '0');
      const label = document.createElementNS(svgNS, 'text'); label.classList.add('relationship-label');
      group.append(document.createElementNS(svgNS, 'path'), label);
      group.querySelector('text').textContent = 'Synthetic label'; canvas.append(group);
    }
    for (const occurrence of model.view?.occurrences || []) {
      const group = document.createElementNS(svgNS, 'g');
      group.dataset.kind = 'occurrence'; group.dataset.id = occurrence.id; canvas.append(group);
    }
    paint(model.view);
    inspector.replaceChildren(); editor?.appendInspector(inspector); editor?.refresh();
  }
  const adapted = Object.create(model);
  adapted.execute = command => { const result = model.execute(command); commands.push(structuredClone(command)); return result; };
  const instrumentedStore = Object.create(store);
  Object.defineProperty(instrumentedStore, 'execute', { value(command, revision) {
    executions.push({ command: structuredClone(command), revision, currentRevision: store.revision });
    const result = store.execute(command, revision); commands.push(structuredClone(command)); return result;
  } });
  adapted.store = instrumentedStore;
  model.select({ kind: 'connection', id: connectionId });
  render();
  editor = installLayoutEditor({ document, window, canvas, model: adapted, enabled: () => enabled, blocked: () => blocked,
    geometryFor, preview(view) { previews.push(structuredClone(view)); paint(view); }, redraw: render, status: text => reports.push(text) });
  render();
  const find = selector => document.querySelector(selector);
  const handle = (kind = 'bend', index = 0) => find(`.layout-handle[data-layout-kind="${kind}"]${kind !== 'label' ? `[data-layout-index="${index}"]` : ''}`);
  function mode(value = true) {
    const toggle = find('#layout-edit-toggle'); assert.ok(toggle, 'Selected connection has an explicit editing control');
    if ((toggle.getAttribute('aria-pressed') === 'true') !== value) toggle.click();
  }
  function choose(index) {
    const select = find('#layout-point-select'); assert.ok(select); select.value = String(index); event(select, 'change');
  }
  const pointer = (target, type, point, fields = {}) => event(target, type, { clientX: point.x, clientY: point.y, ...fields });
  const down = (target, point, fields) => pointer(target, 'pointerdown', point, fields);
  const move = (point, fields) => pointer(canvas, 'pointermove', point, fields);
  const up = (point, fields) => pointer(canvas, 'pointerup', point, fields);
  function drag(target, from, to) { down(target, from); move(to); up(to); }
  const capture = () => ({ bytes: Buffer.from(serializeProjectFile(store.snapshot)), revision: store.revision,
    history: store.history, dirty: session.dirty });
  const close = () => { editor.cancel(); dom.window.close(); };
  t.after(close);
  return { window, document, canvas, inspector, store, model, session, initial, editor, commands, executions, previews, reports,
    viewId, connectionId, event, pointer, down, move, up, drag, mode, choose, find, handle, render, capture,
    get connection() { return model.view?.connections.find(connection => connection.id === connectionId); },
    get captured() { return [...captures.values()].reduce((sum, ids) => sum + ids.size, 0); },
    set ctm(value) { ctm = value; }, set enabled(value) { enabled = value; }, set blocked(value) { blocked = value; },
    set failCapture(value) { failCapture = value; }, set failRelease(value) { failRelease = value; } };
}

test('editing is explicitly off; mode, selection, focus and refresh do not write project data', t => {
  const h = setup(t), before = h.capture();
  assert.equal(h.find('#layout-edit-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(h.editor.active, false); assert.equal(h.handle(), null);
  h.mode(); assert.ok(h.handle()); assert.equal(h.editor.active, false);
  h.handle().focus(); h.choose(1); h.editor.refresh();
  assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
  h.mode(false); assert.equal(h.handle(), null); assert.equal(h.find('.layout-edit-label'), null);
  h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id }); h.render();
  assert.equal(h.handle(), null); assert.deepEqual(h.capture(), before);
  h.model.select({ kind: 'connection', id: h.connectionId }); h.render();
  assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
});

test('stored geometry OFF and blocked UI cannot start or commit layout gestures', t => {
  const h = setup(t), before = h.capture(); h.mode(); const target = h.handle();
  h.blocked = true; h.down(target, { x: 150, y: 80 }); h.move({ x: 180, y: 100 }); h.up({ x: 180, y: 100 });
  assert.equal(h.editor.active, false); assert.deepEqual(h.capture(), before);
  h.blocked = false; h.enabled = false; h.editor.refresh();
  assert.equal(h.handle(), null); assert.equal(h.editor.active, false); assert.deepEqual(h.capture(), before);
});

test('raw bend indices include hidden and repeated entries in the final overlay and point selector', t => {
  const bends = [{ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 200, y: 80 }, { x: 200, y: 80 }, { x: 350, y: 50 }];
  const h = setup(t, { bends }), before = h.capture(); h.mode();
  const overlay = h.find('.connection-layout-handles'); assert.ok(overlay); assert.equal(h.canvas.lastElementChild, overlay);
  const handles = [...overlay.querySelectorAll('[data-layout-kind="bend"]')];
  assert.deepEqual(handles.map(handle => Number(handle.dataset.layoutIndex)), [0, 1, 2, 3, 4]);
  handles.forEach((handle, index) => {
    assert.equal(handle.getAttribute('transform'), `translate(${bends[index].x} ${bends[index].y})`);
  });
  assert.deepEqual([...h.find('#layout-point-select').options].map(option => option.value), ['-1', '0', '1', '2', '3', '4']);
  assert.deepEqual(h.capture(), before);
});

test('many in-place previews make one atomic command using the final pointerup position and preserve other views', t => {
  const h = setup(t), before = h.capture(); h.mode(); const target = h.handle();
  const startGeneration = h.editor.generation;
  h.down(target, { x: 150, y: 80 }); assert.equal(h.editor.active, true); assert.ok(h.editor.generation > startGeneration);
  for (const point of [{ x: 160, y: 90 }, { x: 170, y: 100 }, { x: 180, y: 110 }]) {
    h.move(point); assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.handle(), target);
  }
  assert.ok(h.previews.length >= 3);
  h.up({ x: 190.04, y: 120.06 }); h.up({ x: 400, y: 400 });
  assert.equal(h.editor.active, false); assert.equal(h.captured, 0); assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].type, 'updateConnectionLayout');
  assert.equal(h.commands[0].viewId, h.viewId); assert.equal(h.commands[0].connectionId, h.connectionId);
  const expected = structuredClone(h.initial); expected.views[0].connections[0].routePoints[0].point = { x: 190, y: 120.1 };
  assert.deepEqual(h.store.snapshot, expected); assert.deepEqual(h.store.history, { undo: 1, redo: 0 }); assert.equal(h.session.dirty, true);
  assert.deepEqual(deserializeProjectFile(serializeProjectFile(h.store.snapshot)), deserializeProjectFile(serializeProjectFile(expected)));
  h.model.undo(); assert.deepEqual(h.store.snapshot, h.initial); assert.equal(h.session.dirty, false);
  h.model.redo(); assert.deepEqual(h.store.snapshot, expected); assert.equal(h.session.dirty, true);
});

test('inverse CTM handles scale, translation, skew and rotation for bends and label anchors', t => {
  for (const ctm of [matrix(2, 0, 0, 3, 70, -40), matrix(1.5, .5, -.25, 2, 120, 90), matrix(0, 2, -2, 0, 700, 40)]) {
    for (const kind of ['bend', 'label']) {
      const h = setup(t, { ctm }); h.mode();
      const from = kind === 'bend' ? { x: 150, y: 80 } : { x: 200, y: -20 }, to = { x: 210.04, y: 130.06 };
      h.drag(h.handle(kind), screenPoint(ctm, from), screenPoint(ctm, to));
      assert.equal(h.commands.length, 1);
      assert.deepEqual(kind === 'bend' ? h.connection.routePoints[0].point : h.connection.labelPosition, { x: 210, y: 130.1 });
      if (kind === 'bend') assert.deepEqual(h.connection.labelPosition, h.initial.views[0].connections[0].labelPosition);
      else assert.deepEqual(h.connection.routePoints.map(({ point }) => point), h.initial.views[0].connections[0].routePoints.map(({ point }) => point));
    }
  }
});

test('a null label uses its displayed anchor and only an actual drag materializes labelPosition', t => {
  const h = setup(t, { labelPosition: null }), before = h.capture(); h.mode();
  const geometry = connectionGeometry(h.connection, h.model.view.occurrences, () => 0, true);
  const anchor = { x: geometry.x, y: geometry.y }, target = h.handle('label');
  assert.ok(target); assert.ok(h.find(`[data-id="${h.connectionId}"] text`).classList.contains('layout-edit-label'));
  h.down(target, anchor); h.up(anchor); assert.deepEqual(h.capture(), before); assert.equal(h.connection.labelPosition, null);
  h.drag(h.handle('label'), anchor, { x: anchor.x + 20, y: anchor.y + 10 });
  assert.deepEqual(h.connection.labelPosition, { x: anchor.x + 20, y: anchor.y + 10 });
  assert.deepEqual(h.connection.routePoints.map(({ point }) => point), h.initial.views[0].connections[0].routePoints.map(({ point }) => point)); assert.equal(h.commands.length, 1);
});

test('dragging the actual label text preserves the grab offset under a nonidentity screen matrix', t => {
  const ctm = matrix(1.5, .25, -.5, 2, 140, 80), h = setup(t, { ctm }); h.mode();
  const label = h.find(`[data-id="${h.connectionId}"] text`), before = h.capture();
  const grabbed = { x: 220, y: -16 }, delta = { x: 32, y: 15 };
  h.down(label, screenPoint(ctm, grabbed));
  h.move(screenPoint(ctm, { x: grabbed.x + delta.x, y: grabbed.y + delta.y }));
  assert.deepEqual(h.capture(), before);
  h.up(screenPoint(ctm, { x: grabbed.x + delta.x, y: grabbed.y + delta.y }));
  assert.deepEqual(h.connection.labelPosition, { x: 232, y: -5 });
  assert.deepEqual(h.connection.routePoints.map(({ point }) => point), h.initial.views[0].connections[0].routePoints.map(({ point }) => point)); assert.equal(h.commands.length, 1);
});

test('reverting a dragged automatic label keeps null rather than storing its displayed anchor', t => {
  const h = setup(t, { labelPosition: null }); h.mode(); const before = h.capture();
  const { x, y } = connectionGeometry(h.connection, h.model.view.occurrences, () => 0, true);
  h.down(h.handle('label'), { x, y }); h.move({ x: x + 30, y: y + 40 }); h.up({ x, y });
  assert.equal(h.connection.labelPosition, null); assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
});

test('an automatic-label drag rounded back to its visible anchor preserves null and redo', t => {
  const ctm = matrix(200, 0, 0, 200), h = setup(t, { ctm, labelPosition: null });
  h.model.execute({ type: 'renameProject', name: 'Future unrelated edit' }); h.model.undo(); h.render(); h.mode();
  const before = h.capture(), geometry = connectionGeometry(h.connection, h.model.view.occurrences, () => 0, true);
  const start = screenPoint(ctm, geometry), finish = { x: start.x + 6, y: start.y };
  h.down(h.handle('label'), start); h.move(finish); h.up(finish);
  assert.equal(h.connection.labelPosition, null); assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
  h.model.redo(); assert.equal(h.store.snapshot.project.name, 'Future unrelated edit');
});

test('clicks, subthreshold movement and reverted drags preserve exact bytes and both undo/redo stacks', t => {
  for (const kind of ['bend', 'label']) for (const gesture of ['click', 'subthreshold', 'reverted']) {
    const h = setup(t); h.model.execute({ type: 'renameProject', name: 'First unrelated edit' });
    h.model.execute({ type: 'renameProject', name: 'Future unrelated edit' }); h.model.undo(); h.render(); h.mode();
    const before = h.capture(), start = kind === 'bend' ? { x: 150, y: 80 } : { x: 200, y: -20 };
    assert.deepEqual(before.history, { undo: 1, redo: 1 });
    h.down(h.handle(kind), start);
    if (gesture === 'subthreshold') h.move({ x: start.x + 3, y: start.y + 4 });
    if (gesture === 'reverted') { h.move({ x: start.x + 40, y: start.y + 20 }); h.move(start); }
    h.up(gesture === 'subthreshold' ? { x: start.x + 3, y: start.y + 4 } : start);
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.editor.active, false);
    h.model.redo(); assert.equal(h.store.snapshot.project.name, 'Future unrelated edit');
  }
});

test('six CSS pixels, including a final pointerup without pointermove, is the drag threshold', t => {
  for (const amount of [5.9, 6]) {
    const ctm = matrix(2, 0, 0, 2, 10, 20), h = setup(t, { ctm }); h.mode();
    const before = h.capture(), start = screenPoint(ctm, { x: 150, y: 80 });
    h.down(h.handle(), start); h.up({ x: start.x + amount, y: start.y });
    if (amount < 6) { assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); }
    else { assert.deepEqual(h.connection.routePoints[0].point, { x: 153, y: 80 }); assert.equal(h.commands.length, 1); }
  }
});

test('invalid or singular screen transforms fail closed before or during a gesture', t => {
  const invalid = [null, matrix(1, 0, 0, 0), matrix(Infinity), { ...matrix(), is2D: false },
    { ...matrix(), inverse() { throw Error('No inverse'); } }, { ...matrix(), inverse() { return matrix(NaN); } }];
  for (const bad of invalid) for (const during of [false, true]) {
    const h = setup(t); h.mode(); const before = h.capture();
    if (!during) h.ctm = bad;
    h.down(h.handle(), { x: 150, y: 80 });
    if (during) { h.move({ x: 170, y: 90 }); h.ctm = bad; }
    h.move({ x: 180, y: 100 }); h.up({ x: 180, y: 100 });
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.editor.active, false);
  }
});

test('a changed finite CTM also cancels instead of applying stale pan or zoom coordinates', t => {
  const h = setup(t); h.mode(); const before = h.capture();
  h.down(h.handle(), { x: 150, y: 80 }); h.move({ x: 170, y: 90 });
  h.ctm = matrix(2, 0, 0, 2, 100, 50); h.up({ x: 440, y: 230 });
  assert.equal(h.editor.active, false); assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
});

test('right buttons, nonprimary pointers, invalid coordinates and a lost left button never commit', t => {
  for (const fields of [{ button: 2 }, { isPrimary: false }, { pointerId: NaN }, { clientX: Infinity }]) {
    const h = setup(t); h.mode(); const before = h.capture();
    h.down(h.handle(), { x: 150, y: 80 }, fields); h.move({ x: 180, y: 100 }); h.up({ x: 180, y: 100 });
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.editor.active, false);
  }
  for (const release of [false, true]) {
    const h = setup(t); h.mode(); const before = h.capture(); h.down(h.handle(), { x: 150, y: 80 }); h.move({ x: 180, y: 100 });
    if (release) h.up({ x: 180, y: 100 }, { button: 2 }); else h.move({ x: 180, y: 100 }, { buttons: 0 });
    h.up({ x: 180, y: 100 }); assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false);
  }
});

test('another primary pointer cannot replace, preview, cancel or finish the owning pointer transaction', t => {
  const h = setup(t); h.mode(); const target = h.handle(), before = h.capture(), label = structuredClone(h.connection.labelPosition);
  h.down(target, { x: 150, y: 80 }); h.move({ x: 170, y: 90 });
  const previews = h.previews.length, generation = h.editor.generation;
  h.down(h.find('[data-layout-kind="label"]'), { x: 200, y: 68 }, { pointerId: 99, isPrimary: true, pointerType: 'pen' });
  h.down(h.canvas, { x: 700, y: 700 }, { pointerId: 99, isPrimary: true, pointerType: 'pen' });
  assert.equal(h.editor.generation, generation, 'Foreign primary down does not replace the captured transaction');
  h.move({ x: 700, y: 700 }, { pointerId: 99 }); h.up({ x: 700, y: 700 }, { pointerId: 99 });
  h.event(target, 'pointercancel', { pointerId: 99 }); h.event(target, 'lostpointercapture', { pointerId: 99 });
  assert.equal(h.editor.active, true); assert.equal(h.previews.length, previews); assert.deepEqual(h.capture(), before);
  h.up({ x: 180, y: 100 }); assert.equal(h.commands.length, 1); assert.deepEqual(h.connection.routePoints[0].point, { x: 180, y: 100 });
  assert.deepEqual(h.connection.labelPosition, label);
});

for (const reason of ['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'resize', 'scroll', 'pagehide', 'cancel', 'reset']) {
  test(`${reason} cancels layout previews without any model or history mutation`, t => {
    const h = setup(t); h.mode(); const target = h.handle(), before = h.capture();
    h.down(target, { x: 150, y: 80 }); h.move({ x: 180, y: 100 }); assert.equal(h.editor.active, true);
    if (reason === 'Escape') h.event(target, 'keydown', { key: 'Escape' });
    else if (reason === 'cancel' || reason === 'reset') h.editor[reason]();
    else if (reason === 'blur' || reason === 'resize' || reason === 'pagehide') h.event(h.window, reason);
    else if (reason === 'scroll') h.event(h.document.getElementById('scroll'), reason);
    else h.event(target, reason);
    h.up({ x: 180, y: 100 });
    assert.equal(h.editor.active, false); assert.equal(h.captured, 0); assert.equal(h.commands.length, 0); assert.deepEqual(h.capture(), before);
  });
}

test('revision, view, selection, enabled and blocked changes invalidate an in-flight layout draft', t => {
  for (const change of ['edit', 'undo', 'redo', 'load', 'view', 'selection', 'enabled', 'blocked']) {
    const h = setup(t);
    h.model.execute({ type: 'renameProject', name: 'Prior edit' });
    if (change === 'redo') h.model.undo();
    h.render(); h.mode(); h.down(h.handle(), { x: 150, y: 80 }); h.move({ x: 170, y: 90 });
    if (change === 'edit') h.model.execute({ type: 'renameProject', name: 'Concurrent edit' });
    if (change === 'undo') h.model.undo();
    if (change === 'redo') h.model.redo();
    if (change === 'load') h.store.load(h.store.exportFiles(), h.store.revision);
    if (change === 'view') h.model.switchView(h.store.snapshot.views[1].view.id);
    if (change === 'selection') h.model.select(null);
    if (change === 'enabled') h.enabled = false;
    if (change === 'blocked') h.blocked = true;
    const before = h.capture(); h.up({ x: 180, y: 100 });
    assert.deepEqual(h.capture(), before, `${change} must not be overwritten`); assert.equal(h.commands.length, 0); assert.equal(h.editor.active, false);
  }
});

test('capture failure and reentrant or throwing release cannot stick or duplicate a transaction', t => {
  const failed = setup(t); failed.mode(); failed.failCapture = true; const before = failed.capture();
  failed.drag(failed.handle(), { x: 150, y: 80 }, { x: 180, y: 100 });
  assert.deepEqual(failed.capture(), before); assert.equal(failed.editor.active, false); assert.equal(failed.commands.length, 0);
  const released = setup(t); released.mode(); released.failRelease = true;
  released.drag(released.handle(), { x: 150, y: 80 }, { x: 180, y: 100 }); released.up({ x: 180, y: 100 });
  assert.equal(released.commands.length, 1); assert.equal(released.editor.active, false); assert.equal(released.captured, 0);
});

test('armed insertion uses the selected original index and inverse screen coordinates exactly once', t => {
  for (const index of [-1, 0, 1]) {
    const ctm = matrix(2, 0, 0, 2, 40, 60), h = setup(t, { ctm }); h.mode(); h.choose(index);
    const before = h.capture(); h.find('#layout-add-point').click();
    assert.equal(h.editor.active, true); assert.deepEqual(h.capture(), before);
    const point = screenPoint(ctm, { x: 190.04, y: 130.06 });
    h.down(h.canvas, point); h.up(point); h.pointer(h.canvas, 'click', point);
    h.down(h.canvas, point); h.up(point); h.pointer(h.canvas, 'click', point);
    const expected = structuredClone(h.initial.views[0].connections[0].routePoints.map(({ point }) => point)); expected.splice(index + 1, 0, { x: 190, y: 130.1 });
    assert.deepEqual(h.connection.routePoints.map(({ point }) => point), expected); assert.equal(h.commands.length, 1); assert.equal(h.editor.active, false);
    assert.deepEqual(h.connection.labelPosition, h.initial.views[0].connections[0].labelPosition);
  }
});

test('empty routes support the first insertion and routes at the 128-point limit cannot be armed', t => {
  const empty = setup(t, { bends: [] }); empty.mode();
  assert.deepEqual([...empty.find('#layout-point-select').options].map(option => option.value), ['-1']);
  assert.equal(empty.find('#layout-delete-point').disabled, true); empty.find('#layout-add-point').click();
  empty.down(empty.canvas, { x: 190, y: 130 }); empty.up({ x: 190, y: 130 });
  assert.deepEqual(empty.connection.routePoints.map(({ point }) => point), [{ x: 190, y: 130 }]); assert.equal(empty.commands.length, 1);
  const bends = Array.from({ length: 128 }, (_, index) => ({ x: 150 + index, y: 80 }));
  const full = setup(t, { bends }); full.mode(); const before = full.capture();
  assert.equal(full.find('#layout-add-point').disabled, true); full.find('#layout-add-point').click();
  assert.equal(full.editor.active, false); assert.deepEqual(full.capture(), before); assert.equal(full.commands.length, 0);
  assert.equal(full.canvas.querySelectorAll('[data-layout-kind="bend"]').length, 128);
});

test('armed insertion cancels on Escape or revision change without clearing redo history', t => {
  for (const reason of ['Escape', 'revision']) {
    const h = setup(t); h.model.execute({ type: 'renameProject', name: 'Future name' }); h.model.undo(); h.render(); h.mode();
    h.find('#layout-add-point').click(); assert.equal(h.editor.active, true);
    if (reason === 'Escape') h.event(h.canvas, 'keydown', { key: 'Escape' });
    else h.model.redo();
    const before = h.capture(), point = { x: 170, y: 110 }; h.down(h.canvas, point); h.up(point); h.pointer(h.canvas, 'click', point);
    assert.deepEqual(h.capture(), before); assert.equal(h.editor.active, false); assert.equal(h.commands.length, 0);
  }
});

test('delete removes the selected raw repeated or hidden bend, retaining every other layout field', t => {
  const bends = [{ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 200, y: 80 }, { x: 200, y: 80 }, { x: 350, y: 50 }];
  for (const index of [0, 1, 3, 4]) {
    const h = setup(t, { bends }); h.mode(); h.choose(index); h.find('#layout-delete-point').click();
    const expected = structuredClone(bends); expected.splice(index, 1);
    assert.deepEqual(h.connection.routePoints.map(({ point }) => point), expected); assert.deepEqual(h.connection.labelPosition, { x: 200, y: -20 });
    assert.equal(h.commands.length, 1); assert.deepEqual(h.store.history, { undo: 1, redo: 0 });
    h.model.undo(); assert.deepEqual(h.store.snapshot, h.initial);
  }
});

test('route and label resets change only their own field, and repeated resets preserve redo history', t => {
  for (const kind of ['route', 'label']) {
    const h = setup(t); h.mode(); h.find(`#layout-reset-${kind}`).click();
    assert.equal(h.commands.length, 1);
    if (kind === 'route') { assert.deepEqual(h.connection.routePoints.map(({ point }) => point), []); assert.deepEqual(h.connection.labelPosition, { x: 200, y: -20 }); }
    else { assert.equal(h.connection.labelPosition, null); assert.deepEqual(h.connection.routePoints.map(({ point }) => point), h.initial.views[0].connections[0].routePoints.map(({ point }) => point)); }
    h.model.execute({ type: 'renameProject', name: 'Future unrelated edit' }); h.model.undo(); h.render();
    const before = h.capture(); h.find(`#layout-reset-${kind}`).click();
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 1); h.model.redo();
    assert.equal(h.store.snapshot.project.name, 'Future unrelated edit');
  }
});

test('Delete is scoped to focused layout handles and never removes the shared connection or relationship', t => {
  for (const scope of ['input', 'body', 'selector', 'label', 'bend']) {
    const h = setup(t); h.mode(); h.choose(1); const before = h.capture();
    const target = scope === 'input' ? h.find('#ordinary-input') : scope === 'body' ? h.document.body
      : scope === 'selector' ? h.find('#layout-point-select') : h.handle(scope);
    target.focus(); const pressed = h.event(target, 'keydown', { key: 'Delete' });
    if (scope === 'bend' || scope === 'label') {
      assert.equal(pressed.defaultPrevented, true); assert.equal(h.commands.length, 1);
      if (scope === 'bend') assert.equal(h.connection.routePoints.map(({ point }) => point).length, 1);
      else { assert.equal(h.connection.labelPosition, null); assert.deepEqual(h.connection.routePoints.map(({ point }) => point), h.initial.views[0].connections[0].routePoints.map(({ point }) => point)); }
      assert.equal(h.model.view.connections.length, h.initial.views[0].connections.length);
      assert.deepEqual(h.store.snapshot.relationships, h.initial.relationships);
    } else { assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); }
  }
});

test('Backspace deletes the focused raw bend and resetting an automatic label is a history no-op', t => {
  const h = setup(t, { labelPosition: null }); h.mode();
  const before = h.capture(), label = h.handle('label'); label.focus(); h.event(label, 'keydown', { key: 'Delete' });
  assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
  const target = h.handle('bend', 1); target.focus(); h.event(target, 'keydown', { key: 'Backspace' });
  assert.deepEqual(h.connection.routePoints.map(({ point }) => point), [h.initial.views[0].connections[0].routePoints[0].point]);
  assert.equal(h.connection.labelPosition, null); assert.equal(h.commands.length, 1);
});

function pressArrow(h, target, key, fields = {}) {
  const event = new h.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...fields });
  target.dispatchEvent(event); return event;
}

for (const kind of ['bend', 'label']) {
  test(`focused ${kind} arrows make one canvas-space command each, retain redraw focus and undo/redo independently`, t => {
    const h = setup(t, { ctm: matrix(0, 3, -2, 0, 700, 40) }); h.mode();
    const index = 1, snapshots = [h.store.snapshot];
    let expected = structuredClone(h.initial), commandCount = 0;
    h.handle(kind, index).focus();
    for (const shiftKey of [false, true]) {
      for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowUp', 0, -1]]) {
        const beforeRevision = h.store.revision, target = h.document.activeElement, amount = shiftKey ? 1 : 10;
        assert.equal(target, h.handle(kind, index), 'The next deliberate key uses the replacement handle without refocusing');
        const pressed = pressArrow(h, target, key, { shiftKey, repeat: key === 'ArrowDown' });
        const connection = expected.views[0].connections[0];
        const point = kind === 'bend' ? connection.routePoints[index].point : connection.labelPosition;
        point.x += dx * amount; point.y += dy * amount; commandCount++;
        assert.equal(pressed.defaultPrevented, true); assert.equal(h.commands.length, commandCount);
        assert.equal(h.executions.length, commandCount); assert.equal(h.store.revision, beforeRevision + 1);
        assert.deepEqual(h.executions.at(-1), { command: {
          type: 'updateConnectionLayout', viewId: h.viewId, connectionId: h.connectionId,
          routePoints: connection.routePoints, labelPosition: connection.labelPosition,
        }, revision: beforeRevision, currentRevision: beforeRevision });
        assert.deepEqual(h.store.snapshot, expected, 'Only the focused layout field changes in the selected view');
        assert.deepEqual(h.store.history, { undo: commandCount, redo: 0 });
        assert.equal(h.document.activeElement, h.handle(kind, index));
        assert.equal(h.editor.active, false); assert.equal(h.captured, 0);
        snapshots.push(h.store.snapshot); expected = structuredClone(expected);
      }
    }
    for (let i = snapshots.length - 2; i >= 0; i--) {
      h.model.undo(); assert.deepEqual(h.store.snapshot, snapshots[i]);
    }
    assert.equal(h.session.dirty, false); assert.deepEqual(h.store.history, { undo: 0, redo: commandCount });
    for (const snapshot of snapshots.slice(1)) { h.model.redo(); assert.deepEqual(h.store.snapshot, snapshot); }
    assert.deepEqual(h.store.history, { undo: commandCount, redo: 0 });
  });
}

test('keyboard nudge captures the current revision even when the focused handle predates an unrelated edit', t => {
  const h = setup(t); h.mode(); h.handle().focus();
  pressArrow(h, h.document.activeElement, 'ArrowRight');
  const target = h.document.activeElement;
  h.model.execute({ type: 'renameProject', name: 'Unrelated current-revision edit' });
  const revision = h.store.revision;
  assert.equal(h.document.activeElement, target);
  pressArrow(h, target, 'ArrowDown', { shiftKey: true });
  assert.equal(h.executions.length, 2); assert.equal(h.executions[1].revision, revision);
  assert.equal(h.executions[1].currentRevision, revision); assert.equal(h.store.revision, revision + 1);
  assert.deepEqual(h.connection.routePoints[0].point, { x: 160, y: 81 });
  assert.equal(h.store.snapshot.project.name, 'Unrelated current-revision edit');
  h.model.undo(); assert.deepEqual(h.connection.routePoints[0].point, { x: 160, y: 80 });
  assert.equal(h.store.snapshot.project.name, 'Unrelated current-revision edit');
});

test('keyboard nudges preserve raw hidden and duplicate bend indices independently of the point selector', t => {
  const bends = [{ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 200, y: 80 }, { x: 200, y: 80 }, { x: 350, y: 50 }];
  for (const index of [1, 3, 4]) {
    const h = setup(t, { bends }); h.mode(); h.choose(0); h.handle('bend', index).focus();
    pressArrow(h, h.document.activeElement, 'ArrowLeft');
    const expected = structuredClone(h.initial); expected.views[0].connections[0].routePoints[index].point.x -= 10;
    assert.deepEqual(h.store.snapshot, expected); assert.equal(h.commands.length, 1);
    assert.equal(h.document.activeElement, h.handle('bend', index));
    pressArrow(h, h.document.activeElement, 'ArrowDown', { shiftKey: true });
    expected.views[0].connections[0].routePoints[index].point.y += 1;
    assert.deepEqual(h.store.snapshot, expected); assert.equal(h.commands.length, 2);
    assert.equal(h.document.activeElement, h.handle('bend', index));
  }
});

test('only an explicit automatic-label nudge materializes its displayed SVG anchor, without a second label offset', t => {
  const h = setup(t, { labelPosition: null, ctm: matrix(2, .5, -.25, 3, 120, 90) }); h.mode();
  const before = h.capture(), target = h.handle('label'); target.focus();
  const geometry = connectionGeometry(h.connection, h.model.view.occurrences, () => 0, true);
  assert.deepEqual({ x: geometry.x, y: geometry.y }, { x: 200, y: 68 });
  assert.equal(target.getAttribute('transform'), 'translate(200 68)');
  assert.deepEqual(h.capture(), before); assert.equal(h.connection.labelPosition, null);
  const ignored = pressArrow(h, target, 'ArrowUp', { isComposing: true });
  assert.equal(ignored.defaultPrevented, false); assert.deepEqual(h.capture(), before);
  const pressed = pressArrow(h, target, 'ArrowUp');
  assert.equal(pressed.defaultPrevented, true); assert.deepEqual(h.connection.labelPosition, { x: 200, y: 58 });
  assert.deepEqual(h.connection.routePoints.map(({ point }) => point), h.initial.views[0].connections[0].routePoints.map(({ point }) => point));
  assert.equal(h.handle('label').getAttribute('transform'), 'translate(200 58)');
  assert.equal(h.find(`[data-id="${h.connectionId}"] text`).getAttribute('y'), '58');
  assert.equal(h.document.activeElement, h.handle('label'));
  pressArrow(h, h.document.activeElement, 'ArrowRight', { shiftKey: true });
  assert.deepEqual(h.connection.labelPosition, { x: 201, y: 58 }); assert.equal(h.commands.length, 2);
  h.model.undo(); assert.deepEqual(h.connection.labelPosition, { x: 200, y: 58 });
  h.model.undo(); assert.equal(h.connection.labelPosition, null); assert.equal(h.session.dirty, false);
  h.model.redo(); h.model.redo(); assert.deepEqual(h.connection.labelPosition, { x: 201, y: 58 });
});

test('outward keyboard nudges at every coordinate bound preserve bytes, revision, dirty state and undo/redo', t => {
  for (const kind of ['bend', 'label']) {
    for (const [key, point] of [['ArrowRight', { x: 1000000, y: 42.3 }], ['ArrowLeft', { x: -1000000, y: 42.3 }],
      ['ArrowDown', { x: 42.3, y: 1000000 }], ['ArrowUp', { x: 42.3, y: -1000000 }]]) {
      const options = kind === 'bend' ? { bends: [point, { x: 250, y: 80 }] } : { labelPosition: point };
      const h = setup(t, options);
      h.model.execute({ type: 'renameProject', name: 'Prior unrelated edit' });
      h.model.execute({ type: 'renameProject', name: 'Future unrelated edit' }); h.model.undo(); h.render(); h.mode();
      const before = h.capture(); assert.deepEqual(before.history, { undo: 1, redo: 1 }); h.handle(kind).focus();
      for (const shiftKey of [false, true]) {
        const pressed = pressArrow(h, h.document.activeElement, key, { shiftKey });
        assert.equal(pressed.defaultPrevented, true); assert.deepEqual(h.capture(), before);
        assert.equal(h.commands.length, 0); assert.equal(h.executions.length, 0);
        assert.equal(h.document.activeElement, h.handle(kind));
      }
      h.model.redo(); assert.equal(h.store.snapshot.project.name, 'Future unrelated edit');
    }
  }
});

test('arrow keys belong only to the focused actual layout handles, leaving ordinary controls and unrelated SVG alone', t => {
  for (const scope of ['input', 'textarea', 'editable', 'body', 'selector', 'canvas', 'connection', 'text', 'unfocused-handle', 'outside-clone', 'canvas-clone']) {
    const h = setup(t); h.mode(); const before = h.capture(); let target;
    if (scope === 'textarea' || scope === 'editable') {
      target = h.document.createElement(scope === 'textarea' ? 'textarea' : 'div');
      if (scope === 'editable') target.setAttribute('contenteditable', 'true'); h.document.body.append(target);
    } else if (scope.endsWith('-clone')) {
      target = h.handle().cloneNode(true); (scope === 'canvas-clone' ? h.canvas : h.document.body).append(target);
    } else target = scope === 'input' ? h.find('#ordinary-input') : scope === 'body' ? h.document.body
      : scope === 'selector' ? h.find('#layout-point-select') : scope === 'canvas' ? h.canvas
        : scope === 'connection' ? h.find(`[data-id="${h.connectionId}"]`)
          : scope === 'text' ? h.find(`[data-id="${h.connectionId}"] text`) : h.handle();
    if (scope === 'unfocused-handle') h.find('#ordinary-input').focus();
    else { target.setAttribute('tabindex', '0'); target.focus(); assert.equal(h.document.activeElement, target, scope); }
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const pressed = pressArrow(h, target, key);
      assert.equal(pressed.defaultPrevented, false, `${scope}: ordinary arrow handling must remain available`);
      assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.executions.length, 0);
    }
  }
});

test('Alt, Ctrl, Meta and composing arrows remain untouched even while a layout gesture is active', t => {
  for (const state of ['idle', 'dragging', 'armed']) {
    const h = setup(t, { labelPosition: null }); h.mode();
    if (state === 'dragging') { h.down(h.handle(), { x: 150, y: 80 }); h.move({ x: 180, y: 100 }); }
    if (state === 'armed') h.find('#layout-add-point').click();
    const target = h.handle('label'); target.focus(); const before = h.capture(), generation = h.editor.generation;
    for (const fields of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229, isComposing: false }, { shiftKey: true, ctrlKey: true }]) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const pressed = pressArrow(h, target, key, fields);
        assert.equal(pressed.defaultPrevented, false); assert.deepEqual(h.capture(), before);
        assert.equal(h.editor.active, state !== 'idle'); assert.equal(h.editor.generation, generation);
        assert.equal(h.commands.length, 0); assert.equal(h.executions.length, 0); assert.equal(h.connection.labelPosition, null);
      }
    }
  }
});

test('plain focused-handle arrows cancel pending drags and insertion modes without nudging or accepting late pointerup', t => {
  for (const state of ['pending', 'dragging', 'armed', 'inserting']) {
    const h = setup(t); h.model.execute({ type: 'renameProject', name: 'Future name' }); h.model.undo(); h.render(); h.mode();
    const before = h.capture();
    if (state === 'pending' || state === 'dragging') h.down(h.handle(), { x: 150, y: 80 });
    if (state === 'dragging') h.move({ x: 180, y: 100 });
    if (state === 'armed' || state === 'inserting') h.find('#layout-add-point').click();
    if (state === 'inserting') { h.down(h.canvas, { x: 180, y: 100 }); h.move({ x: 190, y: 110 }); }
    assert.equal(h.editor.active, true); h.handle().focus();
    const pressed = pressArrow(h, h.document.activeElement, 'ArrowRight');
    assert.equal(pressed.defaultPrevented, true); assert.equal(h.editor.active, false); assert.equal(h.captured, 0);
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.executions.length, 0);
    h.up({ x: 300, y: 300 }); h.up({ x: 400, y: 400 });
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0); assert.equal(h.executions.length, 0);
    h.handle().focus(); pressArrow(h, h.document.activeElement, 'ArrowRight');
    assert.equal(h.commands.length, 1); assert.deepEqual(h.connection.routePoints[0].point, { x: 160, y: 80 });
    const committed = h.capture(); h.up({ x: 500, y: 500 }); assert.deepEqual(h.capture(), committed);
  }
});

test('focused-handle arrows are consumed without writes when editing is blocked or its context is no longer eligible', t => {
  for (const state of ['blocked', 'disabled', 'selection', 'view']) {
    const h = setup(t); h.mode(); const target = h.handle(); target.focus();
    if (state === 'blocked') h.blocked = true;
    if (state === 'disabled') h.enabled = false;
    if (state === 'selection') h.model.select(null);
    if (state === 'view') h.model.switchView(h.store.snapshot.views[1].view.id);
    const before = h.capture();
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const pressed = pressArrow(h, target, key);
      assert.equal(pressed.defaultPrevented, true, state); assert.deepEqual(h.capture(), before);
      assert.equal(h.commands.length, 0); assert.equal(h.executions.length, 0); assert.equal(h.editor.active, false);
    }
  }
});

test('clamped keyboard steps preserve perpendicular coordinates and redo, then move only the requested axis', t => {
  // Stored coordinates must pass the core's exact 0.1-grid check; only rendered
  // automatic anchors may be off-grid (covered separately below).
  const point = { x: 1000000, y: 17.1 };
  for (const kind of ['bend', 'label']) {
    const options = kind === 'bend' ? { bends: [point, { x: 250, y: 80 }] } : { labelPosition: point };
    const h = setup(t, options);
    h.model.execute({ type: 'renameProject', name: 'Prior unrelated edit' });
    h.model.execute({ type: 'renameProject', name: 'Future unrelated edit' }); h.model.undo(); h.render(); h.mode();
    h.handle(kind).focus(); const before = h.capture(), snapshot = h.store.snapshot;
    assert.deepEqual(before.history, { undo: 1, redo: 1 });
    for (const shiftKey of [false, true]) {
      const pressed = pressArrow(h, h.document.activeElement, 'ArrowRight', { shiftKey });
      assert.equal(pressed.defaultPrevented, true); assert.deepEqual(h.capture(), before);
      assert.equal(h.executions.length, 0); assert.equal(h.commands.length, 0);
      assert.equal(h.document.activeElement, h.handle(kind));
    }
    const pressed = pressArrow(h, h.document.activeElement, 'ArrowLeft');
    const expected = structuredClone(snapshot), connection = expected.views[0].connections[0];
    if (kind === 'bend') connection.routePoints[0].point.x = 999990;
    else connection.labelPosition.x = 999990;
    assert.equal(pressed.defaultPrevented, true); assert.equal(h.executions.length, 1); assert.equal(h.commands.length, 1);
    assert.deepEqual(h.store.snapshot, expected, 'The untouched y coordinate remains exactly 17.1');
    assert.deepEqual(h.store.history, { undo: 2, redo: 0 });
    h.model.undo(); assert.deepEqual(h.store.snapshot, snapshot);
    h.model.redo(); assert.deepEqual(h.store.snapshot, expected);
  }
});

test('an automatic label at the coordinate bound stays null for clamped nudges even with an off-grid anchor', t => {
  const h = setup(t, { labelPosition: null, geometryFor(connection, view) {
    const geometry = connectionGeometry(connection, view.occurrences, () => 0, true);
    return connection.labelPosition === null ? { ...geometry, x: 1000000, y: 17.12345 } : geometry;
  } });
  h.model.execute({ type: 'renameProject', name: 'Prior unrelated edit' });
  h.model.execute({ type: 'renameProject', name: 'Future unrelated edit' }); h.model.undo(); h.render(); h.mode();
  h.handle('label').focus(); const before = h.capture(), snapshot = h.store.snapshot;
  assert.equal(h.handle('label').getAttribute('transform'), 'translate(1000000 17.12345)');
  for (const shiftKey of [false, true]) {
    const pressed = pressArrow(h, h.document.activeElement, 'ArrowRight', { shiftKey });
    assert.equal(pressed.defaultPrevented, true); assert.deepEqual(h.capture(), before);
    assert.equal(h.connection.labelPosition, null); assert.equal(h.executions.length, 0); assert.equal(h.commands.length, 0);
  }
  pressArrow(h, h.document.activeElement, 'ArrowLeft');
  assert.deepEqual(h.connection.labelPosition, { x: 999990, y: 17.1 });
  assert.deepEqual(h.connection.routePoints.map(({ point }) => point), snapshot.views[0].connections[0].routePoints.map(({ point }) => point));
  assert.equal(h.executions.length, 1); assert.equal(h.commands.length, 1);
  h.model.undo(); assert.deepEqual(h.store.snapshot, snapshot);
  h.model.redo(); assert.deepEqual(h.connection.labelPosition, { x: 999990, y: 17.1 });
});

test('unrelated focused-handle keys remain available to existing shortcuts and native navigation', t => {
  for (const state of ['idle', 'dragging', 'armed']) {
    const h = setup(t); h.mode();
    if (state === 'dragging') { h.down(h.handle(), { x: 150, y: 80 }); h.move({ x: 180, y: 100 }); }
    if (state === 'armed') h.find('#layout-add-point').click();
    h.handle().focus(); const before = h.capture(), generation = h.editor.generation;
    for (const key of ['q', 'Enter', ' ', 'F2', 'Home', 'End', 'PageUp', 'Tab']) {
      assert.equal(pressArrow(h, h.document.activeElement, key).defaultPrevented, false);
      assert.deepEqual(h.capture(), before); assert.equal(h.editor.generation, generation); assert.equal(h.editor.active, state !== 'idle');
    }
  }
});

const anchoredRoute = () => [
  { kind: 'anchor', id: 'anc-11111111-1111-4111-8111-111111111111', point: { x: 150, y: -80 } },
  { kind: 'bend', point: { x: 200, y: -100 } },
  { kind: 'anchor', id: 'anc-22222222-2222-4222-8222-222222222222', point: { x: 250, y: -80 } },
];

test('anchor handles expose attachment identity and never enable bend deletion on selection or pointerdown', t => {
  const h = setup(t, { routePoints: anchoredRoute(), dependent: true }); h.mode();
  const before = h.capture(), target = h.handle('anchor', 0);
  assert.ok(target); assert.match(target.getAttribute('aria-label'), /Якорь присоединения/);
  assert.doesNotMatch(target.getAttribute('aria-label'), /Delete/);
  h.choose(0); assert.equal(h.find('#layout-delete-point').disabled, true);
  h.find('#layout-delete-point').click(); assert.deepEqual(h.capture(), before);
  h.choose(1); assert.equal(h.find('#layout-delete-point').disabled, false);
  h.down(h.handle('anchor', 0), { x: 150, y: -80 });
  assert.equal(h.find('#layout-delete-point').disabled, true);
  h.up({ x: 150, y: -80 }); assert.deepEqual(h.capture(), before);
  for (const key of ['Delete', 'Backspace']) {
    const focused = h.handle('anchor', 0); focused.focus();
    assert.equal(pressArrow(h, focused, key).defaultPrevented, true);
    assert.deepEqual(h.capture(), before); assert.equal(h.commands.length, 0);
  }
});

test('anchor drag previews update dependent endpoints and commit one undoable point change', t => {
  const h = setup(t, { routePoints: anchoredRoute(), dependent: true }); h.mode();
  const before = h.capture(), initial = h.store.snapshot, target = h.handle('anchor', 0);
  const dependent = h.model.view.connections[1], path = () => h.find(`[data-id="${dependent.id}"] path`).getAttribute('d');
  const originalPath = path();
  h.down(target, { x: 150, y: -80 }); h.move({ x: 175, y: -100 });
  assert.deepEqual(h.capture(), before); assert.notEqual(path(), originalPath); assert.match(path(), /L 175 -100$/);
  h.up({ x: 185, y: -110 }); h.up({ x: 900, y: 900 });
  assert.equal(h.commands.length, 1); assert.equal(h.executions.length, 1);
  const expected = structuredClone(initial); expected.views[0].connections[0].routePoints[0].point = { x: 185, y: -110 };
  assert.deepEqual(h.store.snapshot, expected);
  assert.match(path(), /L 185 -110$/);
  h.model.undo(); h.render(); assert.deepEqual(h.store.snapshot, initial); assert.equal(path(), originalPath); assert.equal(h.session.dirty, false);
  h.model.redo(); h.render(); assert.deepEqual(h.store.snapshot, expected); assert.match(path(), /L 185 -110$/);
});

test('anchor keyboard nudges retain identity and redraw focus, while resetting bends preserves attachments and label', t => {
  const h = setup(t, { routePoints: anchoredRoute(), dependent: true }); h.mode(); h.handle('anchor', 2).focus();
  pressArrow(h, h.document.activeElement, 'ArrowRight');
  assert.equal(h.document.activeElement, h.handle('anchor', 2));
  assert.deepEqual(h.connection.routePoints[2], { ...anchoredRoute()[2], point: { x: 260, y: -80 } });
  pressArrow(h, h.document.activeElement, 'ArrowUp', { shiftKey: true });
  assert.equal(h.document.activeElement, h.handle('anchor', 2));
  assert.deepEqual(h.connection.routePoints[2], { ...anchoredRoute()[2], point: { x: 260, y: -81 } });
  const anchors = h.connection.routePoints.filter(item => item.kind === 'anchor'), label = h.connection.labelPosition;
  h.find('#layout-reset-route').click();
  assert.deepEqual(h.connection.routePoints, anchors); assert.deepEqual(h.connection.labelPosition, label);
  assert.equal(h.commands.length, 3); assert.equal(h.find('#layout-reset-route').disabled, true);
  assert.equal(h.model.view.connections[1].target.anchorId, anchors[0].id);
  const after = h.capture(); h.find('#layout-reset-route').click(); assert.deepEqual(h.capture(), after);
  h.model.undo(); assert.equal(h.connection.routePoints.length, 3);
  h.model.undo(); h.model.undo(); assert.deepEqual(h.store.snapshot, h.initial);
});

test('canceling an anchor preview restores all attached paths and keeps history unchanged', t => {
  for (const cancel of ['Escape', 'pointercancel', 'blur']) {
    const h = setup(t, { routePoints: anchoredRoute(), dependent: true }); h.mode();
    const before = h.capture(), paths = () => [...h.canvas.querySelectorAll('[data-kind="connection"] path')].map(item => item.getAttribute('d'));
    const original = paths();
    h.down(h.handle('anchor', 0), { x: 150, y: -80 }); h.move({ x: 190, y: -130 });
    assert.notDeepEqual(paths(), original);
    if (cancel === 'Escape') h.event(h.document, 'keydown', { key: 'Escape' });
    else h.event(cancel === 'blur' ? h.window : h.canvas, cancel);
    h.up({ x: 200, y: -150 });
    assert.deepEqual(h.capture(), before); assert.deepEqual(paths(), original); assert.equal(h.commands.length, 0);
  }
});
