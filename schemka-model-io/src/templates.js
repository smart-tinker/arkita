import { createProject, createStore, validateProject, exportFiles, capturePortableFragment, readPortableFragment, projectView } from '../../schemka-model-core/src/index.js';
import { fail, parseJSON, record, text as checkText } from '../../schemka-model-core/src/json.js';
import { serializeProjectFile, deserializeProjectFile } from './project-file.js';
import { remapProject, extractViewProject, previewNativeMerge, transferChanges } from './model-transfer.js';

export const TEMPLATE_VERSION = 1;
export const TEMPLATE_LIMIT = 18 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const decode = value => typeof value === 'string' ? value : decoder.decode(value);
function checkMetadata(value, state) {
  record(value, ['id', 'name', 'description', 'kind', 'categories', 'keyViewId', 'sourceViewId']);
  if (!/^tpl-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id)) fail('TEMPLATE_SCHEMA', 'Некорректный ID шаблона.');
  checkText(value.name); checkText(value.description);
  if (!value.name.trim() || !['model', 'board', 'pattern'].includes(value.kind)) fail('TEMPLATE_SCHEMA', 'Укажите имя и тип шаблона.');
  if (!Array.isArray(value.categories) || value.categories.length > 32 || new Set(value.categories).size !== value.categories.length) fail('TEMPLATE_SCHEMA', 'Категории должны быть уникальны (до 32).');
  value.categories.forEach(item => { checkText(item); if (!item.trim() || item.length > 80) fail('TEMPLATE_SCHEMA', 'Категория должна содержать от 1 до 80 символов.'); });
  if (value.kind === 'model' ? value.sourceViewId !== null : !state.views.some(entry => entry.view.id === value.sourceViewId)) fail('TEMPLATE_VIEW', 'Исходное представление шаблона не найдено.');
  if (value.keyViewId !== null && !state.views.some(entry => entry.view.id === value.keyViewId)) fail('TEMPLATE_VIEW', 'Ключевой preview не относится к представлению шаблона.');
}
export function createTemplate(source, { name, description = '', kind = 'model', viewId = null, selection = null, categories = [], keyViewId = viewId ?? source.views[0]?.view.id ?? null } = {}) {
  const snapshot = kind === 'model' ? structuredClone(source) : kind === 'pattern' ? readPortableFragment(capturePortableFragment(source, viewId, selection)).state : extractViewProject(source, viewId);
  validateProject(snapshot);
  const metadata = { id: `tpl-${crypto.randomUUID()}`, name: name ?? source.project.name, description, kind, categories: [...categories], keyViewId, sourceViewId: kind === 'model' ? null : viewId };
  checkMetadata(metadata, snapshot); return { metadata, snapshot };
}
export function serializeTemplate(template) {
  validateProject(template.snapshot); checkMetadata(template.metadata, template.snapshot);
  const result = encoder.encode(JSON.stringify({ format: 'arkita-template', version: TEMPLATE_VERSION, metadata: JSON.stringify(template.metadata), model: decode(serializeProjectFile(template.snapshot)) }) + '\n');
  if (result.byteLength > TEMPLATE_LIMIT) fail('TEMPLATE_LIMIT', 'Пакет шаблона превышает 18 MiB.');
  return result;
}
/** A shallow, closed envelope: nested model bytes keep the existing strict native parser. */
export function readTemplate(input) {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) fail('TEMPLATE_INPUT', 'Ожидаются UTF-8 байты шаблона.');
  if ((typeof input === 'string' ? encoder.encode(input).length : input.byteLength) > TEMPLATE_LIMIT) fail('TEMPLATE_LIMIT', 'Пакет шаблона превышает 18 MiB.');
  let source; try { source = decode(input); } catch { fail('TEMPLATE_ENCODING', 'Шаблон должен быть корректным UTF-8.'); }
  if (!source.isWellFormed()) fail('TEMPLATE_ENCODING', 'Некорректный Unicode.');
  let at = 0; const result = {}, keys = new Set();
  const white = () => { while (/[ \t\r\n]/.test(source[at] ?? '\0')) at++; };
  const expect = token => { white(); if (source[at++] !== token) fail('TEMPLATE_JSON', 'Некорректный пакет шаблона.'); };
  const string = () => { white(); const start = at; if (source[at++] !== '"') fail('TEMPLATE_JSON', 'Ожидается строка.'); let escaped = false;
    while (at < source.length) { const ch = source[at++]; if (ch === '"' && !escaped) { try { return JSON.parse(source.slice(start, at)); } catch { fail('TEMPLATE_JSON', 'Некорректная строка.'); } } if (ch === '\\' && !escaped) escaped = true; else escaped = false; }
    fail('TEMPLATE_JSON', 'Незавершённая строка.'); };
  expect('{');
  while (true) {
    const key = string(); if (!['format', 'version', 'metadata', 'model'].includes(key) || keys.has(key)) fail('TEMPLATE_SCHEMA', 'Неизвестное или повторное поле шаблона.'); keys.add(key); expect(':');
    if (key === 'version') { white(); if (source[at++] !== '1') fail('TEMPLATE_VERSION', 'Эта версия шаблона не поддерживается.'); result.version = 1; } else result[key] = string();
    white(); if (source[at] === '}') { at++; break; } expect(',');
  }
  white(); if (at !== source.length || keys.size !== 4 || result.format !== 'arkita-template') fail('TEMPLATE_SCHEMA', 'Некорректный формат шаблона.');
  const snapshot = deserializeProjectFile(result.model), metadata = parseJSON(result.metadata); checkMetadata(metadata, snapshot);
  return { metadata: structuredClone(metadata), snapshot };
}
export function instantiateTemplate(template, { name = template.metadata.name } = {}) {
  checkMetadata(template.metadata, template.snapshot); const result = remapProject(template.snapshot); result.snapshot.project.name = name;
  validateProject(result.snapshot); return { ...result, viewId: result.ids[template.metadata.sourceViewId ?? template.metadata.keyViewId] ?? result.snapshot.views[0]?.view.id ?? null };
}
export function insertBoardTemplate(target, template, { concepts = 'new' } = {}) {
  if (!['board', 'pattern'].includes(template.metadata.kind) || !['new', 'reuse'].includes(concepts)) fail('TEMPLATE_MODE', 'Выберите шаблон доски и политику концептов.');
  const next = instantiateTemplate(template), state = next.snapshot;
  if (concepts === 'reuse') {
    const remaps = new Map();
    for (const collection of ['elements', 'junctions', 'relationships']) for (const original of template.snapshot[collection]) {
      const existing = target[collection].find(item => item.id === original.id);
      if (!existing) continue;
      if (existing.type !== original.type) fail('TEMPLATE_TYPE', `ID ${original.id} имеет другой тип. Выберите независимые концепты.`);
      remaps.set(next.ids[original.id], original.id);
      state[collection] = state[collection].filter(item => item.id !== next.ids[original.id]);
    }
    const ref = value => { if (remaps.has(value?.id)) value.id = remaps.get(value.id); };
    for (const rel of state.relationships) { ref(rel.source); ref(rel.target); }
    for (const entry of state.views) { for (const node of entry.occurrences) ref(node.concept); for (const line of entry.connections) if (remaps.has(line.relationshipId)) line.relationshipId = remaps.get(line.relationshipId); }
    for (const folder of state.folders) folder.members = folder.members.filter(member => !remaps.has(member.id));
    // Reused concepts retain current metadata and endpoints; validate the entire resulting graph below.
    for (const collection of ['elements', 'junctions', 'relationships']) state[collection].push(...target[collection].filter(item => [...remaps.values()].includes(item.id)).map(item => structuredClone(item)));
    for (const profile of target.customizationProfiles ?? []) if (!(state.customizationProfiles ?? []).some(item => item.id === profile.id)) (state.customizationProfiles ??= []).push(structuredClone(profile));
    for (const asset of target.assets) if (!state.assets.some(item => item.id === asset.id)) state.assets.push(structuredClone(asset));
  }
  const result = previewNativeMerge(target, state, { updateExisting: false, modelMetadata: false });
  return { ...result, viewId: next.viewId };
}
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
/** Geometry thumbnail only; editing and semantic rendering stay in the ordinary workbench. */
export function templatePreviewSVG(state, viewId) {
  validateProject(state); const entry = state.views.find(item => item.view.id === viewId); if (!entry) fail('TEMPLATE_VIEW', 'Представление не найдено.');
  const nodes = [...entry.occurrences, ...entry.visualNodes], minX = Math.min(0, ...nodes.map(item => item.bounds.x)), minY = Math.min(0, ...nodes.map(item => item.bounds.y));
  const width = Math.max(160, ...nodes.map(item => item.bounds.x + item.bounds.width)) - minX + 24, height = Math.max(100, ...nodes.map(item => item.bounds.y + item.bounds.height)) - minY + 24;
  const concepts = new Map([...state.elements, ...state.junctions].map(item => [item.id, item]));
  const shapes = nodes.map(item => { const b = item.bounds, label = item.text ?? item.name ?? concepts.get(item.concept?.id)?.name ?? '';
    return `<g><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="6" fill="${escape(item.style.fill || '#f4f7fb')}" stroke="#68778c"/><text x="${b.x + 8}" y="${b.y + 20}" font-size="12" fill="#182333">${escape(label.slice(0, 80))}</text></g>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - 12} ${minY - 12} ${width} ${height}" role="img"><title>${escape(entry.view.name)}</title><rect x="${minX - 12}" y="${minY - 12}" width="${width}" height="${height}" fill="${escape(entry.view.background || '#ffffff')}"/>${shapes}</svg>`;
}

/** Local library writes one complete value. Quota errors preserve the previous collection. */
export function createTemplateLibrary(storage, key = 'arkita.templates.v1') {
  const read = () => {
    const bytes = storage.getItem(key); if (!bytes) return { categories: [], templates: [] };
    if (encoder.encode(bytes).byteLength > 4 * 1024 * 1024) fail('TEMPLATE_LIBRARY', 'Локальная коллекция превышает 4 MiB.');
    const value = JSON.parse(bytes); record(value,['version','categories','templates']);
    if (value.version !== 1 || !Array.isArray(value.categories) || !Array.isArray(value.templates) || value.templates.length > 100) fail('TEMPLATE_LIBRARY', 'Локальная коллекция повреждена. Экспортируйте доступные шаблоны.');
    if(value.categories.length>64||new Set(value.categories).size!==value.categories.length||value.categories.some(item=>typeof item!=='string'||!item.trim()||item.length>80))fail('TEMPLATE_LIBRARY','Повреждены категории коллекции.');
    const ids=value.templates.map(item=>readTemplate(item).metadata.id);if(new Set(ids).size!==ids.length)fail('TEMPLATE_LIBRARY','Повторные ID шаблонов коллекции.');
    return value;
  };
  const write = value => { if(value.categories.length>64)fail('TEMPLATE_LIBRARY','Допускается до 64 категорий.');const bytes = JSON.stringify({ ...value, version: 1 }); if (encoder.encode(bytes).byteLength > 4 * 1024 * 1024) fail('TEMPLATE_LIBRARY', 'Коллекция заполнена. Экспортируйте шаблон в файл.'); storage.setItem(key, bytes); };
  return {
    list() { const value = read(); return { categories: [...value.categories], templates: value.templates.map(readTemplate) }; },
    put(template) { const value = read(), bytes = decode(serializeTemplate(template)), index = value.templates.findIndex(item => readTemplate(item).metadata.id === template.metadata.id); if (index < 0) { if (value.templates.length >= 100) fail('TEMPLATE_LIBRARY', 'Допускается до 100 локальных шаблонов.'); value.templates.push(bytes); } else value.templates[index] = bytes; value.categories = [...new Set([...value.categories, ...template.metadata.categories])]; write(value); },
    remove(id) { const value = read(); value.templates = value.templates.filter(item => readTemplate(item).metadata.id !== id); write(value); },
    category(name, next = name) { checkText(name); if (!name.trim() || name.length > 80 || next !== null && (!next.trim() || next.length > 80)) fail('TEMPLATE_CATEGORY', 'Укажите название категории.'); const value = read(); value.categories = [...new Set([...value.categories.filter(item => item !== name), ...(next === null ? [] : [next])])]; value.templates = value.templates.map(item => { const template = readTemplate(item); template.metadata.categories = [...new Set(template.metadata.categories.flatMap(item => item === name ? next === null ? [] : [next] : [item]))]; return decode(serializeTemplate(template)); }); write(value); },
  };
}

export function insertPatternTemplate(target, template, viewId, { concepts = 'new', dx = 24, dy = 24 } = {}) {
  if (template.metadata.kind !== 'pattern') fail('TEMPLATE_MODE', 'Выберите шаблон фрагмента.');
  if (![dx, dy].every(value => Number.isFinite(value) && !Object.is(value, -0) && Math.abs(value) <= 2000000 && Math.round(value * 10) / 10 === value)) fail('TEMPLATE_GEOMETRY', 'Смещение должно быть на сетке 0.1.');
  if (concepts === 'new') {
    const store = createStore(target); store.execute({ type: 'pastePortableFragment', viewId, dx, dy, fragment: { format: 'arkita-portable-fragment', version: 1, viewId: template.metadata.sourceViewId, files: exportFiles(template.snapshot) } }, store.revision);
    const snapshot = store.snapshot; return { snapshot, viewId, changes: transferChanges(target, snapshot), losses: ['Внешние связи и папки не переносятся. Связанные представления копируются целиком; все концепты и рисунки получают новые ID.'] };
  }
  const merged = insertBoardTemplate(target, template, { concepts }), snapshot = merged.snapshot, main = snapshot.views.find(entry => entry.view.id === merged.viewId), destination = snapshot.views.find(entry => entry.view.id === viewId);
  if (!destination) fail('TEMPLATE_VIEW', 'Выберите целевое представление.');
  const shift = point => ({ x: Math.round((point.x + dx) * 10) / 10 || 0, y: Math.round((point.y + dy) * 10) / 10 || 0 });
  for (const item of [...main.occurrences, ...main.visualNodes]) Object.assign(item.bounds, shift(item.bounds));
  for (const item of [...main.connections, ...main.visualConnectors]) { for (const route of item.routePoints) route.point = shift(route.point); if (item.labelPosition) item.labelPosition = shift(item.labelPosition); }
  for (const key of ['occurrences', 'connections', 'visualNodes', 'visualConnectors']) destination[key].push(...main[key]);
  snapshot.views = snapshot.views.filter(entry => entry !== main);
  for (const entry of snapshot.views) for (const node of entry.visualNodes) if (node.kind === 'viewReference' && node.targetViewId === main.view.id) node.targetViewId = viewId;
  snapshot.folders = snapshot.folders.map(folder => ({ ...folder, members: folder.members.filter(member => member.id !== main.view.id) }));
  validateProject(snapshot);
  const visible=projectView(snapshot,viewId);for(const key of ['occurrences','connections','visualNodes','visualConnectors']){const shown=new Set(visible[key].map(item=>item.id));if(main[key].some(item=>!shown.has(item.id)))fail('TEMPLATE_VIEWPOINT','Viewpoint текущего вида скрывает рисунки шаблона. Выберите совместимый вид.');}
  return { snapshot, viewId, changes: transferChanges(target, snapshot), losses: ['Совпавшие concept ID используются без замены текущих метаданных. Рисунки независимы. Внешние связи и папки не переносятся; связанные представления копируются целиком.'] };
}
