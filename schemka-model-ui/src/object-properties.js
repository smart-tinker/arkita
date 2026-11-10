import {prepareDrawingBounds} from './resize-preferences.js';
import { LIMITS, metadataRecord, exportFiles } from '../../schemka-model-core/src/index.js';
import { canonicalJSON } from '../../schemka-model-core/src/json.js';
import { coordinate } from '../../schemka-model-core/src/format.js';
import { sameConcept } from './concepts.js';

export function installObjectProperties({ document, model, openDialog, render, status, blocked = () => false, readResizeBehavior = () => 'retain', openLink = null }) {
  let pending = null, generation = 0, rowNumber = 0;
  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  const button = (id, text, action) => {
    const item = node('button', text); item.id = id; item.type = 'button'; item.addEventListener('click', action); return item;
  };
  const report = text => { try { status(text); } catch { /* Feedback cannot repeat a commit. */ } };
  const selectionKey = () => JSON.stringify(model.selection);
  function makeDialog(prefix, title) {
    const dialog = node('dialog'), form = node('form'), heading = node('h2', title), reference = node('p', '', 'inspector-note');
    dialog.id = `${prefix}-dialog`; form.id = `${prefix}-form`; form.noValidate = true;
    heading.id = `${prefix}-title`; reference.id = `${prefix}-reference`;
    dialog.setAttribute('aria-labelledby', heading.id); dialog.setAttribute('aria-describedby', reference.id);
    const fields = node('div', undefined, 'property-fields'), error = node('p', '', 'error'), actions = node('div', undefined, 'dialog-actions');
    fields.id = `${prefix}-fields`; error.id = `${prefix}-error`; error.setAttribute('role', 'alert');
    const apply = node('button', 'Применить'); apply.id = `${prefix}-apply`; apply.type = 'submit'; apply.disabled = true;
    actions.append(button(`${prefix}-cancel`, 'Отмена', () => cancel()), apply);
    form.append(heading, reference, fields, error, actions); dialog.append(form); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    dialog.addEventListener('close', () => { if (!dialog.open && pending?.ui.dialog === dialog) clearPending(); });
    fields.addEventListener('input', () => { if (pending?.ui.dialog === dialog) { generation++; error.textContent = ''; } });
    form.addEventListener('submit', event => { event.preventDefault(); submit(dialog); });
    return { dialog, form, reference, fields, error, apply };
  }
  const propertiesUI = makeDialog('object-properties', 'Свойства объекта');
  const sizeUI = makeDialog('occurrence-size', 'Размер в этом представлении');
  const rows = [];
  const add = button('object-property-add', 'Добавить свойство', () => {
    if (pending?.ui !== propertiesUI || rows.length >= LIMITS.properties) return;
    addRow('', '').name.input.focus(); generation++; propertiesUI.error.textContent = '';
  });
  propertiesUI.form.insertBefore(add, propertiesUI.error);
  const sizes = Object.fromEntries([['width', 'Ширина'], ['height', 'Высота']].map(([field, text]) => {
    const label = node('label', text), input = node('input');
    input.id = `occurrence-size-${field}`; input.name = field; input.type = 'number';
    input.min = '0.1'; input.max = String(LIMITS.coordinate); input.step = '0.1'; input.required = true;
    label.append(input); sizeUI.fields.append(label); return [field, input];
  }));
  function clearPending() {
    const existed = pending !== null; pending = null;
    propertiesUI.apply.disabled = true; sizeUI.apply.disabled = true; add.disabled = true;
    if (existed) generation++;
    return existed;
  }
  function cancel() {
    const existed = clearPending(), open = propertiesUI.dialog.open || sizeUI.dialog.open;
    if (!existed && open) generation++;
    for (const ui of [propertiesUI, sizeUI]) try { if (ui.dialog.open) ui.dialog.close(); }
    catch (error) { report(`Правка отменена, но диалог не закрыт: ${error.message}`); }
    return existed || open;
  }
  function open(ui, details) {
    if (pending || propertiesUI.dialog.open || sizeUI.dialog.open || blocked()) return false;
    const request = { ...details, ui, store: model.store, revision: model.store.revision, viewId: model.viewId, selection: selectionKey() };
    ui.error.textContent = '';
    try {
      // Modal opening cancels earlier drafts; install this request afterward.
      openDialog(ui.dialog.id);
      if (!ui.dialog.open) throw new Error('Диалог не открыт');
      pending = request; generation++; ui.apply.disabled = false; add.disabled = rows.length >= LIMITS.properties;
      return true;
    } catch (error) { clearPending(); report(`Не удалось открыть свойства: ${error.message}`); return false; }
  }
  function addRow(name, value, existing = false) {
    const container = node('div', undefined, 'property-row'), index = ++rowNumber;
    const field = (kind, title, raw, lines) => {
      const label = node('label', title), input = node('textarea');
      input.id = `object-property-${kind}-${index}`; input.name = kind; input.rows = lines; input.maxLength = LIMITS.string; input.value = raw;
      label.append(input); container.append(label);
      return { input, raw, initial: input.value };
    };
    const row = { container, existing, name: field('name', 'Имя', name, 1), value: field('value', 'Значение', value, 2) };
    const remove = button(`object-property-remove-${index}`, 'Удалить', () => {
      if (pending?.ui !== propertiesUI) return;
      const at = rows.indexOf(row); if (at < 0) return;
      rows.splice(at, 1); container.remove(); generation++; add.disabled = false; propertiesUI.error.textContent = '';
      (rows[at]?.name.input ?? rows[at - 1]?.name.input ?? add).focus();
    });
    const reorder = delta => {
      if (pending?.ui !== propertiesUI) return;
      const from = rows.indexOf(row), to = from + delta;
      if (to < 0 || to >= rows.length) return;
      rows.splice(from, 1); rows.splice(to, 0, row);
      propertiesUI.fields.replaceChildren(...rows.map(item => item.container));
      generation++; row.name.input.focus();
    };
    const up = button(`object-property-up-${index}`, 'Выше', () => reorder(-1));
    const down = button(`object-property-down-${index}`, 'Ниже', () => reorder(1));
    up.setAttribute('aria-label', 'Переместить свойство выше'); down.setAttribute('aria-label', 'Переместить свойство ниже');
    remove.className = 'property-remove'; container.append(up, down, remove); rows.push(row); propertiesUI.fields.append(container);
    add.disabled = rows.length >= LIMITS.properties; return row;
  }
  function openProperties(concept) {
    if (pending || blocked()) return;
    let item;
    try { item = metadataRecord(model.store.snapshot, concept); }
    catch { report('Объект для изменения свойств не найден'); return; }
    rows.length = 0; propertiesUI.fields.replaceChildren();
    for (const { key, value } of item.properties) addRow(key, value, true);
    propertiesUI.reference.textContent = `«${item.name || item.label || '(без названия)'}» · ${concept.kind === 'project' ? 'Свойства всей модели.' : concept.kind === 'view' ? 'Свойства этого представления.' : 'Свойства общие для всех представлений объекта.'}`;
    if (open(propertiesUI, { concept: { ...concept }, initial: item.properties })) (rows[0]?.name.input ?? add).focus();
  }
  function openSize(concept, occurrenceId) {
    if (pending || blocked()) return;
    const occurrence = model.view?.occurrences.find(item => item.id === occurrenceId && sameConcept(item.concept, concept));
    if (!occurrence) { report('Объект в текущем представлении не найден'); return; }
    for (const field of ['width', 'height']) sizes[field].value = occurrence.bounds[field];
    sizeUI.reference.textContent = 'Изменяется только выбранный рисунок. Размеры в других представлениях сохраняются.';
    if (open(sizeUI, { occurrenceId, initial: { width: occurrence.bounds.width, height: occurrence.bounds.height } })) sizes.width.focus();
  }
  // Textareas normalize CR/CRLF; untouched or reverted fields retain their raw text.
  const rawValue = field => field.input.value === field.initial ? field.raw : field.input.value;
  function readProperties() {
    const entries = [];
    if (rows.length > LIMITS.properties) throw new Error(`Допустимо не более ${LIMITS.properties} свойств.`);
    for (const row of rows) {
      const key = rawValue(row.name), value = rawValue(row.value);
      if (!key.trim() && !(row.existing && key === row.name.raw)) { row.name.input.focus(); throw new Error('Укажите имя нового или переименованного свойства.'); }
      if (key.length > LIMITS.string || value.length > LIMITS.string) throw new Error(`Имя и значение не должны превышать ${LIMITS.string} символов UTF-16.`);
      entries.push({ key, value });
    }
    return entries;
  }
  function submit(dialog) {
    const request = pending;
    if (!request || request.ui.dialog !== dialog) return;
    generation++;
    if (!dialog.open) { clearPending(); return; }
    if (model.store !== request.store || model.store.revision !== request.revision || model.viewId !== request.viewId || selectionKey() !== request.selection) {
      clearPending(); request.ui.error.textContent = 'Модель, представление или выделение изменились. Закройте диалог и начните правку заново.'; return;
    }
    let command, changed;
    try {
      if (request.ui === propertiesUI) {
        const properties = readProperties();
        command = { type: 'updateMetadata', owner: request.concept, properties };
        changed = canonicalJSON(properties) !== canonicalJSON(request.initial);
      } else {
        const width = sizes.width.valueAsNumber, height = sizes.height.valueAsNumber;
        try { coordinate(width, true); coordinate(height, true); }
        catch { throw new Error('Размеры должны быть от 0,1 до 1 000 000 с шагом 0,1.'); }
        const occurrence=model.view.occurrences.find(item=>item.id===request.occurrenceId),prepared=prepareDrawingBounds(model.store.snapshot,request.viewId,{kind:'occurrence',id:request.occurrenceId},{...occurrence.bounds,width,height},readResizeBehavior());
        command = {type:'applyProjectSnapshot',files:exportFiles(prepared.snapshot)};
        changed = width !== request.initial.width || height !== request.initial.height;
      }
    } catch (error) { request.ui.error.textContent = error.message; return; }
    clearPending();
    let committed = false;
    try {
      if (changed) { model.execute(command, request.revision); committed = true; }
      dialog.close();
      if (committed) render();
      report(committed ? request.ui === propertiesUI ? 'Свойства объекта сохранены' : 'Размер рисунка сохранён' : 'Изменений нет');
    } catch (error) {
      if (committed) report(`Изменения сохранены, но интерфейс не обновлён полностью: ${error.message}`);
      else request.ui.error.textContent = `Изменения не сохранены: ${error.message}. Закройте диалог и повторите правку.`;
    }
  }
  function appendInspector(container, { concept, occurrence } = {}) {
    let item;
    try { item = metadataRecord(model.store.snapshot, concept); }
    catch { return; }
    const section = node('section', undefined, 'object-properties'), table = node('table', undefined, 'property-table');
    section.append(node('h4', 'Свойства'));
    const heading = node('tr');
    for (const title of ['Имя', 'Значение']) { const cell = node('th', title); cell.scope = 'col'; heading.append(cell); }
    const head = node('thead'), body = node('tbody'); head.append(heading); table.append(head, body);
    for (const { key, value } of item.properties) {
      const row = node('tr'), name = node('th', key), cell = node('td', value); name.scope = 'row';
      if (openLink && /^(?:https?|file):\/\/\S+$/iu.test(value)) cell.append(button(`object-property-link-${body.children.length}`, 'Открыть ссылку…', () => openLink(value)));
      row.append(name, cell); body.append(row);
    }
    if (body.children.length) section.append(table); else section.append(node('p', 'Свойства пока не заданы', 'inspector-note'));
    section.append(button('object-properties-edit', 'Изменить свойства', () => openProperties(concept)));
    if (occurrence && sameConcept(occurrence.concept, concept)) {
      section.append(node('h4', 'Размер'), node('p', `${occurrence.bounds.width} × ${occurrence.bounds.height}`, 'inspector-note'),
        button('occurrence-size-edit', 'Изменить размер', () => openSize(concept, occurrence.id)));
    }
    container.append(section);
  }
  clearPending();
  return { appendInspector, openProperties, cancel, get active() { return pending !== null; }, get generation() { return generation; } };
}
