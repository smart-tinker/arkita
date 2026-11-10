import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createCurrentFixture } from './current-fixture.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installFileActions } from '../src/file-actions.js';
import { installGitActions } from '../src/git-actions.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/index.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const target = { remote: '/local/team.git', branch: 'main', directory: 'arkita' };
function setup(t, overrides = {}, initial = {}) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://arkita.test/' });
  t.after(() => dom.window.close());
  const { window } = dom, { document } = window, $ = id => document.getElementById(id);
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.Blob = Blob;
  const model = createController(createCurrentFixture()), session = createProjectSession(model.store), messages = [], calls = [];
  const state = { status: 'ok', available: true, target, hasModel: true, attached: true, head: 'abc12345', ahead: 0, behind: 0, history: [], changes: [], ...initial };
  const desktop = {
    gitStatus: async () => ({ ...state }),
    gitConnect: async options => { calls.push(['connect', options]); state.target = options; return { status: 'ok' }; },
    gitCommit: async (bytes, token, message) => { calls.push(['commit', bytes, token, message]); state.changes = []; state.ahead++; return { status: 'ok' }; },
    gitOpen: async token => { calls.push(['open', token]); return { status: 'ready', bytes: serializeProjectFile(createCurrentFixture().snapshot), candidate: 'open-candidate' }; },
    gitAdopt: async (candidate, token) => { calls.push(['adopt', candidate, token]); return { status: 'ok' }; },
    gitPush: async token => { calls.push(['push', token]); state.ahead = 0; return { status: 'ok' }; },
    gitReceive: async () => ({ status: 'ready', plan: 'plan', conflicts: [] }),
    gitApply: async (plan, choice, token) => { calls.push(['apply', plan, choice, token]); return { status: 'ready', bytes: serializeProjectFile(model.store.snapshot), candidate: 'merge-candidate' }; },
    gitDisconnect: async () => { state.target = null; return { status: 'ok' }; },
    documentChanged: async (oldToken, newToken, candidate) => { calls.push(['documentChanged', oldToken, newToken, candidate]); return { status: 'ok', directory: { generation: 1, binding: null, issues: [] } }; },
    ...overrides,
  };
  window.schemkaDesktop = desktop;
  let git, interaction = 0;
  const render = () => { files.refresh(); git?.refresh(); };
  const common = { document, window, model, session, render, status: text => messages.push(text), openDialog: id => $(id).showModal(), readInteractionGeneration: () => interaction };
  const files = installFileActions({ ...common, inline: { generation: 0, cancel() {} }, cancelGesture() {}, afterLoad: () => model.afterLoad() });
  git = installGitActions({ ...common, files }); render();
  const settle = async () => { for (let i = 0; i < 20 && $('git-dialog').getAttribute('aria-busy') === 'true'; i++) await tick(); await tick(); };
  const open = async () => { $('git-button').click(); await settle(); };
  const submit = id => $(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const message = text => { $('git-message').value = text; $('git-message').dispatchEvent(new window.Event('input')); };
  const rename = name => { model.execute({ type: 'renameProject', name }); render(); };
  return { window, document, $, model, session, state, desktop, git, files, messages, calls, settle, open, submit, message, rename, render,
    set interaction(value) { interaction = value; } };
}

test('Git status is local, available without network, escapes repository and record labels, and provides author defaults', async t => {
  const h = setup(t, {}, { target: null, authorName: 'Local author', authorEmail: 'local@example.test' });
  h.rename('Keep unsaved model'); const token = h.session.documentToken, history = h.model.store.history;
  await h.open(); assert.equal(h.$('git-author-name').value, 'Local author'); assert.equal(h.$('git-author-email').value, 'local@example.test');
  h.$('git-remote').value = '/team/model.git'; h.submit('git-connect-form'); await h.settle();
  assert.equal(h.calls[0][0], 'connect'); assert.equal(h.calls[0][1].remote, '/team/model.git');
  assert.equal(h.session.documentToken, token); assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.history, history);
  h.state.target.remote = '<img src=x>'; h.state.changes = [{ path: 'x', label: '<script>owner</script>', kind: 'modified' }];
  h.$('git-refresh').click(); await h.settle(); assert.match(h.$('git-target').textContent, /<img/);
  assert.equal(h.$('git-dialog').querySelector('img,script'), null); assert.match(h.$('git-changes').textContent, /<script>/);
});

