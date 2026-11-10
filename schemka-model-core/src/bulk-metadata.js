import { LIMITS, assertJSON, canonicalJSON, fail, record, safeKey, text } from './json.js';
import { metadataRecord } from './metadata.js';

export const ownerKey = owner => `${owner.kind}:${owner.viewId || ""}:${owner.id}`;
export const propertyEntries = properties => Array.isArray(properties)
  ? properties.map(({ key, value }) => ({ key, value }))
  : Object.entries(properties || {}).map(([key, value]) => ({ key, value }));

export function encodeProperties(entries, original) {
  if (entries.length > LIMITS.properties) fail('LIMIT', 'Не больше 64 записей свойств на объект.');
  for (const entry of entries) { record(entry, ['key', 'value']); text(entry.key); text(entry.value); }
  if (Array.isArray(original)) return entries.map(entry => ({ ...entry }));
  if (new Set(entries.map(entry => entry.key)).size !== entries.length) fail('SCHEMA', 'Повторяющиеся ключи требуют формата модели v4.');
  for (const { key } of entries) safeKey(key);
  return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
}

/** All preconditions are checked before touching the store's detached draft. */
export function applyBulkMetadata(state, changes) {
  assertJSON(changes);
  if (!Array.isArray(changes) || !changes.length || changes.length > LIMITS.entities) fail('COMMAND', 'Нужен непустой ограниченный список изменений.');
  const seen = new Set(), patches = [];
  for (const change of changes) {
    record(change, ['owner', 'before', 'after']);
    const key = ownerKey(change.owner);
    if (seen.has(key)) fail('COMMAND', 'Один владелец должен изменяться один раз.');
    seen.add(key);
    const item = metadataRecord(state, change.owner), fields = Object.keys(change.before);
    if (!fields.length || fields.some(field => !['name', 'label', 'documentation', 'properties'].includes(field))) fail('COMMAND', 'Неподдерживаемое поле метаданных.');
    record(change.after, fields);
    for (const field of fields) {
      if (!Object.hasOwn(item, field)) fail('COMMAND', 'Поле не принадлежит выбранному объекту.');
      if (canonicalJSON(item[field]) !== canonicalJSON(change.before[field])) fail('STALE_REVISION', 'Метаданные изменились после предпросмотра.');
      if (field === 'properties') encodeProperties(propertyEntries(change.after[field]), change.after[field]);
      else text(change.after[field]);
    }
    if (canonicalJSON(change.before) === canonicalJSON(change.after)) fail('COMMAND', 'Пустое изменение не должно попадать в историю.');
    patches.push({ item, after: change.after });
  }
  for (const { item, after } of patches) Object.assign(item, structuredClone(after));
  return state.views.map(entry => entry.view.id);
}

export function metadataChange(owner, item, after) {
  const before = {};
  for (const field of Object.keys(after)) before[field] = structuredClone(item[field]);
  return canonicalJSON(before) === canonicalJSON(after) ? null : { owner: { ...owner }, before, after: structuredClone(after) };
}

export function propertySuggestions(records) {
  const keys = new Map();
  for (const { item } of records) for (const { key, value } of propertyEntries(item.properties)) {
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key).add(value);
  }
  return [...keys].sort(([a], [b]) => a.localeCompare(b, 'ru', { numeric: true })).map(([key, values]) => ({ key, values: [...values].sort() }));
}

/** Mixed values are presentation data, never a synthetic property value. */
export function commonProperties(records) {
  const keys = new Map();
  records.forEach(({ item }, index) => {
    const grouped = new Map();
    for (const { key, value } of propertyEntries(item.properties)) {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(value);
    }
    for (const [key, values] of grouped) {
      if (!keys.has(key)) keys.set(key, { key, count: 0, owners: 0, mixed: index !== 0, values: index === 0 ? values : [] });
      const result = keys.get(key);
      result.count += values.length; result.owners++;
      if (!result.mixed && (values.length !== result.values.length || values.some((value, row) => value !== result.values[row]))) result.mixed = true;
    }
  });
  return [...keys.values()].sort((a, b) => a.key.localeCompare(b.key, 'ru', { numeric: true })).map(result => ({
    ...result, common: result.owners === records.length, mixed: result.mixed || result.owners < records.length,
  }));
}

/** Plans only: duplicates, ordering and every collision remain reviewable. */
export function planProperties(records, operation) {
  assertJSON(operation);
  const changes = [], collisions = [];
  for (const { owner, item } of records) {
    const old = propertyEntries(item.properties); let rows = old.map(row => ({ ...row }));
    const key = operation.key;
    if (['rename', 'remove', 'set'].includes(operation.type)) { text(key); }
    switch (operation.type) {
      case 'rename': {
        text(operation.newKey);
        if (!operation.newKey.trim()) fail('COMMAND', 'Новое имя свойства не может быть пустым.');
        if (key === operation.newKey || !rows.some(row => row.key === key)) break;
        const duplicate = rows.some(row => row.key === operation.newKey);
        if (duplicate && !['merge', 'keep-target', 'replace-target'].includes(operation.collision)) {
          collisions.push({ owner, key, target: operation.newKey }); continue;
        }
        if (duplicate && operation.collision === 'keep-target') rows = rows.filter(row => row.key !== key);
        else {
          if (duplicate && operation.collision === 'replace-target') rows = rows.filter(row => row.key !== operation.newKey);
          rows = rows.map(row => row.key === key ? { key: operation.newKey, value: row.value } : row);
        }
        break;
      }
      case 'remove': rows = rows.filter(row => row.key !== key); break;
      case 'set':
        text(operation.value);
        if (!key.trim() && !rows.some(row => row.key === key)) fail('COMMAND', 'Имя нового свойства не может быть пустым.');
        rows = rows.some(row => row.key === key) ? rows.map(row => row.key === key ? { key, value: operation.value } : row) : [...rows, { key, value: operation.value }];
        break;
      case 'add': {
        if (!Array.isArray(operation.entries) || !['all', 'missing'].includes(operation.mode)) fail('COMMAND', 'Выберите записи и правило добавления.');
        const existing = new Set(rows.map(row => row.key));
        for (const row of operation.entries) {
          if (!row.key.trim()) fail('COMMAND', 'Имя нового свойства не может быть пустым.');
          if (operation.mode === 'all' || !existing.has(row.key)) rows.push({ ...row });
        }
        break;
      }
      case 'sort':
        if (records.length !== 1) fail('COMMAND', 'Сортировка сохранённого порядка доступна только для одного объекта.');
        rows.sort((a, b) => a.key.localeCompare(b.key, 'ru', { numeric: true })); break;
      case 'reorder': {
        if (records.length !== 1 || !Array.isArray(operation.order) || operation.order.length !== rows.length || new Set(operation.order).size !== rows.length || operation.order.some(index => !Number.isInteger(index) || index < 0 || index >= rows.length)) fail('COMMAND', 'Нужна перестановка всех строк одного объекта.');
        rows = operation.order.map(index => rows[index]); break;
      }
      default: fail('COMMAND', 'Неизвестное массовое действие.');
    }
    const change = metadataChange(owner, item, { properties: encodeProperties(rows, item.properties) });
    if (change) changes.push(change);
  }
  return { changes: collisions.length ? [] : changes, collisions };
}
