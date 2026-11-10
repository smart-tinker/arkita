import { createProject, validateProject, CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { newId } from '../../schemka-model-core/src/format.js';
import { fail, parseJSON } from '../../schemka-model-core/src/json.js';
import { transferChanges, mergePropertyRows, checkImportedRelationships } from './model-transfer.js';
import { collectArchiMappings } from './archi-provenance.js';

export const CSV_VERSION = 1;
export const CSV_LIMITS = Object.freeze({ bytes: 18 * 1024 * 1024, rows: 100000, columns: 32, field: 262144 });
const encoder = new TextEncoder(), tables = { elements: 'element', junctions: 'junction', relationships: 'relationship' };
const prefixes = { element: 'el', junction: 'jct', relationship: 'rel' };
const scalar = ['id', 'type', 'name', 'documentation', 'profileApplications'];
const relation = ['id', 'type', 'label', 'documentation', 'sourceKind', 'sourceId', 'targetKind', 'targetId', 'sourceMultiplicity', 'sourceMultiplicityPresent', 'targetMultiplicity', 'targetMultiplicityPresent', 'junctionRole', 'profileApplications'];
const headers = { elements: scalar, junctions: scalar, relationships: relation, properties: ['kind', 'id', 'position', 'key', 'value'], profiles: ['id', 'definition'], model: ['id', 'name', 'documentation'] };
function problem(file, row, field, message) { const error = Error(`${file}:${row}${field ? ` · ${field}` : ''}: ${message}`); error.code = 'CSV_INVALID'; error.file = file; error.row = row; error.field = field; throw error; }
function text(input, file) {
  let value;
  try { value = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input); }
  catch { problem(file, 1, '', 'Ожидается UTF-8. Некорректная последовательность байтов.'); }
  if (encoder.encode(value).length > CSV_LIMITS.bytes) problem(file, 1, '', 'Файл превышает 18 MiB.');
  if (!value.isWellFormed()) problem(file, 1, '', 'Некорректный Unicode.');
  return value.replace(/^\uFEFF/, '');
}
/** RFC 4180 quoting, physical line diagnostics. Comments exist only as a single unquoted #arkita-comment field. */
export function parseCSV(input, { delimiter = ',', name = 'data.csv' } = {}) {
  if (![',', ';', '\t'].includes(delimiter)) fail('CSV_DELIMITER', 'Выберите запятую, точку с запятой или табуляцию.');
  const source = text(input, name), result = []; let fields = [], value = '', quoted = false, afterQuote = false, fieldQuoted = false, rowQuoted = false, line = 1, startLine = 1;
  function field() { fields.push(value); if (fields.length > CSV_LIMITS.columns) problem(name, startLine, '', 'Слишком много столбцов.'); value = ''; afterQuote = false; fieldQuoted = false; }
  function row() { field(); if (!(fields.length === 1 && (fields[0] === '' || !rowQuoted && fields[0].startsWith('#arkita-comment ')))) result.push({ values: fields, line: startLine }); fields = []; rowQuoted = false; if (result.length > CSV_LIMITS.rows) problem(name, startLine, '', 'Слишком много строк.'); }
  for (let at = 0; at < source.length; at++) {
    const ch = source[at];
    if (quoted) {
      if (ch === '"') { if (source[at + 1] === '"') { value += '"'; at++; } else { quoted = false; afterQuote = true; } }
      else { value += ch; if (ch === '\n' || ch === '\r' && source[at + 1] !== '\n') line++; }
    } else if (ch === delimiter) field();
    else if (ch === '\r' || ch === '\n') { row(); if (ch === '\r' && source[at + 1] === '\n') at++; line++; startLine = line; }
    else if (ch === '"' && !value && !afterQuote && !fieldQuoted) { quoted = true; fieldQuoted = true; rowQuoted = true; }
    else { if (ch === '"' || afterQuote) problem(name, line, String(fields.length + 1), 'Некорректные кавычки.'); value += ch; }
    if (value.length > CSV_LIMITS.field) problem(name, startLine, String(fields.length + 1), 'Слишком длинное поле.');
  }
  if (quoted) problem(name, startLine, String(fields.length + 1), 'Незакрытое поле в кавычках.');
  if (value || fields.length || afterQuote) row();
  return result;
}
function csv(rows, delimiter, bom) { return (bom ? '\uFEFF' : '') + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(delimiter)).join('\r\n') + '\r\n'; }
export function csvTables(state) {
  validateProject(state);
  const rows = { model: [[state.project.id, state.project.name, state.project.documentation]], profiles: (state.customizationProfiles ?? []).map(item => [item.id, JSON.stringify(item)]), properties: [] };
  for (const [table, kind] of Object.entries(tables)) rows[table] = state[table].map(item => headers[table].map(field => {
    if (field.endsWith('MultiplicityPresent')) return String(Object.hasOwn(item, field.replace('Present', '')));
    if (field === 'profileApplications') return item[field] ? JSON.stringify(item[field]) : '';
    if (field === 'sourceKind' || field === 'targetKind') return item[field.slice(0, -4)].kind;
    if (field === 'sourceId' || field === 'targetId') return item[field.slice(0, -2)].id;
    return item[field] ?? '';
  }));
  for (const [kind, records] of [['project', [state.project]], ...Object.entries(tables).map(([table, kind]) => [kind, state[table]])]) for (const item of records) {
    if (!item.properties.length) rows.properties.push([kind, item.id, '-1', '', '']);
    item.properties.forEach((row, position) => rows.properties.push([kind, item.id, String(position), row.key, row.value]));
  }
  return Object.fromEntries(Object.keys(headers).map(table => [table, { header: headers[table], rows: rows[table] }]));
}
export function exportCSV(state, { delimiter = ',', prefix = 'arkita', bom = false, flatten = false, spreadsheet = false } = {}) {
  if (![',', ';', '\t'].includes(delimiter) || !/^[\p{L}\p{N}][\p{L}\p{N}_. -]{0,79}$/u.test(prefix) || /[. ]$/.test(prefix)) fail('CSV_OPTIONS', 'Некорректный разделитель или префикс файлов.');
  const mode = spreadsheet ? 'spreadsheet-text' : flatten ? 'flattened' : 'canonical';
  const files = Object.entries(csvTables(state)).map(([table, { header, rows }]) => {
    const transformed = rows.map(row => row.map(value => { value = String(value); if (flatten) value = value.replace(/\r\n|\r|\n/g, ' '); return spreadsheet && value ? `'${value}` : value; }));
    return { name: `${prefix}-${table}.csv`, bytes: encoder.encode(csv([['arkita-csv', String(CSV_VERSION), table, mode], header, ...transformed], delimiter, bom)) };
  });
  return { files, mode, losses: [
    ...(collectArchiMappings(state).length ? ['Исходные ID, типы и домены Archi (archiSource) не входят в выгрузку. Для сохранения прослеживаемости используйте .arkita; таблицу соответствий сохраните отдельно.'] : []),
    ...(state.views.length ? ['CSV содержит модель, концепты, отношения, профили и свойства. Представления, рисунки, ресурсы и папки переносите нативным форматом.'] : []),
    ...(flatten ? ['Переводы строк заменены пробелами только в выгрузке. Этот режим не подходит для обратного импорта.'] : []),
    ...(spreadsheet ? ['Каждая непустая ячейка имеет текстовый префикс апострофа. Используйте импорт таблицы как текст; обратный импорт этого режима отключён. Для точного Excel-текста используйте XLSX.'] : []),
  ] };
}
export function previewCSVImport(target, files, { delimiter = ',', properties = 'replace', modelMetadata = false } = {}) {
  validateProject(target); if (!Array.isArray(files) || !files.length || files.length > 6) fail('CSV_FILES', 'Выберите от одного до шести файлов одного набора.');
  if (!['replace', 'merge'].includes(properties)) fail('CSV_OPTIONS', 'Выберите политику свойств.');
  const snapshot = structuredClone(target), parsed = [], seenTables = new Set(), seenIds = new Map(), locations = new Map(); let total = 0;
  for (const file of files) {
    total += typeof file.bytes === 'string' ? encoder.encode(file.bytes).length : file.bytes.byteLength;
    if (total > 32 * 1024 * 1024) fail('CSV_LIMIT', 'Набор CSV превышает 32 MiB.');
    const rows = parseCSV(file.bytes, { delimiter, name: file.name });
    const declaration = rows.shift(), table = declaration?.values[2];
    if (!declaration || declaration.values.length !== 4 || declaration.values[0] !== 'arkita-csv' || declaration.values[1] !== String(CSV_VERSION) || !Object.hasOwn(headers, table)) problem(file.name, 1, '', 'Ожидается контракт arkita-csv,1 и поддержанная таблица.');
    if (declaration.values[3] !== 'canonical') problem(file.name, declaration.line, 'mode', 'Для импорта нужен канонический режим без табличного префикса и уплощения.');
    if (seenTables.has(table)) problem(file.name, 1, '', `Таблица ${table} повторяется.`); seenTables.add(table);
    const header = rows.shift()?.values;
    if (!header || !header.includes('id') || new Set(header).size !== header.length || header.some(key => !headers[table].includes(key))) problem(file.name, 2, '', 'Неизвестные, повторные или отсутствующие заголовки.');
    for (const row of rows) {
      if (row.values.length !== header.length) problem(file.name, row.line, '', 'Число полей не совпадает с заголовком.');
      const record = Object.fromEntries(header.map((key, index) => [key, row.values[index]]));
      if (table !== 'properties' && record.id) { if (seenIds.has(record.id)) problem(file.name, row.line, 'id', `Повторный ID, первая запись: ${seenIds.get(record.id)}.`); seenIds.set(record.id, `${file.name}:${row.line}`); }
      parsed.push({ table, record, file: file.name, line: row.line });
    }
  }
  for (const row of parsed.filter(row => row.table === 'profiles')) {
    if (!row.record.definition) problem(row.file, row.line, 'definition', 'Нужно полное определение профиля.');
    let definition; try { definition = parseJSON(row.record.definition); } catch (error) { problem(row.file, row.line, 'definition', error.message); }
    if (definition.id !== row.record.id) problem(row.file, row.line, 'id', 'ID определения не совпадает с колонкой.');
    const list = snapshot.customizationProfiles ??= [], index = list.findIndex(item => item.id === definition.id); if (index < 0) list.push(definition); else list[index] = definition;
  }
  for (const row of parsed.filter(row => Object.hasOwn(tables, row.table))) {
    const kind = tables[row.table], id = row.record.id || newId(prefixes[kind]), list = snapshot[row.table], current = list.find(item => item.id === id), item = current ? structuredClone(current) : { id, type: row.record.type, [kind === 'relationship' ? 'label' : 'name']: '', documentation: '', properties: [] };
    locations.set(id, row);
    if (current && Object.hasOwn(row.record, 'type') && current.type !== row.record.type) problem(row.file, row.line, 'type', 'Импорт не меняет тип существующего концепта; используйте штатную команду.');
    for (const [key, value] of Object.entries(row.record)) {
      if (key === 'id' || key.endsWith('MultiplicityPresent')) continue;
      if (key === 'profileApplications') { if (value) { try { item[key] = parseJSON(value); } catch (error) { problem(row.file, row.line, key, error.message); } } else delete item[key]; }
      else if (/^(source|target)(Kind|Id)$/.test(key)) { const end = key.startsWith('source') ? 'source' : 'target'; item[end] ??= {}; item[end][key.endsWith('Kind') ? 'kind' : 'id'] = value; }
      else if (key === 'junctionRole' && !value) delete item[key]; else item[key] = value;
    }
    for (const key of ['sourceMultiplicity', 'targetMultiplicity']) if (Object.hasOwn(row.record, `${key}Present`)) {
      const present = row.record[`${key}Present`]; if (!['true', 'false'].includes(present)) problem(row.file, row.line, `${key}Present`, 'Ожидается true или false.');
      if (present === 'false') delete item[key]; else if (!Object.hasOwn(row.record, key)) problem(row.file, row.line, key, 'Отсутствует значение явно заданного поля.');
    }
    if (!CURRENT_CATALOG[`${kind}Types`].includes(item.type)) problem(row.file, row.line, 'type', 'Тип отсутствует в каталоге Arkita4.');
    if (current) list[list.indexOf(current)] = item; else list.push(item);
  }
  const modelRows = parsed.filter(row => row.table === 'model');
  if (modelRows.length > 1) problem(modelRows[1].file, modelRows[1].line, 'id', 'Ожидается одна строка модели.');
  if (modelMetadata && modelRows.length) for (const key of ['name', 'documentation']) if (Object.hasOwn(modelRows[0].record, key)) snapshot.project[key] = modelRows[0].record[key];
  const propertyGroups = new Map();
  for (const row of parsed.filter(row => row.table === 'properties')) {
    const { kind, id, position, key, value } = row.record;
    if (![kind, id, position, key, value].every(item => typeof item === 'string') || !/^(?:-1|0|[1-9]\d*)$/.test(position)) problem(row.file, row.line, 'position', 'Нужны все колонки свойства и целая позиция от 0; -1 обозначает пустой набор.');
    if (!['project', ...Object.values(tables)].includes(kind)) problem(row.file, row.line, 'kind', 'Неизвестный владелец свойств.');
    const owner = kind === 'project' ? snapshot.project : snapshot[`${kind}s`].find(item => item.id === id);
    if (!owner || kind === 'project' && id !== target.project.id && id !== modelRows[0]?.record.id) problem(row.file, row.line, 'id', 'Владелец свойства не найден.');
    if (kind === 'project' && !modelMetadata) continue;
    const group = propertyGroups.get(owner.id) ?? { owner, rows: new Map(), source: row }; propertyGroups.set(owner.id, group);
    if (group.rows.has(Number(position))) problem(row.file, row.line, 'position', 'Повторная позиция свойства.');
    if (position === '-1' && (key || value)) problem(row.file, row.line, 'position', 'Пустой набор не содержит ключ или значение.');
    group.rows.set(Number(position), { key, value });
  }
  for (const group of propertyGroups.values()) {
    const positions = [...group.rows.keys()].sort((a, b) => a - b);
    if (!(positions.length === 1 && positions[0] === -1) && positions.some((value, index) => value !== index)) problem(group.source.file, group.source.line, 'position', 'Позиции должны идти от 0 без пропусков; -1 не смешивается с данными.');
    const rows = positions[0] === -1 ? [] : positions.map(position => group.rows.get(position));
    group.owner.properties = properties === 'merge' ? mergePropertyRows(group.owner.properties, rows) : rows;
  }
  for (const item of snapshot.relationships) for (const end of ['source', 'target']) {
    const ref = item[end], valid = ref && ['element', 'junction', 'relationship'].includes(ref.kind) && snapshot[`${ref.kind}s`].some(record => record.id === ref.id);
    if (!valid) { const row = locations.get(item.id); problem(row?.file ?? 'model', row?.line ?? 0, end, `Не разрешается конец отношения ${item.id}.`); }
  }
  try { validateProject(snapshot); checkImportedRelationships(target, snapshot); }
  catch (error) { const row = parsed.find(row => error.message.includes(row.record.id)) ?? parsed.at(-1); problem(row?.file ?? 'model', row?.line ?? 0, 'model', `${error.message} Пакет не применён; проверьте также рисунки изменённых отношений.`); }
  const sourceIds = new Set(parsed.map(row => row.record.id).filter(Boolean));
  const considered = new Set([...locations.keys(), ...propertyGroups.keys(), ...parsed.filter(row => row.table === 'profiles').map(row => row.record.id)]);
  if (modelMetadata && modelRows.length) considered.add(snapshot.project.id);
  const changes = transferChanges(target, snapshot).map(change => ({ ...change, sourceId: change.id === snapshot.project.id ? modelRows[0]?.record.id ?? snapshot.project.id : sourceIds.has(change.id) ? change.id : null }));
  const changed = new Set(changes.map(change => change.id)), unchangedRecords = [...considered].filter(id => !changed.has(id));
  return { snapshot, changes, unchangedRecords, losses: [], unchanged: changes.length === 0, kept: [], ids: {} };
}
