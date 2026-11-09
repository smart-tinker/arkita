import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { createProjectSession } from '../src/project-session.js';
import { createLocalPreferences } from '../src/preferences.js';
import { WORKSPACE_ORDERS } from '../../schemka-model-io/src/preferences-profile.js';
import { installWorkspace, workspacePreferences, helpContext } from '../src/workspace-ui.js';

function setup(t, saved = null, { queuedClose = false, width = 1400, unified = false } = {}) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url:'https://arkita.invalid/', pretendToBeVisual:true });
  t.after(() => dom.window.close());
  const { document } = dom.window, $ = id => document.getElementById(id), messages = [], flags = { blocked:false }, closeEvents = [];
  dom.window.HTMLElement.prototype.getClientRects = function () {
    const body = document.body;
    const hidden = this.closest('[hidden]') || (this.closest('.catalog') && body.dataset.workspaceCatalog === 'false') || (this.closest('.toolbox') && body.dataset.workspacePalette === 'false');
    return this.isConnected && !hidden ? [{ width: 100, height: 20 }] : [];
  };
  const layout = { width };
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, get: () => layout.width });
  dom.window.matchMedia = () => ({ get matches() { return layout.width <= 850; } });
  const rectangle = (left, width) => ({ left, right: left + width, top: 0, bottom: 640, width, height: 640 });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.matches('.editor-shell')) return rectangle(20, layout.width);
    const body = document.body, order = (body.dataset.workspaceOrder || 'catalog-canvas-palette').split('-');
    const shown = key => key === 'canvas' || body.dataset[key === 'catalog' ? 'workspaceCatalog' : 'workspacePalette'] !== 'false' && !(key === 'palette' && body.dataset.paletteDetached === 'true');
    const widths = { catalog: Number.parseFloat(body.style.getPropertyValue('--workspace-catalog-width')) || 240, palette: Number.parseFloat(body.style.getPropertyValue('--workspace-palette-width')) || 240 };
    widths.canvas = layout.width - ['catalog', 'palette'].filter(shown).reduce((sum, key) => sum + widths[key], 0);
    let left = 20;
    for (const key of order.filter(shown)) {
      if (this.matches({ catalog: '.catalog', canvas: '.canvas-panel', palette: '.toolbox' }[key])) return rectangle(left, widths[key]);
      left += widths[key];
    }
    return rectangle(0, 0);
  };
  dom.window.HTMLElement.prototype.setPointerCapture = function (id) { this.capture = id; };
  dom.window.HTMLElement.prototype.hasPointerCapture = function (id) { return this.capture === id; };
  dom.window.HTMLElement.prototype.releasePointerCapture = function () { delete this.capture; };
  const panel = name => {
    document.body.dataset.mobilePanel = name;
    for (const item of document.querySelectorAll('[data-panel]')) item.setAttribute('aria-pressed', String(item.dataset.panel === name));
  };
  const store = createStore(createProject('Untouched')), session = createProjectSession(store);
  store.execute({ type:'renameProject', name:'Past' }, store.revision); store.execute({ type:'renameProject', name:'Future' }, store.revision); store.undo(store.revision);
  for (const d of document.querySelectorAll('dialog')) {
    d.showModal = () => d.setAttribute('open','');
    d.close = () => {
      d.removeAttribute('open');
      const notify = () => d.dispatchEvent(new dom.window.Event('close'));
      if (queuedClose) closeEvents.push(notify); else notify();
    };
  }
  if (saved !== null) dom.window.localStorage.setItem('arkita.workspace.v1', saved);
  const preferences = unified ? createLocalPreferences(dom.window.localStorage) : null;
  const ui = installWorkspace({ document, window:dom.window, preferences, blocked:() => flags.blocked, status:message => messages.push(message), openDialog:id => $(id).showModal(), panel });
  const writes = [], prototype = Object.getPrototypeOf(dom.window.localStorage), setItem = prototype.setItem;
  Object.defineProperty(prototype, 'setItem', { configurable: true, value(key, value) { writes.push({ key, value }); return setItem.call(this, key, value); } });
  const pointer = (target, type, options = {}) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { button: 0, buttons: 1, isPrimary: true, pointerId: 1, clientX: 300, ...options }); target.dispatchEvent(event); return event;
  };
  const key = (target, name, options = {}) => { const event = new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event; };
  const resizeWindow = width => { layout.width = width; dom.window.dispatchEvent(new dom.window.Event('resize')); };
  const capture = () => ({ files:store.exportFiles(), revision:store.revision, history:store.history, dirty:session.dirty });
  return { dom, document, $, ui, flags, messages, capture, panel, writes, pointer, key, resizeWindow, preferences, flushClose() { for (const notify of closeEvents.splice(0)) notify(); }, submit() { $('workspace-form').dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true })); } };
}