function changeList(count) {
  return Array.from({ length: count }, (_, index) => ({ kind: 'added', id: `record-${index + 1}`, label: `Record ${index + 1}`, type: 'element',
    fields: [{ field: 'documentation', category: 'metadata', beforePresent: false, afterPresent: true, after: '<img src=x>' }] }));
}
const pageButton = (list, text) => [...list.querySelectorAll('button')].find(button => button.textContent === text);
const changeRows = list => [...list.children].filter(row => row.querySelector('details'));

test('5016 Git changes stay bounded, expose every record and retain page/details through input and busy refresh', {
  skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'capacity test runs in Extended CI' : false,
}, async t => {
  const changes = changeList(5016), h = setup(t, {}, { changes });
  h.rename('Complete snapshot'); const bytes = serializeProjectFile(h.model.store.snapshot), token = h.session.documentToken, history = h.model.store.history;
  await h.open(); const list = h.$('git-changes');
  assert.equal(changeRows(list).length, 100); assert.ok(list.children.length <= 101);
  assert.match(list.textContent, /1–100 из 5016/); assert.equal(pageButton(list, 'Назад').disabled, true);
  const first = changeRows(list)[0], detail = first.querySelector('details');
  assert.equal(detail.querySelector('ul'), null, 'Closed fields must not create hidden DOM');
  detail.open = true; detail.dispatchEvent(new h.window.Event('toggle'));
  assert.match(detail.textContent, /\(отсутствует\) → "<img src=x>"/); assert.equal(detail.querySelector('img'), null);
  h.message('All records'); assert.equal(changeRows(list)[0], first); assert.equal(detail.open, true);
  const request = deferred(); h.desktop.gitStatus = () => request.promise;
  h.$('git-refresh').click(); assert.equal(h.$('git-dialog').getAttribute('aria-busy'), 'true');
  assert.equal(changeRows(list)[0], first); assert.equal(detail.open, true);
  request.resolve({ ...h.state }); await h.settle(); assert.equal(changeRows(list)[0], first);
  h.desktop.gitStatus = async () => ({ ...h.state });
  const seen = new Set();
  for (;;) {
    for (const row of changeRows(list)) seen.add(row.querySelector('summary').textContent);
    assert.ok(list.children.length <= 101); assert.equal(list.querySelector('img,script'), null);
    if (pageButton(list, 'Далее').disabled) break;
    pageButton(list, 'Далее').click();
  }
  assert.equal(seen.size, 5016); assert.equal(changeRows(list).length, 16); assert.match(list.textContent, /5001–5016 из 5016/);
  assert.equal(h.document.activeElement, pageButton(list, 'Назад'), 'Keyboard focus remains on an available page control');
  assert.match(list.textContent, /Record 5016/); assert.doesNotMatch(list.textContent, /Record 4999/);
  const last = changeRows(list).at(-1), lastDetail = last.querySelector('details');
  lastDetail.open = true; lastDetail.dispatchEvent(new h.window.Event('toggle'));
  h.message('Complete model'); h.render(); assert.equal(changeRows(list).at(-1), last); assert.equal(lastDetail.open, true);
  pageButton(list, 'Назад').click(); assert.equal(changeRows(list).length, 100); assert.match(list.textContent, /4901–5000 из 5016/);
  pageButton(list, 'Далее').click(); assert.match(list.textContent, /5001–5016 из 5016/);
  h.submit('git-commit-form'); await h.settle();
  assert.deepEqual(h.calls.find(call => call[0] === 'commit'), ['commit', bytes, token, 'Complete model']);
  assert.equal(changes.length, 5016); assert.equal(list.children.length, 0);
  assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.history, history);
});

test('merge change pages remain read-only and leave explicit apply/cancel semantics intact', async t => {
  const changes = changeList(201), h = setup(t, { gitReceive: async () => ({ status: 'ready', plan: 'large-plan', conflicts: [], changes }) });
  const before = serializeProjectFile(h.model.store.snapshot);
  await h.open(); h.$('git-receive').click(); await h.settle(); const list = h.$('git-merge-changes');
  assert.equal(changeRows(list).length, 100); assert.match(list.textContent, /1–100 из 201/);
  pageButton(list, 'Далее').click(); pageButton(list, 'Далее').click();
  assert.equal(changeRows(list).length, 1); assert.match(list.textContent, /Record 201/);
  const last = list.lastElementChild; h.render(); assert.equal(list.lastElementChild, last);
  assert.equal(h.$('git-apply').disabled, false); assert.equal(h.calls.some(call => call[0] === 'apply'), false);
  h.$('git-merge-cancel').click(); assert.deepEqual(serializeProjectFile(h.model.store.snapshot), before);
  assert.equal(changes.length, 201); assert.equal(h.calls.some(call => call[0] === 'apply'), false);
});

