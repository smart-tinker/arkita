import test from 'node:test';
import assert from 'node:assert/strict';
import { installContextMenu } from '../src/context-menu.js';

// Small DOM/event harness, including capture and focus propagation. These tests
// check interaction policy and geometry arithmetic, not browser rendering/QA.
function setup(options = {}) {
  let document;
  class Target {
    constructor() { this.listeners = new Map(); this.parentNode = null; }
    addEventListener(type, fn, capture = false) {
      const list = this.listeners.get(type) || [];
      list.push({ fn, capture }); this.listeners.set(type, list);
    }
    removeEventListener(type, fn, capture = false) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.fn !== fn || item.capture !== capture));
    }
    event(type, overrides = {}) {
      const event = { type, target: this, bubbles: !['focus', 'blur'].includes(type), defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
      const path = []; for (let node = event.target; node; node = node.parentNode) path.push(node);
      const invoke = (node, capture) => {
        event.currentTarget = node;
        for (const listener of [...(node.listeners.get(type) || [])]) if (listener.capture === capture) listener.fn(event);
      };
      for (const node of path.toReversed()) { invoke(node, true); if (event.stopped) return event; }
      invoke(event.target, false);
      if (event.bubbles && !event.stopped) for (const node of path.slice(1)) { invoke(node, false); if (event.stopped) break; }
      return event;
    }
  }
  class Element extends Target {
    constructor(tag) {
      super(); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map();
      this.dataset = {}; this.style = {}; this.hidden = false; this.disabled = false; this.scrollTop = 0; this.scrollLeft = 0;
      this.rect = { left: 70, top: 40, width: 120, height: 30 }; this.textContent = '';
    }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
    remove() { if (this.parentNode?.children) this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; }
    contains(target) {
      if (target && !target.nodeType) throw new TypeError('contains requires a Node');
      return Boolean(target && (target === this || this.children.some(child => child.contains(target))));
    }
    get isConnected() { return document?.documentElement.contains(this) || false; }
    matches(selector) {
      if (selector === '[contenteditable]:not([contenteditable="false"])') return this.attrs.has('contenteditable') && this.getAttribute('contenteditable') !== 'false';
      if (selector === '[role="dialog"]') return this.getAttribute('role') === 'dialog';
      if (selector === 'dialog[open]') return this.tagName === 'DIALOG' && this.attrs.has('open');
      if (selector === 'a[href]') return this.tagName === 'A' && this.attrs.has('href');
      if (selector.startsWith('[')) return this.attrs.has(selector.slice(1, -1));
      if (selector.startsWith('.')) return (this.getAttribute('class') || '').split(' ').includes(selector.slice(1));
      return this.tagName.toLowerCase() === selector;
    }
    closest(selectors) {
      for (let node = this; node?.matches; node = node.parentNode) if (selectors.split(',').some(selector => node.matches(selector))) return node;
      return null;
    }
    querySelector(selector) {
      for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; }
      return null;
    }
    focus() {
      if (!this.isConnected || this.hidden || this.disabled || (!this.matches('button') && !this.attrs.has('tabindex') && this.tabIndex === undefined && !['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName))) return;
      document.activeElement = this; this.event('focus'); this.event('focusin');
    }
    getBoundingClientRect() {
      let rect = this.rect;
      if (this === host) {
        rect = { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0,
          width: Math.min(this.rect.width, parseFloat(this.style.maxWidth) || Infinity), height: Math.min(this.rect.height, parseFloat(this.style.maxHeight) || Infinity) };
      } else if (this.parentNode === host) {
        const menu = host.getBoundingClientRect();
        rect = { left: menu.left + 4, top: menu.top + 4 + host.children.indexOf(this) * 32 - host.scrollTop, width: menu.width - 8, height: 32 };
      }
      return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };
    }
    set innerHTML(_) { throw Error('HTML interpretation is forbidden'); }
  }
  const window = new Target(); Object.assign(window, { innerWidth: 1000, innerHeight: 800, scrollX: 320, scrollY: 750 });
  if (options.visualViewport) { window.visualViewport = Object.assign(new Target(), options.visualViewport); }
  document = new Target(); document.nodeType = 9; document.parentNode = window;
  document.documentElement = new Element('html'); document.documentElement.parentNode = document;
  document.documentElement.clientWidth = 1000; document.documentElement.clientHeight = 800;
  document.body = new Element('body'); document.documentElement.append(document.body); document.activeElement = document.body;
  document.createElement = tag => new Element(tag); document.querySelector = selector => document.documentElement.querySelector(selector);
  const host = new Element('div'); host.rect = { left: 0, top: 0, width: 240, height: 140 };
  const anchor = new Element('button'), other = new Element('button'), fallback = new Element('button');
  anchor.context = { kind: 'occurrence', id: 'occurrence-a' }; other.context = { kind: 'element', id: 'element-b' };
  document.body.append(anchor, other, fallback, host); anchor.focus();
  const boundary = { revision: 7, viewId: 'view-a' }, calls = [], reports = [], resolutions = [], preparations = [], restores = [];
  let action = context => calls.push(context), allowOpen = true, failBoundary = false;
  let items = [
    { id: 'rename', label: 'Переименовать…', action: context => action(context) },
    { id: 'blocked', label: 'Недоступно', disabled: true, action: context => action(context) },
    { id: 'delete', label: 'Удалить…', action: context => action(context) },
  ];
  const menu = installContextMenu({ document, window, host,
    resolveContext(target, event) { resolutions.push({ target, event }); for (let node = target; node; node = node.parentNode) if (node.context) return node.context; return null; },
    buildItems: () => items, readBoundary() { if (failBoundary) throw Error('unavailable'); return boundary; },
    beforeOpen(context) { preparations.push(context); return allowOpen; }, status: message => reports.push(message),
    restoreFocus(origin, context) { restores.push({ origin, context }); fallback.focus(); },
  });
  const rightClick = (target = anchor, overrides = {}) => target.event('contextmenu', { clientX: 160, clientY: 90, button: 2, ...overrides });
  const key = (value, overrides = {}) => document.activeElement.event('keydown', { key: value, ...overrides });
  return { window, document, host, anchor, other, fallback, menu, boundary, calls, reports, resolutions, preparations, restores, rightClick, key,
    element: tag => new Element(tag), get items() { return items; }, set items(value) { items = value; },
    setAction(value) { action = value; }, denyOpen() { allowOpen = false; }, failBoundary() { failBoundary = true; } };
}

