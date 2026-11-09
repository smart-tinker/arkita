import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { createNativeDirectory, readNativeDirectory, captureNativeDirectory, RECOVERY_MARKER } from '../native-directory.mjs';
import { updateNativeDirectory, recoverNativeDirectory, inspectDirectoryRecovery } from '../directory-update.mjs';
import { atomicWrite } from '../project-files.mjs';
import { createProject, exportFiles, projectView, LIMITS } from '../../schemka-model-core/src/index.js';
import { viewpointGraph, viewpointId, viewpointDefinition } from '../../schemka-model-core/fixtures/viewpoint-project.js';
import { profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile } from '../../schemka-model-io/src/project-file.js';
const encode = serializeProjectFile;
const failure = () => Object.assign(Error('synthetic viewpoint interruption'), { code: 'EIO' });
function combined() {
  const state = viewpointGraph().state;
  state.customizationProfiles = [{ id: profileId, ...profileDefinition({ amount: { type: 'Currency', default: { amount: '-123.4500', currency: 'USD' } } }) }];
  for (const item of [...state.elements, ...state.relationships]) item.profileApplications = [{ profileId, values: {} }];
  return state;
}
async function fixture(t, state = combined()) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'schemka-viewpoint-directory-')); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const saved = await createNativeDirectory(parent, encode(state)); return { parent, root: path.join(parent, saved.name), snapshot: saved.snapshot, state };
}
async function raw(root, files) { return Promise.all(files.map(async f => ({ path: f.path, content: await fs.readFile(path.join(root, f.path), 'utf8') }))); }
const sameState = (actual, expected) => assert.deepEqual(exportFiles(actual), exportFiles(expected));
function transitions() {
  const bound = combined(), unbound = structuredClone(bound); delete unbound.views[0].view.viewpointId;
  const ordinary = structuredClone(unbound); delete ordinary.viewpoints;
  const edited = structuredClone(bound); edited.viewpoints[0].name = 'Edited raw\r\n view'; edited.viewpoints[0].selection = { elementTypes: [], junctionTypes: [], relationshipTypes: [] };
  return [['first-definition', ordinary, unbound], ['last-definition', unbound, ordinary], ['binding', unbound, bound], ['definition-edit', bound, edited]];
}

test('guarded native directories and containers preserve bound, unbound, definition-only and combined hidden data', async t => {
  const empty = createProject('Empty definition selection'); empty.viewpoints = [{ id: viewpointId, ...viewpointDefinition({ elementTypes: [], junctionTypes: [], relationshipTypes: [] }) }];
  const state = combined(), unbound = structuredClone(state); delete unbound.views[0].view.viewpointId;
  assert.equal(projectView(state, state.views[0].view.id).occurrences.length, 2); assert.equal(state.views[0].occurrences.length, 3);
  for (const model of [state, unbound, empty]) {
    const f = await fixture(t, model), reopened = await readNativeDirectory(f.root);
    sameState(reopened.snapshot.state, model); sameState(deserializeProjectFile(reopened.bytes), model);
    assert.deepEqual(reopened.bytes, encode(model)); assert.deepEqual(await raw(f.root, exportFiles(model)), exportFiles(model));
    const again = await createNativeDirectory(f.parent, reopened.bytes); assert.deepEqual(again.snapshot.files, f.snapshot.files);
  }
});

test('successful first/last definitions, binding and definition edits have exact deltas and preserve untouched raw records', async t => {
  for (const [name, before, after] of transitions()) {
    const f = await fixture(t, before);
    for (const file of f.snapshot.files) await fs.writeFile(path.join(f.root, file.path), JSON.stringify(JSON.parse(file.content), null, 4) + '\r\n');
    f.snapshot = await captureNativeDirectory(f.root);
    await fs.mkdir(path.join(f.root, '.git')); await fs.writeFile(path.join(f.root, '.git', 'sentinel'), 'unowned');
    await fs.writeFile(path.join(f.root, 'notes.txt'), 'notes');
    const original = new Map(exportFiles(before).map(f => [f.path, f.content])), target = new Map(exportFiles(after).map(f => [f.path, f.content]));
    const changed = [...new Set([...original.keys(), ...target.keys()])].filter(p => original.get(p) !== target.get(p)).sort();
    const saved = await updateNativeDirectory(f.snapshot, encode(after)); sameState(saved.snapshot.state, after);
    const journal = JSON.parse(await fs.readFile(path.join(saved.transaction, 'page-0000.json'), 'utf8'));
    const deltas = journal.entries.filter(e => JSON.stringify(e.before) !== JSON.stringify(e.after));
    assert.deepEqual(deltas.map(e => e.path), changed, name);
    assert.equal(changed.includes('schemka.json'), ['first-definition', 'last-definition'].includes(name));
    for (const file of f.snapshot.files.filter(f => !changed.includes(f.path))) assert.equal(await fs.readFile(path.join(f.root, file.path), 'utf8'), file.content);
    assert.equal(await fs.readFile(path.join(f.root, '.git', 'sentinel'), 'utf8'), 'unowned'); assert.equal(await fs.readFile(path.join(f.root, 'notes.txt'), 'utf8'), 'notes');
    assert.deepEqual((await readNativeDirectory(f.root)).bytes, encode(after));
  }
});

