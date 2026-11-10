import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { patchMermaidSource } from '../mermaid-integration.mjs';

// Execute the checked-in pinned Mermaid source through the production patcher.
export const baselinePath = process.env.SCHEMKA_MERMAID_BASELINE
  ? `${process.env.SCHEMKA_MERMAID_BASELINE.replace(/\/$/, '')}/src/source-app.js`
  : fileURLToPath(new URL('../../src/source-app.js', import.meta.url));
export const baselineSource = fs.readFileSync(baselinePath, 'utf8');
export const patched = patchMermaidSource(baselineSource);

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

/** Minimal browser boundary, not an alternative editor implementation. All editor
 * state, guards, save/import handlers and startup wiring run from patched.source.
 * Geometry/SVG and Mermaid parser results are deterministic dependency stubs. */
export function createHarness(options = {}) {
  const listeners = new WeakMap(), elements = new Map(), timers = new Map();
  const blobs = [], downloads = [], revoked = [], renderCalls = [], propagation = [];
  let timerId = 0, urlId = 0, bootError = null, document, window;
  const faults = { blob: false, createURL: false, click: false, timerCleanup: false, onDownload: null };
  const pendingRender = deferred(), pendingClipboard = deferred();
  const addListener = (target, type, callback, settings) => {
    if (options.failListenerId && target.id === options.failListenerId) throw Error('fixture setup failure');
    const records = listeners.get(target) || [];
    records.push({ type, callback, capture: settings === true || Boolean(settings?.capture) });
    listeners.set(target, records);
  };
  function dispatch(target, type, properties = {}) {
    const event = { type, target, button: 0, pointerId: 1, isPrimary: true,
      clientX: 200, clientY: 200, key: '', defaultPrevented: false,
      stopped: false, immediate: false, results: [],
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; this.immediate = true; },
      ...properties };
    let path = target === window ? [window] : [window, document];
    if (target !== window && target !== document) {
      const chain = [];
      for (let node = target; node; node = node.parentNode) chain.unshift(node);
      path = chain[0] === document.body || chain[0] === document.documentElement
        ? [...path, ...chain] : chain;
    }
    function invoke(node, capture) {
      for (const record of listeners.get(node) || []) {
        if (record.type !== type || record.capture !== capture) continue;
        event.currentTarget = node;
        propagation.push(`${node.id || node.tagName || (node === window ? 'window' : 'document')}:${type}:${capture ? 'capture' : 'bubble'}`);
        event.results.push(record.callback.call(node, event));
        if (event.immediate) break;
      }
      if (!capture && !event.immediate && typeof node[`on${type}`] === 'function') {
        event.currentTarget = node;
        event.results.push(node[`on${type}`].call(node, event));
      }
    }
    for (const node of path) { invoke(node, true); if (event.stopped) return event; }
    for (const node of [...path].reverse()) { invoke(node, false); if (event.stopped) return event; }
    return event;
  }
  class Element {
    constructor(tagName = 'div', id = '') {
      this.tagName = tagName.toUpperCase(); this.id = id;
      this.dataset = {}; this.attributes = new Map(); this.children = [];
      this.value = ''; this.textContent = ''; this.hidden = false; this.open = false;
      this.disabled = false; this.checked = false; this.files = []; this.scrollTop = 0;
      this.selectionStart = 0; this.selectionEnd = 0; this.selectionDirection = 'none';
      this.clientWidth = 1000; this.clientHeight = 650;
      const values = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name),
        toggle(name, force = !values.has(name)) { force ? values.add(name) : values.delete(name); return force; },
      };
      this.style = { setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] || ''; } };
    }
    addEventListener(type, callback, settings) { addListener(this, type, callback, settings); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector === '*') return true;
      const match = selector.match(/^(\w+)?(?:\.([\w-]+))?(?:\[([^\]]+)\])?$/);
      const attributePresent = name => this.attributes.has(name) || (name.startsWith('data-') &&
        Object.hasOwn(this.dataset, name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())));
      return Boolean(match && (!match[1] || this.tagName === match[1].toUpperCase()) &&
        (!match[2] || this.classList.contains(match[2])) && (!match[3] || attributePresent(match[3])));
    }
    closest(selectors) {
      for (let node = this; node; node = node.parentNode) {
        if (selectors.split(',').some(selector => node.matches(selector.trim()))) return node;
      }
      return null;
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelectorAll(selectors) {
      const result = [];
      for (const child of this.children) {
        if (selectors.split(',').some(selector => child.matches(selector.trim()))) result.push(child);
        result.push(...child.querySelectorAll(selectors));
      }
      return result;
    }
    querySelector(selectors) { return this.querySelectorAll(selectors)[0] || null; }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 650, right: 1000, bottom: 650 }; }
    getBBox() { return { x: 0, y: 0, width: 100, height: 50 }; }
    setPointerCapture() {}
    focus() { document.activeElement = this; }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
    setSelectionRange(start, end, direction = 'none') { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    click() {
      if (this.disabled) return;
      const event = dispatch(this, 'click');
      if (!event.defaultPrevented && this.tagName === 'A' && this.download) {
        if (faults.click) throw Error('fixture click failure');
        faults.onDownload?.(this);
        downloads.push({ name: this.download, href: this.href, blob: blobs.at(-1) });
      }
      return event;
    }
  }
  document = {
    documentElement: new Element('html'), body: new Element('body'), activeElement: null,
    getElementById(id) {
      if (id === options.failGetId) throw Error('fixture early setup failure');
      if (!elements.has(id)) {
        const tagName = id === 'source' ? 'textarea' : ['nodeLabel', 'objectCaption'].includes(id) ? 'input' : id === 'targetGroup' ? 'select' : ['more', 'editObject', 'moveToGroup', 'deleteObject', 'saveJSON', 'openJSON', 'showLicenses', 'showHelp'].includes(id) ? 'button' : 'div';
        const node = new Element(tagName, id);
        if (id === 'source' && options.failStartupSource) Object.defineProperty(node, 'value', { get: () => '', set() { throw Error('fixture startup source failure'); } });
        if (id === 'sourcePanel' && options.failStartupVisibility) Object.defineProperty(node, 'inert', { set() { throw Error('fixture startup visibility failure'); } });
        if (id === 'world' && options.failStartupView) Object.defineProperty(node.style, 'transform', { set() { throw Error('fixture startup view failure'); } });
        elements.set(id, node); this.body.append(node);
      }
      return elements.get(id);
    },
    createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag),
    importNode: node => node, execCommand: () => false,
    addEventListener(type, callback, settings) { addListener(this, type, callback, settings); },
  };
  window = { innerWidth: 1400,
    addEventListener(type, callback, settings) { addListener(this, type, callback, settings); },
    removeEventListener(type, callback) { listeners.set(this, (listeners.get(this) || []).filter(record => record.type !== type || record.callback !== callback)); },
    matchMedia: () => ({ matches: false, addEventListener() {} }), getComputedStyle: () => ({ fill: '#fff' }),
  };
  const get = id => document.getElementById(id);
  get('fileMenu').hidden = true;
  get('sourcePanel').append(get('source'));
  const modeLink = new Element('a', 'mode-link');
  modeLink.setAttribute('href', '/model/'); modeLink.setAttribute('data-mode-link', '');
  const moreWrap = new Element('div'); moreWrap.classList.add('more-wrap');
  document.body.append(moreWrap); moreWrap.append(get('more'), get('fileMenu'));
  get('fileMenu').append(modeLink, ...['saveJSON', 'openJSON', 'showLicenses', 'showHelp'].map(get));
  get('canvas').append(get('world'), get('nodeToolbar'), get('objectPanel'), get('movePanel'));
  get('nodeToolbar').classList.add('node-toolbar');
  get('nodeToolbar').append(...['editObject', 'moveToGroup', 'deleteObject', 'nodeToolbarLabel'].map(get));
  get('objectPanel').classList.add('context-panel');
  get('objectPanel').append(...['objectCaption', 'closeObject', 'applyObjectCaption'].map(get));
  get('movePanel').classList.add('context-panel');
  get('movePanel').append(...['targetGroup', 'closeMove', 'applyGroupMove'].map(get));
  const diagram = { type: 'flowchart-v2', db: {
    getVertices: () => new Map(options.renderedNode ? [['client', { text: 'Клиент' }]] : []),
    getEdges: () => [], getSubGraphs: () => [], lookUpDomId: () => 'flowchart-client-0',
    getClasses: () => new Map(), setDiagramId() {},
  } };
  let initializeCount = 0;
  window.mermaid = {
    initialize() { initializeCount += 1; if (options.failConfigure) throw Error('fixture configure failure'); },
    mermaidAPI: { reset() {}, getConfig: () => ({}),
      getDiagramFromText(text) {
        renderCalls.push(text);
        return options.pendingRender && renderCalls.length === 1 ? pendingRender.promise : Promise.resolve(diagram);
      },
    },
    render: async () => ({ svg: '<svg viewBox="0 0 900 600"></svg>' }),
  };
  const context = vm.createContext({
    window, document, console, TextEncoder, TextDecoder,
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { clipboard: { writeText: () => options.pendingClipboard ? pendingClipboard.promise : Promise.resolve() } },
    setTimeout(callback, delay) { if (faults.timerCleanup && delay === 2000) throw Error('fixture cleanup timer failure'); const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Blob: class {
      constructor(parts, settings) {
        if (faults.blob) throw Error('fixture Blob failure');
        this.text = parts.map(String).join(''); this.type = settings.type; blobs.push(this);
      }
    },
    URL: { createObjectURL() { if (faults.createURL) throw Error('fixture object URL failure'); return `blob:fixture-${++urlId}`; }, revokeObjectURL: url => revoked.push(url) },
    DOMParser: class { parseFromString() {
      const svg = new Element('svg'); svg.setAttribute('viewBox', '0 0 900 600');
      if (options.renderedNode) { const node = new Element('g', 'flowchart-client-0'); node.classList.add('node'); svg.append(node); }
      return { documentElement: svg, querySelector: () => null };
    } },
    SkMermaidPreflight: { matchFrontMatter: () => null },
    SkObjectSemantics: { capture: () => ({ groups: options.renderedNode ? [['apps', { title: 'Приложения' }], ['data', { title: 'Данные' }]] : [], edges: [], parents: options.renderedNode ? { client: 'apps' } : {} }) },
    SkObjectEdit: { caption: () => ({ ok: true, caption: 'Клиент' }) },
    SkGroupSemantics: { groupOptions: semantics => semantics.groups.map(([id, group]) => ({ id, path: group.title })) },
  });
  try { vm.runInContext(patched.source, context, { filename: 'patched-pinned-mermaid.js' }); }
  catch (error) { bootError = error; }
  const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };
  const click = id => { const node = typeof id === 'string' ? get(id) : id; dispatch(node, 'pointerdown'); return node.click(); };
  return {
    document, window, get, modeLink, dispatch, click, flush, bootError,
    blobs, downloads, revoked, renderCalls, propagation, faults, timers,
    get initializeCount() { return initializeCount; },
    async finishRender() { pendingRender.resolve(diagram); await flush(); },
    async rejectRender() { pendingRender.reject(Error('fixture render rejected')); await flush(); },
    async finishClipboard() { pendingClipboard.resolve(); await flush(); },
    beforeUnload: () => dispatch(window, 'beforeunload'),
    edit(text) {
      const source = get('source'); dispatch(source, 'beforeinput', { inputType: 'insertText' });
      source.value = text; dispatch(source, 'input', { inputType: 'insertText' });
    },
    // Inspect only through the real save handler. A failed click deliberately
    // prevents accepting the download or changing the editor's saved baseline.
    snapshot() {
      const previous = faults.click; faults.click = true;
      try { get('saveJSON').onclick(); return JSON.parse(blobs.at(-1).text); }
      finally { faults.click = previous; }
    },
    async importJSON(project) {
      const input = get('importJSON');
      const bytes = new TextEncoder().encode(JSON.stringify(project));
      input.files = [{ name: 'incoming.json', size: bytes.length, arrayBuffer: async () => bytes.buffer }];
      await Promise.all(dispatch(input, 'change').results); await flush();
    },
    startRead() {
      const pending = deferred(), input = get('importMmd');
      input.files = [{ name: 'incoming.mmd', size: 24, arrayBuffer: () => pending.promise }];
      const event = dispatch(input, 'change');
      return { async finish(text = 'flowchart LR\n X --> Y\n') { pending.resolve(new TextEncoder().encode(text).buffer); await Promise.all(event.results); await flush(); } };
    },
  };
}
