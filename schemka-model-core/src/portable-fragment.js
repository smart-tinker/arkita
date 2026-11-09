import { assertJSON, fail, record } from './json.js';
import { createProject, exportFiles, readProjectFiles, validateProject } from './format.js';
import { captureFragment } from './fragment.js';
import { remapProject } from './project-remap.js';
import { DRAWING_COLLECTIONS } from './native-v4.js';
import { projectView } from './viewpoints.js';
import { freezeJSON } from './resolve.js';

const collections = Object.values(DRAWING_COLLECTIONS);
const concepts = { element: 'elements', junction: 'junctions', relationship: 'relationships' };
const typed = ref => `${ref.kind}:${ref.id}`;
const sorted = items => [...items].sort((a,b) => a.id.localeCompare(b.id));

/** Selected drawings plus explicitly disclosed whole referenced views and required records only. */
export function capturePortableFragment(state, viewId, selection) {
  const selected = captureFragment(state, viewId, selection), source = state.views.find(entry => entry.view.id === viewId);
  const main = { view: structuredClone(source.view), ...Object.fromEntries(collections.map(key => [key, structuredClone(selected[key])])) };
  const nodes = new Set([...main.occurrences, ...main.visualNodes].map(item => item.id));
  for (const item of [...main.occurrences, ...main.visualNodes]) if (item.parent && !nodes.has(item.parent.id)) item.parent = null;
  const views = new Map([[viewId, main]]), queue = [main];
  for (let at = 0; at < queue.length; at++) for (const node of queue[at].visualNodes) if (node.kind === 'viewReference' && !views.has(node.targetViewId)) {
    const entry = structuredClone(state.views.find(entry => entry.view.id === node.targetViewId)); views.set(entry.view.id, entry); queue.push(entry);
  }
  const needed = new Set(), pending = [];
  function include(ref) { const value = typed(ref); if (!needed.has(value)) { needed.add(value); pending.push(ref); } }
  for (const entry of views.values()) { for (const item of entry.occurrences) include(item.concept); for (const item of entry.connections) include({ kind: 'relationship', id: item.relationshipId }); }
  const indexes = Object.fromEntries(Object.entries(concepts).map(([kind,key]) => [kind, new Map(state[key].map(item => [item.id,item]))]));
  for (let at = 0; at < pending.length; at++) if (pending[at].kind === 'relationship') {
    const item = indexes.relationship.get(pending[at].id); include(item.source); include(item.target);
  }
  const portable = createProject(state.project.name); portable.project.id = state.project.id; portable.views = [...views.values()];
  for (const [kind,key] of Object.entries(concepts)) portable[key] = sorted(state[key].filter(item => needed.has(`${kind}:${item.id}`)));
  const profileIds = new Set(Object.values(concepts).flatMap(key => portable[key].flatMap(item => (item.profileApplications ?? []).map(application => application.profileId))));
  for(const entry of portable.views)for(const node of entry.visualNodes)for(const row of node.legend?.colors??[])if(row.profileId)profileIds.add(row.profileId);
  const profiles = (state.customizationProfiles ?? []).filter(item => profileIds.has(item.id)); if (profiles.length) portable.customizationProfiles = sorted(profiles);
  const viewpointIds = new Set(portable.views.map(entry => entry.view.viewpointId).filter(Boolean));
  const viewpoints = (state.viewpoints ?? []).filter(item => viewpointIds.has(item.id)); if (viewpoints.length) portable.viewpoints = sorted(viewpoints);
  const assetIds = new Set(portable.views.flatMap(entry => [...entry.occurrences, ...entry.visualNodes].flatMap(item => [item.assetId, item.style?.image?.assetId])).concat(profiles.map(item => item.imageAssetId)).filter(Boolean));
  portable.assets = sorted(state.assets.filter(item => assetIds.has(item.id)));
  // Folder membership is a source-model organization, not part of the selected diagram.
  return freezeJSON({ format: 'arkita-portable-fragment', version: 1, viewId, files: exportFiles(portable) });
}

