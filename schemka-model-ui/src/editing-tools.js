import { evaluateConceptRelationship,getVerifiedRelationshipDecision,getVerifiedConceptDecision } from '../../schemka-model-profiles/src/index.js';
import { modelProfiles,assessmentMessage,renderAssessmentEvidence } from './profile-ui.js';
import {prepareDrawingBounds,standardDrawingBounds} from './resize-preferences.js';
import { prepareCreationCommand } from './preferences.js';
import { CURRENT_CATALOG, createStore, exportFiles } from '../../schemka-model-core/src/index.js';
import { reorderDrawings, reverseRelationships, createLinkedElement } from '../../schemka-model-core/src/diagram-editing.js';
import { drawingFor } from './visual-drawings.js';
import { canvasDropPoint } from './drag-drop.js';

/** Drafts and repeat tools are disposable; each accepted edit is one store command. */
export function installEditingTools({ document, window, model, canvas, openDialog, render, status, blocked, beforeChange, preview, nextBounds, selectMany, readQuickAdd = () => true, readMagicOrder = () => 'element-first', readResizeBehavior = () => 'retain', readDefaults = () => ({ width: 210, height: 90 }) }) {
  const node = (tag, text) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; };
  const button = (id, text, action) => { const item = node('button', text); item.id = id; item.type = 'button'; item.addEventListener('click', action); return item; };
  const dialog = node('dialog'), form = node('form'), heading = node('h2'), fields = node('div'), error = node('p'), actions = node('div');
  dialog.id = 'diagram-tools-dialog'; form.id = 'diagram-tools-form'; heading.id = 'diagram-tools-title'; error.id = 'diagram-tools-error'; error.setAttribute('role', 'alert'); dialog.setAttribute('aria-labelledby', heading.id); actions.className = 'dialog-actions';
  const apply = node('button', 'Применить'); apply.id = 'diagram-tools-apply'; apply.type = 'submit'; actions.append(button('diagram-tools-cancel', 'Отмена', () => cancel()), apply); form.append(heading, fields, error, actions); dialog.append(form); document.body.append(dialog);
  let request = null, generation = 0, repeated = null, lastPoint = null;
  const trigger = button('diagram-tools-button', 'Инструменты диаграммы…', () => tools());
  const quick = button('diagram-quick-add', 'Быстро добавить…', () => quickAdd());
  const menu = [...document.querySelectorAll('.app-menu')].find(item => item.querySelector('summary')?.textContent === 'Правка')?.querySelector('.menu-items');
  menu?.append(trigger, quick);
  const repeatStatus = button('diagram-repeat-stop', 'Повторение: завершить · Esc', () => cancel()); repeatStatus.hidden = true; document.getElementById('catalogue-palette')?.prepend(repeatStatus);
  const create = (state,options) => createLinkedElement(state,options,{prepareCommand:command=>prepareCreationCommand(command,{defaults:{nodeStyle:{},lineStyle:'auto',legend:{},...readDefaults()}})});
  const current = value => value && value.store === model.store && value.revision === model.store.revision && value.viewId === model.viewId && value.projectId === model.store.snapshot.project.id;
  function cancel() {
    const dirtyPreview = request?.mode === 'geometry'; request?.abort?.abort(); request = null; repeated = null; generation++; repeatStatus.hidden = true; canvas.classList.remove('repeat-tool');
    if (dialog.open) dialog.close(); if (dirtyPreview) preview(model.view);
  }
  function show(title, mode) {
    if (blocked() || !model.view) return null;
    beforeChange(); fields.replaceChildren(); error.textContent = ''; heading.textContent = title; apply.hidden = false; apply.disabled = false;
    const value = { store: model.store, revision: model.store.revision, projectId: model.store.snapshot.project.id, viewId: model.viewId, mode, refs: model.selections, controls: {} };
    openDialog(dialog.id); request = value; generation++; return value;
  }
  function field(value, id, label, initial, choices = null, type = 'text') {
    const row = node('label', label), input = node(choices ? 'select' : 'input'); input.id = `diagram-${id}`;
    if (choices) for (const [id, text] of choices) { const option = node('option', text); option.value = id; input.append(option); }
    else { input.type = type; if (type === 'number') input.step = '0.1'; else input.maxLength = 8192; }
    if (type === 'checkbox') input.checked = Boolean(initial); else input.value = initial ?? '';
    row.append(input); fields.append(row); value.controls[id] = input; return input;
  }
  function commit(value, snapshot, selected, message = 'Изменения сохранены · один шаг отмены.') {
    if (request !== value || !current(value)) { cancel(); status('Контекст изменился. Начните действие заново.'); return false; }
    try {
      model.execute({ type: 'applyProjectSnapshot', files: exportFiles(snapshot) }, value.revision);
      const repeat = value.mode === 'quick' && value.controls.repeat.checked ? { ...value.read(), store: model.store, revision: model.store.revision, projectId: value.projectId, viewId: value.viewId } : null;
      request?.abort?.abort(); request = null; if (dialog.open) dialog.close(); generation++;
      if (selected) model.select(selected); render();
      if (repeat) { repeated = repeat; repeatStatus.hidden = false; repeatStatus.textContent = `Повтор: ${repeat.elementType} · завершить (Esc)`; canvas.classList.add('repeat-tool'); }
      status(message); return true;
    } catch (failure) { error.textContent = `Не применено: ${failure.message}`; return false; }
  }
  function tools() {
    const value = show('Инструменты диаграммы', 'tools'); if (!value) return false; apply.hidden = true;
    fields.append(button('diagram-select-same', 'Выбрать те же типы', () => {
      if (!current(value)) { cancel(); return; }
      const state = model.store.snapshot, view = model.view, types = new Set(value.refs.map(ref => {
        const item = drawingFor(view, ref); return ref.kind === 'occurrence' ? `${item.concept.kind}:${state[item.concept.kind === 'element' ? 'elements' : 'junctions'].find(concept => concept.id === item.concept.id).type}` : ref.kind === 'connection' ? `relationship:${state.relationships.find(rel => rel.id === item.relationshipId).type}` : `${ref.kind}:${item.kind ?? 'line'}`;
      }));
      const selected = [
        ...view.occurrences.filter(item => types.has(`${item.concept.kind}:${state[item.concept.kind === 'element' ? 'elements' : 'junctions'].find(concept => concept.id === item.concept.id).type}`)).map(item => ({ kind: 'occurrence', id: item.id })),
        ...view.connections.filter(item => types.has(`relationship:${state.relationships.find(rel => rel.id === item.relationshipId).type}`)).map(item => ({ kind: 'connection', id: item.id })),
        ...view.visualNodes.filter(item => types.has(`visualNode:${item.kind}`)).map(item => ({ kind: 'visualNode', id: item.id })),
        ...view.visualConnectors.filter(() => types.has('visualConnector:line')).map(item => ({ kind: 'visualConnector', id: item.id }))];
      cancel(); selectMany(selected); status(`В текущем представлении выбрано рисунков: ${selected.length}.`);
    }));
    for (const [direction, name] of [['front', 'На передний план'], ['back', 'На задний план'], ['forward', 'На уровень вперёд'], ['backward', 'На уровень назад']]) fields.append(button(`diagram-order-${direction}`, name, () => {
      if (!current(value)) { cancel(); return; }
      try { const out = reorderDrawings(model.store.snapshot, model.viewId, value.refs, direction); if (!out.changed) { cancel(); status('Порядок уже соответствует команде.'); return; } commit(value, out.snapshot); } catch (failure) { error.textContent = failure.message; }
    }));
    fields.append(button('diagram-router-settings','Маршрутизация представления…',()=>{cancel();router();}));
    fields.append(button('diagram-geometry', 'Положение и размер с клавиатуры…', () => { cancel(); geometry(); }), button('diagram-reverse', 'Инвертировать выбранные отношения…', () => { cancel(); reverse(); }), button('diagram-quick-linked', 'Создать элемент и отношение…', () => { cancel(); quickAdd(true); })); return true;
  }
  function geometry() {
    const refs = model.selections.filter(ref => ['occurrence', 'visualNode'].includes(ref.kind));
    if (refs.length !== 1) { status('Для точного размера выберите одну фигуру.'); return false; }
    const value = show('Положение и размер · Enter применить, Esc отменить', 'geometry'); if (!value) return false;
    value.ref = refs[0]; const original = drawingFor(model.view, value.ref); value.original = original;
    for (const [id, text] of [['x', 'X'], ['y', 'Y'], ['width', 'Ширина'], ['height', 'Высота']]) field(value, id, text, original.bounds[id], null, 'number');
    fields.append(button('diagram-standard-size','Стандартный / подходящий размер',()=>{if(!current(value)){cancel();return;}try{const bounds=standardDrawingBounds(model.store.snapshot,value.viewId,value.ref,readDefaults());for(const key of ['width','height'])value.controls[key].value=bounds[key];value.paint();}catch(failure){error.textContent=failure.message;}}),node('p','Стандарт: локальные размеры новых фигур; junction — 36 × 36; легенда — по сохранённым подписям, шрифту и столбцам. Размер учитывает детей. Текст следует выбранному режиму переноса или сокращения.'));
    field(value, 'edge', 'Клавиши стрелок', 'move', [['move', 'Перемещение'], ['left', 'Левая грань'], ['right', 'Правая грань'], ['top', 'Верхняя грань'], ['bottom', 'Нижняя грань']]);
    value.build = () => {
      if (!current(value)) throw new Error('Модель изменилась.'); const bounds = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(value.controls[key].value)]));
      if (!Object.values(bounds).every(Number.isFinite)) throw new Error('Введите конечные координаты и размеры.');
      const prepared=prepareDrawingBounds(model.store.snapshot,value.viewId,value.ref,bounds,readResizeBehavior());
      return prepared;
    };
    const paint = () => { try { const stage = value.build(); preview(stage.snapshot.views.find(entry => entry.view.id === value.viewId)); error.textContent = ''; } catch (failure) { error.textContent = failure.message; preview(model.view); } };
    value.abort = new window.AbortController(); fields.addEventListener('input', paint, { signal: value.abort.signal }); value.paint = paint;
    apply.focus();
    return true;
  }
  function router(){
    const value=show('Маршрутизация всего представления','router');if(!value)return false;
    const entry=model.store.snapshot.views.find(item=>item.view.id===value.viewId);value.original=entry.view.router??'manual';field(value,'router','Маршрутизация',value.original,[['manual','Ручная и сохранённые стили рисунков'],['orthogonal','Ортогональная для всех линий']]);fields.append(node('p','Изменяется только режим этого вида. Концы, якоря, изгибы и индивидуальные стили сохраняются; ручной режим восстанавливает их. Показ сохранённых изгибов и подписей управляется отдельным локальным переключателем.'));
    value.build=()=>{const next=value.controls.router.value;if(next===value.original)return{changed:false};const stage=createStore(model.store.snapshot);stage.execute({type:'setViewPresentation',viewId:value.viewId,router:next==='manual'?null:next},stage.revision);return{snapshot:stage.snapshot,changed:true};};return true;
  }
  function reverse() {
    const state = model.store.snapshot, view = model.view, ids = [...new Set(model.selections.filter(ref => ref.kind === 'connection').map(ref => view.connections.find(item => item.id === ref.id).relationshipId))];
    if (!ids.length && model.selection?.kind === 'relationship') ids.push(model.selection.id);
    if (!ids.length) { status('Выберите отношения или их соединения.'); return false; }
    const value = show('Изменить направление во всей модели?', 'reverse'); if (!value) return false;
    try {
      value.out = reverseRelationships(state, ids); fields.append(node('p', `Отношений: ${ids.length}; представлений: ${value.out.affectedViewIds.length}. Источник и цель, концы кратности и маршруты поменяются вместе.`));
      for (const item of value.out.decisions) fields.append(node('p', `${item.relationshipId}: ${item.status} · ${item.reason ?? ''}`));
      if (value.out.newBlockers.length) { apply.disabled = true; error.textContent = `Инверсия запрещена правилами: ${value.out.newBlockers.join('; ')}`; }
      if (value.out.unknownRelationshipIds.length) fields.append(node('p', 'UNKNOWN: разрешённость перечисленных отношений не подтверждена нормативным профилем.'));
    } catch (failure) { apply.disabled = true; error.textContent = failure.message; }
    return true;
  }
  function quickAdd(linked = false, point = lastPoint) {
    const value = show(linked ? 'Элемент и отношение' : 'Быстро добавить элемент', 'quick'); if (!value) return false;
    try { value.bounds = point ? { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10, width: readDefaults().width, height: readDefaults().height } : nextBounds(); } catch (failure) { cancel(); status(failure.message); return false; }
    const state=model.store.snapshot;
    fields.append(node('p', `Точка: ${value.bounds.x}, ${value.bounds.y}. Viewpoint: ${model.view.view.viewpointId ?? 'все типы'}.`));
    const order=field(value,'search-order','Сначала искать',readMagicOrder(),[['element-first','Элемент'],['relation-first','Отношение']]),ordered=node('div');fields.append(ordered);
    const search = field(value, 'search', 'Найти тип элемента', ''), type = field(value, 'type', 'Тип элемента', '', []), name = field(value, 'name', 'Название', 'Новый элемент'); name.required = true;
    const parents = [...model.view.occurrences.map(item => ['occurrence', item]), ...model.view.visualNodes.filter(item => item.kind === 'group').map(item => ['visualNode', item])];
    field(value, 'parent', 'Контейнер', '', [['', 'Без контейнера'], ...parents.map(([kind, item]) => [`${kind}:${item.id}`, `${kind === 'visualNode' ? item.name || 'Группа' : stateName(item)} · ${item.id.slice(-8)}`])]);
    const sources = model.view.occurrences.filter(item => item.concept.kind === 'element');
    const source = field(value, 'source', 'Отношение от объекта', '', [['', 'Без отношения'], ...sources.map(item => [item.id, stateName(item)])]);
    const selected = model.selection?.kind === 'occurrence' && sources.find(item => item.id === model.selection.id); if (linked && selected) source.value = selected.id;
    const relationshipSearch=field(value,'relationship-search','Найти тип отношения',''),relationship=field(value,'relationship','Тип отношения','',[]),reverse=field(value,'reverse','Направление','forward',[['forward','От выбранного к новому'],['reverse','От нового к выбранному']]);
    field(value, 'repeat', 'Повторять создание щелчком на полотне', false, null, 'checkbox');
    const assessment=node('div');assessment.id='diagram-combination-assessment';assessment.setAttribute('aria-live','polite');fields.append(assessment);
    const sourceTypes=new Map(sources.map(item=>[item.id,state.elements.find(element=>element.id===item.concept.id).type])),decisions=new Map();
    function decision(element,relation){if(!source.value||!element||!relation)return null;const key=`${source.value}:${reverse.value}:${element}:${relation}`;if(!decisions.has(key)){const known={kind:'element',type:sourceTypes.get(source.value)},created={kind:'element',type:element};decisions.set(key,evaluateConceptRelationship(modelProfiles,state.project.metamodel,{source:reverse.value==='reverse'?created:known,target:reverse.value==='reverse'?known:created,relationshipType:relation,scope:'direct'}));}return decisions.get(key);}
    const forbidden=result=>Boolean((getVerifiedRelationshipDecision(result)||getVerifiedConceptDecision(result))?.status==='FORBIDDEN');
    function fill(select,types,label){const previous=select.value;select.replaceChildren();for(const id of types){const option=node('option',label(id));option.value=id;select.append(option);}if(types.includes(previous))select.value=previous;}
    function paint(){
      const relationFirst=order.value==='relation-first',elementTypes=CURRENT_CATALOG.elementTypes.filter(id=>model.typeVisible('element',id)&&id.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())),relationTypes=CURRENT_CATALOG.relationshipTypes.filter(id=>model.typeVisible('relationship',id)&&id.toLocaleLowerCase().includes(relationshipSearch.value.toLocaleLowerCase()));
      for(const row of [source.parentElement,reverse.parentElement])fields.insertBefore(row,ordered);
      if(relationFirst){fill(relationship,relationTypes,id=>id);fill(type,elementTypes.filter(id=>!forbidden(decision(id,relationship.value))),id=>`${id}${source.value&&relationship.value?' · '+decision(id,relationship.value).status:''}`);ordered.replaceChildren(relationshipSearch.parentElement,relationship.parentElement,search.parentElement,type.parentElement);}
      else{fill(type,elementTypes,id=>id);fill(relationship,relationTypes.filter(id=>!forbidden(decision(type.value,id))),id=>`${id}${source.value&&type.value?' · '+decision(type.value,id).status:''}`);ordered.replaceChildren(search.parentElement,type.parentElement,relationshipSearch.parentElement,relationship.parentElement);}
      const result=decision(type.value,relationship.value);assessment.replaceChildren(node('p',source.value?(result?`${type.value} / ${relationship.value}: ${result.status} · ${assessmentMessage(result.reason)}. ${result.status==='UNKNOWN'?'Нормативное разрешение не подтверждено.':''}`:'Нет подходящей комбинации выбранных типов и viewpoint.'):'Создаст только новый элемент и его рисунок. Отношение не выбрано.'));if(result)renderAssessmentEvidence(document,assessment,result,{sourceType:reverse.value==='reverse'?type.value:sourceTypes.get(source.value),relationshipType:relationship.value,targetType:reverse.value==='reverse'?sourceTypes.get(source.value):type.value,sourceKind:'element',targetKind:'element'});
      apply.disabled=!type.options.length||Boolean(source.value&&(!relationship.options.length||forbidden(result)));
    }
    for(const input of [search,relationshipSearch])input.addEventListener('input',paint);for(const input of [order,type,relationship,source,reverse])input.addEventListener('change',paint);paint();
    value.read = () => ({ viewId: value.viewId, elementType: type.value, name: name.value, bounds: value.bounds, parent: value.controls.parent.value ? { kind: value.controls.parent.value.split(':')[0], id: value.controls.parent.value.split(':')[1] } : null,
      sourceOccurrenceId: source.value || null, relationshipType: source.value ? relationship.value : null, reverse: reverse.value === 'reverse' });
    (order.value==='relation-first'?relationshipSearch:search).focus();return true;
  }
  function stateName(item) { const concept = model.store.snapshot[item.concept.kind === 'element' ? 'elements' : 'junctions'].find(value => value.id === item.concept.id); return concept.name || concept.type; }
  form.addEventListener('submit', event => {
    event.preventDefault(); const value = request; if (!value || apply.disabled || value.mode === 'tools') return;
    if (!current(value)) { cancel(); status('Контекст изменился. Начните действие заново.'); return; }
    try {
      if (value.mode === 'geometry') { const stage = value.build(); if (!stage.changed) { cancel(); status('Геометрия не изменилась.'); } else commit(value, stage.snapshot); }
      else if(value.mode==='router'){const stage=value.build();if(!stage.changed){cancel();status('Маршрутизация уже выбрана.');}else commit(value,stage.snapshot,null,'Режим маршрутизации вида изменён · один шаг отмены.');}
      else if (value.mode === 'reverse') { if (!value.out.newBlockers.length) commit(value, value.out.snapshot); }
      else if (value.mode === 'quick') { const out = create(model.store.snapshot, value.read()); commit(value, out.snapshot, { kind: 'occurrence', id: out.created.occurrenceId }); }
    } catch (failure) { error.textContent = `Не применено: ${failure.message}`; }
  });
  fields.addEventListener('input', () => generation++); fields.addEventListener('change', () => generation++);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') return;
    const value = request; if (value?.mode !== 'geometry' || event.target.closest('input,textarea,select') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? 1 : 10, edge = value.controls.edge.value, dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const change = (key, amount) => value.controls[key].value = Number(value.controls[key].value) + amount;
    if (edge === 'move') { change('x', dx); change('y', dy); }
    else if (edge === 'left') { change('x', dx); change('width', -dx); }
    else if (edge === 'right') change('width', dx);
    else if (edge === 'top') { change('y', dy); change('height', -dy); } else change('height', dy);
    generation++; value.paint();
  });
  canvas.addEventListener('pointermove', event => { if (!repeated && !request) lastPoint = canvasDropPoint(canvas, event.clientX, event.clientY, window) ?? lastPoint; });
  canvas.addEventListener('pointerdown', event => {
    if (!repeated && event.altKey && event.button===0 && event.isPrimary && !event.target.closest('[data-id]') && readQuickAdd()) {
      if(blocked())return;const point=canvasDropPoint(canvas,event.clientX,event.clientY,window);if(!point)return;event.preventDefault();event.stopImmediatePropagation();quickAdd(false,point);return;
    }
    if (!repeated || event.button !== 0 || !event.isPrimary) return; event.preventDefault(); event.stopImmediatePropagation();
    if (!current(repeated)) { cancel(); status('Контекст изменился, повторение завершено.'); return; }
    const point = canvasDropPoint(canvas, event.clientX, event.clientY, window); if (!point) return;
    try { const out = create(model.store.snapshot, { ...repeated, bounds: { ...repeated.bounds, x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 } }); model.execute({ type: 'applyProjectSnapshot', files: out.files }, repeated.revision); repeated.revision = model.store.revision; model.select({ kind: 'occurrence', id: out.created.occurrenceId }); render(); status('Создан следующий объект. Esc завершает повторение.'); } catch (failure) { status(failure.message); }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (event.key === 'Escape' && repeated) { event.preventDefault(); cancel(); return; }
    if (event.key === 'Insert' && event.target.closest('#canvas')) { event.preventDefault(); quickAdd(event.shiftKey); }
  }, true);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => { request?.abort && request.abort.abort(); if (request) { const dirty = request.mode === 'geometry'; request = null; generation++; if (dirty) preview(model.view); } });
  window.addEventListener('blur', () => { if (repeated) cancel(); });
  return { tools, quickAdd, geometry, reverse, cancel, refresh() { trigger.disabled = quick.disabled = !model.view; if (request && !current(request) || repeated && !current(repeated)) cancel(); }, get active() { return Boolean(request || repeated); }, get generation() { return generation; } };
}
