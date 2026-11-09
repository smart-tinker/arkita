import test from 'node:test';
import assert from 'node:assert/strict';
import { conceptUsages, usageVisibilityText } from '../src/concept-usages.js';
import { usageFixture } from './where-used-fixture.js';

test('usages: exact typed concepts retain every drawing across same-name views, independent of same-name concepts', () => {
  const { state, refs, primaryViewId, otherViewId } = usageFixture(), before = structuredClone(state);
  const elements = conceptUsages(state, refs.element);
  assert.equal(elements.length, 4); assert.equal(new Set(elements.map(item => item.id)).size, 4);
  assert.deepEqual(elements.map(item => item.viewId), [primaryViewId, primaryViewId, otherViewId, otherViewId]);
  assert.ok(elements.every(item => item.kind === 'occurrence'));
  assert.equal(conceptUsages(state, refs.junction).length, 2);
  const relationships = conceptUsages(state, refs.relationship);
  assert.equal(relationships.length, 4); assert.ok(relationships.every(item => item.kind === 'connection'));
  assert.equal(relationships.filter(item => item.viewId === primaryViewId).length, 2);
  assert.deepEqual(state, before);
});

test('usages: viewpoint-hidden drawings are retained with their exact exclusion reason', () => {
  const { state, refs, primaryViewId, otherViewId } = usageFixture();
  for (const [reference, reason] of [[refs.element, 'type-excluded'], [refs.relationship, 'endpoint-concept-excluded']]) {
    const items = conceptUsages(state, reference);
    assert.ok(items.filter(item => item.viewId === primaryViewId).every(item => item.hidden && item.reason === reason));
    assert.ok(items.filter(item => item.viewId === otherViewId).every(item => !item.hidden && item.reason === null));
    assert.match(usageVisibilityText(items[0]), /Скрыт viewpoint/);
    assert.ok(usageVisibilityText(items[0]).includes(state.viewpoints[0].id));
    assert.equal(usageVisibilityText(items.at(-1)), 'Показан в виде');
  }
});

test('usages: missing, wrong-kind and undrawn concepts produce no matches and do not infer kind from IDs', () => {
  const { state, refs } = usageFixture();
  for (const concept of [null, {}, { kind: 'element', id: refs.junction.id }, { kind: 'occurrence', id: refs.element.id },
    { kind: 'relationship', id: 'missing' }, refs.unused]) assert.deepEqual(conceptUsages(state, concept), []);
  state.views = []; assert.deepEqual(conceptUsages(state, refs.relationship), []);
});

test('usages: ordering is independent of native array order and returned records are detached', () => {
  const { state, refs } = usageFixture(), expected = conceptUsages(state, refs.relationship);
  state.views.reverse(); for (const entry of state.views) { entry.occurrences.reverse(); entry.connections.reverse(); }
  assert.deepEqual(conceptUsages(state, refs.relationship), expected);
  const detached = conceptUsages(state, refs.relationship); detached[0].viewName = 'Changed';
  assert.deepEqual(conceptUsages(state, refs.relationship), expected);
});
