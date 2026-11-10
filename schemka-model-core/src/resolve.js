import { assertJSON, fail } from './json.js';
import { validateProject, projectIndex, conceptRecord, viewIndex, endpointRecord } from './format.js';

export function freezeJSON(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeJSON(child); Object.freeze(value); }
  return value;
}
const detached = value => freezeJSON(JSON.parse(JSON.stringify(value)));

/** Validate once, retain a detached immutable graph, resolve without traversing host geometry. */
export function createProjectResolver(state) {
  validateProject(state);
  const copy = detached(state), index = projectIndex(copy);
  const views = new Map(copy.views.map(entry => [entry.view.id, viewIndex(entry)]));
  return Object.freeze({
    resolveConcept(ref) { assertJSON(ref); return conceptRecord(index, ref); },
    resolveViewEndpoint(viewId, endpoint) {
      assertJSON(endpoint);
      const local = views.get(viewId);
      if (!local) fail('REFERENCE', 'View not found');
      return freezeJSON(endpointRecord(index, local, endpoint));
    },
  });
}
export function resolveConcept(state, ref) { return createProjectResolver(state).resolveConcept(ref); }
export function resolveViewEndpoint(state, viewId, endpoint) { return createProjectResolver(state).resolveViewEndpoint(viewId, endpoint); }
