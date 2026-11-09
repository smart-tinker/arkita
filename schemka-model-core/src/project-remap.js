import { exportFiles, validateProject, newId } from './format.js';

const refFields = new Set(['id', 'profileId', 'viewpointId', 'relationshipId', 'parentFolderId', 'targetViewId', 'assetId', 'imageAssetId', 'anchorId']);
const opaque = new Set(['properties', 'values', 'attributes', 'archiSource']);

/** Remap native identifiers only. User text and typed attribute values are opaque. */
export function remapProject(source) {
  validateProject(source);
  const snapshot = structuredClone(source), ids = new Map();
  for (const file of exportFiles(source)) {
    const record = JSON.parse(file.content); ids.set(record.id, newId(record.id.split('-')[0]));
    for (const point of record.routePoints ?? []) if (point.kind === 'anchor') ids.set(point.id, newId('anc'));
  }
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (opaque.has(key)) continue;
      if (refFields.has(key) && typeof item === 'string' && ids.has(item)) value[key] = ids.get(item);
      else walk(item);
    }
  }
  walk(snapshot); validateProject(snapshot);
  return { snapshot, ids: Object.fromEntries(ids) };
}