test('local preferences validate exact allowlist, enums and sizes without accepting arbitrary CSS', () => {
  const value = workspacePreferences({ catalog:'false', palette:false, catalogWidth:Infinity, paletteWidth:419, paletteMode:'url(https://outside)', paletteSize:0, paletteFont:12.5, hiddenCategories:['relationships','relationships','unknown'] });
  assert.equal(value.catalog,true); assert.equal(value.palette,false); assert.equal(value.catalogWidth,240); assert.equal(value.paletteWidth,419);
  assert.equal(value.paletteMode,'list'); assert.equal(value.paletteSize,24); assert.equal(value.paletteFont,12);
  assert.deepEqual(value.hiddenCategories,['relationships']);
  for (const invalid of [null, [], 'bad', 2]) assert.deepEqual(workspacePreferences(invalid),workspacePreferences(null));
});

test('Apply, Cancel and defaults have separate effects, persist only local state and preserve both model histories', t => {
  const h = setup(t), before = h.capture(); h.$('project-name').focus(); h.ui.open();
  h.$('workspace-catalog').checked = false; h.$('workspace-palette').checked = false;
  h.$('workspace-catalogWidth').value = '400'; h.$('workspace-paletteMode').value = 'compact'; h.$('workspace-category-relationships').checked = false;
  h.submit(); assert.equal(h.$('workspace-dialog').open,false); assert.equal(h.ui.settings.catalog,false); assert.equal(h.ui.settings.palette,false);
  assert.equal(h.document.body.dataset.paletteMode,'compact'); assert.equal(h.document.body.hasAttribute('data-hide-relationships'),true);
  assert.match(h.$('workspace-filter-note').textContent,/Поиск охватывает всю модель/);
  assert.deepEqual(h.capture(),before);
  const saved = h.dom.window.localStorage.getItem('arkita.workspace.v1');
  h.ui.open(); h.$('workspace-defaults').click(); h.$('workspace-cancel').click(); assert.equal(h.dom.window.localStorage.getItem('arkita.workspace.v1'),saved);
  assert.equal(h.ui.settings.catalog,false); h.$('workspace-reset').click(); assert.equal(h.ui.settings.catalog,true); assert.equal(h.ui.settings.palette,true);
  assert.equal(h.$('workspace-filter-note').hidden,true); assert.deepEqual(h.capture(),before);
});

test('invalid input does not Apply, corrupted storage does not block startup, blocked controls preserve a draft', t => {
  const h = setup(t, '{broken'); h.ui.open(); h.$('workspace-paletteWidth').value = '900'; h.submit();
  assert.equal(h.$('workspace-dialog').open,true); assert.equal(h.ui.settings.paletteWidth,240); h.$('workspace-cancel').click();
  const draft = h.$('model-search'); draft.value = 'Не терять'; draft.focus(); h.flags.blocked = true;
  h.$('workspace-toggle-catalog').click(); h.$('workspace-reset').click(); h.$('workspace-button').click();
  assert.equal(h.ui.settings.catalog,true); assert.equal(draft.value,'Не терять'); assert.equal(h.$('workspace-dialog').open,false);
});

test('F1 opens the relevant offline article without canceling text or mutating the model, and restores focus', t => {
  const h = setup(t), before = h.capture(), input = h.$('model-search'); input.value = 'Сохранить текст'; input.focus();
  const event = new h.dom.window.KeyboardEvent('keydown', { key:'F1', bubbles:true, cancelable:true }); input.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true); assert.equal(h.$('help-dialog').open,true);
  assert.match(h.$('help-article').textContent,/Каталог и поиск/); assert.equal(input.value,'Сохранить текст'); assert.deepEqual(h.capture(),before);
  assert.equal(h.$('help-dialog').querySelector('script,img,iframe'),null);
  h.$('help-dialog').close(); assert.equal(h.document.activeElement,input);
  for (const [id, topic] of [['palette-search','palette'],['canvas','canvas'],['workspace-catalog','workspace'],['documentation-dialog','properties'],['git-dialog','git']]) assert.equal(helpContext(h.$(id)),topic);
});

