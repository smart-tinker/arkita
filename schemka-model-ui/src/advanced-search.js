import { modelSearchRecords, searchVocabulary, SEARCH_KINDS } from '../../schemka-model-core/src/model-search.js';
import { ownerKey, propertyEntries, propertySuggestions, commonProperties, planProperties } from '../../schemka-model-core/src/bulk-metadata.js';
import { createSearchTask } from './model-search-task.js';

const labels = { project: 'Модель', element: 'Элементы', junction: 'Узлы связей', relationship: 'Отношения', view: 'Представления', folder: 'Папки', visualNode: 'Заметки и визуальные объекты', visualConnector: 'Визуальные соединения' };

/** A single disposable editor: searches never enter the model's command history. */
export function installAdvancedSearch({ document, model, openDialog, render = () => {}, blocked = () => false, status = () => {}, openOwner = () => {}, revealDrawing = () => {}, task = createSearchTask(document.defaultView) }) {
  const node = (tag, text, id) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (id) el.id = id; return el; };
  const button = (id, text, action) => { const el = node('button', text, id); el.type = 'button'; el.addEventListener('click', action); return el; };
  const dialog = node('dialog', undefined, 'advanced-search-dialog'); dialog.className = 'advanced-search-dialog'; dialog.setAttribute('aria-labelledby', 'advanced-search-title');
  const heading = node('h2', 'Поиск, замена и свойства', 'advanced-search-title');
  const form = node('form'), filters = node('details'), fields = node('fieldset'), results = node('div', undefined, 'advanced-search-results');
  filters.append(node('summary', 'Поля и фильтры')); fields.append(node('legend', 'Поля поиска'));
  const controls = {};
  function input(parent, id, title, type = 'text') {
    const label = node('label', title), control = node('input', undefined, `advanced-${id}`); control.type = type; control.maxLength = 8192;
    if (type === 'checkbox') label.prepend(control); else label.append(control);
    parent.append(label); controls[id] = control; return control;
  }
  function select(parent, id, title, values, multiple = false) {
    const label = node('label', title), control = node('select', undefined, `advanced-${id}`); control.multiple = multiple;
    for (const [value, text] of values) { const option = node('option', text); option.value = value; control.append(option); }
    label.append(control); parent.append(label); controls[id] = control; return control;
  }
  const query = input(form, 'query', 'Найти'); query.maxLength = 256;
  const scope = select(form, 'scope', 'Область', [['model', 'Вся текущая модель'], ['view', 'Текущее представление']]);
  const visibility = select(form, 'visibility', 'Объекты представления', [['visible', 'Только видимые по viewpoint'], ['all', 'Включая скрытые по viewpoint']]);
  for (const [id, title] of [['name', 'Имя / подпись'], ['documentation', 'Документация'], ['properties', 'Значения свойств']]) input(fields, id, title, 'checkbox').checked = true;
  filters.append(fields);
  for (const [id, title] of [['case', 'Учитывать регистр'], ['whole', 'Целое слово'], ['regex', 'Регулярное выражение JavaScript'], ['folders', 'Показывать все папки']]) input(filters, id, title, 'checkbox');
  filters.append(node('p', 'Фильтры соединяются через И; варианты внутри одного списка — через ИЛИ. Пустой список не ограничивает. Regex: JavaScript Unicode, до 256 символов и 1,5 секунды. Замена вставляет буквальный текст; имя общее для всех представлений.'));
  select(filters, 'kinds', 'Категории', SEARCH_KINDS.map(kind => [kind, labels[kind] || kind]), true);
  for (const [id, title] of [['types', 'Типы'], ['views', 'Представления'], ['profiles', 'Профили и специализации'], ['keys', 'Ключи свойств (пустое значение тоже участвует)']]) select(filters, id, title, [], true);
  form.append(filters);
  const actions = node('div', undefined); actions.className = 'dialog-actions';
  const run = node('button', 'Найти / обновить', 'advanced-search-run'); run.type = 'submit';
  const cancelTask = button('advanced-search-stop', 'Остановить поиск', () => { invalidate(); report('Поиск отменён. Модель не изменена.'); });
  const clear = button('advanced-search-reset', 'Сбросить фильтры', () => {
    invalidate(); query.value = ''; scope.value = 'model'; visibility.value = 'visible';
    for (const id of ['kinds', 'types', 'views', 'profiles', 'keys']) for (const option of controls[id].options) option.selected = false;
    for (const id of ['case', 'whole', 'regex', 'folders']) controls[id].checked = false;
    for (const id of ['name', 'documentation', 'properties']) controls[id].checked = true;
    search();
  });
  actions.append(run, cancelTask, clear); form.append(actions);
  const message = node('p', '', 'advanced-search-message'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const error = node('p', '', 'advanced-search-error'); error.setAttribute('role', 'alert');
  const navigation = node('div'); navigation.className = 'dialog-actions';
  navigation.append(button('advanced-search-prev', 'Предыдущее', () => step(-1)), button('advanced-search-next', 'Следующее', () => step(1)),
    button('advanced-search-select-all', 'Выбрать найденное', () => { chosen = new Set(found.map(row => ownerKey(row.owner))); drawResults(); }),
    button('advanced-search-select-none', 'Снять выбор', () => { chosen.clear(); drawResults(); }));
  const replacement = node('details'); replacement.append(node('summary', 'Заменить имена'));
  input(replacement, 'replacement', 'Новый текст');
  replacement.append(node('p', 'Каждый общий объект переименовывается один раз, включая повторные изображения. При замене изменятся имена в других представлениях. Включение отношений и папок задаётся фильтром категорий.'));
  replacement.append(button('advanced-replace-all', 'Предпросмотр замены всех найденных имён', () => replace(false)), button('advanced-replace-selected', 'Предпросмотр замены выбранных имён', () => replace(true)));

  const properties = node('details', undefined, 'advanced-search-properties'); properties.append(node('summary', 'Менеджер пользовательских свойств'));
  const propertyScope = select(properties, 'property-scope', 'Изменяемые объекты', [['results', 'Все результаты поиска'], ['checked', 'Выбранные результаты'], ['selection', 'Выделение на полотне'], ['catalog', 'Зафиксированное выделение дерева']]);
  const common = node('div', undefined, 'advanced-property-common'); properties.append(common);
  const key = input(properties, 'property-key', 'Имя свойства'), value = input(properties, 'property-value', 'Значение');
  const keyList = node('datalist', undefined, 'advanced-property-keys'), valueList = node('datalist', undefined, 'advanced-property-values');
  key.setAttribute('list', keyList.id); value.setAttribute('list', valueList.id); properties.append(keyList, valueList);
  const addMode = select(properties, 'property-mode', 'Добавление', [['missing', 'Только отсутствующие имена'], ['all', 'Все записи, сохраняя повторы']]);
  const draftList = node('ol', undefined, 'advanced-property-draft'); let draftEntries = [];
  properties.append(button('advanced-property-queue', 'Добавить запись в набор', () => {
    if (!key.value.trim()) { error.textContent = 'Укажите имя нового свойства.'; return; }
    draftEntries.push({ key: key.value, value: value.value }); renderDraft(); invalidate();
  }), draftList, button('advanced-property-add', 'Предпросмотр добавления набора', () => propertyPlan({ type: 'add', entries: draftEntries, mode: addMode.value })),
  button('advanced-property-set', 'Изменить все записи ключа…', () => propertyPlan({ type: 'set', key: key.value, value: value.value })),
  button('advanced-property-remove', 'Удалить все записи ключа…', () => propertyPlan({ type: 'remove', key: key.value })));
  input(properties, 'property-new-key', 'Новое имя ключа');
  select(properties, 'property-collision', 'Если новое имя уже существует', [['', 'Остановиться и показать коллизии'], ['merge', 'Объединить: сохранить все значения и повторы'], ['keep-target', 'Оставить новое имя, удалить значения старого'], ['replace-target', 'Оставить значения старого, удалить значения нового']]);
  properties.append(button('advanced-property-rename', 'Предпросмотр переименования ключа', () => propertyPlan({ type: 'rename', key: key.value, newKey: controls['property-new-key'].value, collision: controls['property-collision'].value })));
  const order = select(properties, 'property-order', 'Сохранённый порядок записей одного объекта', [], true);
  const up = button('advanced-property-up', 'Поднять выбранные записи', () => moveRows(-1)), down = button('advanced-property-down', 'Опустить выбранные записи', () => moveRows(1)), sort = button('advanced-property-sort', 'Предпросмотр сортировки по имени', () => propertyPlan({ type: 'sort' }));
  properties.append(up, down, sort, node('p', 'Сортировка и перенос меняют сохранённый порядок. Для группы объектов они отключены: порядок у каждого свой. Одинаковые ключи сохраняют взаимный порядок.'));

  const preview = node('section', undefined, 'advanced-search-preview'); preview.hidden = true;
  const apply = button('advanced-search-apply', 'Применить одной операцией', commit), discard = button('advanced-search-discard', 'Отменить предпросмотр', () => { invalidate(); report('Предпросмотр отменён.'); });
  const close = button('advanced-search-close', 'Закрыть', () => dialog.close());
  dialog.append(heading, form, message, error, navigation, results, replacement, properties, preview, apply, discard, close); document.body.append(dialog);
  const opener = button('model-search-advanced', 'Поиск и замена…', () => open()); opener.hidden = true; document.body.append(opener);
  const propertiesOpener = button('user-properties-manager', 'Управление пользовательскими свойствами…', () => open({ propertiesOnly: true })); propertiesOpener.hidden = true; document.body.append(propertiesOpener);
  let catalogOwners = null;
  let generation = 0, source = null, found = [], chosen = new Set(), active = -1, plan = null, trigger = null, orderIndices = [], selection = null;
  const selected = id => [...controls[id].selectedOptions].map(option => option.value);
  const stamp = () => ({ store: model.store, revision: model.store.revision, viewId: model.viewId });
  const selectionKey = () => JSON.stringify(model.selections?.length ? model.selections : model.selection);
  const current = captured => captured && captured.store === model.store && captured.revision === model.store.revision && captured.viewId === model.viewId && (!captured.selection || captured.selection === selectionKey()) && dialog.open;
  function report(text) { message.textContent = text; }
  function invalidate() { generation++; task.cancel(); plan = null; preview.hidden = true; preview.replaceChildren(); apply.disabled = true; discard.hidden = true; cancelTask.disabled = true; error.textContent = ''; }
  function options() {
    const opts = { query: query.value, fields: ['name', 'documentation', 'properties'].filter(id => controls[id].checked),
      caseSensitive: controls.case.checked, wholeWord: controls.whole.checked, regex: controls.regex.checked, showAllFolders: controls.folders.checked,
      kinds: selected('kinds'), types: selected('types'), views: selected('views'), profiles: selected('profiles'), propertyKeys: selected('keys') };
    if (scope.value === 'view') {
      opts.views = model.viewId && (!opts.views.length || opts.views.includes(model.viewId)) ? [model.viewId] : ['missing-view'];
      if (visibility.value === 'visible') {
        const view = model.view;
        opts.visibleOwners = [...(view?.occurrences || []).map(item => item.concept), ...(view?.connections || []).map(item => ({ kind: 'relationship', id: item.relationshipId })), ...(view?.visualNodes || []).map(item => ({ kind: 'visualNode', viewId: model.viewId, id: item.id })), ...(view?.visualConnectors || []).map(item => ({ kind: 'visualConnector', viewId: model.viewId, id: item.id })), { kind: 'view', id: model.viewId }];
      }
    }
    if (catalogOwners) { const keys = new Set(catalogOwners.map(ownerKey)); opts.visibleOwners = opts.visibleOwners ? opts.visibleOwners.filter(owner => keys.has(ownerKey(owner))) : catalogOwners; }
    return opts;
  }
  function vocabulary() {
    const vocabulary = searchVocabulary(model.store.snapshot);
    for (const [id, items] of [['types', vocabulary.types.map(type => [type, type])], ['views', vocabulary.views.map(item => [item.id, item.name])], ['profiles', vocabulary.profiles.map(item => [item.id, item.name])], ['keys', vocabulary.properties.map(key => [key, key || '⟨пустое имя⟩'])]]) {
      const old = new Set(selected(id)); controls[id].replaceChildren();
      for (const [value, title] of items) { const option = node('option', title); option.value = value; option.selected = old.has(value); controls[id].append(option); }
    }
    const suggestions = propertySuggestions(modelSearchRecords(model.store.snapshot)); keyList.replaceChildren();
    for (const item of suggestions) { const option = node('option'); option.value = item.key; keyList.append(option); }
    valueList.replaceChildren(); for (const text of suggestions.find(item => item.key === key.value)?.values || []) { const option = node('option'); option.value = text; valueList.append(option); }
  }
  async function search() {
    invalidate(); const request = generation, captured = stamp(); source = captured; cancelTask.disabled = false; report('Поиск…');
    try {
      const rows = await task.run(model.store.snapshot, options());
      if (request !== generation || !current(captured)) return;
      found = rows; chosen = new Set([...chosen].filter(key => rows.some(row => ownerKey(row.owner) === key))); active = rows.length ? 0 : -1;
      drawResults(); report(query.value ? `Найдено объектов: ${rows.length}.` : `Пустой запрос: все объекты выбранной области (${rows.length}).`);
    } catch (failure) { if (request === generation && current(captured)) { found = []; drawResults(); error.textContent = failure.message; report('Поиск не выполнен. Модель не изменена.'); } }
    finally { if (request === generation) cancelTask.disabled = true; }
  }
  function drawResults() {
    results.replaceChildren();
    for (const [index, row] of found.entries()) {
      const line = node('div'); line.className = 'advanced-search-result';
      const label = node('label'), check = node('input'); check.type = 'checkbox'; check.checked = chosen.has(ownerKey(row.owner)); check.setAttribute('aria-label', `Выбрать ${row.name || '(без имени)'} · ${row.owner.id}`);
      check.addEventListener('change', () => { check.checked ? chosen.add(ownerKey(row.owner)) : chosen.delete(ownerKey(row.owner)); invalidate(); drawCommon(); });
      label.append(check, document.createTextNode(`${row.name || '(без имени)'} · ${labels[row.owner.kind] || row.owner.kind}`));
      const go = button(`advanced-result-${index}`, 'Показать объект', () => visit(row));
      line.append(label, node('p', `${row.path} · ${row.owner.id}`), go); results.append(line);
    }
    drawCommon();
  }
  function visit(row) {
    if (!current(source)) { invalidate(); error.textContent = 'Модель изменилась. Обновите поиск.'; return; }
    dialog.close();
    const drawing = row.drawings.find(item => item.viewId === model.viewId) || row.drawings[0];
    if (scope.value === 'view' && drawing) revealDrawing(drawing); else openOwner(row.owner);
  }
  function step(delta) {
    if (!found.length || !current(source)) return;
    active = (active + delta + found.length) % found.length;
    document.getElementById(`advanced-result-${active}`)?.focus();
    const row = found[active]; report(`${active + 1} / ${found.length}: ${row.name} · ${row.owner.id}`);
    if (scope.value === 'view') { const drawing = row.drawings.find(item => item.viewId === model.viewId); if (drawing) revealDrawing(drawing); }
  }
  function targets() {
    const all = modelSearchRecords(model.store.snapshot);
    if (dialog.dataset.mode === 'properties') return all;
    if (propertyScope.value === 'catalog') { const keys = new Set((catalogOwners || []).map(ownerKey)); return all.filter(row => keys.has(ownerKey(row.owner))); }
    if (propertyScope.value === 'selection') {
      const view = model.view, owners = (model.selections?.length ? model.selections : [model.selection]).filter(Boolean).map(ref => ref.kind === 'occurrence' ? view?.occurrences.find(item => item.id === ref.id)?.concept : ref.kind === 'connection' ? { kind: 'relationship', id: view?.connections.find(item => item.id === ref.id)?.relationshipId } : ['visualNode', 'visualConnector'].includes(ref.kind) ? { ...ref, viewId: model.viewId } : ref).filter(Boolean);
      const ids = new Set(owners.map(ownerKey)); return all.filter(row => ids.has(ownerKey(row.owner)));
    }
    const ids = new Set(found.filter(row => propertyScope.value !== 'checked' || chosen.has(ownerKey(row.owner))).map(row => ownerKey(row.owner)));
    return all.filter(row => ids.has(ownerKey(row.owner)));
  }
  function drawCommon() {
    selection = selectionKey();
    const records = targets(); common.replaceChildren(node('p', `Область изменений: ${records.length} объектов. Только эта область будет изменена.`));
    const entries = commonProperties(records);
    if (!entries.length) common.append(node('p', 'Пользовательских свойств пока нет.'));
    for (const [index, item] of entries.entries()) common.append(button(`advanced-property-key-${index}`, `${item.key || '⟨пустое имя⟩'}: ${item.common ? 'есть у всех' : 'есть не у всех'}; ${item.mixed ? 'значения различаются' : item.values.map(value => JSON.stringify(value)).join(', ')} · владельцев ${item.owners}, записей ${item.count}`, () => {
      invalidate(); key.value = item.key; controls['property-new-key'].value = ''; vocabulary(); key.focus();
    }));
    up.disabled = down.disabled = sort.disabled = records.length !== 1; order.disabled = records.length !== 1; order.replaceChildren();
    const rows = records.length === 1 ? propertyEntries(records[0].item.properties) : []; orderIndices = rows.map((_, index) => index);
    for (const [index, row] of rows.entries()) { const option = node('option', `${index + 1}. ${row.key} = ${row.value}`); option.value = String(index); order.append(option); }
  }
  function renderDraft() {
    draftList.replaceChildren(); for (const [index, row] of draftEntries.entries()) { const li = node('li', `${row.key} = ${row.value} `); li.append(button('', 'Убрать из набора', () => { draftEntries.splice(index, 1); renderDraft(); invalidate(); })); draftList.append(li); }
  }
  function showPlan(result, captured) {
    plan = { ...result, captured }; preview.replaceChildren(); preview.hidden = false; discard.hidden = false;
    if (result.collisions.length) { preview.append(node('h3', `Коллизии ключей: ${result.collisions.length}`)); for (const item of result.collisions) preview.append(node('p', `${item.owner.kind} ${item.owner.id}: ${item.key} → ${item.target}`)); apply.disabled = true; return; }
    preview.append(node('h3', `Будут изменены объекты: ${result.changes.length}`));
    for (const change of result.changes) { const details = node('details'); details.open = true; details.append(node('summary', `${change.owner.kind} · ${change.owner.id}`), node('pre', `До:\n${JSON.stringify(change.before, null, 2)}\nПосле:\n${JSON.stringify(change.after, null, 2)}`)); preview.append(details); }
    apply.disabled = !result.changes.length;
    if (!result.changes.length) report('Изменений нет. История и файл не изменены.');
  }
  async function replace(onlySelected) {
    if (!current(source)) { error.textContent = 'Сначала обновите поиск.'; return; }
    if (onlySelected && !chosen.size) { error.textContent = 'Выберите объекты в результатах.'; return; }
    invalidate(); const request = generation, captured = stamp(); cancelTask.disabled = false;
    try {
      const result = await task.run(model.store.snapshot, options(), controls.replacement.value, found.filter(row => !onlySelected || chosen.has(ownerKey(row.owner))).map(row => row.owner));
      if (request === generation && current(captured)) showPlan(result, captured);
    } catch (failure) { if (request === generation && current(captured)) error.textContent = failure.message; }
    finally { if (request === generation) cancelTask.disabled = true; }
  }
  function propertyPlan(operation) {
    if (!current(source)) { error.textContent = 'Сначала обновите поиск.'; return; }
    invalidate(); const captured = { ...stamp(), ...(propertyScope.value === 'selection' ? { selection: selectionKey() } : {}) };
    try { const records = targets(); if (!records.length) throw Error('В выбранной области нет объектов.'); showPlan(planProperties(records, operation), captured); }
    catch (failure) { error.textContent = failure.message; }
  }
  function moveRows(direction) {
    const selectedRows = new Set([...order.selectedOptions].map(option => Number(option.value)));
    const indices = direction < 0 ? [...orderIndices.keys()] : [...orderIndices.keys()].reverse();
    for (const index of indices) {
      const next = index + direction;
      if (next >= 0 && next < orderIndices.length && selectedRows.has(orderIndices[index]) && !selectedRows.has(orderIndices[next])) [orderIndices[index], orderIndices[next]] = [orderIndices[next], orderIndices[index]];
    }
    const options = new Map([...order.options].map(option => [Number(option.value), option])); order.replaceChildren(...orderIndices.map(index => options.get(index)));
    propertyPlan({ type: 'reorder', order: [...orderIndices] });
  }
  function commit() {
    const pending = plan;
    if (!pending?.changes.length || pending.collisions.length) return;
    if (!current(pending.captured)) { invalidate(); error.textContent = 'Модель изменилась после предпросмотра. Подготовьте изменения заново.'; return; }
    invalidate();
    try {
      model.execute({ type: 'bulkUpdateMetadata', changes: pending.changes }, pending.captured.revision); render(); report('Изменения применены. Одно Undo вернёт их полностью.'); vocabulary();
      if (dialog.dataset.mode === 'properties') { close.textContent = 'Закрыть'; source = stamp(); drawCommon(); }
      else search();
    }
    catch (failure) { error.textContent = `Изменения не применены: ${failure.message}`; }
  }
  function open({ owners, propertiesOnly = false } = {}) {
    if (blocked()) return false;
    dialog.dataset.mode = propertiesOnly ? 'properties' : 'search';
    heading.textContent = propertiesOnly ? 'Управление пользовательскими свойствами' : 'Поиск, замена и свойства';
    form.hidden = navigation.hidden = results.hidden = replacement.hidden = propertiesOnly;
    properties.open = propertiesOnly;
    propertyScope.closest('label').hidden = propertiesOnly;
    controls['property-collision'].closest('label').hidden = propertiesOnly;
    close.textContent = propertiesOnly ? 'Отмена' : 'Закрыть';
    if (owners !== undefined) {
      if (!Array.isArray(owners) || !owners.length || owners.length > 8192) throw Error('Выберите от 1 до 8192 владельцев метаданных.');
      const known = new Map(modelSearchRecords(model.store.snapshot).map(row => [ownerKey(row.owner), row.owner]));
      catalogOwners = [...new Map(owners.map(owner => { const found = known.get(ownerKey(owner)); if (!found) throw Error('Выделение дерева устарело.'); return [ownerKey(found), { ...found }]; })).values()];
    } else if (!propertiesOnly) catalogOwners = null;
    if (propertiesOnly) {
      key.value = ''; value.value = ''; controls['property-new-key'].value = ''; controls['property-collision'].value = '';
    }
    const catalogOption = [...propertyScope.options].find(option => option.value === 'catalog'); catalogOption.disabled = !catalogOwners;
    catalogOption.textContent = catalogOwners ? `Зафиксированное выделение дерева (${catalogOwners.length})` : 'Зафиксированное выделение дерева';
    propertyScope.value = catalogOwners ? 'catalog' : 'results';
    trigger = document.activeElement;
    if (source?.store !== model.store) { query.value = ''; chosen.clear(); found = []; draftEntries = []; renderDraft(); }
    vocabulary(); openDialog ? openDialog(dialog.id) : dialog.showModal(); (propertiesOnly ? key : query).focus();
    if (propertiesOnly) { invalidate(); source = stamp(); drawCommon(); report('Показаны пользовательские свойства всей модели.'); }
    else if (catalogOwners) { invalidate(); source = stamp(); const keys = new Set(catalogOwners.map(ownerKey)); found = modelSearchRecords(model.store.snapshot).filter(row => keys.has(ownerKey(row.owner))); chosen = keys; drawResults(); report(`Зафиксировано владельцев метаданных из дерева: ${catalogOwners.length}. Поиск ограничен этим набором до закрытия диалога.`); }
    else search(); return true;
  }
  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  for (const kind of ['input', 'change']) dialog.addEventListener(kind, event => {
    if (event.target.closest('#advanced-search-results, #advanced-property-order')) return;
    invalidate(); if (form.contains(event.target)) { source = null; report('Параметры изменены. Нажмите «Найти / обновить».'); } if (event.target === key) vocabulary(); if (event.target === propertyScope) drawCommon();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener('close', () => { invalidate(); if (!document.querySelector('dialog[open]') && trigger?.isConnected) trigger.focus(); });
  invalidate();
  return { open, cancel() { if (dialog.open) dialog.close(); else invalidate(); }, get active() { return dialog.open; }, get generation() { return generation; },
    refresh() { if (dialog.open && source && current(source) && propertyScope.value === 'selection' && selection !== selectionKey()) { invalidate(); drawCommon(); } if (dialog.open && source && !current(source)) { invalidate(); vocabulary(); found = []; drawResults(); source = null; report('Модель изменилась. Нажмите «Найти / обновить».'); } } };
}