test('revision and working change lists page independently without changing restore safety', async t => {
  const changes = changeList(201), workingChanges = changeList(202);
  const h = setup(t, { gitInspect: async oid => ({ status: 'ready', inspection: 'large-preview', oid, changes, workingChanges, records: [], canRestore: true }) },
    { history: [{ oid: '12345678', message: 'Inspect', author: 'Author', date: '' }] });
  const before = serializeProjectFile(h.model.store.snapshot);
  await h.open(); h.$('git-history').querySelector('button').click(); await h.settle();
  const revision = h.$('git-inspection-changes'), working = h.$('git-working-changes');
  assert.equal(changeRows(revision).length, 100); assert.equal(changeRows(working).length, 100);
  pageButton(revision, 'Далее').click(); pageButton(revision, 'Далее').click();
  assert.equal(changeRows(revision).length, 1); assert.match(revision.textContent, /Record 201/);
  assert.match(working.textContent, /1–100 из 202/);
  pageButton(working, 'Далее').click(); pageButton(working, 'Далее').click();
  assert.equal(changeRows(working).length, 2); assert.match(working.textContent, /Record 202/);
  assert.equal(h.$('git-restore').disabled, true); assert.equal(h.$('git-replace-warning').hidden, false);
  const last = working.lastElementChild;
  h.$('git-replace-confirm').checked = true; h.$('git-replace-confirm').dispatchEvent(new h.window.Event('change'));
  assert.equal(h.$('git-restore').disabled, false); assert.equal(working.lastElementChild, last);
  assert.deepEqual(serializeProjectFile(h.model.store.snapshot), before); assert.equal(h.calls.length, 0);
});

test('missing Git and browser preview explain availability without enabling a token or repository form', async t => {
  const h = setup(t, {}, { status: 'error', code: 'GIT_MISSING', message: 'Git missing', available: false, target: null }); await h.open();
  assert.match(h.$('git-state').textContent, /Git недоступен.*Переустановите Arkita/); assert.equal(h.$('git-connect-form').hidden, true);
  assert.equal(h.$('git-dialog').querySelector('input[type=password]'), null);
  h.$('git-close').click(); assert.equal(h.document.activeElement.textContent, 'Дополнительно');
  h.desktop.gitStatus = undefined; await h.open(); assert.match(h.$('git-state').textContent, /приложении Arkita для Windows/);
});

test('local commit requires a message, saves exact snapshot and does not clear file dirty or undo history', async t => {
  const h = setup(t, {}, { changes: [{ path: 'schemka.json', label: 'Название модели', kind: 'modified' }] });
  h.rename('Unsaved name'); const token = h.session.documentToken, history = h.model.store.history;
  await h.open(); assert.equal(h.$('git-commit').disabled, true); h.message('   '); assert.equal(h.$('git-commit').disabled, true);
  h.message('Rename model'); assert.equal(h.$('git-commit').disabled, false);
  h.submit('git-commit-form'); h.submit('git-commit-form'); await h.settle();
  const commits = h.calls.filter(call => call[0] === 'commit'); assert.equal(commits.length, 1);
  assert.equal(deserializeProjectFile(commits[0][1]).project.name, 'Unsaved name'); assert.equal(commits[0][2], token);
  assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.history, history); assert.equal(h.$('git-message').value, '');
  assert.equal(h.$('git-commit').disabled, true); assert.match(h.$('git-feedback').textContent, /локально/);
});

test('existing Git model must be explicitly opened; connect and cancelling replacement preserve dirty model and both histories', async t => {
  const h = setup(t, {}, { attached: false, changes: [{ path: 'x', label: 'Other model', kind: 'modified' }] });
  h.rename('Keep me'); await h.open(); h.message('Wrong model'); assert.equal(h.$('git-commit').disabled, true);
  const token = h.session.documentToken, history = h.model.store.history;
  h.$('git-open').click(); await h.settle(); assert.equal(h.$('git-dialog').open, false); assert.equal(h.$('file-dialog').open, true);
  assert.equal(h.model.store.snapshot.project.name, 'Keep me'); assert.equal(h.calls.some(call => call[0] === 'adopt'), false);
  h.$('cancel-load').click(); assert.equal(h.session.documentToken, token); assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.history, history);
});

