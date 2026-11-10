import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createStore, validateProject, CURRENT_CATALOG, createCustomizationResolver, profileAppliesTo, customizationProfileUsages, resolveProfileValue, specializationLabel, exportFiles, importFiles } from '../src/index.js';
import { parseJSON } from '../src/json.js';
import { conceptProject } from '../fixtures/concept-project.js';
import { fixtureId } from '../fixtures/relationship-project.js';
import { customizationProject, customizationDrawingProject, customizationManagerProject, profileDefinition, profileId, allTargets } from '../fixtures/customization-project.js';

const run = (store, command) => store.execute(command, store.revision);
const ref = state => ({ kind: 'element', id: state.elements[0].id });
const definition = state => state.customizationProfiles[0];
const editable = record => { const { id, ...value } = record; return value; };
const capture = store => ({ snapshot: store.snapshot, revision: store.revision, history: store.history });
function history(store) { run(store, { type: 'renameProject', name: 'Past' }); run(store, { type: 'renameProject', name: 'Future' }); store.undo(store.revision); assert.ok(store.history.undo && store.history.redo); }
function rejects(store, command, code) { const before = capture(store); assert.throws(() => run(store, command), code ? { code } : undefined); assert.deepEqual(capture(store), before); }
const structure = { kind: 'Structure', fields: { text: 'String', count: 'Integer' } };
const domains = [
  ['String', ['', 'text', 'x'.repeat(8192)], [false, 0, null, {}, 'x'.repeat(8193)]],
  ['Integer', [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER], [1.1, Number.MAX_SAFE_INTEGER + 1, '2', null, -0, NaN, Infinity]],
  ['Real', [0, 1.25, -3, Number.MAX_VALUE], ['1.5', null, -0, NaN, Infinity]],
  ['Boolean', [true, false], ['true', 0, 1, null]],
  ['Currency', [{ amount: '-123.4500', currency: 'USD' }, { amount: '0', currency: 'ZZZ' }, { amount: '9'.repeat(8192), currency: 'EUR' }], [{ amount: 2, currency: 'USD' }, { amount: '1e2', currency: 'USD' }, { amount: '+2', currency: 'USD' }, { amount: '01', currency: 'USD' }, { amount: '1.', currency: 'USD' }, { amount: '1', currency: 'usd' }, { amount: '1', currency: 'US' }, { amount: '1', currency: 'USD', extra: true }, { amount: '1' }, null]],
  ['Date', ['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31'], ['2023-02-29', '1900-02-29', '0000-01-01', '2024-13-01', '2024-04-31', '2024-01-00', '2024-01-01T00:00:00Z', null]],
  ['URL', ['https://example.test/a', 'mailto:a@example.test', 'urn:example:one', 'javascript:inert()', 'urn:' + 'x'.repeat(8188)], ['/relative', 'example.test', 'http://[invalid', 'https://example.test/a b', 'urn:a\tb', 'urn:a\0b', 'urn:a\x7fb', 'urn:' + 'x'.repeat(8189), null]],
  [structure, [{ text: '', count: 0 }], [{ text: 'x' }, { text: '', count: '0' }, { text: 'x', count: 0, extra: 1 }, null]],
  [{ kind: 'List', itemType: 'String' }, [[], ['', 'a']], [['a', 1], {}, null]],
  [{ kind: 'List', itemType: structure }, [[], [{ text: '', count: 0 }]], [[{ text: 'x' }], [['nested']], null]],
];
for (const [type, accepted, rejected] of domains) test(`customization type ${typeof type === 'string' ? type : JSON.stringify(type)}: same domains for defaults and overrides`, () => {
  for (const [valid, values] of [[true, accepted], [false, rejected]]) for (const value of values) for (const mode of ['default', 'override']) {
    const state = customizationProject({ field: { type } });
    if (mode === 'default') definition(state).attributes.field.default = value; else state.elements[0].profileApplications[0].values.field = value;
    if (valid) assert.equal(validateProject(state), state); else assert.throws(() => validateProject(state), undefined, `${mode}: ${JSON.stringify(value)}`);
  }
});