test('tutorial progress is explicit and repeatable without executing creation or changing the current model', t => {
  const h = setup(t), before = h.capture(); h.$('tutorial-button').click();
  assert.equal(h.$('help-tutorial').hidden,false); const inputs = [...h.$('help-tutorial').querySelectorAll('input')]; assert.equal(inputs.length,6);
  inputs[0].click(); assert.deepEqual(JSON.parse(h.dom.window.localStorage.getItem('arkita.tutorial.v1')),[0]);
  h.$('help-dialog').close(); h.$('tutorial-button').click(); assert.equal(inputs[0].checked,true); assert.deepEqual(h.capture(),before);
  const reset = [...h.$('help-tutorial').querySelectorAll('button')].at(-1); reset.click(); assert.deepEqual(JSON.parse(h.dom.window.localStorage.getItem('arkita.tutorial.v1')),[]);
});

test('tutorial handoff survives a queued native close event and reveals the palette through the shared panel callback', t => {
  const h = setup(t, JSON.stringify({ palette: false }), { queuedClose: true }), before = h.capture(), original = h.$('model-search');
  original.focus(); h.ui.openHelp('tutorial');
  h.$('help-tutorial').querySelectorAll('li button')[1].click();
  assert.equal(h.$('help-dialog').open, false); h.flushClose();
  assert.equal(h.document.activeElement, h.$('palette-search'));
  assert.equal(h.ui.settings.palette, true); assert.equal(h.document.body.dataset.mobilePanel, 'inspector');
  assert.equal(h.document.querySelector('[data-panel="inspector"]').getAttribute('aria-pressed'), 'true');
  assert.equal(h.document.querySelector('[data-panel="canvas"]').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(h.capture(), before);
});

test('hiding the active panel falls back to canvas and an explicit reveal restores its local preference', t => {
  const h = setup(t), before = h.capture();
  for (const [name, setting] of [['catalog', 'catalog'], ['inspector', 'palette']]) {
    h.panel(name); h.$(`workspace-toggle-${setting}`).click();
    assert.equal(h.document.body.dataset.mobilePanel, 'canvas');
    assert.equal(h.document.querySelector('[data-panel="canvas"]').getAttribute('aria-pressed'), 'true');
    assert.equal(h.document.querySelector(`[data-panel="${name}"]`).getAttribute('aria-pressed'), 'false');
    assert.equal(h.ui.settings[setting], false);
    h.ui.revealPanel(name); h.panel(name);
    assert.equal(h.ui.settings[setting], true); assert.equal(JSON.parse(h.dom.window.localStorage.getItem('arkita.workspace.v1'))[setting], true);
  }
  h.ui.open(); h.$('workspace-palette').checked = false; h.submit();
  assert.equal(h.document.body.dataset.mobilePanel, 'canvas'); assert.deepEqual(h.capture(), before);
});

test('reset retains the persistence failure message while applying defaults only to this window', t => {
  const h = setup(t, JSON.stringify({ catalog: false, palette: false })), before = h.capture();
  Object.defineProperty(Object.getPrototypeOf(h.dom.window.localStorage), 'setItem', { configurable: true, value() { throw Error('quota'); } });
  h.$('workspace-reset').click();
  assert.equal(h.ui.settings.catalog, true); assert.equal(h.ui.settings.palette, true);
  assert.match(h.messages.at(-1), /сохранить их между запусками не удалось/);
  assert.deepEqual(h.capture(), before);
});

test('fullscreen toggles via F11, permits exit while blocked, and reports unavailable or rejected APIs', async t => {
  const h = setup(t), before = h.capture(); let active = null, entered = 0, exited = 0;
  Object.defineProperty(h.document,'fullscreenElement',{ get:() => active });
  h.document.documentElement.requestFullscreen = async () => { entered++; active = h.document.documentElement; };
  h.document.exitFullscreen = async () => { exited++; active = null; };
  const key = () => h.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{ key:'F11',bubbles:true,cancelable:true }));
  key(); await Promise.resolve(); assert.equal(entered,1); h.flags.blocked = true; key(); await Promise.resolve(); assert.equal(exited,1);
  key(); assert.equal(entered,1); h.flags.blocked = false;
  h.document.documentElement.requestFullscreen = async () => { throw Error('Denied'); }; key(); await Promise.resolve(); assert.match(h.messages.at(-1),/Denied/);
  assert.deepEqual(h.capture(),before);
});


