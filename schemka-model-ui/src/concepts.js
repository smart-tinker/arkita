/** Inert v2 UI lookup helpers. They never infer kind from an ID or alter records. */
export function conceptRecord(state, reference) {
  const collection = reference?.kind === 'element' ? state.elements : reference?.kind === 'junction' ? state.junctions : reference?.kind === 'relationship' ? state.relationships : [];
  return collection.find(item => item.id === reference?.id);
}
export const conceptName = (state, reference) => {
  const record = conceptRecord(state, reference);
  return reference?.kind === 'relationship' ? record?.label || '(без подписи)' : record?.name || '(без названия)';
};
export const sameConcept = (left, right) => Boolean(left && right && left.kind === right.kind && left.id === right.id);
export function endpointConcept(view, endpoint) {
  if (endpoint?.kind === 'occurrence') return view.occurrences.find(item => item.id === endpoint.id)?.concept;
  if (endpoint?.kind === 'connection') {
    const connection = view.connections.find(item => item.id === endpoint.id);
    return connection ? { kind: 'relationship', id: connection.relationshipId } : undefined;
  }
}
