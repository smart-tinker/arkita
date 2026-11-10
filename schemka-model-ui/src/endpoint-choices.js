import { conceptName, endpointConcept, sameConcept } from './concepts.js';
import { snap } from './controller.js';

/** Each option names one exact drawing and attachment; no first-match host inference. */
export function endpointChoices(state, view, { concept = null, anchorPlanFor = null } = {}) {
  const choices = [];
  for (const [index, occurrence] of view.occurrences.entries()) {
    if (concept && !sameConcept(occurrence.concept, concept)) continue;
    choices.push({ key: occurrence.id, endpoint: { kind: 'occurrence', id: occurrence.id }, concept: occurrence.concept,
      label: `${occurrence.concept.kind} · ${conceptName(state, occurrence.concept)} · экз. ${index + 1} · ${occurrence.id.slice(-8)}` });
  }
  for (const [index, connection] of view.connections.entries()) {
    const reference = { kind: 'relationship', id: connection.relationshipId };
    if (concept && !sameConcept(reference, concept)) continue;
    const prefix = `relationship · ${conceptName(state, reference)} · соед. ${index + 1} · ${connection.id.slice(-8)}`;
    for (const anchor of connection.routePoints.filter(point => point.kind === 'anchor')) {
      choices.push({ key: `${connection.id}:${anchor.id}`, endpoint: { kind: 'connection', id: connection.id, anchorId: anchor.id }, concept: reference,
        label: `${prefix} · якорь ${anchor.id.slice(-8)} (${anchor.point.x}; ${anchor.point.y})` });
    }
    if (connection.routePoints.length >= 128) continue;
    const plan = anchorPlanFor?.(connection, view);
    if (plan) choices.push({ key: `${connection.id}:new`, endpoint: { kind: 'connection', id: connection.id,
      insertAnchor: { index: plan.index, point: { x: snap(plan.point.x), y: snap(plan.point.y) } } }, concept: reference,
      label: `${prefix} · новый закреплённый якорь (${snap(plan.point.x)}; ${snap(plan.point.y)})` });
  }
  return choices;
}

export function choiceConcept(view, endpoint) { return endpointConcept(view, endpoint); }
