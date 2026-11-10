import { catalogSelectionMovePlan } from '../../schemka-model-core/src/catalog-selection.js';
import { canonicalJSON, LIMITS } from '../../schemka-model-core/src/json.js';
import { validateProject } from '../../schemka-model-core/src/format.js';
import { notationElement } from './notation.js';

export const CATALOG_SECTIONS = Object.freeze([
  ['common', 'Общие'], ['strategy', 'Стратегия'], ['business', 'Бизнес'],
  ['application', 'Приложения'], ['technology', 'Технологии'], ['motivation', 'Мотивация'],
  ['implementation', 'Реализация и миграция'], ['relationships', 'Отношения'], ['views', 'Представления'],
].map(([id, label]) => Object.freeze({ id, label })));
export const FOLDER_SECTION_PROPERTY = 'arkita:catalog-section';
const sectionIds = new Set(CATALOG_SECTIONS.map(item => item.id));
const key = ref => `${ref.kind}:${ref.id}`;
const declaredSection = folder => {
  const rows = folder.properties.filter(row => row.key === FOLDER_SECTION_PROPERTY);
  return rows.length === 1 && sectionIds.has(rows[0].value) ? rows[0].value : null;
};

/** A view of existing records: opening the catalogue never rearranges the model. */
export function catalogTreeIndex(state) {
  const records = new Map(), owners = new Map(), children = new Map(), sectionsForFolder = new Map(), countsForFolder = new Map();
  const counts = new Map(CATALOG_SECTIONS.map(item => [item.id, 0]));
  for (const [kind, items] of [['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships], ['view', state.views.map(entry => entry.view)]]) {
    for (const item of items) records.set(key({ kind, id: item.id }), item);
  }
  const sectionFor = ref => {
    if (ref.kind === 'view') return 'views';
    if (ref.kind === 'relationship') return 'relationships';
    if (ref.kind === 'junction') return 'common';
    const family = notationElement(state.project.metamodel, records.get(key(ref))?.type).family;
    return sectionIds.has(family) ? family : 'common';
  };
  for (const [id] of records) { const at = id.indexOf(':'); const section = sectionFor({ kind: id.slice(0, at), id: id.slice(at + 1) }); counts.set(section, counts.get(section) + 1); }
  for (const folder of state.folders) {
    records.set(key({ kind: 'folder', id: folder.id }), folder);
    if (!children.has(folder.parentFolderId)) children.set(folder.parentFolderId, []);
    children.get(folder.parentFolderId).push(folder);
    const totals = new Map(), declared = declaredSection(folder);
    sectionsForFolder.set(folder.id, new Set(declared ? [declared] : []));
    for (const ref of folder.members) {
      owners.set(key(ref), folder.id);
      const section = sectionFor(ref); totals.set(section, (totals.get(section) ?? 0) + 1);
      sectionsForFolder.get(folder.id).add(section);
    }
    countsForFolder.set(folder.id, totals);
  }
  // Iteration also handles long imported folder chains without recursive calls.
  const order = [...(children.get(null) ?? [])];
  for (let at = 0; at < order.length; at++) order.push(...(children.get(order[at].id) ?? []));
  for (let at = order.length - 1; at >= 0; at--) {
    const folder = order[at], parent = sectionsForFolder.get(folder.parentFolderId);
    if (parent) for (const section of sectionsForFolder.get(folder.id)) parent.add(section);
    const parentCounts = countsForFolder.get(folder.parentFolderId);
    if (parentCounts) for (const [section, count] of countsForFolder.get(folder.id)) parentCounts.set(section, (parentCounts.get(section) ?? 0) + count);
  }
  for (const folder of order) {
    const sections = sectionsForFolder.get(folder.id), parent = sectionsForFolder.get(folder.parentFolderId);
    if (!sections.size) sections.add(parent?.size === 1 ? [...parent][0] : 'common');
  }
  for (let at = order.length - 1; at >= 0; at--) {
    const parent = sectionsForFolder.get(order[at].parentFolderId);
    if (parent) for (const section of sectionsForFolder.get(order[at].id)) parent.add(section);
  }
  return { records, owners, children, sectionsForFolder, countsForFolder, sectionFor, counts };
}

export function folderSectionProperties(folder, section) {
  if (!sectionIds.has(section)) throw Error('Выберите раздел дерева модели.');
  const properties = (folder?.properties ?? []).map(row => ({ ...row }));
  const rows = properties.filter(row => row.key === FOLDER_SECTION_PROPERTY);
  if (rows.length > 1 || rows.some(row => !sectionIds.has(row.value))) throw Error(`Свойство ${FOLDER_SECTION_PROPERTY} уже занято. Уточните его в свойствах папки перед переносом.`);
  if (rows.length) rows[0].value = section;
  else {
    if (properties.length >= LIMITS.properties) throw Error('В папке уже 64 свойства. Освободите одно перед назначением раздела.');
    properties.push({ key: FOLDER_SECTION_PROPERTY, value: section });
  }
  return properties;
}

export function destinationSection(state, value) {
  if (typeof value === 'string' && value.startsWith('@')) return sectionIds.has(value.slice(1)) ? value.slice(1) : null;
  const sections = catalogTreeIndex(state).sectionsForFolder.get(value);
  return sections?.size === 1 ? [...sections][0] : null;
}

function selectionSections(index, refs) {
  const sections = new Set();
  for (const ref of refs) {
    if (!index.records.has(key(ref))) throw Error('Объект каталога больше не существует.');
    if (ref.kind === 'folder') for (const section of index.sectionsForFolder.get(ref.id)) sections.add(section);
    else sections.add(index.sectionFor(ref));
  }
  return sections;
}

export function catalogDestinationOptions(state, refs = [], excludeFolderId = null, sectionId = null) {
  const index = catalogTreeIndex(state), wanted = refs.length ? selectionSections(index, refs) : new Set(sectionId ? [sectionId] : sectionIds);
  const prohibited = new Set(excludeFolderId ? [excludeFolderId] : []), queue = excludeFolderId ? [excludeFolderId] : [];
  for (let at = 0; at < queue.length; at++) for (const child of index.children.get(queue[at]) ?? []) { prohibited.add(child.id); queue.push(child.id); }
  const options = [], seen = new Set(), roots = CATALOG_SECTIONS.filter(item => wanted.has(item.id));
  for (const section of roots) {
    options.push([`@${section.id}`, section.label]);
    const pending = (index.children.get(null) ?? []).map(folder => ({ folder, path: '' }));
    for (let at = 0; at < pending.length; at++) {
      const { folder, path } = pending[at];
      if (prohibited.has(folder.id) || !index.sectionsForFolder.get(folder.id).has(section.id)) continue;
      const names = `${path ? `${path} / ` : ''}${folder.name}`;
      const label = names.length > 384 ? `…${names.slice(-384)}` : names;
      if (!seen.has(folder.id)) { options.push([folder.id, `${section.label} / ${label}`]); seen.add(folder.id); }
      for (const child of index.children.get(folder.id) ?? []) pending.push({ folder: child, path: label });
    }
  }
  // A shared legacy folder has a single destination identity in the dialog.
  return options;
}

/** A cross-section drop must not change an object's semantic type. */
export function catalogMovePlan(state, refs, destination, sectionId = null) {
  const index = catalogTreeIndex(state), sections = selectionSections(index, refs);
  const root = typeof destination === 'string' && destination.startsWith('@');
  const folderId = root || destination === null || destination === '' ? null : destination;
  const plan = catalogSelectionMovePlan(state, refs, folderId);
  if (sections.size !== 1) throw Error('Выбранные объекты относятся к разным разделам. Перемещайте их по разделам; общая импортированная папка сохраняется во всех своих ветвях.');
  const section = [...sections][0], targetSections = folderId === null ? null : index.sectionsForFolder.get(folderId);
  if (sectionId !== null && sectionId !== section || root && destination !== `@${section}` || targetSections && !targetSections.has(section)) throw Error('В эту ветвь можно перемещать только объекты её раздела. Тип объекта при переносе не меняется.');
  for (const ref of refs) if (ref.kind === 'folder' && !plan.carried.some(item => key(item) === key(ref))) {
    const folder = plan.snapshot.folders.find(item => item.id === ref.id);
    folder.properties = folderSectionProperties(folder, section);
  }
  validateProject(plan.snapshot);
  plan.unchanged = canonicalJSON(state) === canonicalJSON(plan.snapshot);
  return plan;
}
