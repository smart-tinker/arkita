import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateProject, normalizeProject, CURRENT_METAMODEL, CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { relationshipProject } from '../../schemka-model-core/fixtures/relationship-project.js';
import { profileId, profileDefinition } from '../../schemka-model-core/fixtures/customization-project.js';
import { CURRENT_PROFILE, createRegistry, evaluateRelationship, evaluateConceptRelationship, getVerifiedRelationshipDecision, getVerifiedConceptDecision, assessProject, assessJunctions, getVerifiedJunctionAssessment, getVerifiedJunctionIssue } from '../src/index.js';
const registry = createRegistry([CURRENT_PROFILE]);
function enhance(state) {
  const candidate = structuredClone(state);
  candidate.customizationProfiles = [{ id: profileId, ...profileDefinition({ status: { type: 'String', default: 'ALLOWED' } }) }];
  for (const item of [...candidate.elements, ...candidate.junctions, ...candidate.relationships]) item.profileApplications = [{ profileId, values: { status: 'ALLOWED' } }];
  return validateProject(candidate);
}
test('customization leaves all 42 × 42 × 15 ordinary decisions byte-equivalent, with exactly eight UNKNOWN and genuine evidence only', () => {
  const state = relationshipProject(), before = JSON.stringify(CURRENT_PROFILE), catalog = JSON.stringify(CURRENT_CATALOG);
  const matrix = model => {
    const result = []; let unknown = 0;
    for (const source of model.elements.slice(0, 42)) for (const target of model.elements.slice(0, 42)) for (const relationship of model.relationships.slice(0, 15)) {
      const decision = evaluateRelationship(registry, model.project.metamodel, { sourceType: source.type, relationshipType: relationship.type, targetType: target.type, scope: 'direct' });
      if (decision.status === 'UNKNOWN') unknown++;
      assert.equal(getVerifiedRelationshipDecision(structuredClone(decision)), null);
      if (decision.sourceEvidence) assert.equal(getVerifiedRelationshipDecision(decision), decision);
      result.push(decision);
    }
    assert.equal(result.length, 26460); assert.equal(unknown, 8); return result;
  };
  assert.deepEqual(matrix(enhance(state)), matrix(state));
  assert.deepEqual(assessProject(enhance(state), registry), assessProject(state, registry));
  assert.equal(assessProject(enhance(state), registry).normative.status, 'UNKNOWN');
  assert.equal(JSON.stringify(CURRENT_PROFILE), before); assert.equal(JSON.stringify(CURRENT_CATALOG), catalog);
});
test('customization preserves all 6448 concept-endpoint decisions and all 38 qualified junction graphs including unresolved aggregation/composition', () => {
  const endpoints = JSON.parse(readFileSync(new URL('./fixtures/concept-endpoints.json', import.meta.url)));
  const base = relationshipProject();
  base.junctions = ['AndJunction', 'OrJunction'].map((type, index) => ({ id: `jct-00000000-0000-4000-8000-00000000000${index + 1}`, type, name: type, documentation: '', properties: [] }));
  const changed = enhance(base);
  const endpoint = (state, kind, type) => ({ kind, type: state[{ element: 'elements', junction: 'junctions', relationship: 'relationships' }[kind]].find(item => item.type === type)?.type ?? type });
  for (const [sk, st, relationshipType, tk, tt, expected] of endpoints.rows) {
    const query = { source: endpoint(base, sk, st), relationshipType, target: endpoint(base, tk, tt), scope: 'direct' };
    const before = evaluateConceptRelationship(registry, CURRENT_METAMODEL, query);
    assert.equal(before.status, expected);
    assert.deepEqual(evaluateConceptRelationship(registry, changed.project.metamodel, { ...query, source: endpoint(changed, sk, st), target: endpoint(changed, tk, tt) }), before);
    assert.equal(getVerifiedConceptDecision(structuredClone(before)), null);
  }
  const graphs = JSON.parse(readFileSync(new URL('./fixtures/junction-graphs.json', import.meta.url)));
  // Keep the captured v2 evidence unchanged; prepare its state through the same pure reader conversion.
  for (const example of graphs.cases) example.state = normalizeProject(example.state);
  const kinds = new Set(); let unresolved = 0;
  for (const example of graphs.cases) {
    const state = enhance(example.state); state.junctions.forEach(item => kinds.add(item.type));
    const before = assessJunctions(example.state, registry), after = assessJunctions(state, registry);
    assert.deepEqual(after, before, example.id);
    assert.deepEqual(assessProject(state, registry), assessProject(example.state, registry), example.id);
    assert.equal(after.normative.status, 'UNKNOWN'); assert.equal(getVerifiedJunctionAssessment(after), after);
    assert.equal(getVerifiedJunctionAssessment(structuredClone(after)), null);
    for (const issue of after.issues) { assert.equal(getVerifiedJunctionIssue(issue), issue); assert.equal(getVerifiedJunctionIssue(structuredClone(issue)), null); if (issue.status === 'UNKNOWN') unresolved++; }
  }
  assert.deepEqual([...kinds].sort(), ['AndJunction', 'OrJunction']); assert.ok(unresolved > 0);
});
