import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { APP_URL } from '../boundary.mjs';
import { createFileService } from '../file-service.mjs';
import { createNativeDirectory, readNativeDirectory, INCOMPLETE_MARKER } from '../native-directory.mjs';
import { updateNativeDirectory } from '../directory-update.mjs';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function fixture(t, options = {}) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-service-test-')); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  let selected = parent, savedFile = path.join(parent, 'rescue.schemka.json'); const errors = [];
  const service = createFileService({ window, dialog: { showOpenDialog: async () => ({ canceled: selected === null, filePaths: selected ? [selected] : [] }), showSaveDialog: async () => ({ canceled: savedFile === null, filePath: savedFile }), showErrorBox: (...args) => errors.push(args) }, ...options });
  const state = createProject('A'), token = randomUUID(), saved = await service.saveDirectory(event, serializeProjectFile(state), token);
  assert.equal(saved.status, 'saved'); assert.equal(saved.directory.binding, null); assert.equal('snapshot' in saved, false);
  const committed = service.documentChanged(event, token, token, saved.candidate); assert.equal(committed.status, 'bound');
  return { parent, root: path.join(parent, saved.name), service, window, event, state, token, errors, select(value) { selected = value; }, saveAt(value) { savedFile = value; } };
}

test('main binds only acknowledged committed documents: select/cancel B then save A never writes B; New and envelope load detach', async t => {
  const f = await fixture(t), b = createProject('B'), bsaved = await createNativeDirectory(f.parent, serializeProjectFile(b)), rootB = path.join(f.parent, bsaved.name);
  f.select(rootB); const selected = await f.service.openDirectory(f.event, f.token); assert.equal(selected.status, 'opened'); assert.equal(selected.directory.binding.name, path.basename(f.root)); assert.equal('snapshot' in selected, false);
  f.state.project.name = 'A edited'; assert.equal((await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), f.token)).status, 'saved');
  assert.equal((await readNativeDirectory(rootB)).snapshot.state.project.name, 'B'); assert.equal((await readNativeDirectory(f.root)).snapshot.state.project.name, 'A edited');
  f.select(null); assert.equal((await f.service.openDirectory(f.event, f.token)).status, 'cancelled');
  const newer = randomUUID(); assert.equal(f.service.documentChanged(f.event, f.token, newer).status, 'detached');
  assert.equal((await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), newer)).code, 'DIRECTORY_SESSION');
  assert.equal(f.service.documentChanged(f.event, newer, randomUUID(), selected.candidate).status, 'error');
});

test('a late fresh-directory completion cannot bind a newer document; disk still contains its captured snapshot', async t => {
  const wait = deferred(); let hold = false;
  const f = await fixture(t, { writeDirectory: async (...args) => { const result = await createNativeDirectory(...args); if (hold) await wait.promise; return result; } });
  hold = true; const saving = f.service.saveDirectory(f.event, serializeProjectFile(f.state), f.token); await new Promise(r => setTimeout(r, 30));
  const newer = randomUUID(); assert.equal(f.service.documentChanged(f.event, f.token, newer).status, 'detached');
  wait.resolve(); const result = await saving; assert.equal(result.status, 'saved'); assert.equal(result.candidate, null); assert.equal(result.directory.binding, null);
  assert.equal((await readNativeDirectory(path.join(f.parent, result.name))).snapshot.state.project.name, 'A');
});

test('invalid/stale candidates fail closed, sender cannot read root state, and all directory actions share the existing busy guard', async t => {
  const f = await fixture(t), invalid = path.join(f.parent, 'invalid'); await fs.mkdir(invalid); f.select(invalid);
  assert.equal((await f.service.openDirectory(f.event, f.token)).status, 'error');
  const denied = await f.service.openDirectory({ ...f.event, sender: {} }, f.token); assert.deepEqual(denied, { status: 'error', message: 'Недопустимый источник запроса.', code: 'IPC_SENDER' });
  assert.equal(f.service.documentChanged(f.event, f.token, f.token, randomUUID()).status, 'error');
  assert.equal((await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), f.token)).status, 'error');
  const wait = deferred(), g = await fixture(t, { updateDirectory: async () => wait.promise });
  const save = g.service.saveBoundDirectory(g.event, serializeProjectFile(g.state), g.token);
  assert.equal((await g.service.openDirectory(g.event, g.token)).code, 'FILE_BUSY');
  wait.resolve({ snapshot: (await readNativeDirectory(g.root)).snapshot }); assert.equal((await save).status, 'saved'); assert.equal(g.service.busy, false);
});

