import { CURRENT_CATALOG, queryModelGraph, planGeneratedView, analyzeModelQuality, MODEL_QUALITY_RULES } from '../../schemka-model-core/src/index.js';
import { assessProject } from '../../schemka-model-profiles/src/index.js';
import { projectFileName } from '../../schemka-model-io/src/index.js';
import { conceptRecord } from './concepts.js';
import { modelProfiles, diagnosticPresentation, renderAssessmentEvidence, relationshipTypeContext, relationshipCoverage, relationshipAssessment, renderGraphIssues } from './profile-ui.js';
import { capturePreferenceMotion,animatePreferenceMotion,cancelPreferenceMotion } from './preferences-motion.js';
import { createDownloader } from './browser-files.js';
import { renderAnalysisGraph, exportAnalysisSvg, copyAnalysisImage } from './model-analysis-graph.js';

const key = ref => ref ? `${ref.kind}:${ref.id}` : '';
const label = (state, ref) => ref.kind === 'view' ? state.views.find(entry => entry.view.id === ref.id)?.view.name ?? '(вид удалён)'
  : conceptRecord(state, ref)?.name || conceptRecord(state, ref)?.label || '(без имени)';
const reasons = { viewpoint: 'исключён viewpoint', 'type-filter': 'исключён фильтром типов', 'endpoint-filter': 'скрыт конец отношения' };
const qualityText = {
  'empty-views': ['Пустое представление', 'В сохранённом виде нет рисунков. Это может быть заготовка, а не ошибка; удаляйте её только по своему решению.'],
  'unused-concepts': ['Нет рисунков ни в одном виде', 'Проверены все сохранённые виды, включая скрытые viewpoint рисунки. Концепт может участвовать в отношениях или храниться для будущей работы.'],
  'duplicate-names': ['Одинаковые имена внутри типа', 'Сравнение не учитывает регистр и пробелы по краям, учитывает Unicode NFC. Совпадение имени не делает разные ID одним концептом.'],
  'nesting-review': ['Кандидат проверки вложенности', 'Явная вложенность рисунков не доказывает семантическое отношение. Существующие отношения показаны отдельно; допустимость самой вложенности не проверена: UNKNOWN. Декоративные контейнеры не создают такие пары.'],
  'viewpoint-hidden': ['Рисунки скрыты viewpoint', 'Фильтр текущего вида скрывает часть сохранённых рисунков. Данные остаются в модели; это информация о проекции, а не нормативный запрет.'],
};

export function selectedModelConcepts(model) {
  const state = model.store.snapshot, view = model.view, choices = model.selections?.length ? model.selections : model.selection ? [model.selection] : [], result = new Map();
  for (const choice of choices) {
    const value = choice.kind === 'occurrence' ? view?.occurrences.find(item => item.id === choice.id)?.concept
      : choice.kind === 'connection' ? { kind: 'relationship', id: view?.connections.find(item => item.id === choice.id)?.relationshipId } : choice;
    if (conceptRecord(state, value)) result.set(key(value), { kind: value.kind, id: value.id });
  }
  return [...result.values()];
}

