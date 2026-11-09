import { exportFiles, importFiles, validateProject } from '../../schemka-model-core/src/index.js';
import { remapProject } from '../../schemka-model-core/src/project-remap.js';
export { remapProject } from '../../schemka-model-core/src/project-remap.js';
import { canonicalJSON, fail } from '../../schemka-model-core/src/json.js';

import { createRegistry, CURRENT_PROFILE, assessRelationshipCreation } from '../../schemka-model-profiles/src/index.js';
const registry = createRegistry([CURRENT_PROFILE]);
const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);

export function transferChanges(before, after) {
  const left = new Map(exportFiles(before).map(file => [file.path, JSON.parse(file.content)]));
  const right = new Map(exportFiles(after).map(file => [file.path, JSON.parse(file.content)]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(path => {
    const a = left.get(path), b = right.get(path);
    if (a && b && equal(a, b)) return [];
    const item = b ?? a;
    return [{ path, id: item.id, label: item.name || item.label || item.text || item.id,
      kind: !a ? 'added' : !b ? 'removed' : 'updated', before: a ?? null, after: b ?? null,
      affectedViews: after.views.filter(entry => entry.view.id === item.id || [...entry.occurrences, ...entry.connections, ...entry.visualNodes, ...entry.visualConnectors].some(drawing => drawing.id === item.id || drawing.concept?.id === item.id || drawing.relationshipId === item.id)).map(entry => ({ id: entry.view.id, name: entry.view.name })) }];
  });
}

/** Incoming rows replace every local row with that key; unrelated rows keep order. */
export function mergePropertyRows(local, incoming) {
  const keys = new Set(incoming.map(row => row.key));
  return [...local.filter(row => !keys.has(row.key)), ...incoming].map(row => ({ ...row }));
}

/** Whole-model import is a detached union. Omitted source records never delete local records. */
export function previewNativeMerge(target, source, { ids = 'reuse', updateExisting = true, folders = true, modelMetadata = false, properties = 'replace' } = {}) {
  validateProject(target); validateProject(source);
  if (!['reuse', 'remap'].includes(ids) || !['replace', 'merge'].includes(properties) || [updateExisting, folders, modelMetadata].some(value => typeof value !== 'boolean')) fail('IMPORT_OPTIONS', 'Выберите политику ID, области обновления и свойств.');
  const mapped = ids === 'remap' ? remapProject(source) : { snapshot: structuredClone(source), ids: {} };
  const incoming = mapped.snapshot, result = new Map(exportFiles(target).map(file => [file.path, JSON.parse(file.content)])), kept = [], considered = new Set();
  const targetIds = new Map([...result].map(([path, item]) => [item.id, path]));
  for (const file of exportFiles(incoming)) {
    let next = JSON.parse(file.content), old = result.get(file.path);
    if (file.path === 'schemka.json') {
      if (!modelMetadata) { kept.push({ id: target.project.id, reason: 'modelMetadata' }); continue; }
      next = { ...next, id: target.project.id }; old = target.project;
    } else {
      if (file.path.startsWith('model/folders/') && !folders) { kept.push({ id: next.id, reason: 'folders' }); continue; }
      if (targetIds.has(next.id) && targetIds.get(next.id) !== file.path) fail('IMPORT_COLLISION', `ID ${next.id} принадлежит другой записи или представлению.`);
      if (old && !updateExisting) { kept.push({ id: old.id, reason: 'updateExisting' }); continue; }
      if (old && (old.type !== next.type || old.kind !== next.kind)) fail('IMPORT_TYPE', `Импорт не меняет тип ${next.id}. Используйте явную команду изменения типа или новые ID.`);
    }
    if (old?.properties && next.properties && properties === 'merge') next.properties = mergePropertyRows(old.properties, next.properties);
    considered.add(next.id); result.set(file.path, next);
  }
  // Replacing a folder's membership may otherwise assign one object twice. Require an explicit remap or consistent source instead.
  const snapshot = importFiles([...result].map(([path, value]) => ({ path, content: canonicalJSON(value) })));
  checkImportedRelationships(target, snapshot);
  const reverseIds = new Map(Object.entries(mapped.ids).map(([from, to]) => [to, from]));
  const sourceIds = new Set(exportFiles(source).map(file => JSON.parse(file.content).id));
  const changes = transferChanges(target, snapshot).map(change => ({ ...change, sourceId: change.id === target.project.id ? source.project.id : reverseIds.get(change.id) ?? (sourceIds.has(change.id) ? change.id : null) }));
  const changed = new Set(changes.map(change => change.id)), unchangedRecords = [...considered].filter(id => !changed.has(id));
  return { snapshot, changes, unchangedRecords, kept, ids: mapped.ids, losses: [], unchanged: changes.length === 0 };
}

/** A board package includes referenced views so no view reference is silently dropped. */
export function extractViewProject(source, viewId) {
  validateProject(source);
  const selected = new Set([viewId]);
  for (const id of selected) {
    const entry = source.views.find(item => item.view.id === id);
    if (!entry) fail('IMPORT_VIEW', 'Представление не найдено.');
    for (const node of entry.visualNodes) if (node.kind === 'viewReference') selected.add(node.targetViewId);
  }
  const snapshot = structuredClone(source); snapshot.views = snapshot.views.filter(entry => selected.has(entry.view.id));
  // Include semantic dependencies transitively, including relationships used as endpoints.
  const concepts = new Set(snapshot.views.flatMap(entry => [...entry.occurrences.map(item => item.concept.id), ...entry.connections.map(item => item.relationshipId)]));
  for (const id of concepts) { const rel = source.relationships.find(item => item.id === id); if (rel) { concepts.add(rel.source.id); concepts.add(rel.target.id); } }
  for (const key of ['elements', 'junctions', 'relationships']) snapshot[key] = snapshot[key].filter(item => concepts.has(item.id));
  snapshot.project.documentation = ''; snapshot.project.properties = [];
  const profileIds = new Set([...['elements', 'junctions', 'relationships'].flatMap(key => snapshot[key].flatMap(item => (item.profileApplications ?? []).map(profile => profile.profileId))), ...snapshot.views.flatMap(entry => entry.visualNodes.flatMap(node => (node.legend?.colors ?? []).map(color => color.profileId).filter(Boolean)))]);
  const profiles = (snapshot.customizationProfiles ?? []).filter(item => profileIds.has(item.id));
  if (profiles.length) snapshot.customizationProfiles = profiles; else delete snapshot.customizationProfiles;
  const viewpointIds = new Set(snapshot.views.map(entry => entry.view.viewpointId));
  const viewpoints = (snapshot.viewpoints ?? []).filter(item => viewpointIds.has(item.id));
  if (viewpoints.length) snapshot.viewpoints = viewpoints; else delete snapshot.viewpoints;
  const assets = new Set(snapshot.views.flatMap(entry => [...entry.occurrences, ...entry.visualNodes].flatMap(item => [item.assetId, item.style?.image?.assetId])).concat(profiles.map(item => item.imageAssetId)).filter(Boolean));
  snapshot.assets = snapshot.assets.filter(item => assets.has(item.id));
  // A board is not a copy of the source model's unrelated organization or metadata.
  snapshot.folders = [];
  validateProject(snapshot); return snapshot;
}

export function checkImportedRelationships(before, after) {
  const prior = new Map(before.relationships.map(item => [item.id, item]));
  for (const item of after.relationships) {
    const old = prior.get(item.id);
    if (old && old.type === item.type && equal(old.source, item.source) && equal(old.target, item.target)) continue;
    const blocker = assessRelationshipCreation(after, registry, item.id);
    if (blocker) fail('IMPORT_RELATIONSHIP', `Отношение ${item.id} недопустимо: ${blocker.reason}.`);
  }
}
