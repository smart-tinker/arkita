// Model-only graph mechanics. Authority and source evidence are supplied only by
// the private current-profile boundary in index.js, never by serialized models.
export const JUNCTION_ANALYSIS_LIMIT = 50000;
export const MAX_JUNCTION_ANALYSIS_LIMIT = 500000;
export const relationshipFamily = type => ({ ReadAccess: 'Access', WriteAccess: 'Access', ReadWriteAccess: 'Access', DirectedAssociation: 'Association' }[type] || type);
const key = ref => ref.kind + ':' + ref.id;
const order = (a, b) => a.id.localeCompare(b.id);
const unique = values => [...new Set(values)].sort();
const statusOf = statuses => statuses.includes('FAIL') ? 'FAIL' : statuses.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
const permissionStatus = value => ({ ALLOWED: 'PASS', FORBIDDEN: 'FAIL', UNKNOWN: 'UNKNOWN' }[value]);

/** No traversal follows the endpoints of a Relationship terminal concept. */
export function junctionGraph(state, evaluate, evidence, workLimit, focusEdgeId = null) {
  const junctions = [...state.junctions].sort(order), relationships = [...state.relationships].sort(order);
  const elements = new Map(state.elements.map(item => [item.id, item]));
  const issues = [], issueKeys = new Set();
  const emit = (ruleId, status, reason, junctionIds = [], relationshipIds = [], extra = {}) => {
    const issue = { ruleId, status, reason, junctionIds: unique(junctionIds), relationshipIds: unique(relationshipIds), sourceEvidence: evidence(ruleId), ...extra };
    const identity = JSON.stringify([ruleId, status, reason, issue.junctionIds, issue.relationshipIds, extra.source, extra.target]);
    if (!issueKeys.has(identity)) { issueKeys.add(identity); issues.push(issue); }
    return issue;
  };
  const definite = [], possible = [];
  for (const edge of relationships) {
    const touched = [edge.source, edge.target].filter(ref => ref.kind === 'junction').map(ref => ref.id);
    if (edge.junctionRole === 'container') {
      const shape = edge.source.kind === 'element' && ['Grouping', 'Location', 'Plateau'].includes(elements.get(edge.source.id)?.type) && edge.target.kind === 'junction';
      if (shape && edge.type === 'Aggregation') {
        emit('junction-container-role', 'PASS', 'confirmed-aggregation-container-exception', touched, [edge.id]);
        continue;
      }
      if (shape && edge.type === 'Composition') {
        possible.push(edge);
        emit('junction-container-role', 'UNKNOWN', 'composition-container-exception-unresolved', touched, [edge.id]);
        continue;
      }
      emit('junction-container-role', 'FAIL', 'inapplicable-container-role', touched, [edge.id]);
    }
    definite.push(edge);
  }
  // This linear scan is bounded by core entity/file limits. The separate work
  // limit bounds potentially quadratic terminal reachability and pair analysis.
  for (const edge of relationships) {
    const touched = [edge.source, edge.target].filter(ref => ref.kind === 'junction').map(ref => ref.id);
    if (!touched.length) continue;
    const result = evaluate(edge.source, edge.type, edge.target);
    emit('junction-local-port', permissionStatus(result.status), result.reason, touched, [edge.id], { permission: result.status, evidence: result.sourceEvidence });
    for (const end of ['source', 'target']) if (Object.hasOwn(edge, end + 'Multiplicity')) {
      const junctionEnd = edge[end].kind === 'junction';
      emit('junction-multiplicity-applicability', junctionEnd ? 'FAIL' : 'PASS', junctionEnd ? 'multiplicity-at-junction-end' : 'not-a-junction-end', junctionEnd ? [edge[end].id] : [], [edge.id], { end, raw: edge[end + 'Multiplicity'] });
    }
  }
  const outgoing = new Map(junctions.map(j => [j.id, []]));
  const incoming = new Map(junctions.map(j => [j.id, []]));
  for (const edge of definite) {
    if (edge.source.kind === 'junction') outgoing.get(edge.source.id).push(edge);
    if (edge.target.kind === 'junction') incoming.get(edge.target.id).push(edge);
  }
  for (const j of junctions) {
    const ins = incoming.get(j.id), outs = outgoing.get(j.id);
    const incident = [...new Map([...ins, ...outs].map(e => [e.id, e])).values()];
    const maybe = possible.filter(e => (e.source.kind === 'junction' && e.source.id === j.id) || (e.target.kind === 'junction' && e.target.id === j.id));
    const possibleIns = ins.length + maybe.filter(e => e.target.kind === 'junction' && e.target.id === j.id).length;
    const possibleOuts = outs.length + maybe.filter(e => e.source.kind === 'junction' && e.source.id === j.id).length;
    for (const [rule, count, possibleCount, minimum] of [['junction-minimum-distinct', incident.length, incident.length + maybe.length, 2], ['junction-incoming', ins.length, possibleIns, 1], ['junction-outgoing', outs.length, possibleOuts, 1]]) {
      emit(rule, count >= minimum ? 'PASS' : possibleCount < minimum ? 'FAIL' : 'UNKNOWN', count >= minimum ? 'transit-minimum-confirmed' : possibleCount < minimum ? 'insufficient-transit-relationships' : 'degree-depends-on-unresolved-container-exception', [j.id], [...incident, ...maybe].map(e => e.id), { count, minimum });
    }
    const knownDegree = incident.length >= 2 && ins.length >= 1 && outs.length >= 1;
    const impossibleDegree = incident.length + maybe.length < 2 || !possibleIns || !possibleOuts;
    emit('junction-degree', knownDegree ? 'PASS' : impossibleDegree ? 'FAIL' : 'UNKNOWN', knownDegree ? 'incoming-outgoing-distinct-records-confirmed' : impossibleDegree ? 'insufficient-transit-relationships' : 'degree-depends-on-unresolved-container-exception', [j.id], [...incident, ...maybe].map(e => e.id), { degree: { distinct: incident.length, incoming: ins.length, outgoing: outs.length, possibleAdditional: maybe.length } });
    const families = unique(incident.map(e => relationshipFamily(e.type))), maybeFamilies = unique(maybe.map(e => relationshipFamily(e.type)));
    const aggregationComposition = families.length === 2 && families.every(f => ['Aggregation', 'Composition'].includes(f));
    const familyUnknown = aggregationComposition || maybeFamilies.some(f => !families.includes(f)) || !families.length;
    const focus = focusEdgeId && incident.find(edge => edge.id === focusEdgeId);
    const incompatible = focus && incident.some(edge => relationshipFamily(edge.type) !== relationshipFamily(focus.type)
      && ![edge, focus].every(item => ['Aggregation', 'Composition'].includes(relationshipFamily(item.type))));
    if (!focusEdgeId || incompatible) emit('junction-same-family', families.length > 1 && !aggregationComposition ? 'FAIL' : familyUnknown ? 'UNKNOWN' : 'PASS', families.length > 1 && !aggregationComposition ? 'different-base-relationship-families' : familyUnknown ? 'family-scope-not-established' : 'same-base-relationship-family', [j.id], [...incident, ...maybe].map(e => e.id), { families });
    const variants = unique(incident.map(e => e.type));
    if (families.length === 1 && variants.length > 1) emit('junction-qualifier-compatibility', 'UNKNOWN', 'mixed-qualifier-semantics-unassessed', [j.id], incident.map(e => e.id), { variants });
  }

  const work = { limit: workLimit, visitedStates: 0, evaluatedPairs: 0, pendingStates: 0 };
  let used = 0, exhausted = false;
  const spend = () => { if (used >= workLimit) { exhausted = true; return false; } used++; return true; };
  const visited = new Set(), pairs = new Set(), pairIssues = [];
  const queue = definite.filter(e => e.source.kind !== 'junction' && e.target.kind === 'junction')
    .map(e => ({ source: e.source, family: relationshipFamily(e.type), junctionId: e.target.id, path: [e.id], junctionIds: [e.target.id], focused: e.id === focusEdgeId }));
  let at = 0;
  while (at < queue.length) {
    if (!spend()) break;
    const current = queue[at++], visitKey = JSON.stringify([key(current.source), current.family, current.junctionId, ...(focusEdgeId ? [current.focused] : [])]);
    if (visited.has(visitKey)) continue;
    visited.add(visitKey); work.visitedStates++;
    for (const edge of outgoing.get(current.junctionId)) {
      if (!spend()) break;
      if (relationshipFamily(edge.type) !== current.family) continue;
      const path = [...current.path, edge.id], focused = current.focused || edge.id === focusEdgeId;
      if (edge.target.kind === 'junction') {
        queue.push({ ...current, junctionId: edge.target.id, path, focused, junctionIds: [...current.junctionIds, edge.target.id] });
      } else {
        if (focusEdgeId && !focused) continue;
        const pairKey = JSON.stringify([key(current.source), current.family, key(edge.target)]);
        if (pairs.has(pairKey)) continue;
        pairs.add(pairKey); work.evaluatedPairs++;
        const result = evaluate(current.source, current.family, edge.target);
        pairIssues.push(emit('junction-terminal-permission', permissionStatus(result.status), result.reason, current.junctionIds, path,
          { source: { ...current.source }, target: { ...edge.target }, family: current.family, permission: result.status, evidence: result.sourceEvidence, permissionClass: result.permissionClass, witness: path.slice(0, 32), witnessLength: path.length }));
      }
    }
    if (exhausted) break;
  }
  work.pendingStates = queue.length - at;

  // Associate each deduplicated pair with every junction on a same-family
  // terminal path, while retaining only one deterministic witness. Intersection
  // of forward and reverse reachability avoids enumerating simple paths.
  for (const issue of focusEdgeId ? [] : pairIssues) {
    if (exhausted) break;
    const pending = definite.filter(e => key(e.target) === key(issue.target) && relationshipFamily(e.type) === issue.family && e.source.kind === 'junction').map(e => e.source.id);
    const reached = new Set(); let cursor = 0;
    while (cursor < pending.length) {
      if (!spend()) { work.pendingStates += pending.length - cursor; break; }
      const here = pending[cursor++]; if (reached.has(here)) continue; reached.add(here); work.visitedStates++;
      for (const edge of incoming.get(here)) {
        if (!spend()) { work.pendingStates += pending.length - cursor + 1; break; }
        if (edge.source.kind === 'junction' && relationshipFamily(edge.type) === issue.family && !reached.has(edge.source.id)) pending.push(edge.source.id);
      }
      if (exhausted) break;
    }
    issue.junctionIds = unique([...issue.junctionIds, ...[...reached].filter(j => visited.has(JSON.stringify([key(issue.source), issue.family, j])))]);
  }

  // Every junction is checked, even if no boundary-start traversal reached it.
  // Thus a terminal-less side cycle cannot hide behind an unrelated valid pair.
  function reachesTerminal(start, direction) {
    const pending = [start], seen = new Set(); let cursor = 0;
    while (cursor < pending.length) {
      if (!spend()) { work.pendingStates += pending.length - cursor; return null; }
      const here = pending[cursor++]; if (seen.has(here)) continue; seen.add(here); work.visitedStates++;
      for (const edge of (direction === 'incoming' ? incoming : outgoing).get(here)) {
        if (!spend()) { work.pendingStates += pending.length - cursor + 1; return null; }
        const next = direction === 'incoming' ? edge.source : edge.target;
        if (next.kind !== 'junction') return true;
        if (!seen.has(next.id)) pending.push(next.id);
      }
    }
    return false;
  }
  for (let i = 0; i < junctions.length; i++) {
    const j = junctions[i];
    if (exhausted) { work.pendingStates += 2 * (junctions.length - i); break; }
    const input = reachesTerminal(j.id, 'incoming'), output = exhausted ? null : reachesTerminal(j.id, 'outgoing');
    const ambiguous = possible.some(e => e.source.id === j.id || e.target.id === j.id);
    emit('junction-terminal-coverage', input && output && !ambiguous ? 'PASS' : 'UNKNOWN', input && output && !ambiguous ? 'terminal-witnesses-reachable' : exhausted ? 'analysis-limit' : 'terminal-scope-not-established', [j.id], [], { incomingTerminal: input, outgoingTerminal: output });
  }

  // Iterative SCC detection: cycle membership is an UNKNOWN semantic scope,
  // never a structural failure or an invented acyclicity requirement.
  const adjacency = new Map(junctions.map(j => [j.id, []])), reverse = new Map(junctions.map(j => [j.id, []]));
  for (const edge of definite) if (edge.source.kind === 'junction' && edge.target.kind === 'junction') {
    adjacency.get(edge.source.id).push(edge.target.id); reverse.get(edge.target.id).push(edge.source.id);
  }
  const seen = new Set(), finish = [];
  for (const j of junctions) {
    if (seen.has(j.id)) continue;
    seen.add(j.id); const stack = [[j.id, 0]];
    while (stack.length) {
      const item = stack[stack.length - 1], edges = adjacency.get(item[0]);
      if (item[1] < edges.length) { const next = edges[item[1]++]; if (!seen.has(next)) { seen.add(next); stack.push([next, 0]); } }
      else { finish.push(item[0]); stack.pop(); }
    }
  }
  seen.clear();
  for (const start of finish.reverse()) {
    if (seen.has(start)) continue;
    const component = [], pending = [start]; seen.add(start);
    for (let i = 0; i < pending.length; i++) { const here = pending[i]; component.push(here); for (const next of reverse.get(here)) if (!seen.has(next)) { seen.add(next); pending.push(next); } }
    if (component.length > 1 || adjacency.get(start).includes(start)) emit('junction-cycle-scope', 'UNKNOWN', 'cycle-semantics-unassessed', component);
  }
  if (exhausted) emit('junction-analysis-coverage', 'UNKNOWN', 'analysis-limit', [], [], { pendingStates: work.pendingStates });
  const status = junctions.length || issues.length ? statusOf(issues.map(i => i.status)) : 'UNKNOWN';
  return { status, complete: !exhausted, reason: !junctions.length && !issues.length ? 'no-junctions' : exhausted ? 'analysis-limit' : 'bounded-junction-checks', issues, work, normative: { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' } };
}
