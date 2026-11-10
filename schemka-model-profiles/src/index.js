import { CURRENT_PROFILE } from './current.js';
import { endpointDecision, endpointCoverage } from './endpoint-permissions.js';
import { conceptDecision, junctionEvidence } from './concept-permissions.js';
import { junctionGraph, JUNCTION_ANALYSIS_LIMIT, MAX_JUNCTION_ANALYSIS_LIMIT } from './junction-graph.js';
import { validateProject } from '../../schemka-model-core/src/format.js';
import { PROFILE_LIMITS, ProfileError, copyData, fail, freeze, identifier, record, reference, tripleKey, validateDescriptor } from './descriptor.js';
export { PROFILE_LIMITS, ProfileError } from './descriptor.js';

const registries = new WeakMap();
const verifiedDecisions = new WeakMap();
const verifiedConceptDecisions = new WeakMap();
const verifiedJunctionReports = new WeakMap();
const verifiedJunctionIssues = new WeakMap();
const profileKey = ref => JSON.stringify([ref.id, ref.version]);
const NORMATIVE_REASON = 'overall-conformance-not-assessed';

function safeReference(input) {
  try { return reference(copyData(input)); } catch (error) {
    if (error instanceof ProfileError) return null;
    throw error;
  }
}

function registryData(registry) {
  const data = registries.get(registry);
  if (!data) fail('PROFILE_REGISTRY', 'Expected a registry created by createRegistry');
  return data;
}

function lookup(registry, input) {
  const data = registryData(registry);
  const ref = safeReference(input);
  return ref ? data.get(profileKey(ref)) : undefined;
}

/** No implicit profiles, network access, plugin code or runtime profile imports. */
export function createRegistry(profiles) {
  if (!Array.isArray(profiles) || Object.getPrototypeOf(profiles) !== Array.prototype) fail('PROFILE_SCHEMA', 'Expected an explicit array of built-in descriptors');
  const length = Object.getOwnPropertyDescriptor(profiles, 'length').value;
  if (length > PROFILE_LIMITS.profiles) fail('PROFILE_LIMIT', 'Profile registry limit exceeded');
  const keys = Reflect.ownKeys(profiles);
  if (keys.length !== length + 1) fail('PROFILE_DATA', 'Sparse or extended profile arrays are not supported');
  const data = new Map();
  let bytes = 2; // Brackets for the conceptual registry JSON array.
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(profiles, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('PROFILE_DATA', 'Profile entries must be own enumerable data properties');
    const entry = validateDescriptor(descriptor.value);
    // Authority is object identity supplied by trusted application code, never
    // an ID, metadata claim, serialized marker or structurally identical clone.
    entry.verifiedEndpoints = descriptor.value === CURRENT_PROFILE;
    bytes += entry.bytes + (index ? 1 : 0);
    if (bytes > PROFILE_LIMITS.registryBytes) fail('PROFILE_LIMIT', 'Registry byte limit exceeded');
    const key = profileKey(entry.profile);
    if (data.has(key)) fail('PROFILE_DUPLICATE', 'Duplicate exact profile identity and version');
    data.set(key, entry);
  }
  // Exact key count plus every own index above also excludes extension keys.
  const list = Object.freeze([...data.values()].map(entry => entry.profile));
  const registry = Object.freeze({
    get(input) { return lookup(registry, input)?.profile; },
    list() { return list; },
  });
  registries.set(registry, data);
  return registry;
}

const outcome = (status, reason, ruleId = null) => Object.freeze({ status, permissionClass: null, reason, ruleId, sourceEvidence: null });
const unknown = (reason, ruleId = null) => outcome('UNKNOWN', reason, ruleId);

/** scope: direct queries an explicit stored edge; permissionClass describes the source table. */
export function evaluateRelationship(registry, profileReference, relationship) {
  const entry = lookup(registry, profileReference);
  if (!entry) return unknown('profile-not-found');
  let query;
  try {
    query = copyData(relationship);
    record(query, ['sourceType', 'relationshipType', 'targetType', 'scope']);
    for (const key of ['sourceType', 'relationshipType', 'targetType']) identifier(query[key]);
  } catch (error) {
    if (error instanceof ProfileError) return unknown('invalid-relationship-query');
    throw error;
  }
  if (query.scope !== 'direct') return unknown('unsupported-scope');
  if (!entry.elements.has(query.sourceType) || !entry.elements.has(query.targetType) || !entry.relationships.has(query.relationshipType)) {
    return unknown('type-not-found');
  }
  if (entry.verifiedEndpoints) {
    const verified = endpointDecision(query);
    if (verified) {
      verifiedDecisions.set(verified, verified);
      return verified;
    }
  }
  const rule = entry.rules.get(tripleKey(query));
  if (!rule) return unknown('rule-not-found');
  if (entry.profile.metadata.status !== 'local' || rule.evidence !== 'local') return unknown('unverified-evidence', rule.id);
  if (rule.scope !== 'direct') return unknown('unverified-rule-scope', rule.id);
  return outcome(rule.status, 'explicit-local-rule', rule.id);
}

