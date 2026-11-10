import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { createNetworkPolicy, validateNetworkPolicy } from '../git-network-policy.mjs';
import { createHostActions, externalURL } from '../host-actions.mjs';
import { discoverGit, gitCommand, openGitRepository } from '../git-repository.mjs';
import { createFileService } from '../file-service.mjs';
import { APP_URL } from '../boundary.mjs';
const target = 'https://git.example.invalid/team/repo.git';
async function temp(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-host-policy-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
test('proxy policy is closed, credential-free, precise per connection and overrides effective Git URL proxy without changing config', async t => {
 const root = await temp(t), policy = createNetworkPolicy(root, target), git = await discoverGit();
 for (const proxy of ['http://user:password@proxy:8080', 'file:///tmp/proxy', 'http://proxy/path', 'http://proxy?secret=x', 'http://proxy#x', 'http://proxy\n']) assert.throws(() => validateNetworkPolicy({ mode: 'manual', proxy, authorization: true }, target));
 assert.throws(() => validateNetworkPolicy({ mode: 'manual', proxy: 'http://proxy:80', authorization: true }, 'ssh://git@example/repo'));
 assert.deepEqual(await policy.options(), {}); await policy.set({ mode: 'manual', proxy: 'http://localhost:8171', authorization: true });
 const options = await policy.options(); assert.equal(options.removeProxyEnvironment, true); const before = await fs.readFile(path.join(root, 'arkita-network.json'));
 const read = await gitCommand(git, '', ['config', '--get-urlmatch', 'http.proxy', target], options); assert.equal(read.stdout.toString().trim(), 'http://localhost:8171'); assert.deepEqual(await fs.readFile(path.join(root, 'arkita-network.json')), before);
 await policy.set({ mode: 'direct', proxy: '', authorization: true }); assert.equal((await gitCommand(git, '', ['config', '--get-urlmatch', 'http.proxy', target], await policy.options())).stdout.toString().trim(), '');
 await fs.unlink(path.join(root, 'arkita-network.json')); await fs.symlink('/dev/null', path.join(root, 'arkita-network.json')); await assert.rejects(policy.get(), { code: 'GIT_STORAGE' });
});
test('disable authorization blocks every remote command across two windows but leaves exact local model/history and another target usable', async t => {
 const root = await temp(t), git = await discoverGit(), remote = path.join(root, 'remote.git'); await fs.mkdir(remote); await gitCommand(git, remote, ['init', '--bare', '--template=', remote]);
 const a = await openGitRepository(root, { remote }, git), b = await openGitRepository(root, { remote }, git), other = await openGitRepository(root, { remote, directory: 'another' }, git);
 assert.equal(await a.fetch(), null); await a.networkPolicy.set({ mode: 'system', proxy: '', authorization: false });
 for (const repo of [a, b]) for (const args of [['ls-remote', remote], ['fetch', remote], ['push', remote]]) await assert.rejects(repo.run(args), { code: 'GIT_AUTH_DISABLED' });
 assert.equal(await b.ref('refs/heads/arkita'), null); assert.equal(await other.fetch(), null); await b.networkPolicy.set({ mode: 'system', proxy: '', authorization: true }); assert.equal(await a.fetch(), null);
});
test('external links require explicit native confirmation and same token; Windows credential launcher has no caller command or credential access', async () => {
 let response = 0, opened = [], current = true, resolve; const actions = createHostActions({ dialog: { showMessageBox: async () => ({ response }) }, shell: { openExternal: async url => opened.push(url) } });
 for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/a', 'https://name:secret@host/', 'https://host/\n']) assert.throws(() => externalURL(url));
 assert.equal((await actions.openExternal({}, 'https://example.org/', () => { if (!current) throw Error('stale'); })).status, 'cancelled'); assert.equal(opened.length, 0); response = 1; await actions.openExternal({}, 'https://example.org/', () => {}); assert.equal(opened.length, 1);
 const pending = createHostActions({ dialog: { showMessageBox: () => new Promise(done => resolve = done) }, shell: { openExternal: async url => opened.push(url) } }).openExternal({}, 'https://example.org/', () => { if (!current) throw Error('stale'); }); current = false; resolve({ response: 1 }); await assert.rejects(pending, /stale/); assert.equal(opened.length, 1);
 const calls = []; const launch = createHostActions({ platform: 'win32', spawn: (...args) => { calls.push(args); const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child; } }); assert.equal((await launch.credentialManager('evil command')).status, 'opened'); assert.match(calls[0][0], /System32\\control.exe$/); assert.deepEqual(calls[0][1], ['/name', 'Microsoft.CredentialManager']); assert.equal(calls[0][2].shell, false);
});
test('local file links require a native confirmation and an existing local file before Windows opens it', async t => {
 const root = await temp(t), target = path.join(root, 'Guide and reference.pdf'); await fs.writeFile(target, 'guide');
 const prompts = [], opened = []; let response = 0;
 const actions = createHostActions({
  dialog: { showMessageBox: async (_window, options) => { prompts.push(options); return { response }; } },
  shell: { openPath: async file => { opened.push(file); return ''; } },
 });
 const url = pathToFileURL(target).href;
 assert.equal((await actions.openFileLink({}, url, () => {})).status, 'cancelled'); assert.equal(opened.length, 0);
 assert.equal(prompts[0].defaultId, 0); assert.equal(prompts[0].cancelId, 0); assert.match(prompts[0].detail, /Guide and reference\.pdf/);
 response = 1;
 assert.equal((await actions.openFileLink({}, url, () => {})).status, 'opened');
 assert.deepEqual(opened, [await fs.realpath(target)]);
 await assert.rejects(actions.openFileLink({}, 'https://example.org/', () => {}), { code: 'FILE_LINK_URL' });
 await assert.rejects(actions.openFileLink({}, 'file://remote.example/share/guide.pdf', () => {}), { code: 'FILE_LINK_URL' });
 await assert.rejects(actions.openFileLink({}, 'file:////server/share/guide.pdf', () => {}), { code: 'FILE_LINK_URL' });
 await assert.rejects(actions.openFileLink({}, pathToFileURL(path.join(root, 'missing.pdf')).href, () => {}), { code: 'FILE_LINK_MISSING' });
 await assert.rejects(actions.openFileLink({}, pathToFileURL(root).href, () => {}), { code: 'FILE_LINK_MISSING' });
 const noHandler = createHostActions({ dialog: { showMessageBox: async () => ({ response: 1 }) }, shell: { openPath: async () => 'No Windows association' } });
 await assert.rejects(noHandler.openFileLink({}, url, () => {}), { code: 'FILE_LINK_HANDLER' });
 const changing = path.join(root, 'changing.pdf'); await fs.writeFile(changing, 'guide'); let changedOpen = false;
 const removedAfterPrompt = createHostActions({ dialog: { showMessageBox: async () => { await fs.unlink(changing); return { response: 1 }; } }, shell: { openPath: async () => { changedOpen = true; return ''; } } });
 await assert.rejects(removedAfterPrompt.openFileLink({}, pathToFileURL(changing).href, () => {}), { code: 'FILE_LINK_MISSING' }); assert.equal(changedOpen, false);
 assert.equal(opened.length, 1);
});
test('print/pdf/outline/host boundaries reject foreign and old document tokens before delivery', async () => {
 const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }, first = randomUUID(), next = randomUUID(); let prints = 0, links = 0, fileLinks = 0;
 const service = createFileService({ window, dialog: {}, printDocument: async () => { prints++; return { status: 'printed' }; }, hostActions: { openExternal: async () => { links++; return { status: 'opened' }; }, openFileLink: async (_window, _url, current) => { current(); fileLinks++; return { status: 'opened' }; } } });
 assert.equal((await service.printView(event, '<svg/>', {}, first)).status, 'printed');
 assert.equal((await service.openFileLink(event, 'file:///C:/guide.pdf', first)).status, 'opened');
 assert.equal(service.documentChanged(event, first, next).status, 'detached');
 assert.equal((await service.openFileLink(event, 'file:///C:/guide.pdf', next)).status, 'opened');
 assert.equal((await service.printView(event, '<svg/>', {}, first)).status, 'error'); assert.equal((await service.savePdf(event, '<svg/>', 'Title', {}, first)).status, 'error'); assert.equal((await service.openExternalLink(event, 'https://example.org', first)).status, 'error'); assert.equal((await service.openFileLink(event, 'file:///C:/guide.pdf', first)).status, 'error'); assert.equal((await service.outlineText(event, [], first)).status, 'error'); assert.equal(prints, 1); assert.equal(links, 0); assert.equal(fileLinks, 2);
 assert.equal((await service.openFileLink({ sender: {} }, 'file:///C:/guide.pdf', next)).code, 'IPC_SENDER'); assert.equal((await service.printView(event, '<svg/>', {})).status, 'error'); assert.equal(fileLinks, 2);
});
