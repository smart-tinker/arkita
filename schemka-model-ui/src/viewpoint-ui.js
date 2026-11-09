import { CURRENT_CATALOG, LIMITS, VIEWPOINT_PURPOSES, VIEWPOINT_CONTENTS, projectView } from '../../schemka-model-core/src/index.js';

/** Project-owned definitions and one-shot drafts; no profile authority or renderer. */
export function installViewpointUI({ document, model, openDialog, render, status, beforeChange = () => {}, addConcept = () => {}, blocked = () => false }) {
  const $ = id => document.getElementById(id), dialog = $('viewpoint-dialog');
  const node = (tag, text) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; };
  const button = (text, action) => { const item = node('button', text); item.type = 'button'; item.addEventListener('click', action); return item; };
  const option = (value, text) => { const item = node('option', text); item.value = value; return item; };
  let pending = null, generation = 0, bindingRevision = null, lists = {};
  function listControl(field,title,values) {
    const previous = $(`viewpoint-${field}`), host = node('fieldset'), legend = node('legend',title), rows = [], add = button('Добавить строку',() => { if (rows.length < 64) append(''); generation++; }); host.id = `viewpoint-${field}`; host.append(legend,add); previous.closest('label')?.replaceWith(host); if (!host.isConnected) previous.replaceWith(host);
    function append(value) { const row = node('div'), input = node('textarea'); input.rows = 1; input.maxLength = LIMITS.string; input.value = value; input.setAttribute('aria-label',title); const initial = input.value, record = {row,read:() => input.value === initial ? value : input.value}; rows.push(record); row.append(input,button('Удалить строку',() => { rows.splice(rows.indexOf(record),1); row.remove(); generation++; })); host.insertBefore(row,add); }
    values.forEach(append); return {read:() => rows.map(row => row.read())};
  }
  const scope = node('section'); scope.id = 'viewpoint-scope-preview'; scope.hidden = true; dialog.querySelector('form').insertBefore(scope,$('viewpoint-confirm'));
  const scopeButton = button('Предпросмотр охвата…',() => { if (!model.view || !manager()) return; pending.mode = 'scope'; mode('scope'); $('viewpoint-heading').textContent = 'Охват viewpoint'; const state = model.store.snapshot, select = node('select'), report = node('p'); select.id = 'viewpoint-preview-choice'; select.append(option('','Без ограничения'),...(state.viewpoints ?? []).map(item => option(item.id,item.name))); select.value = model.view?.view.viewpointId ?? ''; scope.replaceChildren(select,report);
    const update = () => { const candidate = structuredClone(state), entry = candidate.views.find(entry => entry.view.id === pending.viewId); if (select.value) entry.view.viewpointId = select.value; else delete entry.view.viewpointId; const projected = projectView(candidate,entry.view.id); report.textContent = `Останется фигур: ${projected.occurrences.length}; линий: ${projected.connections.length}; скрыто рисунков: ${projected.excludedDrawings.length}. Концепты и раскладка сохранятся. Скрытые рисунки: ${projected.excludedDrawings.map(item => `${item.kind} ${item.id}: ${item.reason}`).join('; ') || 'нет'}.`; pending.command = {type:'setViewpoint',viewId:pending.viewId,viewpointId:select.value || null}; }; select.addEventListener('change',() => { if (!usable()) return; update(); generation++; }); update(); $('viewpoint-save').textContent = 'Применить охват'; }); scopeButton.id = 'viewpoint-preview'; $('viewpoint-binding').closest('.viewpoint-controls')?.append(scopeButton);
  const capture = mode => ({ mode, store: model.store, revision: model.store.revision, projectId: model.store.snapshot.project.id, viewId: model.viewId });
  const current = request => request.store === model.store && request.revision === model.store.revision && request.projectId === model.store.snapshot.project.id && request.viewId === model.viewId;
  function clear() { if (pending) generation++; pending = null; $('viewpoint-save').disabled = true; }
  function cancel() { const active = Boolean(pending || dialog.open); clear(); if (dialog.open) dialog.close(); return active; }
  function usable() {
    if (pending && dialog.open && current(pending)) return true;
    clear(); $('viewpoint-error').textContent = 'Модель или вид изменились. Черновик отменён; закройте диалог и начните заново.'; return false;
  }
  function mode(name) {
    scope.hidden = name !== 'scope';
    for (const section of ['manager', 'definition', 'confirm']) $(`viewpoint-${section}`).hidden = section !== name;
    $('viewpoint-save').hidden = name === 'manager'; $('viewpoint-save').disabled = name === 'manager'; $('viewpoint-error').textContent = '';
  }
  function choices(host, field, values, selected) {
    const group = node('fieldset'); group.append(node('legend', field));
    for (const value of values) {
      const row = node('label'), check = node('input'); check.type = 'checkbox'; check.dataset.field = field; check.value = value; check.checked = selected.includes(value);
      row.append(check, document.createTextNode(value)); group.append(row);
    }
    for (const [label, checked] of [['Выбрать все', true], ['Очистить', false]]) group.append(button(label, () => {
      if (!usable()) return;
      group.querySelectorAll('input').forEach(input => input.checked = checked); generation++;
    }));
    host.append(group);
  }
  function edit(definition, copy = false) {
    if (!usable()) return;
    pending.mode = 'definition'; pending.viewpointId = copy ? null : definition?.id; mode('definition');
    $('viewpoint-heading').textContent = copy ? 'Копия viewpoint' : definition ? 'Изменить viewpoint' : 'Новый viewpoint';
    const values = { name: definition?.name ?? '', documentation: definition?.documentation ?? '', stakeholders: definition?.stakeholders ?? [], concerns: definition?.concerns ?? [] };
    pending.original = values; pending.initial = {};
    for (const field of ['name','documentation']) { $(`viewpoint-${field}`).value = values[field]; pending.initial[field] = $(`viewpoint-${field}`).value; }
    lists = {stakeholders:listControl('stakeholders','Заинтересованные стороны',values.stakeholders),concerns:listControl('concerns','Вопросы и задачи',values.concerns)};
    const users = model.store.snapshot.views.filter(entry => entry.view.viewpointId === pending.viewpointId);
    $('viewpoint-impact').textContent = users.length ? `Общее определение. Изменятся ${users.length} видов: ${users.map(entry => `${entry.view.name} (${entry.view.id})`).join(', ')}. Данные и раскладка сохранятся.` : 'Определение этой модели. Привяжите его к одному или нескольким видам отдельным действием.';
    const host = $('viewpoint-types'); host.replaceChildren();
    choices(host, 'purpose', VIEWPOINT_PURPOSES, definition?.purpose ?? []); choices(host, 'content', VIEWPOINT_CONTENTS, definition?.content ?? []);
    for (const field of ['elementTypes', 'junctionTypes', 'relationshipTypes']) choices(host, field, CURRENT_CATALOG[field], definition?.selection[field] ?? []);
    $('viewpoint-save').textContent = 'Сохранить определение'; $('viewpoint-name').focus();
  }
  function manager() {
    if (pending || blocked()) return false;
    const request = capture('manager');
    try { openDialog('viewpoint-dialog'); if (!dialog.open) throw Error('Диалог не открыт'); }
    catch (error) { status(`Не удалось открыть viewpoints: ${error.message}`); return false; }
    pending = request; generation++; mode('manager'); $('viewpoint-heading').textContent = 'Viewpoints этой модели';
    const list = $('viewpoint-list'); list.replaceChildren();
    for (const definition of model.store.snapshot.viewpoints ?? []) {
      const row = node('li'); row.append(node('p', `${definition.name} · ${definition.id}`), button('Изменить', () => edit(definition)), button('Копировать', () => edit(definition, true)), button('Удалить…', () => {
        if (!usable()) return;
        const users = model.store.snapshot.views.filter(entry => entry.view.viewpointId === definition.id);
        if (users.length) { $('viewpoint-error').textContent = `Используется видами: ${users.map(entry => `${entry.view.name} (${entry.view.id})`).join(', ')}. Сначала явно снимите или замените привязки.`; return; }
        pending.mode = 'confirm'; pending.command = { type: 'deleteViewpoint', viewpointId: definition.id }; mode('confirm');
        $('viewpoint-confirm').textContent = `Удалить определение «${definition.name}» (${definition.id})?`; $('viewpoint-save').textContent = 'Удалить определение';
      })); list.append(row);
    }
    if (!list.children.length) list.append(node('li', 'Viewpoints пока нет. Создайте собственный выбор типов и описание задач.'));
    return true;
  }
  function refresh() {
    if (pending && !current(pending)) usable();
    const state = model.store.snapshot, projection = model.projection, view = projection?.view;
    scopeButton.disabled = !view;
    const controls = $('viewpoint-binding').closest('.viewpoint-controls');
    if (controls) controls.hidden = !state.viewpoints?.length && !view?.viewpointId;
    bindingRevision = capture('binding');
    const select = $('viewpoint-binding');
    select.replaceChildren(option('', 'Без viewpoint · ручной вид'), ...(state.viewpoints ?? []).map(item => option(item.id, `${item.name} · ${item.id}`)));
    select.value = view?.viewpointId ?? ''; select.disabled = !view;
    $('viewpoint-scope').hidden = !view?.viewpointId;
    const definition = state.viewpoints?.find(item => item.id === view?.viewpointId);
    if (!definition) return;
    $('viewpoint-summary').textContent = `${definition.name} · ${definition.purpose.join(', ')} / ${definition.content.join(', ')}. Заинтересованные стороны: ${definition.stakeholders.join('; ')}. Вопросы: ${definition.concerns.join('; ')}. ${definition.documentation}`;
    const typeCount = projection.excludedConcepts.filter(item => item.reason === 'type-excluded').length;
    const endpointCount = projection.excludedConcepts.length - typeCount;
    const drawingCount = projection.excludedDrawings.filter(item => item.reason === 'drawing-endpoint-excluded').length;
    $('viewpoint-counts').textContent = `Ручной охват вида. Скрыто рисунков: ${projection.excludedDrawings.length}; тип исключён: ${typeCount} концептов; конец концепта исключён: ${endpointCount}; точный рисунок/хозяин исключён: ${drawingCount}. Подходят, но не нарисованы: ${projection.undrawnConcepts.length}.`;
    const eligible = $('viewpoint-eligible'), previous = eligible.value, undrawn = new Set(projection.undrawnConcepts.map(item => item.id));
    const eligibleIds = new Set([...projection.elementIds, ...projection.junctionIds, ...projection.relationshipIds]);
    eligible.replaceChildren(...[['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships]].flatMap(([kind, records]) => records.filter(item => eligibleIds.has(item.id)).map(item => option(`${kind}:${item.id}`, `${item.type} · ${item.name || item.label || '(без имени)'} · ${undrawn.has(item.id) ? 'ещё не нарисован' : 'уже в виде'} · ${item.id}`))));
    if ([...eligible.options].some(item => item.value === previous)) eligible.value = previous;
    eligible.disabled = !eligible.options.length; $('viewpoint-add').disabled = eligible.disabled;
    $('viewpoint-empty').hidden = Boolean(projection.occurrences.length || projection.connections.length);
  }
  $('viewpoint-binding').addEventListener('change', () => {
    const request = bindingRevision, id = $('viewpoint-binding').value || null;
    if (!request || !current(request)) { refresh(); status('Модель или вид изменились. Повторите выбор viewpoint.'); return; }
    if ((model.view?.view.viewpointId ?? null) === id) return;
    let committed = false;
    try {
      beforeChange(); model.execute({ type: 'setViewpoint', viewId: request.viewId, viewpointId: id }, request.revision); committed = true;
      render(); $('viewpoint-binding').focus(); status('Привязка viewpoint сохранена · скрытые данные остаются в модели.');
    } catch (error) { status(committed ? `Привязка сохранена, интерфейс обновлён не полностью: ${error.message}` : `Не выполнено: ${error.message}`); if (!committed) refresh(); }
  });
  $('viewpoint-add').addEventListener('click', () => {
    const [kind, id] = $('viewpoint-eligible').value.split(':');
    if (!id || !model.conceptVisible({ kind, id })) return;
    addConcept({ kind, id });
  });
  $('viewpoint-button').addEventListener('click', manager);
  $('viewpoint-new').addEventListener('click', () => edit(null));
  $('viewpoint-cancel').addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  $('viewpoint-form').addEventListener('input', () => { generation++; $('viewpoint-error').textContent = ''; });
  $('viewpoint-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pending || pending.mode === 'manager' || !usable()) return;
    const request = pending; let command;
    try {
      if (request.mode === 'definition') {
        const checked = field => [...$('viewpoint-types').querySelectorAll(`input[data-field="${field}"]:checked`)].map(item => item.value);
        const value = field => $(`viewpoint-${field}`).value === request.initial[field] ? request.original[field] : $(`viewpoint-${field}`).value;
        const definition = { name: value('name'), documentation: value('documentation'), stakeholders: lists.stakeholders.read(), concerns: lists.concerns.read(), purpose: checked('purpose'), content: checked('content'),
          selection: Object.fromEntries(['elementTypes', 'junctionTypes', 'relationshipTypes'].map(field => [field, checked(field)])), representation: { kind: 'diagram', notation: 'archimate', labels: 'name-and-type' } };
        command = request.viewpointId ? { type: 'updateViewpoint', viewpointId: request.viewpointId, definition } : { type: 'createViewpoint', definition };
      } else command = request.command;
    } catch (error) { $('viewpoint-error').textContent = `Черновик не сохранён: ${error.message}`; return; }
    if (request.mode === 'scope' && (model.view.view.viewpointId ?? null) === command.viewpointId) { cancel(); status('Охват совпадает с текущим; модель не менялась.'); return; }
    clear(); let committed = false;
    try {
      beforeChange(); model.execute(command, request.revision); committed = true;
      dialog.close(); render(); $('viewpoint-binding').focus(); status('Viewpoint сохранён · можно отменить. Соответствие всей модели: UNKNOWN.');
    } catch (error) {
      if (!committed && current(request) && dialog.open) { pending = request; generation++; $('viewpoint-save').disabled = false; }
      $('viewpoint-error').textContent = committed ? `Изменение сохранено, интерфейс обновлён не полностью: ${error.message}` : `Не сохранено: ${error.message}`;
    }
  });
  for (const field of ['name', 'documentation']) $(`viewpoint-${field}`).maxLength = LIMITS.string;

  return { manager, refresh, cancel, get active() { return pending !== null; }, get generation() { return generation; } };
}