test('customization grammar: closed records, all concrete targets, bounded nonblank names, no recursion or unsafe/duplicate keys', () => {
  assert.equal(allTargets().length, 59); validateProject(customizationProject());
  const invalidTypes = ['Time', 'string', { kind: 'Structure', fields: {} }, { kind: 'Structure', fields: { x: structure } }, { kind: 'Structure', fields: { x: { kind: 'List', itemType: 'String' } } }, { kind: 'List', itemType: { kind: 'List', itemType: 'String' } }, { kind: 'List', itemType: 'String', script: '' }];
  for (const type of invalidTypes) assert.throws(() => validateProject(customizationProject({ x: { type } })));
  for (const count of [64, 65]) {
    const attributes = Object.fromEntries(Array.from({ length: count }, (_, i) => [`a${i}`, { type: 'String' }]));
    const fields = Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, 'Boolean']));
    for (const state of [customizationProject(attributes), customizationProject({ x: { type: { kind: 'Structure', fields } } })]) {
      if (count === 64) validateProject(state); else assert.throws(() => validateProject(state), { code: 'LIMIT' });
    }
  }
  const changes = [d => d.name = '', d => d.name = ' \n ', d => d.name = 'x'.repeat(8193), d => d.purpose = 'rules', d => d.targets = [], d => d.targets.push(d.targets[0]), d => d.targets = [{ kind: 'element', type: 'Concept' }], d => d.targets = [{ kind: 'new', type: 'Service' }], d => d.targets = [{ kind: 'element', type: 'CustomType' }], d => d.targets[0].extra = true, d => d.attributes[' '] = { type: 'String' }, d => d.attributes.x = { type: 'String', script: '' }];
  for (const field of ['rules', 'script', 'html', 'svg', 'parentProfile', 'permissionClass', 'sourceEvidence', 'origin']) changes.push(d => d[field] = 'forged');
  for (const change of changes) { const state = customizationProject(); change(definition(state)); assert.throws(() => validateProject(state)); }
  const accepted = customizationProject(); definition(accepted).name = 'constructor'; validateProject(accepted);
  for (const text of ['{"x":1,"\\u0078":2}', '{"constructor":{}}', '{"x":{"type":{"kind":"Structure","fields":{"a":"String","\\u0061":"Integer"}}}}']) assert.throws(() => parseJSON(text));
  for (const mutate of [d => Object.defineProperty(d.attributes, 'x', { enumerable: true, get() { throw Error('must not execute'); } }), d => d.targets = Array(2), d => d.attributes = JSON.parse('{"__proto__":{"type":"String"}}')]) {
    const state = customizationProject(); mutate(definition(state)); assert.throws(() => validateProject(state), error => error.message !== 'must not execute');
  }
  const empty = createProject('No injected definitions'); assert.equal(Object.hasOwn(empty, 'customizationProfiles'), false);
  empty.customizationProfiles = []; assert.throws(() => validateProject(empty), { code: 'SCHEMA' });
  const state = customizationProject(); state.elements[0].profileApplications = []; assert.throws(() => validateProject(state), { code: 'SCHEMA' });
});

test('effective values: own false/zero/empty overrides, whole compound values, live default removal, detached results and namespaces', () => {
  const state = customizationProject({ flag: { type: 'Boolean', default: true }, count: { type: 'Integer', default: 7 }, text: { type: 'String', default: 'default' }, list: { type: { kind: 'List', itemType: 'String' }, default: ['default'] }, structure: { type: structure, default: { text: 'default', count: 7 } }, unset: { type: 'String' } });
  const d = definition(state), app = state.elements[0].profileApplications[0];
  app.values = { flag: false, count: 0, text: '', list: [], structure: { text: '', count: 0 } };
  const before = structuredClone(state);
  for (const [key, value] of Object.entries(app.values)) assert.deepEqual(resolveProfileValue(d, app, key), { origin: 'override', value });
  assert.deepEqual(resolveProfileValue(d, app, 'unset'), { origin: 'unset' });
  const resolved = resolveProfileValue(d, app, 'structure'); resolved.value.text = 'mutated detached'; assert.deepEqual(state, before);
  delete app.values.flag; assert.deepEqual(resolveProfileValue(d, app, 'flag'), { origin: 'default', value: true });
  delete d.attributes.flag.default; assert.deepEqual(resolveProfileValue(d, app, 'flag'), { origin: 'unset' });
  const second = { id: fixtureId('prf', 2), ...profileDefinition({ count: { type: 'String', default: 'seven' } }, 'attributes') }; state.customizationProfiles.push(second);
  state.elements[0].profileApplications.push({ profileId: second.id, values: {} }); validateProject(state);
  assert.deepEqual(resolveProfileValue(second, state.elements[0].profileApplications[1], 'count'), { origin: 'default', value: 'seven' });
  assert.deepEqual(resolveProfileValue(d, app, 'count'), { origin: 'override', value: 0 });
  assert.equal(specializationLabel(state, state.elements[0]), `«${d.name}»`);
});

