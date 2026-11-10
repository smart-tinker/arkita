import { exportFiles, importFiles } from './format.js';
import { SchemkaError, assertJSON, fail, record } from './json.js';

function label(path, content) {
  const value = JSON.parse(content);
  const kind = path === 'schemka.json' ? 'Модель'
    : path.startsWith('model/elements/') ? 'Элемент'
    : path.startsWith('model/junctions/') ? 'Junction'
    : path.startsWith('model/relationships/') ? 'Отношение'
    : path.startsWith('model/customization-profiles/') ? 'Профиль'
    : path.startsWith('model/folders/') ? 'Папка'
    : path.startsWith('assets/') ? 'Ресурс'
    : path.includes('/visual-nodes/') ? 'Визуальный объект'
    : path.includes('/visual-connectors/') ? 'Визуальная линия'
    : path.startsWith('viewpoints/') ? 'Viewpoint'
    : path.endsWith('/view.json') ? 'Представление'
    : path.includes('/occurrences/') ? 'Объект на представлении' : 'Связь на представлении';
  return `${kind}: ${value.name || value.label || value.type || value.id || path}`;
}

/** Merge complete records by stable path; never accept a partially valid graph. */
export function mergeProjectFiles(baseFiles, localFiles, remoteFiles, resolution = {}) {
  assertJSON(resolution);
  record(resolution, [], ['records', 'whole']);
  if (Object.hasOwn(resolution, 'whole') && !['local', 'remote'].includes(resolution.whole)) {
    fail('MERGE_RESOLUTION', 'Whole-model resolution must be local or remote');
  }
  if (Object.hasOwn(resolution, 'whole') && Object.hasOwn(resolution, 'records')) {
    fail('MERGE_RESOLUTION', 'Choose whole-model or record resolutions, not both');
  }
  const choices = Object.hasOwn(resolution, 'records') ? resolution.records : {};
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) fail('MERGE_RESOLUTION', 'Expected record choices');
  const states = [baseFiles, localFiles, remoteFiles].map(importFiles);
  if (states.some(state => state.project.id !== states[0].project.id)) fail('PROJECT_ID', 'Cannot merge different projects');
  const [base, local, remote] = states.map(state => new Map(exportFiles(state).map(file => [file.path, file.content])));
  const paths = [...new Set([...base.keys(), ...local.keys(), ...remote.keys()])].sort();
  const conflicts = [], merged = [];
  for (const path of paths) {
    const b = base.get(path), l = local.get(path), r = remote.get(path);
    let content;
    if (l === r) content = l;
    else if (l === b) content = r;
    else if (r === b) content = l;
    else {
      conflicts.push({ path, label: label(path, l ?? r ?? b), base: b ?? null, local: l ?? null, remote: r ?? null });
      if (Object.hasOwn(choices, path)) content = choices[path] === 'local' ? l : r;
    }
    if (content !== undefined) merged.push({ path, content });
  }
  const conflictPaths = new Set(conflicts.map(conflict => conflict.path));
  for (const [path, choice] of Object.entries(choices)) {
    if (!conflictPaths.has(path) || !['local', 'remote'].includes(choice)) {
      fail('MERGE_RESOLUTION', 'Record resolution must name a conflicting path and choose local or remote');
    }
  }
  if (Object.hasOwn(resolution, 'whole')) {
    return { files: exportFiles(states[resolution.whole === 'local' ? 1 : 2]), conflicts, structuralError: null };
  }
  if (conflicts.some(conflict => !Object.hasOwn(choices, conflict.path))) return { files: null, conflicts, structuralError: null };
  try {
    return { files: exportFiles(importFiles(merged)), conflicts, structuralError: null };
  } catch (error) {
    if (!(error instanceof SchemkaError)) throw error;
    return { files: null, conflicts, structuralError: `Объединённая модель не прошла проверку структуры (${error.code}). Выберите целиком одну из версий.` };
  }
}
