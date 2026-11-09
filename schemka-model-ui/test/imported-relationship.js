import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { newId } from '../../schemka-model-core/src/format.js';

/** Test-only historical input construction. No store command or permission bypass. */
export function importedRelationship(state, { viewId, relationshipType, source, target, label = '', documentation = '', properties = {}, routePoints = [], labelPosition = null, ...annotations }) {
  const view = state.views.find(entry => entry.view.id === viewId);
  const resolve = end => view.occurrences.find(item => item.id === end.id).concept;
  const relationshipId = newId('rel'), connectionId = newId('conn');
  state.relationships.push({ id: relationshipId, type: relationshipType, source: structuredClone(resolve(source)), target: structuredClone(resolve(target)), label, documentation, properties: propertyEntries(properties), ...annotations });
  view.connections.push({ id: connectionId, relationshipId, source, target, routePoints, labelPosition, style: {} });
  return { relationshipId, connectionId };
}
