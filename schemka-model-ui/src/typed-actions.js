import { conceptName } from './concepts.js';
import { endpointChoices, choiceConcept } from './endpoint-choices.js';
import { CURRENT_CATALOG, profileAppliesTo } from '../../schemka-model-core/src/index.js';
import { relationshipAssessment, relationshipTypeContext, relationshipCoverage, assessmentMessage, diagnosticPresentation, renderAssessmentEvidence, creationTypes, smartRelationshipChoices } from './profile-ui.js';

/** Typed creation still uses core commands. Drafts are tied to their starting revision/view. */
export function installTypedActions({ document, model, openDialog, render, nextBounds, panel, focusSelected, status, drawRelationship, anchorPlanFor = null, previewEndpoints = () => {}, revealOccurrence = () => {} }) {
  const $ = id => document.getElementById(id);
  const short = (value, max) => { const chars = Array.from(value); return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : value; };
  const displayName = item => item?.name || '(без названия)';
  const linkName = item => item?.label || '(без подписи)';
  const node = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
  let pendingElement = null, pendingLink = null;
  let choices = new Map();
  function executeCreation(command, message, createdKey, dialogId, errorId, clearPending, revealBounds = null) {
    let result;
    try { result = model.execute(command); }
    catch (error) { const message = `Не выполнено: ${error.message}`; if (errorId) $(errorId).textContent = message; else status(message); return; }
    if (result?.deferred) { clearPending(); if (dialogId && $(dialogId).open) $(dialogId).close(); return; }
    clearPending(); // Commit already happened; no UI exception may repeat it.
    try {
      model.select({ kind: createdKey === 'occurrenceId' ? 'occurrence' : 'connection', id: result.created[createdKey] });
      if (dialogId) $(dialogId).close(); render();
      if (revealBounds) revealOccurrence(revealBounds);
      panel('canvas'); focusSelected(); status(message);
    } catch (error) { status(`Объект или соединение уже созданы, но интерфейс не обновлён полностью: ${error.message}`); }
  }
  function openEdit(elementType, bounds = null, { profileId = null } = {}) {
    const kind = CURRENT_CATALOG.junctionTypes.includes(elementType) ? 'junction' : 'element';
    if (!model.view || model.typeVisible?.(kind, elementType) === false || !creationTypes(model.store.snapshot.project.metamodel, kind).includes(elementType)) return;
    const specialization = profileId && model.store.snapshot.customizationProfiles?.find(item => item.id === profileId);
    if (profileId && (!specialization || specialization.purpose !== 'specialization' || !profileAppliesTo(specialization, kind, elementType))) { status('Специализация недоступна для выбранного типа.'); return; }
    pendingElement = { kind, elementType, profileId, bounds: bounds && { ...bounds }, viewId: model.viewId, revision: model.store.revision };
    $('edit-title').textContent = `Новый ${elementType}${specialization ? ` · ${specialization.name}` : ''}`;
    $('edit-description').textContent = `Создаст ${elementType} в общей модели и его экземпляр в текущем представлении. Нормативная оценка: UNKNOWN.`;
    $('edit-submit').textContent = 'Создать';
    $('element-name').value = ''; $('edit-error').textContent = '';
    openDialog('edit-dialog'); $('element-name').focus();
  }
  $('edit-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pendingElement) return;
    if (pendingElement.revision !== model.store.revision || pendingElement.viewId !== model.viewId) { $('edit-error').textContent = 'Модель изменилась. Закройте диалог и начните создание заново.'; return; }
    let bounds;
    try { bounds = pendingElement.bounds || nextBounds(pendingElement.kind); }
    catch (error) { $('edit-error').textContent = `Не выполнено: ${error.message}`; return; }
    const revealBounds = pendingElement.kind === 'element' && !pendingElement.bounds ? bounds : null;
    executeCreation({ type: pendingElement.kind === 'junction' ? 'createJunctionAndOccurrence' : 'createElementAndOccurrence', [pendingElement.kind === 'junction' ? 'junctionType' : 'elementType']: pendingElement.elementType, viewId: pendingElement.viewId, name: $('element-name').value, bounds, ...(pendingElement.profileId ? { profileId: pendingElement.profileId } : {}) }, `${pendingElement.elementType} и его экземпляр созданы`, 'occurrenceId', 'edit-dialog', 'edit-error', () => { pendingElement = null; }, revealBounds);
  });
  $('edit-dialog').addEventListener('close', () => { if (!$('edit-dialog').open) pendingElement = null; });
  function option(value, text) { const item = node('option', text); item.value = value; return item; }
  function fillEndpoints() {
    if (!model.view) return;
    const state = model.store.snapshot, view = model.view;
    const reuse = !pendingLink?.smart && $('link-mode').value === 'reuse';
    const relation = state.relationships.find(item => item.id === $('existing-link').value);
    choices = new Map();
    for (const [id, direction] of [['link-source', 'source'], ['link-target', 'target']]) {
      const selectNode = $(id), previous = selectNode.value;
      const endpoints = endpointChoices(state, view, { concept: reuse ? relation?.[direction] : null, anchorPlanFor }).filter(choice => !pendingLink?.fixedEndpoints || choiceConcept(view, choice.endpoint)?.kind === 'element');
      for (const choice of endpoints) choices.set(`${direction}:${choice.key}`, choice);
      // A clicked-host plan is held only in the draft; Cancel leaves no anchor.
      if (pendingLink?.sourceEndpoint && direction === 'source') {
        const endpoint = pendingLink.sourceEndpoint, key = endpoint.kind === 'occurrence' ? endpoint.id : `${endpoint.id}:${endpoint.anchorId || 'new'}`;
        const candidate = endpoints.find(choice => choice.key === key);
        if (candidate) { candidate.endpoint = endpoint; choices.set(`${direction}:${key}`, candidate); }
        if (!pendingLink.sourceChosen) pendingLink.blockedSource = candidate ? null : `Выбранный источник ${endpoint.id.slice(-8)} недоступен: нельзя добавить новый якорь или этот рисунок не подходит. Выберите существующий якорь нужного рисунка либо отмените создание.`;
      }
      selectNode.replaceChildren(...endpoints.map(choice => option(choice.key, short(choice.label, 150))));
      if (endpoints.some(item => item.key === previous)) selectNode.value = previous;
      if (direction === 'source' && pendingLink?.sourceEndpoint && !pendingLink.sourceChosen) {
        const endpoint = pendingLink.sourceEndpoint, key = endpoint.kind === 'occurrence' ? endpoint.id : `${endpoint.id}:${endpoint.anchorId || 'new'}`;
        if (pendingLink.blockedSource) {
          const unavailable = option('', `Выбранный рисунок ${endpoint.id.slice(-8)}: требуется явный выбор доступного якоря`); unavailable.disabled = true;
          selectNode.replaceChildren(unavailable, ...endpoints.map(choice => option(choice.key, short(choice.label, 150))));
          selectNode.value = '';
        } else selectNode.value = key;
      } else if (direction === 'source' && pendingLink?.sourceChosen && !endpoints.some(item => item.key === previous)) selectNode.value = '';
    }
    if (pendingLink?.targetEndpoint && !pendingLink.targetChosen) {
      const endpoint = pendingLink.targetEndpoint, key = endpoint.kind === 'occurrence' ? endpoint.id : `${endpoint.id}:${endpoint.anchorId || 'new'}`;
      $('link-target').value = choices.has(`target:${key}`) ? key : '';
    }
    if (!pendingLink?.smart && !pendingLink?.targetEndpoint && !reuse && $('link-target').options.length > 1 && $('link-target').value === $('link-source').value) $('link-target').selectedIndex = 1;
    $('existing-link-field').hidden = !reuse;
    $('link-label-field').hidden = reuse;
    const missing = (reuse && !relation) || !$('link-source').value || !$('link-target').value;
    $('link-submit').disabled = missing;
    const relationshipType = reuse ? relation?.type : pendingLink?.relationshipType;
    $('link-submit').textContent = reuse ? 'Добавить соединение отношения' : `Создать ${relationshipType || 'отношение'} и соединение`;
    $('existing-link-note').textContent = relation ? `${relation.id}` : 'В модели пока нет отношений';
    $('link-note').textContent = missing ? 'Сначала добавьте в этот вид рисунки обоих концов отношения. Для отношения нужен точный рисунок и якорь.' : reuse ? 'Общее отношение сохранится; добавится только соединение в текущем виде.' : 'Будет создано отдельное отношение, даже если похожая связь уже есть.';
    if (relationshipType === 'ReadAccess') $('link-note').textContent += ' У ReadAccess стрелка находится у «Откуда»; концы не переставляются.';
    updateLinkAssessment();
  }
  function updateLinkAssessment() {
    const state = model.store.snapshot, view = model.view;
    if (!view) return;
    if (pendingLink?.fixedEndpoints) {
      $('link-source').value = pendingLink.sourceEndpoint.id;
      $('link-target').value = pendingLink.targetEndpoint.id;
    }
    const reuse = !pendingLink?.smart && $('link-mode').value === 'reuse';
    const source = choiceConcept(view, choices.get(`source:${$('link-source').value}`)?.endpoint);
    const target = choiceConcept(view, choices.get(`target:${$('link-target').value}`)?.endpoint);
    if (pendingLink?.smart) {
      const pair = JSON.stringify([source, target]);
      if (pendingLink.pair !== pair) {
        pendingLink.pair = pair; pendingLink.relationshipType = null;
        const buckets = smartRelationshipChoices(state, source, target, type => model.typeVisible?.('relationship', type) !== false);
        pendingLink.types = new Map([...buckets.allowed, ...buckets.unknown].map(item => [item.type, item.decision]));
        const groups = [];
        for (const [key, label] of [['allowed', 'Допустимые по типам концов'], ['unknown', 'Не проверено · допустимость не подтверждена']]) {
          if (!buckets[key].length) continue;
          const group = node('optgroup', ''); group.label = label;
          group.append(...buckets[key].map(({ type, decision }) => option(type, `${type} · ${key === 'unknown' ? 'UNKNOWN' : decision.sourceEvidence?.basis === 'concept-rule' ? 'правило концептов' : decision.permissionClass === 'derived' ? 'производное' : 'прямое'}`))); groups.push(group);
        }
        $('smart-link-type').replaceChildren(option('', 'Выберите тип отношения'), ...groups);
        $('smart-link-type').value = '';
      }
      pendingLink.relationshipType = pendingLink.types?.has($('smart-link-type').value) ? $('smart-link-type').value : null;
      $('smart-link-direction').textContent = pendingLink.fixedEndpoints ? 'Направление соответствует перетаскиванию.' : `Откуда → куда: ${conceptName(state, source)} → ${conceptName(state, target)}. Направление хранения не меняется. Проверка графа выполняется при создании.`;
      if (pendingLink.fixedEndpoints) $('link-fixed-endpoints').textContent = `${conceptName(state, source)} → ${conceptName(state, target)}`;
    }
    const relation = reuse ? state.relationships.find(item => item.id === $('existing-link').value) : {
      type: pendingLink?.relationshipType,
      source, target,
    };
    const endpoints = ['source', 'target'].map(end => choices.get(`${end}:${$('link-' + end).value}`)?.endpoint);
    const planCounts = new Map();
    for (const endpoint of endpoints) if (endpoint?.insertAnchor) planCounts.set(endpoint.id, (planCounts.get(endpoint.id) || 0) + 1);
    const fullHost = [...planCounts].find(([id, count]) => { const host = view.connections.find(item => item.id === id); return !host || host.routePoints.length + count > 128; });
    const unavailable = endpoints.some(endpoint => !endpoint) || (reuse && !relation);
    $('link-submit').disabled = unavailable || Boolean(fullHost);
    if (pendingLink?.blockedSource) $('link-note').textContent = pendingLink.blockedSource;
    else if (fullHost) $('link-note').textContent = `Для рисунка ${fullHost[0].slice(-8)} не хватает места для выбранных новых якорей (предел: 128 точек). Выберите существующий якорь или отмените создание.`;
    else if (unavailable) $('link-note').textContent = 'Выберите оба точных рисунка концов.';
    else {
      $('link-note').textContent = reuse ? 'Общее отношение сохранится; добавится только соединение в текущем виде.' : 'Будет создано отдельное отношение, даже если похожая связь уже есть.';
      if (relation?.type === 'ReadAccess') $('link-note').textContent += ' У ReadAccess стрелка находится у «Откуда»; концы не переставляются.';
    }
    previewEndpoints(view, fullHost ? [] : endpoints);
    const plans = endpoints.filter(endpoint => endpoint?.insertAnchor);
    $('link-anchor-note').textContent = plans.length ? plans.map(endpoint => `Соединение ${endpoint.id.slice(-8)}: закреплённый якорь (${endpoint.insertAnchor.point.x}; ${endpoint.insertAnchor.point.y}) в позиции ${endpoint.insertAnchor.index + 1}.`).join(' ') + ' Маршрут хозяина станет ломаной через этот якорь. Якорь и отношение сохранятся одним действием; Отмена ничего не создаёт.' : '';
    const result = relationshipAssessment(state, relation);
    const diagnostic = diagnosticPresentation(result);
    $('link-submit').disabled ||= !reuse && (!relation?.type || diagnostic.status === 'FORBIDDEN');
    if (!reuse && diagnostic.status === 'FORBIDDEN') $('link-note').textContent += ' Подтверждённо запрещённое новое отношение создать нельзя.';
    else if (!reuse && relation?.type && diagnostic.status === 'UNKNOWN') $('link-note').textContent += ' Допустимость не подтверждена (UNKNOWN).';
    $('link-submit').textContent = reuse ? 'Добавить соединение отношения' : `Создать ${relation?.type || 'отношение'} и соединение`;
    $('link-assessment').textContent = assessmentMessage(result);
    $('link-assessment').dataset.assessment = diagnosticPresentation(result).status;
    renderAssessmentEvidence(document, $('link-assessment-evidence'), result, relationshipTypeContext(state, relation), relationshipCoverage(state.project.metamodel));
    for (const id of ['link-assessment', 'link-assessment-evidence']) $(id).hidden = !relation?.type;
    $('link-note').hidden = Boolean(pendingLink?.fixedEndpoints && !relation?.type && !unavailable && !fullHost);
    if (pendingLink?.fixedEndpoints) $('link-submit').textContent = 'Создать связь';
  }
  function openLink(relationshipType = null, { relationshipId = null, sourceEndpoint = null, targetEndpoint = null, smart = false, fixedEndpoints = false, profileId = null } = {}) {
    if (!model.view || (relationshipId && model.conceptVisible?.({ kind: 'relationship', id: relationshipId }) === false) || (relationshipType !== null && model.typeVisible?.('relationship', relationshipType) === false) || (relationshipType !== null && !creationTypes(model.store.snapshot.project.metamodel, 'relationship').includes(relationshipType))) return;
    const state = model.store.snapshot;
    const specialization = profileId && state.customizationProfiles?.find(item => item.id === profileId);
    if (profileId && (!specialization || specialization.purpose !== 'specialization' || !relationshipType || !profileAppliesTo(specialization, 'relationship', relationshipType))) { status('Специализация недоступна для выбранного отношения.'); return; }
    fixedEndpoints = Boolean(smart && fixedEndpoints && sourceEndpoint?.kind === 'occurrence' && targetEndpoint?.kind === 'occurrence');
    pendingLink = { relationshipType, profileId, sourceEndpoint: structuredClone(sourceEndpoint), targetEndpoint: structuredClone(targetEndpoint), smart, fixedEndpoints, viewId: model.viewId, revision: model.store.revision };
    $('smart-link-field').hidden = !smart;
    $('link-endpoints').hidden = fixedEndpoints; $('link-mode-field').hidden = fixedEndpoints;
    $('link-fixed-endpoints').hidden = !fixedEndpoints;
    $('link-source').disabled = fixedEndpoints; $('link-target').disabled = fixedEndpoints;
    $('link-intro').textContent = fixedEndpoints ? 'Выберите тип связи между выбранными объектами.' : 'Выберите точные рисунки концов связи в текущем представлении.';
    $('link-intro').hidden = fixedEndpoints;
    $('smart-link-direction').hidden = fixedEndpoints;
    $('link-title').textContent = smart ? 'Магическая связь · выберите тип' : relationshipType ? `${relationshipType} · связь в представлении` : 'Существующее отношение · соединение';
    $('link-mode').value = relationshipType || smart ? 'new' : 'reuse'; $('link-mode').disabled = smart || !relationshipType || Boolean(profileId); $('link-label').value = '';
    $('existing-link').replaceChildren(...state.relationships.filter(item => model.conceptVisible?.({ kind: 'relationship', id: item.id }) ?? true).map(item => {
      return option(item.id, `${item.type} · ${short(conceptName(state, item.source), 16)} → ${short(conceptName(state, item.target), 16)} · ${short(linkName(item), 22)} · ${item.id.slice(-6)}`);
    }));
    if (relationshipId) $('existing-link').value = relationshipId;
    fillEndpoints();
    const sourceKey = sourceEndpoint && (sourceEndpoint.kind === 'occurrence' ? sourceEndpoint.id : `${sourceEndpoint.id}:${sourceEndpoint.anchorId || 'new'}`);
    if (sourceKey && [...$('link-source').options].some(item => item.value === sourceKey)) { $('link-source').value = sourceKey; updateLinkAssessment(); }
    openDialog('link-dialog');
    if (fixedEndpoints) $('smart-link-type').focus();
  }
  $('link-dialog').addEventListener('close', () => { if ($('link-dialog').open) return; pendingLink = null; choices.clear(); previewEndpoints(model.view, []); });
  for (const id of ['link-source', 'link-target']) $(id).addEventListener('change', () => {
    if (id === 'link-source' && pendingLink) { pendingLink.sourceChosen = true; pendingLink.blockedSource = null; }
    if (id === 'link-target' && pendingLink) pendingLink.targetChosen = true;
    updateLinkAssessment();
  });
  $('smart-link-type').addEventListener('change', updateLinkAssessment);
  $('link-mode').addEventListener('change', fillEndpoints);
  $('existing-link').addEventListener('change', fillEndpoints);
  $('link-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pendingLink) return;
    if (pendingLink.revision !== model.store.revision || pendingLink.viewId !== model.viewId) { $('link-note').textContent = 'Модель изменилась. Закройте диалог и начните создание заново.'; return; }
    updateLinkAssessment();
    if (!pendingLink.smart && $('link-mode').value !== 'reuse' && !pendingLink.relationshipType) { $('link-note').textContent = 'Создание этого типа недоступно. Выберите существующее отношение.'; return; }
    if ($('link-submit').disabled) return;
    const source = choices.get(`source:${$('link-source').value}`)?.endpoint, target = choices.get(`target:${$('link-target').value}`)?.endpoint;
    if (!source || !target) { $('link-note').textContent = 'Выберите оба точных рисунка концов.'; return; }
    const ends = { viewId: pendingLink.viewId, source: structuredClone(source), target: structuredClone(target) };
    if (ends.source.insertAnchor && ends.target.insertAnchor && ends.source.id === ends.target.id && ends.target.insertAnchor.index >= ends.source.insertAnchor.index) ends.target.insertAnchor.index++;
    const reuse = !pendingLink?.smart && $('link-mode').value === 'reuse';
    if (!reuse && !creationTypes(model.store.snapshot.project.metamodel, 'relationship').includes(pendingLink.relationshipType)) { $('link-note').textContent = 'Создание этого типа недоступно. Выберите существующее отношение.'; return; }
    const command = reuse
      ? { type: 'addConnection', ...ends, relationshipId: $('existing-link').value }
      : { type: 'createRelationshipAndConnection', relationshipType: pendingLink.relationshipType, ...ends, label: $('link-label').value, ...(pendingLink.profileId ? { profileId: pendingLink.profileId } : {}) };
    const message = reuse ? 'Соединение существующего отношения добавлено'
      : `${pendingLink.relationshipType} и соединение созданы · ${$('link-assessment').textContent}`;
    executeCreation(command, message, 'connectionId', 'link-dialog', 'link-note', () => { pendingLink = null; });
  });
  function connect(relationshipType, { sourceEndpoint, targetEndpoint, profileId = null }) {
    const state = model.store.snapshot, view = model.view;
    if (!view || model.typeVisible?.('relationship', relationshipType) === false || !creationTypes(state.project.metamodel, 'relationship').includes(relationshipType)) return;
    if (sourceEndpoint?.kind !== 'occurrence' || targetEndpoint?.kind !== 'occurrence') return;
    const specialization = profileId && state.customizationProfiles?.find(item => item.id === profileId);
    if (profileId && (!specialization || specialization.purpose !== 'specialization' || !profileAppliesTo(specialization, 'relationship', relationshipType))) { status('Специализация недоступна для выбранного отношения.'); return; }
    const source = choiceConcept(view, sourceEndpoint), target = choiceConcept(view, targetEndpoint);
    if (!source || !target) { status('Выбранные объекты недоступны. Начните создание связи заново.'); return; }
    const assessment = relationshipAssessment(state, { type: relationshipType, source, target });
    if (diagnosticPresentation(assessment).status === 'FORBIDDEN') { status(`Связь не создана: ${assessmentMessage(assessment)}`); return; }
    executeCreation({ type: 'createRelationshipAndConnection', relationshipType, viewId: model.viewId, source: structuredClone(sourceEndpoint), target: structuredClone(targetEndpoint), label: '', ...(profileId ? { profileId } : {}) },
      `${relationshipType} и соединение созданы · ${assessmentMessage(assessment)}`, 'connectionId', null, null, () => {});
  }
  for (const type of [...CURRENT_CATALOG.elementTypes, ...CURRENT_CATALOG.junctionTypes]) $(`create-${type.toLowerCase()}`).addEventListener('click', () => openEdit(type));
  for (const type of CURRENT_CATALOG.relationshipTypes) $(`create-${type.toLowerCase()}`).addEventListener('click', () => drawRelationship(type));
  return { openEdit, openLink, fillEndpoints, connect };
}
