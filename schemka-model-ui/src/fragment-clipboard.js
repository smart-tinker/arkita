import { captureFragment, capturePortableFragment, readPortableFragment, portableFragmentInfo, createStore, DRAWING_COLLECTIONS } from '../../schemka-model-core/src/index.js';
import { serializeFragmentText, deserializeFragmentText } from '../../schemka-model-io/src/fragment-file.js';
import { shortcutKey } from './workbench.js';

const controls = { 'fragment-paste-default':'paste', 'fragment-copy':'copy', 'fragment-cut':'cut', 'fragment-paste-reuse':'reuse', 'fragment-paste-clone':'clone', 'fragment-copy-image':'image' };
const pointSnap = value => Math.round(value * 10) / 10 || 0;
function origin(fragment) {
  const points = [...fragment.occurrences,...fragment.visualNodes].map(item => item.bounds).concat([...fragment.connections,...fragment.visualConnectors].flatMap(item => [...item.routePoints.map(route => route.point),...(item.labelPosition ? [item.labelPosition] : [])]));
  return { x:points.length ? Math.min(...points.map(point => point.x)) : 0, y:points.length ? Math.min(...points.map(point => point.y)) : 0 };
}
const selectedCreated = created => Object.entries(DRAWING_COLLECTIONS).flatMap(([kind]) => (created[`${kind}Ids`] ?? []).map(id => ({ kind,id })));