/** A nonmodal dock follows actual model selection; only Generate executes a model command. */
export function installModelAnalysis({ document, window, model, openDialog, render, panel, status, blocked, addConcept, chooseTarget, setFit, preferences = null }) {
  const $ = id => document.getElementById(id), dock = $('model-analysis-panel'), canvas = $('analysis-graph');
  const node = (tag, text) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; };
  const button = (text, action) => { const value = node('button', text); value.type = 'button'; value.addEventListener('click', action); return value; };
  const downloader = createDownloader({ document, URL: window.URL, Blob: window.Blob, setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) });
  let root = null, home = null, history = [], pinned = false, observedSelection = '', observedRevision = -1, observedProject = null, observedView = null;
  let graph = null, bounds = null, scale = 1, generation = 0, pending = null, exporting = false, report = null, reportPage = 1;
  let building = null, completed = null;
  const nestingLabel = node('label'), nestingInput = node('input'); nestingInput.type = 'checkbox'; nestingInput.dataset.analysisRule = ''; nestingInput.value = 'nesting-review'; nestingInput.checked = true; nestingLabel.append(nestingInput,document.createTextNode('Вложенность: ручная проверка')); $('analysis-quality').querySelector('fieldset').append(nestingLabel);
  const ruleInputs = [...document.querySelectorAll('input[data-analysis-rule]')], ruleIds = ruleInputs.map(input => input.value), ruleStorageKey = 'arkita.analysis.rules.v1';
  try {
    const raw = window.localStorage.getItem(ruleStorageKey);
    if (raw !== null) {
      if (raw.length > 512) throw Error('Слишком длинная настройка.');
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || new Set(saved).size !== saved.length || saved.some(id => !ruleIds.includes(id))) throw Error('Неизвестный набор правил.');
      for (const input of ruleInputs) input.checked = saved.includes(input.value);
    }
  } catch { $('analysis-quality-settings').textContent = 'Локальные настройки недоступны или повреждены. Используются все проверки.'; }
  const selectedRules = () => ruleInputs.filter(input => input.checked).map(input => input.value);
  const ruleNames = ids => ids.map(id => ruleInputs.find(input => input.value === id).closest('label').textContent.trim()).join(', ') || 'нет';
  function saveRules() {
    report = null; $('analysis-quality-results').replaceChildren(); $('analysis-quality-more').hidden = true;
    $('analysis-quality-summary').textContent = 'Набор правил изменён. Запустите проверку для новой настройки.';
    try { window.localStorage.setItem(ruleStorageKey, JSON.stringify(selectedRules())); $('analysis-quality-settings').textContent = 'Набор правил сохранён для следующих запусков. Обязательная проверка модели и записи остаётся включённой.'; }
    catch { $('analysis-quality-settings').textContent = 'Настройка действует сейчас, но сохранить её для следующего запуска не удалось.'; }
  }
  for (const input of ruleInputs) input.addEventListener('change', saveRules);
  $('analysis-quality-reset').addEventListener('click', () => { for (const input of ruleInputs) input.checked = true; saveRules(); });
  function feedback(text) { $('analysis-feedback').textContent = text; }
  function selection() { return selectedModelConcepts(model); }
  function saveLocation() { return { root: root && { ...root }, scale, top: $('analysis-graph-scroll').scrollTop, left: $('analysis-graph-scroll').scrollLeft, listTop: $('analysis-results').scrollTop }; }
  function option(value, text) { const item = node('option', text); item.value = value; return item; }
  function refreshViewpoints(select) {
    const selected = select.value;
    select.replaceChildren(option('', 'Все типы модели'), ...(model.store.snapshot.viewpoints ?? []).map(item => option(item.id, `${item.name} · ${item.id.slice(-8)}`)));
    if ([...select.options].some(item => item.value === selected)) select.value = selected;
  }
  for (const [kind, title] of [['element', 'Элементы'], ['junction', 'Junction'], ['relationship', 'Отношения']]) {
    const group = node('fieldset'); group.append(node('legend', title));
    for (const type of CURRENT_CATALOG[`${kind}Types`]) {
      const row = node('label'), input = node('input'); input.type = 'checkbox'; input.checked = true; input.dataset.analysisTypeKind = kind; input.value = type;
      input.addEventListener('change', () => { generation++; rebuild(true); }); row.append(input, document.createTextNode(type)); group.append(row);
    }
    $('analysis-type-filters').append(group);
  }
  function options() {
    return { roots: [root], depth: Number($('analysis-depth').value), direction: $('analysis-direction').value,
      viewpointId: $('analysis-viewpoint').value || null, limit: Number($('analysis-limit').value),
      ...Object.fromEntries(['element', 'junction', 'relationship'].map(kind => [`${kind}Types`, [...document.querySelectorAll(`[data-analysis-type-kind="${kind}"]:checked`)].map(input => input.value)])) };
  }
  function zoom(value) {
    scale = Math.min(4, Math.max(.02, value));
    if (bounds) { canvas.setAttribute('width', Math.ceil(bounds.width * scale)); canvas.setAttribute('height', Math.ceil(bounds.height * scale)); }
    $('analysis-zoom-value').textContent = `${Math.round(scale * 100)}%`;
    $('analysis-zoom-out').disabled = !graph?.nodes.length || scale <= .02;
    $('analysis-zoom-in').disabled = !graph?.nodes.length || scale >= 4;
  }
  function fitGraph() {
    if (!bounds) return;
    zoom(Math.min(1, (($('analysis-graph-scroll').clientWidth || 600) - 20) / bounds.width, 240 / bounds.height));
    $('analysis-graph-scroll').scrollTop = 0; $('analysis-graph-scroll').scrollLeft = 0;
  }
  function restoreLocation(location) {
    if (!location) return;
    zoom(location.scale); $('analysis-graph-scroll').scrollTop = location.top; $('analysis-graph-scroll').scrollLeft = location.left; $('analysis-results').scrollTop = location.listTop;
  }
  function navigate(value) {
    if (blocked() || !conceptRecord(model.store.snapshot, value)) return;
    if (key(value) !== key(root)) { history.push(saveLocation()); if (history.length > 50) history.shift(); root = { ...value }; }
    generation++; rebuild(true);
    $('analysis-back').focus();
  }
  function rememberGraph() {
    if (!graph) return;
    completed = { store: model.store, revision: model.store.revision, graph, root: { ...root }, home: home && { ...home }, history: [...history], pinned,
      options: options(), layout: $('analysis-layout-direction').value, orthogonal: $('analysis-orthogonal').checked, location: saveLocation() };
  }
  function busyControls() {
    const busy = Boolean(building), available = Boolean(graph?.nodes.length);
    dock.dataset.analysisBuilding = String(busy); dock.setAttribute('aria-busy', String(busy)); $('analysis-cancel-build').hidden = !busy;
    for (const id of ['analysis-generate', 'analysis-export', 'analysis-copy']) $(id).disabled = busy || exporting || !available;
    for (const id of ['analysis-select', 'analysis-add']) $(id).disabled ||= busy;
    $('analysis-layout').disabled = exporting || !root || !conceptRecord(model.store.snapshot, root);
  }
  function terminateBuild() {
    if (!building) return;
    const job = building; building = null;
    job.worker.onmessage = null; job.worker.onerror = null; job.worker.terminate();
  }
  function restoreCompleted(message) {
    terminateBuild(); generation++;
    const restorable = completed?.store === model.store && completed.revision === model.store.revision;
    if (restorable) {
      ({ graph, root, home, pinned } = completed); history = [...completed.history];
      const prior = completed.options;
      for (const [id, value] of [['analysis-depth', prior.depth], ['analysis-direction', prior.direction], ['analysis-limit', prior.limit], ['analysis-viewpoint', prior.viewpointId || ''], ['analysis-layout-direction', completed.layout]]) $(id).value = String(value);
      $('analysis-orthogonal').checked = completed.orthogonal;
      for (const input of document.querySelectorAll('[data-analysis-type-kind]')) input.checked = prior[`${input.dataset.analysisTypeKind}Types`].includes(input.value);
      paintGraph(false); restoreLocation(completed.location);
    } else { graph = null; completed = null; paintGraph(false); }
    feedback(`${message} ${restorable ? 'Предыдущий завершённый граф и его настройки сохранены.' : 'Завершённого графа этой ревизии нет; повторите построение.'}`); busyControls();
  }
  function rebuild(resetZoom = false, location = null) {
    if (dock.hidden) return;
    terminateBuild(); generation++;
    const state = model.store.snapshot, record = root && conceptRecord(state, root);
    if (!record) { graph = null; completed = null; paintGraph(resetZoom); busyControls(); return; }
    const graphOptions = options();
    if (completed?.graph === graph) completed.location = saveLocation();
    if (typeof window.Worker !== 'function') {
      // A bounded compatibility path for environments without module workers.
      try { graph = queryModelGraph(state, graphOptions); paintGraph(resetZoom); restoreLocation(location); rememberGraph(); }
      catch (error) { restoreCompleted(`Построение не завершено: ${error.message}`); }
      busyControls(); return;
    }
    try {
      const worker = new window.Worker(new URL('./model-analysis-worker.js', import.meta.url), { type: 'module' });
      const job = { worker, store: model.store, revision: model.store.revision, generation, resetZoom, location }; building = job;
      const current = () => building === job && job.store === model.store && job.revision === model.store.revision && job.generation === generation && !dock.hidden;
      worker.onmessage = event => {
        if (!current()) return;
        if (event.data.error) { restoreCompleted(`Построение не завершено: ${event.data.error.message}`); return; }
        terminateBuild(); graph = event.data.result; paintGraph(job.resetZoom); restoreLocation(job.location); rememberGraph(); busyControls(); feedback('Граф построен. Модель и её раскладка не изменены.');
      };
      worker.onerror = event => { event.preventDefault?.(); if (current()) restoreCompleted(`Не удалось запустить фоновое построение.${event.message ? ` ${event.message}` : ''}`); };
      $('analysis-root').textContent = `${label(state, root)} · ${record.type} · ${root.id}`;
      $('analysis-summary').textContent = 'Построение окрестности… Пока показан предыдущий завершённый граф. Отмена остановит фоновую задачу и сохранит прежний результат.';
      busyControls(); worker.postMessage({ state, options: graphOptions });
    } catch (error) { restoreCompleted(`Построение не завершено: ${error.message}`); }
  }
  function paintGraph(resetZoom = false) {
    if (dock.hidden) return;
    const state = model.store.snapshot;
    $('analysis-pin').setAttribute('aria-pressed', String(pinned)); $('analysis-pin').textContent = pinned ? 'Закреплено' : 'Закрепить';
    $('analysis-back').disabled = !history.length; $('analysis-home').disabled = !home || key(home) === key(root) || !conceptRecord(state, home);
    const record = root && conceptRecord(state, root);
    $('analysis-root').textContent = record ? `${label(state, root)} · ${record.type} · ${root.id}` : root ? `Объект удалён или недоступен: ${root.id}. Выберите другой объект или снимите закрепление.` : 'Выберите элемент, junction или отношение в модели.';
    $('analysis-results').replaceChildren();
    $('analysis-add').disabled = !record || !model.view || model.conceptVisible(root) === false;
    $('analysis-select').disabled = !record;
    for (const id of ['analysis-generate', 'analysis-export', 'analysis-copy', 'analysis-fit', 'analysis-layout']) $(id).disabled = !graph?.nodes.length || exporting;
    $('analysis-generation-selection').disabled = !selection().length;
    $('analysis-export').disabled ||= !graph?.nodes.length; $('analysis-copy').disabled ||= !graph?.nodes.length;
    if (!graph) { cancelPreferenceMotion(canvas); canvas.replaceChildren(); bounds = null; zoom(1); $('analysis-summary').textContent = ''; return; }
    const revision = model.store.revision, currentGeneration = generation;
    for (const item of graph.nodes) {
      const row = node('li'), value = { kind: item.kind, id: item.id };
      const result = button('', () => { if (revision === model.store.revision && currentGeneration === generation) navigate(value); });
      result.dataset.analysisResultId = item.id; result.dataset.analysisResultKind = item.kind;
      result.append(node('strong', item.name || '(без имени)'), node('span', `${item.kind} · ${item.type} · шаг ${item.depth}`), node('span', item.id));
      if (item.kind === 'relationship') {
        const relation = conceptRecord(state, value);
        result.append(node('span', `${label(state, relation.source)} → ${label(state, relation.target)}`));
      }
      row.append(result); $('analysis-results').append(row);
    }
    const hidden = graph.hiddenRoots.length ? ` Корень скрыт: ${reasons[graph.hiddenRoots[0].reason]}. Сбросьте фильтры.` : '';
    $('analysis-summary').textContent = `${graph.nodes.length} концептов · ${graph.relationships.length} отношений · глубина ${graph.depth}.` + hidden
      + (graph.excluded.length ? ` Отфильтровано при обходе: ${graph.excluded.length}.` : '')
      + (graph.truncated ? ` Достигнут предел ${graph.limit}; показана часть окрестности. Уменьшите глубину или уточните типы.` : '')
      + (graph.boundaryRelationships.length ? ` У ${graph.boundaryRelationships.length} отношений концы за границей глубины. Их карточки сохранены; для нового вида нужные концы будут перечислены в предпросмотре.` : '');
    const motion = preferences && capturePreferenceMotion(canvas);
    bounds = renderAnalysisGraph({ document, canvas, result: graph, layout: $('analysis-layout-direction').value, orthogonal: $('analysis-orthogonal').checked,
      navigate: value => { if (revision === model.store.revision && currentGeneration === generation) navigate(value); } });
    if (resetZoom) fitGraph(); else zoom(scale);
    if (preferences) animatePreferenceMotion(canvas,motion,preferences.snapshot,{window,graph:true});
  }
  function refresh() {
    const state = model.store.snapshot, currentSelection = selection(), selectedKey = currentSelection.map(key).join('|');
    if (observedProject !== state.project.id) { root = null; home = null; history = []; pinned = false; observedSelection = ''; report = null; }
    if (!pinned && selectedKey !== observedSelection) { root = currentSelection[0] ?? null; home = root && { ...root }; history = []; generation++; }
    const changed = observedRevision !== model.store.revision || selectedKey !== observedSelection || observedView !== model.viewId;
    observedSelection = selectedKey; observedRevision = model.store.revision; observedProject = state.project.id; observedView = model.viewId;
    if (!dock.hidden && changed) {
      refreshViewpoints($('analysis-viewpoint')); rebuild(false);
      if (report && report.revision !== model.store.revision) {
        $('analysis-quality-summary').textContent = 'Модель изменилась. Запустите проверку заново; прежние результаты больше не используются.';
        for (const button of $('analysis-quality-results').querySelectorAll('button')) button.disabled = true;
      }
    }
  }
  function open(value = null) {
    if (blocked()) return false;
    refresh();
    if (value && conceptRecord(model.store.snapshot, value)) { root = { ...value }; home = { ...value }; history = []; }
    dock.hidden = false; $('model-analysis-button').setAttribute('aria-expanded', 'true');
    refreshViewpoints($('analysis-viewpoint')); generation++; rebuild(true); panel('canvas'); $('analysis-close').focus(); return true;
  }
  function close() { cancelPreferenceMotion(canvas); terminateBuild(); dock.hidden = true; $('model-analysis-button').setAttribute('aria-expanded', 'false'); generation++; busyControls(); $('model-analysis-button').focus(); }
  function reset() { terminateBuild(); completed = null; root = null; home = null; history = []; pinned = false; observedSelection = ''; observedProject = null; observedRevision = -1; observedView = null; graph = null; report = null; pending = null; generation++; $('analysis-quality-results').replaceChildren(); $('analysis-quality-summary').textContent = ''; refresh(); }
  // Run before outside-click draft cancellation in app.js; exploration must not discard an unfinished edit.
  for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
    if (event.target.closest?.('#model-analysis-panel, #model-analysis-button, #analysis-generation-selection, [data-inspector-action="analysis"], [data-command="model-analysis-button"], [data-command="analysis-generation-selection"]') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation();
      status('Завершите или отмените текущую правку перед исследованием модели.');
    }
  }, true);
  $('model-analysis-button').addEventListener('click', () => { if (dock.hidden) open(); else close(); });
  $('analysis-close').addEventListener('click', close);
  $('analysis-pin').addEventListener('click', () => { pinned = !pinned; if (!pinned) { root = selection()[0] ?? null; home = root && { ...root }; history = []; } generation++; rebuild(true); });
  $('analysis-back').addEventListener('click', () => {
    const previous = history.pop(); if (!previous) return;
    root = previous.root; generation++; rebuild(false, previous);
  });
  $('analysis-home').addEventListener('click', () => { if (home) { root = { ...home }; history = []; generation++; rebuild(true); } });
  for (const id of ['analysis-depth', 'analysis-direction', 'analysis-viewpoint', 'analysis-limit', 'analysis-layout-direction', 'analysis-orthogonal']) $(id).addEventListener('change', () => { generation++; rebuild(true); });
  $('analysis-reset-filters').addEventListener('click', () => {
    $('analysis-viewpoint').value = ''; $('analysis-direction').value = 'both';
    for (const input of document.querySelectorAll('[data-analysis-type-kind]')) input.checked = true;
    generation++; rebuild(true);
  });
  $('analysis-layout').addEventListener('click', () => { generation++; rebuild(true); });
  $('analysis-cancel-build').addEventListener('click', () => { if (building) restoreCompleted('Построение отменено.'); });
  $('analysis-fit').addEventListener('click', fitGraph);
  $('analysis-zoom-in').addEventListener('click', () => zoom(scale * 1.25)); $('analysis-zoom-out').addEventListener('click', () => zoom(scale / 1.25));
  $('analysis-select').addEventListener('click', () => { if (!blocked() && conceptRecord(model.store.snapshot, root)) chooseTarget(root); });
  $('analysis-add').addEventListener('click', () => { if (!blocked() && conceptRecord(model.store.snapshot, root)) addConcept(root); });
  dock.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    // Diagram shortcuts must not move selected model drawings from controls in this dock.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) event.stopPropagation();
  });
  async function imageAction(clipboard) {
    if (blocked() || building || exporting || !graph?.nodes.length) return;
    const snapshotGeneration = generation, revision = model.store.revision;
    try {
      cancelPreferenceMotion(canvas);
      const name = `Окрестность — ${label(model.store.snapshot, root)}`;
      const svg = exportAnalysisSvg({ canvas, bounds, title: name, description: `${$('analysis-summary').textContent} Карточки отношений показывают принадлежность концов, а не отдельные новые отношения. Снимок ревизии ${revision}.` });
      exporting = true; busyControls();
      if (clipboard) {
        const result = await copyAnalysisImage(window, svg, bounds);
        feedback(`Изображение окрестности скопировано: ${result.width} × ${result.height}.${result.scale < 1 ? ' Размер уменьшен до 4096 px; SVG сохраняет полный масштаб.' : ''}`);
      } else if (window.schemkaDesktop) {
        if (!window.schemkaDesktop.saveSvg) throw Error('Обновите настольное приложение для сохранения SVG.');
        const result = await window.schemkaDesktop.saveSvg(svg, name);
        if (result.status === 'cancelled') { feedback('Сохранение изображения отменено.'); return; }
        if (result.status !== 'saved') throw Error(result.message || 'Запись не подтверждена.');
        feedback('Изображение окрестности записано на диск.');
      } else { downloader.download(svg, projectFileName(name).replace(/\.arkita$/, '.svg'), 'image/svg+xml;charset=utf-8'); feedback('SVG передан браузеру; проверьте загрузки.'); }
      if (snapshotGeneration !== generation || revision !== model.store.revision) feedback(`${$('analysis-feedback').textContent} Использован снимок графа до последующих изменений.`);
    } catch (error) { feedback(`Изображение не передано: ${error.message}`); }
    finally { exporting = false; busyControls(); }
  }
  $('analysis-export').addEventListener('click', () => imageAction(false)); $('analysis-copy').addEventListener('click', () => imageAction(true));

  function generationConcepts() { return $('analysis-generation-source').value === 'selection' ? pending.selected : pending.graphed; }
  function generationPreview() {
    if (!pending) return null;
    try {
      if (pending.store !== model.store || pending.revision !== model.store.revision) throw Error('Модель изменилась. Закройте диалог и заново проверьте создаваемый вид.');
      const plan = planGeneratedView(pending.state, { concepts: generationConcepts(), viewpointId: $('analysis-generation-viewpoint').value || null, relationshipMode: $('analysis-generation-relationships').value });
      $('analysis-generation-summary').textContent = `${plan.occurrenceCount} экземпляров · ${plan.connectionCount} соединений. Дополнительных концептов: ${plan.support.length}. Исключено: ${plan.excluded.length}. Все концепты переиспользуются; создаётся один новый вид.`;
      const list = $('analysis-generation-details'); list.replaceChildren();
      for (const [values, title] of [[plan.support, 'Добавится по режиму отношений или для сохранения концов'], [plan.excluded, 'Не войдёт в вид']]) for (const value of values) list.append(node('li', `${title}: ${label(pending.state, value)} · ${value.kind} · ${value.id}${value.reason ? ` · ${reasons[value.reason]}` : ''}`));
      $('analysis-generation-error').textContent = '';
      $('analysis-generation-submit').disabled = !plan.concepts.length || !$('analysis-generation-name').value.trim(); return plan;
    } catch (error) { $('analysis-generation-error').textContent = error.message; $('analysis-generation-submit').disabled = true; return null; }
  }
  function openGeneration(source) {
    if (blocked() || building && source === 'graph') return;
    const selected = selection(), graphed = !building && graph ? graph.nodes.map(({ kind, id }) => ({ kind, id })) : [];
    if (!(source === 'selection' ? selected : graphed).length) return;
    pending = { store: model.store, state: model.store.snapshot, revision: model.store.revision, selected, graphed };
    $('analysis-generation-source').value = source; $('analysis-generation-source').querySelector('[value="selection"]').disabled = !selected.length; $('analysis-generation-source').querySelector('[value="graph"]').disabled = !graphed.length;
    $('analysis-generation-name').value = `Окрестность — ${root ? label(pending.state, root) : 'выбранные объекты'}`.slice(0, 8100).replace(/[\uD800-\uDBFF]$/u, '');
    refreshViewpoints($('analysis-generation-viewpoint')); $('analysis-generation-viewpoint').value = $('analysis-viewpoint').value;
    $('analysis-generation-relationships').value = 'between'; openDialog('analysis-generation-dialog'); generationPreview(); $('analysis-generation-name').focus(); $('analysis-generation-name').select();
  }
  $('analysis-generate').addEventListener('click', () => openGeneration('graph')); $('analysis-generation-selection').addEventListener('click', () => { if (dock.hidden) open(); openGeneration('selection'); });
  for (const id of ['analysis-generation-source', 'analysis-generation-viewpoint', 'analysis-generation-relationships']) $(id).addEventListener('change', generationPreview);
  $('analysis-generation-name').addEventListener('input', generationPreview);
  $('analysis-generation-dialog').addEventListener('close', () => { pending = null; generation++; });
  $('analysis-generation-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pending || !generationPreview() || $('analysis-generation-submit').disabled) return;
    let applied = false;
    try {
      const result = model.execute({ type: 'generateView', concepts: generationConcepts(), name: $('analysis-generation-name').value,
        viewpointId: $('analysis-generation-viewpoint').value || null, relationshipMode: $('analysis-generation-relationships').value }, pending.revision);
      applied = true; pending = null; $('analysis-generation-dialog').close(); model.switchView(result.created.viewId); setFit(true); render(); panel('canvas');
      $('view-tabs').querySelector(`[data-view-id="${result.created.viewId}"]`)?.focus(); status('Представление создано из общих концептов. Одно Undo удалит весь новый вид.');
    } catch (error) { if (applied) status(`Представление уже создано; интерфейс обновился не полностью: ${error.message}`); else $('analysis-generation-error').textContent = error.message; }
  });

  function drawReport() {
    const list = $('analysis-quality-results'); list.replaceChildren();
    if (!report) return;
    const captured = report, current = () => report === captured && captured.revision === model.store.revision;
    const visible = report.rows.slice(0, reportPage * 100);
    for (const item of visible) {
      const row = node('li'); row.dataset.analysisRule = item.rule;
      row.append(node('strong', item.title), node('p', item.explanation));
      const targets = node('div'); let shown = 0;
      function showTargets() {
        if (!current()) return;
        targets.querySelector('[data-more-targets]')?.remove();
        for (const target of item.targets.slice(shown, shown + 100)) targets.append(button(`${label(captured.state, target)} · ${target.kind} · ${target.id}`, () => { if (current()) chooseTarget(target); }));
        shown += 100;
        if (shown < item.targets.length) { const more = button(`Ещё объекты: ${item.targets.length - shown}`, showTargets); more.dataset.moreTargets = ''; targets.append(more); }
      }
      showTargets(); row.append(targets);
      if (item.rule === 'nesting-review') {
        row.append(node('p',`Вид ${item.viewId}: родитель ${item.parentDrawingId} → вложенный рисунок ${item.childDrawingId}. ${item.contained ? 'Границы вложенного рисунка внутри родителя.' : 'Заданный родитель и границы рисунков расходятся.'}`));
        if (!item.relationshipIds.length) row.append(node('p','Между этими концептами нет явного отношения. Это кандидат для ручного рассмотрения, а не доказанная ошибка.'));
        else {
          const details = node('details'), body = node('div'); details.append(node('summary',`Существующие отношения: ${item.relationshipIds.length}`),body); let shown = 0;
          function showRelations() {
            if (!current()) return; body.querySelector('button')?.remove();
            for (const id of item.relationshipIds.slice(shown,shown+25)) {
              const relation = captured.state.relationships.find(item => item.id === id), decision = relationshipAssessment(captured.state,relation), evidence = node('details');
              body.append(node('p',`${id} · ${relation.type} · ${diagnosticPresentation(decision).summary}`));
              renderAssessmentEvidence(document,evidence,decision,relationshipTypeContext(captured.state,relation),relationshipCoverage(captured.state.project.metamodel)); body.append(evidence);
            }
            shown += 25; if (shown < item.relationshipIds.length) body.append(button(`Ещё отношения: ${item.relationshipIds.length-shown}`,showRelations));
          }
          details.addEventListener('toggle',() => {if(details.open&&!shown)showRelations();}); row.append(details);
        }
      }
      if (item.decision) { const evidence = node('details'); renderAssessmentEvidence(document, evidence, item.decision, relationshipTypeContext(report.state, conceptRecord(report.state, item.targets[0])), relationshipCoverage(report.state.project.metamodel)); row.append(evidence); }
      list.append(row);
    }
    $('analysis-quality-summary').textContent = `${report.rows.length} замечаний · показано ${visible.length}. Ревизия ${report.revision}. Проверена вся модель, включая неоткрытые виды. Включены: ${ruleNames(report.rules)}. Исключены: ${ruleNames(ruleIds.filter(id => !report.rules.includes(id)))}. Общая нормативная оценка: UNKNOWN.`;
    $('analysis-quality-more').hidden = visible.length >= report.rows.length;
    if (report.junctions) renderGraphIssues(document, list, report.junctions);
  }
  $('analysis-quality-run').addEventListener('click', () => {
    if (blocked()) return;
    try {
      const state = model.store.snapshot, revision = model.store.revision, rules = selectedRules();
      const quality = analyzeModelQuality(state, rules.filter(rule => MODEL_QUALITY_RULES.includes(rule)));
      const rows = quality.issues.map(item => ({ ...item, title: qualityText[item.rule][0], explanation: `${qualityText[item.rule][1]}${item.count ? ` Количество: ${item.count}.` : ''}` }));
      let junctions = null;
      if (rules.includes('relationships')) {
        const assessment = assessProject(state, modelProfiles); junctions = assessment.junctionAssessment;
        for (const decision of assessment.relationships) {
          const diagnostic = diagnosticPresentation(decision);
          if (diagnostic.status === 'ALLOWED') continue;
          rows.push({ rule: 'relationships', title: diagnostic.summary, explanation: 'Результат действующей ограниченной проверки типов. UNKNOWN сохраняет неопределённость и не подтверждает допустимость.', targets: [{ kind: 'relationship', id: decision.relationshipId }], decision });
        }
      }
      report = { state, revision, rows, junctions, rules }; reportPage = 1; drawReport();
    } catch (error) { report = null; $('analysis-quality-results').replaceChildren(); $('analysis-quality-more').hidden = true; $('analysis-quality-summary').textContent = `Проверка не завершена: ${error.message}`; }
  });
  $('analysis-quality-more').addEventListener('click', () => { if (report?.revision === model.store.revision) { reportPage++; drawReport(); } });
  const themeObserver = new window.MutationObserver(() => { if (!dock.hidden && !building) { generation++; paintGraph(false); busyControls(); } });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pagehide', () => { cancelPreferenceMotion(canvas); terminateBuild(); downloader.dispose(); themeObserver.disconnect(); });
  return { open, close, refresh, reset, get generation() { return generation; } };
}
