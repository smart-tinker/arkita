import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { APP_URL } from '../boundary.mjs';
import { createFileService } from '../file-service.mjs';
import { installWindowGuards } from '../window-guards.mjs';
import { createProject } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const main = process.env.SCHEMKA_STARTUP_MAIN || fileURLToPath(new URL('../main.mjs', import.meta.url));
const harness = fileURLToPath(new URL('./helpers/startup-harness.mjs', import.meta.url));
for (const [scenario, description] of [
  ['ready', 'entry evaluation settles before ready, then creates one fully guarded local window'],
  ['launch-file', 'cold association opens one Unicode model window; warm opens preserve it and deduplicate'],
  ['launch-file-dev', 'development argv opens the model without an extra blank window'],
  ['launch-multiple', 'cold launch opens distinct valid files once and reports each invalid file'],
  ['launch-pre-ready', 'pre-ready open-file and second-instance requests retain their paths and cwd'],
  ['launch-during-drain', 'requests arriving during initial reads are drained before any blank fallback'],
  ['launch-invalid', 'an invalid-only launch reports failures and leaves one usable blank window'],
  ['lock-lost', 'single-instance loser quits without scheduling startup'],
  ['assets-fail', 'asset setup rejection is reported and exits nonzero'],
  ['load-fails', 'loadURL rejection is reported and exits nonzero'],
  ['ready-fails', 'readiness rejection is reported and exits nonzero'],
  ['dialog-fails', 'a failed error dialog still reports the failure and exits nonzero'],
]) {
  test(description, () => {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--unhandled-rejections=strict', harness, main, scenario], {
      encoding: 'utf8', timeout: 10_000,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.ifError(result.error);
    assert.equal(result.signal, null, output);
    assert.equal(result.status, 0, output);
  });
}

test('cancel and save-close on one model keep another model session usable', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-startup-close-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = ['first.arkita', 'second.arkita'].map(name => path.join(root, name));
  const models = [createProject('First'), createProject('Second')];
  const original = models.map(model => Buffer.from(serializeProjectFile(model)));
  await Promise.all(paths.map((file, i) => fs.writeFile(file, original[i])));
  const makeWindow = () => {
    const webContents = new EventEmitter();
    webContents.mainFrame = { url: APP_URL };
    webContents.setWindowOpenHandler = () => {};
    webContents.send = (channel, request) => webContents.emit(channel, request);
    const window = new EventEmitter(); let closed = false, dirty = false;
    Object.assign(window, { webContents, isDestroyed: () => closed, wasClosed: () => closed, setDirty: value => { dirty = value; },
      close: () => {
        let prevented = false; window.emit('close', { preventDefault() { prevented = true; } });
        if (prevented) return false;
        if (dirty) { const unload = { accepted: false, preventDefault() { this.accepted = true; } }; webContents.emit('will-prevent-unload', unload); if (!unload.accepted) return false; }
        closed = true; return true;
      } });
    return window;
  };
  const windows = [makeWindow(), makeWindow()], selected = new Map(windows.map((window, i) => [window, paths[i]]));
  let choice = 0; const prompts = [];
  const dialog = { showOpenDialog: async window => ({ canceled: false, filePaths: [selected.get(window)] }),
    showMessageBoxSync: (_window, options) => { prompts.push(options); return choice; } };
  const sessions = windows.map(window => ({ window, service: createFileService({ window, dialog }),
    event: { sender: window.webContents, senderFrame: window.webContents.mainFrame }, token: randomUUID() }));
  for (const session of sessions) {
    const opened = await session.service.open(session.event, session.token);
    assert.equal(opened.status, 'opened');
    const previous = session.token; session.token = randomUUID();
    assert.equal(session.service.documentChanged(session.event, previous, session.token, opened.candidate).status, 'bound');
  }
  assert.notEqual(sessions[0].token, sessions[1].token);
  const closeRequests = [];
  windows[0].webContents.on('schemka:save-and-close', request => closeRequests.push(request));
  installWindowGuards(windows[0], dialog, { get busy() { return sessions[0].service.busy; },
    get hasDirectoryIssue() { return sessions[0].service.hasDirectoryIssue; },
    requestSaveClose() { windows[0].webContents.send('schemka:save-and-close', randomUUID()); } });

  models[0].project.name = 'First edited';
  const firstEdit = Buffer.from(serializeProjectFile(models[0]));
  assert.notDeepEqual(firstEdit, original[0]);
  windows[0].setDirty(true);
  assert.equal(windows[0].close(), false);
  assert.deepEqual(prompts[0].buttons, ['Остаться', 'Сохранить и закрыть', 'Закрыть без сохранения']);
  assert.equal(prompts[0].cancelId, 0);
  assert.equal(closeRequests.length, 0);
  assert.equal(windows[0].wasClosed(), false);
  assert.deepEqual(await fs.readFile(paths[0]), original[0]);

  choice = 1;
  assert.equal(windows[0].close(), false);
  assert.equal(closeRequests.length, 1);
  assert.match(closeRequests[0], /^[0-9a-f-]{36}$/i);
  const savedFirst = await sessions[0].service.saveCurrentProject(sessions[0].event, firstEdit, sessions[0].token);
  assert.equal(savedFirst.status, 'saved');
  assert.deepEqual(await fs.readFile(paths[0]), firstEdit);
  windows[0].setDirty(false);
  assert.equal(windows[0].close(), true);
  assert.equal(windows[0].wasClosed(), true);

  assert.equal(sessions[1].service.documentToken, sessions[1].token);
  assert.equal((await sessions[1].service.documentLocation(sessions[1].event, sessions[1].token)).path, paths[1]);
  assert.deepEqual(await fs.readFile(paths[1]), original[1]);
  const secondEdit = Buffer.from(serializeProjectFile(createProject('Second edited')));
  assert.equal((await sessions[1].service.saveCurrentProject(sessions[1].event, secondEdit, sessions[1].token)).status, 'saved');
  assert.deepEqual(await fs.readFile(paths[1]), secondEdit);
  assert.equal(windows[1].wasClosed(), false);
});
