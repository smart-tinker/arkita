import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_URL } from '../boundary.mjs';
import { createGitService } from '../git-service.mjs';
import { discoverGit } from '../git-repository.mjs';
import { createProject, createStore, exportFiles, FORMAT_VERSION } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile, deserializeProjectFile, readProjectFile } from '../../schemka-model-io/src/project-file.js';
import { metadataFixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
const executable = await discoverGit();
const exec = promisify(execFile), git = async (...args) => (await exec(executable, args)).stdout.trim();
const bytes = serializeProjectFile;
function expectOK(result) { assert.equal(result.status, 'ok', JSON.stringify(result)); return result; }
function expectReady(result) { assert.equal(result.status, 'ready', JSON.stringify(result)); return result; }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-git-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git'); await git('init', '--bare', '--initial-branch=main', remote);
  const target = { remote, branch: 'main', directory: 'models/arkita', authorName: 'Arkita Tester', authorEmail: 'test@example.invalid' };
  let clients = 0;
  async function client(options = {}) {
    const storagePath = path.join(root, `client-${++clients}`), window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
    const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }, service = createGitService({ window, storagePath, gitPath: executable, ...options });
    let token = randomUUID();
    expectOK(await service.status(event, undefined, token)); expectOK(await service.connect(event, target));
    return { service, event, storagePath, window, get token() { return token; },
      status: model => service.status(event, model && bytes(model), token),
      commit: (model, message = 'Saved model') => service.commit(event, bytes(model), token, message),
      push: () => service.push(event, token), receive: model => service.receive(event, bytes(model), token),
      async open() { const result = expectReady(await service.open(event, token)); const next = randomUUID(); expectOK(service.documentChanged(event, token, next)); token = next; expectOK(await service.adopt(event, result.candidate, token)); return deserializeProjectFile(result.bytes); },
      async apply(plan, resolution = {}) { const result = expectReady(await service.apply(event, plan, resolution, token)); expectOK(await service.adopt(event, result.candidate, token)); return deserializeProjectFile(result.bytes); },
    };
  }
  return { root, remote, target, client };
}
async function shared(t, model = conceptProject()) {
  const f = await fixture(t), a = await f.client(); expectOK(await a.commit(model, 'Initial')); expectOK(await a.push());
  const b = await f.client(); assert.equal((await b.status()).attached, false); assert.deepEqual(exportFiles(await b.open()), exportFiles(model));
  return { ...f, a, b, model };
}

test('local offline versions, ordinary push, explicit adoption, and restart retain history without touching a checkout', async t => {
  const f = await fixture(t), a = await f.client(), model = createProject('Offline');
  assert.equal((await a.status()).hasModel, false);
  const committed = expectOK(await a.commit(model, 'First local version')); assert.equal(committed.ahead, 1); assert.equal(committed.attached, true);
  assert.equal(await git('--git-dir', f.remote, 'branch', '--list'), '');
  expectOK(await a.push()); assert.equal((await a.status()).ahead, 0);
  const b = await f.client(); assert.equal((await b.commit(model)).code, 'GIT_SESSION'); await b.open();
  model.project.name = 'Second'; expectOK(await b.commit(model, 'Rename project'));
  const restarted = createGitService({ window: b.window, storagePath: b.storagePath, gitPath: executable });
  const state = expectOK(await restarted.status(b.event, bytes(model), randomUUID()));
  assert.equal(state.attached, false); assert.equal(state.history[0].message, 'Rename project'); assert.equal(state.history.length, 2); assert.equal(state.changes.length, 0);
  expectOK(await restarted.disconnect(b.event)); assert.equal((await restarted.status(b.event)).target, null);
  expectOK(await restarted.connect(b.event, f.target)); assert.equal((await restarted.status(b.event)).history[0].message, 'Rename project');
  assert.equal((await fs.readdir(b.storagePath)).includes('repositories'), true);
});

