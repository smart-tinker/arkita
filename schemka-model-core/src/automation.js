import { createStore } from './store.js';
import { validateProject } from './format.js';
import { assertJSON, canonicalJSON, record, text, fail } from './json.js';
import { modelSearchRecords } from './model-search.js';
import { metadataChange, planProperties, propertyEntries } from './bulk-metadata.js';
export const AUTOMATION_LIMITS = Object.freeze({ steps: 100, commands: 200, results: 8192, milliseconds: 5000, logs: 200, outputBytes: 8 * 1024 * 1024 });
const kinds = ['project', 'element', 'junction', 'relationship', 'view', 'folder', 'occurrence', 'connection', 'visualNode', 'visualConnector'];
const commands = ['renameProject', 'renameView', 'renameElement', 'renameRelationship', 'renameJunction', 'createView', 'createElementAndOccurrence', 'createJunctionAndOccurrence', 'createRelationshipAndConnection'];
export function validateQuery(query) {
  assertJSON(query); record(query, [], ['kind', 'ids', 'type', 'propertyKey', 'propertyValue', 'unused']);
  if (query.kind !== undefined && !kinds.includes(query.kind)) fail('AUTOMATION_QUERY', 'Неизвестная область запроса.');
  for (const key of ['type', 'propertyKey', 'propertyValue']) if (query[key] !== undefined) text(query[key]);
  if (query.ids !== undefined && (!Array.isArray(query.ids) || query.ids.length > AUTOMATION_LIMITS.results || query.ids.some(value => typeof value !== 'string' || value.length > 80))) fail('AUTOMATION_QUERY', 'Некорректный список ID.');
  if (query.propertyValue !== undefined && query.propertyKey === undefined) fail('AUTOMATION_QUERY', 'propertyValue требует propertyKey.');
  if (query.unused !== undefined && typeof query.unused !== 'boolean') fail('AUTOMATION_QUERY', 'unused должен быть переключателем.');
  return query;
}
/** Detached readonly rows; unused means a concept has no drawing in any view, matching the UI usage count. */
export function queryModel(state, query = {}) {
  validateProject(state); validateQuery(query);
  const rows = modelSearchRecords(state);
  for (const entry of state.views) for (const [kind, collection] of [['occurrence', entry.occurrences], ['connection', entry.connections]]) for (const item of collection) rows.push({ owner: { kind, id: item.id, viewId: entry.view.id }, item, name: item.name || '', type: kind, drawings: [{ viewId: entry.view.id, kind, id: item.id }] });
  const result = rows.filter(row => (!query.kind || row.owner.kind === query.kind) && (!query.ids || query.ids.includes(row.owner.id)) && (!query.type || row.type === query.type) && (query.unused === undefined || ['element', 'junction', 'relationship'].includes(row.owner.kind) && (row.drawings.length === 0) === query.unused) && (query.propertyKey === undefined || propertyEntries(row.item.properties).some(item => item.key === query.propertyKey && (query.propertyValue === undefined || item.value === query.propertyValue))))
    .map(row => ({ ...structuredClone(row.owner), name: row.name, type: row.type, drawingCount: row.drawings.length, properties: propertyEntries(row.item.properties), record: structuredClone(row.item) })).sort((a, b) => a.id.localeCompare(b.id));
  if (result.length > AUTOMATION_LIMITS.results) fail('AUTOMATION_LIMIT', 'Запрос вернул больше 8192 записей. Уточните фильтр.');
  if (new TextEncoder().encode(JSON.stringify(result)).length > AUTOMATION_LIMITS.outputBytes) fail('AUTOMATION_LIMIT', 'Результат запроса превысил 8 MiB. Уточните фильтр.');
  return result;
}
export function validateAutomation(manifest) {
  assertJSON(manifest); record(manifest, ['format', 'version', 'id', 'name', 'packageVersion', 'description', 'engineVersion', 'capabilities', 'steps']);
  if (manifest.format !== 'arkita-automation' || manifest.version !== 1 || manifest.engineVersion !== 1) fail('AUTOMATION_VERSION', 'Поддерживается декларативный пакет Arkita Automation v1 / engine 1.');
  if (typeof manifest.id !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(manifest.id) || typeof manifest.packageVersion !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-z0-9.-]{1,30})?$/.test(manifest.packageVersion)) fail('AUTOMATION_MANIFEST', 'Некорректный ID или версия пакета.');
  for (const [key, limit] of [['name', 200], ['description', 2000]]) if (typeof manifest[key] !== 'string' || !manifest[key].trim() || manifest[key].length > limit) fail('AUTOMATION_MANIFEST', 'Нужно название и описание пакета.');
  if (!Array.isArray(manifest.capabilities) || new Set(manifest.capabilities).size !== manifest.capabilities.length || !manifest.capabilities.includes('model.read') || manifest.capabilities.some(value => !['model.read', 'model.write'].includes(value))) fail('AUTOMATION_CAPABILITY', 'Доступны только model.read и model.write; сеть, файлы и выполнение кода недоступны.');
  if (!Array.isArray(manifest.steps) || !manifest.steps.length || manifest.steps.length > AUTOMATION_LIMITS.steps) fail('AUTOMATION_LIMIT', 'Пакет должен содержать от 1 до 100 шагов.');
  manifest.steps.forEach((step, index) => {
    try {
      if (step?.action === 'query') { record(step, ['action', 'query']); validateQuery(step.query); }
      else if (step?.action === 'rename') { record(step, ['action', 'query'], ['prefix', 'suffix']); validateQuery(step.query); for (const key of ['prefix', 'suffix']) if (step[key] !== undefined) text(step[key]); }
      else if (step?.action === 'setProperty') { record(step, ['action', 'query', 'key', 'value']); validateQuery(step.query); text(step.key); text(step.value); if (!step.key.trim()) fail('AUTOMATION_STEP', 'Имя свойства не может быть пустым.'); }
      else if (step?.action === 'command') { record(step, ['action', 'command']); if (!commands.includes(step.command?.type)) fail('AUTOMATION_STEP', 'Команда не входит в закрытый набор автоматизации.'); }
      else fail('AUTOMATION_STEP', 'Неизвестное действие автоматизации.');
      if (step.action !== 'query' && !manifest.capabilities.includes('model.write')) fail('AUTOMATION_CAPABILITY', 'Пакет не запросил model.write.');
    } catch (error) { error.step = index + 1; throw error; }
  }); return structuredClone(manifest);
}
export async function prepareAutomation(state, input, { signal, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)), now = () => Date.now() } = {}) {
  let stage = createStore(state);
  const manifest = validateAutomation(input), initial = stage.exportFiles(), started = now(), logs = [], queries = [], changes = [];
  let count = 0, outputBytes = 0;
  const reserve = value => { outputBytes += new TextEncoder().encode(JSON.stringify(value)).length; if (outputBytes > AUTOMATION_LIMITS.outputBytes) fail('AUTOMATION_LIMIT', 'Предпросмотр превысил 8 MiB. Уточните запрос или разделите пакет.'); };
  const check = () => { if (signal?.aborted) fail('AUTOMATION_CANCELLED', 'Автоматизация отменена; модель не изменена.'); if (now() - started > AUTOMATION_LIMITS.milliseconds) fail('AUTOMATION_TIMEOUT', 'Автоматизация превысила 5 секунд; модель не изменена.'); };
  function execute(command, step) {
    check(); if (++count > AUTOMATION_LIMITS.commands) fail('AUTOMATION_LIMIT', 'Не больше 200 команд за запуск.');
    const targetKind = { renameProject: 'project', renameView: 'view', renameElement: 'element', renameRelationship: 'relationship', renameJunction: 'junction' }[command.type];
    const ids = [command.viewId, command.elementId, command.relationshipId, command.junctionId].filter(Boolean);
    const before = targetKind ? queryModel(stage.snapshot, { kind: targetKind, ...(ids.length ? { ids } : {}) }) : [];
    const result = stage.execute(command, stage.revision);
    const change = { step, command: command.type, arguments: structuredClone(command), before, after: targetKind ? queryModel(stage.snapshot, { kind: targetKind, ...(ids.length ? { ids } : {}) }) : [], created: result.created, owners: command.changes?.map(change => ({ ...change.owner, before: change.before, after: change.after })) || [] };
    reserve(change); changes.push(change);
    // Staging needs only the current snapshot; Undo belongs to the final document commit.
    stage = createStore(stage.snapshot); check();
  }
  for (let index = 0; index < manifest.steps.length; index++) {
    await yieldControl(); check(); const step = manifest.steps[index];
    try {
      if (step.action === 'query') { const rows = queryModel(stage.snapshot, step.query); reserve(rows); queries.push({ step: index + 1, rows }); logs.push(`Шаг ${index + 1}: найдено ${rows.length}.`); }
      else if (step.action === 'command') { execute(step.command, index + 1); logs.push(`Шаг ${index + 1}: ${step.command.type}.`); }
      else {
        const snapshot = stage.snapshot, selected = queryModel(snapshot, step.query), keys = new Set(selected.map(row => `${row.kind}:${row.viewId || ''}:${row.id}`));
        const rows = modelSearchRecords(snapshot).filter(row => keys.has(`${row.owner.kind}:${row.owner.viewId || ''}:${row.owner.id}`));
        if (rows.length !== selected.length) fail('AUTOMATION_STEP', 'Имя и свойства меняются у концептов и метаданных, а не у occurrence/connection.');
        const pending = step.action === 'setProperty' ? planProperties(rows, { type: 'set', key: step.key, value: step.value }).changes : rows.map(row => metadataChange(row.owner, row.item, { [Object.hasOwn(row.item, 'label') ? 'label' : 'name']: `${step.prefix || ''}${row.name}${step.suffix || ''}` })).filter(Boolean);
        if (pending.length) execute({ type: 'bulkUpdateMetadata', changes: pending }, index + 1);
        logs.push(`Шаг ${index + 1}: изменений ${pending.length}.`);
      }
    } catch (error) { error.step = index + 1; const formatted = JSON.stringify(manifest, null, 2), marker = [...formatted.matchAll(/"action"\s*:/g)][index]; if (marker) error.line = formatted.slice(0, marker.index).split('\n').length; throw error; }
  }
  check(); const files = stage.exportFiles(), changed = canonicalJSON(initial) !== canonicalJSON(files);
  return { format: 'arkita-automation-preview', version: 1, packageId: manifest.id, files, changed, changes: changed ? changes : [], queries, logs: logs.slice(0, AUTOMATION_LIMITS.logs), elapsedMs: now() - started };
}