test('five lifecycle commands: independent reusable definitions, ordering, replacement, affected views, purpose changes and exact history', () => {
  const store = createStore(conceptProject());
  const d = profileDefinition({ n: { type: 'Integer', default: 3 } });
  const created = run(store, { type: 'createCustomizationProfile', definition: d }); assert.deepEqual(created.affectedViewIds, []);
  const id = created.created.profileId; assert.match(id, /^prf-/);
  const second = run(store, { type: 'createCustomizationProfile', definition: profileDefinition({}, 'specialization') }).created.profileId;
  let state = store.snapshot;
  for (const [kind, records] of [['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships]]) for (const object of records) {
    const result = run(store, { type: 'setProfileApplication', concept: { kind, id: object.id }, profileId: id, values: {} });
    assert.deepEqual(result.affectedViewIds, [state.views[0].view.id]);
  }
  const concept = ref(state);
  run(store, { type: 'setProfileApplication', concept, profileId: second, values: {} });
  run(store, { type: 'setProfileApplication', concept, profileId: id, values: { n: 0 } });
  assert.deepEqual(store.snapshot.elements[0].profileApplications, [{ profileId: id, values: { n: 0 } }, { profileId: second, values: {} }]);
  assert.equal(specializationLabel(store.snapshot, store.snapshot.elements[0]), `«${d.name}, ${d.name}»`);
  const duplicate = run(store, { type: 'duplicateView', viewId: state.views[0].view.id, name: 'Duplicate' }).created.viewId;
  const changed = { ...d, name: 'Renamed', purpose: 'attributes', attributes: { n: { type: 'Integer', default: 8 }, extra: { type: 'String' } } };
  const prior = store.snapshot; const update = run(store, { type: 'updateCustomizationProfile', profileId: id, definition: changed });
  assert.deepEqual(update.affectedViewIds, [state.views[0].view.id, duplicate].sort());
  assert.deepEqual(resolveProfileValue(store.snapshot.customizationProfiles[0], store.snapshot.elements[0].profileApplications[0], 'n'), { origin: 'override', value: 0 });
  assert.deepEqual(resolveProfileValue(store.snapshot.customizationProfiles[0], store.snapshot.elements[1].profileApplications[0], 'n'), { origin: 'default', value: 8 });
  assert.equal(specializationLabel(store.snapshot, store.snapshot.elements[0]), `«${d.name}»`);
  const after = store.snapshot; store.undo(store.revision); assert.deepEqual(store.snapshot, prior); store.redo(store.revision); assert.deepEqual(store.snapshot, after);
  run(store, { type: 'updateCustomizationProfile', profileId: id, definition: { ...changed, purpose: 'specialization', attributes: { n: { type: 'Integer' } } } });
  assert.equal(specializationLabel(store.snapshot, store.snapshot.elements[0]), `«Renamed, ${d.name}»`);
  assert.deepEqual(resolveProfileValue(store.snapshot.customizationProfiles[0], store.snapshot.elements[1].profileApplications[0], 'n'), { origin: 'unset' });
  run(store, { type: 'setProfileApplication', concept, profileId: id, values: {} });
  assert.deepEqual(store.snapshot.elements[0].profileApplications, [{ profileId: id, values: {} }, { profileId: second, values: {} }]);
  run(store, { type: 'removeProfileApplication', concept, profileId: second }); run(store, { type: 'deleteCustomizationProfile', profileId: second });
  assert.equal(store.snapshot.customizationProfiles.length, 1);
});

test('atomic lifecycle failures preserve meaningful undo and redo, including stale commands and mutable junction target applicability', () => {
  const store = createStore(customizationProject({ n: { type: 'Integer', default: 3 } }));
  const concept = ref(store.snapshot); run(store, { type: 'setProfileApplication', concept, profileId, values: { n: 4 } }); history(store);
  for (const definition of [profileDefinition({}), profileDefinition({ n: { type: 'Boolean' } }), { ...profileDefinition({ n: { type: 'Integer' } }), targets: [{ kind: 'element', type: 'Role' }] }]) rejects(store, { type: 'updateCustomizationProfile', profileId, definition });
  rejects(store, { type: 'deleteCustomizationProfile', profileId }, 'REFERENCE');
  rejects(store, { type: 'createCustomizationProfile', definition: profileDefinition({ n: { type: 'Integer', default: 'bad' } }) });
  for (const values of [{ missing: true }, { n: '4' }, null]) rejects(store, { type: 'setProfileApplication', concept, profileId, values });
  const absent = fixtureId('prf', 999); rejects(store, { type: 'setProfileApplication', concept, profileId: absent, values: {} }, 'REFERENCE');
  const commands = [{ type: 'createCustomizationProfile', definition: profileDefinition() }, { type: 'updateCustomizationProfile', profileId, definition: profileDefinition() }, { type: 'deleteCustomizationProfile', profileId }, { type: 'setProfileApplication', concept, profileId, values: {} }, { type: 'removeProfileApplication', concept, profileId }];
  for (const command of commands) { const before = capture(store); assert.throws(() => store.execute(command, store.revision - 1), { code: 'REVISION' }); assert.deepEqual(capture(store), before); }
  const state = conceptProject(), junction = state.junctions[0];
  state.customizationProfiles = [{ id: profileId, ...profileDefinition(), targets: [{ kind: 'junction', type: 'AndJunction' }] }]; junction.profileApplications = [{ profileId, values: {} }];
  const junctionStore = createStore(state); history(junctionStore);
  rejects(junctionStore, { type: 'updateJunctionType', junctionId: junction.id, junctionType: 'OrJunction' }, 'TYPE');
  run(junctionStore, { type: 'updateCustomizationProfile', profileId, definition: { ...profileDefinition(), targets: [{ kind: 'junction', type: 'AndJunction' }, { kind: 'junction', type: 'OrJunction' }] } });
  run(junctionStore, { type: 'updateJunctionType', junctionId: junction.id, junctionType: 'OrJunction' });
  assert.equal(junctionStore.snapshot.junctions[0].type, 'OrJunction');
  rejects(junctionStore, { type: 'removeProfileApplication', concept: ref(state), profileId }, 'REFERENCE');
});

test('drawing deletion preserves shared applications; concept deletion owns data; final detach/delete omits fields', () => {
  const store = createStore(customizationProject()), state = store.snapshot;
  run(store, { type: 'removeOccurrence', viewId: state.views[0].view.id, occurrenceId: state.views[0].occurrences[0].id });
  assert.deepEqual(store.snapshot.elements[0].profileApplications, state.elements[0].profileApplications);
  run(store, { type: 'deleteElementFromModel', elementId: state.elements[0].id }); assert.equal(store.snapshot.customizationProfiles.length, 1);
  const before = store.snapshot; store.undo(store.revision); assert.equal(store.snapshot.elements[0].id, state.elements[0].id); store.redo(store.revision); assert.deepEqual(store.snapshot, before);
  for (const [kind, items] of [['element', before.elements], ['junction', before.junctions], ['relationship', before.relationships]]) for (const item of items) run(store, { type: 'removeProfileApplication', concept: { kind, id: item.id }, profileId });
  run(store, { type: 'deleteCustomizationProfile', profileId }); assert.equal(Object.hasOwn(store.snapshot, 'customizationProfiles'), false);
  for (const item of [...store.snapshot.elements, ...store.snapshot.junctions, ...store.snapshot.relationships]) assert.equal(Object.hasOwn(item, 'profileApplications'), false);
});

test('direct API inputs and imported applications reject duplicates, unsafe fields and unresolved references without normalization', () => {
  for (const mutate of [s => s.elements[0].profileApplications.push(s.elements[0].profileApplications[0]), s => s.elements[0].profileApplications[0].profileId = fixtureId('prf', 999), s => s.elements[0].profileApplications[0].extra = true, s => s.elements[0].profileApplications[0].values.unknown = 1, s => s.customizationProfiles.push(s.customizationProfiles[0]), s => s.views[0].view.viewpointId = 'reserved', s => s.viewpoints = []]) {
    const state = customizationProject(); mutate(state); assert.throws(() => validateProject(state));
  }
  const state = customizationProject({ x: { type: structure, default: { text: 'raw', count: 1 } } });
  const serialized = JSON.stringify(state); validateProject(state); exportFiles(state); specializationLabel(state, state.elements[0]); assert.equal(JSON.stringify(state), serialized);
  assert.deepEqual(exportFiles(importFiles(exportFiles(state).reverse())), exportFiles(state));
});

 test('public customization helpers reject executable direct inputs before getters run', () => {
  const state = customizationProject({ x: { type: 'String' } });
  let reads = 0;
  const hostile = {}; Object.defineProperty(hostile, 'attributes', { enumerable: true, get() { reads++; return {}; } });
  for (const action of [() => resolveProfileValue(hostile, state.elements[0].profileApplications[0], 'x'), () => resolveProfileValue(definition(state), hostile, 'x'), () => profileAppliesTo(hostile, 'element', 'Grouping'), () => specializationLabel(hostile, state.elements[0]), () => specializationLabel(state, hostile), () => customizationProfileUsages(hostile, profileId), () => createCustomizationResolver(hostile)]) assert.throws(action, { code: 'JSON_VALUE' });
  assert.equal(reads, 0);
});


test('prepared specialization labels retain one shared semantics, exact order and detached snapshot values for every concept kind', () => {
  const state = customizationProject(), secondId = fixtureId('prf', 2), thirdId = fixtureId('prf', 3);
  state.customizationProfiles.push({ id: secondId, ...profileDefinition(), name: '<literal> second' }, { id: thirdId, ...profileDefinition({}, 'attributes'), name: 'Not a stereotype' });
  for (const concept of [...state.elements, ...state.junctions, ...state.relationships]) concept.profileApplications.push({ profileId: secondId, values: {} }, { profileId: thirdId, values: {} });
  validateProject(state); const before = exportFiles(state), { labelFor } = createCustomizationResolver(state);
  assert.ok(Object.isFrozen(createCustomizationResolver(state)));
  for (const concept of [...state.elements, ...state.junctions, ...state.relationships]) assert.equal(labelFor(concept.id), specializationLabel(state, concept));
  assert.deepEqual(exportFiles(state), before); assert.equal(labelFor('missing'), '');
  let coercions = 0; assert.throws(() => labelFor({ toString() { coercions++; return state.elements[0].id; } }), { code: 'SCHEMA' }); assert.equal(coercions, 0);
  const oldLabel = labelFor(state.elements[0].id); state.customizationProfiles[0].name = 'Later edit';
  assert.equal(labelFor(state.elements[0].id), oldLabel); assert.notEqual(createCustomizationResolver(state).labelFor(state.elements[0].id), oldLabel);
});


test('prepared label work is linear for 300/600/1000 ordinary and fully profiled drawings; two drawing/Fit passes add no validation work', t => {
  for (const profiled of [false, true]) for (const count of [300, 600, 1000]) {
    const state = validateProject(customizationDrawingProject(count, profiled));
    const conceptSet = new Set(state.elements), originalOwnKeys = Reflect.ownKeys;
    let rootWalks = 0, conceptWalks = 0, objectWalks = 0, labelFor;
    Reflect.ownKeys = value => { objectWalks++; if (value === state) rootWalks++; if (conceptSet.has(value)) conceptWalks++; return originalOwnKeys(value); };
    try {
      labelFor = createCustomizationResolver(state).labelFor;
      const preparedWork = objectWalks;
      for (let pass = 0; pass < 2; pass++) for (const occurrence of state.views[0].occurrences) assert.equal(labelFor(occurrence.concept.id), profiled ? '«<literal Alpha>, Beta»' : '');
      assert.equal(objectWalks, preparedWork, 'Drawing and Fit lookups must not rewalk any JSON object');
      assert.equal(rootWalks, 1); assert.equal(conceptWalks, count);
    } finally { Reflect.ownKeys = originalOwnKeys; }
    const start = performance.now(), { labelFor: measured } = createCustomizationResolver(state);
    for (let pass = 0; pass < 2; pass++) for (const occurrence of state.views[0].occurrences) measured(occurrence.concept.id);
    t.diagnostic(JSON.stringify({ count, profiled, rootWalks, conceptWalks, objectWalks, preparedAndTwoPassesMs: Math.round((performance.now() - start) * 100) / 100 }));
  }
});


test('prepared usages for 1000 definitions and concepts validate once, preserve usage semantics and return detached read-only references', t => {
  const state = validateProject(customizationManagerProject()), profiles = new Set(state.customizationProfiles), concepts = new Set(state.elements), ownKeys = Reflect.ownKeys;
  let rootWalks = 0, conceptWalks = 0, definitionWalks = 0, objectWalks = 0, resolver;
  Reflect.ownKeys = value => { objectWalks++; if (value === state) rootWalks++; if (concepts.has(value)) conceptWalks++; if (profiles.has(value)) definitionWalks++; return ownKeys(value); };
  try {
    resolver = createCustomizationResolver(state);
    const preparedWork = objectWalks;
    state.customizationProfiles.forEach((profile, index) => {
      assert.deepEqual(resolver.usagesFor(profile.id), [{ kind: 'element', id: state.elements[index].id }]);
      assert.ok(Object.isFrozen(resolver.usagesFor(profile.id))); assert.ok(Object.isFrozen(resolver.usagesFor(profile.id)[0]));
    });
    assert.equal(objectWalks, preparedWork); assert.equal(rootWalks, 1); assert.equal(conceptWalks, 1000); assert.equal(definitionWalks, 1000);
  } finally { Reflect.ownKeys = ownKeys; }
  for (const profile of [state.customizationProfiles[0], state.customizationProfiles[500], state.customizationProfiles[999]]) assert.deepEqual(resolver.usagesFor(profile.id), customizationProfileUsages(state, profile.id));
  assert.deepEqual(resolver.usagesFor('missing'), []);
  let coercions = 0; assert.throws(() => resolver.usagesFor({ toString() { coercions++; return profileId; } }), { code: 'SCHEMA' }); assert.equal(coercions, 0);
  const references = resolver.usagesFor(profileId); state.elements[0].id = fixtureId('el', 5000); assert.notEqual(references[0].id, state.elements[0].id);
  const start = performance.now(), measured = createCustomizationResolver(state);
  for (const profile of state.customizationProfiles) measured.usagesFor(profile.id);
  t.diagnostic(JSON.stringify({ definitions: 1000, concepts: 1000, rootWalks, conceptWalks, definitionWalks, objectWalks, preparedAndUsagePassMs: Math.round((performance.now() - start) * 100) / 100 }));
});


test('specialized element/junction/relationship creation is one validated command with exact Undo; reuse cannot override profiles', () => {
 const store=createStore(conceptProject()),viewId=store.snapshot.views[0].view.id,profileId=run(store,{type:'createCustomizationProfile',definition:profileDefinition({enabled:{type:'Boolean',default:false}})}).created.profileId;
 const state=store.snapshot,a=state.views[0].occurrences[0],b=state.views[0].occurrences[1];
 const commands=[{type:'createElementAndOccurrence',viewId,elementType:'ApplicationComponent',name:'Special',bounds:{x:20,y:20,width:120,height:80}}, {type:'createJunctionAndOccurrence',viewId,junctionType:'AndJunction',name:'Special junction',bounds:{x:200,y:20,width:24,height:24}}, {type:'createRelationshipAndConnection',viewId,relationshipType:'Association',label:'Special relation',source:{kind:'occurrence',id:a.id},target:{kind:'occurrence',id:b.id}}];
 for(const command of commands){const before=store.exportFiles(),history=store.history,result=run(store,{...command,profileId}),after=store.exportFiles(),kind=command.type==='createElementAndOccurrence'?'element':command.type==='createJunctionAndOccurrence'?'junction':'relationship',collection=kind==='element'?'elements':kind==='junction'?'junctions':'relationships',item=store.snapshot[collection].find(item=>item.id===result.created[`${kind}Id`]);assert.deepEqual(item.profileApplications,[{profileId,values:{}}]);assert.equal(store.history.undo,history.undo+1);store.undo(store.revision);assert.deepEqual(store.exportFiles(),before);store.redo(store.revision);assert.deepEqual(store.exportFiles(),after);}
 const before=store.exportFiles(),history=store.history;assert.throws(()=>run(store,{...commands[0],profileId:'prf-00000000-0000-4000-8000-000000009999'}),{code:'REFERENCE'});assert.deepEqual(store.exportFiles(),before);assert.deepEqual(store.history,history);assert.throws(()=>run(store,{type:'addOccurrence',viewId,concept:{kind:'element',id:state.elements[0].id},bounds:{x:0,y:0,width:120,height:80},profileId}),{code:'SCHEMA'});
});