test('two clients merge independent record changes after non-fast-forward rejection and keep both parents', async t => {
  const { a, b, model, remote } = await shared(t), local = structuredClone(model), server = structuredClone(model);
  local.elements[0].name = 'Alice'; server.elements[1].name = 'Bob';
  expectOK(await a.commit(local, 'Alice edit')); expectOK(await b.commit(server, 'Bob edit')); expectOK(await b.push());
  const head = (await a.status()).head; assert.equal((await a.push()).code, 'GIT_PUSH'); assert.equal((await a.status()).head, head);
  const pending = expectReady(await a.receive(local)); assert.deepEqual(pending.conflicts, []);
  const merged = await a.apply(pending.plan); assert.equal(merged.elements[0].name, 'Alice'); assert.equal(merged.elements[1].name, 'Bob');
  expectOK(await a.push()); const parents = (await git('--git-dir', remote, 'show', '-s', '--format=%P', 'main')).split(' '); assert.equal(parents.length, 2);
  assert.equal((await a.status(merged)).changes.length, 0);
});

test('same-record conflicts require explicit selection; applying blocks stale commits until adoption', async t => {
  const { a, b, model } = await shared(t), left = structuredClone(model), right = structuredClone(model);
  left.elements[0].name = 'Local'; right.elements[0].name = 'Remote'; expectOK(await a.commit(left)); expectOK(await b.commit(right)); expectOK(await b.push());
  const pending = expectReady(await a.receive(left)), before = (await a.status()).head; assert.equal(pending.conflicts.length, 1);
  assert.equal((await a.service.apply(a.event, pending.plan, {}, a.token)).code, 'GIT_MODEL_CONFLICT'); assert.equal((await a.status()).head, before);
  assert.equal((await a.service.apply(a.event, pending.plan, { records: { '../bad': 'remote' } }, a.token)).code, 'GIT_RESOLUTION');
  const result = expectReady(await a.service.apply(a.event, pending.plan, { records: { [pending.conflicts[0].path]: 'remote' } }, a.token));
  assert.equal(deserializeProjectFile(result.bytes).elements[0].name, 'Remote'); assert.equal((await a.commit(left)).code, 'GIT_SESSION');
  expectOK(await a.service.adopt(a.event, result.candidate, a.token)); assert.equal((await a.service.apply(a.event, pending.plan, {}, a.token)).code, 'GIT_PLAN');
});

test('delete versus new relationship is a graph conflict and whole-side choice preserves a validated model', async t => {
  const { a, b, model } = await shared(t), store = createStore(model), server = structuredClone(model);
  store.execute({ type: 'deleteElementFromModel', elementId: model.elements[0].id }, store.revision); const local = store.snapshot;
  server.relationships.push({ id: fixtureId('rel', 500), type: 'Association', label: 'Concurrent relation', documentation: '', properties: [], source: { kind: 'element', id: model.elements[0].id }, target: { kind: 'element', id: model.elements[1].id } });
  expectOK(await a.commit(local)); expectOK(await b.commit(server)); expectOK(await b.push());
  const pending = expectReady(await a.receive(local)); assert.equal(pending.conflicts.length, 0); assert.match(pending.structuralError, /REFERENCE/);
  const before = (await a.status()).head; assert.equal((await a.service.apply(a.event, pending.plan, {}, a.token)).code, 'GIT_MODEL_CONFLICT'); assert.equal((await a.status()).head, before);
  const merged = await a.apply(pending.plan, { whole: 'remote' }); assert.deepEqual(exportFiles(merged), exportFiles(server));
});

test('dirty receive, different project, document replacement, stale tickets, forged sender and busy service fail closed', async t => {
  const { a, model } = await shared(t), dirty = structuredClone(model); dirty.project.name = 'Unsaved';
  assert.equal((await a.receive(dirty)).code, 'GIT_DIRTY'); assert.equal((await a.commit(createProject('Different'))).code, 'GIT_PROJECT');
  assert.equal((await a.service.status({ ...a.event, sender: {} }, bytes(model), a.token)).code, 'IPC_SENDER');
  const pending = expectReady(await a.receive(model)), next = randomUUID(); expectOK(a.service.documentChanged(a.event, a.token, next));
  assert.equal((await a.service.apply(a.event, pending.plan, {}, next)).code, 'GIT_PLAN');
  assert.equal((await a.commit(model)).code, 'GIT_SESSION');
  const f = await fixture(t), b = await f.client(); const current = b.service.connect(b.event, f.target);
  assert.equal((await b.status()).code, 'GIT_BUSY'); expectOK(await current);
  const blocked = createGitService({ window: b.window, storagePath: path.join(f.root, 'blocked'), gitPath: executable, isFileBusy: () => true });
  assert.equal((await blocked.status(b.event)).code, 'GIT_BUSY');
});

