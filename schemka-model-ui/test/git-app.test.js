import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
import { deserializeProjectFile } from '../../schemka-model-io/src/index.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const mode = production ? 'production' : 'source';
const openGit = h => h.document.querySelector('[data-command="git-button"]').click();
const rename = (h, value) => {
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = value;
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};
const state = { status: 'ok', available: true, target: { remote: '/local.git', branch: 'main', directory: 'arkita' }, hasModel: true, attached: true,
  head: '12345678', ahead: 0, behind: 0, history: [], changes: [{ path: 'schemka.json', label: 'Model', kind: 'modified' }] };

test(`${mode} Git opens one modal through guarded menu, preserves inline draft and returns focus on close`, async t => {
  const h = await setup(t);
  h.$('project-name').click(); const input = h.document.querySelector('.inline-editor input'); input.value = 'Uncommitted'; openGit(h);
  assert.equal(h.$('git-dialog').open, false); assert.equal(input.isConnected, true);
  input.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  openGit(h); assert.equal(h.$('git-dialog').open, true); assert.match(h.$('git-state').textContent, /Windows/);
  assert.deepEqual([...h.document.querySelectorAll('dialog[open]')].map(dialog => dialog.id), ['git-dialog']);
  h.$('git-close').click(); assert.equal(h.document.activeElement.textContent, 'Дополнительно');
});

test(`${mode} closing busy Git dialog retains editor mutation and close guards until native write completes`, async t => {
  let finish, saved;
  const h = await setup(t, { gitStatus: async () => state,
    gitCommit: (bytes, token, message) => { saved = { bytes, token, message }; return new Promise(resolve => { finish = resolve; }); } });
  rename(h, 'Unsaved Git test'); const history = h.$('history-state').textContent;
  openGit(h); await tick(); h.$('git-message').value = 'Local version'; h.$('git-message').dispatchEvent(new h.window.Event('input'));
  h.$('git-commit-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(deserializeProjectFile(saved.bytes).project.name, 'Unsaved Git test');
  h.$('git-close').click(); h.$('undo').click(); h.$('project-name').click();
  h.document.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.document.querySelector('.inline-editor'), null);
  const event = new h.window.Event('beforeunload', { cancelable: true }); h.window.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  finish({ status: 'ok' }); await tick();
  assert.equal(h.$('file-state').dataset.dirty, 'true'); assert.equal(h.$('project-name').textContent, 'Unsaved Git test');
  h.$('undo').click(); assert.notEqual(h.$('project-name').textContent, 'Unsaved Git test');
});

test(`${mode} receiving the current Git model preserves the visible Redo action and local file state`, async t => {
  let bytes, token, saved; const adopted = [];
  const h = await setup(t, {
    saveProject: async current => { saved = Buffer.from(current); return { status: 'saved' }; },
    gitStatus: async () => ({ ...state, changes: [] }),
    gitReceive: async (current, documentToken) => { bytes = current; token = documentToken; return { status: 'ready', plan: 'unchanged', conflicts: [] }; },
    gitApply: async () => ({ status: 'ready', bytes, candidate: 'advanced-history' }),
    gitAdopt: async (...args) => { adopted.push(args); return { status: 'ok' }; },
  });
  h.$('file-button').click(); h.$('save-project').click(); await tick(); h.$('file-dialog').close();
  assert.ok(saved);
  rename(h, 'Redo after receive'); h.$('undo').click();
  const history = h.$('history-state').textContent;
  assert.equal(h.$('redo').disabled, false); assert.equal(h.$('file-state').dataset.dirty, 'false');
  openGit(h); await tick(); h.$('git-receive').click(); await tick(); h.$('git-apply').click(); await tick(); await tick();
  assert.deepEqual(Buffer.from(bytes), saved); assert.deepEqual(adopted, [['advanced-history', token]]);
  assert.equal(h.$('history-state').textContent, history); assert.equal(h.$('redo').disabled, false);
  assert.equal(h.$('file-state').dataset.dirty, 'false'); assert.match(h.$('git-feedback').textContent, /Модель уже актуальна/);
  h.$('git-close').click(); h.$('redo').click();
  assert.equal(h.$('project-name').textContent, 'Redo after receive'); assert.equal(h.$('file-state').dataset.dirty, 'true');
});
