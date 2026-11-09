import { projectView } from '../../schemka-model-core/src/index.js';
import { conceptRecord, sameConcept } from './concepts.js';
import { orderedViews } from './controller.js';

/** Folder labels are current presentation only; navigation always keeps exact view/drawing IDs. */
export function modelFolderPaths(state) {
  const byId = new Map(state.folders.map(item => [item.id,item])), folders = new Map(), root = state.project.name || '(модель)';
  for (const item of state.folders) {
    const chain = []; let folder = item;
    while (folder && !folders.has(folder.id)) { chain.push(folder); folder = byId.get(folder.parentFolderId); }
    let path = folder ? folders.get(folder.id) : root;
    for (const child of chain.reverse()) { path += ` / ${child.name || '(без названия)'}`; folders.set(child.id,path); }
  }
  const views = new Map(state.views.map(entry => [entry.view.id,root]));
  for (const folder of state.folders) for (const member of folder.members) if (member.kind === 'view') views.set(member.id,folders.get(folder.id));
  return {folders,views};
}
export const viewFolderPath = (state,viewId) => modelFolderPaths(state).views.get(viewId) ?? (state.project.name || '(модель)');

/** Exact stored drawings, including those omitted by a view's current projection. */
export function conceptUsages(state, concept) {
  if (!conceptRecord(state, concept)) return [];
  const paths = modelFolderPaths(state).views;
  const kind = concept.kind === 'relationship' ? 'connection' : 'occurrence';
  return orderedViews(state.views).flatMap(entry => {
    const drawings = (kind === 'connection' ? entry.connections : entry.occurrences)
      .filter(item => kind === 'connection' ? item.relationshipId === concept.id : sameConcept(item.concept, concept));
    if (!drawings.length) return [];
    const projection = entry.view.viewpointId ? projectView(state, entry.view.id) : null;
    const viewpoint = state.viewpoints?.find(item => item.id === entry.view.viewpointId);
    return [...drawings].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(item => {
      const excluded = projection?.excludedDrawings.find(drawing => drawing.kind === kind && drawing.id === item.id);
      return { viewId: entry.view.id, viewName: entry.view.name, folderPath: paths.get(entry.view.id), kind, id: item.id,
        hidden: Boolean(excluded), reason: excluded?.reason ?? null,
        viewpointId: entry.view.viewpointId ?? null, viewpointName: viewpoint?.name ?? null };
    });
  });
}

export function usageVisibilityText(usage) {
  if (!usage.hidden) return 'Показан в виде';
  const reason = { 'type-excluded': 'тип концепта исключён', 'endpoint-concept-excluded': 'конец отношения исключён',
    'drawing-endpoint-excluded': 'рисунок конца соединения скрыт' }[usage.reason] || 'рисунок исключён из проекции';
  return `Скрыт viewpoint «${usage.viewpointName || '(без названия)'}» (${usage.viewpointId}): ${reason}`;
}