test('confirmed Git open adopts the new document only after file-session validation and detaches the local file binding', async t => {
  const h = setup(t); h.rename('Previous file'); const oldToken = h.session.documentToken;
  await h.open(); h.$('git-open').click(); await h.settle(); h.$('load-project').click(); await tick(); await tick();
  assert.notEqual(h.session.documentToken, oldToken); assert.equal(h.session.dirty, false); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
  assert.deepEqual(h.calls.filter(call => call[0] === 'documentChanged'), [['documentChanged', oldToken, h.session.documentToken, null]]);
  assert.deepEqual(h.calls.filter(call => call[0] === 'adopt'), [['adopt', 'open-candidate', h.session.documentToken]]);
  assert.equal(h.files.sourceLabel, 'Модель из Git'); assert.match(h.$('file-state').textContent, /Открыто из Git/);
});

for (const change of ['replace document', 'refresh same document']) test(`late Git adoption preserves newer status after ${change}`, async t => {
  const adoption = deferred(), requested = deferred(), adopted = [];
  const h = setup(t, { gitAdopt: (candidate, token) => { adopted.push([candidate, token]); requested.resolve(); return adoption.promise; } });
  await h.open(); h.$('git-open').click(); await h.settle();
  h.$('load-project').click(); await requested.promise;
  const adoptedToken = h.session.documentToken;
  h.$('file-dialog').close();
  if (change === 'replace document') {
    const next = createCurrentFixture(); next.execute({ type: 'renameProject', name: 'New document B' }, next.revision);
    assert.equal(h.files.proposeExternal({ bytes: serializeProjectFile(next.snapshot), name: 'B', source: 'import' }), true);
    h.$('load-project').click(); await tick(); await tick();
    assert.notEqual(h.session.documentToken, adoptedToken);
  }
  h.state.target = { ...target, remote: '/local/newer-status.git' };
  await h.open();
  assert.equal(h.$('git-connected').hidden, false); assert.equal(h.$('git-connect-form').hidden, true);
  const capture = () => ({ token: h.session.documentToken, files: h.model.store.exportFiles(), history: h.model.store.history,
    source: h.files.sourceLabel, connected: h.$('git-connected').hidden, connect: h.$('git-connect-form').hidden,
    target: h.$('git-target').textContent, attachment: h.$('git-attachment').textContent, messages: [...h.messages] });
  const before = capture();
  adoption.resolve({ status: 'ok' }); await tick(); await tick(); h.render();
  assert.deepEqual(adopted, [['open-candidate', adoptedToken]]);
  assert.deepEqual(capture(), before); assert.equal(h.$('git-dialog').open, true);
});

test('late open/status responses after close or editor changes never propose or replace a model', async t => {
  const read = deferred(), h = setup(t, { gitOpen: () => read.promise }); await h.open(); h.$('git-open').click(); h.$('git-close').click(); h.rename('Newer edit');
  read.resolve({ status: 'ready', bytes: serializeProjectFile(createCurrentFixture().snapshot), candidate: 'stale' }); await h.settle();
  assert.equal(h.$('file-dialog').open, false); assert.equal(h.model.store.snapshot.project.name, 'Newer edit'); assert.equal(h.calls.length, 0);
  const request = deferred(); h.desktop.gitStatus = () => request.promise; h.$('git-button').click(); h.interaction = 1;
  request.resolve({ ...h.state, target: { ...target, remote: 'stale-remote' } }); await h.settle(); assert.doesNotMatch(h.$('git-target').textContent, /stale-remote/);
});

test('receive requires explicit apply and cancelling a prepared merge preserves model, baseline and history', async t => {
  const h = setup(t, { gitReceive: async () => ({ status: 'ready', plan: 'plan', conflicts: [], changes: [{ path: 'schemka.json', label: 'New model name', kind: 'modified' }] }) }); h.rename('Current'); const before = h.model.store.exportFiles(), history = h.model.store.history;
  await h.open(); h.$('git-receive').click(); await h.settle();
  assert.match(h.$('git-merge-changes').textContent, /Изменён: New model name/);
  assert.equal(h.document.activeElement, h.$('git-merge-cancel'));
  assert.equal(h.$('git-merge').hidden, false); assert.equal(h.$('git-apply').disabled, false); assert.equal(h.calls.some(call => call[0] === 'apply'), false);
  h.$('git-merge-cancel').click(); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.equal(h.session.dirty, true);
});