test('pane drags follow all six panel orders, expose accessible widths and persist once per completed drag without model history', t => {
  for (const order of WORKSPACE_ORDERS) {
    const h = setup(t, JSON.stringify({ order })), before = h.capture();
    for (const key of ['catalog', 'palette']) {
      const handle = h.$(`workspace-resize-${key}`), direction = order.indexOf(key) < order.indexOf('canvas') ? 1 : -1;
      assert.equal(handle.getAttribute('role'), 'separator'); assert.equal(handle.getAttribute('aria-orientation'), 'vertical');
      assert.equal(h.$(handle.getAttribute('aria-controls')), h.document.querySelector(key === 'catalog' ? '.catalog' : '.toolbox'));
      assert.equal(handle.hidden, false); assert.equal(handle.getAttribute('aria-valuenow'), '240');
      const pane = h.$(handle.getAttribute('aria-controls')), bounds = pane.getBoundingClientRect();
      assert.equal(handle.style.left, `${(direction === 1 ? bounds.right : bounds.left) - 20}px`);
      const writes = h.writes.length;
      h.pointer(handle, 'pointerdown'); assert.equal(h.ui.active, true); assert.equal(h.document.activeElement, handle);
      h.pointer(h.dom.window, 'pointermove', { clientX: 320 * direction + 300, pointerId: 2 });
      assert.equal(handle.getAttribute('aria-valuenow'), '240');
      h.pointer(h.dom.window, 'pointermove', { clientX: 300 + 20 * direction });
      h.pointer(h.dom.window, 'pointermove', { clientX: 300 + 45 * direction });
      assert.equal(handle.getAttribute('aria-valuenow'), '285'); assert.equal(h.ui.settings[`${key}Width`], 240);
      assert.equal(h.writes.length, writes);
      h.pointer(h.dom.window, 'pointerup', { pointerId: 2 }); assert.equal(h.ui.active, true);
      h.pointer(h.dom.window, 'pointerup'); assert.equal(h.ui.active, false); assert.equal(handle.hasPointerCapture(1), false);
      assert.equal(h.ui.settings[`${key}Width`], 285); assert.equal(h.writes.length, writes + 1);
      assert.equal(JSON.parse(h.writes.at(-1).value)[`${key}Width`], 285);
      h.pointer(h.dom.window, 'pointerup'); assert.equal(h.writes.length, writes + 1);
    }
    assert.deepEqual(h.capture(), before);
  }
});

