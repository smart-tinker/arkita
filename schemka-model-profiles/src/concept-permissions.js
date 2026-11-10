import { CURRENT_CATALOG } from '../../schemka-model-core/src/current-catalog.js';
import { endpointDecision } from './endpoint-permissions.js';
import { freeze } from './descriptor.js';
import { relationshipFamily } from './junction-graph.js';

const SOURCE = { publication: 'C260', sha256: 'a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093' };
const clause = (section, printedPages, pdfPages) => ({ section, printedPages, pdfPages });
const clauses = freeze({
  concepts: clause('Chapter 5 introduction', [30], [48]),
  composition: clause('5.1.2', [31], [49]),
  access: clause('5.2.2', [38], [56]),
  association: clause('5.2.4', [40], [58]),
  junction: clause('5.5.1', [45, 46], [63, 64]),
  multiplicity: clause('5.6', [47], [65]),
  derived: clause('5.8', [49, 50], [67, 68]),
  plateau: clause('12.4', [104], [122]),
  table: clause('B.6 Table B-1 and footnotes', [146], [164]),
});
const codes = { Composition: 'g', Aggregation: 'g', Assignment: 'i', Realization: 'r', Serving: 'v', Access: 'a', Influence: 'n', Association: 'o', Triggering: 't', Flow: 'f', Specialization: 's' };
const junctionFamilies = new Set(['Access', 'Flow', 'Assignment', 'Influence', 'Association', 'Realization', 'Triggering', 'Serving']);
const composites = new Set(['Grouping', 'Location', 'Plateau']);
const eligibility = new Map();
const qualification = freeze({
  id: 'junction-aggregation-composition-source-scope',
  reason: 'B.6 omits the aggregation/composition code at junction endpoints while section 5.5.1 discusses aggregation transit and containing aggregation. The exact source scope remains unresolved; this is not a claim of contradiction.',
  resolution: 'A scoped authoritative clarification, applicable erratum or verified replacement specification must explicitly settle these endpoint cases, followed by independent review and recorded publication, hash and exact locators. No blanket default is permitted.',
});

function eligible(type, family, role) {
  const key = JSON.stringify([type, family, role]);
  if (eligibility.has(key)) return eligibility.get(key);
  let unknown = false, witness = null;
  for (const other of CURRENT_CATALOG.elementTypes) {
    const query = { sourceType: role === 'source' ? type : other, relationshipType: family, targetType: role === 'target' ? type : other, scope: 'direct' };
    const result = endpointDecision(query);
    if (result?.status === 'ALLOWED') { witness = result.sourceEvidence; break; }
    if (!result || result.status === 'UNKNOWN') unknown = true;
  }
  const result = { status: witness ? 'ALLOWED' : unknown ? 'UNKNOWN' : 'FORBIDDEN', witness };
  eligibility.set(key, result); return result;
}

// Invoked only behind the original-profile identity check in index.js.
export function conceptDecision(query) {
  const { source, target, relationshipType } = query, family = relationshipFamily(relationshipType);
  const hasJunction = source.kind === 'junction' || target.kind === 'junction';
  let status = 'FORBIDDEN', reason = 'verified-concept-forbidden', listed = '', footnote = null, eligibilityWitness = null;
  if (source.kind === 'relationship' && target.kind === 'relationship') {
    reason = 'relationship-to-relationship-prohibited';
  } else if (hasJunction && ['Aggregation', 'Composition'].includes(family)) {
    status = 'UNKNOWN'; reason = 'source-scope-unresolved';
    listed = source.kind === 'relationship' || target.kind === 'relationship' ? 'o' : 'afinortv';
  } else if (source.kind === 'relationship' || target.kind === 'relationship') {
    listed = source.kind === 'element' && composites.has(source.type) ? 'go' : 'o';
    if (family === 'Association' || (listed === 'go' && ['Aggregation', 'Composition'].includes(family))) status = 'ALLOWED';
  } else if (hasJunction) {
    listed = 'afinortv';
    if (junctionFamilies.has(family)) {
      if (source.kind === 'junction' && target.kind === 'junction') status = 'ALLOWED';
      else if (source.kind === 'element' && source.type === 'Grouping') status = 'ALLOWED';
      else {
        const role = source.kind === 'element' ? 'source' : 'target', type = role === 'source' ? source.type : target.type;
        footnote = 'possible-element-' + role;
        const result = eligible(type, family, role); status = result.status; eligibilityWitness = result.witness;
        if (status === 'UNKNOWN') reason = 'element-port-eligibility-unresolved';
      }
    }
  }
  if (status === 'ALLOWED') reason = 'verified-concept-permission';
  const sourceEvidence = freeze({ id: 'archimate4-concept-endpoints-b6', basis: 'concept-rule', ...SOURCE,
    table: { section: 'B.6', printedPage: 146, pdfPage: 164 }, query,
    family: { baseRelationship: family, tableCode: codes[family] },
    cell: { sourceCategory: source.kind === 'element' ? source.type : source.kind === 'junction' ? 'Junction' : 'Relationship', targetCategory: target.kind === 'element' ? target.type : target.kind === 'junction' ? 'Junction' : 'Relationship', letters: listed, footnote, encoding: 'normalized-family-set-no-direct-derived-case-semantics' },
    clauses: [clauses.concepts, clauses.table, ...(family === 'Composition' ? [clauses.composition] : []), ...(family === 'Association' ? [clauses.association] : []), ...(family === 'Access' ? [clauses.access] : []), ...(hasJunction ? [clauses.junction] : [])],
    eligibilityWitness, qualification: hasJunction && ['Aggregation', 'Composition'].includes(family) ? qualification : null,
  });
  return freeze({ status, permissionClass: null, reason, ruleId: ['am4-concept', source.kind, source.type, relationshipType, target.kind, target.type].join('-'), sourceEvidence });
}

export function junctionEvidence(ruleId) {
  const localBoundary = ['junction-cycle-scope', 'junction-analysis-coverage', 'junction-terminal-coverage'].includes(ruleId);
  return freeze({ id: 'archimate4-' + ruleId, basis: 'junction-rule', ...SOURCE,
    clauses: ruleId === 'junction-multiplicity-applicability' ? [clauses.multiplicity]
      : ruleId === 'junction-local-port' ? [clauses.table]
        : ruleId === 'junction-container-role' ? [clauses.junction, clauses.plateau, clauses.table]
          : ruleId === 'junction-terminal-permission' ? [clauses.junction, clauses.derived, clauses.concepts]
            : [clauses.junction],
    interpretation: localBoundary ? 'Local conservative analysis boundary; no normative cycle or resource-limit prohibition is inferred.' : 'Only the named bounded source check; no whole-model conformance.',
  });
}