test('every conflicting record needs an explicit side, invalid combinations keep choices and allow an explicit whole model', async t => {
  const conflicts = ['a', 'b'].map(path => ({ path, label: `Object ${path}`, base: '{}', local: '{"name":"local"}', remote: null }));
  const applied = [], h = setup(t, {
    gitReceive: async () => ({ status: 'ready', plan: 'conflict-plan', conflicts }),
    gitApply: async (plan, choice) => { applied.push(choice); return { status: 'error', code: 'GIT_MODEL_CONFLICT', message: 'Broken references' }; },
  });
  await h.open(); h.$('git-receive').click(); await h.settle(); assert.equal(h.$('git-apply').disabled, true);
  const choose = (path, value) => { const input = [...h.$('git-conflicts').querySelectorAll('input')].find(input => input.dataset.path === path && input.value === value); input.checked = true; input.dispatchEvent(new h.window.Event('change')); };
  choose('a', 'local'); assert.equal(h.$('git-apply').disabled, true); choose('b', 'remote'); assert.equal(h.$('git-apply').disabled, false);
  h.$('git-apply').click(); assert.ok([...h.$('git-conflicts').querySelectorAll('input')].every(input => input.disabled)); assert.equal(h.$('git-whole').disabled, true);
  await h.settle(); assert.deepEqual(applied, [{ records: { a: 'local', b: 'remote' } }]);
  assert.equal(h.$('git-whole-choice').hidden, false); assert.equal(h.$('git-conflicts').querySelectorAll('input:checked').length, 2); assert.equal(h.$('git-apply').disabled, true);
  h.$('git-whole').value = 'local'; h.$('git-whole').dispatchEvent(new h.window.Event('change')); assert.equal(h.$('git-apply').disabled, false);
  h.$('git-apply').click(); await h.settle(); assert.deepEqual(applied[1], { whole: 'local' });
  assert.match(h.$('git-whole').selectedOptions[0].textContent, /отбросить изменения коллег/);
});

test('applied Git snapshot is one undoable command, keeps document token/local binding and leaves local file dirty', async t => {
  const h = setup(t); const before = h.model.store.snapshot, merged = structuredClone(before); merged.project.name = 'Merged model';
  h.desktop.gitApply = async (plan, choice, token) => { h.calls.push(['apply', plan, choice, token]); return { status: 'ready', bytes: serializeProjectFile(merged), candidate: 'merged' }; };
  const token = h.session.documentToken; await h.open(); h.$('git-receive').click(); await h.settle(); h.$('git-apply').click(); await h.settle();
  assert.equal(h.model.store.snapshot.project.name, 'Merged model'); assert.equal(h.session.documentToken, token); assert.equal(h.session.dirty, true);
  assert.deepEqual(h.model.store.history, { undo: 1, redo: 0 }); assert.equal(h.calls.some(call => call[0] === 'documentChanged'), false);
  assert.deepEqual(h.calls.filter(call => call[0] === 'adopt'), [['adopt', 'merged', token]]);
  h.model.undo(); assert.deepEqual(h.model.store.snapshot, before); assert.equal(h.session.dirty, false);
});

for (const dirty of [false, true]) test(`identical Git snapshot adopts repository history without changing ${dirty ? 'unsaved' : 'saved'} model or Redo`, async t => {
  const h = setup(t);
  if (dirty) h.rename('Unsaved base');
  h.rename('Redo target'); h.model.undo(); h.render();
  const before = h.model.store.snapshot, revision = h.model.store.revision, history = h.model.store.history;
  const token = h.session.documentToken;
  assert.equal(h.session.dirty, dirty); assert.equal(history.redo, 1);
  await h.open(); h.$('git-receive').click(); await h.settle(); h.$('git-apply').click(); await h.settle();
  assert.deepEqual(h.model.store.snapshot, before); assert.equal(h.model.store.revision, revision);
  assert.deepEqual(h.model.store.history, history); assert.equal(h.session.documentToken, token); assert.equal(h.session.dirty, dirty);
  assert.deepEqual(h.calls.filter(call => call[0] === 'adopt'), [['adopt', 'merge-candidate', token]]);
  assert.equal(h.calls.some(call => call[0] === 'documentChanged'), false);
  assert.match(h.messages.at(-1), /Модель уже актуальна/); assert.doesNotMatch(h.messages.at(-1), /отменить одним шагом/);
  h.model.redo(); assert.equal(h.model.store.snapshot.project.name, 'Redo target');
  h.model.undo(); assert.deepEqual(h.model.store.snapshot, before); assert.equal(h.session.dirty, dirty);
  if (dirty) { h.model.undo(); assert.equal(h.session.dirty, false, 'The local saved baseline is retained'); }
});

