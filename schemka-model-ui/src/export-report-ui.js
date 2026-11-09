import { outlineSvgText } from './svg-text-outlines.js';
import { modelSearchRecords } from '../../schemka-model-core/src/model-search.js';
import { prepareReportProject, generateHtmlReport, readReportTemplate, resolveReportLogo, DEFAULT_REPORT_TEMPLATE, installReportNavigation } from '../../schemka-model-io/src/report.js';
import { calculatePrintLayout } from '../../schemka-model-io/src/print-layout.js';
import { rasterDimensions, rasterizeViewSvg } from './raster-export.js';
import { createDownloader } from './browser-files.js';

const filename = (name, extension) => `Arkita-${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100) || 'model'}.${extension}`;
const bytes = text => new TextEncoder().encode(text);
const dataSvg = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function installExportReportUI({ document, window, model, session, openDialog, blocked, status, snapshotViewSvg }) {
  const desktop = window.schemkaDesktop, node = (tag, text) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; };
  const button = (id, text, action) => { const item = node('button', text); item.type = 'button'; item.id = id; item.addEventListener('click', action); return item; };
  const downloader = createDownloader({ document, URL: window.URL, Blob: window.Blob, setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) });
  const dialog = node('dialog'), form = node('form'), heading = node('h2', 'Экспорт и отчёты'), fields = node('div'), feedback = node('p'), preview = node('div'), actions = node('div');
  dialog.id = 'export-report-dialog'; form.id = 'export-report-form'; heading.id = 'export-report-heading'; dialog.setAttribute('aria-labelledby', heading.id); feedback.id = 'export-report-feedback'; feedback.setAttribute('role', 'status'); preview.id = 'export-report-preview'; actions.className = 'dialog-actions'; fields.className = 'export-report-options';
  const controls = {};
  function field(id, text, initial, choices = null, type = 'text', host = fields) {
    const label = node('label', text), input = node(choices ? 'select' : 'input'); input.id = `export-report-${id}`;
    if (choices) for (const [value, text] of choices) { const option = node('option', text); option.value = value; input.append(option); } else input.type = type;
    if (type === 'checkbox') input.checked = initial; else input.value = initial;
    label.append(input); host.append(label); controls[id] = input; return input;
  }
  const format = field('format', 'Результат', 'svg', [['svg', 'Диаграмма SVG'], ['png', 'Диаграмма PNG'], ['pdf', 'Диаграмма PDF'], ['print', 'Печать диаграммы'], ['html', 'Отчёт модели HTML']]);
  field('scale', 'Масштаб PNG', '1', [['.25', '25%'], ['.5', '50%'], ['1', '100%'], ['2', '200%'], ['4', '400%']]); field('transparent', 'Прозрачный фон PNG', false, null, 'checkbox');
  field('paper', 'Бумага PDF / печати', 'A4', [['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter']]); field('landscape', 'Альбомная ориентация', false, null, 'checkbox'); field('print-scale', 'Масштаб относительно вписывания на одну страницу', '100', [['25', '25%'], ['50', '50%'], ['100', '100% · одна страница'], ['150', '150% · несколько страниц'], ['200', '200% · несколько страниц']]);
  field('text-mode', 'Текст в SVG / PDF', 'text', [['text', 'Сохраняемый текст · шрифты получателя'], ['outlines', 'Контуры · системные шрифты этого компьютера']]);
  field('include-hidden', 'Включить рисунки, скрытые viewpoint', false, null, 'checkbox');
  const reportFields = node('details'), reportSummary = node('summary', 'Настройки отчёта и исключение данных'); reportFields.append(reportSummary); fields.append(reportFields);
  field('views', 'Диаграммы в отчёте', 'all', [['all', 'Все представления'], ['current', 'Только текущее представление']], 'text', reportFields);
  field('title', 'Заголовок', '${model.name}', null, 'text', reportFields); controls.title.maxLength = 8192;
  field('locale', 'Язык отчёта', 'ru-RU', [['ru-RU', 'Русский'], ['en-US', 'English']], 'text', reportFields);
  field('logo', 'Логотип из ресурсов модели', '', [['', 'Без логотипа']], 'text', reportFields);
  field('documentation', 'Включить документацию', true, null, 'checkbox', reportFields); field('external-links', 'Делать внешние ссылки кликабельными (изображения остаются отключены)', false, null, 'checkbox', reportFields);
  const excluded = field('exclude', 'Реально исключить записи и зависимые рисунки', '', [], 'text', reportFields); excluded.multiple = true; excluded.size = 5;
  const excludedProperties = field('exclude-properties', 'Реально исключить ключи свойств', '', [], 'text', reportFields); excludedProperties.multiple = true; excludedProperties.size = 4;
  reportFields.append(node('p', 'Viewpoint ограничивает только диаграммы. Данные модели остаются в отчёте, кроме явно исключённых записей и ключей. Исключение папки исключает её содержимое.'));
  const templateDescription = node('p', 'Шаблон: стандартный Arkita v1.'); templateDescription.id = 'export-report-template-state'; reportFields.append(templateDescription,
    button('export-report-template-open', 'Открыть шаблон отчёта…', () => loadTemplate()), button('export-report-template-save', 'Сохранить шаблон…', () => saveTemplate()));
  const templateFile = node('input'); templateFile.type = 'file'; templateFile.accept = '.json'; templateFile.hidden = true; templateFile.id = 'export-report-template-file'; reportFields.append(templateFile);
  const generate = button('export-report-generate', 'Предпросмотр', () => generatePreview()), save = node('button', 'Сохранить…'); save.id = 'export-report-save'; save.type = 'submit'; save.disabled = true;
  actions.append(button('export-report-cancel', 'Закрыть', cancel), generate, save); form.append(heading, fields, feedback, actions, preview); dialog.append(form); document.body.append(dialog);
  const trigger = button('export-report-button', 'Экспорт и отчёты…', () => open()); const menu = [...document.querySelectorAll('.app-menu')].find(item => item.querySelector('summary')?.textContent === 'Файл'); menu?.querySelector('.menu-items')?.append(trigger);
  let request = null, result = null, abort = null, generation = 0, operation = 0, busy = false, nativeOutput = false, template = structuredClone(DEFAULT_REPORT_TEMPLATE), runtime = null;
  const capture = () => ({ store:model.store, revision: model.store.revision, token: session.documentToken, viewId: model.viewId, generation });
  const current = value => value && request && value.store===model.store && value.revision === model.store.revision && value.token === session.documentToken && value.viewId === model.viewId && value.generation === generation;
  function invalidate() { operation++; busy = false; abort?.abort(); abort = null; result = null; save.disabled = true; runtime?.dispose(); runtime = null; preview.replaceChildren(); generation++; }
  function cancel() { if (nativeOutput) { feedback.textContent = 'Завершите или отмените вывод в системном окне.'; return false; } invalidate(); request = null; if (dialog.open) dialog.close(); }
  function open() {
    if (blocked()) return false; invalidate(); request = capture(); if (menu) menu.open = false;
    excluded.replaceChildren(); excludedProperties.replaceChildren(); const state = model.store.snapshot, records = modelSearchRecords(state), keys = new Set();
    const logoId = controls.logo.value; controls.logo.replaceChildren();
    for (const [value, label] of [['', 'Без логотипа'], ...state.assets.map(asset => [asset.id, `${asset.name || '(без имени)'} · ${asset.id.slice(-8)}`])]) { const option = node('option', label); option.value = value; controls.logo.append(option); }
    if (logoId && !state.assets.some(asset => asset.id === logoId)) { const option = node('option', `Ресурс отсутствует · ${logoId.slice(-8)}`); option.value = logoId; controls.logo.append(option); }
    controls.logo.value = logoId;
    for (const record of records) { if (record.owner.kind !== 'project') { const option = node('option', `${record.name || '(без имени)'} · ${record.owner.kind} · ${record.owner.id.slice(-8)}`); option.value = record.owner.id; excluded.append(option); } for (const row of record.item.properties) keys.add(row.key); }
    for (const key of [...keys].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))) { const option = node('option', key || '(пустой ключ)'); option.value = key; excludedProperties.append(option); }
    feedback.textContent = `Ревизия ${request.revision}. SVG содержит текст с локальными шрифтами; при отсутствии шрифта на другой машине возможна подстановка. PNG сохраняет отрисованный вид.`;
    openDialog(dialog.id); request = capture(); updateAvailability(); return true;
  }
  function updateAvailability() {
    const report = format.value === 'html', print = ['print', 'pdf'].includes(format.value); reportFields.hidden = !report;
    for (const id of ['scale', 'transparent']) controls[id].parentElement.hidden = format.value !== 'png';
    controls['text-mode'].parentElement.hidden = format.value === 'png';
    for (const id of ['paper', 'landscape', 'print-scale']) controls[id].parentElement.hidden = !print;
    const available = report || model.view;
    generate.disabled = busy || !available; save.disabled = busy || !result || !available;
    document.getElementById('export-report-cancel').disabled = nativeOutput;
    for (const input of fields.querySelectorAll('input,select,button')) input.disabled = nativeOutput;
    save.textContent = format.value === 'print' ? 'Печатать…' : 'Сохранить…';
  }
  function config() { return { includeHidden: controls['include-hidden'].checked, scale: Number(controls.scale.value), transparent: controls.transparent.checked,
    outlines: controls['text-mode'].value === 'outlines', print: { paper: controls.paper.value, landscape: controls.landscape.checked, scale: Number(controls['print-scale'].value) } }; }
  function templateConfig() {
    const config = { ...template, title: controls.title.value, locale: controls.locale.value };
    if (controls.logo.value) config.logoAssetId = controls.logo.value; else delete config.logoAssetId;
    return config;
  }
  function showHtml(html) {
    const parsed = new window.DOMParser().parseFromString(html, 'text/html'), data = JSON.parse(parsed.getElementById('report-data').textContent), container = node('div'); container.className = 'export-report-document'; container.lang = parsed.documentElement.lang;
    for (const selector of ['header', 'main', 'footer']) container.append(document.importNode(parsed.querySelector(selector), true));
    for (const element of container.querySelectorAll('[style]')) element.removeAttribute('style'); preview.append(container); runtime = installReportNavigation(container, data);
  }
  function showDiagram(svg, printOptions = null) {
    if (printOptions) {
      const layout = calculatePrintLayout(svg, printOptions); preview.append(node('p', `Страниц: ${layout.pages} (${layout.columns} × ${layout.rows}); поля 10 мм; ${layout.scale}% от вписывания.`));
      const pages = node('div'); pages.className = 'export-print-pages';
      for (const tile of layout.tiles) { const page = node('div'), image = node('img'); page.className = 'export-print-page'; page.setAttribute('aria-label', `Страница ${tile.number} из ${layout.pages}`); page.style.width = `${layout.contentWidthPx / 4}px`; page.style.height = `${layout.contentHeightPx / 4}px`; image.alt = `Страница ${tile.number}`; image.src = dataSvg(svg); image.style.width = `${layout.renderWidthPx / 4}px`; image.style.height = `${layout.renderHeightPx / 4}px`; image.style.left = `${-tile.x / 4}px`; image.style.top = `${-tile.y / 4}px`; page.append(image); pages.append(page); } preview.append(pages);
    } else { const image = node('img'); image.src = dataSvg(svg); image.alt = 'Предпросмотр экспортируемой диаграммы'; preview.append(image); }
  }
  async function generatePreview() {
    if (!request || busy) return; invalidate(); const job = operation, ticket = capture(), options = config(), kind = format.value, state = model.store.snapshot; abort = new window.AbortController(); busy = true; feedback.textContent = 'Подготовка снимка…'; updateAvailability();
    try {
      let output, svg, warnings = [];
      if (kind === 'html') {
        const reportTemplate = readReportTemplate(JSON.stringify(templateConfig())); resolveReportLogo(state, reportTemplate);
        const excludeIds = [...excluded.selectedOptions].map(item => item.value); if (controls.views.value === 'current') excludeIds.push(...state.views.filter(entry => entry.view.id !== ticket.viewId).map(entry => entry.view.id));
        const prepared = prepareReportProject(state, { excludeIds, excludeProperties: [...excludedProperties.selectedOptions].map(item => item.value), documentation: controls.documentation.checked }), diagrams = {}; warnings = prepared.warnings;
        for (const entry of prepared.snapshot.views) { if (!current(ticket)) return; diagrams[entry.view.id] = snapshotViewSvg(prepared.snapshot, entry.view.id, options); if (options.outlines) { const converted = await outlineSvgText(diagrams[entry.view.id], { document, window, outlineText: desktop?.outlineText, documentToken: ticket.token, signal: abort.signal }); diagrams[entry.view.id] = converted.svg; warnings.push(...converted.warnings); } await new Promise(resolve => window.setTimeout(resolve, 0)); }
        output = generateHtmlReport(prepared.snapshot, { revision: ticket.revision, diagrams, template: reportTemplate, externalLinks: controls['external-links'].checked });
      } else {
        if (!ticket.viewId) throw new Error('Откройте представление для экспорта.'); svg = snapshotViewSvg(state, ticket.viewId, options);
        if (options.outlines && kind !== 'png') { const converted = await outlineSvgText(svg, { document, window, outlineText: desktop?.outlineText, documentToken: ticket.token, signal: abort.signal }); svg = converted.svg; warnings.push(...converted.warnings); }
        if (kind === 'png') { const dimensions = rasterDimensions(svg, options.scale); feedback.textContent = `PNG: ${dimensions.width} × ${dimensions.height} px.`; output = await rasterizeViewSvg(svg, { document, window, scale: options.scale, transparent: options.transparent, signal: abort.signal }); }
        else output = svg;
      }
      if (!current(ticket)) return; result = { ticket, kind, output, svg, options, name: state.project.name }; if (kind === 'html') showHtml(output); else showDiagram(svg, ['pdf', 'print'].includes(kind) ? options.print : null);
      feedback.textContent = `Предпросмотр ревизии ${ticket.revision} готов.${warnings.length ? ` Предупреждения: ${warnings.join(' · ')}.` : ''}${kind === 'png' ? ` PNG ${rasterDimensions(svg, options.scale).width} × ${rasterDimensions(svg, options.scale).height} px.` : ''}`;
    } catch (failure) { if (current(ticket)) feedback.textContent = failure.code === 'EXPORT_CANCELLED' ? failure.message : `Не подготовлено: ${failure.message}`; }
    finally { if (job === operation && current(ticket)) { busy = false; abort = null; updateAvailability(); } }
  }
  async function saveResult(event) {
    event.preventDefault(); if (event.target !== form) return; const value = result; if (!value || busy || !current(value.ticket)) { feedback.textContent = 'Обновите предпросмотр перед сохранением.'; return; }
    const job = ++operation; busy = true; nativeOutput = Boolean(desktop); updateAvailability();
    if (nativeOutput) feedback.textContent = 'Выполняется вывод. Завершите или отмените операцию в системном окне.';
    const tell = text => { if (job === operation && dialog.open) feedback.textContent = text; else status(text); };
    try {
      let response;
      if (value.kind === 'print' || value.kind === 'pdf') {
        const method = value.kind === 'print' ? desktop?.printView : desktop?.savePdf; if (!method) throw new Error('Печать и PDF доступны в приложении Windows.');
        response = value.kind === 'print' ? await desktop.printView(value.svg, value.options.print,value.ticket.token) : await desktop.savePdf(value.svg, value.name, value.options.print,value.ticket.token);
      } else {
        const payload = value.kind === 'png' ? value.output : bytes(value.output), name = filename(value.name, value.kind === 'html' ? 'html' : value.kind);
        if (desktop) { if (!desktop.saveExternalFiles) throw new Error('Native экспорт недоступен.'); response = await desktop.saveExternalFiles(value.kind, [{ name, bytes: payload }], value.ticket.token); }
        else { downloader.download(payload, name, { html: 'text/html;charset=utf-8', svg: 'image/svg+xml', png: 'image/png' }[value.kind]); response = { status: 'downloaded' }; }
      }
      if (response?.status === 'cancelled') tell('Вывод отменён. Модель не изменена.');
      else if (['saved', 'printed', 'downloaded'].includes(response?.status)) tell(response.status === 'downloaded' ? `Ревизия ${value.ticket.revision} передана браузеру для скачивания.` : `Ревизия ${value.ticket.revision}: ${response.status === 'printed' ? 'передана на печать' : 'файл сохранён'}.`);
      else throw new Error(response?.message || response?.reason || 'Операция не подтверждена.');
    } catch (failure) { tell(`Результат не сохранён: ${failure.message}`); }
    finally { nativeOutput = false; if (job === operation) { busy = false; if (dialog.open) updateAvailability(); } }
  }
  const stateName = () => model.store.snapshot.project.name;
  async function applyTemplateBytes(value, ticket) {
    if (!(value instanceof Uint8Array) || value.byteLength > 32768) throw new Error('Шаблон превышает 32 KiB или имеет неверный тип.');
    const parsed = readReportTemplate(new TextDecoder('utf-8', { fatal: true }).decode(value)); if (!current(ticket)) return; resolveReportLogo(model.store.snapshot, parsed); template = parsed; controls.logo.value = parsed.logoAssetId ?? ''; controls.title.value = parsed.title; controls.locale.value = parsed.locale; templateDescription.textContent = `Шаблон Arkita v1: ${parsed.sections.join(' → ')}.`; invalidate(); request = capture(); feedback.textContent = 'Шаблон применён к настройкам отчёта. Обновите предпросмотр.';
  }
  async function loadTemplate() {
    if (!request || busy) return; const ticket = capture();
    try { if (desktop) { if (!desktop.readExternalFiles) throw new Error('Native чтение шаблона недоступно.'); const response = await desktop.readExternalFiles('report-template', ticket.token); if (response?.status === 'cancelled') return; if (!response?.files?.length || response.files.length !== 1) throw new Error(response?.message || 'Выберите один шаблон.'); await applyTemplateBytes(response.files[0].bytes, ticket); } else templateFile.click(); }
    catch (failure) { if (current(ticket)) feedback.textContent = `Шаблон не применён: ${failure.message}`; }
  }
  async function saveTemplate() {
    if (!request || busy) return; const ticket=capture(),tell=text=>{if(current(ticket)&&dialog.open)feedback.textContent=text;else status(text);};
    try {
      const config = readReportTemplate(JSON.stringify(templateConfig())); resolveReportLogo(model.store.snapshot, config);
      const value = bytes(JSON.stringify(config, null, 2)), name = filename(stateName(), 'arkita-report.json');
      if (desktop) { const response = await desktop.saveExternalFiles('report-template', [{ name, bytes: value }], ticket.token); tell(response?.status === 'saved' ? 'Шаблон сохранён.' : response?.status === 'cancelled' ? 'Сохранение шаблона отменено.' : `Шаблон не сохранён: ${response?.message || response?.reason}`); } else { downloader.download(value, name, 'application/json'); tell('Шаблон передан браузеру для скачивания.'); } } catch (failure) { tell(`Шаблон не сохранён: ${failure.message}`); }
  }
  templateFile.addEventListener('change', async () => { const file = templateFile.files?.[0], ticket = capture(); if (!file) return; try { if (file.size > 32768) throw new Error('Шаблон превышает 32 KiB.'); await applyTemplateBytes(new Uint8Array(await file.arrayBuffer()), ticket); } catch (failure) { if (current(ticket)) feedback.textContent = `Шаблон не применён: ${failure.message}`; } });
  for (const type of ['input', 'change']) fields.addEventListener(type, event => { if (event.target === templateFile) return; invalidate(); if (request) request = capture(); updateAvailability(); });
  form.addEventListener('submit', saveResult); dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }); dialog.addEventListener('close', () => { if (request) cancel(); }); window.addEventListener('pagehide', () => { cancel(); downloader.dispose(); });
  return { open, cancel, refresh() { if (request && (request.store!==model.store || request.revision !== model.store.revision || request.token !== session.documentToken || request.viewId !== model.viewId)) cancel(); updateAvailability(); }, get active() { return Boolean(request || busy); }, get generation() { return generation; } };
}
