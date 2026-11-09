import { readFileSync } from 'node:fs';

// Test-only oracle: independently checked source facts, never runtime rules,
// evaluator output, the built-in profile, or its provenance objects.
const ledger = JSON.parse(readFileSync(new URL('../../docs/ENDPOINT-RULES.json', import.meta.url), 'utf8'));
export const verifiedElementTypes = Object.freeze([...ledger.element_ids]);
export const excludedElementTypes = Object.freeze([...ledger.excluded_element_ids]);
export const verifiedRelationshipTypes = Object.freeze([...ledger.relationship_ids]);
const cells = new Map(ledger.cells.map(cell => [JSON.stringify([cell.source, cell.target]), cell.letters]));
const families = new Map(ledger.relationship_families.flatMap(family => family.relationship_ids.map(id => [id, family.letter])));

export function expectedEndpointDecision(sourceType, relationshipType, targetType) {
  const letters = cells.get(JSON.stringify([sourceType, targetType]));
  const family = families.get(relationshipType);
  if (letters === undefined || family === undefined) return { status: 'UNKNOWN', permissionClass: null };
  if (ledger.source_ambiguities.triples.some(item => item.source === sourceType && item.relationship === relationshipType && item.target === targetType)) return { status: 'UNKNOWN', permissionClass: null, reason: 'source-scope-unresolved' };
  if (letters.includes(family.toUpperCase())) return { status: 'ALLOWED', permissionClass: 'direct' };
  if (letters.includes(family.toLowerCase())) return { status: 'ALLOWED', permissionClass: 'derived' };
  return { status: 'FORBIDDEN', permissionClass: null };
}