/** Identity recognition only: never reads fields or invokes caller getters. */
export function getVerifiedRelationshipDecision(value) {
  return verifiedDecisions.get(value) || null;
}

/** Checked code-owned coverage only for an original-profile-authorized entry. */
export function getVerifiedRelationshipCoverage(registry, profileReference) {
  return lookup(registry, profileReference)?.verifiedEndpoints ? endpointCoverage : null;
}

/** Concept types are a distinct query domain; junctions never enter the B.5 matrix. */
export function evaluateConceptRelationship(registry, profileReference, relationship) {
  const entry = lookup(registry, profileReference);
  if (!entry) return unknown('profile-not-found');
  let query;
  try {
    query = copyData(relationship);
    record(query, ['source', 'relationshipType', 'target', 'scope']);
    identifier(query.relationshipType);
    for (const endpoint of [query.source, query.target]) {
      record(endpoint, ['kind', 'type']); identifier(endpoint.type);
      if (!['element', 'junction', 'relationship'].includes(endpoint.kind)) return unknown('unsupported-concept-kind');
    }
  } catch (error) { if (error instanceof ProfileError) return unknown('invalid-concept-query'); throw error; }
  if (query.scope !== 'direct') return unknown('unsupported-scope');
  const types = { element: entry.elements, junction: entry.junctions, relationship: entry.relationships };
  if (!entry.relationships.has(query.relationshipType) || !types[query.source.kind].has(query.source.type) || !types[query.target.kind].has(query.target.type)) return unknown('type-not-found');
  if (query.source.kind === 'element' && query.target.kind === 'element') return evaluateRelationship(registry, profileReference, {
    sourceType: query.source.type, relationshipType: query.relationshipType, targetType: query.target.type, scope: query.scope,
  });
  if (!entry.verifiedEndpoints) return unknown('unverified-concept-evidence');
  const result = conceptDecision(query); verifiedConceptDecisions.set(result, result); return result;
}

/** Identity-only recognizers never inspect caller fields, getters or proxies. */
export function getVerifiedConceptDecision(value) { return verifiedConceptDecisions.get(value) || null; }
export function getVerifiedJunctionAssessment(value) { return verifiedJunctionReports.get(value) || null; }
export function getVerifiedJunctionIssue(value) { return verifiedJunctionIssues.get(value) || null; }

function analysisLimit(options) {
  const data = copyData(options);
  record(data, data && Object.hasOwn(data, 'workLimit') ? ['workLimit'] : []);
  const limit = Object.hasOwn(data, 'workLimit') ? data.workLimit : JUNCTION_ANALYSIS_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_JUNCTION_ANALYSIS_LIMIT) fail('PROFILE_LIMIT', 'Expected a bounded nonnegative junction analysis work limit');
  return limit;
}
function conceptLookup(state) {
  const maps = { element: new Map(state.elements.map(e => [e.id, e])), junction: new Map(state.junctions.map(e => [e.id, e])), relationship: new Map(state.relationships.map(e => [e.id, e])) };
  return ref => ({ kind: ref.kind, type: maps[ref.kind].get(ref.id).type });
}
function graphAssessment(state, registry, limit, describe, focusEdgeId = null) {
  const entry = lookup(registry, state.project.metamodel);
  if (!entry?.verifiedEndpoints) return freeze({ status: 'UNKNOWN', complete: false, reason: entry ? 'unverified-junction-evidence' : 'profile-not-found', issues: [],
    work: { limit, visitedStates: 0, evaluatedPairs: 0, pendingStates: 0 }, normative: { status: 'UNKNOWN', reason: NORMATIVE_REASON } });
  const report = freeze(junctionGraph(state, (source, type, target) => evaluateConceptRelationship(registry, state.project.metamodel, {
    source: describe(source), relationshipType: type, target: describe(target), scope: 'direct',
  }), junctionEvidence, limit, focusEdgeId));
  verifiedJunctionReports.set(report, report);
  for (const issue of report.issues) verifiedJunctionIssues.set(issue, issue);
  return report;
}
export function assessJunctions(state, registry, options = {}) {
  validateProject(state); registryData(registry);
  return graphAssessment(state, registry, analysisLimit(options), conceptLookup(state));
}

