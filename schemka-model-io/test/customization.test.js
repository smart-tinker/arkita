import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProject, createStore, exportFiles, importFiles } from '../../schemka-model-core/src/index.js';
import { canonicalJSON } from '../../schemka-model-core/src/json.js';
import { customizationProject, profileDefinition, profileId } from '../../schemka-model-core/fixtures/customization-project.js';
import { relationshipProject, fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, serializeNativeFiles, deserializeProjectFile, loadProjectFile, exportMermaid } from '../src/index.js';
import { createProjectSession } from '../../schemka-model-ui/src/project-session.js';

const run = (store, command) => store.execute(command, store.revision);
const envelope = files => JSON.stringify({ format: 'schemka-project-file', formatVersion: 1, files });
const capture = (store, session) => ({ files: store.exportFiles(), revision: store.revision, history: store.history, dirty: session.dirty });
function enhanced() {
  const state = customizationProject({ currency: { type: 'Currency', default: { amount: '-123.4500', currency: 'USD' } }, list: { type: { kind: 'List', itemType: { kind: 'Structure', fields: { flag: 'Boolean', count: 'Integer' } } }, default: [] }, url: { type: 'URL', default: 'javascript:inert()' } });
  state.elements[0].profileApplications[0].values.list = [{ flag: false, count: 0 }];
  state.customizationProfiles.push({ id: fixtureId('prf', 2), ...profileDefinition({}, 'specialization') });
  state.elements[0].profileApplications.push({ profileId: fixtureId('prf', 2), values: {} }); return state;
}
test('enhanced core and native container roundtrip retains definitions, exact decimals, references, overrides and authored application order', () => {
  const state = enhanced(), files = exportFiles(state), bytes = serializeProjectFile(state);
  assert.equal(files.filter(item => item.path.startsWith('model/customization-profiles/')).length, 2);
  assert.deepEqual(exportFiles(importFiles(files.toReversed())), files);
  assert.deepEqual(exportFiles(deserializeProjectFile(bytes)), files);
  assert.deepEqual(serializeProjectFile(deserializeProjectFile(bytes)), bytes);
  assert.equal(deserializeProjectFile(bytes).customizationProfiles[0].attributes.currency.default.amount, '-123.4500');
  assert.deepEqual(deserializeProjectFile(bytes).elements[0].profileApplications, state.elements[0].profileApplications);
  const store = createStore(createProject('Before'));
  run(store, { type: 'renameProject', name: 'Old history' }); loadProjectFile(store, bytes, store.revision);
  assert.deepEqual(store.history, { undo: 0, redo: 0 });
  const loaded = store.snapshot; run(store, { type: 'updateCustomizationProfile', profileId, definition: { ...profileDefinition(), name: 'Changed after reopen', attributes: state.customizationProfiles[0].attributes } });
  const changed = store.snapshot; store.undo(store.revision); assert.deepEqual(store.snapshot, loaded); store.redo(store.revision); assert.deepEqual(store.snapshot, changed);
});
test('frozen Site25 inputs upgrade only approved empty metadata; drawings, endpoints and raw properties/multiplicities remain exact', () => {
  for (const name of ['ch14-unenhanced', 'ch14-empty']) {
    const bytes = readFileSync(new URL(`./fixtures/${name}.schemka.json`, import.meta.url));
    const state = deserializeProjectFile(bytes), originalFiles = JSON.parse(bytes).files;
    const upgraded = exportFiles(state);
    const oldRecords = upgraded.map(file => {
      const value = JSON.parse(file.content);
      if (file.path === 'schemka.json') { assert.equal(value.formatVersion, 4); assert.equal(value.documentation, ''); assert.deepEqual(value.properties, []); value.formatVersion = 2; delete value.documentation; delete value.properties; }
      if (file.path.startsWith('model/relationships/')) { assert.equal(value.documentation, ''); delete value.documentation; }
      if (file.path.endsWith('/view.json')) { assert.deepEqual(value.properties, []); delete value.properties; }
      if (Array.isArray(value.properties)) value.properties = Object.fromEntries(value.properties.map(({ key, value }) => [key, value]));
      if (file.path.includes('/occurrences/')) { delete value.parent; delete value.style; value.parentOccurrenceId = null; }
      if (file.path.includes('/connections/')) delete value.style;
      return { path: file.path, content: canonicalJSON(value) };
    });
    assert.deepEqual(oldRecords, originalFiles);
    assert.deepEqual(exportFiles(importFiles(originalFiles.toReversed())), upgraded);
    assert.deepEqual(exportFiles(deserializeProjectFile(serializeProjectFile(state))), upgraded);
    assert.deepEqual(Buffer.from(serializeNativeFiles(originalFiles)), bytes);
    assert.equal(Object.hasOwn(state, 'customizationProfiles'), false);
    if (name === 'ch14-unenhanced') {
      assert.ok(state.views[0].connections.some(item => item.source.kind === 'connection'));
      assert.equal(state.relationships[0].sourceMultiplicity, '');
      assert.equal(state.elements[0].properties.find(row => row.key === 'raw').value, '<plain>');
    }
  }
});
test('malformed enhanced imports preserve state, revision, both history stacks and native dirty baseline', async () => {
  const files = exportFiles(enhanced()), p = files.findIndex(item => item.path.includes('customization-profiles'));
  const e = files.findIndex(item => item.path.includes('/elements/'));
  const malformed = [];
  function change(at, fn) { const copy = structuredClone(files); const value = JSON.parse(copy[at].content); fn(value); copy[at].content = JSON.stringify(value); malformed.push(copy); }
  change(p, value => value.id = fixtureId('prf', 999));
  change(p, value => value.script = 'forged');
  change(p, value => value.attributes.currency.default.extra = true);
  change(p, value => value.attributes.currency.default.amount = '01');
  change(e, value => value.profileApplications = []);
  change(e, value => value.profileApplications.push(value.profileApplications[0]));
  change(e, value => value.profileApplications[0].profileId = fixtureId('prf', 999));
  change(e, value => value.profileApplications[0].values.unknown = true);
  malformed.push([...files, files[p]], files.filter((_, i) => i !== p));
  for (const path of ['model/customization-profiles/../x.json', 'viewpoints/x.json', 'model/customization-profiles/bad.json']) { const copy = structuredClone(files); copy[p].path = path; malformed.push(copy); }
  for (const content of ['{"id":"x","\\u0069d":"y"}', '{"__proto__":{}}', '{"id":' + '['.repeat(26) + '0' + ']'.repeat(26) + '}', ' '.repeat(262145)]) { const copy = structuredClone(files); copy[p].content = content; malformed.push(copy); }
  for (const bad of malformed) {
    const store = createStore(enhanced()), session = createProjectSession(store);
    run(store, { type: 'renameProject', name: 'Past' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision);
    const before = capture(store, session); assert.deepEqual(before.history, { undo: 1, redo: 1 });
    assert.throws(() => store.load(bad, store.revision)); assert.deepEqual(capture(store, session), before);
    await assert.rejects(() => session.loadFile(session.beginLoad(), new Blob([envelope(bad)])));
    assert.deepEqual(capture(store, session), before);
  }
});
test('Mermaid rejects drawn element/relationship applications including empty values, but unused and off-view profiles preserve exact earlier bytes', () => {
  const base = relationshipProject(), viewId = base.views[0].view.id;
  const expected = readFileSync(new URL('./fixtures/ch14-unenhanced-mermaid.txt', import.meta.url), 'utf8');
  assert.equal(exportMermaid(base, viewId), expected);
  for (const purpose of ['attributes', 'specialization']) for (const kind of ['element', 'relationship']) {
    const state = structuredClone(base); state.customizationProfiles = [{ id: profileId, ...profileDefinition({}, purpose) }];
    assert.equal(exportMermaid(state, viewId), expected);
    const collection = kind === 'element' ? state.elements : state.relationships;
    collection.at(-1).profileApplications = [{ profileId, values: {} }];
    assert.equal(exportMermaid(state, viewId), expected, 'Unshown concept does not block');
    collection[0].profileApplications = [{ profileId, values: {} }];
    assert.throws(() => exportMermaid(state, viewId), error => error.code === 'MERMAID_UNSUPPORTED' && /native/.test(error.message));
    assert.equal(exportMermaid(state, state.views[2].view.id), 'flowchart LR\n%% relationship semantics UNKNOWN; not normative notation\n');
  }
});