test('root quarantine retains rescue export and fresh Save As, refuses unsafe destinations, and never hides the old recovery notice', async t => {
  const f = await fixture(t, { updateDirectory: (snapshot, bytes) => updateNativeDirectory(snapshot, bytes, { ...fs, rename: async () => { throw Object.assign(Error('interrupted'), { code: 'EIO' }); } }) });
  f.state.project.name = 'After'; const failed = await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), f.token);
  assert.equal(failed.status, 'error'); assert.equal(failed.directory.issues[0].status, 'recovery-required'); assert.equal(f.service.busy, false);
  const issue = failed.directory.issues[0]; f.saveAt(path.join(f.root, 'rescue.schemka.json'));
  assert.equal((await f.service.saveProject(f.event, serializeProjectFile(f.state))).code, 'DIRECTORY_QUARANTINED');
  f.saveAt(path.join(f.parent, 'rescue.schemka.json')); assert.equal((await f.service.saveProject(f.event, serializeProjectFile(f.state))).status, 'saved');
  f.select(f.root); assert.equal((await f.service.saveDirectory(f.event, serializeProjectFile(f.state), f.token)).code, 'DIRECTORY_QUARANTINED');
  const tx = (await fs.readdir(f.parent)).find(n => n.startsWith('.schemka-transaction-')); f.select(path.join(f.parent, tx));
  assert.equal((await f.service.saveDirectory(f.event, serializeProjectFile(f.state), f.token)).code, 'DIRECTORY_RESERVED');
  f.select(f.parent); const rescued = await f.service.saveDirectory(f.event, serializeProjectFile(f.state), f.token); assert.equal(rescued.status, 'saved');
  const bound = f.service.documentChanged(f.event, f.token, f.token, rescued.candidate); assert.equal(bound.directory.issues.length, 1); assert.equal(bound.directory.binding.blocked, false);
  const recovered = await f.service.recoverDirectory(f.event, issue.id, 'before'); assert.equal(recovered.status, 'recovered'); assert.equal(recovered.boundBytes, null); assert.equal(recovered.directory.binding.name, rescued.name);
  assert.equal((await readNativeDirectory(f.root)).snapshot.state.project.name, 'A');
});

test('selected interrupted root provides explicit recovery without replacing or binding the current document', async t => {
  const f = await fixture(t), b = createProject('Interrupted B'), bsaved = await createNativeDirectory(f.parent, serializeProjectFile(b)), rootB = path.join(f.parent, bsaved.name);
  b.project.name = 'B after'; await assert.rejects(updateNativeDirectory(bsaved.snapshot, serializeProjectFile(b), { ...fs, rename: async () => { throw Error('interrupted'); } }));
  f.select(rootB); const opened = await f.service.openDirectory(f.event, f.token); assert.equal(opened.code, 'DIRECTORY_INCOMPLETE'); assert.equal(opened.directory.binding.name, path.basename(f.root));
  const result = await f.service.recoverDirectory(f.event, opened.directory.issues[0].id, 'after'); assert.equal(result.status, 'recovered'); assert.equal(result.boundBytes, null);
  assert.equal(result.directory.binding.name, path.basename(f.root)); assert.equal((await readNativeDirectory(rootB)).snapshot.state.project.name, 'B after');
});