test('right-click opens one named menu, focuses first item, and renders only plain text', () => {
  const h = setup(); h.items[0].label = '<img src=x onerror=alert(1)> & <svg>';
  const before = { ...h.boundary }, event = h.rightClick();
  assert.equal(event.defaultPrevented, true); assert.equal(h.menu.active, true); assert.equal(h.host.hidden, false);
  assert.equal(h.host.getAttribute('role'), 'menu'); assert.equal(h.host.getAttribute('aria-label'), 'Контекстное меню');
  assert.equal(h.host.getAttribute('aria-orientation'), 'vertical'); assert.equal(h.document.activeElement, h.host.children[0]);
  assert.equal(h.host.children[0].textContent, h.items[0].label); assert.equal(h.host.children[0].children.length, 0);
  assert.equal(h.host.children[0].dataset.contextAction, 'rename'); assert.equal(h.host.children[0].type, 'button');
  for (const item of h.host.children) { assert.equal(item.getAttribute('role'), 'menuitem'); assert.equal(item.tabIndex, -1); }
  assert.deepEqual(h.boundary, before); assert.deepEqual(h.calls, []);
});

test('keyboard arrows wrap, Home/End work, and disabled items stay focusable but inert', () => {
  const h = setup(); h.rightClick(); const buttons = [...h.host.children];
  h.key('ArrowUp'); assert.equal(h.document.activeElement, buttons[2]);
  h.key('ArrowDown'); assert.equal(h.document.activeElement, buttons[0]);
  h.key('ArrowDown'); assert.equal(h.document.activeElement, buttons[1]);
  assert.equal(buttons[1].disabled, false); assert.equal(buttons[1].getAttribute('aria-disabled'), 'true');
  for (const key of ['Enter', ' ']) assert.equal(h.key(key).defaultPrevented, true);
  buttons[1].event('click'); assert.equal(h.menu.active, true); assert.equal(h.calls.length, 0);
  h.key('End'); assert.equal(h.document.activeElement, buttons[2]);
  h.key('Home'); assert.equal(h.document.activeElement, buttons[0]);
});

