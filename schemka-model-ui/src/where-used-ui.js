import {viewUsageLabel} from './preferences.js';
import { conceptName, conceptRecord } from './concepts.js';
import { conceptUsages, usageVisibilityText } from './concept-usages.js';

/** Read-only navigation bound to one exact model and interaction snapshot. */
export function installWhereUsed({ document, model, openDialog, navigate, restoreFocus, status, blocked = () => false, preferences = null }) {
  const $ = id => document.getElementById(id), dialog = $('where-used-dialog'), list = $('where-used-list'), error = $('where-used-error');
  let pending = null, generation = 0;
  const selectionKey = () => JSON.stringify(model.selection);
  const current = request => Boolean(request && model.store === request.store && model.store.revision === request.revision
    && model.viewId === request.viewId && selectionKey() === request.selection);
  const report = text => { try { status(text); } catch { /* A feedback failure cannot repeat navigation. */ } };
  function clear() {
    const request = pending; pending = null;
    if (request) generation++;
    for (const button of list.querySelectorAll('button')) button.disabled = true;
    return request;
  }
  function cancel(returnFocus = false) {
    const request = clear(), wasOpen = dialog.open;
    try {
      if (wasOpen) dialog.close();
      if (returnFocus && (request || wasOpen)) restoreFocus(current(request));
    } catch (failure) { report(`Список использований закрыт не полностью: ${failure.message}`); }
    return Boolean(request || wasOpen);
  }
  function choose(request, usage) {
    if (pending !== request || !dialog.open) return;
    if (!current(request)) {
      clear(); error.textContent = 'Модель, представление или выделение изменились. Закройте список и откройте его заново.'; return;
    }
    // Clear before close/navigation callbacks: old or repeated clicks cannot navigate again.
    clear();
    try {
      dialog.close();
      if (blocked() || !current(request)) {
        report('Переход отменён: состояние редактора изменилось. Дождитесь завершения операции и откройте список заново.');
        restoreFocus(false); return;
      }
      navigate(usage, request.concept);
      report(usage.hidden ? `Открыт вид «${usage.viewName || '(без названия)'}». ${usageVisibilityText(usage)}. Выбран общий концепт; viewpoint не изменён.`
        : `Открыт рисунок ${usage.id} в виде «${usage.viewName || '(без названия)'}».`);
    } catch (failure) { report(`Не удалось завершить переход к рисунку: ${failure.message}`); }
  }
  function open(concept) {
    if (pending || dialog.open || blocked()) return false;
    const store = model.store, state = store.snapshot;
    if (!conceptRecord(state, concept)) { report('Концепт для поиска использований не найден'); return false; }
    const request = { store, revision: store.revision, viewId: model.viewId, selection: selectionKey(), concept: { kind: concept.kind, id: concept.id } };
    const usages = conceptUsages(state, request.concept);
    $('where-used-reference').textContent = `${concept.kind}: «${conceptName(state, concept)}» (${concept.id}). Каждый рисунок перечислен отдельно.`;
    $('where-used-count').textContent = usages.length ? `Рисунков: ${usages.length}. Видов: ${new Set(usages.map(usage => usage.viewId)).size}.`
      : 'У этого концепта пока нет рисунков ни в одном виде.';
    error.textContent = ''; list.replaceChildren();
    for (const usage of usages) {
      const row = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'where-used-result';
      button.dataset.viewId = usage.viewId; button.dataset.drawingKind = usage.kind; button.dataset.drawingId = usage.id;
      button.dataset.hidden = String(usage.hidden);
      for (const [tag, text] of [['strong', preferences ? viewUsageLabel(usage,preferences.snapshot) : usage.viewName || '(без названия)'],
        ['span', `Папка · ${usage.folderPath}`],
        ['span', `${usage.kind === 'connection' ? 'Соединение' : 'Экземпляр'} · ${usage.id}`], ['span', `Вид · ${usage.viewId}`],
        ['span', usageVisibilityText(usage)]]) {
        const part = document.createElement(tag); part.textContent = text; button.append(part);
      }
      button.addEventListener('click', () => choose(request, usage)); row.append(button); list.append(row);
    }
    try {
      openDialog('where-used-dialog');
      if (!dialog.open) throw new Error('Диалог не открыт');
      pending = request; generation++;
      (list.querySelector('button') || $('where-used-close')).focus(); return true;
    } catch (failure) { clear(); report(`Не удалось открыть использования: ${failure.message}`); return false; }
  }
  // Preserve the draft and its focus before the app's outside-click cancellation runs.
  for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
    if (event.target.closest?.('[data-inspector-action="where-used"]') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation();
      report('Завершите или отмените текущую правку перед поиском использований.');
    }
  }, true);
  $('where-used-close').addEventListener('click', () => cancel(true));
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(true); });
  dialog.addEventListener('close', () => {
    if (!dialog.open && pending) { const request = clear(); restoreFocus(current(request)); }
  });
  return { open, cancel, get active() { return pending !== null; }, get generation() { return generation; } };
}