export function readPortableFragment(fragment) {
  assertJSON(fragment); record(fragment, ['format','version','viewId','files']);
  if (fragment.format !== 'arkita-portable-fragment' || fragment.version !== 1) fail('FRAGMENT_VERSION', 'Неподдерживаемая версия переносимого фрагмента.');
  const { state, sourceVersion } = readProjectFiles(fragment.files);
  if (sourceVersion !== 4) fail('FRAGMENT_VERSION', 'Переносимый фрагмент требует native V4.');
  const source = state.views.find(entry => entry.view.id === fragment.viewId); if (!source) fail('REFERENCE', 'Исходное представление фрагмента отсутствует.');
  if (collections.every(key => !source[key].length)) fail('FRAGMENT_EMPTY', 'Переносимый фрагмент пуст.');
  return { state, source };
}

export function portableFragmentInfo(fragment) {
  const { state, source } = readPortableFragment(fragment);
  return freezeJSON({ projectId: state.project.id, projectName: state.project.name,
    drawings: Object.fromEntries(collections.map(key => [key,source[key].length])),
    concepts: state.elements.length + state.junctions.length, relationships: state.relationships.length,
    assets: state.assets.length, profiles: (state.customizationProfiles ?? []).map(item => item.name),
    referencedViews: state.views.filter(entry => entry !== source).map(entry => entry.view.name),
    warnings: ['Внешние линии не переносятся. Организация папок исходной модели не переносится.', ...(state.views.length > 1 ? ['Связанные представления копируются целиком, включая скрытые рисунки и их данные.'] : [])] });
}

/** Cross-model paste always clones, even when UUIDs or names happen to match. */
export function pastePortableFragmentInto(state, { fragment, viewId, dx, dy }) {
  const { state: portable, source } = readPortableFragment(fragment);
  const target = state.views.find(entry => entry.view.id === viewId); if (!target) fail('REFERENCE', 'Целевое представление отсутствует.');
  if (![dx,dy].every(value => Number.isFinite(value) && !Object.is(value,-0) && Math.abs(value) <= 2000000 && Math.round(value*10)/10 === value)) fail('GEOMETRY', 'Смещение должно быть конечным и на сетке 0.1.');
  const { snapshot, ids } = remapProject(portable), mainId = ids[source.view.id];
  const created = { elementIds: [], junctionIds: [], relationshipIds: [], occurrenceIds: [], connectionIds: [], visualNodeIds: [], visualConnectorIds: [], anchorIds: [], viewIds: [], profileIds: [], assetIds: [] };
  for (const [kind,key] of Object.entries(concepts)) { state[key].push(...snapshot[key]); created[`${kind}Ids`] = snapshot[key].map(item => item.id); }
  for (const key of ['customizationProfiles','viewpoints','assets']) if (snapshot[key]?.length) (state[key] ??= []).push(...snapshot[key]);
  created.assetIds = snapshot.assets.map(item => item.id); created.profileIds = (snapshot.customizationProfiles ?? []).map(item => item.id);
  for (const entry of snapshot.views) {
    const isMain = entry.view.id === mainId;
    for (const item of entry.visualNodes) if (item.kind === 'viewReference' && item.targetViewId === mainId) item.targetViewId = viewId;
    if (isMain) {
      const shift = point => ({ x: Math.round((point.x+dx)*10)/10 || 0, y: Math.round((point.y+dy)*10)/10 || 0 });
      for (const item of [...entry.occurrences,...entry.visualNodes]) Object.assign(item.bounds,shift(item.bounds));
      for (const item of [...entry.connections,...entry.visualConnectors]) { for (const route of item.routePoints) route.point = shift(route.point); if (item.labelPosition) item.labelPosition = shift(item.labelPosition); }
      for (const [kind,key] of Object.entries(DRAWING_COLLECTIONS)) { target[key].push(...entry[key]); created[`${kind}Ids`] = entry[key].map(item => item.id); }
    } else { state.views.push(entry); created.viewIds.push(entry.view.id); }
    for (const item of [...entry.connections,...entry.visualConnectors]) created.anchorIds.push(...item.routePoints.filter(point => point.kind === 'anchor').map(point => point.id));
  }
  validateProject(state);
  const visible = projectView(state,viewId);
  for (const [kind,key] of Object.entries(DRAWING_COLLECTIONS)) if (created[`${kind}Ids`].some(id => !visible[key].some(item => item.id === id))) fail('FRAGMENT_VIEWPOINT', 'Viewpoint целевого вида скрывает часть фрагмента. Выберите другой вид или измените viewpoint.');
  return created;
}
