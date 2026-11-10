import {drawingFor} from './visual-drawings.js';
/** One explicit operation on the captured view, group and unchanged anchor. */
export function installAlignmentUI({ document, window, model, openDialog, render, status, blocked }) {
  const $ = id => document.getElementById(id), dialog = $('alignment-dialog');
  let request = null, generation = 0, restoreOnClose = false;
  const selectionKey = () => JSON.stringify([model.selections, model.selection]);
  const current = value => Boolean(value && value.store === model.store && value.revision === model.store.revision && value.viewId === model.viewId && value.selection === selectionKey());
  function eligibility() {
    const drawings = model.selections, count = drawings.filter(ref => ['occurrence','visualNode'].includes(ref.kind)).length;
    return { count, connections: drawings.length - count, reason: count < 2 ? 'Выберите не менее двух фигур на полотне.'
      : !['occurrence','visualNode'].includes(model.selection?.kind) ? 'Сделайте опорой фигуру: щёлкните по нему в выбранной группе.' : '' };
  }
  function cancel() {
    restoreOnClose = current(request);
    if (request) generation++;
    request = null;
    if (dialog.open) dialog.close();
  }
  function refresh() {
    const { reason } = eligibility();
    $('alignment-button').disabled = Boolean(reason);
    $('alignment-button').title = reason || 'Выравнивание и размер относительно пунктирной опоры';
    $('alignment-hint').textContent = reason || 'Пунктирная опора сохранит положение и размер.';
    if (request && !current(request)) cancel();
  }
  function open() {
    if (blocked()) { status('Завершите или отмените текущую правку перед выравниванием.'); return; }
    const { count, connections, reason } = eligibility();
    if (reason) { status(reason); return; }
    const anchor = model.selection, item = drawingFor(model.view,anchor);
    const concept = item.concept?model.store.snapshot[`${item.concept.kind}s`].find(value => value.id === item.concept.id):item;
    $('alignment-description').textContent = `Опора: ${concept.name || '(без имени)'} · ${anchor.id}. Положение и размер опоры сохранятся. Выбрано фигур: ${count}; соединений: ${connections}. Команды меняют прямоугольники экземпляров, включая junctions и визуальные аннотации. Выбранные соединения остаются в наборе; их маршруты следуют только за одинаковым сдвигом обоих концов.`;
    $('alignment-error').textContent = '';
    request = { store: model.store, revision: model.store.revision, viewId: model.viewId, selection: selectionKey() };
    generation++; openDialog('alignment-dialog');
    dialog.querySelector('[data-align]').focus();
  }
  $('alignment-button').addEventListener('click', open);
  for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
    if (event.target.closest('#alignment-button') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation(); status('Завершите или отмените текущую правку перед выравниванием.');
    }
  }, true);
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-align]');
    if (!button) return;
    if (!dialog.open || !current(request)) { cancel(); status('Выбор или модель изменились. Откройте выравнивание заново.'); return; }
    let result;
    try { result = model.alignSelection(button.dataset.align); }
    catch (error) {
      $('alignment-error').textContent = error.code === 'GEOMETRY' ? 'Один из результатов выходит за допустимые координаты или размеры. Вся группа сохранена без изменений.' : error.message;
      return;
    }
    cancel();
    try {
      render(); $('alignment-button').focus({ preventScroll: true });
      status(result ? `${button.textContent} · один шаг отмены; опора сохранена` : 'Группа уже имеет выбранное расположение или размер. История не изменилась.');
    } catch (error) { status(result ? `Изменение сохранено, но интерфейс не обновлён полностью: ${error.message}` : `Интерфейс не обновлён: ${error.message}`); }
  });
  $('alignment-cancel').addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    const restore = restoreOnClose || current(request); restoreOnClose = false;
    if (request) generation++; request = null;
    if (restore && !document.querySelector('dialog[open]') && !$('alignment-button').disabled) $('alignment-button').focus({ preventScroll: true });
  });
  window.addEventListener('pagehide', cancel);
  return { open, refresh, cancel, get generation() { return generation; } };
}
