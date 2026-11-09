import { createProject, exportFiles } from '../../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { previewNativeMerge, transferChanges } from '../../schemka-model-io/src/model-transfer.js';
import { exportCSV, previewCSVImport } from '../../schemka-model-io/src/csv.js';
import { exportXLSX } from '../../schemka-model-io/src/xlsx.js';
import { exportExchangeXml, importExchangeXml, EXCHANGE_TYPE_CHOICES } from '../../schemka-model-io/src/exchange-xml.js';
import { previewArchiXml, collectArchiMappings } from '../../schemka-model-io/src/archi-native.js';
import { archiReportFiles } from '../../schemka-model-io/src/archi-report.js';

/** All parsers prepare detached snapshots. One explicit Apply owns the editor transaction. */
export function installInterchangeUI({ document, window, model, session, files, openDialog, render, status, blocked = () => false }) {
  const desktop = window.schemkaDesktop;
  const node = (tag, text, id) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (id) item.id = id; return item; };
  const button = (text, id, action) => { const item = node('button', text, id); item.type = 'button'; item.addEventListener('click', action); return item; };
  const dialog = node('dialog', undefined, 'interchange-dialog'), form = node('form'), fields = node('div'), heading = node('h2', 'Импорт и экспорт', 'interchange-title'), error = node('p', '', 'interchange-error'), report = node('div', '', 'interchange-report'), actions = node('div');
  dialog.setAttribute('aria-labelledby', heading.id); error.setAttribute('role', 'alert'); report.setAttribute('aria-live', 'polite'); fields.className = 'transfer-fields'; actions.className = 'dialog-actions';
  const controls = {};
  function input(id, label, type = 'text', initial = '') { const wrap = node('label', label), item = node('input', undefined, id); item.type = type; item.value = initial; controls[id] = item; wrap.append(item); fields.append(wrap); return item; }
  function select(id, label, entries) { const wrap = node('label', label), item = node('select', undefined, id); for (const [value, text] of entries) { const option = node('option', text); option.value = value; item.append(option); } controls[id] = item; wrap.append(item); fields.append(wrap); return item; }
  const action = select('interchange-action', 'Действие', [['native','Объединить нативную модель .arkita'],['csv','Импортировать CSV в текущую модель'],['csv-new','Новая модель из CSV'],['csv-export','Экспортировать CSV'],['xlsx','Экспортировать XLSX'],['xml','Новая модель из Exchange XML'],['archi','Новая модель из Archi .archimate'],['archi-trace','Таблица соответствий Archi текущей модели'],['xml-export','Экспортировать Exchange XML 3.1']]);
  const delimiter = select('interchange-delimiter','Разделитель CSV', [[',','Запятая'],[';','Точка с запятой'],['\t','Табуляция']]);
  const policy = select('interchange-properties','Свойства при обновлении', [['replace','Заменять переданные свойства'],['merge','Объединять: заменять строки совпавших ключей']]);
  const ids = select('interchange-ids','ID нативного импорта', [['reuse','Сопоставлять по ID'],['remap','Создать независимые объекты с новыми ID']]);
  const update = input('interchange-update','Обновлять существующие объекты','checkbox'); update.checked = true;
  const folders = input('interchange-folders','Импортировать папки','checkbox'); folders.checked = true;
  const metadata = input('interchange-metadata','Обновлять название и метаданные модели','checkbox');
  const prefix = input('interchange-prefix','Префикс файлов','text','arkita'); prefix.maxLength = 80;
  const encoding = select('interchange-encoding','Кодировка', [['utf8','UTF-8'],['bom','UTF-8 с BOM']]);
  const flatten = input('interchange-flatten','Заменить переводы строк пробелами (не для обратного импорта)','checkbox');
  const spreadsheet = input('interchange-spreadsheet','Защитить текст для таблиц апострофом (не для обратного импорта)','checkbox');
  const xmlLanguage=input('interchange-language','Язык строк XML (например ru, en-US)','text','');
  const schemas=input('interchange-schemas','Сохранить закреплённые XSD рядом с XML','checkbox');
  const xmlFolders=input('interchange-xml-folders','Включить организацию папок','checkbox'); xmlFolders.checked=true;
  const dc={}; for(const [key,label]of [['creator','Автор'],['description','Назначение'],['rights','Права']])dc[key]=input(`interchange-dc-${key}`,`Dublin Core: ${label}`);
  const typeMaps={};for(const [type,choices]of Object.entries(EXCHANGE_TYPE_CHOICES))typeMaps[type]=select(`interchange-type-${type}`,`${type} → тип Exchange`,[['','Выберите явно…'],...choices.map(value=>[value,value])]);
  const choose = button('Выбрать файл и проверить…', 'interchange-prepare', prepare), apply = button('Применить', 'interchange-apply', commit), close = button('Закрыть', 'interchange-close', cancel);
  const lossLabel = node('label', 'Подтверждаю перечисленные преобразования и потери'), consent = node('input', undefined, 'interchange-loss-consent'); consent.type = 'checkbox'; lossLabel.append(consent); lossLabel.hidden = true;
  const saveReport = button('Сохранить отчёт и соответствия…', 'interchange-save-report', saveArchiReport); saveReport.hidden = true;
  actions.append(close, saveReport, choose, apply); form.append(heading, fields, error, report, lossLabel, actions); form.addEventListener('submit', event => event.preventDefault()); dialog.append(form); document.body.append(dialog);
  const opener = button('Импорт и экспорт…','interchange-button',open); (document.querySelector('.app-menu .menu-items') ?? document.body).append(opener);
  const traceOpener = button('Соответствия переноса из Archi…', 'archi-mappings-button', () => { if (open()) { action.value = 'archi-trace'; showCurrentMappings(); } }); opener.after(traceOpener);
  let busy = false, generation = 0, pending = null, archiInput = null;
  const capture = () => ({ token: session.documentToken, revision: model.store.revision, store: model.store });
  const current = boundary => boundary.token === session.documentToken && boundary.store === model.store && boundary.revision === model.store.revision;
  function cancel() { generation++; pending = null; archiInput = null; if (dialog.open) dialog.close(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }); dialog.addEventListener('close', () => { generation++; pending = null; archiInput = null; });
  fields.addEventListener('change', () => { generation++; pending = null; archiInput = null; report.replaceChildren(); lossLabel.hidden = true; if (action.value === 'archi-trace') showCurrentMappings(); else refresh(); }); fields.addEventListener('input', () => { generation++; pending = null; archiInput = null; refresh(); }); consent.addEventListener('change',()=>{generation++;refresh();});
  function refresh() {
    const mode = action.value, exporting = ['csv-export','xlsx','xml-export'].includes(mode), csv = mode.startsWith('csv');
    for (const item of Object.values(controls)) item.disabled = busy;
    for (const item of [delimiter]) item.parentElement.hidden = !csv;
    for (const item of [policy,metadata]) item.parentElement.hidden = !['native','csv','csv-new'].includes(mode);
    xmlLanguage.parentElement.hidden=!['xml','xml-export'].includes(mode);
    for(const item of [schemas,xmlFolders,...Object.values(dc)])item.parentElement.hidden=mode!=='xml-export';
    for(const [type,item]of Object.entries(typeMaps))item.parentElement.hidden=mode!=='xml-export'||!model.store.snapshot.elements.some(element=>element.type===type);
    for (const item of [ids,update,folders]) item.parentElement.hidden = mode !== 'native';
    for (const item of [prefix]) item.parentElement.hidden = !exporting;
    for (const item of [encoding,flatten,spreadsheet]) item.parentElement.hidden = mode !== 'csv-export';
    choose.textContent = exporting ? 'Подготовить выгрузку' : 'Выбрать файл и проверить…'; choose.disabled = busy || !desktop?.readExternalFiles && !exporting;
    apply.textContent = exporting ? 'Сохранить выгрузку…' : ['csv-new','xml','archi'].includes(mode) ? 'Создать новую модель…' : 'Применить одним действием';
    const trace = mode === 'archi-trace'; choose.hidden = trace; apply.hidden = trace;
    saveReport.hidden = !pending?.diagnostics && !pending?.mappings; saveReport.disabled = busy || !pending || !current(pending.boundary) || !desktop?.saveExternalFiles;
    apply.disabled = busy || trace || (mode === 'archi' && !pending?.snapshot) || !pending || !current(pending.boundary) || pending.unchanged || !lossLabel.hidden && !consent.checked;
    for (const choice of report.querySelectorAll('select[data-source-id]')) choice.disabled = busy || !archiInput || !current(archiInput.boundary);
    consent.disabled = busy; dialog.setAttribute('aria-busy', String(busy));
  }
  function open() { if (blocked() || busy) return false; error.textContent=''; report.replaceChildren(); pending=null; archiInput=null; lossLabel.hidden=true; openDialog(dialog.id); refresh(); if (action.value === 'archi-trace') showCurrentMappings(); action.focus(); return true; }
  function show(plan) {
    report.replaceChildren();
    if (plan.diagnostics) showArchiDiagnostics(plan);
    if (plan.mappings) showMappings(plan.mappings);
    if (plan.changes) {
      const count = kind => plan.changes.filter(item => item.kind === kind).length;
      report.append(node('p', `Добавить: ${count('added')}; обновить: ${count('updated')}; удалить: ${count('removed')}; без изменений в выбранной области: ${plan.unchangedRecords?.length ?? 0}.`));
      if (!plan.changes.length) report.append(node('p', 'Совпадает с текущей моделью; Undo не изменится.'));
      if (plan.kept?.length) report.append(node('p', `Сохранено локальных записей вне выбранной области: ${plan.kept.length}.`));
      const list = node('ul');
      let shown = 0; const more = button('Показать ещё записи', undefined, appendChanges);
      function appendChanges() { for (const item of plan.changes.slice(shown, shown + 100)) {
        const detail = node('details'), summary = node('summary', `${({added:'Добавить',updated:'Обновить',removed:'Удалить'})[item.kind]}: ${item.label} · ${item.id}`);
        const sourceId = Object.hasOwn(item,'sourceId') ? item.sourceId : item.id;
        detail.append(summary, node('p', `Исходный ID: ${sourceId ?? 'новая запись без ID / локальное зависимое изменение'} → целевой ID: ${item.id}`));
        detail.addEventListener('toggle', () => { if (detail.open && !detail.querySelector('pre')) detail.append(node('pre', JSON.stringify({ before: item.before, after: item.after }, null, 2))); });
        if (item.affectedViews?.length) detail.append(node('p', `Затронутые представления: ${item.affectedViews.map(view=>view.name).join(', ')}`));
        const row = node('li'); row.append(detail); list.append(row);
      }
      shown += 100; more.hidden = shown >= plan.changes.length; }
      appendChanges(); report.append(list, more);
      if (plan.unchangedRecords?.length) { const details = node('details'); details.append(node('summary','Неизменённые записи'), node('pre',plan.unchangedRecords.join('\n'))); report.append(details); }
    }
    if (plan.records) report.append(node('p',`Файлов: ${plan.records.length}. ${plan.records.map(file=>file.name).join(', ')}`));
    if (!plan.diagnostics) for (const message of plan.losses ?? []) report.append(node('p',message));
    lossLabel.hidden = !(plan.diagnostics ? plan.diagnostics.losses.length + plan.diagnostics.transformations.length : plan.losses?.length); consent.checked=false; refresh();
  }
  function analyzeArchi() {
    const plan = previewArchiXml(archiInput.bytes, { DOMParser: window.DOMParser, decisions: archiInput.decisions, ids: archiInput.ids });
    archiInput.ids = plan.ids;
    return { ...plan, unchanged: false };
  }
  function showCurrentMappings() {
    const mappings = collectArchiMappings(model.store.snapshot);
    pending = { mappings, boundary: capture(), mode: 'archi-trace' };
    report.replaceChildren(); showMappings(mappings); lossLabel.hidden = true; refresh();
  }
  function pagedRows(parent, items, makeRow, retained = null) {
    let shown = 0; const list = node('div'), more = button('Показать ещё', undefined, () => append());
    function append(count = 100) { for (const item of items.slice(shown, shown + count)) list.append(makeRow(item)); shown += count; more.hidden = shown >= items.length; if (retained) retained.visible = shown; }
    append(retained?.visible ?? 100); parent.append(list, more);
  }
  function showMappings(mappings) {
    const section = node('details'); section.append(node('summary', `Соответствия исходных и новых ID: ${mappings.length}`));
    if (!mappings.length) section.append(node('p', 'В модели нет сохранённых сведений о переносе из Archi.'));
    else section.addEventListener('toggle', () => {
      if (!section.open || section.dataset.loaded) return; section.dataset.loaded = 'true';
      pagedRows(section, mappings, item => node('p', `${item.sourceType} · Исходный ID: ${item.sourceId} → целевой ID: ${item.targetId}${item.viewName ? ` · Представление: ${item.viewName}` : ''}`));
    });
    report.append(section);
  }
  function showArchiDiagnostics(plan) {
    report.append(node('p', plan.snapshot ? 'Анализ завершён. Будет создана отдельная несохранённая модель; текущая модель не изменяется.' : 'Применение заблокировано. Исправьте ошибки и согласуйте соответствия; текущая модель не изменяется.'));
    for (const [category, title] of [['errors', 'Ошибки'], ['transformations', 'Преобразования'], ['losses', 'Потери и ограничения']]) {
      const items = plan.diagnostics[category], section = node('details'); section.append(node('summary', `${title}: ${items.length}`)); section.open = category === 'errors' && items.length > 0;
      pagedRows(section, items, item => node('p', `${item.sourceType ? item.sourceType + ' · ' : ''}${item.sourceId || 'Документ'}${item.viewName ? ` · Представление: ${item.viewName} (${item.viewId})` : ''}${item.affectedViews?.length ? ` · Представления: ${item.affectedViews.map(view => `${view.name} (${view.id})`).join(', ')}` : ''}${item.field ? ` · ${item.field}` : ''}: ${item.message}`)); report.append(section);
    }
    if (plan.decisions?.length) report.append(node('h3', `Решения по объектам: ${plan.decisions.length}`));
    pagedRows(report, plan.decisions ?? [], decision => {
      const label = node('label', `${decision.name || decision.sourceId} (${decision.sourceId}) · ${decision.sourceType} → `), choice = node('select'); choice.dataset.sourceId = decision.sourceId;
      choice.setAttribute('aria-label', `Преобразование ${decision.name || decision.sourceId}`);
      const unresolved = node('option', 'Требуется решение…'); unresolved.value = ''; choice.append(unresolved);
      for (const option of decision.options) { const item = node('option', typeof option === 'string' ? option : option.label); item.value = typeof option === 'string' ? option : option.value; choice.append(item); }
      choice.value = decision.selected ?? ''; choice.disabled = busy;
      choice.addEventListener('change', () => {
        if (!archiInput || busy || !current(archiInput.boundary)) return;
        generation++; archiInput.decisions[decision.sourceId] = choice.value; const scroll = dialog.scrollTop;
        try { pending = { ...analyzeArchi(), boundary: archiInput.boundary, mode: 'archi' }; show(pending);
          [...report.querySelectorAll('select[data-source-id]')].find(item => item.dataset.sourceId === decision.sourceId)?.focus({ preventScroll: true }); dialog.scrollTop = scroll; }
        catch (failure) { pending = null; error.textContent = failure.message; refresh(); }
      }); label.append(choice); return label;
    }, archiInput);
  }
  async function saveArchiReport() {
    const plan = pending; if (busy || !plan || !current(plan.boundary)) return;
    const operation = ++generation; busy = true; error.textContent = ''; refresh();
    try {
      const result = await desktop.saveExternalFiles('csv', archiReportFiles(plan), plan.boundary.token);
      if (generation !== operation || !dialog.open || !current(plan.boundary)) return;
      if (result.status !== 'saved' && result.status !== 'cancelled') throw Error(result.message || 'Отчёт не сохранён.');
      if (result.status === 'saved') status('Отчёт и таблица соответствий сохранены. Модель не изменена.');
    } catch (failure) { if (generation === operation && dialog.open) error.textContent = failure.message; }
    finally { busy = false; refresh(); }
  }
  function assertXsd(result){if(result.status!=='ok')throw Error(`${result.message||'XML не прошёл XSD-проверку.'}${result.diagnostics?.length?' '+result.diagnostics.slice(0,3).map(item=>`Строка ${item.line}: ${item.message}`).join(' '):''}`);}
  async function prepare() {
    if(busy) return; const boundary=capture(),operation=++generation, mode=action.value; const source=model.store.snapshot; busy=true; pending=null; archiInput=null; error.textContent=''; refresh();
    const valid=()=>dialog.open&&generation===operation&&current(boundary);
    try {
      let plan;
      if(mode==='csv-export') { const result=exportCSV(source,{delimiter:delimiter.value,prefix:prefix.value,bom:encoding.value==='bom',flatten:flatten.checked,spreadsheet:spreadsheet.checked}); plan={records:result.files,losses:result.losses,kind:'csv'}; }
      else if(mode==='xlsx') { const result=exportXLSX(source); plan={records:[{name:`${prefix.value}.xlsx`,bytes:result.bytes}],losses:result.losses,kind:'xlsx'}; }
      else if(mode==='xml-export') {
        if(!desktop?.validateExchangeXml)throw Error('Проверка XSD доступна в приложении Arkita.');
        const result=exportExchangeXml(source,{language:xmlLanguage.value,folders:xmlFolders.checked,typeMap:Object.fromEntries(Object.entries(typeMaps).map(([key,item])=>[key,item.value])),metadata:Object.fromEntries(Object.entries(dc).map(([key,item])=>[key,item.value]))});
        const checked=await desktop.validateExchangeXml(result.bytes,boundary.token);if(!valid())return;assertXsd(checked);
        plan={records:[{name:`${prefix.value}.xml`,bytes:result.bytes},...(schemas.checked?checked.schemas:[])],losses:result.losses,kind:'xml'};
      }
      else {
        const result=await desktop.readExternalFiles(mode==='native'?'native':['xml','archi'].includes(mode)?'xml':'csv',boundary.token); if(!valid()||result.status==='cancelled') return;
        if(result.status!=='opened') throw Error(result.message||'Файлы не прочитаны.');
        if(mode==='native') { if(result.files.length!==1) throw Error('Выберите одну нативную модель.'); plan=previewNativeMerge(source,deserializeProjectFile(result.files[0].bytes),{ids:ids.value,updateExisting:update.checked,folders:folders.checked,modelMetadata:metadata.checked,properties:policy.value}); }
        else if(['xml','archi'].includes(mode)) {
          if(result.files.length!==1)throw Error('Выберите один XML файл.');
          const bytes=result.files[0].bytes;
          if(mode==='xml'){if(!desktop?.validateExchangeXml)throw Error('Проверка XSD доступна в приложении Arkita.');const checked=await desktop.validateExchangeXml(bytes,boundary.token);if(!valid())return;assertXsd(checked);}
          if (mode === 'archi') {
            archiInput = { bytes: Uint8Array.from(bytes), ids: {}, decisions: Object.create(null), boundary };
            plan = analyzeArchi();
          } else {
            const imported = importExchangeXml(bytes, { DOMParser: window.DOMParser, language: xmlLanguage.value });
            plan = { ...imported, changes: transferChanges(createProject('Пустая модель'), imported.snapshot), unchanged: false };
          }
        }
        else plan=previewCSVImport(mode==='csv-new'?createProject('Модель из CSV'):source,result.files,{delimiter:delimiter.value,properties:policy.value,modelMetadata:mode==='csv-new'||metadata.checked});
      }
      if(valid()) { pending={...plan,boundary,mode}; show(pending); }
    } catch(failure) { if(valid()) error.textContent=failure.message; } finally { busy=false; refresh(); }
  }
  async function commit() {
    const plan=pending; if(busy||!plan) return;
    if(!current(plan.boundary)) { error.textContent='Модель изменилась. Подготовьте импорт или выгрузку заново.'; pending=null; refresh(); return; }
    if(apply.disabled) return;
    const operation=++generation; busy=true; refresh();
    try {
      if(plan.records) { if(!desktop?.saveExternalFiles) throw Error('Сохранение выгрузки доступно в приложении Arkita.'); const result=await desktop.saveExternalFiles(plan.kind,plan.records,plan.boundary.token); if(generation!==operation||!dialog.open) return; if(result.status==='cancelled') return; if(result.status!=='saved') throw Error(result.message||'Выгрузка не сохранена.'); status(`Выгрузка сохранена: ${result.name}. Модель не изменена.`); }
      else if(['csv-new','xml','archi'].includes(plan.mode)) { const bytes=serializeProjectFile(plan.snapshot); cancel(); files.proposeExternal({bytes,name:plan.snapshot.project.name,source:'import',unsaved:true}); return; }
      else if(!plan.unchanged) { model.execute({type:'applyProjectSnapshot',files:exportFiles(plan.snapshot)},plan.boundary.revision); render(); status(`Импорт применён: ${plan.changes.length} записей. Можно отменить одним действием. Файл ещё не сохранён.`); }
      pending=null;
    } catch(failure) { if(dialog.open) error.textContent=failure.message; } finally { busy=false; refresh(); }
  }
  return {open,refresh,cancel,get generation(){return generation;},get transient(){return busy;},get active(){return dialog.open;}};
}
