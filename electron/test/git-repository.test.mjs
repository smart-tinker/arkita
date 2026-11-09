import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import { discoverGit, gitCommand, validateTarget, openGitRepository, LOCAL_REF, writeGitBlobs } from '../git-repository.mjs';
import { createProject, exportFiles } from '../../schemka-model-core/src/index.js';
import { largeNativeModel } from '../../schemka-model-core/fixtures/large-native-model.js';
const executable = await discoverGit(), author = { authorName: 'Tester', authorEmail: 'test@example.invalid' };
const identity = { GIT_AUTHOR_NAME: author.authorName, GIT_AUTHOR_EMAIL: author.authorEmail, GIT_COMMITTER_NAME: author.authorName, GIT_COMMITTER_EMAIL: author.authorEmail };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-git-plumbing-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git'); await fs.mkdir(remote);
  const raw = async (args, input) => (await gitCommand(executable, remote, args, { input, env: identity })).stdout.toString().trim();
  await raw(['init', '--bare', '--template=', '--initial-branch=main', remote]);
  const target = { remote, branch: 'main', directory: 'arkita', ...author };
  const repo = await openGitRepository(path.join(root, 'local'), target, executable);
  const blob = content => raw(['hash-object', '-w', '--no-filters', '--stdin'], content);
  const tree = entries => raw(['mktree', '-z'], entries.map(([mode, type, oid, name]) => `${mode} ${type} ${oid}\t${name}\0`).join(''));
  async function remoteCommit(treeOid, parents = []) { const oid = await raw(['commit-tree', treeOid, ...parents.flatMap(parent => ['-p', parent]), '-F', '-'], 'Remote change'); await raw(['update-ref', 'refs/heads/main', oid]); return oid; }
  return { root, remote, target, repo, raw, blob, tree, remoteCommit };
}

test('transport, ref and model path inputs exclude helpers, credentials and option injection', () => {
  for (const remote of ['https://github.com/team/repo.git', 'ssh://git@example.com/repo', 'git@example.com:team/repo.git', 'ssh://git@[::1]/repo', '/tmp/models.git', 'file:///tmp/models.git']) assert.equal(validateTarget({ remote }).remote, remote);
  for (const remote of ['ext::echo hi', 'git://example.com/repo', 'http://example.com/repo', 'https://token@example.com/repo', 'https://user:secret@example.com/repo', 'https://example.com/repo?token=secret', 'ssh://git:secret@example.com/repo', 'ssh://-oProxyCommand=evil/repo', 'ssh://%0aevil@example.com/repo', '--upload-pack=evil', 'foo::bar', 'relative/path']) assert.throws(() => validateTarget({ remote }), error => error.code === 'GIT_REMOTE', remote);
  for (const branch of ['-x', 'main..evil', 'a//b', 'a/.hidden', 'a.lock', 'a@{x}', 'main\nsecret', 'a/']) assert.throws(() => validateTarget({ remote: '/tmp/x', branch }), error => error.code === 'GIT_BRANCH', branch);
  for (const directory of ['../x', '.git', 'models/.git/x', '/absolute', 'a//b', 'a/..', 'CON', 'a\\b', 'x.']) assert.throws(() => validateTarget({ remote: '/tmp/x', directory }), error => error.code === 'GIT_DIRECTORY', directory);
});

test('per-record commits preserve every external tree entry exactly and expected-old refs reject stale updates', async t => {
  const f = await fixture(t), readme = await f.blob('Keep exact\r\n'), attrs = await f.blob('* filter=must-not-run\n'), nestedBlob = await f.blob('foreign nested'), foreign = await f.tree([['100644', 'blob', nestedBlob, 'value.txt']]);
  const originalTree = await f.tree([['100644', 'blob', readme, 'README.md'], ['100644', 'blob', attrs, '.gitattributes'], ['040000', 'tree', foreign, 'other']]), original = await f.remoteCommit(originalTree);
  const fetched = await f.repo.fetch(); assert.equal(fetched, original); await f.repo.update(fetched, null);
  const model = createProject('First'), head = await f.repo.commit(exportFiles(model), 'Add model', [original], original);
  for (const [name, oid] of [['README.md', readme], ['.gitattributes', attrs], ['other', foreign]]) assert.equal((await f.repo.run(['rev-parse', `${head}:${name}`])).stdout.toString().trim(), oid);
  model.project.name = 'Changed'; await assert.rejects(f.repo.commit(exportFiles(model), 'Stale write', [head], original)); assert.equal(await f.repo.ref(LOCAL_REF), head);
  assert.equal((await f.repo.files(head)).find(file => file.path === 'schemka.json').content.includes('First'), true);
  await f.repo.push(head); assert.equal(await f.raw(['rev-parse', 'main']), head);
});

