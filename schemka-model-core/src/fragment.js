import { LIMITS, assertJSON, canonicalJSON, fail, record } from './json.js';
import { newId, validateProject } from './format.js';
import { DRAWING_COLLECTIONS } from './native-v4.js';
import { hierarchyDescendants } from './native-v4-commands.js';
import { freezeJSON } from './resolve.js';
import { projectView } from './viewpoints.js';

const key = ref => `${ref.kind}:${ref.id}`;
const sorted = items => [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const concepts = { element: 'elements', junction: 'junctions', relationship: 'relationships' };
const collections = Object.values(DRAWING_COLLECTIONS);
const prefixes = { occurrence: 'occ', connection: 'conn', visualNode: 'vnd', visualConnector: 'vcn', element: 'el', junction: 'jct', relationship: 'rel' };
const missing = () => fail('FRAGMENT_STALE', 'Исходный фрагмент изменён или удалён. Скопируйте его заново.');
function idMap(items, prefix) {
  const ids = items.map(() => newId(prefix)).sort();
  return new Map(sorted(items).map((item, index) => [item.id, ids[index]]));
}
function drawingMaps(drawings) {
  const maps = Object.fromEntries(Object.entries(DRAWING_COLLECTIONS).map(([kind, collection]) => [kind, idMap(drawings[collection], prefixes[kind])]));
  maps.anchor = idMap([...drawings.connections, ...drawings.visualConnectors].flatMap(item => item.routePoints.filter(point => point.kind === 'anchor')), 'anc');
  return maps;
}
function remapDrawings(drawings, maps, dx = 0, dy = 0) {
  const shifted = point => ({ x: Math.round((point.x + dx) * 10) / 10 || 0, y: Math.round((point.y + dy) * 10) / 10 || 0 });
  const ref = value => ({ kind: value.kind, id: maps[value.kind]?.get(value.id) ?? value.id, ...(Object.hasOwn(value, 'anchorId') ? { anchorId: maps.anchor.get(value.anchorId) } : {}) });
  for (const [kind, collection] of Object.entries(DRAWING_COLLECTIONS)) for (const item of drawings[collection]) {
    item.id = maps[kind].get(item.id);
    if (item.bounds) {
      item.bounds = { ...item.bounds, ...shifted(item.bounds) };
      item.parent = item.parent && maps[item.parent.kind]?.has(item.parent.id) ? ref(item.parent) : null;
    } else {
      item.source = ref(item.source); item.target = ref(item.target);
      item.routePoints = item.routePoints.map(point => ({ ...point, ...(point.kind === 'anchor' ? { id: maps.anchor.get(point.id) } : {}), point: shifted(point.point) }));
      if (item.labelPosition !== null) item.labelPosition = shifted(item.labelPosition);
    }
    if (item.concept) item.concept = ref(item.concept);
    if (item.relationshipId) item.relationshipId = maps.relationship?.get(item.relationshipId) ?? item.relationshipId;
  }
}
/** Shared with duplicateView so every typed parent/endpoint/anchor remaps once. */
export function remapViewDrawings(entry) { const maps = drawingMaps(entry); remapDrawings(entry, maps); return maps; }

function drawingFragment(view, selection) {
  if (!Array.isArray(selection) || !selection.length) fail('FRAGMENT_EMPTY', 'Выберите рисунки для копирования.');
  const drawings = new Map(Object.entries(DRAWING_COLLECTIONS).flatMap(([kind, collection]) => view[collection].map(item => [key({ kind, id: item.id }), item])));
  const selected = new Set();
  for (const ref of selection) {
    record(ref, ['kind', 'id']);
    if (!drawings.has(key(ref))) fail('FRAGMENT_SELECTION', 'Копировать можно только видимые рисунки активного вида.');
    if (selected.has(key(ref))) fail('FRAGMENT_SELECTION', 'Рисунок повторяется в выборе.');
    selected.add(key(ref));
  }
  const selectedNodes = hierarchyDescendants(view, selection.filter(ref => ['occurrence', 'visualNode'].includes(ref.kind)));
  for (const { kind, item } of selectedNodes) selected.add(key({ kind, id: item.id }));
  const allowed = new Set([...selected].filter(value => ['occurrence', 'visualNode'].includes(value.split(':')[0])));
  const lines = [...view.connections.map(item => ({ kind: 'connection', item })), ...view.visualConnectors.map(item => ({ kind: 'visualConnector', item }))];
  for (const { kind, item } of lines) allowed.add(key({ kind, id: item.id }));
  const dependents = new Map(), removed = [];
  for (const { kind, item } of lines) for (const endpoint of [item.source, item.target]) {
    const id = key({ kind, id: item.id }), endpointKey = key(endpoint);
    if (!dependents.has(endpointKey)) dependents.set(endpointKey, []);
    dependents.get(endpointKey).push(id);
    if (!allowed.has(endpointKey)) removed.push(id);
  }
  for (let at = 0; at < removed.length; at++) if (allowed.delete(removed[at])) removed.push(...(dependents.get(removed[at]) ?? []));
  if ([...selected].some(value => !allowed.has(value))) fail('FRAGMENT_EXTERNAL', 'У выбранной связи есть внешний конец. Выберите также её концы и рисунки связей, к которым они прикреплены.');
  const neighbours = new Map();
  const join = (a, b) => { if (!neighbours.has(a)) neighbours.set(a, []); neighbours.get(a).push(b); };
  for (const { kind, item } of lines) if (allowed.has(key({ kind, id: item.id }))) for (const endpoint of [item.source, item.target]) {
    join(key({ kind, id: item.id }), key(endpoint)); join(key(endpoint), key({ kind, id: item.id }));
  }
  const included = new Set(selected), queue = [...selected];
  for (let at = 0; at < queue.length; at++) for (const next of neighbours.get(queue[at]) ?? []) if (!included.has(next)) { included.add(next); queue.push(next); }
  return Object.fromEntries(Object.entries(DRAWING_COLLECTIONS).map(([kind, collection]) => [collection, sorted(view[collection].filter(item => included.has(key({ kind, id: item.id }))))]));
}
export function captureFragment(state, viewId, selection) {
  validateProject(state); assertJSON(selection);
  const drawings = drawingFragment(projectView(state, viewId), selection);
  const selectedConcepts = new Set(drawings.occurrences.map(item => key(item.concept)));
  for (const item of drawings.connections) selectedConcepts.add(`relationship:${item.relationshipId}`);
  const fragment = { format: 'arkita-fragment', version: 2, projectId: state.project.id, viewId, ...drawings };
  for (const [kind, collection] of Object.entries(concepts)) fragment[collection] = sorted(state[collection].filter(item => selectedConcepts.has(`${kind}:${item.id}`)));
  const profileIds = new Set(Object.values(concepts).flatMap(collection => fragment[collection].flatMap(item => (item.profileApplications ?? []).map(application => application.profileId))));
  for(const node of drawings.visualNodes)for(const row of node.legend?.colors??[])if(row.profileId)profileIds.add(row.profileId);
  fragment.customizationProfiles = sorted((state.customizationProfiles ?? []).filter(item => profileIds.has(item.id)));
  const assetIds = new Set([...drawings.occurrences, ...drawings.visualNodes].flatMap(item => [item.assetId, item.style?.image?.assetId]).concat(fragment.customizationProfiles.map(item => item.imageAssetId)).filter(Boolean));
  fragment.assets = sorted(state.assets.filter(item => assetIds.has(item.id)));
  return freezeJSON(structuredClone(fragment));
}
export function assertCurrentFragment(state, fragment) {
  assertJSON(fragment);
  record(fragment, ['format', 'version', 'projectId', 'viewId', ...collections, ...Object.values(concepts), 'customizationProfiles', 'assets']);
  if (fragment.format !== 'arkita-fragment' || fragment.version !== 2) fail('FRAGMENT_VERSION', 'Неподдерживаемый формат буфера фрагментов.');
  if (fragment.projectId !== state.project.id) fail('FRAGMENT_PROJECT', 'Вставка фрагмента доступна только в исходной модели.');
  for (const collection of [...collections, ...Object.values(concepts), 'customizationProfiles', 'assets']) if (!Array.isArray(fragment[collection])) fail('SCHEMA', 'Expected fragment collection');
  if (collections.every(collection => !fragment[collection].length)) fail('FRAGMENT_EMPTY', 'Буфер фрагментов пуст.');
  const source = state.views.find(entry => entry.view.id === fragment.viewId); if (!source) missing();
  for (const collection of [...collections, ...Object.values(concepts), 'customizationProfiles', 'assets']) {
    const current = new Map((collections.includes(collection) ? source[collection] : state[collection] ?? []).map(item => [item.id, item]));
    const seen = new Set();
    for (const item of fragment[collection]) {
      if (seen.has(item.id) || !current.has(item.id) || canonicalJSON(current.get(item.id)) !== canonicalJSON(item)) missing();
      seen.add(item.id);
    }
  }
  const candidate = structuredClone(state), entry = candidate.views.find(entry => entry.view.id === fragment.viewId);
  for (const collection of collections) entry[collection] = structuredClone(fragment[collection]);
  const nodeIds = new Set([...entry.occurrences, ...entry.visualNodes].map(item => item.id));
  for (const item of [...entry.occurrences, ...entry.visualNodes]) if (item.parent && !nodeIds.has(item.parent.id)) item.parent = null;
  validateProject(candidate);
}
export function pasteFragmentInto(state, { fragment, viewId, mode, dx, dy }) {
  if (!['reuse', 'clone'].includes(mode)) fail('FRAGMENT_MODE', 'Выберите вставку рисунков или независимую копию.');
  for (const value of [dx, dy]) if (!Number.isFinite(value) || Object.is(value, -0) || Math.abs(value) > LIMITS.coordinate * 2 || Math.round(value * 10) / 10 !== value) fail('GEOMETRY', 'Смещение должно быть конечным и на сетке 0.1.');
  assertCurrentFragment(state, fragment);
  const target = state.views.find(entry => entry.view.id === viewId); if (!target) fail('REFERENCE', 'Представление для вставки не найдено.');
  const maps = drawingMaps(fragment);
  for (const [kind, collection] of Object.entries(concepts)) maps[kind] = mode === 'clone' ? idMap(fragment[collection], prefixes[kind]) : new Map(fragment[collection].map(item => [item.id, item.id]));
  const created = { occurrenceIds: [], connectionIds: [], visualNodeIds: [], visualConnectorIds: [], elementIds: [], junctionIds: [], relationshipIds: [], anchorIds: [...maps.anchor.values()] };
  if (mode === 'clone') for (const [kind, collection] of Object.entries(concepts)) for (const original of fragment[collection]) {
    const item = structuredClone(original); item.id = maps[kind].get(original.id);
    if (kind === 'relationship') for (const end of ['source', 'target']) item[end] = { kind: original[end].kind, id: maps[original[end].kind].get(original[end].id) };
    state[collection].push(item); created[`${kind}Ids`].push(item.id);
  }
  const drawings = Object.fromEntries(collections.map(collection => [collection, structuredClone(fragment[collection])])); remapDrawings(drawings, maps, dx, dy);
  for (const [kind, collection] of Object.entries(DRAWING_COLLECTIONS)) {
    target[collection].push(...drawings[collection]); created[`${kind}Ids`] = drawings[collection].map(item => item.id);
  }
  validateProject(state);
  const visible = projectView(state, viewId);
  for (const [kind, collection] of Object.entries(DRAWING_COLLECTIONS)) if (created[`${kind}Ids`].some(id => !visible[collection].some(item => item.id === id))) fail('FRAGMENT_VIEWPOINT', 'Viewpoint целевого вида скрывает часть фрагмента. Измените viewpoint или выберите другой вид.');
  return created;
}
