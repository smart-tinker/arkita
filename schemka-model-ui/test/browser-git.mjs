import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { APP_URL } from '../../electron/boundary.mjs';
import { createGitService } from '../../electron/git-service.mjs';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-browser-git-'));
const screenshots = process.env.SCHEMKA_SCREENSHOTS || path.join(temporary, 'screenshots');
const remote = path.join(temporary, 'remote.git');
const gitPath = '/usr/bin/git';
const errors = [], checks = [];
let browser, lastBytes, documentChanges = 0;
const server = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
});
function client(name) {
  const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } };
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  return { service: createGitService({ window, storagePath: path.join(temporary, name), gitPath }), event };
}
const alice = client('alice'), bob = client('bob');
const target = { remote, branch: 'main', directory: 'arkita', authorName: 'Arkita Browser Test', authorEmail: 'browser@example.invalid' };
const ok = result => { assert.equal(result.status, 'ok', JSON.stringify(result)); return result; };
const ready = result => { assert.equal(result.status, 'ready', JSON.stringify(result)); return result; };
try {
  execFileSync(gitPath, ['init', '--bare', '--template=', '--initial-branch=main', remote], { stdio: 'ignore' });
  const url = await new Promise((resolve, reject) => {
    let text = '';
    server.stdout.on('data', bytes => { text += bytes; const match = text.match(/http:\/\/127\.0\.0\.1:\d+\/schemka-model-ui\/index.html/); if (match) resolve(match[0]); });
    server.on('error', reject); server.on('exit', code => reject(Error(`Preview exited ${code}`)));
  });
  await fs.mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.exposeFunction('arkitaGitTest', async (method, args) => {
    if (['status', 'commit', 'receive'].includes(method) && args[0]) { args[0] = Uint8Array.from(args[0]); lastBytes = args[0].slice(); }
    if (method === 'documentChanged') {
      documentChanges++; ok(alice.service.documentChanged(alice.event, args[0], args[1]));
      return { status: 'detached', directory: { generation: documentChanges, binding: null, file: null, issues: [] } };
    }
    const result = await alice.service[method](alice.event, ...args);
    return result.bytes ? { ...result, bytes: Array.from(result.bytes) } : result;
  });
  await page.addInitScript(() => {
    const call = async (method, ...args) => {
      if (args[0] instanceof Uint8Array) args[0] = Array.from(args[0]);
      const result = await window.arkitaGitTest(method, args);
      if (result.bytes) result.bytes = Uint8Array.from(result.bytes);
      return result;
    };
    window.schemkaDesktop = {
      getAppInfo: async () => ({ status: 'ok', version: 'Git browser acceptance' }),
      documentChanged: (...args) => call('documentChanged', ...args),
      ...Object.fromEntries(['status', 'connect', 'open', 'adopt', 'commit', 'push', 'receive', 'apply', 'disconnect']
        .map(method => [`git${method[0].toUpperCase()}${method.slice(1)}`, (...args) => call(method, ...args)])),
    };
  });
  await page.goto(url);
  const settled = () => page.waitForFunction(() => document.getElementById('git-dialog').getAttribute('aria-busy') === 'false');
  async function openGit() {
    await page.getByText('Дополнительно', { exact: true }).click();
    await page.locator('[data-command="git-button"]').click(); await settled();
  }
  async function commit(message) {
    await page.locator('#git-message').fill(message); await page.locator('#git-commit').click(); await settled();
    assert.match(await page.locator('#git-feedback').textContent(), /Версия сохранена/);
  }
  async function rename(name) {
    await page.locator('#project-name').click(); await page.locator('.inline-editor input').fill(name);
    await page.locator('.inline-editor input').press('Enter');
  }
  await openGit(); await page.screenshot({ path: path.join(screenshots, '01-connect.png') });
  await page.locator('#git-remote').fill(remote);
  if (!await page.locator('#git-author').evaluate(node => node.open)) await page.locator('#git-author > summary').click();
  await page.locator('#git-author-name').fill(target.authorName); await page.locator('#git-author-email').fill(target.authorEmail);
  await page.locator('#git-connect').click(); await settled();
  assert.match(await page.locator('#git-feedback').textContent(), /подключён/);
  await commit('Initial model'); await page.locator('#git-push').click(); await settled();
  assert.match(await page.locator('#git-feedback').textContent(), /отправлены/);
  checks.push('connect, local version and push through real Git');

  const token = randomUUID(); ok(await bob.service.connect(bob.event, target));
  const opened = ready(await bob.service.open(bob.event, token)); ok(await bob.service.adopt(bob.event, opened.candidate, token));
  let bobState = deserializeProjectFile(opened.bytes);
  const originalView = bobState.views[0].view.name;
  await page.locator('#git-close').click(); await rename('Alice local model'); await openGit(); await commit('Alice model name');
  bobState.views[0].view.name = 'Bob remote view';
  ok(await bob.service.commit(bob.event, serializeProjectFile(bobState), token, 'Bob view name')); ok(await bob.service.push(bob.event, token));
  await page.locator('#git-receive').click(); await settled();
  assert.equal(await page.locator('#git-conflicts fieldset').count(), 0);
  await page.screenshot({ path: path.join(screenshots, '02-receive.png') });
  await page.locator('#git-apply').click(); await settled();
  let merged = deserializeProjectFile(lastBytes);
  assert.equal(merged.project.name, 'Alice local model'); assert.equal(merged.views[0].view.name, 'Bob remote view');
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'true');
  checks.push('independent records merge; local file remains dirty');
  await page.locator('#git-close').click(); await page.locator('#undo').click(); await openGit();
  assert.equal(deserializeProjectFile(lastBytes).views[0].view.name, originalView);
  await page.locator('#git-close').click(); await page.locator('#redo').click(); await openGit();
  assert.equal(deserializeProjectFile(lastBytes).views[0].view.name, 'Bob remote view');
  checks.push('received snapshot is one undo/redo operation');
  await page.locator('#git-push').click(); await settled();
  const receive = ready(await bob.service.receive(bob.event, serializeProjectFile(bobState), token));
  const apply = ready(await bob.service.apply(bob.event, receive.plan, { records: {} }, token));
  bobState = deserializeProjectFile(apply.bytes); ok(await bob.service.adopt(bob.event, apply.candidate, token));

  await page.locator('#git-close').click(); await rename('Alice conflicting name'); await openGit(); await commit('Alice conflicting rename');
  bobState.project.name = 'Bob chosen name';
  ok(await bob.service.commit(bob.event, serializeProjectFile(bobState), token, 'Bob conflicting rename')); ok(await bob.service.push(bob.event, token));
  await page.locator('#git-push').click(); await settled();
  assert.match(await page.locator('#git-feedback').textContent(), /не подтверждена/);
  await page.locator('#git-receive').click(); await settled();
  assert.equal(await page.locator('#git-conflicts fieldset').count(), 1); assert.equal(await page.locator('#git-apply').isDisabled(), true);
  assert.ok((await page.locator('#git-conflicts input').first().boundingBox()).width < 30, 'radio must not inherit full-width text-input layout');
  await page.locator('#git-conflicts details > summary').click();
  await page.screenshot({ path: path.join(screenshots, '03-conflict.png') });
  await page.locator('#git-conflicts input[value="remote"]').check(); await page.locator('#git-apply').click(); await settled();
  assert.equal(deserializeProjectFile(lastBytes).project.name, 'Bob chosen name');
  await page.locator('#git-push').click(); await settled();
  checks.push('non-fast-forward rejected; explicit conflict resolution and successful retry');

  await page.locator('#git-open').click();
  await page.locator('#replace-project').waitFor({ state: 'visible' });
  await page.locator('#cancel-load').click(); assert.equal(documentChanges, 0);
  await page.locator('#file-dialog [data-close]').click(); await openGit(); await page.locator('#git-open').click();
  await page.locator('#load-project').click(); await page.locator('#file-dialog').waitFor({ state: 'hidden' });
  assert.equal(documentChanges, 1); assert.equal(await page.locator('#project-name').textContent(), 'Bob chosen name');
  checks.push('Git Open requires confirmation; cancel preserves model and confirmed open detaches file');
  await openGit(); await page.locator('#git-history-details > summary').click();
  assert.ok(await page.locator('#git-history li').count() >= 5);
  await page.screenshot({ path: path.join(screenshots, '04-history.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(screenshots, '05-narrow.png') });
  checks.push('history, modal layout and narrow viewport');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors, screenshots }, null, 2));
} finally {
  await browser?.close(); server.kill(); await fs.rm(temporary, { recursive: true, force: true });
}
