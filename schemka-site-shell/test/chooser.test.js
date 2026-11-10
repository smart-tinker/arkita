import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODE_PATHS, installChooser } from '../src/chooser.js';
import { THEME_KEY, THEME_KEYS, isTheme, normalizeTheme, resolveTheme, readThemePreference, createTheme, installTheme } from '../src/theme.js';

const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const invalidThemes = [null, undefined, '', 'other', 'Dark', 'SYSTEM', '0', '{}', false, 1, {}, ['dark']];

class Element extends EventTarget {
  constructor(attributes = {}) {
    super();
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.dataset = {};
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
}

function harness({ href = 'https://schemka.example/', stored = {}, dark = false, readFailure = false, writeFailure = false, blockedStorageGetter = false, legacyMedia = false } = {}) {
  const elements = new Map([
    ['theme-mode', new Element()],
    ['mermaid-mode-link', new Element({ href: '/mermaid/' })],
    ['model-mode-link', new Element({ href: '/model/' })],
    ['download-mermaid-link', new Element({ href: '/schemka.html', download: 'schemka.html' })],
  ]);
  const document = {
    documentElement: new Element(),
    getElementById(id) { return elements.get(id) ?? null; },
  };
  const reads = [], writes = [], state = new Map(Object.entries(stored));
  const storage = {
    getItem(key) {
      reads.push(key);
      if (readFailure) throw new Error('Storage denied');
      return state.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      if (writeFailure) throw new Error('Quota exceeded');
      state.set(key, value);
    },
  };
  const listeners = new Set();
  const media = {
    matches: dark,
    emit(value) { this.matches = value; for (const listener of listeners) listener({ matches: value }); },
  };
  if (legacyMedia) {
    media.addListener = listener => listeners.add(listener);
    media.removeListener = listener => listeners.delete(listener);
  } else {
    media.addEventListener = (name, listener) => { assert.equal(name, 'change'); listeners.add(listener); };
    media.removeEventListener = (name, listener) => { assert.equal(name, 'change'); listeners.delete(listener); };
  }
  const window = {
    location: Object.freeze({ href }),
    matchMedia(query) { assert.equal(query, '(prefers-color-scheme: dark)'); return media; },
    get localStorage() { if (blockedStorageGetter) throw new Error('Storage access denied'); return storage; },
    get sessionStorage() { throw new Error('Session data must not be accessed'); },
    fetch() { throw new Error('No network is allowed'); },
  };
  const choose = value => {
    const control = elements.get('theme-mode');
    control.value = value;
    control.dispatchEvent(new Event('change'));
  };
  return { document, window, elements, media, reads, writes, state, listeners, choose };
}

test('modules import without a browser, and theme values are strictly validated', () => {
  assert.equal(THEME_KEY, 'schemka-shell-theme');
  assert.deepEqual(THEME_KEYS, ['schemka-shell-theme', 'schemka-model-theme', 'skhemka-theme']);
  for (const value of invalidThemes) {
    assert.equal(isTheme(value), false);
    assert.equal(normalizeTheme(value), 'system');
    assert.equal(resolveTheme(value, true), 'dark');
  }
  for (const value of ['system', 'light', 'dark']) {
    assert.equal(isTheme(value), true);
    assert.equal(normalizeTheme(value), value);
  }
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('first valid stored preference wins, including an explicit system choice', () => {
  for (const own of ['system', 'light', 'dark']) {
    const reads = [];
    const values = { [THEME_KEY]: own, 'schemka-model-theme': 'dark', 'skhemka-theme': 'light' };
    assert.equal(readThemePreference(key => { reads.push(key); return values[key]; }), own);
    assert.deepEqual(reads, [THEME_KEY]);
  }
  for (const invalid of invalidThemes) {
    const values = { [THEME_KEY]: invalid, 'schemka-model-theme': 'light', 'skhemka-theme': 'dark' };
    assert.equal(readThemePreference(key => values[key]), 'light');
    values['schemka-model-theme'] = invalid;
    assert.equal(readThemePreference(key => values[key]), 'dark');
    values['skhemka-theme'] = invalid;
    assert.equal(readThemePreference(key => values[key]), 'system');
  }
  assert.equal(readThemePreference(key => { if (key === THEME_KEY) throw new Error('blocked'); return 'dark'; }), 'dark');
  assert.equal(readThemePreference(() => { throw new Error('blocked'); }), 'system');
});

test('createTheme has no initialization write and only persists its own normalized preference', () => {
  const saved = [], applied = [];
  let dark = false;
  const theme = createTheme({
    read: key => key === 'schemka-model-theme' ? 'system' : null,
    write: (key, value) => saved.push([key, value]),
    dark: () => dark,
    apply: (...value) => applied.push(value),
  });
  assert.equal(theme.preference, 'system');
  assert.deepEqual(saved, []);
  assert.deepEqual(applied.at(-1), ['light', 'system']);
  dark = true;
  theme.systemChanged();
  assert.deepEqual(applied.at(-1), ['dark', 'system']);
  theme.choose('light');
  const before = applied.length;
  dark = false;
  theme.systemChanged();
  assert.equal(applied.length, before);
  theme.choose('dark');
  theme.choose('system');
  theme.choose('<script>bad</script>');
  assert.deepEqual(saved, ['light', 'dark', 'system', 'system'].map(value => [THEME_KEY, value]));
  assert.deepEqual(applied.at(-1), ['light', 'system']);
});

test('DOM theme installer reflects media updates, select choices, inherited preference, and teardown', () => {
  const setup = harness({ stored: { 'schemka-model-theme': 'system', 'skhemka-theme': 'dark' } });
  const theme = installTheme(setup.document, setup.window);
  assert.equal(setup.elements.get('theme-mode').value, 'system');
  assert.equal(setup.document.documentElement.dataset.theme, 'light');
  assert.deepEqual(setup.writes, []);
  setup.media.emit(true);
  assert.equal(setup.document.documentElement.dataset.theme, 'dark');
  setup.choose('light');
  setup.media.emit(false);
  setup.media.emit(true);
  assert.equal(theme.preference, 'light');
  assert.equal(setup.document.documentElement.dataset.theme, 'light');
  setup.choose('dark');
  assert.equal(setup.document.documentElement.dataset.theme, 'dark');
  setup.media.emit(false);
  assert.equal(setup.document.documentElement.dataset.theme, 'dark');
  setup.choose('system');
  assert.equal(setup.document.documentElement.dataset.theme, 'light');
  assert.deepEqual(setup.writes, ['light', 'dark', 'system'].map(value => [THEME_KEY, value]));
  assert.equal(setup.state.get('schemka-model-theme'), 'system');
  assert.equal(setup.state.get('skhemka-theme'), 'dark');
  assert.equal(setup.listeners.size, 1);
  theme.destroy();
  assert.equal(setup.listeners.size, 0);
  setup.media.emit(true);
  setup.choose('dark');
  assert.equal(setup.document.documentElement.dataset.theme, 'light');
  assert.equal(setup.writes.length, 3);
});

test('DOM theme handles legacy media events and missing media support without writes', () => {
  const setup = harness({ legacyMedia: true });
  const theme = installTheme(setup.document, setup.window);
  setup.media.emit(true);
  assert.equal(setup.document.documentElement.dataset.theme, 'dark');
  theme.destroy();
  assert.equal(setup.listeners.size, 0);
  delete setup.window.matchMedia;
  assert.doesNotThrow(() => installTheme(setup.document, setup.window));
  assert.equal(setup.document.documentElement.dataset.theme, 'light');
  assert.deepEqual(setup.writes, []);
});

test('blocked, invalid, and quota-failed storage cannot block a tab-local theme choice', () => {
  for (const options of [
    { readFailure: true, writeFailure: true },
    { blockedStorageGetter: true },
    { stored: { [THEME_KEY]: 'invalid', 'schemka-model-theme': '{}', 'skhemka-theme': '0' }, writeFailure: true },
  ]) {
    const setup = harness({ ...options, dark: true });
    let theme;
    assert.doesNotThrow(() => { theme = installChooser(setup.document, setup.window); });
    assert.equal(theme.preference, 'system');
    assert.equal(setup.document.documentElement.dataset.theme, 'dark');
    assert.doesNotThrow(() => setup.choose('light'));
    assert.equal(theme.preference, 'light');
    assert.equal(setup.document.documentElement.dataset.theme, 'light');
    assert.equal(setup.elements.get('mermaid-mode-link').getAttribute('href'), '/mermaid/');
    assert.equal(setup.elements.get('model-mode-link').getAttribute('href'), '/model/');
  }
});

function tagWithId(id) {
  const tag = html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
  assert.ok(tag, `Missing ${id}`);
  return tag[0];
}

test('HTML has native same-tab fixed mode links without retired import controls', () => {
  assert.deepEqual(MODE_PATHS, { mermaid: '/mermaid/', model: '/model/' });
  for (const [id, path] of [['mermaid-mode-link', '/mermaid/'], ['model-mode-link', '/model/']]) {
    const tag = tagWithId(id);
    assert.ok(tag.startsWith('<a '));
    assert.ok(tag.includes(`href="${path}"`));
    assert.doesNotMatch(tag, /\b(?:target|onclick|role|download)=/);
  }
  assert.match(tagWithId('download-mermaid-link'), /href="\/schemka\.html"/);
  assert.match(tagWithId('download-mermaid-link'), /download="schemka\.html"/);
});

test('HTML documents format/session limits and accessible theme choices without claiming conformance', () => {
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<h1>Одна платформа. Три рабочих режима.<\/h1>/);
  assert.match(html, /<label[^>]+for="theme-mode">Тема/);
  for (const theme of ['system', 'light', 'dark']) assert.match(html, new RegExp(`<option value="${theme}">`));
  for (const text of ['.mmd · Mermaid JSON', '.schemka.json', '42 элемента · 11 отношений + 4 варианта', 'Каталог доступен сразу. Проверка нормативных правил пока неполная.', 'Нормативная оценка:', 'UNKNOWN', 'Форматы и сессии режимов независимы.', 'Автосохранения нет', 'Автоматического переноса между режимами нет.', 'несохранённую работу', 'На этой странице запоминается только тема']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /полное соответствие|двусторонн|round.trip|новой вкладке/i);
});

test('shell stays self-contained under strict self-script/style CSP and no network data connections', async () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "img-src 'none'", "font-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(policy.includes(directive), directive);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.match(html, /<link rel="stylesheet" href="\/shell\/style\.css">/);
  assert.match(html, /<script type="module" src="\/shell\/chooser\.js"><\/script>/);
  assert.doesNotMatch(html, /<style\b|\sstyle=|\son\w+=|<img\b|<iframe\b|https?:\/\//);
  assert.doesNotMatch(css, /@import|url\s*\(|@font-face/i);
  for (const sourceName of ['chooser.js', 'theme.js']) {
    const source = await readFile(new URL(`../src/${sourceName}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|fetch\s*\(|XMLHttpRequest|JSON\.parse|URLSearchParams|decodeURIComponent|indexedDB|sessionStorage|location\s*=(?!=)|location\.(?:assign|replace)\s*\(/);
  }
});

test('responsive and focus styles are present, without hiding overflowing page content', () => {
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /a:focus-visible,select:focus-visible/);
  assert.match(css, /outline:3px solid var\(--focus\)/);
  assert.match(css, /\[hidden\] \{ display:none !important; \}/);
  assert.match(css, /:root:not\(\[data-theme\]\)/);
  assert.doesNotMatch(css, /overflow\s*:\s*hidden|(?<![-\w])height\s*:\s*100(?:vh|dvh);/);
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('authored text color pairs meet 4.5:1 in both themes (not rendered accessibility QA)', () => {
  const blocks = [css.match(/:root \{([\s\S]*?)\}/)[1], css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\}/)[1]];
  for (const block of blocks) {
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):(#[a-f\d]{6});/g)].map(match => [match[1], match[2]]));
    for (const [foreground, background] of [['ink', 'surface'], ['muted', 'surface'], ['muted', 'subtle'], ['ink', 'canvas'], ['muted', 'canvas'], ['ink', 'blue-soft'], ['blue', 'canvas'], ['blue', 'blue-soft'], ['on-primary', 'primary'], ['on-primary', 'primary-hover'], ['warning-ink', 'warning-surface']]) {
      const one = luminance(tokens[foreground]), two = luminance(tokens[background]);
      const ratio = (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
      assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}`);
    }
  }
});

test('chooser preference never overwrites either editor preference',()=>{
  const h=harness({stored:{'schemka-model-theme':'light','skhemka-theme':'dark'}});
  installChooser(h.document,h.window);h.choose('dark');
  assert.equal(h.state.get('schemka-model-theme'),'light');assert.equal(h.state.get('skhemka-theme'),'dark');
  assert.deepEqual(h.writes,[['schemka-shell-theme','dark']]);
});
