import { exportFiles, importFiles } from '../schemka-model-core/src/index.js';

const records = files => new Map((files?.length ? exportFiles(importFiles(files)) : []).map(file => [file.path, JSON.parse(file.content)]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const geometry = new Set(['bounds', 'routePoints', 'labelPosition', 'parentOccurrenceId', 'parent', 'zIndex']);
function fields(before, after, prefix = '') {
  const result = [];
  for (const key of [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort()) {
    const left = before?.[key], right = after?.[key], name = prefix ? `${prefix}.${key}` : key;
    if (equal(left, right)) continue;
    if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) result.push(...fields(left, right, name));
    else result.push({ field: name, category: geometry.has(name.split('.')[0]) ? 'geometry' : 'metadata', before: left ?? null, after: right ?? null, beforePresent: left !== undefined, afterPresent: right !== undefined });
  }
  return result;
}
const byId = catalog => new Map([...catalog.values()].map(item => [item.id, item]));
function describe(name, record, catalog, concepts) {
  const type = name === 'schemka.json' ? 'model' : name.startsWith('assets/') ? 'asset' : name.includes('/visual-nodes/') ? 'visual-node' : name.includes('/visual-connectors/') ? 'visual-connector' : name.includes('/occurrences/') ? 'occurrence' : name.includes('/connections/') ? 'connection'
    : name.endsWith('/view.json') ? 'view' : name.startsWith('viewpoints/') ? 'viewpoint' : name.split('/')[1]?.replace(/s$/, '') || 'record';
  const reference = record.concept?.id || record.relationshipId;
  const concept = reference && concepts.get(reference);
  const viewId = name.startsWith('views/') ? name.split('/')[1] : null;
  const view = viewId && catalog.get(`views/${viewId}/view.json`);
  return { type, id: record.id, label: record.name || record.label || concept?.name || concept?.label || record.id || name,
    conceptId: reference || null, viewId, viewName: view?.name || null };
}
/** Compare canonical records, never whitespace/key order or repeated appearances of a shared concept. */
export function modelChanges(before = [], after = []) {
  const left = records(before), right = records(after), catalog = new Map([...left, ...right]), concepts = byId(catalog);
  return [...new Set([...left.keys(), ...right.keys()])].sort().filter(name => !equal(left.get(name), right.get(name))).map(name => ({
    path: name, ...describe(name, right.get(name) || left.get(name), catalog, concepts),
    kind: !left.has(name) ? 'added' : !right.has(name) ? 'deleted' : 'modified', fields: fields(left.get(name), right.get(name)),
  }));
}
/** Each conflict retains the exact three records, plus readable graph context from each side. */
export function conflictContext(conflicts, base, local, remote) {
  const sides = { base: records(base), local: records(local), remote: records(remote) };
  const concepts = Object.fromEntries(Object.entries(sides).map(([side, catalog]) => [side, byId(catalog)]));
  return conflicts.map(conflict => {
    const context = {};
    for (const [side, catalog] of Object.entries(sides)) {
      const record = catalog.get(conflict.path);
      if (!record) { context[side] = null; continue; }
      const related = [...catalog.entries()].filter(([name, item]) => name !== conflict.path &&
        (item.concept?.id === record.id || item.relationshipId === record.id || item.source?.id === record.id || item.target?.id === record.id));
      const relations = related.filter(([name]) => name.includes('/relationships/')).map(([name, item]) => describe(name, item, catalog, concepts[side]));
      const ids = new Set([record.id, ...relations.map(item => item.id)]);
      const views = new Map();
      for (const [name, item] of catalog) if (name.startsWith('views/') && (ids.has(item.id) || ids.has(item.concept?.id) || ids.has(item.relationshipId))) {
        const viewId = name.split('/')[1], view = catalog.get(`views/${viewId}/view.json`);
        views.set(viewId, { id: viewId, name: view?.name || viewId });
      }
      context[side] = { ...describe(conflict.path, record, catalog, concepts[side]), relationships: relations, views: [...views.values()] };
    }
    return { ...conflict, context, localChanges: fields(sides.base.get(conflict.path), sides.local.get(conflict.path)), remoteChanges: fields(sides.base.get(conflict.path), sides.remote.get(conflict.path)) };
  });
}