test('merge committed after close or newer revision never overwrites renderer and reports recovery through Open from Git', async t => {
  const write = deferred(), h = setup(t, { gitApply: () => write.promise }); await h.open(); h.$('git-receive').click(); await h.settle();
  h.$('git-apply').click(); assert.equal(h.git.transient, true); h.$('git-close').click(); h.rename('Keep later edit');
  write.resolve({ status: 'ready', bytes: serializeProjectFile(createCurrentFixture().snapshot), candidate: 'late-merge' }); await h.settle();
  assert.equal(h.model.store.snapshot.project.name, 'Keep later edit'); assert.equal(h.calls.some(call => call[0] === 'adopt'), false);
  assert.match(h.messages.at(-1), /Результат сохранён в Git.*Откройте модель из Git/);
});


test('failed adoption after Git open still refreshes the committed model and offers recovery without claiming old state survived', async t => {
  const next = createCurrentFixture(); next.execute({ type: 'renameProject', name: 'Loaded despite adoption error' }, next.revision);
  const h = setup(t, { gitOpen: async () => ({ status: 'ready', bytes: serializeProjectFile(next.snapshot), candidate: 'candidate' }),
    gitAdopt: async () => ({ status: 'error', message: 'Adoption failed' }) });
  h.rename('Previous'); await h.open(); h.$('git-open').click(); await h.settle(); h.$('load-project').click(); await tick(); await tick();
  assert.equal(h.model.store.snapshot.project.name, 'Loaded despite adoption error'); assert.equal(h.files.sourceLabel, 'Модель из Git');
  assert.equal(h.$('replace-project').hidden, true); assert.match(h.$('file-feedback').textContent, /Модель уже загружена.*Adoption failed/);
  assert.equal(h.model.viewId, deserializeProjectFile(serializeProjectFile(next.snapshot)).views[0].view.id); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
});


test('missing author defaults reveal required fields; invalid connection cannot start network work', async t => {
  const h = setup(t, {}, { target: null, authorName: '', authorEmail: '' }); await h.open();
  assert.equal(h.$('git-author').open, true); h.$('git-remote').value = '/team.git'; h.$('git-author').open = false;
  h.submit('git-connect-form'); await h.settle(); assert.equal(h.calls.length, 0); assert.equal(h.$('git-author').open, true);
  h.$('git-author-name').value = 'Model author'; h.$('git-author-email').value = 'author@example.test';
  h.submit('git-connect-form'); await h.settle(); assert.equal(h.calls.filter(call => call[0] === 'connect').length, 1);
});


