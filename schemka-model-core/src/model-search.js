import { LIMITS, fail, text } from './json.js';
import { CURRENT_CATALOG } from './current-catalog.js';
import { metadataChange, ownerKey, propertyEntries } from './bulk-metadata.js';

export const SEARCH_KINDS = ['project', 'element', 'junction', 'relationship', 'view', 'folder', 'visualNode', 'visualConnector'];
export const searchName = item => item.name ?? item.label ?? '';
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/** Each metadata owner appears once, with all exact drawings kept separately. */
export function modelSearchRecords(state) {
  const records = [], folders = new Map((state.folders || []).map(item => [item.id, item]));
  const parents = new Map(), drawingIndex = new Map();
  for (const folder of state.folders || []) for (const member of folder.members || []) parents.set(ownerKey(member), folder.id);
  for (const entry of state.views) {
    for (const [kind, collection] of [['occurrence', entry.occurrences], ['connection', entry.connections]]) for (const drawing of collection) {
      const owner = kind === 'occurrence' ? drawing.concept : { kind: 'relationship', id: drawing.relationshipId }, key = ownerKey(owner);
      if (!drawingIndex.has(key)) drawingIndex.set(key, []);
      drawingIndex.get(key).push({ viewId: entry.view.id, kind, id: drawing.id });
    }
  }
  function folderPath(id) {
    const names = [], seen = new Set();
    while (id && !seen.has(id)) { seen.add(id); const folder = folders.get(id); if (!folder) break; names.unshift(folder.name); id = folder.parentFolderId; }
    return names;
  }
  function add(kind, item, viewId = null) {
    const owner = { kind, id: item.id, ...(viewId ? { viewId } : {}) }, drawings = [...(drawingIndex.get(ownerKey(owner)) || [])];
    if (viewId) drawings.push({ viewId, kind, id: item.id });
    const view = viewId && state.views.find(entry => entry.view.id === viewId)?.view;
    const parent = kind === 'folder' ? item.parentFolderId : parents.get(ownerKey(view ? { kind: 'view', id: view.id } : owner));
    records.push({ owner, item, name: searchName(item), path: [state.project.name, ...folderPath(parent), ...(view ? [view.name] : []), ...(kind === 'project' ? [] : [searchName(item)])].filter(Boolean).join(' / '),
      type: item.type || item.kind || kind, profiles: (item.profileApplications || []).map(application => application.profileId), drawings,
      viewIds: kind === 'view' ? [item.id] : [...new Set(drawings.map(drawing => drawing.viewId))] });
  }
  add('project', state.project);
  for (const [kind, field] of [['element', 'elements'], ['junction', 'junctions'], ['relationship', 'relationships'], ['folder', 'folders']]) for (const item of state[field] || []) add(kind, item);
  for (const entry of state.views) {
    add('view', entry.view);
    for (const item of entry.visualNodes || []) add('visualNode', item, entry.view.id);
    for (const item of entry.visualConnectors || []) add('visualConnector', item, entry.view.id);
  }
  return records.sort((a, b) => collator.compare(a.name, b.name) || ownerKey(a.owner).localeCompare(ownerKey(b.owner), 'en'));
}

export function searchVocabulary(state) {
  const records = modelSearchRecords(state);
  return { types: [...new Set([...Object.values(CURRENT_CATALOG).filter(Array.isArray).flat(), ...records.map(row => row.type)])].sort(),
    views: state.views.map(entry => ({ id: entry.view.id, name: entry.view.name })),
    profiles: (state.customizationProfiles || []).map(item => ({ id: item.id, name: item.name })),
    properties: [...new Set(records.flatMap(row => propertyEntries(row.item.properties).map(item => item.key)))].sort() };
}

function matcher(options) {
  text(options.query ?? '');
  if ((options.query || '').length > 256) fail('LIMIT', 'Запрос не длиннее 256 символов.');
  const query = options.query || '';
  if (!query) return null;
  let expression;
  try { expression = new RegExp(options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), `gu${options.caseSensitive ? '' : 'i'}`); }
  catch (error) { fail('SEARCH_REGEX', `Некорректное регулярное выражение JavaScript: ${error.message}`); }
  const word = char => char && /[\p{L}\p{N}\p{M}_]/u.test(char);
  return value => {
    const found = []; expression.lastIndex = 0;
    for (const match of value.matchAll(expression)) {
      const end = match.index + match[0].length;
      if (!options.wholeWord || (!word([...value.slice(0, match.index)].at(-1)) && !word([...value.slice(end)][0]))) found.push({ index: match.index, length: match[0].length });
      if (found.length > LIMITS.string) fail('LIMIT', 'Слишком много совпадений в одном поле.');
    }
    return found;
  };
}

/** Regex callers MUST execute this in a disposable worker with an external deadline. */
export function searchModel(state, options = {}) {
  const match = matcher(options), fields = options.fields || ['name', 'documentation', 'properties'];
  const visible = options.visibleOwners ? new Set(options.visibleOwners.map(ownerKey)) : null;
  const result = []; let matchCount = 0;
  for (const row of modelSearchRecords(state)) {
    if (options.kinds?.length && !options.kinds.includes(row.owner.kind)) continue;
    if (options.types?.length && !options.types.includes(row.type)) continue;
    if (options.profiles?.length && !row.profiles.some(id => options.profiles.includes(id))) continue;
    if (options.views?.length && !row.viewIds.some(id => options.views.includes(id))) continue;
    if (visible && !visible.has(ownerKey(row.owner))) continue;
    if (options.owners?.length && !options.owners.some(owner => ownerKey(owner) === ownerKey(row.owner))) continue;
    const values = [];
    if (fields.includes('name')) values.push({ field: Object.hasOwn(row.item, 'label') ? 'label' : 'name', value: row.name });
    if (fields.includes('documentation')) values.push({ field: 'documentation', value: row.item.documentation || '' });
    if (fields.includes('properties')) for (const [index, property] of propertyEntries(row.item.properties).entries()) {
      if (!options.propertyKeys?.length || options.propertyKeys.includes(property.key)) {
        values.push({ field: 'properties', index, key: property.key, value: property.value });
      }
    }
    const matches = match ? values.flatMap(({ value, ...field }) => match(value).map(span => ({ ...field, ...span }))) : [];
    matchCount += matches.length;
    if (matchCount > 50000) fail('LIMIT', 'Больше 50 000 совпадений. Сузьте область поиска.');
    if (match && !matches.length && !(options.showAllFolders && row.owner.kind === 'folder')) continue;
    result.push({ ...row, matches });
  }
  return result;
}

export function planNameReplacement(state, options, replacement, onlyOwners = null) {
  text(replacement);
  if (!options.query) fail('COMMAND', 'Для замены нужен непустой запрос.');
  const changes = [], matches = searchModel(state, { ...options, fields: ['name'], showAllFolders: false });
  for (const row of matches) {
    if (onlyOwners && !onlyOwners.some(owner => ownerKey(owner) === ownerKey(row.owner))) continue;
    let after = '', cursor = 0;
    for (const match of row.matches) { after += row.name.slice(cursor, match.index) + replacement; cursor = match.index + match.length; }
    after += row.name.slice(cursor);
    if (after.length > LIMITS.string) fail('LIMIT', 'Результат замены превышает допустимую длину имени.');
    const field = row.matches[0].field, change = metadataChange(row.owner, row.item, { [field]: after });
    if (change) changes.push({ ...change });
  }
  return { changes, collisions: [] };
}