test('pointer hover follows one item and keyboard activation uses that item without invoking on hover', () => {
  const h=setup(); h.rightClick(); const buttons=[...h.host.children];
  buttons[2].event('pointermove',{pointerType:'mouse'});
  assert.equal(h.document.activeElement,buttons[2]); assert.deepEqual(h.calls,[]);
  buttons[1].event('pointermove',{pointerType:'mouse'}); h.key('Enter');
  assert.equal(h.document.activeElement,buttons[1]); assert.equal(h.menu.active,true); assert.deepEqual(h.calls,[]);
  buttons[2].event('pointermove',{pointerType:'touch'}); assert.equal(h.document.activeElement,buttons[1]);
  h.key('ArrowDown'); assert.equal(h.document.activeElement,buttons[2]); h.key('Enter');
  assert.equal(h.calls.length,1); assert.equal(h.menu.active,false); assert.equal(h.document.activeElement,h.anchor);
  buttons[2].event('pointermove',{pointerType:'mouse'}); assert.equal(h.document.activeElement,h.anchor);
});

test('Enter, Space and clicks close before invoking exactly once; retained controls cannot invoke again', () => {
  for (const method of ['Enter', ' ', 'click']) {
    const h = setup(); let ran = 0;
    h.setAction(context => {
      assert.equal(h.menu.active, false); assert.equal(h.host.hidden, true); assert.equal(h.host.children.length, 0);
      assert.equal(h.document.activeElement, h.anchor); assert.equal(context.id, 'occurrence-a'); ran++;
    });
    h.rightClick(); const button = h.host.children[0];
    if (method === 'click') button.event('click'); else h.key(method);
    button.event('click'); button.event('keydown', { key: method }); assert.equal(ran, 1);
  }
});

test('an action can open a new menu without old events acting on it', () => {
  const h = setup(); h.setAction(() => { h.calls.push('first'); h.rightClick(h.other); });
  h.rightClick(); const oldButton = h.host.children[0]; oldButton.event('click');
  assert.equal(h.menu.active, true); assert.equal(h.resolutions.at(-1).target, h.other);
  oldButton.event('click'); assert.deepEqual(h.calls, ['first']);
});

test('pointer focus on a different menuitem makes keyboard activation act on that item', () => {
  const h = setup(); h.items[2].action = context => h.calls.push(`delete:${context.id}`);
  h.rightClick(); h.host.children[2].focus(); h.key('Enter'); assert.deepEqual(h.calls, ['delete:occurrence-a']);
});

test('shortcuts open at the focused target rectangle and suppress redundant native contextmenu', () => {
  for (const [key, shiftKey] of [['ContextMenu', false], ['F10', true]]) {
    const h = setup(); const event = h.key(key, { shiftKey });
    assert.equal(event.defaultPrevented, true); assert.equal(h.host.style.left, '70px'); assert.equal(h.host.style.top, '70px');
    const first = h.host.children[0];
    h.anchor.event('contextmenu', { button: 0, clientX: 0, clientY: 0 });
    assert.equal(h.host.children[0], first); assert.equal(h.preparations.length, 1);
    h.key(key, { shiftKey, repeat: true }); assert.equal(h.host.children[0], first);
  }
});

test('zero-coordinate native keyboard menu falls back to target bounds, but pointer (0,0) is real', () => {
  const keyboard = setup(); keyboard.rightClick(keyboard.anchor, { clientX: 0, clientY: 0, button: 0 });
  assert.equal(keyboard.host.style.left, '70px'); assert.equal(keyboard.host.style.top, '70px');
  const pointer = setup(); pointer.rightClick(pointer.anchor, { clientX: 0, clientY: 0 });
  assert.equal(pointer.host.style.left, '8px'); assert.equal(pointer.host.style.top, '8px');
});

test('document-target keyboard events use the current focused element', () => {
  const h = setup(); h.document.event('keydown', { key: 'ContextMenu' });
  assert.equal(h.resolutions[0].target, h.anchor); assert.equal(h.menu.active, true);
});

test('Escape returns to origin and cancels without an action or leaked canvas shortcut', () => {
  const h = setup(); let leaked = 0; h.document.addEventListener('keydown', () => leaked++);
  h.rightClick(); for (const key of ['Delete', 'F2', 'z']) h.key(key);
  assert.equal(leaked, 0); assert.equal(h.calls.length, 0);
  const event = h.key('Escape'); assert.equal(event.defaultPrevented, true); assert.equal(h.menu.active, false);
  assert.equal(h.document.activeElement, h.anchor); assert.equal(leaked, 0);
  assert.equal(h.menu.close(true), false); assert.deepEqual(h.calls, []);
});

