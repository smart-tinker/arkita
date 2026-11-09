import {imageDimensions,proportionateBounds} from './image-dimensions.js';
import { legendColorFields } from './legend-color-fields.js';
import { legendLabelFields } from './legend-label-fields.js';
import {prepareDrawingBounds} from './resize-preferences.js';
import { createStore, exportFiles, DRAWING_COLLECTIONS, LIMITS, ASSET_LIMITS, assetUsages } from '../../schemka-model-core/src/index.js';
import { newId } from '../../schemka-model-core/src/format.js';
import { creationTypes, relationshipAssessment } from './profile-ui.js';
import { canvasDropPoint } from './drag-drop.js';

const names = { note: 'Заметка', group: 'Группа', legend: 'Легенда', viewReference: 'Ссылка на представление', image: 'Изображение' };
const lineKind = kind => ['connection', 'visualConnector'].includes(kind);
const gridPoint = point => point && ({ x: Math.round(point.x * 10) / 10 || 0, y: Math.round(point.y * 10) / 10 || 0 });
const refKey = ref => `${ref.kind}:${ref.id}`;

/** Versioned drawing drafts stay outside the model until one complete user action commits. */
export function installVisualsUI({ document, window, model, readDefaults = () => ({}), readResizeBehavior = () => 'retain', canvas, openDialog, render, status, blocked = () => false, beforeChange = () => {}, nextBounds = () => ({ x: 80, y: 80, width: 220, height: 120 }), openMetadata = () => {}, activateView = id => model.switchView(id) }) {
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  const button = (id, text, action) => { const item = node('button', text); item.id = id; item.type = 'button'; item.addEventListener('click', action); return item; };
  const section = node('details', undefined, 'palette-domain visual-tools'), summary = node('summary', 'Аннотации и оформление'), tools = node('div', undefined, 'visual-tool-grid'); section.id = 'visual-tools'; section.append(summary, tools);
  document.getElementById('catalogue-palette').prepend(section);
  const dialog = node('dialog', undefined, 'visual-dialog'), form = node('form'), heading = node('h2'), reference = node('p', '', 'inspector-note'), fields = node('div', undefined, 'visual-fields'), error = node('p', '', 'error'), actions = node('div', undefined, 'dialog-actions');
  dialog.id = 'visual-dialog'; form.id = 'visual-form'; form.noValidate = true; heading.id = 'visual-heading'; reference.id = 'visual-reference'; fields.id = 'visual-fields'; error.id = 'visual-error'; error.setAttribute('role', 'alert'); dialog.setAttribute('aria-labelledby', heading.id); dialog.setAttribute('aria-describedby', reference.id);
  const apply = node('button', 'Применить'); apply.id = 'visual-apply'; apply.type = 'submit';
  actions.append(button('visual-cancel', 'Отмена', () => cancel()), apply); form.append(heading, reference, fields, error, actions); dialog.append(form); document.body.append(dialog);
  let pending = null, generation = 0, armed = false, gesture = null, brush = null, trigger = null;
  const controls = {};
  const capture = mode => ({ mode, store: model.store, revision: model.store.revision, viewId: model.viewId });
  const current = request => request && request.store === model.store && request.revision === model.store.revision && request.viewId === model.viewId;
  const drawing = (state, ref) => state.views.find(entry => entry.view.id === model.viewId)?.[DRAWING_COLLECTIONS[ref?.kind]]?.find(item => item.id === ref.id);
  const selection = () => model.selection && DRAWING_COLLECTIONS[model.selection.kind] ? model.selection : null;
  function clearGesture() {
    const prior = gesture; gesture = null; armed = false; generation++; connectorButton.setAttribute('aria-pressed', 'false'); canvas.classList.remove('visual-link-armed'); prior?.line.remove();
    if (prior) try { if (canvas.hasPointerCapture(prior.pointerId)) canvas.releasePointerCapture(prior.pointerId); } catch { /* Pointer capture may already have ended. */ }
  }
  function cancel() {
    const active = Boolean(pending || dialog.open || armed || gesture); pending = null; generation++; clearGesture();
    if (dialog.open) dialog.close(); return active;
  }
  function show(mode, title) {
    if (blocked() || pending || !model.view) return null;
    const request = capture(mode); trigger = document.activeElement;
    fields.replaceChildren(); for (const key of Object.keys(controls)) delete controls[key]; error.textContent = ''; heading.textContent = title; reference.textContent = ''; apply.hidden = false; apply.disabled = false;
    try { openDialog(dialog.id); if (!dialog.open) throw new Error('Диалог не открылся'); }
    catch (failure) { status(failure.message); return null; }
    pending = request; generation++; return request;
  }
  function usable(request = pending) {
    if (current(request) && pending === request && dialog.open) return true;
    cancel(); status('Модель или представление изменились. Черновик отменён.'); return false;
  }
  function field(key, title, value = '', type = 'text', choices = null, host = fields) {
    const label = node('label', title), input = node(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input'); input.id = `visual-${key}`;
    if (choices) for (const [value, text] of choices) { const option = node('option', text); option.value = value; input.append(option); }
    else if (type === 'textarea') { input.rows = key === 'text' ? 5 : 2; input.maxLength = LIMITS.string; }
    else { input.type = type; if (type === 'number') { input.step = '0.1'; input.min = '-1000000'; input.max = '1000000'; } else input.maxLength = LIMITS.string; }
    input.value = value ?? ''; label.append(input); host.append(label); controls[key] = input; return input;
  }
  const assetChoices = () => [['', 'Без изображения'], ...model.store.snapshot.assets.map(asset => [asset.id, asset.name || 'Без имени'])];
  function commit(request, build, message, selected = null) {
    if (!usable(request)) return false;
    try {
      const stage = createStore(model.store.snapshot), run = command => stage.execute(command, stage.revision), result = build(run, stage);
      if (!stage.history.undo) throw new Error('Оформление уже совпадает.');
      beforeChange(); pending = null; dialog.close(); clearGesture();
      model.execute({ type: 'applyProjectSnapshot', files: stage.exportFiles() }, request.revision);
      const ref = typeof selected === 'function' ? selected(result) : selected; if (ref) model.select(ref);
      render(); status(message); return true;
    } catch (failure) {
      if (current(request) && dialog.open) pending = request;
      error.textContent = `Не сохранено: ${failure.message}`; if (!dialog.open) status(error.textContent); return false;
    }
  }
  function numeric(key) { const value = controls[key].value; if (value.trim() === '') throw new Error('Заполните геометрию рисунка.'); return Number(value); }
  function nodeEditor(kind, ref = null, position = null) {
    const state = model.store.snapshot, original = ref && drawing(state, ref), request = show('node', original ? `Изменить: ${names[kind]}` : `Добавить: ${names[kind]}`); if (!request) return false;
    request.kind = kind; request.ref = ref; request.original = original && structuredClone(original); request.upload = null;
    const initial = original?.bounds ?? { ...nextBounds(), ...(position ? { x: position.x, y: position.y } : {}), width: kind === 'legend' ? 300 : readDefaults().width??220, height: kind === 'legend' ? 240 : readDefaults().height??120 };
    field('name', 'Название', original?.name ?? (kind === 'note' ? '' : names[kind]), 'textarea');
    if(['note','group'].includes(kind))field('instruction','Инструкция (Markdown)',original?.instruction??'','textarea');
    if (kind === 'note') field('text', 'Текст заметки', original?.text ?? '', 'textarea');
    if (kind === 'viewReference') {
      field('target-view','Целевое представление',original?.targetViewId??state.views.find(entry=>entry.view.id!==model.viewId)?.view.id??model.viewId,'text',state.views.map(entry=>[entry.view.id,entry.view.name||'Без названия']));
      const targetFields=node('fieldset');targetFields.append(node('legend','Общие данные целевого представления'));fields.append(targetFields);field('target-edit','Изменить общие данные цели','false','text',[['false','Нет — изменяется только эта ссылка'],['true','Да — для всех ссылок на это представление']],targetFields);field('target-name','Название целевого представления','','textarea',null,targetFields);field('target-documentation','Документация целевого представления','','textarea',null,targetFields);
      const loadTarget=()=>{request.targetOriginal=state.views.find(entry=>entry.view.id===controls['target-view'].value)?.view;controls['target-edit'].value='false';for(const[key,property]of [['target-name','name'],['target-documentation','documentation']]){controls[key].value=request.targetOriginal?.[property]??'';controls[key].disabled=true;}request.targetInitial={name:controls['target-name'].value,documentation:controls['target-documentation'].value};};loadTarget();controls['target-view'].addEventListener('change',loadTarget);controls['target-edit'].addEventListener('change',()=>{controls['target-name'].disabled=controls['target-documentation'].disabled=controls['target-edit'].value!=='true';});
    }
    if (kind === 'image') {
      field('asset', 'Изображение модели', original?.assetId ?? '', 'text', assetChoices());
      const upload = field('upload', 'Или выбрать файл', '', 'file'); upload.accept = '.png,.jpg,.jpeg,.webp,.svg';
      upload.addEventListener('change', () => readUpload(upload.files?.[0], request));
      reference.textContent = 'Изображение хранится внутри модели. Выбор файла до подтверждения не меняет модель.';
    }
    if (kind === 'legend') {
      const legend = original?.legend ?? readDefaults().legend ?? { sort: 'type', columns: 1, showRelationships: false, colorScheme: 'notation', autoSize: true };
      field('legend-sort', 'Сортировка', legend.sort, 'text', [['type', 'По типу'], ['name', 'По названию']]);
      field('legend-columns', 'Столбцов', legend.columns, 'number'); controls['legend-columns'].min = '1'; controls['legend-columns'].max = '8'; controls['legend-columns'].step = '1';
      field('legend-colors', 'Цветовая схема', legend.colorScheme ?? 'notation', 'text', [['notation', 'Цвета нотации'], ['monochrome', 'Монохромная'], ['pastel', 'Пастельная']]);
      field('legend-width', 'Ширина столбца (необязательно)', legend.columnWidth ?? '', 'number');
      field('legend-rows','Строк в столбце (пусто — по числу столбцов)',legend.rowsPerColumn||'','number');controls['legend-rows'].min='1';controls['legend-rows'].max='100';controls['legend-rows'].step='1';request.legendLabels=legendLabelFields(document,fields,legend.labels??[],'visual-legend');
      field('legend-elements','Включать типы элементов и junctions',String(legend.showElements!==false),'text',[['true','Да'],['false','Нет']]);field('legend-specializations','Включать специализации',String(legend.showSpecializations===true),'text',[['false','Нет'],['true','Да']]);request.legendColors=legendColorFields(document,fields,legend.colors??[],state.customizationProfiles??[],'visual-legend');
      field('legend-relationships', 'Включать отношения', String(legend.showRelationships), 'text', [['false', 'Нет'], ['true', 'Да']]);
      field('legend-autosize', 'Автоматический размер', String(legend.autoSize ?? true), 'text', [['true', 'Да'], ['false', 'Нет']]);
    }
    const geometry = node('fieldset', undefined, 'visual-geometry'); geometry.append(node('legend', 'Расположение в представлении')); fields.append(geometry);
    for (const [key, title] of [['x', 'X'], ['y', 'Y'], ['width', 'Ширина'], ['height', 'Высота']]) field(key, title, initial[key], 'number', null, geometry);
    if(kind==='image'){
      const linked=field('keep-proportions','Сохранять пропорции ресурса','true','text',[['true','Да'],['false','Свободный размер']],geometry),size=()=>{const asset=controls.asset.value==='$upload'?request.upload:state.assets.find(item=>item.id===controls.asset.value);return imageDimensions(asset,window);};
      const scale=changed=>{try{const result=proportionateBounds({width:numeric('width'),height:numeric('height')},size(),changed);controls[changed==='width'?'height':'width'].value=result[changed==='width'?'height':'width'];}catch(failure){error.textContent=failure.message;}};
      controls.width.addEventListener('input',()=>{if(linked.value==='true')scale('width');});controls.height.addEventListener('input',()=>{if(linked.value==='true')scale('height');});
      geometry.append(button('visual-restore-aspect','Восстановить пропорции по ширине',()=>{if(usable(request)){scale('width');generation++;}}),button('visual-clear-image','Снять изображение, сохранить объект',()=>{if(!usable(request))return;controls.asset.value='';request.upload=null;reference.textContent='Изображение будет снято после подтверждения. Название, свойства, документация и положение сохранятся.';generation++;}));
    }
    const entry = state.views.find(entry => entry.view.id === model.viewId), parents = [['', 'Без контейнера']];
    for (const item of entry.occurrences) { const collection = item.concept.kind === 'junction' ? state.junctions : state.elements, concept = collection.find(concept => concept.id === item.concept.id); parents.push([`occurrence:${item.id}`, concept?.name || concept?.type || 'Объект']); }
    for (const item of entry.visualNodes) if (item.kind === 'group' && item.id !== ref?.id) parents.push([`visualNode:${item.id}`, item.name || 'Группа']);
    field('parent', 'Геометрический контейнер', original?.parent ? refKey(original.parent) : '', 'text', parents);
    if (original) {
      const actions = node('div', undefined, 'visual-inline-actions');
      actions.append(button('visual-metadata', 'Документация и свойства…', () => { if (!usable(request)) return; const owner = { kind: 'visualNode', viewId: request.viewId, id: ref.id }; cancel(); openMetadata(owner); }),
        button('visual-delete', 'Удалить…', () => { if (!usable(request)) return; cancel(); confirmDelete(ref); })); fields.append(actions);
    }
    request.initial = { name: controls.name.value, text: controls.text?.value,instruction:controls.instruction?.value };
    controls.name.focus(); return true;
  }
  function connectorEditor(ref) {
    const item = drawing(model.store.snapshot, ref), request = show('connector', 'Визуальный соединитель'); if (!request || !item) return false;
    request.ref = ref; request.original = structuredClone(item); field('name', 'Подпись', item.name, 'textarea'); request.initial = { name: controls.name.value }; reference.textContent = 'Аннотация. Концы меняются перетаскиванием нового визуального соединителя.';
    fields.append(button('visual-metadata', 'Документация и свойства…', () => { if (!usable(request)) return; cancel(); openMetadata({ kind: 'visualConnector', viewId: request.viewId, id: ref.id }); }), button('visual-delete', 'Удалить…', () => { if (!usable(request)) return; cancel(); confirmDelete(ref); })); return true;
  }
  function confirmDelete(ref) {
    const impact = model.drawingImpact(ref), request = show('delete', 'Удалить рисунок?'); if (!request) return;
    request.ref = ref; reference.textContent = 'Дочерние рисунки контейнера останутся на прежних местах. Связи с удаляемыми концами будут удалены.';
    fields.append(node('p', `Зависимых линий: ${(impact.connectionIds?.length ?? 0) + (impact.visualConnectorIds?.length ?? 0)}.`)); apply.textContent = 'Удалить';
  }
  function removeSelected() { const ref = selection(); if (!ref || !['visualNode', 'visualConnector'].includes(ref.kind) || blocked()) return false; confirmDelete(ref); return Boolean(pending); }
  function editSelected() { const ref = selection(), item = ref && drawing(model.store.snapshot, ref); if (!item) return false; return ref.kind === 'visualNode' ? nodeEditor(item.kind, ref) : ref.kind === 'visualConnector' ? connectorEditor(ref) : false; }
  function styleSelected() {
    const ref = selection(), item = ref && drawing(model.store.snapshot, ref), request = show('style', 'Оформление рисунка'); if (!request || !item) { if (request) cancel(); return false; }
    request.ref = ref; request.original = structuredClone(item); const style = item.style, line = lineKind(ref.kind);
    reference.textContent = 'Изменения относятся к этому рисунку'+(model.selections.length>1?' — только к опорному, а не всему выделению':'')+'. Пустое поле сбрасывает только своё значение к умолчанию.';
    const color = (key, title) => { const input = field(key, title, style[key] ?? ''); input.placeholder = '#AABBCC или none'; input.maxLength = 11; };
    if (!line) {
      color('fill', 'Заливка'); field('fillOpacity', 'Непрозрачность (0–1)', style.fillOpacity ?? '', 'number'); controls.fillOpacity.min = '0'; controls.fillOpacity.max = '1';
      field('gradient-color', 'Второй цвет градиента', style.gradient?.color ?? ''); field('gradient-direction', 'Градиент', style.gradient?.direction ?? '', 'text', [['', 'Без градиента'], ['vertical', 'Вертикальный'], ['horizontal', 'Горизонтальный']]);
      color('iconColor', 'Цвет значка'); field('iconVisible', 'Малый значок (авто — при отсутствии изображения)', style.iconVisible === undefined ? '' : String(style.iconVisible), 'text', [['', 'По умолчанию'], ['true', 'Показывать'], ['false', 'Скрыть']]);
      field('shape', 'Форма рамки', style.shape ?? '', 'text', [['', 'По умолчанию'], ['default', 'Основная'], ['rectangle', 'Прямоугольник'], ['rounded', 'Скруглённая'], ['ellipse', 'Эллипс'], ['folded', 'С загнутым углом'], ...(ref.kind === 'visualNode' ? [['actor', 'Человек']] : [])]);
      field('verticalAlign', 'Положение текста', style.verticalAlign ?? '', 'text', [['', 'По умолчанию'], ['top', 'Сверху'], ['middle', 'В центре'], ['bottom', 'Снизу']]);
      field('imageVisible','Изображение',style.imageVisible===undefined?'':String(style.imageVisible),'text',[['','Наследовать / автоматически'],['true','Показывать выбранное или изображение профиля'],['false','Без изображения в этом рисунке']]);
      field('image-asset', 'Локальное изображение', style.image?.assetId ?? '', 'text', assetChoices());
      field('image-fit', 'Размер изображения', style.image?.fit ?? 'contain', 'text', [['contain', 'Вместить'], ['cover', 'Заполнить'], ['stretch', 'Растянуть']]);
      field('image-position', 'Положение изображения', style.image?.position ?? 'center', 'text', [['center', 'По центру'], ['top', 'Сверху'], ['bottom', 'Снизу'], ['left', 'Слева'], ['right', 'Справа']]);
    } else {
      field('crossing', 'Пересечения линий', style.crossing ?? '', 'text', [['', 'По умолчанию'], ['none', 'Без перехода'], ['jump', 'Мостик']]);
      field('labelBackgroundMode', 'Фон подписи линии', style.labelBackgroundMode ?? '', 'text', [['', 'По умолчанию'], ['transparent', 'Прозрачный'], ['opaque', 'Сплошной фон'], ['clip', 'Прервать линии под подписью']]);
      field('labelAnchor','Привязка подписи',style.labelAnchor??'','text',[['','По умолчанию / ручная позиция'],['source','У источника'],['middle','В середине'],['target','У приёмника']]);fields.append(node('p','Ручная позиция подписи при включённой сохранённой геометрии имеет приоритет. Смещение ниже применяется к выбранной точке маршрута.'));
      field('lineStyle', 'Маршрут', style.lineStyle ?? '', 'text', [['', 'По умолчанию'], ['direct', 'Прямой'], ['orthogonal', 'Ортогональный'], ['rounded', 'Скруглённый']]);
      const endings = [['', 'По умолчанию'], ['none', 'Без окончания'], ['arrow', 'Стрелка'], ['triangle', 'Треугольник'], ['diamond', 'Ромб'], ['circle', 'Круг']];
      if (ref.kind === 'connection') { field('hideWhenNested', 'Скрывать при вложении концов', style.hideWhenNested === undefined ? '' : String(style.hideWhenNested), 'text', [['', 'По умолчанию'], ['false', 'Нет'], ['true', 'Да']]); fields.append(node('p', 'Это способ отображения существующей связи. Геометрическое вложение само по себе не подтверждает её семантику.')); }
      if(ref.kind==='visualConnector'){field('sourceEnding', 'Начало линии', style.sourceEnding ?? '', 'text', endings); field('targetEnding', 'Конец линии', style.targetEnding ?? '', 'text', endings);}else if(['strokeDash','sourceEnding','targetEnding'].some(key=>Object.hasOwn(style,key)))fields.append(node('p','Сохранённые пользовательские значения пунктира и окончаний сохраняются, но не применяются: смысловые обозначения определяет тип отношения.'));
    }
    color('stroke', 'Цвет контура'); if (!line) field('strokeFromFill', 'Контур связан с заливкой', style.strokeFromFill === undefined ? '' : String(style.strokeFromFill), 'text', [['', 'По умолчанию'], ['false', 'Собственный цвет'], ['true', 'Цвет заливки']]);
    field('strokeWidth', 'Толщина линии', style.strokeWidth ?? '', 'number'); controls.strokeWidth.min = '0'; controls.strokeWidth.max = '20';
    if(ref.kind!=='connection')field('strokeDash', 'Штрих', style.strokeDash ?? '', 'text', [['', 'По умолчанию'], ['solid', 'Сплошной'], ['dash', 'Штриховой'], ['dot', 'Точечный']]);
    field('fontFamily', 'Шрифт', style.fontFamily ?? ''); field('fontSize', 'Размер шрифта', style.fontSize ?? '', 'number'); controls.fontSize.min = '6'; controls.fontSize.max = '96';
    field('fontWeight', 'Начертание', style.fontWeight ?? '', 'text', [['', 'По умолчанию'], ['normal', 'Обычное'], ['bold', 'Полужирное']]); color('textColor', 'Цвет текста');
    field('textAlign', 'Выравнивание текста', style.textAlign ?? '', 'text', [['', 'По умолчанию'], ['left', 'Слева'], ['center', 'По центру'], ['right', 'Справа']]);
    field('labelTemplate', 'Шаблон подписи', style.labelTemplate ?? '', 'textarea'); request.initialTemplate = controls.labelTemplate.value; controls.labelTemplate.placeholder = '${name} · ${property:owner}';
    field('labelVisible', 'Подпись', style.labelVisible === undefined ? '' : String(style.labelVisible), 'text', [['', 'По умолчанию'], ['true', 'Показывать'], ['false', 'Скрыть']]);
    if (line) { color('labelBackground', 'Фон подписи'); field('label-x', 'Смещение подписи X', style.labelOffset?.x ?? '', 'number'); field('label-y', 'Смещение подписи Y', style.labelOffset?.y ?? '', 'number'); }
    const extra = node('div', undefined, 'visual-inline-actions'); extra.append(button('visual-style-reset', 'Сбросить оформление', () => commit(request, run => run({ type: 'resetDrawingStyle', viewId: request.viewId, drawing: ref }), 'Оформление сброшено · можно отменить.')),
      button('visual-style-copy', 'Скопировать оформление', () => { if (!usable(request)) return; brush = { line, style: structuredClone(style) }; cancel(); refresh(); status('Оформление скопировано. Выберите другой рисунок и примените его.'); })); fields.append(extra); return true;
  }
  function hierarchySelected() {
    const ref = selection(), item = ref && drawing(model.store.snapshot, ref); if (!item?.bounds) return false;
    const state = model.store.snapshot, entry = state.views.find(entry => entry.view.id === model.viewId), request = show('hierarchy', 'Контейнер и смысловая связь'); if (!request) return false;
    request.ref = ref; const parents = [['', 'Без контейнера']];
    for (const parent of entry.occurrences) if (parent.id !== ref.id) { const concept = state[parent.concept.kind === 'junction' ? 'junctions' : 'elements'].find(item => item.id === parent.concept.id); parents.push([`occurrence:${parent.id}`, concept.name || concept.type]); }
    for (const parent of entry.visualNodes) if (parent.kind === 'group' && parent.id !== ref.id) parents.push([`visualNode:${parent.id}`, parent.name || 'Группа']);
    const parent = field('parent', 'Геометрический контейнер', item.parent ? refKey(item.parent) : '', 'text', parents);
    reference.textContent = 'Рисунок останется на прежнем месте. Вложенность не создаёт отношения автоматически.';
    const semantic = node('fieldset'); semantic.append(node('legend', 'Отношение ArchiMate — только по явному выбору')); fields.append(semantic);
    field('nesting-direction', 'Направление', 'parent-child', 'text', [['parent-child', 'Контейнер → объект'], ['child-parent', 'Объект → контейнер']], semantic);
    const relation = field('nesting-relation', 'Отношение', '', 'text', [['', 'Только геометрическое вложение']], semantic), explanation = node('p', '', 'inspector-note'); explanation.id = 'visual-nesting-impact'; semantic.append(explanation);
    field('nesting-hide', 'Показывать линию', 'false', 'text', [['false', 'Показывать'], ['true', 'Скрывать, пока концы вложены']], semantic);
    const choices = () => {
      const parentRef = parent.value ? { kind: parent.value.split(':')[0], id: parent.value.split(':')[1] } : null;
      const parentNode = parentRef && drawing(state, parentRef); semantic.hidden = !(ref.kind === 'occurrence' && parentRef?.kind === 'occurrence');
      relation.replaceChildren(); const option = (value, text, disabled = false) => { const item = node('option', text); item.value = value; item.disabled = disabled; relation.append(item); };
      option('', 'Только геометрическое вложение'); request.relations = new Map();
      if (semantic.hidden || !parentNode) return;
      const source = controls['nesting-direction'].value === 'parent-child' ? parentNode.concept : item.concept, target = controls['nesting-direction'].value === 'parent-child' ? item.concept : parentNode.concept;
      request.endpoints = controls['nesting-direction'].value === 'parent-child' ? { source: parentRef, target: ref } : { source: ref, target: parentRef };
      for (const existing of state.relationships.filter(record => record.source.kind === source.kind && record.source.id === source.id && record.target.kind === target.kind && record.target.id === target.id)) {
        const value = `existing:${existing.id}`; option(value, `Использовать ${existing.type}${existing.label ? ' · ' + existing.label : ''}`); request.relations.set(value, { existing });
      }
      for (const type of creationTypes(state.project.metamodel, 'relationship')) {
        const decision = relationshipAssessment(state, { type, source, target }), value = `new:${type}`;
        option(value, `Создать ${type} · ${decision.status}`, decision.status === 'FORBIDDEN'); request.relations.set(value, { type, decision });
      }
      explanation.textContent = 'Проверяются типы концов по правилам ArchiMate 4. Семантическая допустимость самого вложения отдельно не подтверждена.';
    };
    parent.addEventListener('change', choices); controls['nesting-direction'].addEventListener('change', choices);
    relation.addEventListener('change', () => {
      const choice = request.relations.get(relation.value);
      if (choice?.existing) { const uses = state.views.filter(entry => entry.connections.some(item => item.relationshipId === choice.existing.id)).length; explanation.textContent = `Общее отношение уже используется в ${uses} представлениях. Изменяется рисунок только в этом виде; ID отношения сохранится.`; }
      else explanation.textContent = choice ? `${choice.decision.status}: ${choice.decision.reason}. Это оценка типов концов, а не автоматическое доказательство смысла вложения.` : 'Будет изменён только геометрический контейнер.';
    }); choices(); return true;
  }
  function toggleLock() { const ref = selection(), item = ref && drawing(model.store.snapshot, ref); if (!item || blocked()) return false; const request = show('lock', item.locked ? 'Разблокировать рисунок?' : 'Заблокировать рисунок?'); if (!request) return false; request.ref = ref; request.locked = !item.locked; fields.append(node('p', request.locked ? 'Геометрия, оформление и удаление будут защищены до явной разблокировки. Метаданные останутся доступны.' : 'После разблокировки можно менять геометрию, оформление и удалять рисунок.')); return true; }
  function readStyle() {
    const style = pending?.ref?.kind==='connection'?Object.fromEntries(['strokeDash','sourceEnding','targetEnding'].filter(key=>Object.hasOwn(pending.original.style,key)).map(key=>[key,pending.original.style[key]])):{};
    for (const key of ['fill', 'stroke', 'strokeDash', 'fontFamily', 'fontWeight', 'textColor', 'textAlign', 'verticalAlign', 'iconColor', 'shape', 'labelTemplate', 'labelBackground', 'lineStyle', 'sourceEnding', 'targetEnding', 'crossing', 'labelBackgroundMode', 'labelAnchor']) if (controls[key]?.value !== undefined && controls[key].value !== '') style[key] = controls[key].value;
    for (const key of ['fillOpacity', 'strokeWidth', 'fontSize']) if (controls[key]?.value !== undefined && controls[key].value !== '') style[key] = Number(controls[key].value);
    for (const key of ['iconVisible', 'imageVisible', 'labelVisible', 'strokeFromFill', 'hideWhenNested']) if (controls[key]?.value !== undefined && controls[key].value !== '') style[key] = controls[key].value === 'true';
    if (controls['gradient-direction']?.value) style.gradient = { color: controls['gradient-color'].value, direction: controls['gradient-direction'].value };
    if (controls['image-asset']?.value) style.image = { assetId: controls['image-asset'].value, fit: controls['image-fit'].value, position: controls['image-position'].value };
    if (controls['label-x'] && (controls['label-x'].value !== '' || controls['label-y'].value !== '')) style.labelOffset = { x: Number(controls['label-x'].value || 0), y: Number(controls['label-y'].value || 0) };
    return style;
  }
  function applyBrush() {
    if (!brush || blocked()) return;
    const refs = model.selections.filter(ref => DRAWING_COLLECTIONS[ref.kind]);
    if (!refs.length || refs.some(ref => lineKind(ref.kind) !== brush.line)) { status('Выберите рисунки того же вида: узлы или линии.'); return; }
    const request = show('brush', 'Применить оформление?'); if (!request) return;
    request.refs = refs; fields.append(node('p', `Оформление будет заменено у ${refs.length} рисунков. Одна отмена восстановит их прежний вид.`));
  }
  async function readUpload(file, request, position = null) {
    if (!file || !usable(request)) return;
    const token = ++generation;
    try {
      if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > Math.floor(LIMITS.fileBytes * 3 / 4) - 1024) throw new Error('Файл слишком большой. Выберите изображение меньше 191 КБ.');
      const type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' })[file.name?.split('.').at(-1).toLowerCase()] ?? file.type;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== generation || !usable(request) || bytes.length !== file.size) return;
      let binary = ''; for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.slice(at, at + 8192));
      const upload = { name: file.name || 'Изображение', mediaType: type, data: btoa(binary) };
      const stage = createStore(model.store.snapshot); stage.execute({ type: 'createAsset', ...upload }, stage.revision);
      if (request.mode === 'assets') {
        if (commit(request, run => run({ type: 'createAsset', ...upload }), 'Изображение добавлено в модель · можно отменить.')) assets();
      } else {
        request.upload = upload;
        const option = node('option', `${upload.name} · новый файл`); option.value = '$upload'; controls.asset.querySelector('option[value="$upload"]')?.remove(); controls.asset.append(option); controls.asset.value = '$upload';
        reference.textContent = `${upload.name}. Будет добавлено вместе с рисунком после подтверждения.`;
      }
    } catch (failure) { if (current(request) && pending === request) error.textContent = `Изображение не добавлено: ${failure.message}`; }
    finally { if (pending === request && controls.upload) controls.upload.value = ''; }
  }
  function assets(page=0) {
    if(!Number.isInteger(page))page=0;
    const request = show('assets', 'Изображения модели'); if (!request) return false;
    apply.hidden = true; reference.textContent = `PNG, JPEG, WebP и безопасный SVG. До ${ASSET_LIMITS.dimension} пикселей по стороне, 16 Мп на изображение. Ресурсы переносятся вместе с моделью.`;
    const upload = field('upload', 'Добавить изображение', '', 'file'); upload.accept = '.png,.jpg,.jpeg,.webp,.svg'; upload.addEventListener('change', () => readUpload(upload.files?.[0], request));
    const specializations = (model.store.snapshot.customizationProfiles ?? []).filter(profile => profile.purpose === 'specialization');
    if (specializations.length) field('asset-profile', 'Специализация для общего изображения', '', 'text', [['', 'Не выбрана'], ...specializations.map(profile => [profile.id, profile.name])]);
    const list = node('ul', undefined, 'visual-assets'); list.id = 'visual-assets'; fields.append(list);
    const state=model.store.snapshot,pageSize=24,pages=Math.max(1,Math.ceil(state.assets.length/pageSize));page=Math.min(Math.max(0,page),pages-1);
    for (const asset of state.assets.slice(page*pageSize,(page+1)*pageSize)) {
      const uses = assetUsages(state, asset.id), row = node('li'), preview = node('img'); preview.src = `data:${asset.mediaType};base64,${asset.data}`; preview.alt = '';preview.loading='lazy';preview.style.maxWidth='48px';preview.style.maxHeight='48px';preview.style.width='auto';preview.style.height='auto';preview.style.objectFit='contain';
      const remove = button(`visual-remove-asset-${asset.id}`, 'Удалить', () => { if (!usable(request)) return; if (commit(request, run => run({ type: 'deleteAsset', assetId: asset.id }), 'Изображение удалено · можно отменить.')) assets(); }); remove.disabled = uses.length > 0; remove.title = uses.length ? `Используется: ${uses.length}. Сначала удалите ссылки на изображение.` : 'Удалить неиспользуемый ресурс';
      row.append(preview, node('span', `${asset.name || 'Без имени'} · используется ${uses.length}`), button(`visual-use-asset-${asset.id}`, 'На диаграмму…', () => { if (!usable(request)) return; cancel(); if (nodeEditor('image')) controls.asset.value = asset.id; }), remove);
      if (specializations.length) row.append(button(`visual-profile-asset-${asset.id}`, 'Специализации', () => { if (!usable(request)) return; const profileId = controls['asset-profile'].value; if (!profileId) { error.textContent = 'Сначала выберите специализацию.'; return; } if (commit(request, run => run({ type: 'setCustomizationProfileImage', profileId, assetId: asset.id }), 'Общее изображение специализации сохранено · можно отменить.')) assets(); }));
      list.append(row);
    }
    if (!list.children.length) list.append(node('li', 'Изображений пока нет.'));const paging=node('div');paging.append(node('span',`Страница ${page+1} из ${pages}. Миниатюры не увеличивают исходное изображение.`));for(const[id,label,next]of [['previous','Предыдущие',page-1],['next','Следующие',page+1]]){const control=button('visual-assets-'+id,label,()=>{if(usable(request)){cancel();if(assets(next))document.getElementById('visual-assets-'+id)?.focus();}});control.disabled=next<0||next>=pages;paging.append(control);}fields.append(paging);return true;
  }
  function submit() {
    const request = pending; if (!request || !usable(request)) return;
    try {
      if (request.mode === 'node') {
        const payload = { name: request.original && controls.name.value === request.initial.name ? request.original.name : controls.name.value, bounds: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, numeric(key)])), parent: controls.parent.value ? { kind: controls.parent.value.split(':')[0], id: controls.parent.value.split(':')[1] } : null };
        if(controls.instruction&&(controls.instruction.value||request.original?.instruction!==undefined))payload.instruction=request.original&&controls.instruction.value===request.initial.instruction?request.original.instruction:controls.instruction.value;
        if (request.kind === 'note') payload.text = request.original && controls.text.value === request.initial.text ? request.original.text : controls.text.value;
        if (request.kind === 'viewReference') payload.targetViewId = controls['target-view'].value;
        if (request.kind === 'legend') payload.legend = { sort: controls['legend-sort'].value, columns: Number(controls['legend-columns'].value), showRelationships: controls['legend-relationships'].value === 'true', colorScheme: controls['legend-colors'].value, autoSize: controls['legend-autosize'].value === 'true', ...(controls['legend-width'].value ? { columnWidth: Number(controls['legend-width'].value) } : {}),...(controls['legend-rows'].value?{rowsPerColumn:Number(controls['legend-rows'].value)}:{}),...(request.legendLabels?.read().length?{labels:request.legendLabels.read()}:{}),...(controls['legend-elements'].value==='false'?{showElements:false}:{}),...(controls['legend-specializations'].value==='true'?{showSpecializations:true}:{}),...(request.legendColors?.read().length?{colors:request.legendColors.read()}:{}) };
        commit(request, (run,stage) => {
          if(request.kind==='viewReference'&&controls['target-edit'].value==='true'){const original=request.targetOriginal;if(!original||original.id!==payload.targetViewId)throw Error('Целевое представление изменилось.');const name=controls['target-name'].value===request.targetInitial.name?original.name:controls['target-name'].value,documentation=controls['target-documentation'].value===request.targetInitial.documentation?original.documentation:controls['target-documentation'].value;if(name!==original.name)run({type:'renameView',viewId:original.id,name});if(documentation!==original.documentation)run({type:'updateMetadata',owner:{kind:'view',id:original.id},documentation});}
          if (request.kind === 'image') payload.assetId = controls.asset.value === '$upload' && request.upload ? run({ type: 'createAsset', ...request.upload }).created.assetId : controls.asset.value||null;if(request.kind==='image'&&payload.assetId===null&&request.original?.style.image){payload.style={...request.original.style};delete payload.style.image;}
          if(!request.ref)return run({type:'createVisualNode',viewId:request.viewId,kind:request.kind,...payload});
          const prepared=prepareDrawingBounds(stage.snapshot,request.viewId,request.ref,payload.bounds,readResizeBehavior());if(prepared.changed)run({type:'applyProjectSnapshot',files:exportFiles(prepared.snapshot)});
          const current=drawing(stage.snapshot,request.ref),patch=Object.fromEntries(Object.entries(payload).filter(([key,value])=>key!=='bounds'&&JSON.stringify(current[key])!==JSON.stringify(value)));
          return Object.keys(patch).length?run({type:'updateVisualNode',viewId:request.viewId,nodeId:request.ref.id,...patch}):{created:{}};
        }, 'Рисунок сохранён · можно отменить.', result => ({ kind: 'visualNode', id: request.ref?.id ?? result.created.visualNodeId }));
      } else if (request.mode === 'connector') commit(request, run => run({ type: 'updateVisualConnector', viewId: request.viewId, connectorId: request.ref.id, name: controls.name.value === request.initial.name ? request.original.name : controls.name.value }), 'Подпись сохранена · можно отменить.', request.ref);
      else if (request.mode === 'lock') commit(request, run => run({ type: 'setDrawingLocked', viewId: request.viewId, drawing: request.ref, locked: request.locked }), request.locked ? 'Рисунок заблокирован · можно отменить.' : 'Рисунок разблокирован · можно отменить.', request.ref);
      else if (request.mode === 'hierarchy') {
        const parent = controls.parent.value ? { kind: controls.parent.value.split(':')[0], id: controls.parent.value.split(':')[1] } : null, chosen = request.relations?.get(controls['nesting-relation'].value), hide = controls['nesting-hide'].value === 'true';
        commit(request, (run, stage) => {
          const original = drawing(stage.snapshot, request.ref); if (JSON.stringify(original.parent) !== JSON.stringify(parent)) run({ type: 'reparentDrawing', viewId: request.viewId, drawing: request.ref, parent });
          if (chosen && parent?.kind === 'occurrence' && request.ref.kind === 'occurrence') {
            const endpoints = request.endpoints; let connectionId;
            if (chosen.existing) {
              const entry = stage.snapshot.views.find(entry => entry.view.id === request.viewId), existing = entry.connections.find(item => item.relationshipId === chosen.existing.id && refKey(item.source) === refKey(endpoints.source) && refKey(item.target) === refKey(endpoints.target));
              connectionId = existing?.id ?? run({ type: 'addConnection', viewId: request.viewId, relationshipId: chosen.existing.id, ...endpoints }).created.connectionId;
            } else connectionId = run({ type: 'createRelationshipAndConnection', viewId: request.viewId, relationshipType: chosen.type, label: '', ...endpoints }).created.connectionId;
            const connection = stage.snapshot.views.find(entry => entry.view.id === request.viewId).connections.find(item => item.id === connectionId);
            if ((connection.style.hideWhenNested ?? false) !== hide) run({ type: 'updateDrawingStyle', viewId: request.viewId, drawing: { kind: 'connection', id: connectionId }, style: { ...connection.style, hideWhenNested: hide } });
          }
        }, 'Контейнер и явно выбранная связь сохранены · одна отмена.', request.ref);
      }
      else if (request.mode === 'style') { const style = readStyle(); if (controls.labelTemplate.value === request.initialTemplate && Object.hasOwn(request.original.style, 'labelTemplate')) style.labelTemplate = request.original.style.labelTemplate; commit(request, run => run({ type: 'updateDrawingStyle', viewId: request.viewId, drawing: request.ref, style }), 'Оформление сохранено · можно отменить.', request.ref); }
      else if (request.mode === 'delete') commit(request, run => run({ type: request.ref.kind === 'visualNode' ? 'removeVisualNode' : 'removeVisualConnector', viewId: request.viewId, [request.ref.kind === 'visualNode' ? 'nodeId' : 'connectorId']: request.ref.id }), 'Рисунок удалён. Дети контейнера сохранены · можно отменить.');
      else if (request.mode === 'brush') commit(request, run => { for (const ref of request.refs) { const item = drawing(model.store.snapshot, ref); const style={...brush.style};if(ref.kind==='connection')for(const key of ['strokeDash','sourceEnding','targetEnding']){delete style[key];if(Object.hasOwn(item.style,key))style[key]=item.style[key];}if (JSON.stringify(item.style) !== JSON.stringify(style)) run({ type: 'updateDrawingStyle', viewId: request.viewId, drawing: ref, style }); } }, 'Оформление применено · можно отменить.');
    } catch (failure) { error.textContent = `Не сохранено: ${failure.message}`; }
  }
  const connectorButton = button('visual-connector-tool', 'Визуальный соединитель', () => {
    if (armed) { clearGesture(); return; } if (blocked() || !model.view) return;
    beforeChange(); clearGesture(); armed = true; generation++; connectorButton.setAttribute('aria-pressed', 'true'); canvas.classList.add('visual-link-armed'); status('Протяните от рисунка к рисунку. Этот соединитель не создаёт отношения ArchiMate.');
  }); connectorButton.setAttribute('aria-pressed', 'false');
  for (const [kind, name] of Object.entries(names)) tools.append(button(`visual-add-${kind}`, name, () => nodeEditor(kind)));
  tools.append(connectorButton, button('visual-edit', 'Изменить…', editSelected), button('visual-style', 'Оформление…', styleSelected), button('visual-hierarchy', 'Контейнер…', hierarchySelected), button('visual-lock', 'Блокировка…', toggleLock), button('visual-assets-button', 'Изображения…', assets), button('visual-style-paste', 'Применить оформление…', applyBrush));
  function eventRef(event) {
    const target = event.target?.closest?.('[data-kind][data-id]');
    if (!target || !canvas.contains(target) || !DRAWING_COLLECTIONS[target.dataset.kind]) return null;
    const ref = { kind: target.dataset.kind, id: target.dataset.id };
    return drawing(model.store.snapshot, ref) && ref;
  }
  function start(event) {
    if (!armed || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopImmediatePropagation(); const ref = eventRef(event), point = gridPoint(canvasDropPoint(canvas, event.clientX, event.clientY, window));
    if (!ref || !point || pending) { clearGesture(); return; }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('class', 'visual-link-preview'); line.setAttribute('aria-hidden', 'true');
    for (const [name, value] of Object.entries({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })) line.setAttribute(name, value);
    gesture = { ...capture('gesture'), pointerId: event.pointerId, source: ref, point, line }; canvas.append(line); try { canvas.setPointerCapture(event.pointerId); } catch { clearGesture(); }
  }
  function move(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (!current(gesture)) { clearGesture(); return; }
    const point = gridPoint(canvasDropPoint(canvas, event.clientX, event.clientY, window)); if (point) { gesture.line.setAttribute('x2', point.x); gesture.line.setAttribute('y2', point.y); }
  }
  function finish(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); const request = gesture;
    const element = document.elementFromPoint?.(event.clientX, event.clientY), target = eventRef({ target: element ?? event.target }), point = gridPoint(canvasDropPoint(canvas, event.clientX, event.clientY, window)), valid = current(request); clearGesture();
    if (!valid || !target || !point || blocked()) return;
    try {
      const stage = createStore(model.store.snapshot), run = command => stage.execute(command, stage.revision);
      const endpoint = (ref, position) => {
        if (!lineKind(ref.kind)) return ref;
        const host = drawing(stage.snapshot, ref); let anchorId;
        if (ref.kind === 'connection') anchorId = run({ type: 'insertConnectionAnchor', viewId: request.viewId, connectionId: ref.id, index: host.routePoints.length, point: position }).created.anchorId;
        else { anchorId = newId('anc'); run({ type: 'updateVisualConnector', viewId: request.viewId, connectorId: ref.id, routePoints: [...host.routePoints, { kind: 'anchor', id: anchorId, point: position }] }); }
        return { ...ref, anchorId };
      };
      const source = endpoint(request.source, request.point), destination = endpoint(target, point), made = run({ type: 'createVisualConnector', viewId: request.viewId, source, target: destination }).created.visualConnectorId;
      beforeChange(); model.execute({ type: 'applyProjectSnapshot', files: stage.exportFiles() }, request.revision); model.select({ kind: 'visualConnector', id: made }); render(); status('Визуальный соединитель создан · можно отменить.');
    } catch (failure) { status(`Соединитель не создан: ${failure.message}`); }
  }
  canvas.addEventListener('pointerdown', start, true); canvas.addEventListener('pointermove', move, true); canvas.addEventListener('pointerup', finish, true);
  for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { if (gesture) clearGesture(); }, true);
  canvas.addEventListener('dblclick', event => {
    const ref = eventRef(event), item = ref && drawing(model.store.snapshot, ref);
    if (!item || ref.kind !== 'visualNode' || blocked() || item.kind !== 'viewReference') return;
    event.preventDefault(); event.stopImmediatePropagation(); activateView(item.targetViewId);
  }, true);
  canvas.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || blocked()) return;
    const ref = eventRef(event), item = ref && drawing(model.store.snapshot, ref);
    if (!item || ref.kind !== 'visualNode' || item.kind !== 'viewReference') return;
    event.preventDefault(); event.stopImmediatePropagation(); activateView(item.targetViewId);
  }, true);
  canvas.addEventListener('dragover', event => { if (event.dataTransfer?.types?.includes('Files') && !blocked()) event.preventDefault(); });
  canvas.addEventListener('drop', event => { const file = event.dataTransfer?.files?.[0]; if (!file || blocked()) return; event.preventDefault(); event.stopImmediatePropagation(); const point = gridPoint(canvasDropPoint(canvas, event.clientX, event.clientY, window)); if (point && nodeEditor('image', null, point)) readUpload(file, pending); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && (armed || gesture)) { event.preventDefault(); event.stopImmediatePropagation(); clearGesture(); } }, true);
  form.addEventListener('submit', event => { event.preventDefault(); submit(); }); form.addEventListener('input', () => { generation++; error.textContent = ''; });
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }); dialog.addEventListener('close', () => { if (!dialog.open) { pending = null; generation++; if (!document.querySelector('dialog[open]')) trigger?.focus?.(); } });
  function refresh() {
    if (pending && !current(pending)) { cancel(); status('Модель или представление изменились. Черновик отменён.'); }
    if (gesture && !current(gesture)) clearGesture();
    const ref = selection(); document.getElementById('visual-edit').disabled = !ref || !['visualNode', 'visualConnector'].includes(ref.kind); document.getElementById('visual-style').disabled = !ref; document.getElementById('visual-lock').disabled = !ref; document.getElementById('visual-hierarchy').disabled = !ref || !['occurrence','visualNode'].includes(ref.kind); document.getElementById('visual-style-paste').disabled = !brush || !ref;
    for (const button of tools.querySelectorAll('button')) if (button.id.startsWith('visual-add-') || ['visual-connector-tool', 'visual-assets-button'].includes(button.id)) button.disabled = !model.view;
    apply.textContent = pending?.mode === 'delete' ? 'Удалить' : 'Применить';
  }
  window.addEventListener('pagehide', cancel); refresh();
  return { create(kind,point = null) { return Object.hasOwn(names,kind) && nodeEditor(kind,null,point); }, refresh, cancel, editSelected, removeSelected, styleSelected, hierarchySelected, toggleLock, assets, get active() { return Boolean(pending || gesture); }, get enabled() { return armed; }, get generation() { return generation; } };
}
