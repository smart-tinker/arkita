import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CURRENT_METAMODEL, createProject, createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { serializeProjectFile, deserializeProjectFile, loadProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';
import { CURRENT_PROFILE, createRegistry, evaluateRelationship, assessProject, getVerifiedRelationshipDecision } from '../src/index.js';
const variants = ['Access', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess'];
const cells = [
  ['ApplicationComponent', 'ApplicationComponent', 'FORBIDDEN'],
  ['ApplicationComponent', 'ApplicationInterface', 'FORBIDDEN'],
  ['ApplicationComponent', 'DataObject', 'ALLOWED'],
  ['ApplicationInterface', 'ApplicationComponent', 'FORBIDDEN'],
  ['ApplicationInterface', 'ApplicationInterface', 'FORBIDDEN'],
  ['ApplicationInterface', 'DataObject', 'ALLOWED'],
  ['DataObject', 'ApplicationComponent', 'FORBIDDEN'],
  ['DataObject', 'ApplicationInterface', 'FORBIDDEN'],
  ['DataObject', 'DataObject', 'FORBIDDEN'],
];
import { endpointFixture, sevenTypeFixture, endpointLetters, expectedEndpoint, endpointProject } from './endpoint-fixture.js';
const query = (sourceType = 'ApplicationComponent', relationshipType = 'Access', targetType = 'DataObject') => ({ sourceType, relationshipType, targetType, scope: 'direct' });
const registry = () => createRegistry([CURRENT_PROFILE]);
const evaluate = (r, q = query(), ref = CURRENT_METAMODEL) => evaluateRelationship(r, ref, q);
function frozen(value) {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
}
test('nine independently verified ordered cells apply to all four Access variants, with no direct-class permission', () => {
  const r = registry(); let allowed = 0, forbidden = 0;
  for (const [sourceType, targetType, status] of cells) for (const relationshipType of variants) {
    const result = evaluate(r, query(sourceType, relationshipType, targetType));
    assert.equal(result.status, status);
    assert.deepEqual(result, expectedEndpoint(sourceType, relationshipType, targetType));
    assert.equal(getVerifiedRelationshipDecision(result), result);
    frozen(result);
    if (status === 'ALLOWED') allowed++; else forbidden++;
    assert.notEqual(result.permissionClass, 'direct');
  }
  assert.equal(allowed, 8); assert.equal(forbidden, 28);
  const result = evaluate(r);
  assert.throws(() => { result.sourceEvidence.matrix.printedPage = 1; }, TypeError);
  assert.throws(() => result.sourceEvidence.derivedAssertion.printedPages.push(51), TypeError);
  assert.deepEqual(evaluate(r).sourceEvidence, expectedEndpoint('ApplicationComponent', 'Access', 'DataObject').sourceEvidence);
});

test('only original CURRENT_PROFILE identity authorizes source-backed lookup; records cannot transfer or forge authority', () => {
  const original = registry();
  assert.equal(evaluate(original).permissionClass, 'derived');
  for (const descriptor of [structuredClone(CURRENT_PROFILE), { ...CURRENT_PROFILE }, original.get(CURRENT_METAMODEL), ...original.list()]) {
    assert.notEqual(descriptor, CURRENT_PROFILE);
    const result = evaluate(createRegistry([descriptor]));
    assert.deepEqual(result, { status: 'UNKNOWN', permissionClass: null, reason: 'rule-not-found', ruleId: null, sourceEvidence: null });
  }
  const claimed = structuredClone(CURRENT_PROFILE);
  claimed.metadata.source = 'Claims source-backed verified current permissions'; claimed.metadata.status = 'local';
  assert.equal(evaluate(createRegistry([claimed])).status, 'UNKNOWN');
  const local = structuredClone(claimed);
  local.rules = [{ id: 'test-local-allowance', ...query(), status: 'ALLOWED', evidence: 'local' }];
  assert.deepEqual(evaluate(createRegistry([local])), {
    status: 'ALLOWED', permissionClass: null, reason: 'explicit-local-rule', ruleId: 'test-local-allowance', sourceEvidence: null,
  });
  for (const entries of [[CURRENT_PROFILE, claimed], [claimed, CURRENT_PROFILE]]) assert.throws(() => createRegistry(entries), { code: 'PROFILE_DUPLICATE' });
  for (const field of ['verifiedEndpoints', 'sourceEvidence', 'permissionClass']) {
    const forged = structuredClone(CURRENT_PROFILE); forged[field] = true;
    assert.throws(() => createRegistry([forged]), { code: 'PROFILE_SCHEMA' });
  }
  let calls = 0;
  const spoof = { get() { calls++; return CURRENT_PROFILE; }, list() { calls++; return [CURRENT_PROFILE]; } };
  assert.throws(() => evaluate(spoof), { code: 'PROFILE_REGISTRY' }); assert.equal(calls, 0);
});

test('exact inert query/reference checks run before the matrix and direct scope is independent of table classification', () => {
  const r = registry();
  assert.equal(evaluate(r).permissionClass, 'derived');
  for (const scope of ['derived', 'nesting', 'inherited', '*', null]) {
    const result = evaluate(r, { ...query(), scope });
    assert.equal(result.status, 'UNKNOWN'); assert.equal(result.reason, 'unsupported-scope'); assert.equal(result.sourceEvidence, null);
  }
  for (const q of [null, { ...query(), permissionClass: 'derived' }, { ...query(), sourceEvidence: { id: 'forged' } }, { ...query(), sourceType: '*' }]) {
    assert.equal(evaluate(r, q).reason, 'invalid-relationship-query');
  }
  let calls = 0;
  assert.equal(evaluate(r, { ...query(), get sourceType() { calls++; return 'ApplicationComponent'; } }).reason, 'invalid-relationship-query');
  assert.equal(evaluate(r, query(), { ...CURRENT_METAMODEL, get id() { calls++; return CURRENT_METAMODEL.id; } }).reason, 'profile-not-found');
  assert.equal(calls, 0);
  assert.equal(evaluate(r, query('Unknown')).reason, 'type-not-found');
  assert.equal(evaluate(r, query('Access')).reason, 'type-not-found');
  for (const q of [query('Product'), query('ApplicationComponent', 'Association', 'Grouping'), query('ApplicationComponent', 'Access', 'Plateau')]) {
    assert.deepEqual(evaluate(r, q), expectedEndpoint(q.sourceType, q.relationshipType, q.targetType));
    assert.ok(getVerifiedRelationshipDecision(evaluate(r, q)));
  }
});

test('derived allowance can be user-asserted without any intermediate chain and does not imply overall conformance', () => {
  const state = endpointProject();
  const source = state.elements.find(item => item.type === 'ApplicationComponent'), target = state.elements.find(item => item.type === 'DataObject');
  state.relationships = state.relationships.filter(item => item.type === 'Access' && item.source.id === source.id && item.target.id === target.id);
  state.views = []; state.elements = [source, target];
  const before = exportFiles(state), report = assessProject(state, registry());
  assert.equal(report.localStatus, 'ALLOWED');
  assert.deepEqual(report.counts, { ALLOWED: 1, FORBIDDEN: 0, UNKNOWN: 0 });
  assert.equal(report.verifiedDerived, 1);
  assert.equal(report.relationships[0].permissionClass, 'derived');
  assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
  assert.deepEqual(exportFiles(state), before);
});

test('assessment leaves accepted and forbidden current models, native files, Mermaid projections and undo/redo untouched', () => {
  const state = endpointProject(), store = createStore(state), r = registry();
  store.execute({ type: 'renameProject', name: 'Kept' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision);
  const capture = () => ({ state: store.snapshot, revision: store.revision, history: store.history, files: store.exportFiles(),
    bytes: serializeProjectFile(store.snapshot), mermaid: store.snapshot.views.map(entry => exportMermaid(store.snapshot, entry.view.id)) });
  const before = capture();
  const report = assessProject(store.snapshot, r);
  assert.equal(report.localStatus, 'FORBIDDEN'); assert.equal(report.verifiedDirect, 171); assert.equal(report.verifiedDerived, 98);
  assert.deepEqual(report.counts, { ALLOWED: 269, FORBIDDEN: 466, UNKNOWN: 0 });
  assert.equal(report.relationships.length, 735); assert.equal(report.normative.status, 'UNKNOWN');
  frozen(report);
  for (const row of report.relationships) {
    const proof = getVerifiedRelationshipDecision(row);
    assert.deepEqual(proof, Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'relationshipId')));
    assert.equal(getVerifiedRelationshipDecision(proof), proof);
    assert.equal(getVerifiedRelationshipDecision(structuredClone(row)), null);
  }
  assert.deepEqual(capture(), before);
  const reopened = deserializeProjectFile(before.bytes);
  assert.deepEqual(serializeProjectFile(reopened), before.bytes);
  assert.deepEqual(assessProject(reopened, r), report);
  assert.deepEqual(reopened.views.map(entry => exportMermaid(reopened, entry.view.id)), before.mermaid);
  const destination = createStore(createProject('New'));
  loadProjectFile(destination, before.bytes, destination.revision);
  assert.deepEqual(destination.exportFiles(), before.files);
  assert.deepEqual(assessProject(destination.snapshot, r), report);
  assert.deepEqual(capture(), before);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Future');
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
});

test('all 49 independently transcribed cells cover all 15 IDs with exact cell-aware evidence and distinct direct/derived classes', () => {
  const r = registry(), totals = { direct: 0, derived: 0, forbidden: 0 };
  assert.equal(sevenTypeFixture.cells.length, 49);
  assert.deepEqual(endpointFixture.orientation, { source: 'column', target: 'row' });
  for (const cell of sevenTypeFixture.cells) for (const relationshipType of Object.keys(endpointLetters)) {
    const result = evaluate(r, query(cell.source, relationshipType, cell.target));
    assert.deepEqual(result, expectedEndpoint(cell.source, relationshipType, cell.target, sevenTypeFixture));
    assert.equal(getVerifiedRelationshipDecision(result), result); frozen(result);
    if (result.permissionClass) totals[result.permissionClass]++; else totals.forbidden++;
  }
  assert.deepEqual(totals, { direct: 171, derived: 98, forbidden: 466 });
  assert.equal(evaluate(r, query('Process', 'Access', 'DataObject')).permissionClass, 'direct');
  assert.equal(evaluate(r, query('ApplicationComponent', 'Access', 'DataObject')).permissionClass, 'derived');
  assert.equal(evaluate(r, query('ApplicationComponent', 'Aggregation', 'ApplicationInterface')).status, 'ALLOWED');
  assert.equal(evaluate(r, query('ApplicationInterface', 'Aggregation', 'ApplicationComponent')).status, 'FORBIDDEN');
  assert.equal(evaluate(r, query('ApplicationInterface', 'Realization', 'Service')).permissionClass, 'derived');
  assert.equal(evaluate(r, query('ApplicationInterface', 'Assignment', 'Service')).permissionClass, 'direct');
  for (const type of variants) {
    const result = evaluate(r, query('Process', type, 'DataObject'));
    assert.equal(result.permissionClass, 'direct');
    assert.equal(result.sourceEvidence.cell.sourceType, 'Process');
    assert.equal(result.sourceEvidence.cell.targetType, 'DataObject');
    assert.equal(evaluate(r, query('DataObject', type, 'Process')).status, 'FORBIDDEN');
  }
});

test('only genuine source-backed result and report-row identities carry verified authority without inspecting impostors', () => {
  const r = registry(), real = evaluate(r), forbidden = evaluate(r, query('DataObject', 'Access', 'ApplicationComponent'));
  assert.equal(getVerifiedRelationshipDecision(real), real);
  assert.equal(getVerifiedRelationshipDecision(forbidden), forbidden);
  const unknown = evaluate(r, query('Unsupported'));
  assert.equal(getVerifiedRelationshipDecision(unknown), null);
  const localDescriptor = structuredClone(CURRENT_PROFILE);
  localDescriptor.rules = [{ id: 'test-local-allowance', ...query(), status: 'ALLOWED', evidence: 'local' }];
  const localRegistry = createRegistry([localDescriptor]), local = evaluate(localRegistry);
  assert.equal(local.status, 'ALLOWED'); assert.equal(getVerifiedRelationshipDecision(local), null);
  let calls = 0;
  const impostor = { get status() { calls++; throw new Error('Must not read'); } };
  const proxy = new Proxy(real, { get() { calls++; throw new Error('Must not read'); }, ownKeys() { calls++; throw new Error('Must not enumerate'); }, getPrototypeOf() { calls++; throw new Error('Must not inspect'); } });
  const revocable = Proxy.revocable(real, {}); revocable.revoke();
  for (const value of [null, undefined, 0, true, 'ALLOWED', Symbol('proof'), 1n, {}, [], () => real,
    structuredClone(real), JSON.parse(JSON.stringify(real)), { ...real }, Object.create(real), real.sourceEvidence,
    impostor, proxy, revocable.proxy]) assert.equal(getVerifiedRelationshipDecision(value), null);
  assert.equal(calls, 0);
  const state = endpointProject();
  const localReport = assessProject(state, localRegistry);
  assert.equal(localReport.verifiedDirect, 0); assert.equal(localReport.verifiedDerived, 0);
  for (const row of localReport.relationships) assert.equal(getVerifiedRelationshipDecision(row), null);
  const genuineReport = assessProject(state, r);
  assert.equal(getVerifiedRelationshipDecision(genuineReport), null);
  for (const row of genuineReport.relationships) {
    const proof = getVerifiedRelationshipDecision(row);
    assert.ok(proof); assert.notEqual(proof, row); assert.ok(Object.isFrozen(proof));
    assert.equal(Object.hasOwn(proof, 'relationshipId'), false);
    for (const fake of [{ ...row }, structuredClone(row), JSON.parse(JSON.stringify(row))]) assert.equal(getVerifiedRelationshipDecision(fake), null);
  }
  const outside = createProject('Outside verified block');
  outside.elements = [
    { id: fixtureId('el', 1), type: 'Location', name: '', documentation: '', properties: [] },
    { id: fixtureId('el', 2), type: 'DataObject', name: '', documentation: '', properties: [] },
  ];
  outside.relationships = [{ id: fixtureId('rel', 1), type: 'Association', source: { kind: 'element', id: outside.elements[0].id }, target: { kind: 'element', id: outside.elements[1].id }, label: '', documentation: '', properties: [] }];
  const row = assessProject(outside, r).relationships[0];
  assert.equal(row.status, 'ALLOWED'); assert.equal(row.permissionClass, 'direct'); assert.ok(getVerifiedRelationshipDecision(row));
});

test('all 42 reviewed endpoint types retain native bytes, multiview projections and history across a bounded cross-domain sample', () => {
  const types = [...new Set(endpointFixture.cells.map(cell => cell.source))];
  const selected = types.map((source, index) => endpointFixture.cells.find(cell => cell.source === source && cell.target === types[(index + 7) % types.length]));
  assert.equal(selected.length, 42); assert.ok(selected.every(Boolean));
  const state = endpointProject(selected), store = createStore(state), r = registry();
  assert.equal(state.elements.length, 42); assert.equal(state.relationships.length, 630);
  assert.deepEqual(new Set(state.relationships.map(item => item.type)), new Set(Object.keys(endpointLetters)));
  store.execute({ type: 'renameProject', name: 'Preserved edit' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Preserved future' }, store.revision); store.undo(store.revision);
  const before = { bytes: serializeProjectFile(store.snapshot), files: store.exportFiles(), revision: store.revision,
    history: store.history, projections: store.snapshot.views.map(entry => exportMermaid(store.snapshot, entry.view.id)) };
  const report = assessProject(store.snapshot, r);
  assert.equal(report.relationships.length, 630); assert.equal(report.counts.UNKNOWN, 0);
  assert.ok(report.counts.FORBIDDEN > 0); assert.ok(report.verifiedDirect > 0); assert.ok(report.verifiedDerived > 0);
  for (const row of report.relationships) assert.ok(getVerifiedRelationshipDecision(row));
  assert.deepEqual(report.normative, { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' });
  assert.equal(store.revision, before.revision); assert.deepEqual(store.history, before.history);
  assert.deepEqual(store.exportFiles(), before.files); assert.deepEqual(serializeProjectFile(store.snapshot), before.bytes);
  const reopened = deserializeProjectFile(before.bytes);
  assert.deepEqual(serializeProjectFile(reopened), before.bytes);
  assert.deepEqual(assessProject(reopened, r), report);
  assert.deepEqual(reopened.views.map(entry => exportMermaid(reopened, entry.view.id)), before.projections);
  const destination = createStore(createProject('Destination'));
  loadProjectFile(destination, before.bytes, destination.revision);
  assert.deepEqual(destination.exportFiles(), before.files);
  assert.deepEqual(assessProject(destination.snapshot, r), report);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Preserved future');
  store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
});


test('320 independently reconciled new cells retain all 4800 dispositions and composite-specific source cases', () => {
  const added = new Set(['Grouping', 'Location', 'Product', 'Plateau']), r = registry();
  const selected = endpointFixture.cells.filter(cell => added.has(cell.source) || added.has(cell.target));
  const counts = { direct: 0, derived: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  assert.equal(selected.length, 320);
  const sourceCells = [...selected].sort((a, b) => `${a.source}/${a.target}`.localeCompare(`${b.source}/${b.target}`));
  assert.equal(createHash('sha256').update(JSON.stringify(sourceCells)).digest('hex'), 'd9bd64e33b342373d50869f419dcc70344eb477af70aa809e175dc86edd92ea3');
  for (const cell of selected) for (const relationshipType of Object.keys(endpointLetters)) {
    const result = evaluate(r, query(cell.source, relationshipType, cell.target));
    assert.deepEqual(result, expectedEndpoint(cell.source, relationshipType, cell.target));
    assert.equal(getVerifiedRelationshipDecision(result), result); frozen(result);
    counts[result.permissionClass ?? result.status]++;
  }
  assert.deepEqual(counts, { direct: 937, derived: 970, FORBIDDEN: 2885, UNKNOWN: 8 });
  for (const relationshipType of ['Aggregation', 'Composition']) {
    for (const [source, target, status, permissionClass] of [
      ['Product', 'Service', 'ALLOWED', 'direct'], ['Product', 'Grouping', 'ALLOWED', 'derived'],
      ['Product', 'ApplicationComponent', 'FORBIDDEN', null], ['Service', 'Product', 'FORBIDDEN', null],
      ['Product', 'Product', 'ALLOWED', 'direct'], ['Plateau', 'Plateau', 'ALLOWED', 'direct'],
      ['Plateau', 'Goal', 'ALLOWED', 'direct'], ['Plateau', 'Outcome', 'ALLOWED', 'direct'],
      ['Plateau', 'Requirement', 'ALLOWED', 'direct'], ['Plateau', 'Grouping', 'ALLOWED', 'derived'],
      ['Plateau', 'Driver', 'FORBIDDEN', null], ['Location', 'Driver', 'ALLOWED', 'direct'],
    ]) {
      const result = evaluate(r, query(source, relationshipType, target));
      assert.equal(result.status, status); assert.equal(result.permissionClass, permissionClass);
    }
  }
  for (const relationshipType of Object.keys(endpointLetters)) assert.equal(evaluate(r, query('Grouping', relationshipType, 'Grouping')).status, 'ALLOWED');
  const corrected = evaluate(r, query('Product', 'Realization', 'BusinessInterface'));
  assert.equal(corrected.permissionClass, 'derived'); assert.equal(corrected.sourceEvidence.cell.letters, 'Ofrtv');
});

test('exactly eight raw not-listed composite triples carry genuine unresolved source evidence without granting permission', () => {
  const r = registry(), selected = endpointFixture.cells.filter(cell => ['Product', 'Plateau'].includes(cell.source) && ['Deliverable', 'WorkPackage'].includes(cell.target));
  const state = endpointProject(selected), store = createStore(state);
  store.execute({ type: 'renameProject', name: 'Preserved future' }, store.revision); store.undo(store.revision);
  const capture = () => ({ files: store.exportFiles(), bytes: serializeProjectFile(store.snapshot), history: store.history, revision: store.revision });
  const before = capture(), report = assessProject(store.snapshot, r);
  assert.equal(report.counts.UNKNOWN, 8); assert.equal(report.normative.status, 'UNKNOWN');
  for (const source of ['Product', 'Plateau']) for (const target of ['Deliverable', 'WorkPackage']) for (const relationship of ['Aggregation', 'Composition']) {
    const result = evaluate(r, query(source, relationship, target));
    assert.equal(result.status, 'UNKNOWN'); assert.equal(result.permissionClass, null); assert.equal(result.reason, 'source-scope-unresolved');
    assert.equal(result.sourceEvidence.cell.classification, 'not-listed'); assert.equal(result.sourceEvidence.cell.matchedLetter, null);
    assert.doesNotMatch(result.sourceEvidence.cell.letters, /[Gg]/); assert.equal(getVerifiedRelationshipDecision(result), result);
    assert.deepEqual(result.sourceEvidence.qualification.locators, [{ section: '12.4', printedPage: 104, pdfPage: 122 }, { section: 'B.4', printedPage: 139, pdfPage: 157 }]);
    assert.match(result.sourceEvidence.qualification.resolution, /authoritative source evidence/);
    assert.match(result.sourceEvidence.qualification.resolution, /explicitly settles Product\/Plateau aggregation eligibility for that target/);
    assert.match(result.sourceEvidence.qualification.resolution, /Independently review and record exact publication\/hash\/locators/);
    assert.doesNotMatch(result.sourceEvidence.qualification.resolution, /or an independently reviewed source interpretation/); frozen(result);
    for (const fake of [{ ...result }, structuredClone(result), JSON.parse(JSON.stringify(result)), Object.create(result), result.sourceEvidence]) assert.equal(getVerifiedRelationshipDecision(fake), null);
    assert.equal(evaluate(createRegistry([structuredClone(CURRENT_PROFILE)]), query(source, relationship, target)).reason, 'rule-not-found');
  }
  for (const row of report.relationships) assert.ok(getVerifiedRelationshipDecision(row));
  assert.deepEqual(capture(), before);
  const reopened = deserializeProjectFile(before.bytes); assert.deepEqual(serializeProjectFile(reopened), before.bytes); assert.deepEqual(assessProject(reopened, r), report);
  const destination = createStore(createProject('Destination')); loadProjectFile(destination, before.bytes, destination.revision);
  assert.deepEqual(destination.exportFiles(), before.files); assert.deepEqual(assessProject(destination.snapshot, r), report);
  store.redo(store.revision); assert.equal(store.snapshot.project.name, 'Preserved future'); store.undo(store.revision); assert.deepEqual(store.exportFiles(), before.files);
});
