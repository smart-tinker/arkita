import { createStore } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { viewpointDefinition, viewpointId } from '../../schemka-model-core/fixtures/viewpoint-project.js';

export function usageFixture() {
  const state = conceptProject(), primaryViewId = state.views[0].view.id, otherViewId = state.views[1].view.id;
  state.relationships = state.relationships.slice(0, 2);
  state.views[0].connections = state.views[0].connections.filter(item => state.relationships.some(relationship => relationship.id === item.relationshipId));
  for (const item of state.views[0].connections) { item.routePoints = []; item.labelPosition = null; }
  for (const item of [...state.elements, ...state.junctions]) item.name = 'Одинаковое <img src=x> имя';
  for (const item of state.relationships) item.label = 'Одинаковое <svg onload=bad()> отношение';
  for (const entry of state.views) entry.view.name = 'Одинаковый <script> вид';
  state.elements.push({ ...structuredClone(state.elements[0]), id: fixtureId('el', 99) });
  state.viewpoints = [{ id: viewpointId, ...viewpointDefinition({ elementTypes: ['ApplicationComponent'], junctionTypes: ['AndJunction'], relationshipTypes: ['Association'] }) }];
  state.views[0].view.viewpointId = viewpointId;
  const refs = { element: { kind: 'element', id: state.elements[0].id }, junction: { kind: 'junction', id: state.junctions[0].id },
    relationship: { kind: 'relationship', id: state.relationships[0].id }, unused: { kind: 'element', id: state.elements[2].id } };
  const store = createStore(state), run = command => store.execute(command, store.revision).created;
  run({ type: 'addOccurrence', viewId: primaryViewId, concept: refs.element, bounds: { x: 15000, y: 100, width: 180, height: 90 } });
  const visibleOccurrences = [8000, 12000].map(x => run({ type: 'addOccurrence', viewId: otherViewId, concept: refs.element,
    bounds: { x, y: 600, width: 180, height: 90 } }).occurrenceId);
  const other = run({ type: 'addOccurrence', viewId: otherViewId, concept: { kind: 'element', id: state.elements[1].id },
    bounds: { x: 8400, y: 600, width: 180, height: 90 } }).occurrenceId;
  const visibleJunctionId = run({ type: 'addOccurrence', viewId: otherViewId, concept: refs.junction,
    bounds: { x: 9000, y: 900, width: 24, height: 24 } }).occurrenceId;
  const visibleConnections = visibleOccurrences.map(id => run({ type: 'addConnection', viewId: otherViewId, relationshipId: refs.relationship.id,
    source: { kind: 'occurrence', id }, target: { kind: 'occurrence', id: other } }).connectionId);
  return { state: store.snapshot, refs, primaryViewId, otherViewId, visibleOccurrences, visibleConnections, visibleJunctionId };
}