test('failed fresh save is quarantined without update recovery, while outside file and fresh-directory rescues stay usable', async t => {
  let failWrite = false, recoveryCalls = 0;
  const f = await fixture(t, {
    writeDirectory: (parent, bytes) => createNativeDirectory(parent, bytes, { ...fs, open: async (target, ...args) => {
      if (failWrite && path.basename(target) === 'schemka.json') throw Object.assign(Error('fresh payload EIO'), { code: 'EIO' });
      return fs.open(target, ...args);
    } }),
    recoverDirectory: async () => { recoveryCalls++; throw Error('Fresh creation has no update journal'); },
  });
  f.state.project.name = 'Keep edited model'; const bytes = serializeProjectFile(f.state);
  failWrite = true; const failed = await f.service.saveDirectory(f.event, bytes, f.token); failWrite = false;
  assert.equal(failed.code, 'EIO'); assert.equal(failed.directory.binding.name, path.basename(f.root));
  assert.equal(failed.directory.binding.blocked, false); assert.equal(f.service.busy, false); assert.equal(f.service.hasDirectoryIssue, true);
  const issue = failed.directory.issues[0], incompleteRoot = path.join(f.parent, issue.name);
  assert.equal(issue.status, 'incomplete'); assert.deepEqual(await fs.readdir(incompleteRoot), [INCOMPLETE_MARKER]);
  const marker = await fs.readFile(path.join(incompleteRoot, INCOMPLETE_MARKER));
  f.select(incompleteRoot); const opened = await f.service.openDirectory(f.event, f.token);
  assert.equal(opened.code, 'DIRECTORY_INCOMPLETE'); assert.deepEqual(opened.directory.issues, [issue]);
  for (const side of ['before', 'after']) assert.equal((await f.service.recoverDirectory(f.event, issue.id, side)).code, 'DIRECTORY_RECOVERY');
  assert.equal(recoveryCalls, 0);
  f.saveAt(path.join(incompleteRoot, 'rescue.arkita'));
  assert.equal((await f.service.saveProject(f.event, bytes, f.token)).code, 'DIRECTORY_QUARANTINED');
  assert.equal((await f.service.saveDirectory(f.event, bytes, f.token)).code, 'DIRECTORY_QUARANTINED');
  const alias = path.join(f.parent, 'incomplete-alias'); await fs.symlink(incompleteRoot, alias);
  f.saveAt(path.join(alias, 'rescue.arkita'));
  assert.equal((await f.service.saveProject(f.event, bytes, f.token)).code, 'DIRECTORY_TYPE');
  const rescuedFile = path.join(f.parent, 'rescued.arkita'); f.saveAt(rescuedFile);
  const exported = await f.service.saveProject(f.event, bytes, f.token); assert.equal(exported.status, 'saved');
  const fileBound = f.service.documentChanged(f.event, f.token, f.token, exported.candidate);
  assert.equal(fileBound.status, 'bound'); assert.equal(fileBound.directory.file.blocked, false); assert.deepEqual(fileBound.directory.issues, [issue]);
  assert.deepEqual(await fs.readFile(rescuedFile), Buffer.from(bytes));
  f.select(f.parent); const rescued = await f.service.saveDirectory(f.event, bytes, f.token); assert.equal(rescued.status, 'saved');
  const bound = f.service.documentChanged(f.event, f.token, f.token, rescued.candidate);
  assert.equal(bound.directory.binding.blocked, false); assert.deepEqual(bound.directory.issues, [issue]);
  assert.equal((await readNativeDirectory(path.join(f.parent, rescued.name))).snapshot.state.project.name, 'Keep edited model');
  assert.equal((await readNativeDirectory(f.root)).snapshot.state.project.name, 'A');
  assert.deepEqual(await fs.readdir(incompleteRoot), [INCOMPLETE_MARKER]);
  assert.deepEqual(await fs.readFile(path.join(incompleteRoot, INCOMPLETE_MARKER)), marker);
  assert.equal(f.errors.length, 1); assert.equal(f.errors[0][0], 'Каталог не сохранён');
});

test('fresh marker found during bound save blocks that root without enabling update recovery', async t => {
  const f = await fixture(t), file = path.join(f.root, 'schemka.json'), before = await fs.readFile(file);
  const marker = path.join(f.root, INCOMPLETE_MARKER.toUpperCase()); await fs.writeFile(marker, 'malformed');
  f.state.project.name = 'Still in memory';
  const failed = await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), f.token);
  assert.equal(failed.code, 'DIRECTORY_INCOMPLETE'); assert.equal(failed.directory.issues[0].status, 'incomplete');
  assert.equal(failed.directory.binding.blocked, true);
  assert.equal((await f.service.recoverDirectory(f.event, failed.directory.issues[0].id, 'before')).code, 'DIRECTORY_RECOVERY');
  assert.equal((await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), f.token)).code, 'DIRECTORY_QUARANTINED');
  assert.deepEqual(await fs.readFile(file), before); assert.equal(await fs.readFile(marker, 'utf8'), 'malformed');
});

