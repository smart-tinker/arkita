import { assertJSON, fail, record } from './json.js';
import { validateProject, projectIndex, conceptRecord, newId } from './format.js';
import { CURRENT_CATALOG } from './current-catalog.js';
import { selectViewpointConcepts, projectView } from './viewpoints.js';

export const MODEL_GRAPH_LIMIT = 256;
const kinds = [['element', 'elements'], ['junction', 'junctions'], ['relationship', 'relationships']];
const key = ref => `${ref.kind}:${ref.id}`;
const compare = (a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
const ref = (kind, id) => ({ kind, id });

function references(index, values, minimum = 1) {
  if (!Array.isArray(values) || values.length < minimum || values.length > MODEL_GRAPH_LIMIT) fail('LIMIT', `Choose ${minimum}–${MODEL_GRAPH_LIMIT} concepts`);
  const unique = new Map();
  for (const value of values) { conceptRecord(index, value); unique.set(key(value), { ...value }); }
  return [...unique.values()].sort(compare);
}
function allowedConcepts(state, options = {}) {
  const viewpoint = options.viewpointId ? selectViewpointConcepts(state, options.viewpointId) : null;
  const allowed = new Set(), reasons = new Map();
  for (const [kind, collection] of kinds) {
    const field = `${kind}Types`, types = options[field];
    if (types !== undefined && (!Array.isArray(types) || new Set(types).size !== types.length || types.some(type => !CURRENT_CATALOG[field].includes(type)))) fail('TYPE', 'Expected exact unique catalog type IDs');
    const viewpointIds = viewpoint && new Set(viewpoint[`${kind}Ids`]);
    for (const item of state[collection]) {
      const id = key(ref(kind, item.id));
      if (viewpointIds && !viewpointIds.has(item.id)) reasons.set(id, 'viewpoint');
      else if (types && !types.includes(item.type)) reasons.set(id, 'type-filter');
      else allowed.add(id);
    }
  }
  // A hidden endpoint also hides dependent relationships, including dependent cycles.
  const dependents = new Map(), queue = [...reasons.keys()];
  for (const item of state.relationships) for (const endpoint of [item.source, item.target]) {
    const id = key(endpoint);
    if (!dependents.has(id)) dependents.set(id, []);
    dependents.get(id).push(`relationship:${item.id}`);
  }
  for (let at = 0; at < queue.length; at++) for (const id of dependents.get(queue[at]) ?? []) {
    if (allowed.delete(id)) { reasons.set(id, 'endpoint-filter'); queue.push(id); }
  }
  return { allowed, reasons };
}

/** Read-only, typed incidence graph. One hop crosses an existing relationship, never infers one. */
export function queryModelGraph(state, options) {
  validateProject(state); assertJSON(options);
  record(options, ['roots'], ['depth', 'direction', 'viewpointId', 'elementTypes', 'junctionTypes', 'relationshipTypes', 'limit']);
  const index = projectIndex(state), roots = references(index, options.roots);
  const depth = options.depth ?? 1, direction = options.direction ?? 'both', limit = options.limit ?? MODEL_GRAPH_LIMIT;
  if (!Number.isInteger(depth) || depth < 0 || depth > 8 || !Number.isInteger(limit) || limit < 1 || limit > MODEL_GRAPH_LIMIT) fail('LIMIT', 'Graph depth must be 0–8 and size 1–256');
  if (!['incoming', 'outgoing', 'both'].includes(direction)) fail('SCHEMA', 'Expected graph direction');
  if (options.viewpointId !== undefined && options.viewpointId !== null && typeof options.viewpointId !== 'string') fail('REFERENCE', 'Expected viewpoint ID');
  const { allowed, reasons } = allowedConcepts(state, options), outgoing = new Map(), incoming = new Map();
  for (const relation of [...state.relationships].sort((a, b) => a.id < b.id ? -1 : 1)) {
    for (const [map, endpoint] of [[outgoing, relation.source], [incoming, relation.target]]) {
      const id = key(endpoint);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(relation);
    }
  }
  const nodes = new Map(), queue = [], omitted = new Map(); let truncated = false;
  function include(value, distance) {
    const id = key(value);
    if (nodes.has(id)) return true;
    if (!allowed.has(id)) { omitted.set(id, { ...value, reason: reasons.get(id) }); return false; }
    if (nodes.size >= limit) { truncated = true; return false; }
    const item = conceptRecord(index, value);
    nodes.set(id, { ...value, type: item.type, name: item.name ?? item.label ?? '', depth: distance, root: roots.some(root => key(root) === id) });
    queue.push(value); return true;
  }
  roots.forEach(value => include(value, 0));
  for (let at = 0; at < queue.length; at++) {
    const value = queue[at], distance = nodes.get(key(value)).depth;
    if (distance >= depth) continue;
    if (value.kind === 'relationship') {
      const relation = index.relationship.get(value.id);
      if (direction !== 'outgoing') include(relation.source, distance + 1);
      if (direction !== 'incoming') include(relation.target, distance + 1);
    }
    const candidates = new Map();
    if (direction !== 'incoming') for (const relation of outgoing.get(key(value)) ?? []) candidates.set(relation.id, [relation, relation.target]);
    if (direction !== 'outgoing') for (const relation of incoming.get(key(value)) ?? []) candidates.set(relation.id, [relation, relation.source]);
    for (const [relation, neighbor] of candidates.values()) {
      if (!allowed.has(`relationship:${relation.id}`)) {
        omitted.set(`relationship:${relation.id}`, { kind: 'relationship', id: relation.id, reason: reasons.get(`relationship:${relation.id}`) });
        continue;
      }
      // Reserve room for both the relationship concept and its opposite endpoint.
      const needed = [ref('relationship', relation.id), neighbor].filter((value, i, values) => !nodes.has(key(value)) && values.findIndex(other => key(value) === key(other)) === i);
      if (nodes.size + needed.length > limit) { truncated = true; continue; }
      include(ref('relationship', relation.id), distance + 1); include(neighbor, distance + 1);
    }
  }
  const relationships = state.relationships.filter(item => nodes.has(`relationship:${item.id}`)).map(item => ({
    id: item.id, source: { ...item.source }, target: { ...item.target },
    sourceVisible: nodes.has(key(item.source)), targetVisible: nodes.has(key(item.target)),
  })).sort((a, b) => a.id < b.id ? -1 : 1);
  return { roots, depth, direction, limit, nodes: [...nodes.values()].sort((a, b) => a.depth - b.depth || compare(a, b)), relationships,
    hiddenRoots: roots.filter(value => !allowed.has(key(value))).map(value => ({ ...value, reason: reasons.get(key(value)) })),
    excluded: [...omitted.values()].sort(compare), truncated, visited: queue.length,
    boundaryRelationships: relationships.filter(item => !item.sourceVisible || !item.targetVisible).map(item => item.id) };
}

/** Explicit preview for one new view; endpoint support is listed before the command commits. */
export function planGeneratedView(state, options) {
  validateProject(state); assertJSON(options);
  record(options, ['concepts'], ['relationshipMode', 'viewpointId']);
  const index = projectIndex(state), requested = references(index, options.concepts), selected = new Set(requested.map(key));
  const mode = options.relationshipMode ?? 'selected';
  if (!['selected', 'between'].includes(mode)) fail('SCHEMA', 'Expected selected or between relationships');
  if (options.viewpointId !== undefined && options.viewpointId !== null && typeof options.viewpointId !== 'string') fail('REFERENCE', 'Expected viewpoint ID');
  const { allowed, reasons } = allowedConcepts(state, options);
  const included = new Map(), queue = [], excluded = [];
  function include(value) {
    const id = key(value);
    if (included.has(id)) return;
    if (included.size >= MODEL_GRAPH_LIMIT) fail('LIMIT', `The generated view exceeds ${MODEL_GRAPH_LIMIT} concepts including endpoint dependencies. Narrow the selection.`);
    included.set(id, { ...value }); queue.push(value);
  }
  for (const value of requested) {
    if (allowed.has(key(value))) include(value);
    else excluded.push({ ...value, reason: reasons.get(key(value)) });
  }
  // Explicitly chosen relationship concepts include the full finite endpoint closure.
  for (let at = 0; at < queue.length; at++) if (queue[at].kind === 'relationship') {
    const relation = index.relationship.get(queue[at].id);
    include(relation.source); include(relation.target);
  }
  if (mode === 'between') {
    const candidates = new Set(state.relationships.filter(item => allowed.has(`relationship:${item.id}`)).map(item => item.id));
    const dependents = new Map(), removed = [];
    for (const item of state.relationships) {
      for (const endpoint of [item.source, item.target]) {
        if (endpoint.kind === 'relationship') {
          if (!dependents.has(endpoint.id)) dependents.set(endpoint.id, []);
          dependents.get(endpoint.id).push(item.id);
        }
        if ((endpoint.kind !== 'relationship' && !included.has(key(endpoint))) || (endpoint.kind === 'relationship' && !candidates.has(endpoint.id))) {
          if (candidates.delete(item.id)) removed.push(item.id);
        }
      }
    }
    for (let at = 0; at < removed.length; at++) for (const id of dependents.get(removed[at]) ?? []) if (candidates.delete(id)) removed.push(id);
    const adjacency = new Map();
    for (const item of state.relationships) if (candidates.has(item.id)) for (const endpoint of [item.source, item.target]) {
      if (!adjacency.has(key(endpoint))) adjacency.set(key(endpoint), []);
      adjacency.get(key(endpoint)).push(ref('relationship', item.id));
    }
    // Reach only components attached to the user's selection, not unrelated relationship cycles.
    for (let at = 0; at < queue.length; at++) {
      for (const related of adjacency.get(key(queue[at])) ?? []) include(related);
      if (queue[at].kind === 'relationship') {
        const item = index.relationship.get(queue[at].id); include(item.source); include(item.target);
      }
    }
  }
  const concepts = [...included.values()].sort(compare);
  return { concepts, support: concepts.filter(value => !selected.has(key(value))), excluded,
    occurrenceCount: concepts.filter(value => value.kind !== 'relationship').length,
    connectionCount: concepts.filter(value => value.kind === 'relationship').length,
    viewpointId: options.viewpointId ?? null, relationshipMode: mode };
}

/** @internal Called on a validated store candidate; ID allocation and insertion remain one command. */
export function generateViewInto(state, command) {
  const plan = planGeneratedView(state, { concepts: command.concepts, relationshipMode: command.relationshipMode, viewpointId: command.viewpointId });
  if (!plan.concepts.length) fail('REFERENCE', 'The selected filters exclude every concept');
  const index = projectIndex(state), ordinary = plan.concepts.filter(item => item.kind !== 'relationship'), relations = plan.concepts.filter(item => item.kind === 'relationship');
  const occurrenceIds = new Map(ordinary.map(item => [key(item), newId('occ')])), connectionIds = new Map(relations.map(item => [item.id, newId('conn')]));
  const anchorIds = new Map(relations.map(item => [item.id, newId('anc')]));
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordinary.length))), centers = new Map();
  const occurrences = ordinary.map((item, at) => {
    const size = item.kind === 'junction' ? { width: 32, height: 32 } : { width: 220, height: 90 };
    const bounds = { x: 40 + at % columns * 300, y: 40 + Math.floor(at / columns) * 190, ...size };
    centers.set(key(item), { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    return { id: occurrenceIds.get(key(item)), concept: { ...item }, bounds, parent: null, style: {}, zIndex: at };
  });
  const anchors = new Map(relations.map((item, at) => {
    const relation = index.relationship.get(item.id), source = centers.get(key(relation.source)), target = centers.get(key(relation.target));
    const point = source && target && key(relation.source) !== key(relation.target)
      ? { x: Math.round((source.x + target.x) * 5) / 10, y: Math.round((source.y + target.y) * 5) / 10 + (at % 3 - 1) * 24 }
      : { x: 190 + at % Math.max(columns, 2) * 300, y: 160 + Math.floor(at / Math.max(columns, 2)) * 190 };
    return [item.id, point];
  }));
  const endpoint = value => value.kind === 'relationship'
    ? { kind: 'connection', id: connectionIds.get(value.id), anchorId: anchorIds.get(value.id) }
    : { kind: 'occurrence', id: occurrenceIds.get(key(value)) };
  const connections = relations.map(item => {
    const relation = index.relationship.get(item.id), point = anchors.get(item.id);
    return { id: connectionIds.get(item.id), relationshipId: item.id, source: endpoint(relation.source), target: endpoint(relation.target),
      routePoints: [{ kind: 'anchor', id: anchorIds.get(item.id), point }], labelPosition: { x: point.x, y: point.y - 10 }, style: {} };
  });
  const view = { id: newId('view'), name: command.name, documentation: '', properties: [] };
  if (plan.viewpointId) view.viewpointId = plan.viewpointId;
  state.views.push({ view, occurrences, connections, visualNodes: [], visualConnectors: [] });
  return { viewId: view.id, occurrenceIds: [...occurrenceIds.values()], connectionIds: [...connectionIds.values()] };
}

export const MODEL_QUALITY_RULES = Object.freeze(['empty-views', 'unused-concepts', 'duplicate-names', 'viewpoint-hidden', 'nesting-review']);

/** Quality suggestions are local conventions, never ArchiMate conformance decisions. */
export function analyzeModelQuality(state, rules = MODEL_QUALITY_RULES) {
  validateProject(state); assertJSON(rules);
  if (!Array.isArray(rules) || new Set(rules).size !== rules.length || rules.some(rule => !MODEL_QUALITY_RULES.includes(rule))) fail('SCHEMA', 'Expected unique quality rule IDs');
  const enabled = new Set(rules), issues = [], used = new Set(), between = new Map();
  if (enabled.has('nesting-review')) for (const relation of state.relationships) {
    const pair = [key(relation.source),key(relation.target)].sort().join('|');
    if (!between.has(pair)) between.set(pair, []); between.get(pair).push(relation.id);
  }
  for (const entry of state.views) {
    for (const item of entry.occurrences) used.add(key(item.concept));
    for (const item of entry.connections) used.add(`relationship:${item.relationshipId}`);
    if (enabled.has('nesting-review')) {
      const occurrences = new Map(entry.occurrences.map(item => [item.id,item]));
      for (const child of [...entry.occurrences].sort((a,b) => a.id.localeCompare(b.id))) {
        if (child.parent?.kind !== 'occurrence') continue;
        const parent = occurrences.get(child.parent.id), a = parent.bounds, b = child.bounds;
        const relationshipIds = [...(between.get([key(parent.concept),key(child.concept)].sort().join('|')) ?? [])].sort();
        issues.push({rule:'nesting-review',severity:'info',targets:[ref('view',entry.view.id),{...parent.concept},{...child.concept}],viewId:entry.view.id,
          parentDrawingId:parent.id,childDrawingId:child.id,relationshipIds,contained:b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height,count:relationshipIds.length});
      }
    }
    if (enabled.has('empty-views') && !entry.occurrences.length && !entry.connections.length && !entry.visualNodes.length && !entry.visualConnectors.length) issues.push({ rule: 'empty-views', severity: 'info', targets: [ref('view', entry.view.id)], count: 0 });
    if (enabled.has('viewpoint-hidden') && entry.view.viewpointId) {
      const projection = projectView(state, entry.view.id);
      if (projection.excludedDrawings.length) {
        const drawings = new Map([...entry.occurrences.map(item => [item.id, item.concept]), ...entry.connections.map(item => [item.id, ref('relationship', item.relationshipId)])]);
        const hidden = new Map(projection.excludedDrawings.map(item => { const concept = drawings.get(item.id); return [key(concept), { ...concept }]; }));
        issues.push({ rule: 'viewpoint-hidden', severity: 'info', targets: [ref('view', entry.view.id), ...[...hidden.values()].sort(compare)], count: projection.excludedDrawings.length });
      }
    }
  }
  const names = new Map();
  for (const [kind, collection] of kinds) for (const item of state[collection]) {
    const value = ref(kind, item.id);
    if (enabled.has('unused-concepts') && !used.has(key(value))) issues.push({ rule: 'unused-concepts', severity: 'info', targets: [value], count: 0 });
    const name = (item.name ?? item.label ?? '').trim().normalize('NFC').toLocaleLowerCase('ru');
    if (name && enabled.has('duplicate-names')) {
      const id = JSON.stringify([kind, item.type, name]);
      if (!names.has(id)) names.set(id, []);
      names.get(id).push(value);
    }
  }
  for (const targets of names.values()) if (targets.length > 1) issues.push({ rule: 'duplicate-names', severity: 'warning', targets: targets.sort(compare), count: targets.length });
  return { rules: [...rules], issues: issues.sort((a, b) => a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : compare(a.targets[0], b.targets[0])), normative: 'UNKNOWN' };
}
