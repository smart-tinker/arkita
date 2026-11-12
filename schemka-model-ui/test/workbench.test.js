import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installWorkbench } from '../src/workbench.js';
import { createLocalPreferences } from '../src/preferences.js';

test('native-like menu/keyboard save share the draft guard, including stopped inline key events', () => {
  const dom = new JSDOM('<button data-command="save">Save</button><button id="file-button" hidden>File</button><div class="inline-editor"><input></div>');
  const { document } = dom.window;
  let active = false, saves = 0, fileOpens = 0;
  const messages = [];
  document.getElementById('file-button').addEventListener('click', () => fileOpens++);
  const editor = document.querySelector('.inline-editor');
  editor.addEventListener('keydown', event => event.stopPropagation());
  installWorkbench({ document, window: dom.window, files: { save() { saves++; } }, blocked: () => active, status: message => messages.push(message) });
  document.querySelector('[data-command=save]').click(); assert.equal(saves, 1);
  active = true;
  const input = document.querySelector('input'); input.value = 'unsaved name';
  const key = new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(key); assert.equal(key.defaultPrevented, true); assert.equal(saves, 1);
  document.querySelector('[data-command=save]').click();
  assert.equal(saves, 1); assert.equal(fileOpens, 0); assert.equal(input.value, 'unsaved name');
  assert.match(messages.at(-1), /Завершите или отмените/);
  document.getElementById('file-button').click(); assert.equal(fileOpens, 1, 'Internal file transitions retain their own cancellation contract');
  active = false; document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(saves, 2); dom.window.close();
});

test('physical Ctrl/Meta shortcuts work in Russian layout without consuming IME, Alt or unmodified typing', t => {
  const dom = new JSDOM('<button id="file-button"></button><button id="desktop-open-project"></button><button id="save-project"></button><button id="new-project"></button>');
  t.after(() => dom.window.close());
  const { document } = dom.window, calls = []; dom.window.schemkaDesktop = {};
  for (const id of ['file-button', 'desktop-open-project', 'save-project', 'new-project']) document.getElementById(id).addEventListener('click', () => calls.push(id));
  installWorkbench({ document, window: dom.window, files: { save() { calls.push('save'); } }, blocked: () => false, status() {} });
  const cases = [
    [{ key: 'ы', code: 'KeyS' }, ['save']],
    [{ key: 'Ы', code: 'KeyS', shiftKey: true }, ['file-button', 'save-project']],
    [{ key: 'щ', code: 'KeyO' }, ['file-button', 'desktop-open-project']],
    [{ key: 'т', code: 'KeyN' }, ['file-button', 'new-project']],
  ];
  for (const modifier of ['ctrlKey', 'metaKey']) for (const [keys, expected] of cases) {
    const event = new dom.window.KeyboardEvent('keydown', { ...keys, [modifier]: true, bubbles: true, cancelable: true });
    calls.length = 0; document.body.dispatchEvent(event); assert.equal(event.defaultPrevented, true); assert.deepEqual(calls, expected);
    for (const ignored of [{ altKey: true }, { isComposing: true }, { keyCode: 229 }, { [modifier]: false }]) {
      const ignoredEvent = new dom.window.KeyboardEvent('keydown', { ...keys, [modifier]: true, ...ignored, bubbles: true, cancelable: true });
      calls.length = 0; document.body.dispatchEvent(ignoredEvent); assert.equal(ignoredEvent.defaultPrevented, false); assert.deepEqual(calls, []);
    }
  }
  for (const [keys, expected] of cases) {
    calls.length = 0;
    document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: keys.code.slice(3), shiftKey: keys.shiftKey, ctrlKey: true, bubbles: true }));
    assert.deepEqual(calls, expected, 'Latin key-only events remain supported');
  }
});

test('plain custom command keys keep text entry native while canvas bindings and Ctrl/F1 shortcuts work', t => {
  const dom = new JSDOM('<button id="file-button"></button><button id="desktop-open-project"></button><button id="save-project"></button><button id="new-project"></button><svg id="canvas"></svg><input><textarea></textarea><select><option>A</option></select><div contenteditable="true"><span>draft</span></div><div contenteditable="plaintext-only">draft</div>', { url: 'https://arkita.invalid' });
  t.after(() => dom.window.close());
  const { document } = dom.window, preferences = createLocalPreferences(dom.window.localStorage), calls = [];
  dom.window.schemkaDesktop = {};
  for (const id of ['file-button', 'desktop-open-project', 'save-project', 'new-project']) document.getElementById(id).addEventListener('click', () => calls.push(id));
  installWorkbench({ document, window: dom.window, preferences, files: { save: () => calls.push('save') }, blocked: () => false, status() {}, onHelp: () => calls.push('help') });
  const key = (target, extra = {}) => {
    const event = new dom.window.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event); return event;
  };
  for (const [command, expected] of [['save', ['save']], ['save-as', ['file-button', 'save-project']], ['open', ['file-button', 'desktop-open-project']], ['new', ['file-button', 'new-project']], ['help-button', ['help']]]) {
    preferences.reset(); const keys = preferences.get('keys'); keys[command] = 'KeyA'; preferences.update('keys', keys);
    for (const target of document.querySelectorAll('input,textarea,select,[contenteditable] span,[contenteditable="plaintext-only"]')) {
      calls.length = 0;
      assert.equal(key(target).defaultPrevented, false, `${command} must not consume text entry`);
      assert.deepEqual(calls, []);
    }
    calls.length = 0;
    assert.equal(key(document.getElementById('canvas')).defaultPrevented, true);
    assert.deepEqual(calls, expected);
  }
  preferences.reset();
  for (const [keys, expected] of [[{ key: 's', code: 'KeyS', ctrlKey: true }, ['save']], [{ key: 'o', code: 'KeyO', ctrlKey: true }, ['file-button', 'desktop-open-project']], [{ key: 'F1', code: 'F1' }, ['help']]]) {
    calls.length = 0; assert.equal(key(document.querySelector('input'), keys).defaultPrevented, true); assert.deepEqual(calls, expected);
  }
});
