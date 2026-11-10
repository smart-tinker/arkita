import { CURRENT_CATALOG, exportFiles, conceptTypeChangesImpact } from '../../schemka-model-core/src/index.js';
import {relationshipAssessment,relationshipTypeContext,relationshipCoverage,diagnosticPresentation,renderAssessmentEvidence} from './profile-ui.js';
import { canvasDropPoint } from './drag-drop.js';
import { CATALOG_SECTIONS, catalogTreeIndex, catalogDestinationOptions, catalogMovePlan, folderSectionProperties, destinationSection } from './catalog-tree.js';
import { notationElement } from './notation.js';
import { specializationCreationEntries } from './preferences.js';

const lexicalCollator=new Intl.Collator('ru',{numeric:false,sensitivity:'base'});
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const key = ref => `${ref.kind}:${ref.id}`;
const title = item => item.name || item.label || '(без названия)';
const collection = { element: 'elements', junction: 'junctions', relationship: 'relationships' };
const reference = (state, ref) => ref.kind === 'folder' ? state.folders.find(item => item.id === ref.id) : ref.kind === 'view' ? state.views.find(entry => entry.view.id === ref.id)?.view : state[collection[ref.kind]]?.find(item => item.id === ref.id);

/** Folder navigation is local UI state; every data edit uses one normal model command. */
export function installCatalogFolders({ document, window, model, canvas, render, status, openDialog, blocked, selectConcept, addConcept, activateView, preferences = null, readSelection = () => [], makeMemberRow = null }) {
  const node = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
  const button = (text, action, id) => { const item = node('button', text); item.type = 'button'; if (id) item.id = id; item.addEventListener('click', action); return item; };
  const section = node('section', undefined, 'catalog-folders'), roots = new Map(); section.id = 'catalog-folders';
  const host = document.getElementById('catalog-folders-host') ?? document.querySelector('#tree-model > .tree-branches'); host.prepend(section);
  for (const item of CATALOG_SECTIONS) {
    const details = node('details', undefined, 'tree-group catalog-section'), summary = node('summary'), count = node('span', '0', 'tree-count'), body = node('div', undefined, item.id === 'views' ? 'view-list' : 'catalog-branch');
    details.id = `tree-${item.id}`; details.dataset.catalogSection = item.id; details.open = true;
    summary.append(node('span', item.label), count); summary.tabIndex = 0;
    count.dataset.catalogCount = item.id;
    if (item.id === 'views') count.id = 'view-total';
    else if (item.id === 'relationships') count.id = 'relationship-count';
    else { details.dataset.elementGroup = item.id; count.dataset.elementCount = item.id; }
    body.id = ['views','relationships'].includes(item.id) ? item.id : `elements-${item.id}`;
    details.append(summary, body); section.append(details); roots.set(item.id, { details, body, count });
    summary.addEventListener('click', () => { currentDestination = `@${item.id}`; currentSection=item.id; generation++; });
  }
  const dialog = node('dialog'), form = node('form'), heading = node('h2'), fields = node('div'), error = node('p', '', 'error'), actions = node('div', undefined, 'dialog-actions');
  dialog.id = 'catalog-folder-dialog'; heading.id = 'catalog-folder-title'; fields.id = 'catalog-folder-fields'; error.id = 'catalog-folder-error'; error.setAttribute('role', 'alert');
  dialog.setAttribute('aria-labelledby', heading.id);
  const cancelButton = button('Отмена', () => cancel()), apply = node('button', 'Применить'); apply.type = 'submit'; apply.id = 'catalog-folder-apply';
  actions.append(cancelButton, apply); form.append(heading, fields, error, actions); dialog.append(form); document.body.append(dialog);
  let currentDestination = '@common', currentSection='common', location=null, navigation=null, memberRows=new Map(), folderRows=new Map(), projectId = null, observedStore=null, observedSelection='', revealKey=null, focusNewFolder=null, shown=new Map(), expanded=new Set(), pending = null, cut = null, drag = null, generation = 0;
  const folders = state => new Map(state.folders.map(folder => [folder.id, folder]));
  function setLocation(next, sectionId = currentSection) {
    location = next?.folders.length ? next : null;
    currentSection = location?.sectionId ?? sectionId;
    currentDestination = location?.folders.at(-1) ?? `@${currentSection}`;
    if (location) roots.get(location.sectionId).details.open = true;
    generation++; refresh();
    (location ? navigation?.querySelector('#catalog-folder-back') : roots.get(currentSection)?.details.querySelector(':scope > summary'))?.focus({ preventScroll: true });
  }
  function drillInto(folderId, sectionId = null) {
    const state = model.store.snapshot, index = catalogTreeIndex(state), sections = index.sectionsForFolder.get(folderId);
    sectionId = sections?.has(sectionId) ? sectionId : [...sections ?? []][0];
    if (!sectionId) return false;
    const byId = folders(state), path = [], seen = new Set();
    for (let id = folderId; id; id = byId.get(id)?.parentFolderId) {
      if (!byId.has(id) || seen.has(id)) return false;
      seen.add(id); path.unshift(id);
    }
    setLocation({ sectionId, folders: path });
    return true;
  }
  function renderNavigation() {
    if (!location) { navigation?.remove(); navigation = null; return; }
    if (!navigation) { navigation = node('nav', undefined, 'catalog-folder-tools'); navigation.id = 'catalog-folder-navigation'; navigation.setAttribute('aria-label', 'Путь в каталоге модели'); section.prepend(navigation); }
    const { sectionId, folders: path } = location, state = model.store.snapshot;
    const sectionLabel = CATALOG_SECTIONS.find(item => item.id === sectionId)?.label ?? sectionId;
    const back = button('Назад', () => setLocation(path.length > 1 ? { sectionId, folders: path.slice(0, -1) } : null, sectionId), 'catalog-folder-back');
    const home = button('К началу', () => setLocation(null, sectionId), 'catalog-folder-home');
    const breadcrumb = node('ol', undefined, 'catalog-folder-breadcrumb'); breadcrumb.id = 'catalog-folder-breadcrumb';
    const crumb = (label, target, current = false) => {
      const item = node('li'), control = current ? node('span', label) : button(label, () => setLocation(target, sectionId));
      if (current) control.setAttribute('aria-current', 'location');
      item.append(control); breadcrumb.append(item);
    };
    crumb(sectionLabel, null);
    path.forEach((id, index) => crumb(state.folders.find(folder => folder.id === id)?.name ?? id,
      { sectionId, folders: path.slice(0, index + 1) }, index === path.length - 1));
    navigation.replaceChildren(back, home, breadcrumb);
  }
  function cancel() { pending = null; generation++; if (dialog.open) dialog.close(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => { if (!dialog.open) pending = null; });
  function open(name, build, commit) {
    if (blocked()) return false;
    fields.replaceChildren(); heading.textContent = name; error.textContent = ''; apply.disabled = false;
    const state = model.store.snapshot, revision = model.store.revision, read = build(state);
    openDialog(dialog.id); pending = { store: model.store, revision, commit: () => commit(read(), state, revision) }; generation++;
    fields.querySelector('input,select,textarea,button')?.focus(); return true;
  }
  for (const type of ['input', 'change']) fields.addEventListener(type, () => { generation++; });
  form.addEventListener('submit', event => {
    event.preventDefault(); const request = pending; if (!request || apply.disabled) return;
    if (request.store !== model.store || request.revision !== model.store.revision) { error.textContent = 'Модель изменилась. Закройте диалог и проверьте действие заново.'; apply.disabled = true; return; }
    try { request.commit(); cancel(); render(); status('Изменения модели сохранены. Можно отменить одним действием.'); }
    catch (failure) { error.textContent = failure.message; }
  });
  const input = (name, initial = '', kind = 'input') => {
    const label = node('label', name), field = node(kind); field.value = initial; field.maxLength = 8192;
    if (kind === 'input') field.type = 'text'; label.append(field); fields.append(label); return field;
  };
  function select(name, entries, initial = '') {
    const field = input(name, '', 'select');
    for (const [value, text] of entries) { const option = node('option', text); option.value = value; field.append(option); }
    field.value = initial; return field;
  }
  function folderEditor(folderId = null, destination = currentDestination, preferredSection = null) {
    open(folderId ? 'Изменить папку' : 'Новая папка', state => {
      const item = folderId ? state.folders.find(item => item.id === folderId) : null;
      const sectionId = preferredSection ?? destinationSection(state, destination) ?? currentSection;
      const initial = item?.parentFolderId ?? (folderId ? `@${catalogTreeIndex(state).sectionsForFolder.get(folderId)?.values().next().value ?? sectionId}` : destination);
      const options = catalogDestinationOptions(state, folderId ? [{kind:'folder',id:folderId}] : [], folderId, folderId ? undefined : sectionId);
      // Keep an existing mixed parent available while editing only the folder name.
      if (item?.parentFolderId && !options.some(([value])=>value===item.parentFolderId)) options.push([item.parentFolderId, title(state.folders.find(folder=>folder.id===item.parentFolderId))]);
      const name = input('Название папки', item?.name ?? 'Новая папка'); name.required = true; name.id = 'catalog-folder-name';
      const parent = select('Расположение', options, initial); parent.id = 'catalog-folder-parent';
      return () => ({ name: name.value, destination: parent.value });
    }, (data, state, revision) => {
      const targetSection = destinationSection(state, data.destination) ?? preferredSection ?? destinationSection(state, destination) ?? currentSection;
      const parentFolderId = data.destination.startsWith('@') ? null : data.destination || null;
      if (folderId) {
        const item = state.folders.find(item => item.id === folderId);
        if (item.name === data.name && item.parentFolderId === parentFolderId) return;
        const plan = item.parentFolderId === parentFolderId ? {snapshot:structuredClone(state)} : catalogMovePlan(state, [{kind:'folder',id:folderId}], data.destination);
        plan.snapshot.folders.find(item=>item.id===folderId).name=data.name;
        model.execute({type:'applyProjectSnapshot',files:exportFiles(plan.snapshot)},revision);
      } else {
        const result=model.execute({ type: 'createFolder', name:data.name, parentFolderId, properties:folderSectionProperties({properties:[]}, targetSection) }, revision);
        currentDestination=result.created.folderId;currentSection=targetSection;revealKey=`folder:${result.created.folderId}`;focusNewFolder=result.created.folderId;
        for(let item=state.folders.find(folder=>folder.id===parentFolderId);item;item=state.folders.find(folder=>folder.id===item.parentFolderId)) expanded.add(`${targetSection}:${item.id}`);
        roots.get(targetSection).details.open=true;
      }
    });
  }
  function createElementInCatalog(destination, preferredSection = null) {
    if (blocked()) return false;
    const state = model.store.snapshot;
    const sectionId = preferredSection ?? destinationSection(state, destination) ?? currentSection;
    const folderId = destination.startsWith('@') ? null : destination;
    const types = CURRENT_CATALOG.elementTypes.filter(type => notationElement(state.project.metamodel, type).family === sectionId);
    if (!types.length || folderId && !catalogTreeIndex(state).sectionsForFolder.get(folderId)?.has(sectionId)) {
      status('В выбранном разделе нет поддерживаемых типов для создания.'); return false;
    }
    return open('Создать элемент в каталоге', () => {
      const type = select('Тип элемента', types.map(value => [value, value]), types[0]); type.id = 'catalog-create-element-type'; type.required = true;
      const specialization = select('Специализация', [['', 'Без специализации']], ''); specialization.id = 'catalog-create-element-specialization';
      function updateSpecializations() {
        const selected = specialization.value;
        const none = node('option', 'Без специализации'); none.value = ''; specialization.replaceChildren(none);
        for (const entry of specializationCreationEntries(state).filter(item => item.kind === 'element' && item.type === type.value && types.includes(item.type))) {
          const option = node('option', entry.label); option.value = entry.profileId; specialization.append(option);
        }
        specialization.value = [...specialization.options].some(option => option.value === selected) ? selected : '';
      }
      type.addEventListener('change', updateSpecializations); updateSpecializations();
      const name = input('Имя элемента'); name.id = 'catalog-create-element-name'; name.required = true;
      return () => ({ type: type.value, name: name.value, profileId: specialization.value });
    }, (data, _state, revision) => {
      if (!types.includes(data.type)) throw Error('Выберите поддерживаемый тип элемента.');
      if (!data.name.trim()) throw Error('Введите имя элемента.');
      if (data.profileId && !specializationCreationEntries(_state).some(entry => entry.profileId === data.profileId && entry.kind === 'element' && entry.type === data.type)) throw Error('Выбранная специализация недоступна для этого типа.');
      const result = model.execute({ type: 'createElementInModel', elementType: data.type, name: data.name, ...(folderId ? { folderId } : {}), ...(data.profileId ? { profileId: data.profileId } : {}) }, revision);
      const ref = { kind: 'element', id: result.created.elementId };
      currentSection = sectionId; currentDestination = folderId ?? `@${sectionId}`; revealKey = key(ref);
      selectConcept(ref);
    });
  }
  function scopedSelection(ref) {
    if (Array.isArray(ref)) return ref.map(item => ({ ...item }));
    const selected = readSelection(); return selected.length > 1 && selected.some(item => key(item) === key(ref)) ? selected.map(item => ({ ...item })) : [{ ...ref }];
  }
  function showMove(state, refs, folderId, preview, sectionId = null) {
    preview.replaceChildren();
    try {
      const plan = catalogMovePlan(state, refs, folderId, sectionId), target = state.folders.find(item => item.id === folderId), root = CATALOG_SECTIONS.find(item=>`@${item.id}`===folderId);
      preview.append(node('p', `Выбрано: ${refs.length} → ${target ? title(target) : root?.label ?? 'Раздел модели'}. ID, рисунки и отношения сохранятся.`));
      const list = node('ul'); for (const ref of refs) list.append(node('li', `${title(reference(state, ref))} · ${ref.kind} · ${ref.id}${plan.carried.some(item => key(item) === key(ref)) ? ' — вместе с выбранной папкой' : ''}`)); preview.append(list);
      if (plan.unchanged) preview.append(node('p', 'Объекты уже находятся здесь. Изменений нет.')); apply.disabled = plan.unchanged; return plan;
    } catch (failure) { preview.append(node('p', failure.message)); apply.disabled = true; return null; }
  }
  function commitMove(plan, revision) { if (!plan || plan.unchanged) return; model.execute({ type: 'applyProjectSnapshot', files: exportFiles(plan.snapshot) }, revision); cut = null; }
  function movePreview(ref, folderId, sectionId = null) {
    const refs = scopedSelection(ref);
    open('Переместить выбранные объекты?', state => { const preview = node('div'); fields.append(preview); const plan = showMove(state, refs, folderId, preview, sectionId); return () => plan; }, (plan, _state, revision) => commitMove(plan, revision));
  }
  function deleteFolder(folderId) {
    open('Удалить папку, сохранив содержимое?', state => {
      const folder = state.folders.find(item => item.id === folderId), children = state.folders.filter(item => item.parentFolderId === folderId);
      const shared=catalogTreeIndex(state).sectionsForFolder.get(folderId);if(shared.size>1)fields.append(node('p',`Эта папка общая для разделов: ${CATALOG_SECTIONS.filter(item=>shared.has(item.id)).map(item=>item.label).join(', ')}. Удаление затронет все её ветви.`));
      fields.append(node('p', `Папка «${folder.name}». Вложенных папок: ${children.length}; объектов непосредственно в папке: ${folder.members.length}.`), node('p', 'Содержимое перейдёт на уровень выше. Все объекты и диаграммы останутся в модели.'));
      return () => null;
    }, (_data, _state, revision) => { model.execute({ type: 'deleteFolder', folderId }, revision); if (currentDestination === folderId) currentDestination = '@common'; });
  }
  function changeType(ref) {
    const refs = scopedSelection(ref);
    if (refs.some(item => !collection[item.kind])) { status('Смена типа доступна для элементов, junctions и отношений. Уберите папки и представления из выделения.'); return false; }
    return open('Изменить тип выбранных объектов', state => {
      const kinds = [...new Set(refs.map(item => item.kind))], controls = new Map();
      const list = node('ul'); for (const ref of refs) list.append(node('li', `${title(reference(state, ref))} · ${ref.kind} · ${ref.id}`)); fields.append(list);
      for (const kind of kinds) {
        const current = refs.filter(ref => ref.kind === kind).map(ref => reference(state, ref).type), initial = current.every(value => value === current[0]) ? current[0] : '';
        const input = select(`Новый тип: ${{element:'элементы',junction:'junctions',relationship:'отношения'}[kind]}`, [['', 'Сохранить текущие типы'], ...CURRENT_CATALOG[`${kind}Types`].map(value => [value, value])], initial);
        input.id = kinds.length === 1 ? 'catalog-new-type' : `catalog-new-type-${kind}`; controls.set(kind, input);
      }
      const changes = () => refs.map(concept => ({ concept, conceptType: controls.get(concept.kind).value || reference(state, concept).type }));
      const preview = node('div'); preview.id = 'catalog-type-impact'; fields.append(preview);
      function inspect() {
        preview.replaceChildren();
        try {
          const impact = conceptTypeChangesImpact(state, changes()); apply.disabled = !impact.changes.length || Boolean(impact.newBlockers.length);
          preview.append(node('p', `Изменяемых объектов: ${impact.changes.length}; Затронутых отношений: ${impact.relationshipIds.length}; представлений: ${impact.affectedViewIds.length}. Проверяется итог всей группы; ID и рисунки сохраняются.`));
          if (impact.unknownRelationshipIds.length) preview.append(node('p', `Неподтверждённых отношений: ${impact.unknownRelationshipIds.length}. Они остаются явно непроверенными.`));
          for (const issue of impact.newBlockers) preview.append(node('p', `Изменение запрещено: ${issue.relationshipId} · ${issue.reason}`));
          if (preferences?.get('behavior').explainTypeChange !== false && impact.changes.length) {
            const details = node('details'), body = node('div'); details.id = 'catalog-type-explanation'; details.append(node('summary','Почему смена типа влияет на отношения'),node('p','Команда меняет только выбранные типы. Зависимые отношения не понижаются до Association и не переписываются; исходная документация сохраняется. Полная проверка графа обязательна независимо от этой подсказки.'),body); preview.append(details); let shown = 0;
            const candidate = structuredClone(state); for (const change of impact.changes) reference(candidate,change.concept).type = change.toType;
            function show() { body.querySelector('button')?.remove(); for (const id of impact.relationshipIds.slice(shown,shown+25)) { const relationship=candidate.relationships.find(item=>item.id===id),decision=relationshipAssessment(candidate,relationship),evidence=node('details'); body.append(node('p',`${id} · ${diagnosticPresentation(decision).summary}`)); renderAssessmentEvidence(document,evidence,decision,relationshipTypeContext(candidate,relationship),relationshipCoverage(candidate.project.metamodel)); body.append(evidence); } shown+=25; if(shown<impact.relationshipIds.length) body.append(button(`Ещё отношения: ${impact.relationshipIds.length-shown}`,show)); }
            details.addEventListener('toggle',()=>{if(details.open&&!shown)show();});
          }
        } catch (failure) { apply.disabled = true; preview.append(node('p', `Нельзя применить эти типы: ${failure.message}`)); }
      }
      for (const input of controls.values()) input.addEventListener('change', inspect); inspect(); return changes;
    }, (changes, _state, revision) => model.execute({ type: 'changeConceptTypes', changes }, revision));
  }
  function selectedConcept(view = model.view) {
    const ref = model.selection;
    if (ref?.kind === 'occurrence') return view?.occurrences.find(item => item.id === ref.id)?.concept;
    if (ref?.kind === 'connection') return { kind: 'relationship', id: view?.connections.find(item => item.id === ref.id)?.relationshipId };
    return ref;
  }
  function refresh() {
    const behavior=preferences?.get('behavior')??{naturalSort:true,lazyTree:true,treePageSize:100},sorter=behavior.naturalSort?collator:lexicalCollator;
    const state = model.store.snapshot, view=model.view, index=catalogTreeIndex(state), byId=folders(state);
    if (observedStore!==model.store||projectId !== state.project.id) {
      observedStore=model.store;projectId=state.project.id;currentDestination='@common';currentSection='common';location=null;cut=null;shown.clear();expanded.clear();memberRows.clear();folderRows.clear();observedSelection='';
      for(const root of roots.values())root.details.open=true;
    }
    if (location) {
      const valid=[];
      for(const id of location.folders){const folder=byId.get(id);if(!folder||!index.sectionsForFolder.get(id)?.has(location.sectionId)||folder.parentFolderId!==(valid.at(-1)??null))break;valid.push(id);}
      if(valid.length!==location.folders.length){currentSection=location.sectionId;location=valid.length?{sectionId:location.sectionId,folders:valid}:null;currentDestination=valid.at(-1)??`@${currentSection}`;}
    }
    if(!currentDestination.startsWith('@')&&!byId.has(currentDestination))currentDestination='@common';
    const selected=selectedConcept(view),selectedKey=key(selected??{}),selectionChanged=selectedKey!==observedSelection,revealTarget=revealKey??(selectionChanged?selectedKey:null);revealKey=null;observedSelection=selectedKey;
    const revealRef = revealTarget ? index.records.has(revealTarget) ? {kind:revealTarget.slice(0,revealTarget.indexOf(':')),id:revealTarget.slice(revealTarget.indexOf(':')+1)} : null : null;
    if(revealRef&&location){let owner=revealRef.kind==='folder'?revealRef.id:index.owners.get(key(revealRef));while(owner&&owner!==location.folders.at(-1))owner=byId.get(owner)?.parentFolderId;if(!owner)location=null;}
    let revealSection=null;const revealChildren=new Map();
    if(revealRef){
      revealSection=revealRef.kind==='folder'?[...index.sectionsForFolder.get(revealRef.id)??[]][0]:index.sectionFor(revealRef);
      const root=roots.get(revealSection);if(root)root.details.open=true;
      let child=revealRef,owner=revealRef.kind==='folder'?byId.get(revealRef.id)?.parentFolderId:index.owners.get(revealTarget);
      while(owner){expanded.add(`${revealSection}:${owner}`);revealChildren.set(`${revealSection}:${owner}`,key(child));child={kind:'folder',id:owner};owner=byId.get(owner)?.parentFolderId;}
      revealChildren.set(`${revealSection}:root`,key(child));
      currentSection=revealSection;currentDestination=revealRef.kind==='folder'?revealRef.id:index.owners.get(revealTarget)??`@${revealSection}`;
    }
    renderNavigation();
    const active=document.activeElement?.closest('#catalog-folders')?document.activeElement.dataset.folderFocus:null,activeSection=document.activeElement?.closest('[data-folder-section],[data-catalog-section]')?.dataset;
    const focusedSection=activeSection?.folderSection??activeSection?.catalogSection,scroll=section.closest('.catalog')?.scrollTop;
    const uses=new Map();for(const entry of state.views){for(const item of entry.occurrences){const id=key(item.concept);uses.set(id,(uses.get(id)??0)+1);}for(const item of entry.connections){const id=`relationship:${item.relationshipId}`;uses.set(id,(uses.get(id)??0)+1);}}
    const sortRefs=(a,b)=>sorter.compare(title(index.records.get(key(a))),title(index.records.get(key(b))))||a.id.localeCompare(b.id);
    function children(sectionId,folderId){
      const foldersHere=(index.children.get(folderId)??[]).filter(folder=>index.sectionsForFolder.get(folder.id)?.has(sectionId)).map(folder=>({kind:'folder',id:folder.id})).sort(sortRefs);
      const members=(folderId?byId.get(folderId).members:[...state.elements.map(item=>({kind:'element',id:item.id})),...state.junctions.map(item=>({kind:'junction',id:item.id})),...state.relationships.map(item=>({kind:'relationship',id:item.id})),...state.views.map(entry=>({kind:'view',id:entry.view.id}))].filter(ref=>!index.owners.has(key(ref)))).filter(ref=>index.sectionFor(ref)===sectionId).sort(sortRefs);
      return [...foldersHere,...members];
    }
    function page(items,id,body){
      const step=behavior.treePageSize??100;let start=behavior.lazyTree?shown.get(id)??0:0,target=revealChildren.get(id);const at=target?items.findIndex(ref=>key(ref)===target):-1;
      if(behavior.lazyTree&&at>=0)start=Math.floor(at/step)*step;if(!behavior.lazyTree)start=0;start=Math.max(0,Math.min(start,Math.max(0,Math.ceil(items.length/step)-1)*step));shown.set(id,start);
      const count=behavior.lazyTree?step:items.length;
      return {items:items.slice(start,start+count),more:()=>{if(!behavior.lazyTree||items.length<=step)return;const controls=node('div',undefined,'catalog-folder-tools');
        for(const [offset,label] of [[start-step,'← Предыдущие'],[start+step,`Следующие ${Math.min(step,Math.max(0,items.length-start-step))} →`]]){const more=button(label,()=>{shown.set(id,offset);generation++;refresh();});more.disabled=offset<0||offset>=items.length;more.dataset.catalogMore=id;controls.append(more);}controls.append(node('span',`${start+1}–${Math.min(start+step,items.length)} из ${items.length}`));body.append(controls);}};
    }
    function memberRow(ref){
      const item=index.records.get(key(ref));let row=makeMemberRow?.(ref,item,{state,view,selected,records:index.records,uses:uses.get(key(ref))??0})??node('div',undefined,'catalog-member-row element-row');
      row.dataset.catalogKind=ref.kind;row.dataset.catalogId=ref.id;
      if(!makeMemberRow){
        const choose=button('',()=>ref.kind==='view'?activateView(ref.id):selectConcept(ref));choose.append(node('span',title(item),'element-name'));choose.className=ref.kind==='view'?'view-button':ref.kind==='relationship'?'relationship-button':'element-button';
        choose.dataset[`${ref.kind}Id`]=ref.id;choose.dataset.folderFocus=key(ref);choose.dataset.renameKind=ref.kind;choose.dataset.renameId=ref.id;choose.dataset.focusKey=`${ref.kind}-${ref.id}`;
        if(ref.kind==='view')choose.dataset.viewScope='tree';
        choose.setAttribute('aria-pressed',String(key(selected??{})===key(ref)));choose.title=`${item.type??'Представление'} · ${ref.id}`;row.append(choose);
        if(ref.kind!=='view'){
          const count=ref.kind==='relationship'?view?.connections.filter(drawing=>drawing.relationshipId===ref.id).length??0:view?.occurrences.filter(drawing=>key(drawing.concept)===key(ref)).length??0;
          const badge=node('span',String(count),'occurrence-count');badge.title='Экземпляров в текущем представлении';choose.append(badge);
          if(!uses.get(key(ref))){const unused=node('span','∅','unused-marker');unused.title='Не используется ни в одном представлении';choose.append(unused);choose.setAttribute('aria-label',`${title(item)}. Не используется ни в одном представлении`);}
          if(['element','junction'].includes(ref.kind)){const add=button('＋',()=>addConcept(ref));add.className='tree-add-element';add.disabled=!view||!(model.conceptVisible?.(ref)??true);add.setAttribute('aria-label',`Добавить экземпляр: ${title(item)}`);row.append(add);}
        }
      }
      const cached=memberRows.get(key(ref));
      if(cached){
        const buttons=[...cached.querySelectorAll(':scope > button')],freshButtons=[...row.querySelectorAll(':scope > button')];
        for(let i=0;i<freshButtons.length;i++){const previous=buttons[i],next=freshButtons[i];if(!previous)continue;syncAttributes(previous,next);previous.replaceChildren(...next.childNodes);next.replaceWith(previous);}
        syncAttributes(cached,row,new Set(['data-folder-draggable','draggable']));cached.replaceChildren(...row.childNodes);row=cached;
      }else memberRows.set(key(ref),row);
      row.dataset.memberSection=index.sectionFor(ref);row.dataset.memberOwner=index.owners.get(key(ref))??'';
      const choose=row.querySelector(`[data-${ref.kind}-id]`);if(choose)choose.dataset.folderFocus=key(ref);
      if(!cached)row.addEventListener('click',()=>{currentSection=row.dataset.memberSection;currentDestination=row.dataset.memberOwner||`@${currentSection}`;});makeDraggable(row,ref);return row;
    }
    function syncAttributes(previous,next,preserve=new Set()){
      for(const attribute of [...previous.attributes])if(!preserve.has(attribute.name)&&!next.hasAttribute(attribute.name))previous.removeAttribute(attribute.name);
      for(const attribute of next.attributes)previous.setAttribute(attribute.name,attribute.value);
    }
    for(const id of memberRows.keys())if(!index.records.has(id))memberRows.delete(id);
    for(const [id,item] of folderRows)if(!byId.has(item.details.dataset.folderId))folderRows.delete(id);
    // Walk only expanded branches, using a stack so imported deep folder chains stay safe.
    const stack=[];
    for(const item of CATALOG_SECTIONS){const root=roots.get(item.id);root.count.textContent=String(index.counts.get(item.id)??0);root.body.replaceChildren();root.details.hidden=Boolean(location&&location.sectionId!==item.id);if(!location||location.sectionId===item.id)stack.push({sectionId:item.id,folderId:location?.folders.at(-1)??null,body:root.body});}
    while(stack.length){
      const {sectionId,folderId,body}=stack.pop(),pageId=`${sectionId}:${folderId??'root'}`,entries=children(sectionId,folderId),currentPage=page(entries,pageId,body);
      for(const ref of currentPage.items){
        if(ref.kind!=='folder'){body.append(memberRow(ref));continue;}
        const folder=byId.get(ref.id),cacheKey=`${sectionId}:${folder.id}`;let saved=folderRows.get(cacheKey);
        if(!saved){
          const details=node('details',undefined,'catalog-folder tree-group'),summary=node('summary'),choose=button('',event=>{event.preventDefault();currentDestination=folder.id;currentSection=sectionId;details.open=!details.open;updateExpansion();}),count=node('span','','tree-count'),branch=node('div',undefined,'catalog-branch');
          details.dataset.folderId=folder.id;details.dataset.folderSection=sectionId;details.dataset.catalogKind='folder';details.dataset.catalogId=folder.id;
          choose.style.color='var(--preference-folder-color, inherit)';choose.dataset.folderFocus=folder.id;summary.append(choose,count);details.append(summary,branch);makeDraggable(summary,ref);
          function updateExpansion(interaction=true){choose.setAttribute('aria-expanded',String(details.open));const was=expanded.has(cacheKey);if(details.open)expanded.add(cacheKey);else expanded.delete(cacheKey);if(was!==details.open){if(interaction)generation++;refresh();}}
          summary.addEventListener('click',event=>{if(!event.defaultPrevented){currentDestination=folder.id;currentSection=sectionId;generation++;}});
          // Queued native toggles also follow programmatic reveal/reset; only clicks invalidate an in-flight file operation.
          details.addEventListener('toggle',()=>{if(details.isConnected)updateExpansion(false);});saved={details,choose,count,branch};folderRows.set(cacheKey,saved);
        }
        const {details,choose,count,branch}=saved;details.open=expanded.has(cacheKey);choose.textContent=folder.name;choose.setAttribute('aria-label',`Папка ${folder.name}`);choose.setAttribute('aria-expanded',String(details.open));count.textContent=String(index.countsForFolder.get(folder.id)?.get(sectionId)??0);branch.replaceChildren();body.append(details);
        if(details.open)stack.push({sectionId,folderId:folder.id,body:branch});
      }
      currentPage.more();
    }
    if(scroll!==undefined)section.closest('.catalog').scrollTop=scroll;
    if(active){const scope=roots.get(focusedSection)?.body??section;[...scope.querySelectorAll('[data-folder-focus]')].find(item=>item.dataset.folderFocus===active)?.focus({preventScroll:true});}
    if(focusNewFolder){const target=[...section.querySelectorAll('[data-folder-focus]')].find(item=>item.dataset.folderFocus===focusNewFolder);target?.focus({preventScroll:true});target?.scrollIntoView?.({block:'nearest'});focusNewFolder=null;}
  }
  function chooseDestination(ref) {
    const refs = scopedSelection(ref);
    open('Переместить выбранные объекты', state => {
      const options=catalogDestinationOptions(state,refs);const initial=options.some(([value])=>value===currentDestination)?currentDestination:options[0]?.[0]??'';const folder = select('Назначение', options, initial); folder.id = 'catalog-move-target'; const preview = node('div'); preview.id = 'catalog-move-impact'; fields.append(preview); let plan;
      const inspect = () => { plan = showMove(state, refs, folder.value || null, preview); }; folder.addEventListener('change', inspect); inspect(); return () => plan;
    }, (plan, _state, revision) => commitMove(plan, revision));
  }
  function cutConcept(ref) {
    if (blocked()) return false;
    const refs = scopedSelection(ref), state = model.store.snapshot;
    if (!refs.length || refs.some(item => !reference(state, item))) return false;
    cut = refs; generation++; status('Выберите папку и выполните «Поместить вырезанное».'); return true;
  }
  function paste(folderId = currentDestination, sectionId = null) {
    if (!cut || blocked()) return false;
    movePreview(cut, folderId, sectionId ?? destinationSection(model.store.snapshot,folderId) ?? currentSection); return true;
  }
  function duplicate(ref) {
    if (blocked() || !collection[ref?.kind]) return false;
    const item = reference(model.store.snapshot, ref); if (!item) return false;
    const out = model.execute({ type: 'duplicateConcept', concept: ref, name: `${title(item)} — копия` }, model.store.revision);
    selectConcept({ kind: ref.kind, id: out.created[`${ref.kind}Id`] }); render(); return true;
  }
  function makeDraggable(row, ref) {
    row.draggable = true;
    const source = row.querySelector('button[data-folder-focus]'); if (source) source.draggable = true;
    if (row.dataset.folderDraggable) return;
    row.dataset.folderDraggable = 'true';
    row.addEventListener('dragstart', event => {
      if (blocked()) { event.preventDefault(); return; }
      drag = { ref, refs: scopedSelection(ref), store: model.store, revision: model.store.revision, viewId: model.viewId, projectId: model.store.snapshot.project.id, nonce: window.crypto.randomUUID() };
      event.dataTransfer?.setData('application/x-arkita-catalog', drag.nonce);
    });
    row.addEventListener('dragend', () => { drag = null; });
  }
  window.addEventListener('blur',()=>{drag=null;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')drag=null;});
  function validDrop(event) { return !blocked() && drag && drag.store === model.store && drag.revision === model.store.revision && drag.viewId === model.viewId && drag.projectId === model.store.snapshot.project.id && event.dataTransfer?.getData('application/x-arkita-catalog') === drag.nonce; }
  section.addEventListener('dragover', event => { if (drag) event.preventDefault(); });
  section.addEventListener('drop', event => {
    if (!validDrop(event)) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.target.closest('[data-folder-id]')?.dataset.folderId ?? `@${event.target.closest('[data-catalog-section]')?.dataset.catalogSection??'common'}`;
    const sectionId=event.target.closest('[data-folder-section]')?.dataset.folderSection??event.target.closest('[data-catalog-section]')?.dataset.catalogSection;movePreview(drag.refs, target, sectionId); drag = null;
  });
  canvas.addEventListener('dragover', event => { if (drag && drag.ref.kind !== 'folder') event.preventDefault(); });
  canvas.addEventListener('drop', event => {
    if (!validDrop(event) || drag.ref.kind === 'folder') return;
    event.preventDefault(); event.stopPropagation(); if (drag.refs.length > 1) { drag = null; status('Для добавления рисунка выберите один объект; группа переносится между папками целиком.'); return; } const ref = drag.ref; drag = null;
    if (ref.kind === 'view') { activateView(ref.id); return; }
    const point = canvasDropPoint(canvas, event.clientX, event.clientY, window);
    if(!point){status('Точка вне видимого полотна; рисунок не добавлен.');return;}
    addConcept(ref, point);
  });
  (section.closest('.catalog') ?? document.getElementById('tree-model')).addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select')) return;
    const row = event.target.closest('[data-catalog-id]'); if (!row) return;
    const ref = { kind: row.dataset.catalogKind, id: row.dataset.catalogId };
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') { event.preventDefault(); event.stopPropagation(); cutConcept(ref); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && cut) { event.preventDefault(); event.stopPropagation(); paste(ref.kind === 'folder' ? ref.id : currentDestination,event.target.closest('[data-folder-section]')?.dataset.folderSection??event.target.closest('[data-catalog-section]')?.dataset.catalogSection); }
    if (event.key === 'F2' && ref.kind === 'folder') { event.preventDefault(); event.stopPropagation(); folderEditor(ref.id); }
  });
  preferences?.subscribe((_value,changed)=>{if(changed.includes('behavior')){shown.clear();revealKey=key(selectedConcept()??{});generation++;refresh();}});
  function reveal(ref){observedSelection=key(selectedConcept()??{});revealKey=key(ref);generation++;refresh();return [...section.querySelectorAll('[data-folder-focus]')].find(item=>item.dataset.folderFocus===key(ref)||ref.kind==='folder'&&item.dataset.folderFocus===ref.id);}
  return { refresh, cancel, reveal, drillInto, changeType, chooseDestination, folderEditor, createElementInCatalog, deleteFolder, cut: cutConcept, paste, duplicate, get hasCut() { return Boolean(cut); }, get currentFolderId() { return currentDestination.startsWith('@')?null:currentDestination; }, get currentDestination() { return currentDestination; }, get currentSection() { return currentSection; }, get active() { return Boolean(pending); }, get generation() { return generation; } };
}