test('cancelled pane drags, lost pointer events and blocked or secondary pointers preserve stored widths and both histories', async t => {
  const cancellations = ['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'resize', 'visibilitychange', 'detached', 'buttons'];
  for (const reason of cancellations) {
    const h = setup(t), handle = h.$('workspace-resize-palette'), before = h.capture();
    h.pointer(handle, 'pointerdown', { button: 2 }); assert.equal(h.ui.active, false);
    h.pointer(handle, 'pointerdown', { isPrimary: false }); assert.equal(h.ui.active, false);
    h.pointer(handle, 'pointerdown'); h.pointer(h.dom.window, 'pointermove', { clientX: 250 });
    assert.equal(handle.getAttribute('aria-valuenow'), '290');
    if (reason === 'Escape') h.key(handle, 'Escape');
    else if (reason === 'lostpointercapture') h.pointer(handle, reason);
    else if (reason === 'pointercancel') h.pointer(h.dom.window, reason);
    else if (reason === 'buttons') h.pointer(h.dom.window, 'pointermove', { buttons: 0 });
    else if (reason === 'visibilitychange') { Object.defineProperty(h.document, 'hidden', { value: true }); h.document.dispatchEvent(new h.dom.window.Event(reason)); }
    else if (reason === 'detached') { h.document.body.dataset.paletteDetached = 'true'; await Promise.resolve(); }
    else h.dom.window.dispatchEvent(new h.dom.window.Event(reason));
    assert.equal(h.ui.active, false, reason); assert.equal(h.ui.settings.paletteWidth, 240, reason); assert.equal(h.writes.length, 0, reason);
    assert.equal(h.document.body.classList.contains('workspace-resizing'), false); assert.deepEqual(h.capture(), before);
  }
  const h = setup(t), handle = h.$('workspace-resize-catalog'), input = h.$('model-search');
  input.value = 'Черновик'; input.focus(); h.flags.blocked = true;
  assert.equal(h.pointer(handle, 'pointerdown').defaultPrevented, true); h.key(handle, 'ArrowRight');
  assert.equal(h.ui.active, false); assert.equal(h.document.activeElement, input); assert.equal(input.value, 'Черновик'); assert.equal(h.writes.length, 0);
});

test('pane widths clamp to the viewport without rewriting preferences and hiding or detaching removes the corresponding separator', async t => {
  const h = setup(t, JSON.stringify({ catalogWidth: 420, paletteWidth: 420 })), before = h.capture();
  h.resizeWindow(900);
  assert.equal(h.$('workspace-resize-catalog').getAttribute('aria-valuemax'), '270'); assert.equal(h.$('workspace-resize-catalog').getAttribute('aria-valuenow'), '270');
  assert.equal(h.document.querySelector('.canvas-panel').getBoundingClientRect().width, 360);
  h.pointer(h.$('workspace-resize-catalog'), 'pointerdown'); h.pointer(h.dom.window, 'pointerup');
  assert.equal(h.ui.settings.catalogWidth, 420); assert.equal(h.writes.length, 0);
  h.resizeWindow(1600); assert.equal(h.$('workspace-resize-catalog').getAttribute('aria-valuenow'), '420');
  h.resizeWindow(850); for (const key of ['catalog', 'palette']) assert.equal(h.$(`workspace-resize-${key}`).hidden, true);
  h.pointer(h.$('workspace-resize-catalog'), 'pointerdown'); assert.equal(h.ui.active, false); assert.equal(h.writes.length, 0);
  h.resizeWindow(1400); const catalog = h.$('workspace-resize-catalog'); catalog.focus(); h.$('workspace-toggle-catalog').click();
  assert.equal(catalog.hidden, true); assert.equal(h.document.activeElement, h.$('canvas'));
  h.ui.revealPanel('catalog'); assert.equal(catalog.hidden, false);
  h.document.body.dataset.paletteDetached = 'true'; await Promise.resolve(); assert.equal(h.$('workspace-resize-palette').hidden, true);
  h.document.body.dataset.paletteDetached = 'false'; await Promise.resolve(); assert.equal(h.$('workspace-resize-palette').hidden, false);
  assert.deepEqual(h.capture(), before);
});

test('separator keyboard commands respect panel direction and width bounds without reaching canvas shortcuts', t => {
  for (const order of ['catalog-canvas-palette', 'palette-canvas-catalog']) {
    const h = setup(t, JSON.stringify({ order })), before = h.capture(); let escaped = 0;
    h.document.addEventListener('keydown', () => escaped++);
    for (const key of ['catalog', 'palette']) {
      const handle = h.$(`workspace-resize-${key}`), direction = order.indexOf(key) < order.indexOf('canvas') ? 1 : -1;
      h.key(handle, 'ArrowRight'); assert.equal(h.ui.settings[`${key}Width`], 240 + 10 * direction);
      h.key(handle, 'ArrowLeft', { shiftKey: true }); assert.equal(h.ui.settings[`${key}Width`], 240 - 20 * direction);
      h.key(handle, 'Home'); assert.equal(h.ui.settings[`${key}Width`], 180);
      h.key(handle, 'End'); assert.equal(h.ui.settings[`${key}Width`], 420);
      const writes = h.writes.length; h.key(handle, direction === 1 ? 'ArrowRight' : 'ArrowLeft'); assert.equal(h.writes.length, writes);
      for (const key of ['Delete', 'F2', 'Escape']) assert.equal(h.key(handle, key).defaultPrevented, true);
      assert.equal(escaped, 0);
    }
    assert.deepEqual(h.capture(), before);
  }
});

test('a completed drag reports local persistence failure and still retains the chosen width in the current window', t => {
  const h = setup(t), before = h.capture();
  Object.defineProperty(Object.getPrototypeOf(h.dom.window.localStorage), 'setItem', { configurable: true, value() { throw Error('quota'); } });
  h.pointer(h.$('workspace-resize-catalog'), 'pointerdown'); h.pointer(h.dom.window, 'pointermove', { clientX: 345 }); h.pointer(h.dom.window, 'pointerup');
  assert.equal(h.ui.settings.catalogWidth, 285); assert.match(h.messages.at(-1), /сохранить их между запусками не удалось/); assert.deepEqual(h.capture(), before);
});


test('adopting newer workspace preferences cancels an in-flight drag without writing its stale width over the new layout', t => {
  const h = setup(t, null, { unified: true }), before = h.capture(), handle = h.$('workspace-resize-catalog');
  h.pointer(handle, 'pointerdown'); h.pointer(h.dom.window, 'pointermove', { clientX: 350 });
  const next = h.preferences.snapshot; next.workspace.order = 'palette-canvas-catalog'; next.workspace.catalog = false; next.workspace.paletteWidth = 390;
  h.preferences.adopt(next);
  assert.equal(h.ui.active, false); assert.equal(handle.hidden, true); assert.equal(h.ui.settings.paletteWidth, 390);
  h.pointer(h.dom.window, 'pointerup'); assert.equal(h.writes.length, 0); assert.deepEqual(h.preferences.snapshot, next); assert.deepEqual(h.capture(), before);
});