test('foreign files, symbolic links, executable blobs and empty trees inside the model directory are refused', async t => {
  const f = await fixture(t), model = exportFiles(createProject('Protected')), header = await f.blob(model[0].content), extra = await f.blob('foreign'), empty = await f.tree([]);
  for (const extraEntry of [['100644', 'blob', extra, 'notes.txt'], ['120000', 'blob', extra, 'link'], ['100755', 'blob', extra, 'script'], ['040000', 'tree', empty, 'hidden']]) {
    const owned = await f.tree([['100644', 'blob', header, 'schemka.json'], extraEntry]), root = await f.tree([['040000', 'tree', owned, 'arkita']]);
    await f.remoteCommit(root); await assert.rejects(f.repo.fetch(), error => error.code === 'GIT_MODEL'); assert.equal(await f.repo.ref(LOCAL_REF), null);
  }
});

test('merge-base refuses criss-cross history rather than choosing an arbitrary ancestor', async t => {
  const f = await fixture(t), tree = await f.tree([]), commit = async parents => f.raw(['commit-tree', tree, ...parents.flatMap(parent => ['-p', parent]), '-F', '-'], `Commit ${parents.join(' ')} ${Math.random()}`);
  const base = await commit([]), left = await commit([base]), right = await commit([base]), mergeA = await commit([left, right]), mergeB = await commit([right, left]);
  await f.repo.run(['fetch', '--no-tags', '--', f.remote, mergeA, mergeB]);
  await assert.rejects(f.repo.base(mergeA, mergeB), error => error.code === 'GIT_HISTORY');
});

test('replace refs never alter model reads and arbitrary Git stderr never reaches application errors', async t => {
  const f = await fixture(t), model = createProject('Original'), head = await f.repo.commit(exportFiles(model), 'Original', [], null);
  model.project.name = 'Substitute'; const replacement = await f.repo.commit(exportFiles(model), 'Replacement', [head], head);
  await f.repo.run(['update-ref', `refs/replace/${head}`, replacement]);
  assert.match((await f.repo.files(head))[0].content, /Original/);
  await assert.rejects(f.repo.run(['show', 'secret-password-token:absent']), error => error.code === 'GIT_COMMAND' && !error.message.includes('secret-password-token'));
});

test('timeouts terminate the owned process group before returning and output limits are bounded', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t), marker = path.join(f.root, 'late-write'), fake = path.join(f.root, 'fake-git');
  await fs.writeFile(fake, `#!${process.execPath}\nconst {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),400)`) }],{stdio:'inherit'});setInterval(()=>{},1000);\n`, { mode: 0o755 });
  await assert.rejects(gitCommand(fake, f.root, [], { timeout: 50 }), error => error.code === 'GIT_TIMEOUT');
  await new Promise(resolve => setTimeout(resolve, 450)); await assert.rejects(fs.access(marker), error => error.code === 'ENOENT');
  await fs.writeFile(fake, `#!${process.execPath}\nprocess.stdout.write('x'.repeat(100000));setInterval(()=>{},1000);\n`, { mode: 0o755 });
  await assert.rejects(gitCommand(fake, f.root, [], { maxBytes: 1000 }), error => error.code === 'GIT_LIMIT');
});

test('invalid UTF-8 names outside the model fail closed without renaming foreign entries', async t => {
  const f = await fixture(t), blob = await f.blob('Foreign bytes');
  const rawTree = Buffer.concat([Buffer.from(`100644 blob ${blob}\t`), Buffer.from([0xff, 0])]);
  const tree = await f.raw(['mktree', '-z'], rawTree), head = await f.remoteCommit(tree);
  await assert.rejects(f.repo.fetch(), error => error.code === 'GIT_MODEL');
  assert.equal(await f.repo.ref(LOCAL_REF), null); assert.equal(await f.raw(['rev-parse', 'main']), head);
});


test('legacy direct local ref migrates losslessly to named branch; branch changes and milestones preserve CAS', async t => {
  const f = await fixture(t), model = createProject('Legacy'), head = await f.repo.commit(exportFiles(model), 'Original author', [], null);
  await f.repo.run(['symbolic-ref', '--delete', LOCAL_REF]); await f.repo.run(['update-ref', LOCAL_REF, head]);
  await f.repo.run(['update-ref', '-d', 'refs/heads/arkita-branches/main', head]);
  const reopened = await openGitRepository(path.join(f.root, 'local'), f.target, executable);
  assert.equal(await reopened.ref(LOCAL_REF), head); assert.equal(await reopened.currentBranch(), 'main');
  await reopened.createBranch('trial', head);
  model.project.name = 'Newer'; const next = await reopened.commit(exportFiles(model), 'Change', [head], head);
  await assert.rejects(reopened.switchBranch('trial', 'main', head, head), error => error.code === 'GIT_PLAN');
  assert.equal(await reopened.ref(LOCAL_REF), next); await reopened.switchBranch('trial', 'main', next, head);
  assert.equal(await reopened.ref(LOCAL_REF), head); assert.equal(await reopened.branchHead('main'), next);
  await reopened.createMilestone('checkpoint', head);
  await assert.rejects(reopened.deleteMilestone('checkpoint', next), error => error.code === 'GIT_PLAN');
  assert.equal((await reopened.milestones())[0].oid, head);
});