test('Tab and Shift+Tab close and allow normal traversal from the invoking context', () => {
  for (const shiftKey of [false, true]) {
    const h = setup(); h.rightClick(); const event = h.key('Tab', { shiftKey });
    assert.equal(event.defaultPrevented, false); assert.equal(h.menu.active, false); assert.equal(h.document.activeElement, h.anchor);
    h.other.focus(); assert.equal(h.document.activeElement, h.other); assert.deepEqual(h.calls, []);
  }
});

test('focus restoration resolves a removed or now-unfocusable origin through the app fallback', () => {
  for (const remove of [true, false]) {
    const h = setup(); h.rightClick(); if (remove) h.anchor.remove(); else h.anchor.disabled = true;
    h.key('Escape'); assert.equal(h.document.activeElement, h.fallback); assert.equal(h.restores.length, 1);
    assert.equal(h.restores[0].context.id, 'occurrence-a');
  }
});

test('nested SVG/text pointer targets restore focus to the focusable invoking object', () => {
  const h = setup(), svg = h.element('svg'), group = h.element('g'), text = h.element('text');
  group.setAttribute('tabindex', '0'); group.context = { kind: 'connection', id: 'connection-a' };
  h.document.body.append(svg); svg.append(group); group.append(text);
  h.rightClick(text); h.key('Escape'); assert.equal(h.document.activeElement, group);
});

test('stale revision, stale view and unreadable boundary never execute an action', () => {
  for (const change of [h => h.boundary.revision++, h => { h.boundary.viewId = 'view-b'; }, h => h.failBoundary()]) {
    const h = setup(); h.rightClick(); change(h); h.key('Enter');
    assert.equal(h.menu.active, false); assert.deepEqual(h.calls, []); assert.match(h.reports[0], /изменились/);
  }
});

test('opening boundary and ID context are copied, so later source mutations cannot retarget an action', () => {
  const h = setup(); h.rightClick(); h.anchor.context.id = 'different-id'; h.key('Enter');
  assert.equal(h.calls[0].id, 'occurrence-a'); assert.equal(Object.isFrozen(h.calls[0]), true);
  const stale = setup(); stale.rightClick(); stale.boundary.revision++; stale.host.children[0].event('click'); assert.deepEqual(stale.calls, []);
});

test('focus restoration that changes the model cannot authorize a stale command', () => {
  const h = setup(); h.rightClick(); h.anchor.addEventListener('focus', () => h.boundary.revision++);
  h.key('Enter'); assert.deepEqual(h.calls, []); assert.equal(h.menu.active, false); assert.match(h.reports[0], /изменились/);
});

test('item configuration is captured at opening, including disabled state and callback', () => {
  const h = setup(); h.rightClick(); h.items[0].action = () => h.calls.push('retargeted');
  h.items[1].disabled = false; h.key('ArrowDown'); h.key('Enter'); assert.deepEqual(h.calls, []);
  h.key('Home'); h.key('Enter'); assert.equal(h.calls[0].id, 'occurrence-a');
});

test('a replacement menu captures the new target; old detached buttons stay inert', () => {
  const h = setup(); h.rightClick(); const old = h.host.children[0]; h.rightClick(h.other);
  old.event('click'); assert.deepEqual(h.calls, []); h.key('Enter'); assert.equal(h.calls[0].id, 'element-b');
});

test('explicit invalidation closes once and announces only active invalidation', () => {
  const h = setup(); h.rightClick(); h.menu.invalidate('Закрыто после изменения');
  assert.equal(h.menu.active, false); assert.equal(h.restores.length, 0); assert.deepEqual(h.calls, []);
  h.menu.invalidate('Повтор'); assert.deepEqual(h.reports, ['Закрыто после изменения']);
  h.rightClick(); h.menu.invalidate(''); assert.equal(h.reports.length, 1);
});

