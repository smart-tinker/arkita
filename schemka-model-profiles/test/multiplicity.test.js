import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, createStore } from '../../schemka-model-core/src/index.js';
import { relationshipProject } from '../../schemka-model-core/fixtures/relationship-project.js';
import { assessMultiplicity, assessProject, createRegistry, CURRENT_PROFILE } from '../src/index.js';

const forms = 'archimate4-section-5.6-p47-pdf65', example = 'archimate4-example-5-16-p48-pdf66';
const expected = (status, reason, sourceEvidence = null) => ({ status, reason, sourceEvidence });

test('missing, explicit empty and explicit star have distinct evidence-only diagnostics without defaults', () => {
  assert.deepEqual(assessMultiplicity(undefined), expected('ABSENT', 'not-specified'));
  assert.deepEqual(assessMultiplicity('*', false), expected('ABSENT', 'not-specified'));
  assert.deepEqual(assessMultiplicity(''), expected('UNVERIFIED', 'empty-text'));
  assert.deepEqual(assessMultiplicity('*'), expected('CONFIRMED_SYNTAX', 'unbounded', forms));
  assert.deepEqual(assessMultiplicity('0'), expected('UNVERIFIED', 'zero-singleton-not-established'));
  for (const value of [null, 1, [], {}, true, undefined]) {
    assert.deepEqual(assessMultiplicity(value, true), expected('UNVERIFIED', 'non-string-input'));
  }
  assert.deepEqual(assessMultiplicity('*', null), expected('UNVERIFIED', 'non-string-input'));
});

test('confirmed spellings follow bounded source evidence, including the explicit 1..* example', () => {
  for (const raw of ['1', '2', '42', '9007199254740993', '9'.repeat(128)]) {
    assert.deepEqual(assessMultiplicity(raw), expected('CONFIRMED_SYNTAX', 'positive-integer', forms));
  }
  for (const raw of ['*', '0..*']) assert.deepEqual(assessMultiplicity(raw), expected('CONFIRMED_SYNTAX', 'unbounded', forms));
  assert.deepEqual(assessMultiplicity('1..*'), expected('CONFIRMED_SYNTAX', 'one-or-more-example', example));
  for (const raw of ['0..1', '0..2', '1..2', '25..100', '9007199254740992..9007199254740993']) {
    assert.deepEqual(assessMultiplicity(raw), expected('CONFIRMED_SYNTAX', 'ascending-bounded-range', forms));
  }
  for (const raw of ['2..*', '9007199254740993..*']) {
    assert.deepEqual(assessMultiplicity(raw), expected('UNVERIFIED', 'local-unbounded-generalization'));
  }
});

test('numeric failures and precision-safe range comparison are diagnostics, never storage prohibitions', () => {
  for (const raw of ['-1', '-1..2', '1..-2', '-1..*', '-0', '-.5']) {
    assert.deepEqual(assessMultiplicity(raw), expected('INVALID_SYNTAX', 'negative-number', forms));
  }
  for (const raw of ['1.5', '.5', '1/2', '1.5..2', '0..2.5', '1/2..3']) {
    assert.deepEqual(assessMultiplicity(raw), expected('INVALID_SYNTAX', 'fractional-number', forms));
  }
  for (const raw of ['0..0', '2..2', '9007199254740993..9007199254740993']) {
    assert.deepEqual(assessMultiplicity(raw), expected('INVALID_SYNTAX', 'equal-range', forms));
  }
  for (const raw of ['2..1', '9007199254740993..9007199254740992']) {
    assert.deepEqual(assessMultiplicity(raw), expected('INVALID_SYNTAX', 'descending-range', forms));
  }
  const state = relationshipProject();
  state.relationships[0].sourceMultiplicity = '-1'; state.relationships[0].targetMultiplicity = '3..2';
  assert.equal(createStore(state).snapshot.relationships[0].sourceMultiplicity, '-1');
});

test('leading zeros, spaces, plus signs and Unicode digits remain unverified exact spellings', () => {
  for (const raw of ['00', '01', '01..2', '0..02', '00..*', '01..*', ' 1', '1 ', '1 ..2', '1.. 2', '1\t..2', '\r\n1\t', ' ', '+1', '1..+2', '１', '١', '𝟙']) {
    assert.deepEqual(assessMultiplicity(raw), expected('UNVERIFIED', 'unverified-numeric-spelling'), raw);
  }
  for (const raw of ['unknown', '<img src=x onerror=alert(1)>', 'NaN', 'Infinity', '1e3', 'n..m', '1...2', '1-2']) {
    assert.deepEqual(assessMultiplicity(raw), expected('UNVERIFIED', 'unrecognized-text'));
  }
  assert.deepEqual(assessMultiplicity('9'.repeat(129)), expected('UNVERIFIED', 'local-input-limit'));
  assert.equal(assessMultiplicity('😀'.repeat(64)).reason, 'unrecognized-text');
  assert.equal(assessMultiplicity('😀'.repeat(64) + 'x').reason, 'local-input-limit');
  assert.equal(LIMITS.multiplicity, 128);
});

test('syntax diagnostics are frozen, detached from files/history and do not change relationship or normative assessments', () => {
  const state = relationshipProject(), registry = createRegistry([CURRENT_PROFILE]);
  const beforeReport = assessProject(state, registry);
  state.relationships[0].sourceMultiplicity = '1..*'; state.relationships[0].targetMultiplicity = 'invalid raw';
  const store = createStore(state);
  store.execute({ type: 'renameProject', name: 'Kept' }, store.revision);
  store.execute({ type: 'renameProject', name: 'Future' }, store.revision); store.undo(store.revision);
  const capture = () => ({ state: store.snapshot, files: store.exportFiles(), revision: store.revision, history: store.history });
  const before = capture();
  for (const relation of store.snapshot.relationships) for (const field of ['sourceMultiplicity', 'targetMultiplicity']) {
    const result = assessMultiplicity(relation[field], Object.hasOwn(relation, field));
    assert.ok(Object.isFrozen(result)); assert.deepEqual(Object.keys(result), ['status', 'reason', 'sourceEvidence']);
  }
  assert.deepEqual(assessProject(store.snapshot, registry), beforeReport);
  assert.equal(beforeReport.normative.status, 'UNKNOWN');
  assert.deepEqual(capture(), before);
});