test('batch blob writes preserve UTF-8, empty data and protocol-looking bytes without changing refs or interpreting payload commands', async t => {
  const f = await fixture(t), head = await f.repo.commit(exportFiles(createProject('Unchanged head')), 'Baseline', [], null);
  const before = (await f.repo.run(['for-each-ref', '--format=%(refname) %(objectname)'])).stdout;
  const files = [{ content: `Кириллица 🙂\r\nblob\nmark :999\ndata 0\n\nreset refs/heads/injected\nfrom ${head}\n\ndone\n` }, { content: '' }, { content: 'No trailing newline 漢字' }];
  const commands = [], oids = await writeGitBlobs(files, (args, options) => { commands.push(args); return f.repo.run(args, options); });
  assert.equal(commands.filter(args => args[0] === 'fast-import').length, 1); assert.equal(commands.length, 2);
  assert.deepEqual((await f.repo.run(['for-each-ref', '--format=%(refname) %(objectname)'])).stdout, before);
  for (const [index, oid] of oids.entries()) assert.deepEqual((await f.repo.run(['cat-file', 'blob', oid])).stdout, Buffer.from(files[index].content));
  assert.equal(await f.repo.ref(LOCAL_REF), head);
});

test('batch failures, malformed or truncated OID responses and wrong blob content/type/size preserve existing refs', async t => {
  const f = await fixture(t), head = await f.repo.commit(exportFiles(createProject('Protected')), 'Baseline', [], null);
  const before = (await f.repo.run(['for-each-ref', '--format=%(refname) %(objectname)'])).stdout, files = [{ content: 'Synthetic first 🙂' }, { content: 'Synthetic second' }];
  const differentContent = 'x'.repeat(Buffer.byteLength(files[0].content));
  const differentOid = (await f.repo.run(['hash-object', '-w', '--no-filters', '--stdin'], { input: differentContent })).stdout.toString().trim();
  for (const mode of ['truncated-stream', 'truncated-count', 'extra-line', 'bad-oid', 'missing-lf', 'mixed-format', 'wrong-content', 'wrong-type', 'wrong-size']) {
    const run = async (args, options) => {
      if (args[0] === 'fast-import' && mode === 'truncated-stream') return f.repo.run(args, { ...options, input: options.input.subarray(0, -5) });
      const result = await f.repo.run(args, options); let text = result.stdout.toString('utf8');
      if (args[0] === 'fast-import') {
        if (mode === 'truncated-count') text = text.split('\n')[0] + '\n';
        if (mode === 'extra-line') text += '\n';
        if (mode === 'bad-oid') text = text.replace(/^[0-9a-f]/, 'x');
        if (mode === 'missing-lf') text = text.slice(0, -1);
        if (mode === 'mixed-format') text = text.split('\n')[0] + '\n' + '0'.repeat(64) + '\n';
        if (mode === 'wrong-content') text = differentOid + text.slice(text.indexOf('\n'));
      } else {
        if (mode === 'wrong-type') text = text.replace(' blob ', ' tree ');
        if (mode === 'wrong-size') text = text.replace(/ blob [0-9]+/, ' blob 0');
      }
      return { ...result, stdout: Buffer.from(text) };
    };
    await assert.rejects(writeGitBlobs(files, run), { code: mode === 'truncated-stream' ? 'GIT_COMMAND' : 'GIT_MODEL' }, mode);
    assert.deepEqual((await f.repo.run(['for-each-ref', '--format=%(refname) %(objectname)'])).stdout, before, mode);
    assert.equal(await f.repo.ref(LOCAL_REF), head, mode);
  }
});

test('all 5016 native records use one blob process and a single bounded type/size check', {
  skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'capacity test runs in Extended CI' : false,
}, async t => {
  const f = await fixture(t), files = exportFiles(largeNativeModel()), commands = [], start = performance.now();
  const oids = await writeGitBlobs(files, (args, options) => { commands.push(args); return f.repo.run(args, options); });
  assert.equal(files.length, 5016); assert.equal(oids.length, files.length);
  assert.deepEqual(commands.map(args => args[0]), ['fast-import', 'cat-file']);
  assert.equal(await f.repo.ref(LOCAL_REF), null);
  t.diagnostic(JSON.stringify({ operation: 'batch-write-5016', blobProcesses: 1, checkProcesses: 1, elapsedMs: Math.round(performance.now() - start), platform: process.platform }));
});

test('batch writes support SHA-256 repository OIDs without creating refs', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-git-sha256-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await gitCommand(executable, root, ['init', '--bare', '--template=', '--initial-branch=main', '--object-format=sha256', root]);
  const run = (args, options) => gitCommand(executable, root, args, options), content = 'SHA-256 Кириллица 🙂';
  const oids = await writeGitBlobs([{ content }], run); assert.equal(oids[0].length, 64);
  assert.deepEqual((await run(['cat-file', 'blob', oids[0]])).stdout, Buffer.from(content));
  assert.equal((await run(['for-each-ref'])).stdout.length, 0);
});