test('server unavailability never discards local versions or the previous connection', async t => {
  const { a, model, remote, root } = await shared(t); model.project.name = 'Offline edit'; const saved = expectOK(await a.commit(model));
  await fs.rename(remote, remote + '-offline');
  assert.equal((await a.push()).code, 'GIT_PUSH'); assert.equal((await a.receive(model)).status, 'error');
  assert.equal((await a.service.connect(a.event, { remote: path.join(root, 'missing.git'), branch: 'main', directory: 'arkita' })).status, 'error');
  const state = expectOK(await a.status(model)); assert.equal(state.head, saved.head); assert.equal(state.target.remote, remote); assert.equal(state.changes.length, 0);
});

test('an open candidate survives only its single replacement acknowledgment; unavailable Git is explicit', async t => {
  const { a, model, root } = await shared(t);
  const candidate = expectReady(await a.service.open(a.event, a.token)), first = randomUUID(), second = randomUUID();
  expectOK(a.service.documentChanged(a.event, a.token, first)); expectOK(a.service.documentChanged(a.event, first, second));
  assert.equal((await a.service.adopt(a.event, candidate.candidate, second)).code, 'GIT_SESSION');
  const missing = createGitService({ window: a.window, storagePath: path.join(root, 'no-git'), gitPath: path.join(root, 'absent-git') });
  const result = await missing.status(a.event, bytes(model), randomUUID()); assert.equal(result.code, 'GIT_MISSING'); assert.equal(result.available, false);
});