/** Local reuse remains exact and stale-checked; portable input always has an explicit clone preview. */
export function installFragmentClipboard({ document, model, session, blocked, perform, render, status, focus, readPastePoint,
  desktop = document.defaultView?.schemkaDesktop, openDialog = id => document.getElementById(id).showModal(), imageSnapshot, readPasteMode = () => 'reuse' }) {
  const $ = id => document.getElementById(id), node = (tag,text) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; };
  const defaultPaste=node('button','Вставить');defaultPaste.id='fragment-paste-default';defaultPaste.type='button';const editMenu=[...document.querySelectorAll('.app-menu')].find(item=>item.querySelector('summary')?.textContent.trim()==='Правка');if(editMenu)editMenu.querySelector('.menu-items').append(defaultPaste);else defaultPaste.hidden=true;if(!editMenu)document.body.append(defaultPaste);
  let clipboard = null, portableBuffer = null, placement = null, pending = null, generation = 0, busy = false;
  const cuts = new Map(), dialog = node('dialog'), form = node('form'), heading = node('h2','Вставить переносимую копию'), summary = node('p'), warnings = node('ul'), error = node('p'), cancelButton = node('button','Отмена'), applyButton = node('button','Вставить независимую копию');
  dialog.id = 'fragment-dialog'; dialog.className = 'fragment-dialog'; heading.id = 'fragment-heading'; dialog.setAttribute('aria-labelledby',heading.id); form.id = 'fragment-form'; error.id = 'fragment-error'; error.setAttribute('role','alert'); cancelButton.id = 'fragment-cancel'; cancelButton.type = 'button'; applyButton.id = 'fragment-apply'; applyButton.type = 'submit';
  const actions = node('div'); actions.className = 'dialog-actions'; actions.append(cancelButton,applyButton); form.append(heading,summary,warnings,error,actions); dialog.append(form); document.body.append(dialog);
  const capture = () => ({ store:model.store,token:session.documentToken,revision:model.store.revision,viewId:model.viewId,generation });
  const current = request => request && request.store === model.store && request.token === session.documentToken && request.revision === model.store.revision && request.viewId === model.viewId && request.generation === generation;
  function cancel() { const active = Boolean(pending || busy || dialog.open); pending = null; busy = false; generation++; if (dialog.open) dialog.close(); return active; }
  function currentClipboard() {
    if (clipboard && (clipboard.store !== model.store || clipboard.token !== session.documentToken)) { clipboard = null; placement = null; }
    return clipboard;
  }
  function refresh() {
    const buffer = currentClipboard();
    defaultPaste.disabled=!model.view||!(buffer||portableBuffer||desktop?.clipboardReadFragment);defaultPaste.textContent=readPasteMode()==='clone'?'Вставить: независимые концепты':'Вставить: общие концепты';defaultPaste.title='Выбранная семантика вставки. Изменяется в настройках; явные команды общих и независимых копий остаются доступны.';
    if (pending && !current(pending)) { cancel(); status('Модель или представление изменились. Вставка отменена.'); }
    if ($('fragment-copy')) $('fragment-copy').disabled = !model.selections.length;
    if ($('fragment-cut')) $('fragment-cut').disabled = !model.selections.length;
    if ($('fragment-paste-reuse')) $('fragment-paste-reuse').disabled = !buffer || !model.view;
    if ($('fragment-paste-clone')) $('fragment-paste-clone').disabled = !model.view || !(buffer || portableBuffer || desktop?.clipboardReadFragment);
    if ($('fragment-copy-image')) $('fragment-copy-image').disabled = !model.view || !imageSnapshot || !desktop?.clipboardWriteImage;
  }
  function placementFor(fragment) {
    if (!placement || placement.viewId !== model.viewId) placement = { viewId:model.viewId,point:readPastePoint(),count:0 };
    const start = origin(fragment), offset = placement.count * 24;
    return { dx:pointSnap(placement.point.x+offset-start.x),dy:pointSnap(placement.point.y+offset-start.y) };
  }
  function finishPaste(result) { placement.count++; model.selectMany(selectedCreated(result.created)); render(); focus(); }
  async function copy(cut) {
    generation++;
    const state = model.store.snapshot, fragment = captureFragment(state,model.viewId,model.selections), portable = capturePortableFragment(state,model.viewId,model.selections), request = capture();
    if (cut) { const check = createStore(state); check.execute({ type:'removeFragment',fragment },check.revision); }
    cuts.clear(); clipboard = { fragment,portable,store:model.store,token:session.documentToken,revision:model.store.revision,cut:cut ? { consumed:false } : null }; portableBuffer = { fragment:portable,cutId:null }; placement = null;
    const buffer = clipboard; refresh();
    status(`${cut ? 'Подготовлен перенос' : 'Скопировано'}: ${fragment.occurrences.length} фигур, ${fragment.connections.length} внутренних связей, ${fragment.visualNodes.length} аннотаций. ${cut ? 'Исходник остаётся до успешной вставки.' : 'Выберите reuse или независимую копию.'}`);
    if (desktop?.clipboardWriteFragment) {
      busy = true;
      let response;
      try { response = await desktop.clipboardWriteFragment({ text:serializeFragmentText(portable),token:request.token,cut }); }
      catch (failure) { if (current(request)) status(`Фрагмент сохранён только в этом окне. Системный буфер недоступен: ${failure.message}`); return; }
      finally { if (request.generation === generation) busy = false; }
      if (response?.status !== 'ok') { if (current(request)) status(`Фрагмент сохранён только в этом окне. Системный буфер недоступен: ${response?.message || response?.reason || 'ошибка записи'}`); return; }
      if (cut && response.cutId && clipboard === buffer && current(request)) { buffer.cut.cutId = response.cutId; portableBuffer.cutId = response.cutId; cuts.set(response.cutId,buffer); }
    }
  }
  function pasteLocal(buffer,action) {
    let committed = false;
    try {
      const moving = buffer.cut && !buffer.cut.consumed, command = { type:moving ? 'moveFragment' : 'pasteFragment',viewId:model.viewId,fragment:buffer.fragment,mode:action,...placementFor(buffer.fragment) };
      if (moving && buffer.revision !== model.store.revision) throw Error('Исходник переноса изменён. Подготовьте вырезание заново.');
      const result = perform(command,moving ? 'Фрагмент перенесён; Undo возвращает обе стороны.' : action === 'reuse' ? 'Вставлены рисунки общих концептов' : 'Вставлена независимая копия фрагмента'); if (!result) return;
      committed = true;
      if (moving) { buffer.cut.consumed = true; if (buffer.cut.cutId) cuts.delete(buffer.cut.cutId); clipboard = null; }
      finishPaste(result);
    } catch (failure) { status(committed ? `Вставка сохранена, но интерфейс не обновлён полностью: ${failure.message}. Не повторяйте вставку; используйте Undo при необходимости.` : `Не выполнено: ${failure.message}`); }
  }
  function showPortable(buffer,request) {
    if (!current(request) || blocked()) { status('Модель изменилась во время чтения. Вставка отменена.'); return; }
    const info = portableFragmentInfo(buffer.fragment), { source:main } = readPortableFragment(buffer.fragment);
    const stage = createStore(model.store.snapshot), result = stage.execute({ type:'pastePortableFragment',viewId:model.viewId,fragment:buffer.fragment,...placementFor(main) },stage.revision);
    summary.textContent = `Модель «${info.projectName}»: объектов ${info.concepts}, отношений ${info.relationships}, аннотаций ${info.drawings.visualNodes}, ресурсов ${info.assets}, профилей ${info.profiles.length}, связанных представлений ${info.referencedViews.length}. Все концепты и ресурсы получат новые ID; совпадения имён не объединяются.`;
    warnings.replaceChildren();
    for (const text of [...info.warnings,...info.profiles.map(name => `Будет скопирован профиль «${name}».`),...info.referencedViews.map(name => `Представление «${name}» будет скопировано целиком.`),...(buffer.cutId ? ['После успешной вставки исходное окно удалит прежние рисунки, только если исходник не менялся. В разных окнах вставка и удаление имеют отдельные Undo. При недоступном или изменённом исходнике останется копия.'] : [])]) warnings.append(node('li',text));
    error.textContent = ''; openDialog(dialog.id); if (!dialog.open) throw Error('Диалог не открылся.');
    pending = { ...request,files:stage.exportFiles(),created:result.created,cutId:buffer.cutId ?? null }; applyButton.focus();
  }
  async function pastePortable() {
    generation++;
    const request = capture(); busy = true;
    try {
      let buffer = portableBuffer;
      if (desktop?.clipboardReadFragment) {
        const response = await desktop.clipboardReadFragment();
        if (response?.status !== 'ok') throw Error(response?.message || response?.reason || 'Системный буфер недоступен.');
        buffer = { fragment:deserializeFragmentText(response.text),cutId:response.cutId ?? null };
      }
      if (!buffer) throw Error('Сначала скопируйте фрагмент Arkita.');
      if (current(request)) { busy = false; showPortable(buffer,request); }
    } catch (failure) { if (current(request)) status(`Не выполнено: ${failure.message}`); }
    finally { if (request.generation === generation) busy = false; }
  }
  async function pasteConfirmed() {
    const request = pending; if (!current(request) || !dialog.open) { cancel(); status('Модель или представление изменились. Вставка отменена.'); return; }
    let committed = false, acknowledgementStarted = false;
    try {
      const result = perform({ type:'applyProjectSnapshot',files:request.files },'Вставлена переносимая копия фрагмента'); if (!result) return;
      committed = true; pending = null; dialog.close(); finishPaste({ created:request.created });
      const delivered = capture();
      if (request.cutId && desktop?.clipboardAcknowledgeCut) {
        acknowledgementStarted = true;
        const response = await desktop.clipboardAcknowledgeCut(request.cutId,request.token);
        if (!current(delivered)) return;
        if (response?.sourceRemoved === null) { status(response.reason); return; }
        status(response?.sourceRemoved ? 'Фрагмент перенесён. Вставка и удаление отменяются в своих окнах.' : `Вставлено как копия; исходник ${response?.reason || 'изменился или недоступен'}.`);
      }
    } catch (failure) { if (committed) status(acknowledgementStarted ? `Вставка сохранена. Результат удаления исходника не подтверждён: ${failure.message}. Проверьте обе модели; не повторяйте вставку.` : `Вставка сохранена. Исходник переноса сохранён: ${failure.message}. Не повторяйте вставку.`); else error.textContent = `Не выполнено: ${failure.message}`; }
  }
  async function copyImage() {
    if (!imageSnapshot || !desktop?.clipboardWriteImage) throw Error('Буфер изображений доступен в приложении Windows.');
    generation++; const request = capture(); busy = true;
    try {
      const bytes = await imageSnapshot(); if (!current(request)) throw Error('Представление изменилось во время подготовки изображения.');
      const response = await desktop.clipboardWriteImage(bytes,request.token);
      if (!current(request)) return;
      status(response?.status === 'ok' ? 'Изображение представления скопировано в системный буфер.' : `Изображение не скопировано: ${response?.message || response?.reason || 'ошибка записи'}`);
    } catch (failure) { if (request.generation === generation) status(`Не выполнено: ${failure.message}`); }
    finally { if (request.generation === generation) busy = false; }
  }
  function run(action) {
    if(action==='paste')action=readPasteMode();
    if (blocked() || pending || busy) { status('Завершите или отмените текущую правку перед копированием или вставкой.'); return; }
    try {
      if (action === 'copy' || action === 'cut') { copy(action === 'cut').catch(failure => status(`Не выполнено: ${failure.message}`)); return; }
      if (action === 'image') { copyImage().catch(failure => status(`Не выполнено: ${failure.message}`)); return; }
      if (!model.view) { status('Откройте представление для вставки.'); return; }
      const buffer = currentClipboard(); if (buffer) { pasteLocal(buffer,action); return; }
      if (portableBuffer || desktop?.clipboardReadFragment) { pastePortable(); return; }
      refresh(); status('Сначала скопируйте рисунки в этой модели.');
    } catch (failure) { status(`Не выполнено: ${failure.message}`); }
  }
  if (desktop?.onClipboardCutDelivered) desktop.onClipboardCutDelivered(async request => {
    const buffer = cuts.get(request.cutId); cuts.delete(request.cutId); let removed = false, claimed = false, reason = 'изменился или недоступен';
    try {
      claimed = (await desktop.clipboardClaimCut?.(request.cutId,request.sourceToken))?.status === 'ok';
      if (claimed && buffer && !buffer.cut.consumed && buffer.store === model.store && buffer.token === request.sourceToken && buffer.token === session.documentToken && buffer.revision === model.store.revision && !blocked() && !pending && !busy) {
        const result = perform({ type:'removeFragment',fragment:buffer.fragment },'Исходные рисунки удалены после успешной вставки в другом окне. Undo доступен в этом окне.');
        if (result) { removed = true; buffer.cut.consumed = true; if (clipboard === buffer) clipboard = null; render(); }
      }
    } catch (failure) { reason = failure?.message || 'удаление не выполнено'; }
    try { if (claimed) await desktop.clipboardCompleteCut(request.cutId,request.sourceToken,{ removed,reason:removed ? '' : reason.slice(0,500) }); } catch { /* Destination retains its copy when acknowledgement cannot be delivered. */ }
    if (!removed) status(`Вставлено как копия в другом окне; исходник ${reason}.`); refresh();
  });
  for (const [id,action] of Object.entries(controls)) $(id)?.addEventListener('click',() => run(action));
  for (const type of ['pointerdown','click']) document.addEventListener(type,event => {
    const button = event.target.closest?.('[data-command],button');
    if (!button || !Object.hasOwn(controls,button.dataset.command || button.id) || !blocked()) return;
    event.preventDefault(); event.stopImmediatePropagation(); status('Завершите или отмените текущую правку перед копированием или вставкой.');
  },true);
  document.addEventListener('keydown',event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || !event.target.closest?.('#canvas') || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const key = shortcutKey(event); if (!['c','v','x'].includes(key) || key === 'c' && event.shiftKey) return;
    event.preventDefault(); event.stopImmediatePropagation(); run(key === 'c' ? 'copy' : key === 'x' ? 'cut' : event.shiftKey ? 'clone' : 'paste');
  },true);
  cancelButton.addEventListener('click',cancel); dialog.addEventListener('cancel',event => { event.preventDefault(); cancel(); }); form.addEventListener('submit',event => { event.preventDefault(); pasteConfirmed(); });
  refresh(); return { refresh,cancel,run,get active() { return Boolean(pending || busy); },get generation() { return generation; } };
}