test('legacy incomplete errors without marker metadata retain the existing recovery status', async t => {
  const f = await fixture(t, { readDirectory: async () => { throw Object.assign(Error('Legacy interrupted update'), { code: 'DIRECTORY_INCOMPLETE' }); } });
  f.select(f.root); const result = await f.service.openDirectory(f.event, f.token);
  assert.equal(result.code, 'DIRECTORY_INCOMPLETE'); assert.equal(result.directory.issues[0].status, 'recovery-required');
});

test('R1: envelope and Mermaid export reject root/transaction/.git symlink aliases and hardlinks without changing protected bytes or inode stamps', async t => {
  const f = await fixture(t, { updateDirectory: (snapshot, bytes) => updateNativeDirectory(snapshot, bytes, { ...fs, rename: async () => { throw Object.assign(Error('interrupted'), { code: 'EIO' }); } }) });
  f.state.project.name = 'After'; const failed = await f.service.saveBoundDirectory(f.event, serializeProjectFile(f.state), f.token); assert.equal(failed.directory.issues.length, 1);
  const tx = path.join(f.parent, (await fs.readdir(f.parent)).find(n => n.startsWith('.schemka-transaction-')));
  await fs.mkdir(path.join(f.root, '.git')); await fs.writeFile(path.join(f.root, '.git/sentinel'), 'git-original');
  const capture = async target => ({ bytes: await fs.readFile(target, 'utf8'), stat: await fs.lstat(target, { bigint: true }) });
  for (const [kind, directory, relative] of [['root', f.root, 'schemka.json'], ['transaction', tx, 'before/record-0000.json'], ['git', path.join(f.root, '.git'), 'sentinel']]) {
    const alias = path.join(f.parent, `${kind}-alias`), protectedFile = path.join(directory, relative); await fs.symlink(directory, alias);
    f.saveAt(path.join(alias, relative)); const before = await capture(protectedFile);
    for (const action of [() => f.service.saveProject(f.event, serializeProjectFile(f.state)), () => f.service.saveMermaid(f.event, 'flowchart LR')]) {
      assert.equal((await action()).code, 'DIRECTORY_TYPE'); const current = await capture(protectedFile); assert.equal(current.bytes, before.bytes);
      for (const key of ['dev', 'ino', 'ctimeNs', 'mtimeNs', 'nlink']) assert.equal(current.stat[key], before.stat[key], `${kind}/${key}`);
    }
    const hardlink = path.join(f.parent, `${kind}-hardlink`); await fs.link(protectedFile, hardlink); const linked = await capture(protectedFile); f.saveAt(hardlink);
    assert.equal((await f.service.saveProject(f.event, serializeProjectFile(f.state))).code, 'FILE_LINKS'); assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR')).code, 'FILE_LINKS');
    const current = await capture(protectedFile); assert.equal(current.bytes, linked.bytes); for (const key of ['dev', 'ino', 'ctimeNs', 'mtimeNs', 'nlink']) assert.equal(current.stat[key], linked.stat[key]);
    await fs.unlink(hardlink);
  }
  f.saveAt(path.join(f.parent, 'safe-rescue.schemka.json')); assert.equal((await f.service.saveProject(f.event, serializeProjectFile(f.state))).status, 'saved');
  assert.equal((await f.service.recoverDirectory(f.event, failed.directory.issues[0].id, 'before')).status, 'recovered');
});

test('portable reserved-directory policy folds case for .git and transaction names; this is Linux evidence, not Windows QA', async t => {
  const f = await fixture(t);
  for (const name of ['.GiT', '.ScHeMkA-TrAnSaCtIoN-synthetic']) {
    const directory = path.join(f.parent, name); await fs.mkdir(directory); await fs.writeFile(path.join(directory, 'sentinel'), 'unchanged'); f.saveAt(path.join(directory, 'sentinel'));
    assert.equal((await f.service.saveProject(f.event, serializeProjectFile(f.state))).code, 'DIRECTORY_RESERVED');
    assert.equal((await f.service.saveMermaid(f.event, 'flowchart LR')).code, 'DIRECTORY_RESERVED'); assert.equal(await fs.readFile(path.join(directory, 'sentinel'), 'utf8'), 'unchanged');
    f.select(directory); assert.equal((await f.service.saveDirectory(f.event, serializeProjectFile(f.state), f.token)).code, 'DIRECTORY_RESERVED');
  }
});
