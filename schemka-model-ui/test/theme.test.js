import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THEME_KEY, normalizeTheme, resolveTheme, createTheme, installTheme } from '../src/theme.js';

test('theme validates choices and follows system only while System is selected', () => {
  assert.equal(THEME_KEY, 'schemka-model-theme');
  for (const bad of [null, undefined, '', 'other', '{}']) assert.equal(normalizeTheme(bad), 'system');
  assert.equal(resolveTheme('system', true), 'dark'); assert.equal(resolveTheme('light', true), 'light');
  let dark = false; const applied = [], saved = [];
  const theme = createTheme({ read: () => 'system', write: value => saved.push(value), dark: () => dark, apply: (...value) => applied.push(value) });
  assert.deepEqual(applied.at(-1), ['light', 'system']);
  dark = true; theme.systemChanged(); assert.deepEqual(applied.at(-1), ['dark', 'system']);
  theme.choose('light'); const count = applied.length; dark = false; theme.systemChanged(); assert.equal(applied.length, count);
  theme.choose('dark'); assert.deepEqual(applied.at(-1), ['dark', 'dark']);
  theme.choose('system'); assert.deepEqual(applied.at(-1), ['light', 'system']);
  assert.deepEqual(saved, ['light', 'dark', 'system']);
});
test('stored explicit choice survives initialization; invalid/blocked/quota storage fails safely', () => {
  let resolved;
  const build = (read, write = () => {}) => createTheme({ read, write, dark: () => true, apply: value => { resolved = value; } });
  assert.equal(build(() => 'light').preference, 'light'); assert.equal(resolved, 'light');
  assert.equal(build(() => 'invalid').preference, 'system'); assert.equal(resolved, 'dark');
  const blocked = build(() => { throw new Error('blocked'); }, () => { throw new Error('quota'); });
  assert.equal(resolved, 'dark'); assert.doesNotThrow(() => blocked.choose('light')); assert.equal(resolved, 'light');
});
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
test('authored normal-text token pairs meet 4.5:1 in both themes (not a full accessibility audit)', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const blocks = [css.match(/:root \{([\s\S]*?)\}/)[1], css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\}/)[1]];
  for (const block of blocks) {
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):(#[a-f\d]{6});/g)].map(match => [match[1], match[2]]));
    for (const [foreground, background] of [['ink','surface'],['muted','surface'],['ink','canvas'],['muted','canvas'],['tree-ink','navy'],['tree-muted','navy'],['tree-muted','tree-hover'],['tree-selected-ink','tree-selected'],['link','canvas'],['on-primary','primary'],['warning-ink','warning-surface'],['warning-muted','warning-surface'],['danger','danger-surface']]) {
      const one = luminance(tokens[foreground]), two = luminance(tokens[background]);
      const ratio = (Math.max(one,two)+.05)/(Math.min(one,two)+.05);
      assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}`);
    }
  }
});

test('initial, manual and system themes refresh drawing colors after CSS switches without writing system preferences', () => {
  let dark = false, changed; const control = { value: '', addEventListener() {} }, root = { dataset: {} }, applied = [], writes = [];
  const document = { documentElement: root, getElementById: () => control }, window = { matchMedia: () => ({ get matches() { return dark; }, addEventListener: (_name, callback) => { changed = callback; } }), localStorage: { getItem: () => 'system', setItem(_key, value) { writes.push(value); } } };
  const theme = installTheme(document, window, null, () => applied.push(root.dataset.theme));
  assert.deepEqual(applied, ['light']); dark = true; changed(); assert.deepEqual(applied, ['light', 'dark']); assert.deepEqual(writes, []);
  theme.choose('light'); changed(); assert.deepEqual(applied, ['light', 'dark', 'light']); assert.equal(root.dataset.theme, 'light'); assert.deepEqual(writes, ['light']);
});