/** @internal Command helper: requires a core-validated inert candidate and trusted registry.
 * null means no proved blocker, never ALLOWED or complete graph conformance.
 */
export function assessRelationshipCreation(state, registry, relationshipId) {
  registryData(registry);
  const relationship = state.relationships.find(item => item.id === relationshipId);
  if (!relationship) fail('PROFILE_REFERENCE', 'New relationship does not exist');
  const describe = conceptLookup(state);
  const decision = evaluateConceptRelationship(registry, state.project.metamodel, {
    source: describe(relationship.source), relationshipType: relationship.type,
    target: describe(relationship.target), scope: 'direct',
  });
  const verified = getVerifiedRelationshipDecision(decision) || getVerifiedConceptDecision(decision);
  if (verified?.status === 'FORBIDDEN') return verified;
  if (relationship.source.kind !== 'junction' && relationship.target.kind !== 'junction' && !relationship.junctionRole) return null;
  const report = graphAssessment(state, registry, JUNCTION_ANALYSIS_LIMIT, describe, relationshipId);
  const blockingRules = ['junction-container-role', 'junction-multiplicity-applicability', 'junction-same-family', 'junction-terminal-permission'];
  return report.issues.find(issue => getVerifiedJunctionIssue(issue) && issue.status === 'FAIL'
    && blockingRules.includes(issue.ruleId) && issue.relationshipIds.includes(relationshipId)) || null;
}

/** Read-only semantics, following (and never replacing) authoritative core validation. */
export function assessProject(state, registry) {
  validateProject(state); registryData(registry);
  const profile = { ...state.project.metamodel }, describe = conceptLookup(state);
  const counts = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  let verifiedDirect = 0, verifiedDerived = 0, verifiedConcept = 0;
  const relationships = state.relationships.map(relationship => {
    const result = evaluateConceptRelationship(registry, profile, { source: describe(relationship.source), relationshipType: relationship.type, target: describe(relationship.target), scope: 'direct' });
    counts[result.status]++;
    const verified = getVerifiedRelationshipDecision(result), concept = getVerifiedConceptDecision(result);
    if (verified?.status === 'ALLOWED') {
      if (verified.permissionClass === 'direct') verifiedDirect++;
      else if (verified.permissionClass === 'derived') verifiedDerived++;
    }
    if (concept?.status === 'ALLOWED') verifiedConcept++;
    const row = { relationshipId: relationship.id, ...result };
    if (verified) verifiedDecisions.set(row, verified);
    if (concept) verifiedConceptDecisions.set(row, concept);
    return row;
  });
  const localStatus = counts.FORBIDDEN ? 'FORBIDDEN' : counts.UNKNOWN || !relationships.length ? 'UNKNOWN' : 'ALLOWED';
  return freeze({ profile, localStatus, counts, verifiedDirect, verifiedDerived, verifiedConcept, relationships,
    junctionAssessment: graphAssessment(state, registry, JUNCTION_ANALYSIS_LIMIT, describe),
    normative: { status: 'UNKNOWN', reason: NORMATIVE_REASON },
  });
}

/** Closed application-owned render declarations; no markup, URLs, paths or CSS. */
export function getPresentation(registry, profileReference, kind, type) {
  if (!['element', 'junction', 'relationship'].includes(kind)) fail('PROFILE_KIND', 'Expected element, junction or relationship presentation kind');
  const element = kind === 'element', junction = kind === 'junction';
  const visual = { adapter: element ? 'box' : junction ? 'circle' : 'open-arrow', shape: element ? 'box' : junction ? 'circle' : 'line', marker: element || junction ? 'none' : 'open-arrow' };
  const entry = lookup(registry, profileReference);
  const item = typeof type === 'string' ? (element ? entry?.elements : junction ? entry?.junctions : entry?.relationships)?.get(type) : undefined;
  if (!item) return Object.freeze({ status: 'UNKNOWN', label: element ? 'Unknown element' : junction ? 'Unknown junction' : 'Unknown relationship', ...visual, token: 'unknown', reason: entry ? 'type-not-found' : 'profile-not-found' });
  return Object.freeze({ status: 'KNOWN', label: item.label, ...visual, token: item.presentation.token, reason: 'built-in-adapter' });
}

export { assessMultiplicity } from './multiplicity.js';
export { CURRENT_PROFILE };
