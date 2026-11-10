import { CURRENT_CATALOG, LIMITS, createCustomizationResolver, profileAppliesTo, resolveProfileValue, specializationLabel, createStore, specializationNameConflicts } from '../../schemka-model-core/src/index.js';
import { typedValueControl, attributeDefinitionControl } from './typed-profile-fields.js';
import { conceptRecord } from './concepts.js';

/** Inert model-owned definitions. Drafts never enter history until one guarded submit. */
export function installCustomizationUI({ document, model, openDialog, render, status, blocked = () => false, openAssets = () => {} }) {
  const $ = id => document.getElementById(id), dialog = $('customization-dialog'), form = $('customization-form');
  const item = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action) => { const node = item('button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
  const display = definition => `${definition.name} · ${definition.targets.map(target => target.type).join(', ')} · ${definition.id}`;
  const origins = { override: 'своё значение', default: 'по умолчанию', unset: 'не задано' };
  let pending = null, generation = 0, attributeEditor = null, valueEditors = new Map();
  function humanHost(id,title) { const old = $(id), section = item('fieldset'), legend = item('legend',title), host = item('div'); host.id = id; section.append(legend,host); old.closest('label').replaceWith(section); return host; }
  const attributesHost = humanHost('customization-attributes','Атрибуты и значения по умолчанию');
  $('customization-values').closest('label').remove(); $('customization-syntax').remove(); $('customization-values-help').textContent = 'Своё значение включается отдельно. Выключение возвращает default или «не задано». Изменения сохраняются только по кнопке «Применить значения».';
  const imageSection = item('fieldset'), imageLegend = item('legend','Иконка специализации'), imageSelect = item('select'), imagePreview = item('div'), impact = item('p'); imageSelect.id = 'customization-image'; imagePreview.className = 'profile-image-preview'; impact.id = 'customization-impact'; imageSection.append(imageLegend,imageSelect,imagePreview,button('Библиотека изображений…',() => { cancel(); openAssets(); })); $('customization-definition').append(imageSection,impact);
  const collision = item('label'), collisionCheck = item('input'), collisionText = item('span'); collisionCheck.type = 'checkbox'; collisionCheck.id = 'customization-collision-confirm'; collision.append(collisionCheck,collisionText); $('customization-definition').append(collision); collision.hidden = true;
  function checkNames() {
    if (pending?.mode !== 'definition') return [];
    const candidate = {name:$('customization-name').value,purpose:$('customization-purpose').value,targets:[...$('customization-targets').querySelectorAll('input:checked')].map(input => ({kind:input.dataset.kind,type:input.dataset.type}))};
    const state = model.store.snapshot, previous = pending.originalDefinition ? specializationNameConflicts(state,pending.originalDefinition,pending.profileId) : [], conflicts = specializationNameConflicts(state,candidate,pending.profileId).filter(id => !previous.includes(id));
    const signature = JSON.stringify(conflicts); if (pending.collisionSignature !== signature) { pending.collisionSignature = signature; collisionCheck.checked = false; } collision.hidden = !conflicts.length; collisionText.textContent = `Имя совпадает со специализацией для этого базового типа (${conflicts.length}). Создать/переименовать как отдельное определение с другим ID; совпадения не объединяются.`; return conflicts;
  }
  const paintImage = () => { const asset = model.store.snapshot.assets.find(asset => asset.id === imageSelect.value); imagePreview.replaceChildren(); imagePreview.hidden = !asset; if (asset) { const image = item('img'); image.alt = 'Иконка специализации'; image.src = `data:${asset.mediaType};base64,${asset.data}`; imagePreview.append(image); } }; imageSelect.addEventListener('change',paintImage);
  const selection = () => JSON.stringify(model.selection);
  const capture = mode => ({ mode, store: model.store, revision: model.store.revision, projectId: model.store.snapshot.project.id, viewId: model.viewId, selection: selection() });
  const current = request => model.store === request.store && model.store.revision === request.revision && model.store.snapshot.project.id === request.projectId && model.viewId === request.viewId && selection() === request.selection;
  function clear() { if (pending) generation++; pending = null; $('customization-save').disabled = true; }
  function cancel() { const active = Boolean(pending || dialog.open); clear(); if (dialog.open) dialog.close(); return active; }
  function sections(mode) {
    for (const name of ['manager', 'definition', 'application', 'confirm']) $(`customization-${name}`).hidden = mode !== name;
    $('customization-save').hidden = mode === 'manager'; $('customization-save').disabled = mode === 'manager';
    $('customization-error').textContent = '';
  }
  function begin(mode) {
    if (pending || blocked()) return false;
    const request = capture(mode);
    try {
      openDialog('customization-dialog');
      if (!dialog.open) throw Error('Диалог не открыт');
      pending = request; generation++; sections(mode); return true;
    } catch (error) { clear(); status(`Не удалось открыть профили: ${error.message}`); return false; }
  }
  function usable() {
    if (pending && dialog.open && current(pending)) return true;
    clear(); $('customization-error').textContent = 'Модель, вид или выделение изменились. Черновик отменён; закройте диалог и начните заново.'; return false;
  }
  function editDefinition(definition) {
    if (!usable()) return;
    pending.mode = 'definition'; pending.profileId = definition?.id;
    pending.originalName = definition?.name ?? ''; pending.originalDefinition = definition; pending.collisionSignature = null;
    sections('definition'); $('customization-name').value = pending.originalName;
    pending.initialName = $('customization-name').value;
    $('customization-purpose').value = definition?.purpose ?? 'attributes';
    attributeEditor = attributeDefinitionControl(document,definition?.attributes ?? {}); attributesHost.replaceChildren(attributeEditor.element);
    imageSelect.replaceChildren(); for (const [value,text] of [['','Без иконки'],...model.store.snapshot.assets.map(asset => [asset.id,asset.name || 'Без названия'])]) { const option = item('option',text); option.value = value; imageSelect.append(option); } imageSelect.value = definition?.imageAssetId ?? ''; imageSection.hidden = $('customization-purpose').value !== 'specialization'; paintImage();
    const usages = definition ? createCustomizationResolver(model.store.snapshot).usagesFor(definition.id) : []; impact.textContent = `Общие данные: ${usages.length} концептов. Изменение defaults действует там, где нет собственного значения. Несовместимые назначения не удаляются автоматически.`;
    const targets = $('customization-targets'); targets.replaceChildren();
    for (const [kind, label, types] of [['element', 'Элементы', CURRENT_CATALOG.elementTypes], ['junction', 'Junctions', CURRENT_CATALOG.junctionTypes], ['relationship', 'Отношения', CURRENT_CATALOG.relationshipTypes]]) {
      const group = item('details'), heading = item('summary', label); group.append(heading); group.open = Boolean(definition?.targets.some(target => target.kind === kind));
      for (const type of types) {
        const row = item('label'), check = item('input'); check.type = 'checkbox'; check.dataset.kind = kind; check.dataset.type = type;
        check.checked = Boolean(definition?.targets.some(target => target.kind === kind && target.type === type)); row.append(check, document.createTextNode(type)); group.append(row);
      }
      targets.append(group);
    }
    $('customization-heading').textContent = definition ? 'Изменить профиль модели' : 'Новый профиль модели';
    $('customization-save').textContent = 'Сохранить профиль'; checkNames(); $('customization-name').focus();
  }
  function confirm(command, text) {
    if (!usable()) return;
    pending.mode = 'confirm'; pending.command = command; sections('confirm');
    $('customization-heading').textContent = 'Подтвердить удаление данных'; $('customization-confirm').textContent = text;
    $('customization-save').textContent = 'Подтвердить'; $('customization-save').focus();
  }
  function manager() {
    if (!begin('manager')) return false;
    $('customization-heading').textContent = 'Профили этой модели';
    const list = $('customization-list'); list.replaceChildren();
    const state = model.store.snapshot, { usagesFor } = createCustomizationResolver(state);
    const aliases = new Map(); for (const definition of state.customizationProfiles ?? []) { const key = definition.name.trim().normalize('NFC').toLowerCase(); if (!aliases.has(key)) aliases.set(key,[]); aliases.get(key).push(definition); }
    for (const definition of state.customizationProfiles ?? []) {
      const row = item('li'), usages = usagesFor(definition.id), matching = aliases.get(definition.name.trim().normalize('NFC').toLowerCase()), conflicts = matching.length > 1 ? specializationNameConflicts({customizationProfiles:matching},definition,definition.id) : [];
      const legendUsages=state.views.flatMap(entry=>entry.visualNodes.filter(node=>node.legend?.colors?.some(color=>color.profileId===definition.id)).map(node=>entry.view.name+' / '+node.name)),legendImpact=legendUsages.length?` Индивидуальный цвет этой специализации будет снят у легенд: ${legendUsages.join(', ')}.`:'';
      if (conflicts.length) row.append(item('p','Историческое совпадение имени: ID различаются. Переименуйте одну специализацию для ясности.'));
      row.append(item('p', display(definition)), item('p', `${definition.purpose} · применён к ${usages.length} концептам`), button('Использования…',() => { if (!usable()) return; const details = item('ul'); for (const ref of usages) { const object = conceptRecord(state,ref), views = state.views.filter(entry => ref.kind === 'relationship' ? entry.connections.some(item => item.relationshipId === ref.id) : entry.occurrences.some(item => item.concept.kind === ref.kind && item.concept.id === ref.id)); details.append(item('li',`${object.name || object.label || ref.id} · ${ref.kind} ${ref.id} · представления: ${views.map(entry => entry.view.name).join(', ') || 'не нарисован'}`)); } row.querySelector('[data-profile-usages]')?.remove(); details.dataset.profileUsages = ''; row.append(details); }), button('Изменить', () => editDefinition(definition)), button('Удалить…', () => {
        if (!usable()) return;
        if (usages.length) { $('customization-error').textContent = `Профиль «${definition.name}» используется: ${usages.map(ref => `${ref.kind} ${ref.id}`).join(', ')}. Сначала явно снимите применения в инспекторе.`; return; }
        confirm({ type: 'deleteCustomizationProfile', profileId: definition.id }, `Удалить определение «${definition.name}» (${definition.id}) из этой модели?${legendImpact}`);
      })); if (usages.length) row.append(button('Снять у всех и удалить…',() => { if (!usable()) return; confirm({type:'delete-profile-with-applications',profileId:definition.id,usages:usages.map(ref => ({...ref}))},`Снять «${definition.name}» с ${usages.length} концептов и удалить определение? Их собственные значения будут удалены во всех представлениях. Базовые концепты и отношения сохранятся. Использования: ${usages.map(ref => `${ref.kind} ${ref.id}`).join(', ')}. Одно Undo восстановит определение и все применения.${legendImpact}`); })); list.append(row);
    }
    if (!list.children.length) list.append(item('li', 'В модели пока нет профилей. Новые определения создаются только по вашему выбору.'));
    return true;
  }
  function application(concept, profileId) {
    if (!begin('application')) return false;
    const state = model.store.snapshot, definition = state.customizationProfiles?.find(item => item.id === profileId), object = conceptRecord(state, concept);
    if (!definition || !object) { cancel(); status('Профиль или концепт не найден'); return false; }
    Object.assign(pending, { concept: { ...concept }, profileId });
    $('customization-heading').textContent = `Значения профиля «${definition.name}»`;
    $('customization-reference').textContent = `${concept.kind}: ${object.name || object.label || '(без названия)'} · ${concept.id}. Общие данные во всех видах.`;
    const values = object.profileApplications?.find(item => item.profileId === profileId)?.values ?? {};
    valueEditors = new Map();
    const hints = $('customization-value-hints'); hints.replaceChildren();
    for (const [key, attribute] of Object.entries(definition.attributes)) {
      const row = item('fieldset'), legend = item('legend',key), effective = resolveProfileValue(definition,{profileId,values},key), use = item('input'), label = item('label'), editor = typedValueControl(document,attribute.type,Object.hasOwn(values,key) ? values[key] : effective.value);
      row.dataset.attributeKey = key; use.type = 'checkbox'; use.checked = Object.hasOwn(values,key); use.dataset.override = ''; label.append(use,document.createTextNode('Своё значение')); row.append(legend,item('p',`${typeof attribute.type === 'string' ? attribute.type : attribute.type.kind} · ${origins[effective.origin]}`),label,editor.element);
      const sync = () => { editor.element.hidden = !use.checked; }; sync(); use.addEventListener('change',sync); valueEditors.set(key,{use,editor});
      row.append(button(`Сбросить «${key}»`,() => { if (!usable()) return; use.checked = false; sync(); generation++; })); hints.append(row);
    }
    $('customization-save').textContent = 'Применить значения'; hints.querySelector('input,textarea,select,button')?.focus(); return true;
  }
  function appendInspector(container, state, concept) {
    const object = conceptRecord(state, concept), section = item('section'); section.className = 'customization-inspector';
    section.append(item('h3', 'Профили концепта'));
    const label = specializationLabel(state, object); if (label) section.append(item('p', label));
    const definitions = new Map((state.customizationProfiles ?? []).map(item => [item.id, item]));
    for (const applied of object.profileApplications ?? []) {
      const definition = definitions.get(applied.profileId), row = item('section'); row.dataset.profileId = definition.id;
      row.append(item('h4', definition.name), item('p', `${definition.purpose} · ${definition.id}`));
      if (definition.purpose === 'specialization' && definition.imageAssetId) {
        const selected = model.selection?.kind === 'occurrence' ? state.views.find(entry => entry.view.id === model.viewId)?.occurrences.find(item => item.id === model.selection.id) : null;
        row.append(item('p',selected?.style.image ? 'Иконка этого рисунка: индивидуальная. Изображение специализации сохранено; сброс локального image вернёт наследование.' : 'Иконка наследуется из специализации. Индивидуальный image в оформлении рисунка имеет приоритет.'));
      }
      for (const key of Object.keys(definition.attributes)) {
        const value = resolveProfileValue(definition, applied, key), line = item('p', `${key}: ${value.origin === 'unset' ? 'не задано' : JSON.stringify(value.value)} · ${origins[value.origin]}`);
        line.dataset.valueOrigin = value.origin; row.append(line);
      }
      row.append(button('Значения / сброс…', () => application(concept, definition.id)), button('Снять профиль…', () => {
        if (!begin('confirm')) return;
        confirm({ type: 'removeProfileApplication', concept: { ...concept }, profileId: definition.id }, `Снять профиль «${definition.name}» с ${concept.kind} ${concept.id}? Все его собственные значения на этом концепте будут удалены во всех видах. Определение и остальные профили сохранятся.`);
      })); section.append(row);
    }
    const eligible = [...definitions.values()].filter(definition => profileAppliesTo(definition, concept.kind, object.type) && !object.profileApplications?.some(item => item.profileId === definition.id));
    if (eligible.length) {
      const label = item('label', 'Применить профиль'), select = item('select'); select.id = 'customization-eligible';
      for (const definition of eligible) { const option = item('option', display(definition)); option.value = definition.id; select.append(option); }
      label.append(select); section.append(label, button('Применить…', () => application(concept, select.value)));
    } else section.append(item('p', 'Нет неприменённых подходящих профилей. Создайте профиль с этим конкретным типом в списке целей.'));
    section.append(button('Управлять профилями модели…', manager)); container.append(section);
  }
  $('customization-button').addEventListener('click', manager);
  $('customization-new').addEventListener('click', () => editDefinition(null));
  $('customization-cancel').addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  form.addEventListener('input', () => { generation++; $('customization-error').textContent = ''; checkNames(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!pending || pending.mode === 'manager' || !usable()) return;
    const request = pending;
    let command;
    try {
      if (request.mode === 'definition') {
        if (checkNames().length && !collisionCheck.checked) throw Error('Подтвердите отдельное определение с совпадающим именем.');
        const definition = {
          name: $('customization-name').value === request.initialName ? request.originalName : $('customization-name').value,
          purpose: $('customization-purpose').value,
          targets: [...$('customization-targets').querySelectorAll('input:checked')].map(input => ({ kind: input.dataset.kind, type: input.dataset.type })),
          attributes: attributeEditor.read(),
        };
        command = request.profileId ? { type: 'updateCustomizationProfile', profileId: request.profileId, definition } : { type: 'createCustomizationProfile', definition };
      } else if (request.mode === 'application') command = { type: 'setProfileApplication', concept: request.concept, profileId: request.profileId, values: Object.fromEntries([...valueEditors].filter(([,value]) => value.use.checked).map(([key,value]) => [key,value.editor.read()])) };
      else command = request.command;
    } catch (error) { $('customization-error').textContent = `Черновик не сохранён: ${error.message}`; return; }
    clear();
    let committed = false;
    try {
      if (request.mode === 'definition') {
        const stage = createStore(request.store.snapshot), previous = request.profileId && stage.snapshot.customizationProfiles?.find(item => item.id === request.profileId);
        if (previous?.imageAssetId && command.definition.purpose !== 'specialization') stage.execute({type:'setCustomizationProfileImage',profileId:previous.id,assetId:null},stage.revision);
        const changed = stage.execute(command,stage.revision), profileId = request.profileId ?? changed.created.profileId, assetId = command.definition.purpose === 'specialization' ? imageSelect.value || null : null;
        if ((stage.snapshot.customizationProfiles.find(item => item.id === profileId).imageAssetId ?? null) !== assetId) stage.execute({type:'setCustomizationProfileImage',profileId,assetId},stage.revision);
        request.store.execute({type:'applyProjectSnapshot',files:stage.exportFiles()},request.revision);
      } else if (command.type === 'delete-profile-with-applications') { const stage = createStore(request.store.snapshot); for (const concept of command.usages) stage.execute({type:'removeProfileApplication',concept,profileId:command.profileId},stage.revision); stage.execute({type:'deleteCustomizationProfile',profileId:command.profileId},stage.revision); request.store.execute({type:'applyProjectSnapshot',files:stage.exportFiles()},request.revision); }
      else request.store.execute(command, request.revision); committed = true;
      dialog.close(); render(); status('Профили модели сохранены · можно отменить. Соответствие всей модели: UNKNOWN.');
    } catch (error) {
      if (!committed && current(request) && dialog.open) { pending = request; generation++; $('customization-save').disabled = false; }
      $('customization-error').textContent = committed ? `Изменение сохранено, но интерфейс обновлён не полностью: ${error.message}` : `Не сохранено: ${error.message}`;
    }
  });
  $('customization-name').maxLength = LIMITS.string;
  $('customization-purpose').addEventListener('change',() => imageSection.hidden = $('customization-purpose').value !== 'specialization');
  return { manager, application, appendInspector, cancel, refresh() { if (pending && !current(pending)) usable(); }, get active() { return pending !== null; }, get generation() { return generation; } };
}