test('history preview is read-only, escapes typed metadata/geometry and requires explicit restore with one Undo', async t => {
  const h = setup(t, {}, { history: [{ oid: '123456789abc', message: 'Original version', author: 'Author', date: '2026-10-19T00:00:00Z' }] });
  const original = h.model.store.snapshot; h.rename('Current unsaved model');
  const current = h.model.store.snapshot, history = h.model.store.history, token = h.session.documentToken, beforeRevision = h.model.store.revision;
  h.desktop.gitInspect = async (oid, bytes, suppliedToken) => {
    h.calls.push(['inspect', oid, suppliedToken]);
    assert.equal(deserializeProjectFile(bytes).project.name, 'Current unsaved model');
    return { status: 'ready', inspection: 'revision-preview', oid, entry: { message: '<script>metadata</script>', author: 'Author' }, canRestore: true,
      changes: [{ kind: 'modified', label: 'Element', type: 'occurrence', id: 'id', fields: [{ field: 'bounds.x', category: 'geometry', before: 10, after: 20, beforePresent: true, afterPresent: true }] }],
      workingChanges: [{ kind: 'modified', label: 'Model', fields: [{ field: 'documentation', category: 'metadata', before: '<img src=x>', after: 'Original', beforePresent: true, afterPresent: true }] }],
      records: [{ path: 'schemka.json', record: original.project }], parents: ['older-version'] };
  };
  h.desktop.gitRestore = async (id, bytes, suppliedToken) => { h.calls.push(['restore', id, suppliedToken]); return { status: 'ready', bytes: serializeProjectFile(original) }; };
  await h.open(); h.$('git-history').querySelector('button').click(); await h.settle();
  assert.deepEqual(h.model.store.snapshot, current); assert.deepEqual(h.model.store.history, history); assert.equal(h.model.store.revision, beforeRevision);
  for (const id of ['git-inspection-changes', 'git-working-changes']) {
    const detail = h.$(id).querySelector('details'); assert.equal(detail.querySelector('ul'), null);
    detail.open = true; detail.dispatchEvent(new h.window.Event('toggle'));
  }
  assert.equal(h.$('git-inspection').hidden, false); assert.match(h.$('git-inspection-changes').textContent, /Геометрия.*bounds.x.*10 → 20/);
  assert.match(h.$('git-working-changes').textContent, /<img/); assert.equal(h.$('git-inspection').querySelector('script,img'), null);
  assert.match(h.$('git-record-value').textContent, new RegExp(original.project.id)); assert.equal(h.$('git-inspection-parents').querySelector('button').disabled, false);
  h.desktop.gitCreateMilestone = async (name, oid, suppliedToken) => { h.calls.push(['historic-milestone', name, oid, suppliedToken]); return { status: 'ok' }; };
  h.$('git-inspection-milestone-name').value = 'historic'; h.submit('git-inspection-milestone-form'); await h.settle();
  assert.deepEqual(h.calls.find(call => call[0] === 'historic-milestone'), ['historic-milestone', 'historic', '123456789abc', token]);
  assert.deepEqual(h.model.store.snapshot, current);
  assert.equal(h.$('git-restore').disabled, true); h.$('git-replace-confirm').checked = true; h.$('git-replace-confirm').dispatchEvent(new h.window.Event('change'));
  h.$('git-restore').click(); await h.settle();
  assert.deepEqual(serializeProjectFile(h.model.store.snapshot), serializeProjectFile(original)); assert.equal(h.session.documentToken, token); assert.equal(h.model.store.history.undo, history.undo + 1);
  assert.deepEqual(h.calls.filter(call => call[0] === 'restore'), [['restore', 'revision-preview', token]]);
  assert.equal(h.calls.some(call => ['commit', 'push', 'adopt', 'documentChanged'].includes(call[0])), false);
  h.model.undo(); assert.deepEqual(h.model.store.snapshot, current); assert.equal(h.session.dirty, true);
});

test('closing a revision preview or receiving a late inspection preserves document, baseline and Redo', async t => {
  const request = deferred(), h = setup(t, { gitInspect: () => request.promise }, { history: [{ oid: '12345678', message: 'Inspect', author: 'Author', date: '' }] });
  h.rename('Redo'); h.model.undo(); const before = h.model.store.snapshot, history = h.model.store.history;
  await h.open(); h.$('git-history').querySelector('button').click(); h.$('git-close').click();
  request.resolve({ status: 'ready', inspection: 'late', oid: '12345678', workingChanges: [], records: [] }); await h.settle();
  assert.deepEqual(h.model.store.snapshot, before); assert.deepEqual(h.model.store.history, history); assert.equal(h.session.dirty, false); assert.equal(h.$('git-inspection').hidden, true);
});