test('Git opens original v2 bytes with migration provenance while status and new commits compare canonical current format without rewriting source history', async t => {
  const f = await fixture(t), original = metadataFixture(), seed = path.join(f.root, 'seed');
  await fs.mkdir(seed); await git('init', '--initial-branch=main', seed);
  for (const file of original.files) {
    const target = path.join(seed, f.target.directory, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.content);
  }
  await git('-C', seed, 'add', '--', f.target.directory);
  await git('-C', seed, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Frozen v2 input');
  await git('-C', seed, 'push', f.remote, 'main');
  const oldHead = await git('--git-dir', f.remote, 'rev-parse', 'main'), client = await f.client();
  const candidate = expectReady(await client.service.open(client.event, client.token));
  assert.deepEqual(candidate.bytes, original.bytes); assert.equal(readProjectFile(candidate.bytes).sourceVersion, 2);
  const model = await client.open(); assert.equal(model.project.formatVersion, FORMAT_VERSION); assert.equal(model.project.documentation, '');
  assert.equal((await client.status(model)).changes.length, 0);
  assert.equal(await git('--git-dir', f.remote, 'rev-parse', 'main'), oldHead);
  model.project.documentation = 'A v3 metadata edit';
  const committed = expectOK(await client.commit(model, 'Metadata v3'));
  assert.notEqual(committed.head, oldHead); assert.equal(await git('--git-dir', f.remote, 'rev-parse', 'main'), oldHead);
  assert.equal(await git('--git-dir', f.remote, 'show', `${oldHead}:${f.target.directory}/schemka.json`), original.files.find(file => file.path === 'schemka.json').content.trim());
  assert.deepEqual(original, metadataFixture());
});


test('read-only revision inspection exposes metadata and geometry; explicit restore leaves refs intact until a later commit', async t => {
  const { a, model, remote } = await shared(t), initial = (await a.status()).head;
  const changed = structuredClone(model); changed.elements[0].name = 'Renamed shared element'; changed.elements[0].documentation = 'Detailed metadata';
  changed.views[0].occurrences[0].bounds.x += 25;
  const current = expectOK(await a.commit(changed, 'Metadata and geometry')), remoteBefore = await git('--git-dir', remote, 'rev-parse', 'main');
  const inspection = expectReady(await a.service.inspect(a.event, current.head, bytes(changed), a.token));
  assert.equal(inspection.changes.filter(item => item.type === 'element').length, 1);
  assert.ok(inspection.changes.some(item => item.type === 'occurrence' && item.fields.some(field => field.category === 'geometry' && field.field === 'bounds.x')));
  assert.ok(inspection.changes.some(item => item.fields.some(field => field.field === 'documentation')));
  assert.equal(inspection.records.length, exportFiles(changed).length); assert.equal((await a.status()).head, current.head);
  const earlier = expectReady(await a.service.inspect(a.event, initial, bytes(changed), a.token));
  const restored = expectReady(await a.service.restore(a.event, earlier.inspection, bytes(changed), a.token));
  assert.deepEqual(exportFiles(deserializeProjectFile(restored.bytes)), exportFiles(model));
  assert.equal((await a.status()).head, current.head); assert.equal(await git('--git-dir', remote, 'rev-parse', 'main'), remoteBefore);
  const committed = expectOK(await a.commit(deserializeProjectFile(restored.bytes), 'Restore initial model'));
  assert.notEqual(committed.head, initial); assert.equal(committed.history[1].oid, current.head);
  assert.equal((await a.service.inspect(a.event, '--all', bytes(model), a.token)).code, 'GIT_REVISION');
});

test('local branches have explicit guarded preview/switch and persist without publishing or rewriting commit authors', async t => {
  const { a, model, remote } = await shared(t), initial = (await a.status()).head;
  expectOK(await a.service.createBranch(a.event, 'experiment', a.token));
  assert.equal((await a.status()).localBranch, 'main'); assert.equal(await git('--git-dir', remote, 'branch', '--list'), '* main');
  const modified = structuredClone(model); modified.project.name = 'Unsaved experiment';
  const preview = expectReady(await a.service.prepareBranch(a.event, 'experiment', bytes(modified), a.token));
  assert.equal(preview.dirty, true); assert.equal((await a.status()).localBranch, 'main');
  const newer = structuredClone(modified); newer.project.name = 'A later edit';
  assert.equal((await a.service.switchBranch(a.event, preview.inspection, bytes(newer), a.token)).code, 'GIT_PLAN');
  assert.equal((await a.status()).localBranch, 'main');
  const switched = expectReady(await a.service.switchBranch(a.event, preview.inspection, bytes(modified), a.token));
  assert.deepEqual(exportFiles(deserializeProjectFile(switched.bytes)), exportFiles(model));
  assert.equal((await a.status()).attached, false); expectOK(await a.service.adopt(a.event, switched.candidate, a.token));
  const saved = expectOK(await a.commit(modified, 'Local experiment')); assert.equal(saved.localBranch, 'experiment');
  assert.equal(saved.openRevision, saved.head); assert.equal(saved.target.branch, 'main'); assert.equal(await git('--git-dir', remote, 'rev-parse', 'main'), initial);
  assert.deepEqual(saved.branches.map(item => [item.name, item.oid]), [['experiment', saved.head], ['main', initial]]);
  const back = expectReady(await a.service.prepareBranch(a.event, 'main', bytes(modified), a.token));
  const reopened = expectReady(await a.service.switchBranch(a.event, back.inspection, bytes(modified), a.token)); expectOK(await a.service.adopt(a.event, reopened.candidate, a.token));
  assert.equal((await a.status()).head, initial); assert.equal((await a.status()).history[0].author, 'Arkita Tester');
  const restarted = createGitService({ window: a.window, storagePath: a.storagePath, gitPath: executable });
  assert.equal(expectOK(await restarted.status(a.event, bytes(model), randomUUID())).localBranch, 'main');
  for (const name of ['../evil', '-main', 'a.lock', 'x/y']) assert.equal((await a.service.createBranch(a.event, name, a.token)).code, 'GIT_NAME');
  assert.equal((await a.service.createBranch(a.event, 'main', a.token)).code, 'GIT_EXISTS');
});

test('model milestones create, publish, inspect and delete locally as separate actions; other clients discover server refs', async t => {
  const { a, b, model, remote } = await shared(t), head = (await a.status()).head;
  const created = expectOK(await a.service.createMilestone(a.event, 'review-1', head, a.token));
  assert.deepEqual(created.milestones, [{ name: 'review-1', oid: head, remoteOid: null }]); assert.equal(await git('--git-dir', remote, 'tag'), '');
  assert.equal((await a.service.createMilestone(a.event, 'review-1', head, a.token)).code, 'GIT_EXISTS');
  expectOK(await a.service.publishMilestone(a.event, 'review-1', head, a.token));
  const tag = await git('--git-dir', remote, 'tag'); assert.match(tag, /^arkita\/[a-f0-9]{16}\/review-1$/);
  expectReady(await b.receive(model)); const discovered = expectOK(await b.status()).milestones;
  assert.deepEqual(discovered, [{ name: 'review-1', oid: null, remoteOid: head }]);
  const view = expectReady(await b.service.inspect(b.event, head, bytes(model), b.token)); assert.equal(view.oid, head);
  expectOK(await a.service.deleteMilestone(a.event, 'review-1', head, a.token));
  assert.deepEqual((await a.status()).milestones, [{ name: 'review-1', oid: null, remoteOid: head }]); assert.equal(await git('--git-dir', remote, 'tag'), tag);
  const newer = structuredClone(model); newer.project.name = 'Newer'; const next = expectOK(await a.commit(newer));
  expectOK(await a.service.createMilestone(a.event, 'review-1', next.head, a.token));
  assert.equal((await a.service.publishMilestone(a.event, 'review-1', next.head, a.token)).code, 'GIT_PUSH');
  assert.equal(await git('--git-dir', remote, 'rev-parse', tag), head);
  assert.equal((await a.service.deleteMilestone(a.event, 'review-1', head, a.token)).code, 'GIT_PLAN');
  assert.equal((await a.status()).milestones[0].oid, next.head);
});

test('conflict preview includes exact three versions, readable IDs and affected relationships/views; all-remote records still validate', async t => {
  const { a, b, model } = await shared(t), local = structuredClone(model), server = structuredClone(model);
  local.elements[0].documentation = 'Local metadata'; server.elements[0].documentation = 'Remote metadata';
  local.elements[1].name = 'Local second'; server.elements[1].name = 'Remote second';
  expectOK(await a.commit(local)); expectOK(await b.commit(server)); expectOK(await b.push());
  const preview = expectReady(await a.receive(local)); assert.equal(preview.conflicts.length, 2);
  const first = preview.conflicts.find(item => item.context.base.id === model.elements[0].id);
  for (const side of ['base', 'local', 'remote']) {
    assert.ok(first.context[side].relationships.length); assert.equal(first.context[side].views[0].id, model.views[0].view.id);
    assert.equal(JSON.parse(first[side]).id, model.elements[0].id);
  }
  assert.ok(first.localChanges.some(field => field.field === 'documentation'));
  const merged = await a.apply(preview.plan, { records: Object.fromEntries(preview.conflicts.map(item => [item.path, 'remote'])) });
  assert.equal(merged.elements[0].documentation, 'Remote metadata'); assert.equal(merged.elements[1].name, 'Remote second');
});

test('inspection/branch plans are invalid after document changes; new endpoints enforce exact sender and busy guards', async t => {
  const { a, model } = await shared(t), head = (await a.status()).head;
  const inspect = expectReady(await a.service.inspect(a.event, head, bytes(model), a.token));
  expectOK(a.service.documentChanged(a.event, a.token, randomUUID()));
  assert.equal((await a.service.restore(a.event, inspect.inspection, bytes(model), a.token)).code, 'GIT_SESSION');
  const bad = { ...a.event, senderFrame: {} };
  for (const method of ['inspect', 'restore', 'createBranch', 'prepareBranch', 'switchBranch', 'createMilestone', 'publishMilestone', 'deleteMilestone']) assert.equal((await a.service[method](bad)).code, 'IPC_SENDER', method);
});


test('receive plan rejects another window switching the shared repository to a branch at the same HEAD', async t => {
  const { a, b, model } = await shared(t), original = (await a.status()).head;
  expectOK(await a.service.createBranch(a.event, 'experiment', a.token));
  const server = structuredClone(model); server.project.name = 'Received on main';
  expectOK(await b.commit(server)); expectOK(await b.push());
  const pending = expectReady(await a.receive(model));
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }, token = randomUUID();
  const second = createGitService({ window, storagePath: a.storagePath, gitPath: executable });
  expectOK(await second.status(event, undefined, token));
  const opened = expectReady(await second.open(event, token)); expectOK(await second.adopt(event, opened.candidate, token));
  const switchPlan = expectReady(await second.prepareBranch(event, 'experiment', bytes(model), token));
  const switched = expectReady(await second.switchBranch(event, switchPlan.inspection, bytes(model), token));
  expectOK(await second.adopt(event, switched.candidate, token));
  assert.equal((await a.status()).head, original);
  const before = (await a.status()).branches;
  assert.equal((await a.service.apply(a.event, pending.plan, {}, a.token)).code, 'GIT_PLAN');
  const after = await a.status();
  assert.equal(after.localBranch, 'experiment'); assert.equal(after.head, original);
  assert.deepEqual(after.branches, before);
  assert.deepEqual(after.branches.map(({ name, oid }) => [name, oid]), [['experiment', original], ['main', original]]);
});
