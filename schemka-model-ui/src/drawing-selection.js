/** Selection uses displayed geometry in model coordinates, independent of drag direction. */
export function marqueeRectangle(start, end) {
  if (!start || !end || ![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
}

export function marqueeDrawings(view, rectangle, connectionBounds, { mode = 'contain', scope = 'all' } = {}) {
  if (!view || !rectangle || rectangle.width <= 0 || rectangle.height <= 0) return [];
  const hit = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && (mode === 'touch'
    ? box.x <= rectangle.x + rectangle.width && box.y <= rectangle.y + rectangle.height && box.x + box.width >= rectangle.x && box.y + box.height >= rectangle.y
    : box.x >= rectangle.x && box.y >= rectangle.y && box.x + box.width <= rectangle.x + rectangle.width && box.y + box.height <= rectangle.y + rectangle.height);
  const ordered = values => [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const nodes = [...ordered(view.occurrences).filter(item => hit(item.bounds)).map(item => ({ kind: 'occurrence', id: item.id })), ...ordered(view.visualNodes ?? []).filter(item => hit(item.bounds)).map(item => ({ kind: 'visualNode', id: item.id }))];
  const lines = [...view.connections.map(item => ({ kind: 'connection', item })), ...(view.visualConnectors ?? []).map(item => ({ kind: 'visualConnector', item }))].sort((a, b) => a.item.id.localeCompare(b.item.id));
  if (scope === 'nodes') return nodes;
  if (scope === 'associated') {
    const selected = new Set(nodes.map(ref => `${ref.kind}:${ref.id}`)), result = [...nodes];
    for (let changed = true; changed;) { changed = false; for (const { kind, item } of lines) if (!selected.has(`${kind}:${item.id}`) && [item.source, item.target].every(ref => selected.has(`${ref.kind}:${ref.id}`))) { selected.add(`${kind}:${item.id}`); result.push({ kind, id: item.id }); changed = true; } }
    return result;
  }
  const selectedLines = lines.filter(({ kind, item }) => hit(connectionBounds(item, kind))).map(({ kind, item }) => ({ kind, id: item.id }));
  return scope === 'lines' ? selectedLines : [...nodes, ...selectedLines];
}
