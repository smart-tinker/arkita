import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
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
test('print/pdf/outline/host boundaries reject foreign and old document tokens before delivery', async () => {
 const window = { isDestroyed: () => false, webContents: { mainFrame: { url: APP_URL } } }, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }, first = randomUUID(), next = randomUUID(); let prints = 0, links = 0;
 const service = createFileService({ window, dialog: {}, printDocument: async () => { prints++; return { status: 'printed' }; }, hostActions: { openExternal: async () => { links++; return { status: 'opened' }; } } });
 assert.equal((await service.printView(event, '<svg/>', {}, first)).status, 'printed'); assert.equal(service.documentChanged(event, first, next).status, 'detached');
 assert.equal((await service.printView(event, '<svg/>', {}, first)).status, 'error'); assert.equal((await service.savePdf(event, '<svg/>', 'Title', {}, first)).status, 'error'); assert.equal((await service.openExternalLink(event, 'https://example.org', first)).status, 'error'); assert.equal((await service.outlineText(event, [], first)).status, 'error'); assert.equal(prints, 1); assert.equal(links, 0);
 assert.equal((await service.openExternalLink({ sender: {} }, 'https://example.org', next)).code, 'IPC_SENDER'); assert.equal((await service.printView(event, '<svg/>', {})).status, 'error');
});