test('outside dismissals preserve subsequent focus; viewport changes leave no active menu', () => {
  for (const dismiss of [
    h => h.other.event('pointerdown'), h => h.other.focus(), h => h.window.event('blur'), h => h.window.event('resize'),
    h => h.document.event('scroll'), h => h.window.event('scroll'), h => h.document.body.event('scroll'),
  ]) {
    const h = setup(); h.rightClick(); dismiss(h); h.other.focus();
    assert.equal(h.menu.active, false); assert.equal(h.document.activeElement, h.other); assert.deepEqual(h.calls, []); assert.equal(h.restores.length, 0);
  }
});

test('pointer, focus, right-click and scrolling inside menu preserve it', () => {
  const h = setup(); h.rightClick(); const button = h.host.children[1];
  button.event('pointerdown'); button.focus(); h.host.event('scroll'); button.event('scroll');
  const event = h.rightClick(button); assert.equal(event.defaultPrevented, true); assert.equal(h.menu.active, true); assert.equal(h.preparations.length, 1);
});

test('native text fields, editable ancestors, inline editors and dialogs keep their native context menus', () => {
  for (const kind of ['input', 'select', 'textarea', 'editable', 'inline', 'dialog', 'aria-dialog']) {
    const h = setup(), parent = h.element(['input', 'select', 'textarea', 'dialog'].includes(kind) ? kind : 'div');
    parent.context = { kind: 'element', id: 'native' }; parent.setAttribute('tabindex', '0');
    if (kind === 'editable') parent.setAttribute('contenteditable', '');
    if (kind === 'inline') parent.setAttribute('class', 'inline-editor');
    if (kind === 'aria-dialog') parent.setAttribute('role', 'dialog');
    h.document.body.append(parent);
    const child = h.element('span'); parent.append(child);
    const event = h.rightClick(child); assert.equal(event.defaultPrevented, false, kind); assert.equal(h.menu.active, false, kind);
    parent.focus(); const key = h.key('ContextMenu'); assert.equal(key.defaultPrevented, false, kind);
    assert.equal(h.resolutions.length, 0, kind);
  }
});

test('right-clicking a native input closes an existing custom menu without claiming the event', () => {
  const h = setup(), input = h.element('input'); h.document.body.append(input); h.rightClick();
  const event = h.rightClick(input); assert.equal(event.defaultPrevented, false); assert.equal(h.menu.active, false); assert.deepEqual(h.calls, []);
});

test('a visible native dialog blocks background menu shortcuts', () => {
  const h = setup(), dialog = h.element('dialog'); dialog.setAttribute('open', ''); h.document.body.append(dialog);
  assert.equal(h.rightClick().defaultPrevented, false); assert.equal(h.menu.active, false);
});

test('unsupported targets, empty item lists, veto and plain F10 never open or mutate', () => {
  const unsupported = setup(); assert.equal(unsupported.rightClick(unsupported.fallback).defaultPrevented, false);
  const empty = setup(); empty.items = []; assert.equal(empty.rightClick().defaultPrevented, false); assert.equal(empty.menu.active, false);
  const veto = setup(); veto.denyOpen(); assert.equal(veto.rightClick().defaultPrevented, false); assert.equal(veto.menu.active, false);
  const f10 = setup(); assert.equal(f10.key('F10').defaultPrevented, false); assert.equal(f10.menu.active, false);
  for (const h of [unsupported, empty, veto, f10]) assert.deepEqual(h.calls, []);
});

test('composing, modified and repeating shortcuts cannot open or activate menus', () => {
  for (const modifiers of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { repeat: true }]) {
    const h = setup(); h.key('ContextMenu', modifiers); assert.equal(h.menu.active, false);
  }
  const h = setup(); h.rightClick();
  h.key('Enter', { isComposing: true }); h.key('Escape', { keyCode: 229 }); h.key(' ', { repeat: true });
  assert.equal(h.menu.active, true); assert.deepEqual(h.calls, []);
});

test('position uses client coordinates rather than page offsets and clamps measured menu to viewport', () => {
  const h = setup(); h.rightClick(h.anchor, { clientX: 990, clientY: 790, pageX: 1310, pageY: 1540 });
  assert.equal(h.host.style.position, 'fixed'); assert.equal(h.host.style.left, '752px'); assert.equal(h.host.style.top, '652px');
  assert.equal(h.host.style.maxWidth, '984px'); assert.equal(h.host.style.maxHeight, '784px');
  h.rightClick(h.anchor, { clientX: -100, clientY: -200 }); assert.equal(h.host.style.left, '8px'); assert.equal(h.host.style.top, '8px');
});

