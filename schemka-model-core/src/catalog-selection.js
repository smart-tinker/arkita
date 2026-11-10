import { validateProject, record, projectIndex, conceptRecord } from './format.js';
import { assertJSON, canonicalJSON, fail } from './json.js';

/** Moving a selected folder carries selected descendants; they are not flattened. */
export function catalogSelectionMovePlan(state, refs, folderId) {
  validateProject(state); assertJSON(refs);
  if (!Array.isArray(refs) || !refs.length) fail('COMMAND', 'Выберите объекты каталога.');
  if (folderId !== null && typeof folderId !== 'string') fail('SCHEMA', 'Неверная папка назначения.');
  const snapshot = structuredClone(state), folders = new Map(snapshot.folders.map(item => [item.id, item])), index = projectIndex(snapshot);
  if (folderId !== null && !folders.has(folderId)) fail('REFERENCE', 'Папка назначения не существует.');
  const selected = new Set(), folderIds = new Set(), owners = new Map(snapshot.folders.flatMap(item => item.members.map(ref => [`${ref.kind}:${ref.id}`, item.id])));
  for (const ref of refs) {
    record(ref, ['kind', 'id']);
    if (typeof ref.kind !== 'string' || typeof ref.id !== 'string') fail('SCHEMA', 'Неверная ссылка каталога.');
    const key = `${ref.kind}:${ref.id}`;
    if (selected.has(key)) fail('COMMAND', 'Повторный объект каталога.'); selected.add(key);
    if (ref.kind === 'folder') { if (!folders.has(ref.id)) fail('REFERENCE', 'Папка не существует.'); folderIds.add(ref.id); }
    else if (ref.kind === 'view') { if (!snapshot.views.some(entry => entry.view.id === ref.id)) fail('REFERENCE', 'Представление не существует.'); }
    else conceptRecord(index, ref);
  }
  function selectedAncestor(id) { for (let at = id; at; at = folders.get(at).parentFolderId) if (folderIds.has(at)) return true; return false; }
  if (selectedAncestor(folderId)) fail('FOLDER_CYCLE', 'Нельзя переместить выбранную папку в себя или её потомка.');
  const moved = [], carried = [];
  for (const ref of refs) {
    const parent = ref.kind === 'folder' ? folders.get(ref.id).parentFolderId : owners.get(`${ref.kind}:${ref.id}`) ?? null;
    if (selectedAncestor(parent)) carried.push({ ...ref }); else if (parent !== folderId) moved.push({ ...ref });
  }
  const members = new Set(moved.filter(ref => ref.kind !== 'folder').map(ref => `${ref.kind}:${ref.id}`));
  for (const folder of snapshot.folders) folder.members = folder.members.filter(ref => !members.has(`${ref.kind}:${ref.id}`));
  for (const ref of moved) {
    if (ref.kind === 'folder') folders.get(ref.id).parentFolderId = folderId;
    else if (folderId !== null) folders.get(folderId).members.push({ ...ref });
  }
  validateProject(snapshot);
  return { snapshot, moved, carried, unchanged: canonicalJSON(state) === canonicalJSON(snapshot) };
}