test('branch creation stays local; switching previews unsaved changes, supports cancel, and requires explicit replacement', async t => {
  const h = setup(t, {}, { localBranch: 'main', openRevision: 'abc12345', branches: [{ name: 'main', oid: 'abc12345' }, { name: 'trial', oid: 'def12345' }] });
  const initial = h.model.store.snapshot; h.rename('Uncommitted'); const current = h.model.store.snapshot, token = h.session.documentToken;
  h.desktop.gitCreateBranch = async (name, suppliedToken) => { h.calls.push(['branch', name, suppliedToken]); return { status: 'ok' }; };
  h.desktop.gitPrepareBranch = async name => ({ status: 'ready', inspection: 'branch-plan', oid: 'def12345', name, dirty: true, changes: [{ kind: 'modified', label: 'Model' }] });
  h.desktop.gitSwitchBranch = async (id, bytes, suppliedToken) => { h.calls.push(['switch', id, suppliedToken]); h.state.localBranch = 'trial'; h.state.head = 'def12345'; h.state.openRevision = 'def12345'; return { status: 'ready', bytes: serializeProjectFile(initial), candidate: 'branch-candidate' }; };
  await h.open(); assert.match(h.$('git-revisions').textContent, /Локальная ветвь: main.*upstream: main.*abc12345/);
  h.$('git-new-branch').value = 'new-local'; h.submit('git-branch-form'); await h.settle(); assert.deepEqual(h.calls[0], ['branch', 'new-local', token]);
  assert.equal(h.calls.some(call => call[0] === 'push'), false); assert.deepEqual(h.model.store.snapshot, current);
  const prepare = async () => { h.$('git-local-branch').value = 'trial'; h.$('git-local-branch').dispatchEvent(new h.window.Event('change')); h.$('git-prepare-branch').click(); await h.settle(); };
  await prepare(); assert.match(h.$('git-inspection-state').textContent, /изменения без локального commit/); assert.equal(h.$('git-restore').disabled, true);
  h.$('git-inspection-close').click(); assert.deepEqual(h.model.store.snapshot, current); assert.equal(h.calls.some(call => call[0] === 'switch'), false);
  await prepare(); h.$('git-replace-confirm').checked = true; h.$('git-replace-confirm').dispatchEvent(new h.window.Event('change')); h.$('git-restore').click(); await h.settle();
  assert.deepEqual(serializeProjectFile(h.model.store.snapshot), serializeProjectFile(initial)); assert.equal(h.session.documentToken, token); assert.equal(h.state.localBranch, 'trial');
  assert.deepEqual(h.calls.filter(call => call[0] === 'adopt'), [['adopt', 'branch-candidate', token]]);
  h.model.undo(); assert.deepEqual(h.model.store.snapshot, current); assert.equal(h.session.dirty, true);
});

test('bulk conflict choices retain exact three-way context and are submitted only by explicit apply', async t => {
  const conflict = id => ({ path: id, label: `Object ${id}`, base: '{"name":"Base"}', local: '{"name":"Local"}', remote: '{"name":"Remote"}',
    context: { base: { id, label: 'Base', relationships: [{ id: 'rel-1', label: 'Depends' }], views: [{ id: 'view-1', name: 'Overview' }] } } });
  const h = setup(t, { gitReceive: async () => ({ status: 'ready', plan: 'bulk', conflicts: [conflict('a'), conflict('b')] }) });
  await h.open(); h.$('git-receive').click(); await h.settle(); assert.match(h.$('git-conflicts').textContent, /Depends \(rel-1\).*Overview \(view-1\)/);
  h.$('git-choose-remote').click(); assert.equal(h.$('git-apply').disabled, false); assert.equal(h.calls.some(call => call[0] === 'apply'), false);
  assert.equal(h.$('git-conflicts').querySelectorAll('input:checked').length, 2); h.$('git-apply').click(); await h.settle();
  assert.deepEqual(h.calls.find(call => call[0] === 'apply')[2], { records: { a: 'remote', b: 'remote' } });
});

test('milestone creation, publication and local deletion have distinct actions and never invoke branch push', async t => {
  const h = setup(t, {}, { localBranch: 'main', milestones: [] });
  h.desktop.gitCreateMilestone = async (name, oid, token) => { h.calls.push(['milestone', name, oid, token]); h.state.milestones = [{ name, oid, remoteOid: null }]; return { status: 'ok' }; };
  h.desktop.gitPublishMilestone = async (name, oid, token) => { h.calls.push(['publish-milestone', name, oid, token]); h.state.milestones[0].remoteOid = oid; return { status: 'ok' }; };
  h.desktop.gitDeleteMilestone = async (name, oid, token) => { h.calls.push(['delete-milestone', name, oid, token]); h.state.milestones[0].oid = null; return { status: 'ok' }; };
  await h.open(); h.$('git-milestone-name').value = 'review-1'; h.submit('git-milestone-form'); await h.settle();
  assert.deepEqual(h.calls[0], ['milestone', 'review-1', h.state.head, h.session.documentToken]); assert.equal(h.calls.length, 1);
  const button = text => [...h.$('git-milestones').querySelectorAll('button')].find(item => item.textContent === text);
  button('Опубликовать веху').click(); await h.settle(); assert.equal(h.calls[1][0], 'publish-milestone'); assert.equal(button('Опубликовать веху').disabled, true);
  button('Удалить локальную веху').click(); await h.settle(); assert.equal(h.calls[2][0], 'delete-milestone'); assert.match(h.$('git-milestones').textContent, /на сервере/);
  assert.equal(h.calls.some(call => call[0] === 'push'), false); assert.equal(h.session.dirty, false); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
});