test('both recovery choices at every first/last definition mutation include header metadata and full Ch13/Ch14 state', async t => {
  for (const [name, before, after] of transitions()) for (const side of ['before', 'after']) for (const phase of ['before', 'after']) {
    const original = new Map(exportFiles(before).map(f => [f.path, f.content])), target = new Map(exportFiles(after).map(f => [f.path, f.content]));
    const count = [...new Set([...original.keys(), ...target.keys()])].filter(p => original.get(p) !== target.get(p)).length;
    for (let boundary = 1; boundary <= count; boundary++) {
      const f = await fixture(t, before); let mutations = 0, fired = false;
      const action = async (method, ...args) => {
        if (method === 'unlink' && args[0].endsWith(RECOVERY_MARKER)) return fs.unlink(...args);
        const selected = ++mutations === boundary;
        if (selected && phase === 'before') { fired = true; throw failure(); }
        const result = await fs[method](...args); if (selected && phase === 'after') { fired = true; throw failure(); } return result;
      };
      await assert.rejects(updateNativeDirectory(f.snapshot, encode(after), { ...fs, rename: (...args) => action('rename', ...args), unlink: (...args) => action('unlink', ...args) }), /synthetic viewpoint interruption/);
      assert.equal(fired, true, `${name}/${side}/${phase}/${boundary}`);
      await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
      const journal = await inspectDirectoryRecovery(f.root); assert.ok(journal);
      const recovered = await recoverNativeDirectory(f.root, side); sameState(recovered.snapshot.state, side === 'before' ? before : after);
      assert.deepEqual((await readNativeDirectory(f.root)).bytes, encode(side === 'before' ? before : after));
    }
  }
});

test('an externally changed or missing untouched hidden record blocks both recovery choices without reconstruction', async t => {
  for (const kind of ['rewrite', 'delete']) {
    const f = await fixture(t), next = structuredClone(f.state); next.viewpoints[0].name = 'Changed definition';
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(next), { ...fs, rename: async () => { throw failure(); } }));
    const hidden = path.join(f.root, `model/elements/${f.state.elements.find(e => e.type === 'Device').id}.json`);
    if (kind === 'delete') await fs.unlink(hidden); else await fs.writeFile(hidden, 'External hidden data');
    for (const side of ['before', 'after']) {
      let writes = 0; await assert.rejects(recoverNativeDirectory(f.root, side, { ...fs, rename: async () => writes++, unlink: async () => writes++ })); assert.equal(writes, 0);
    }
    if (kind === 'rewrite') assert.equal(await fs.readFile(hidden, 'utf8'), 'External hidden data'); else await assert.rejects(fs.lstat(hidden), { code: 'ENOENT' });
  }
});

test('viewpoint namespace uses canonical case, path, no-follow and regular-record guards and ignores only unowned notes', async t => {
  const aliases = ['Viewpoints', 'viewpoints/VPT-00000000-0000-4000-8000-000000000001.json', 'viewpoints/vpt-bad.json', 'viewpoints/vpt-00000000-0000-4000-8000-000000000001.JSON', 'viewpoints/unknown.json', 'viewpoints/vpt-bad.txt'];
  for (const relative of aliases) {
    const f = await fixture(t); await fs.writeFile(path.join(f.root, relative), '{}'); await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_PATH' });
  }
  for (const kind of ['namespace-link', 'namespace-file', 'record-link', 'record-directory']) {
    const f = await fixture(t), relative = kind.startsWith('namespace') ? 'viewpoints' : `viewpoints/${viewpointId}.json`, target = path.join(f.root, relative);
    const backup = path.join(f.parent, `${kind}-original`); await fs.rename(target, backup);
    if (kind.endsWith('link')) await fs.symlink(backup, target);
    else if (kind.endsWith('directory')) await fs.mkdir(target); else await fs.writeFile(target, '{}');
    await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_TYPE' });
  }
  const f = await fixture(t); await fs.symlink('/synthetic-unavailable', path.join(f.root, 'viewpoints', 'notes'));
  const opened = await readNativeDirectory(f.root, { ...fs, opendir: async target => { assert.notEqual(path.basename(target), 'notes'); return fs.opendir(target); } }); sameState(opened.snapshot.state, f.state);
});