test('small viewports constrain both dimensions and keyboard navigation scrolls only the menu', () => {
  const h = setup(); h.document.documentElement.clientWidth = 180; h.document.documentElement.clientHeight = 90;
  h.rightClick(); assert.equal(h.host.style.maxWidth, '164px'); assert.equal(h.host.style.maxHeight, '74px');
  assert.equal(h.host.style.minWidth, '0px'); assert.equal(h.host.style.overflow, 'auto'); assert.equal(h.host.style.overflowWrap, 'anywhere');
  assert.equal(h.host.style.left, '8px'); assert.equal(h.host.style.top, '8px');
  h.key('End'); assert.ok(h.host.scrollTop > 0); const scrolled = h.host.scrollTop;
  h.key('Home'); assert.ok(h.host.scrollTop < scrolled); assert.equal(h.window.scrollX, 320); assert.equal(h.window.scrollY, 750); assert.equal(h.menu.active, true);
});

test('visual viewport offsets and dimensions bound positioning and visual changes close the menu', () => {
  const h = setup({ visualViewport: { width: 300, height: 200, offsetLeft: 40, offsetTop: 100 } });
  h.rightClick(h.anchor, { clientX: 999, clientY: 999 }); assert.equal(h.host.style.left, '92px'); assert.equal(h.host.style.top, '152px');
  h.window.visualViewport.event('resize'); assert.equal(h.menu.active, false);
  h.rightClick(); h.window.visualViewport.event('scroll'); assert.equal(h.menu.active, false);
});

test('missing callbacks are disabled, and failing actions stay closed without retry', () => {
  const h = setup(); h.items[0].action = undefined; h.rightClick(); assert.equal(h.host.children[0].getAttribute('aria-disabled'), 'true');
  h.key('Enter'); assert.equal(h.menu.active, true); assert.deepEqual(h.calls, []);
  h.menu.close(); let attempts = 0; h.items[0].action = () => { attempts++; throw Error('command failed'); };
  h.rightClick(); const button = h.host.children[0]; h.key('Enter'); button.event('click');
  assert.equal(attempts, 1); assert.equal(h.menu.active, false); assert.match(h.reports[0], /command failed/);
});

test('destroy removes listeners, closes idempotently and prevents later programmatic opening', () => {
  const h = setup(); h.rightClick(); const old = h.host.children[0]; h.menu.destroy(); h.menu.destroy();
  assert.equal(h.menu.active, false); assert.equal(h.host.hidden, true); old.event('click'); assert.deepEqual(h.calls, []);
  assert.equal(h.rightClick().defaultPrevented, false); assert.equal(h.menu.open({ target: h.anchor }), false);
  for (const target of [h.document, h.window]) assert.equal([...target.listeners.values()].flat().length, 0);
});

test('action errors distinguish precommit failure from applied command or history change; a retired item never retries', () => {
  for (const applied of [false,true]) {
    const h=setup(); let attempts=0;
    h.items[0].action=()=>{attempts++;if(applied)h.boundary.revision++;throw Error('UI failed');};
    h.rightClick(); const retired=h.host.children[0]; h.key('Enter'); retired.event('click');
    assert.equal(attempts,1);assert.equal(h.menu.active,false);
    assert.match(h.reports.at(-1),applied?/Изменение применено, но интерфейс не обновлён/:/Не выполнено/);
  }
  const h=setup();h.items[0].action=()=>{h.failBoundary();throw Error('unknown outcome');};h.rightClick();h.key('Enter');
  assert.match(h.reports.at(-1),/Не удалось проверить результат/);
});

test('viewport dismissal and explicit invalidation rehome menu keyboard focus to visible origin or fallback', () => {
  for(const dismiss of [h=>h.window.event('resize'),h=>h.window.event('scroll'),h=>h.menu.invalidate(),h=>h.menu.close(true)]) {
    const h=setup();h.rightClick();dismiss(h);assert.equal(h.menu.active,false);assert.equal(h.document.activeElement,h.anchor);
    const hidden=setup();hidden.rightClick();hidden.anchor.getClientRects=()=>[];dismiss(hidden);
    assert.equal(hidden.menu.active,false);assert.equal(hidden.document.activeElement,hidden.fallback);
  }
});
