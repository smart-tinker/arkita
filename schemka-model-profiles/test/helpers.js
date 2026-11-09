export const testReference = { id: 'synthetic-fixture', version: 1 };
export const testQuery = { sourceType: 'FixtureNode', relationshipType: 'FixtureRelation', targetType: 'FixtureNode', scope: 'direct' };
export function testProfile() {
  return {
    ...testReference, label: 'Synthetic fixture',
    metadata: { source: 'Original test-only descriptor', license: 'Original test data', status: 'local' },
    elementTypes: [{ id: 'FixtureNode', label: 'Fixture Node', presentation: { adapter: 'box', token: 'neutral' } }],
    junctionTypes: [],
    relationshipTypes: [{ id: 'FixtureRelation', label: 'Fixture Relation', presentation: { adapter: 'open-arrow', token: 'neutral' } }],
    rules: [{ id: 'synthetic-rule', ...testQuery, status: 'ALLOWED', evidence: 'local' }],
  };
}

/** Synthetic vocabulary exists only in tests, never in the shipped catalog. */
export function synthetic() {
  return {
    id: 'synthetic-test', version: 1, label: 'Synthetic test profile',
    metadata: { source: 'Test fixture invented for this suite', license: 'Original test data', status: 'local' },
    elementTypes: ['Alpha', 'Beta', 'Gamma'].map(id => ({ id, label: id, presentation: { adapter: 'box', token: 'neutral' } })),
    junctionTypes: [],
    relationshipTypes: [{ id: 'Connect', label: 'Connect', presentation: { adapter: 'open-arrow', token: 'neutral' } }],
    rules: [
      { id: 'alpha-beta', sourceType: 'Alpha', relationshipType: 'Connect', targetType: 'Beta', status: 'ALLOWED', scope: 'direct', evidence: 'local' },
      { id: 'beta-alpha', sourceType: 'Beta', relationshipType: 'Connect', targetType: 'Alpha', status: 'FORBIDDEN', scope: 'direct', evidence: 'local' },
    ],
  };
}

export function heavyProfile(id = 'heavy-profile', width = 32, idLength = 64) {
  const profile = synthetic();
  profile.id = id;
  const name = (prefix, index) => (prefix + index).padEnd(idLength, 'x');
  profile.elementTypes = Array.from({ length: width }, (_, index) => ({ id: name('Type', index), label: `Type ${index}`, presentation: { adapter: 'box', token: 'neutral' } }));
  profile.relationshipTypes[0].id = name('Rel', 0);
  profile.rules = profile.elementTypes.flatMap((source, i) => profile.elementTypes.map((target, j) => ({
    id: name('Rule', i * width + j), sourceType: source.id, relationshipType: profile.relationshipTypes[0].id, targetType: target.id,
    status: 'ALLOWED', scope: 'direct', evidence: 'local',
  })));
  return profile;
}
