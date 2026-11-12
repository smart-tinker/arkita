import { LIMITS, metadataRecord } from '../../schemka-model-core/src/index.js';
import { reportMarkdown } from '../../schemka-model-io/src/report-markdown.js';

/** Exact raw documentation with an inert Markdown projection; links cross the native host boundary explicitly. */
export function installDocumentationEditor({ document, model, session = null, openDialog, render, status, blocked = () => false }) {
  const $ = id => document.getElementById(id), dialog = $('documentation-dialog');
  const form = $('documentation-form'), value = $('documentation-value'), error = $('documentation-error'), apply = $('documentation-apply');
  const modes = document.createElement('div'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Режим документации');
  const edit = document.createElement('button'), view = document.createElement('button'), preview = document.createElement('div');
  for (const [button, id, text] of [[edit, 'documentation-edit', 'Редактировать'], [view, 'documentation-view', 'Просмотр Markdown']]) { button.type = 'button'; button.id = id; button.textContent = text; modes.append(button); }
  preview.id = 'documentation-preview'; preview.hidden = true; preview.tabIndex = 0; preview.setAttribute('role', 'region'); preview.setAttribute('aria-label', 'Предпросмотр документации');
  value.before(modes); value.after(preview);
  let pending = null, generation = 0, linkBusy = false;
  const report = text => { try { status(text); } catch { /* Feedback cannot repeat a commit. */ } };
  const selectionKey = () => JSON.stringify(model.selection);
  // Textareas normalize line endings; untouched/reverted text retains the original bytes.
  const rawValue = () => value.value === pending.initialDOMValue ? pending.initialRaw : value.value;
  const exact = request => model.store === request.store && model.store.revision === request.revision && model.viewId === request.viewId && selectionKey() === request.selection && (session?.documentToken ?? null) === request.token;
  function refresh() { apply.disabled = !pending || rawValue().length > LIMITS.string; }
  function showMode(reading) {
    if (!pending) return false;
    if (!exact(pending)) { error.textContent = 'Модель, представление или выделение изменились. Закройте диалог и начните правку заново.'; return false; }
    if (reading && rawValue().length > LIMITS.string) { error.textContent = `Документация не должна превышать ${LIMITS.string} единиц UTF-16.`; return false; }
    if (reading) preview.innerHTML = reportMarkdown(rawValue(), { externalLinks: true, fileLinks: true });
    preview.hidden = !reading; value.hidden = reading; edit.setAttribute('aria-pressed', String(!reading)); view.setAttribute('aria-pressed', String(reading));
    (reading ? preview : value).focus(); return true;
  }
  async function openLink(input) {
    if (linkBusy) return false;
    const request = pending ?? { store: model.store, revision: model.store.revision, viewId: model.viewId, selection: selectionKey(), token: session?.documentToken ?? null }, stamp = generation;
    const current = () => stamp === generation && exact(request);
    const notify = message => { if (current()) { if (pending) error.textContent = message; report(message); } };
    if (!exact(request)) { error.textContent = 'Модель изменилась. Откройте документацию заново.'; report(error.textContent); return false; }
    let url, localFile = false;
    try {
      url = new URL(input); localFile = url.protocol === 'file:';
      if (typeof input !== 'string' || input.length > 2048 || /[\p{Cc}\p{Cf}\s]/u.test(input)
        || !(['http:', 'https:'].includes(url.protocol) || localFile) || (localFile && ((url.hostname && url.hostname !== 'localhost') || url.pathname.startsWith('//')))
        || (localFile && (url.search || url.hash)) || (!localFile && !url.hostname) || url.username || url.password) throw Error();
    } catch { notify('Открытие поддерживает HTTP/HTTPS и локальные file:// ссылки без параметров. Другие схемы не открываются.'); return false; }
    const desktop = document.defaultView?.schemkaDesktop;
    const action = localFile ? desktop?.openFileLink : desktop?.openExternalLink;
    if (!action || !session) { notify('Открытие ссылок доступно в настольном приложении Arkita.'); return false; }
    linkBusy = true;
    try { const result = await action.call(desktop, url.href, request.token); if (!current()) return false;
      if (result.status === 'error') throw Error(result.message || (localFile ? 'Windows не открыл файл.' : 'Системный браузер не открыл ссылку.'));
      notify(result.status === 'cancelled' ? 'Открытие ссылки отменено.' : localFile ? 'Файл передан обработчику Windows.' : 'Ссылка передана системному браузеру.'); return result.status === 'opened';
    } catch (failure) { notify(`Ссылка не открыта: ${failure.message}`); return false; }
    finally { linkBusy = false; }
  }
  edit.addEventListener('click', () => showMode(false)); view.addEventListener('click', () => showMode(true));
  preview.addEventListener('click', event => { const anchor = event.target.closest('a[href]'); if (!anchor || !preview.contains(anchor)) return; event.preventDefault(); event.stopPropagation(); void openLink(anchor.getAttribute('href')); });
  function clearPending() {
    const existed = pending !== null;
    pending = null; apply.disabled = true; preview.replaceChildren(); preview.hidden = true; value.hidden = false;
    if (existed) generation++;
    return existed;
  }
  function closeDialog() { if (dialog.open) dialog.close(); }
  function cancel() {
    const wasOpen = dialog.open, existed = clearPending();
    if (!existed && wasOpen) generation++;
    try { closeDialog(); } catch (failure) { report(`Правка отменена, но диалог не закрыт: ${failure.message}`); }
    return existed || wasOpen;
  }
  function open(concept) {
    if (pending || blocked()) return false;
    const store = model.store;
    let item;
    try { item = metadataRecord(store.snapshot, concept); }
    catch { report('Владелец документации не найден'); return false; }
    value.maxLength = LIMITS.string; value.value = item.documentation;
    const request = { concept: { ...concept }, store, revision: store.revision, viewId: model.viewId,
      selection: selectionKey(), token: session?.documentToken ?? null, initialRaw: item.documentation, initialDOMValue: value.value };
    error.textContent = '';
    $('documentation-reference').textContent = `${concept.kind}: «${item.name || item.label || '(без названия)'}» (${item.id}). ${concept.kind === 'project' ? 'Документация всей модели.' : concept.kind === 'view' ? 'Документация этого представления.' : 'Общая документация концепта во всех представлениях.'}`;
    try {
      // Opening a modal cancels earlier gestures; install the request after that boundary.
      openDialog('documentation-dialog');
      if (!dialog.open) throw new Error('Диалог не открыт');
      pending = request; generation++; refresh(); showMode(false); return true;
    } catch (failure) {
      clearPending(); report(`Не удалось открыть документацию: ${failure.message}`); return false;
    }
  }
  value.addEventListener('input', () => { if (pending) { generation++; error.textContent = ''; refresh(); } });
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => { if (!dialog.open) clearPending(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!pending) return;
    generation++;
    if (!dialog.open) { clearPending(); return; }
    const request = pending;
    if (!exact(request)) {
      clearPending(); error.textContent = 'Модель, представление или выделение изменились. Закройте диалог и начните правку заново.'; return;
    }
    const documentation = rawValue();
    if (documentation.length > LIMITS.string) {
      refresh(); error.textContent = `Документация не должна превышать ${LIMITS.string} единиц UTF-16; сейчас ${documentation.length}.`; value.focus(); return;
    }
    const changed = documentation !== request.initialRaw;
    // Clear before execution and post-commit callbacks, including reentrant submissions.
    clearPending();
    let committed = false;
    try {
      if (changed) {
        request.store.execute({ type: 'updateMetadata', owner: request.concept, documentation }, request.revision);
        committed = true;
      }
      closeDialog();
      if (committed) render();
      report(committed ? 'Документация сохранена' : 'Документация не изменена');
    } catch (failure) {
      if (committed) report(`Документация сохранена, но интерфейс не обновлён полностью: ${failure.message}`);
      else error.textContent = changed ? `Документация не изменена: ${failure.message}. Закройте диалог и повторите правку.`
        : `Документация не изменена, но диалог не закрыт: ${failure.message}`;
    }
  });
  refresh();
  return { open, cancel, openLink, get transient() { return linkBusy; }, get active() { return pending !== null; }, get generation() { return generation; } };
}