test('viewpoint record size and shared file budgets are enforced before opening excess records', async t => {
  const f = await fixture(t), file = path.join(f.root, `viewpoints/${viewpointId}.json`), original = await fs.readFile(file);
  await fs.writeFile(file, original.toString().padEnd(LIMITS.fileBytes + 1, ' ')); await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_LIMIT' }); await fs.writeFile(file, original);
  let entries = 0, opened = 0, closed = false;
  await assert.rejects(readNativeDirectory(f.root, { ...fs, open: async (...args) => { opened++; return fs.open(...args); }, opendir: async target => {
    if (path.basename(target) !== 'viewpoints') return fs.opendir(target);
    return { read: async () => ({ name: `${fixtureId('vpt', ++entries)}.json` }), close: async () => { closed = true; } };
  } }), { code: 'DIRECTORY_LIMIT' }); assert.ok(entries <= LIMITS.files + 1); assert.equal(opened, 0); assert.equal(closed, true);
});

test('hardlinked viewpoint updates refuse before a journal or source mutation; unlinked records remain saveable', async t => {
  const f = await fixture(t), record = path.join(f.root, `viewpoints/${viewpointId}.json`), alias = path.join(f.parent, 'external-link');
  await fs.link(record, alias); f.snapshot = await captureNativeDirectory(f.root); const original = await fs.readFile(alias, 'utf8');
  await assert.rejects(atomicWrite(alias, encode(f.state)), { code: 'FILE_LINKS' }); assert.equal(await fs.readFile(alias, 'utf8'), original);
  const next = structuredClone(f.state); next.viewpoints[0].name = 'Replacement'; const entries = await fs.readdir(f.parent);
  let moved = false;
  await assert.rejects(updateNativeDirectory(f.snapshot, encode(next), { ...fs, rename: async (...args) => { moved = true; return fs.rename(...args); } }), { code: 'FILE_LINKS' });
  assert.equal(moved, false); assert.deepEqual(await fs.readdir(f.parent), entries); assert.equal(await fs.readFile(alias, 'utf8'), original);
  sameState((await readNativeDirectory(f.root)).snapshot.state, f.state);
  await fs.unlink(alias); f.snapshot = await captureNativeDirectory(f.root);
  const updated = await updateNativeDirectory(f.snapshot, encode(next)); sameState(updated.snapshot.state, next);
  const alias2 = path.join(f.parent, 'second-link'); await fs.link(record, alias2); const snapshot = await captureNativeDirectory(f.root);
  await fs.writeFile(alias2, original); await assert.rejects(updateNativeDirectory(snapshot, encode(f.state)), { code: 'DIRECTORY_CHANGED' });
});

test('regular viewpoint ancestor replacement during observation refuses without following the replacement', async t => {
  const f = await fixture(t), record = path.join(f.root, `viewpoints/${viewpointId}.json`); let swapped = false;
  const io = { ...fs, open: async (target, flags, ...args) => {
    const handle = await fs.open(target, flags, ...args);
    return new Proxy(handle, { get(object, key) { if (key === 'close') return async () => { await handle.close(); if (!swapped && target === record && !(flags & constants.O_WRONLY)) { swapped = true; await fs.rename(path.dirname(record), `${path.dirname(record)}-original`); await fs.mkdir(path.dirname(record)); await fs.writeFile(record, 'external replacement'); } }; const value = object[key]; return typeof value === 'function' ? value.bind(object) : value; } });
  } };
  await assert.rejects(readNativeDirectory(f.root, io), { code: 'DIRECTORY_CHANGED' }); assert.equal(swapped, true); assert.equal(await fs.readFile(record, 'utf8'), 'external replacement');
});

test('first/last-definition recovery itself can fail after a mutation and safely resume either explicit choice', async t => {
  for (const [name, before, after] of transitions().slice(0, 2)) for (const side of ['before', 'after']) {
    const f = await fixture(t, before);
    const interrupted = side === 'before' ? { unlink: async p => { if (p.endsWith(RECOVERY_MARKER)) throw failure(); return fs.unlink(p); } } : { rename: async () => { throw failure(); } };
    await assert.rejects(updateNativeDirectory(f.snapshot, encode(after), { ...fs, ...interrupted }), /synthetic viewpoint interruption/);
    let fired = false;
    const action = async (method, ...args) => { const result = await fs[method](...args); if (!fired && !(method === 'unlink' && args[0].endsWith(RECOVERY_MARKER))) { fired = true; throw failure(); } return result; };
    await assert.rejects(recoverNativeDirectory(f.root, side, { ...fs, rename: (...args) => action('rename', ...args), unlink: (...args) => action('unlink', ...args) }), /synthetic viewpoint interruption/);
    assert.equal(fired, true, `${name}/${side}`); await assert.rejects(readNativeDirectory(f.root), { code: 'DIRECTORY_INCOMPLETE' });
    sameState((await recoverNativeDirectory(f.root, side)).snapshot.state, side === 'before' ? before : after);
  }
});
