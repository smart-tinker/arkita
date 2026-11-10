/** Provenance is persisted on each native record, so this table is available after reopen and independent copies. */
export function collectArchiMappings(snapshot) {
  const rows = [];
  function add(item, targetKind, view) {
    if (!item.archiSource) return;
    const source = item.archiSource;
    rows.push({ sourceModelId: source.modelId, sourceId: source.id, sourceType: source.type, sourceVersion: source.version,
      sourceDomain: source.domain || '', targetId: item.id, kind: targetKind, targetType: item.type || item.kind || targetKind,
      name: item.name || item.label || '', ...(view ? { viewId: view.archiSource?.id || view.id, viewName: view.name } : {}) });
  }
  add(snapshot.project, 'project');
  for (const [key, kind] of [['folders', 'folder'], ['elements', 'element'], ['junctions', 'junction'], ['relationships', 'relationship']]) for (const item of snapshot[key] || []) add(item, kind);
  for (const entry of snapshot.views || []) {
    add(entry.view, 'view', entry.view);
    for (const [key, kind] of [['occurrences', 'occurrence'], ['connections', 'connection'], ['visualNodes', 'visualNode'], ['visualConnectors', 'visualConnector']]) for (const item of entry[key]) add(item, kind, entry.view);
  }
  return rows.sort((a, b) => { for (const key of ['sourceModelId', 'sourceId', 'kind', 'targetId']) { if (a[key] < b[key]) return -1; if (a[key] > b[key]) return 1; } return 0; });
}
