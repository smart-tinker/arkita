import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { largeNativeModel, largeArchiXML } from '../../schemka-model-core/fixtures/large-native-model.js';
import { createStore, exportFiles, mergeProjectFiles } from '../../schemka-model-core/src/index.js';
import { searchModel } from '../../schemka-model-core/src/model-search.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { atomicWrite, readProjectSnapshot, writeBoundProject } from '../project-files.mjs';
import { createNativeDirectory, readNativeDirectory } from '../native-directory.mjs';
import { updateNativeDirectory } from '../directory-update.mjs';
import { discoverGit, gitCommand, openGitRepository } from '../git-repository.mjs';
import { modelChanges } from '../git-changes.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-capacity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
async function measured(t, operation, run) {
  const start = performance.now(), value = await run();
  t.diagnostic(JSON.stringify({ operation, elapsedMs: Math.round(performance.now() - start), rssBytes: process.memoryUsage().rss, maxRssKiB: process.resourceUsage().maxRSS, platform: process.platform, evidence: 'Node filesystem/core acceptance; desktop GUI measured separately' }));
  return value;
}

test('5016 native records preserve shared concepts, hierarchy and all geometry through file/directory save, reopen, search, edit and Undo/Redo', {
  timeout: 600000, skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'capacity test runs in Extended CI' : false,
}, async t => {
  const root = await fixture(t), state = largeNativeModel(), before = exportFiles(state);
  assert.equal(before.length, 5016); assert.equal(largeArchiXML(), largeArchiXML());
  assert.equal(state.views.filter(entry => entry.occurrences.some(item => item.concept.id === state.elements[0].id)).length, 10);
  const bytes = await measured(t, 'serialize-5016', () => serializeProjectFile(state));
  const target = path.join(root, 'capacity.arkita');
  await measured(t, 'file-save-5016', () => atomicWrite(target, bytes));
  const opened = await measured(t, 'file-reopen-5016', () => readProjectSnapshot(target));
  assert.deepEqual(exportFiles(deserializeProjectFile(opened.bytes)), before);
  const found = await measured(t, 'search-5016', () => searchModel(state, { query: 'Synthetic role 1499', wholeWord: true, fields: ['name'] }));
  assert.deepEqual(found.map(row => row.owner.id), [state.elements[1498].id]);
  const store = createStore(state);
  await measured(t, 'edit-5016', () => store.execute({ type: 'renameElement', elementId: state.elements[0].id, name: 'Edited shared container' }, store.revision));
  const after = store.exportFiles(); assert.equal(store.history.undo, 1);
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before);
  store.redo(store.revision); assert.deepEqual(store.exportFiles(), after);
  assert.throws(() => store.execute({ type: 'renameElement', elementId: state.elements[0].id, name: 'x'.repeat(8193) }, store.revision));
  assert.deepEqual(store.exportFiles(), after); assert.equal(store.history.undo, 1);
  await measured(t, 'file-update-5016', () => writeBoundProject(opened.snapshot, serializeProjectFile(store.snapshot)));
  assert.deepEqual(exportFiles(deserializeProjectFile((await readProjectSnapshot(target)).bytes)), after);
  const directory = await measured(t, 'directory-save-5016', () => createNativeDirectory(root, bytes));
  const updated = await measured(t, 'directory-update-5016', () => updateNativeDirectory(directory.snapshot, serializeProjectFile(store.snapshot)));
  assert.deepEqual(updated.snapshot.files, after);
  assert.deepEqual((await measured(t, 'directory-reopen-5016', () => readNativeDirectory(directory.snapshot.guard.root))).snapshot.files, after);
});

test('5016 native records complete a local Git publish/fetch/edit/merge cycle without splitting shared concepts or geometry', {
  timeout: 180000, skip: process.env.ARKITA_TEST_PROFILE === 'pr' ? 'capacity test runs in Extended CI' : false,
}, async t => {
  const root = await fixture(t), state = largeNativeModel(), baseFiles = exportFiles(state), executable = await discoverGit();
  const remote = path.join(root, 'remote.git'); await fs.mkdir(remote);
  await gitCommand(executable, remote, ['init', '--bare', '--template=', '--initial-branch=main', remote]);
  const target = { remote, branch: 'main', directory: 'models/capacity', authorName: 'Synthetic tester', authorEmail: 'test@example.invalid' };
  const first = await openGitRepository(path.join(root, 'first'), target, executable);
  const second = await openGitRepository(path.join(root, 'second'), target, executable);
  const preview = await measured(t, 'git-initial-preview-5016', () => modelChanges([], baseFiles));
  assert.equal(preview.length, 5016);
  for (const entry of state.views) assert.equal(preview.find(row => row.id === entry.occurrences[0].id).label, state.elements[0].name);
  const initial = await measured(t, 'git-initial-commit-5016', () => first.commit(baseFiles, 'Synthetic capacity model', [], null));
  await first.push(initial); assert.equal(await second.fetch(), initial); await second.update(initial, null);
  assert.deepEqual(await second.files(initial), baseFiles);
  const local = structuredClone(state), other = structuredClone(state);
  local.elements[0].name = 'First author edit'; other.views[1].occurrences[1].bounds.x += 10;
  const localFiles = exportFiles(local), otherFiles = exportFiles(other);
  const a = await measured(t, 'git-edit-commit-5016', () => first.commit(localFiles, 'Shared metadata edit', [initial], initial));
  const b = await measured(t, 'git-other-commit-5016', () => second.commit(otherFiles, 'Drawing geometry edit', [initial], initial));
  await first.push(a); assert.equal(await second.fetch(), a);
  const merged = mergeProjectFiles(baseFiles, await second.files(b), await second.files(a));
  assert.equal(merged.structuralError, null); assert.deepEqual(merged.conflicts, []);
  const final = await measured(t, 'git-merge-commit-5016', () => second.commit(merged.files, 'Merge independent synthetic edits', [b, a], b));
  await second.push(final); assert.equal(await first.fetch(), final);
  const expected = structuredClone(local); expected.views[1].occurrences[1].bounds.x += 10;
  assert.deepEqual(await first.files(final), exportFiles(expected));
});
