import { assertJSON, fail, record, text } from './json.js';
import { CURRENT_CATALOG } from './current-catalog.js';

export const VIEWPOINT_PURPOSES = Object.freeze(['designing', 'deciding', 'informing']);
export const VIEWPOINT_CONTENTS = Object.freeze(['details', 'coherence', 'overview']);
export const VIEWPOINT_FIELDS = Object.freeze(['name', 'documentation', 'stakeholders', 'concerns', 'purpose', 'content', 'selection', 'representation']);
const kinds = [['element', 'elements'], ['junction', 'junctions'], ['relationship', 'relationships']];
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const key = ref => `${ref.kind}:${ref.id}`;
function nonblank(value) { text(value); if (!value.trim()) fail('SCHEMA', 'Viewpoint names, stakeholders and concerns must not be blank'); }
function subset(values, vocabulary, minimum = 0) {
  if (!Array.isArray(values) || values.length < minimum || new Set(values).size !== values.length || values.some(value => !vocabulary.includes(value))) {
    fail('SCHEMA', 'Expected unique, exact viewpoint labels or catalog types');
  }
}
export function validateViewpoint(definition) {
  record(definition, ['id', ...VIEWPOINT_FIELDS]);
  nonblank(definition.name); text(definition.documentation);
  for (const field of ['stakeholders', 'concerns']) {
    const values = definition[field];
    if (!Array.isArray(values) || !values.length) fail('SCHEMA', 'Viewpoint stakeholders and concerns must be nonempty lists');
    if (values.length > 64) fail('LIMIT', 'At most 64 stakeholders or concerns');
    values.forEach(nonblank);
  }
  subset(definition.purpose, VIEWPOINT_PURPOSES, 1); subset(definition.content, VIEWPOINT_CONTENTS, 1);
  record(definition.selection, ['elementTypes', 'junctionTypes', 'relationshipTypes']);
  for (const [kind] of kinds) subset(definition.selection[`${kind}Types`], CURRENT_CATALOG[`${kind}Types`]);
  record(definition.representation, ['kind', 'notation', 'labels']);
  if (definition.representation.kind !== 'diagram' || definition.representation.notation !== 'archimate' || definition.representation.labels !== 'name-and-type') {
    fail('SCHEMA', 'Only the existing ArchiMate diagram with names and types is supported');
  }
}

// Remove exclusions through dependents, starting with all matches. Cycles survive.
function excludeDependents(records, eligible, endpoints, endpointKey, reason, exclusions) {
  const dependents = new Map(), queue = [];
  for (const item of records) {
    for (const end of endpoints(item)) {
      const id = endpointKey(end);
      if (!dependents.has(id)) dependents.set(id, []);
      dependents.get(id).push(item.id);
      if (eligible.has(item.id) && !eligible.has(id)) {
        eligible.delete(item.id); exclusions.set(item.id, reason); queue.push(item.id);
      }
    }
  }
  for (let i = 0; i < queue.length; i++) for (const id of dependents.get(queue[i]) ?? []) {
    if (eligible.delete(id)) { exclusions.set(id, reason); queue.push(id); }
  }
}

/** Pure selection over a validated native snapshot. No normative authority. */
export function selectViewpointConcepts(state, viewpointId) {
  assertJSON(state);
  if (typeof viewpointId !== 'string') fail('REFERENCE', 'Expected a viewpoint ID');
  const definition = state.viewpoints?.find(item => item.id === viewpointId);
  if (!definition) fail('REFERENCE', 'Viewpoint does not exist');
  validateViewpoint(definition);
  const eligible = new Set(), excluded = new Map();
  for (const [kind, collection] of kinds) for (const item of state[collection]) {
    if (definition.selection[`${kind}Types`].includes(item.type)) eligible.add(item.id);
    else excluded.set(item.id, 'type-excluded');
  }
  excludeDependents(state.relationships, eligible, item => [item.source, item.target], end => end.id, 'endpoint-concept-excluded', excluded);
  return {
    viewpointId,
    ...Object.fromEntries(kinds.map(([kind, collection]) => [`${kind}Ids`, state[collection].filter(item => eligible.has(item.id)).map(item => item.id).sort()])),
    excludedConcepts: kinds.flatMap(([kind, collection]) => state[collection].filter(item => excluded.has(item.id)).map(item => ({ kind, id: item.id, reason: excluded.get(item.id) }))).sort(byId),
  };
}

/** Detached drawing projection; exact host, anchor and occurrence identity is retained. */
export function projectView(state, viewId) {
  assertJSON(state);
  if (typeof viewId !== 'string') fail('REFERENCE', 'Expected a view ID');
  const entry = state.views.find(item => item.view.id === viewId);
  if (!entry) fail('REFERENCE', 'View does not exist');
  const selection = entry.view.viewpointId ? selectViewpointConcepts(state, entry.view.viewpointId) : {
    viewpointId: null, ...Object.fromEntries(kinds.map(([kind, collection]) => [`${kind}Ids`, state[collection].map(item => item.id).sort()])), excludedConcepts: [],
  };
  const concepts = new Set(kinds.flatMap(([kind]) => selection[`${kind}Ids`])), drawings = new Set(), excluded = new Map();
  const conceptReasons = new Map(selection.excludedConcepts.map(item => [item.id, item.reason]));
  for (const item of entry.occurrences) {
    if (concepts.has(item.concept.id)) drawings.add(item.id); else excluded.set(item.id, conceptReasons.get(item.concept.id));
  }
  for (const item of entry.connections) {
    if (concepts.has(item.relationshipId)) drawings.add(item.id); else excluded.set(item.id, conceptReasons.get(item.relationshipId));
  }
  excludeDependents(entry.connections, drawings, item => [item.source, item.target], end => end.id, 'drawing-endpoint-excluded', excluded);
  const occurrences = entry.occurrences.filter(item => drawings.has(item.id));
  const connections = entry.connections.filter(item => drawings.has(item.id));
  const visualNodes = entry.visualNodes;
  const visibleVisual = new Set([...drawings, ...visualNodes.map(item => item.id), ...entry.visualConnectors.map(item => item.id)]);
  excludeDependents(entry.visualConnectors, visibleVisual, item => [item.source, item.target], end => end.id, 'drawing-endpoint-excluded', new Map());
  const visualConnectors = entry.visualConnectors.filter(item => visibleVisual.has(item.id));
  const drawn = new Set([...occurrences.map(item => key(item.concept)), ...connections.map(item => `relationship:${item.relationshipId}`)]);
  return structuredClone({
    view: entry.view, occurrences, connections, visualNodes, visualConnectors, ...selection,
    excludedDrawings: [...entry.occurrences.map(item => ({ kind: 'occurrence', id: item.id })), ...entry.connections.map(item => ({ kind: 'connection', id: item.id }))]
      .filter(item => excluded.has(item.id)).map(item => ({ ...item, reason: excluded.get(item.id) })).sort(byId),
    undrawnConcepts: kinds.flatMap(([kind]) => selection[`${kind}Ids`].filter(id => !drawn.has(`${kind}:${id}`)).map(id => ({ kind, id }))).sort(byId),
  });
}
