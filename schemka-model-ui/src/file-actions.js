import { installDocumentUI } from './document-ui.js';
import { FORMAT_VERSION } from '../../schemka-model-core/src/index.js';
import { createBlankModel, createDemo } from './demo.js';
import { exportMermaid, projectFileName, serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { createDownloader } from './browser-files.js';
import { assertSvgExport } from './svg-export.js';

/** DOM adapter. Model replacement is committed only by project-session. */
export function installFileActions({ document, window, model, session, inline, cancelGesture, render, status, openDialog, afterLoad, svgSnapshot = null, readDirtyMarker = () => 'circle', canSave = () => true, blocked = () => false, readInteractionGeneration = () => 0 }) {
  const $ = id => document.getElementById(id);
  const dialog = $('file-dialog');
  const desktop = window.schemkaDesktop;
  let saving = false, initializing = false, titleKey = null;
  let directory = { binding: null, issues: [] }, directoryBaseline = null;
  const bound = () => directory.binding?.documentToken === session.documentToken;
  const mismatch = () => Boolean(bound() && (!directoryBaseline || !session.matchesProject(directoryBaseline)));
  const fileBound = () => directory.file?.documentToken === session.documentToken;
  const directoryWarning = () => Boolean(directory.issues.length || mismatch() || (fileBound() && directory.file.blocked));
  function directoryResult(result) {
    if (result.directory && (!Number.isSafeInteger(result.directory.generation) || result.directory.generation >= (directory.generation ?? -1))) directory = result.directory;
  }
  async function documentCommitted(previous, current, candidate, bytes) {
    if (!desktop?.documentChanged) return;
    const result = await desktop.documentChanged(previous, current, candidate || null);
    if (session.documentToken !== current) return;
    directoryResult(result);
    if (result.status === 'error') throw Error(result.message || 'Привязка каталога не подтверждена.');
    if (session.documentToken === current) directoryBaseline = candidate ? bytes.slice() : null;
  }
  if (desktop) {
    $('desktop-directory-actions').hidden = !(desktop.openDirectory && desktop.saveDirectory);
    $('desktop-open-project').hidden = false; $('project-file').hidden = true;
    $('save-project').textContent = 'Сохранить как…';
    $('save-project-note').textContent = 'Автосохранения нет.';
  }
  const downloader = createDownloader({ document, URL: window.URL, Blob: window.Blob,
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) });
  let pending = null, dialogGeneration = 0, copyGeneration = 0, feedbackGeneration = 0, copying = false;
  let source = 'demo', listening = false;
  const beforeUnload = event => {
    // Inline/drag previews are disposable by the existing blur/cancel policy.
    // Persistent disk warnings protect leaving without making ordinary editing busy.
    if (!session.dirty && !directoryWarning()) return;
    event.preventDefault(); event.returnValue = true;
  };
  function feedback(text) { $('file-feedback').textContent = text; status(text); }
  function committedFailure(error) {
    feedback(`Модель уже загружена, история очищена, но привязка или интерфейс не обновлены полностью: ${error.message}. Не перезагружайте страницу без скачивания модели.`);
  }
  function refresh() {
    const dirty = session.dirty,marker=readDirtyMarker()==='asterisk'?'asterisk':'circle',glyph=marker==='asterisk'?'*':'●';
    const nextTitle = `${model.store.snapshot.project.name}|${dirty}|${marker}|${directory.generation || 0}`;
    if (desktop?.setDocumentTitle && nextTitle !== titleKey) { titleKey = nextTitle; desktop.setDocumentTitle(model.store.snapshot.project.name.slice(0, 200), dirty, marker).catch(() => {}); }
    const warn = dirty || directoryWarning();
    if (warn !== listening) {
      window[warn ? 'addEventListener' : 'removeEventListener']('beforeunload', beforeUnload);
      listening = warn;
    }
    $('file-button').textContent = dirty ? `Файл ${glyph}` : 'Файл';
    $('file-button').setAttribute('aria-label', dirty ? 'Файл модели · есть изменения' : 'Файл модели Arkita');
    $('file-state').dataset.dirty = String(dirty);
    $('file-state').textContent = dirty ? (desktop ? 'Есть изменения · сохраните модель' : 'Есть изменения · скачайте модель')
      : source === 'demo' ? (desktop ? 'Учебный пример · файл не сохранён' : 'Учебный пример · файл не скачан')
        : source === 'new' ? (desktop ? 'Новая модель · файл не сохранён' : 'Новая модель · файл не скачан') : source === 'git' ? 'Открыто из Git · отдельный файл не записан' : source === 'load' ? 'Без изменений после открытия'
          : desktop ? 'Без изменений после записи файла' : 'Без изменений после передачи файла';
    $('file-dialog-state').textContent = dirty ? 'Есть изменения относительно последнего открытия или переданного браузеру файла.'
      : source === 'new' ? 'Новая модель. Сохраните её в файл перед закрытием.' : source === 'demo' ? 'Учебный пример. Модель работает в памяти браузера.'
        : 'Модель совпадает с последним открытым или переданным браузеру файлом. Проверьте, что скачанный файл у вас есть.';
    if (desktop) $('file-dialog-state').textContent = dirty ? 'Есть несохранённые изменения.'
      : source === 'download' ? 'Модель совпадает с записанным на диск файлом.'
        : source === 'git' ? 'Модель открыта из Git. Отдельный файл .arkita не записан.' : source === 'load' ? 'Без изменений после открытия.' : 'Модель в памяти. Сохраните её в файл перед закрытием.';
    if (session.requiresSaveAs) {
      $('file-state').textContent = 'Формат модели обновлён · сохраните отдельную копию';
      $('file-dialog-state').textContent = `Модель открыта в формате v${FORMAT_VERSION}. Исходная модель сохранена без изменений. Используйте «Сохранить как» с новым именем или создайте новый каталог.`;
    }
    if(dirty)$('file-state').textContent=`${glyph} ${$('file-state').textContent}`;
    const view = model.view?.view;
    $('mermaid-view').textContent = view ? `Представление: ${view.name || '(без названия)'}` : 'В модели нет представлений. Экспорт недоступен.';
    if ($('svg-view')) $('svg-view').textContent = $('mermaid-view').textContent;
    if ($('download-svg')) $('download-svg').disabled = !view || !svgSnapshot || saving || Boolean(pending?.busy);
    $('download-mermaid').disabled = !view || saving || Boolean(pending?.busy);
    $('copy-mermaid').disabled = !view || copying;
    $('project-file').disabled = Boolean(pending?.busy || saving);
    $('desktop-open-project').disabled = Boolean(pending?.busy || saving);
    $('save-project').disabled = Boolean(pending?.busy || saving);
    $('desktop-open-directory').disabled = Boolean(pending?.busy || saving);
    $('desktop-save-directory').disabled = Boolean(pending?.busy || saving);
    $('desktop-save-bound-directory').disabled = session.requiresSaveAs || !bound() || directory.binding?.blocked || Boolean(pending?.busy || saving);
    const recovery = directory.issues.find(item => item.status === 'recovery-required');
    if (directory.issues.length) $('desktop-directory-actions').open = true;
    $('directory-recovery-actions').hidden = !recovery;
    $('directory-recovery-label').textContent = recovery ? `Восстановление «${recovery.name}». Меняет только каталог на диске; открытая модель и история сохраняются.` : '';
    for (const id of ['directory-restore-before', 'directory-finish-after']) $(id).disabled = !recovery || Boolean(pending?.busy || saving);
    $('directory-status').textContent = [bound() ? `Каталог: ${directory.binding.name}. ${mismatch() ? 'Открытая модель отличается от каталога.' : 'Модель совпадает с каталогом.'}` : 'Каталог не привязан к открытой модели.',
      ...directory.issues.map(item => `«${item.name}»: ${item.status === 'recovery-required' ? 'требуется восстановление; данные на диске могли измениться'
        : item.status === 'incomplete' ? 'первое сохранение не завершено. Сохраните открытую модель в другой файл или новый каталог'
          : 'внешнее изменение; запись заблокирована'}. Редактирование, экспорт и новый каталог доступны.`)].join(' ');
    $('new-project').disabled = Boolean(pending?.busy || saving); $('reset-example').disabled = Boolean(pending?.busy || saving);
    $('load-project').disabled = !pending || pending.busy || saving;
  }
  function cancelLoad() {
    const token = pending?.committedToken, generation = dialogGeneration;
    const committed = token === session.documentToken;
    if (pending && !pending.committedToken) { session.cancelLoad(pending.ticket); pending.onCancel?.(); }
    pending = null; $('project-file').value = ''; $('replace-project').hidden = true;
    if (committed) {
      try { render(); } catch (error) {
        refresh();
        if (session.documentToken === token && !pending && dialogGeneration === generation) committedFailure(error);
        return false;
      }
    } else refresh();
    return !committed || (session.documentToken === token && !pending && dialogGeneration === generation);
  }
  $('file-button').addEventListener('click', () => {
    if (blocked()) return;
    dialogGeneration++; cancelLoad(); $('file-feedback').textContent = '';
    openDialog('file-dialog'); refresh();
  });
  dialog.addEventListener('close', () => {
    dialogGeneration++; copyGeneration++; copying = false; cancelLoad();
  });
  function proposeReplacement(file, sourceKind = 'load', request = null) {
    if (saving) return;
    feedbackGeneration++;
    if (!request) cancelLoad();
    if (!file) return;
    pending = request || { ticket: session.beginLoad(), draftGeneration: inline.generation, interactionGeneration: readInteractionGeneration() };
    Object.assign(pending, { file, sourceKind, busy: false });
    $('replace-description').textContent = `Открыть «${file.name}» (${file.size} байт)? ${session.dirty ? 'Текущие изменения будут потеряны, если вы не сохранили модель.' : 'Текущая модель будет заменена.'}`;
    $('replace-project').hidden = false; $('file-feedback').textContent = ''; refresh();
  }
  $('project-file').addEventListener('change', () => { if (!desktop) proposeReplacement($('project-file').files?.[0]); });
  for (const [id, method] of [['desktop-open-project', 'openProject'], ['desktop-open-directory', 'openDirectory']]) $(id).addEventListener('click', async () => {
    if (!desktop?.[method] || pending?.busy || saving || blocked()) return;
    feedbackGeneration++; cancelLoad();
    const request = pending = { ticket: session.beginLoad(), draftGeneration: inline.generation,
      interactionGeneration: readInteractionGeneration(), busy: true };
    refresh();
    try {
      const result = await desktop[method](session.documentToken);
      directoryResult(result);
      if (pending !== request || !dialog.open) return;
      if (['opened-window', 'focused'].includes(result.status)) { cancelLoad(); feedback(result.status === 'focused' ? 'Модель уже открыта: её окно активировано.' : 'Модель открыта в отдельном окне. Текущая модель сохранена.'); return; }
      if (result.status === 'cancelled') { cancelLoad(); feedback('Выбор файла отменён. Модель и история не изменены.'); return; }
      if (result.status === 'recovered') {
        cancelLoad(); $('desktop-open-project').focus();
        feedback(`${result.message || `Файл «${result.name}» восстановлен на диске. Открытая модель и история не изменены.`}${result.warning ? ` ${result.warning}` : ''}`); return;
      }
      if (result.status !== 'opened') throw Error(result.message || 'Не удалось открыть файл.');
      const bytes = result.bytes;
      request.candidate = result.candidate; request.bytes = bytes; request.recovered = result.recovered; request.warning = result.warning;
      const file = { name: result.name, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
      proposeReplacement(file, 'load', request);
      if (result.recovered) feedback(`Файл «${result.name}» восстановлен на диске. Подтвердите открытие, чтобы заменить текущую модель.${result.warning ? ` ${result.warning}` : ''}`);
    } catch (error) {
      if (pending !== request) return;
      cancelLoad(); feedback(`Файл не открыт: ${error.message}. Модель и история сохранены.`);
    } finally { refresh(); }
  });
  for (const [id, factory, sourceKind] of [['new-project', createBlankModel, 'new'], ['reset-example', createDemo, 'demo']]) {
    $(id).addEventListener('click', () => {
      if (pending?.busy || saving || blocked()) return;
      if (id === 'new-project' && desktop?.newDocument) { desktop.newDocument().then(result => { if (result.status !== 'opened-window') throw Error(result.message || 'Не удалось открыть окно.'); feedback('Новая модель открыта в отдельном окне.'); }).catch(error => feedback(error.message)); return; }
      try {
        const state = factory().snapshot, file = new window.Blob([serializeProjectFile(state)], { type: 'application/json' });
        Object.defineProperty(file, 'name', { value: state.project.name });
        proposeReplacement(file, sourceKind);
      } catch (error) { feedback(`Новая модель не подготовлена: ${error.message}`); }
    });
  }
  $('cancel-load').addEventListener('click', () => {
    feedbackGeneration++; const recovered = pending?.recovered, committed = pending?.committedToken, cancelled = cancelLoad(); $(desktop ? 'desktop-open-project' : 'project-file').focus();
    if (cancelled) feedback(committed ? 'Модель уже загружена. Ожидание привязки продолжается в фоне.'
      : `Открытие отменено.${recovered ? ' Восстановленный файл остаётся на диске.' : ''} Модель и история не изменены.`);
  });
  async function commitLoad() {
    const request = pending;
    if (!request || request.busy || saving) return;
    feedbackGeneration++;
    request.busy = true; refresh(); feedback('Проверка файла…');
    let loaded = false, interfaceReset = false, committedToken, interfaceError;
    const previousToken = session.documentToken;
    try {
      await session.loadFile(request.ticket, request.file, {
        isCurrent: () => pending === request && dialog.open && inline.generation === request.draftGeneration && readInteractionGeneration() === request.interactionGeneration,
      });
      loaded = true; committedToken = request.committedToken = session.documentToken;
      if (request.unsaved) session.clearSavedBaseline();
      // Reset editor state before native acknowledgment can yield to a newer dialog or document.
      source = request.sourceKind; interfaceReset = true;
      try { afterLoad(); } catch (error) { interfaceError = error; }
      await documentCommitted(previousToken, committedToken, request.candidate, request.bytes);
      if (session.documentToken !== committedToken) return;
      await request.afterCommit?.(committedToken);
      if (session.documentToken !== committedToken || pending !== request) return;
      if (interfaceError) throw interfaceError;
      pending = null;
      dialog.close();
      const generation = dialogGeneration;
      try { render(); } catch (error) { interfaceError = error; }
      if (session.documentToken !== committedToken || pending || dialogGeneration !== generation) return;
      if (interfaceError) { committedFailure(interfaceError); return; }
      feedback((session.requiresSaveAs ? `Модель обновлена до v${FORMAT_VERSION} в памяти. Исходник не изменён. Сохраните модель отдельным файлом или в новый каталог.`
        : request.sourceKind === 'template' ? 'Модель создана из шаблона. Сохраните её отдельным файлом.' : request.sourceKind === 'import' ? 'Модель импортирована. Сохраните её отдельным файлом.' : request.sourceKind === 'git' ? 'Модель открыта из Git. История отмены очищена; отдельный файл .arkita не записан.' : 'Модель открыта. Все виды и ID сохранены; история отмены очищена.') + (request.warning ? ` ${request.warning}` : ''));
    } catch (error) {
      if (loaded) {
        if (session.documentToken !== committedToken || pending !== request) return;
        pending = null; $('replace-project').hidden = true;
        const generation = dialogGeneration;
        try { if (!interfaceReset) afterLoad(); render(); } catch { /* Keep the committed model available for a separate save. */ }
        if (session.documentToken === committedToken && !pending && dialogGeneration === generation) committedFailure(error);
        return;
      }
      if (pending !== request) return; // a newer choice/close owns the UI now
      session.cancelLoad(request.ticket); pending = null;
      $('replace-project').hidden = true;
      refresh();
      if (!inline.active && dialog.open) $(desktop ? 'desktop-open-project' : 'project-file').focus();
      feedback(`${request.recovered ? 'Файл восстановлен на диске, но не открыт' : 'Файл не открыт'}: ${error.message}. Текущая модель и история сохранены. Выберите файл заново.`);
    } finally { if (pending === request) request.busy = false; refresh(); }
  }
  $('load-project').addEventListener('click', commitLoad);
  async function save(method = session.requiresSaveAs ? 'saveProject' : desktop?.saveCurrentProject && fileBound() ? 'saveCurrentProject' : desktop?.saveBoundDirectory && bound() ? 'saveBoundDirectory' : 'saveProject') {
    if (pending?.busy || saving || blocked() || (method !== 'saveProject' && !desktop?.[method])) return;
    if (!canSave()) { feedback('Завершите или отмените текущую правку перед сохранением.'); return; }
    if (session.requiresSaveAs && !['saveProject', 'saveDirectory'].includes(method)) { feedback('Формат модели обновлён. Сохраните отдельную копию через «Сохранить как».'); return; }
    // Save As consumes the native candidate; a proposed open must not commit its stale ID.
    if (pending) { cancelLoad(); feedback('Выбор открываемой модели отменён перед сохранением. Выберите файл заново после записи.'); }
    const feedbackId = ++feedbackGeneration, generation = dialogGeneration;
    const current = () => feedbackId === feedbackGeneration && generation === dialogGeneration;
    inline.cancel(false); cancelGesture();
    let written = false, savedName = '', nativeResult;
    const savedToken = session.documentToken;
    try {
      const ticket = session.prepareSave();
      if (desktop) {
        saving = true; refresh();
        const result = nativeResult = await desktop[method](ticket.bytes, savedToken);
        directoryResult(result);
        if (result.status === 'cancelled') { if (current()) feedback('Сохранение отменено.'); return; }
        if (result.status !== 'saved') throw Error(result.message || 'Запись файла не подтверждена.');
        written = true; savedName = result.name || '';
      } else downloader.download(ticket.bytes, ticket.name, 'application/json;charset=utf-8');
      const result = session.completeSave(ticket, { saveAs: !desktop || ['saveProject', 'saveDirectory'].includes(method) });
      if (method === 'saveDirectory' || (method === 'saveProject' && nativeResult?.candidate)) await documentCommitted(savedToken, savedToken, nativeResult.candidate, ticket.bytes);
      if (method === 'saveBoundDirectory' && session.documentToken === savedToken && nativeResult.bindingId === directory.binding?.id) directoryBaseline = ticket.bytes.slice();
      source = 'download'; refresh();
      if (current()) feedback(desktop
        ? (['saveDirectory', 'saveBoundDirectory'].includes(method) ? `Каталог «${savedName}» записан и проверен.${result.dirty ? ' Более новые изменения ещё не сохранены.' : ''}` : result.dirty ? 'Снимок записан на диск. Более новые изменения ещё не сохранены.' : `Модель «${savedName}» записана на диск.`) + (nativeResult.warning ? ` ${nativeResult.warning}` : '')
        : 'Файл передан браузеру; проверьте загрузку. Запись на диск не подтверждается приложением.');
    } catch (error) {
      if (current()) feedback(written ? `Файл записан, но открытая модель уже изменилась: ${error.message}`
        : `${desktop ? 'Сохранение' : 'Скачивание'} не выполнено: ${error.message}`);
    } finally { saving = false; refresh(); }
  }
  for (const [id, method] of [['save-project', 'saveProject'], ['desktop-save-directory', 'saveDirectory'], ['desktop-save-bound-directory', 'saveBoundDirectory']]) $(id).addEventListener('click', () => save(method));
  for (const [id, side] of [['directory-restore-before', 'before'], ['directory-finish-after', 'after']]) $(id).addEventListener('click', async () => {
    if (saving || pending?.busy || blocked() || !desktop?.recoverDirectory) return;
    const recovery = directory.issues.find(item => item.status === 'recovery-required');
    if (!recovery) return;
    saving = true; refresh();
    try {
      const result = await desktop.recoverDirectory(recovery.id, side); directoryResult(result);
      if (result.status !== 'recovered') throw Error(result.message || 'Восстановление не подтверждено.');
      if (result.boundToken === session.documentToken && result.boundId === directory.binding?.id && result.boundBytes) directoryBaseline = result.boundBytes.slice();
      feedback(`Каталог «${result.name}» восстановлен. Открытая модель и история не изменены. ${result.warning || ''}`);
    } catch (error) { feedback(`Восстановление остановлено: ${error.message}. Сохраните открытую модель в другой файл или новый каталог.`); }
    finally { saving = false; refresh(); }
  });
  function mermaidSnapshot() {
    const state = model.store.snapshot, viewId = model.viewId;
    const view = state.views.find(entry => entry.view.id === viewId)?.view;
    return { text: exportMermaid(state, viewId), revision: model.store.revision, viewId,
      name: projectFileName(view.name).replace(/\.arkita$/, '.mmd') };
  }
  $('download-svg')?.addEventListener('click', async () => {
    if (saving || pending?.busy || blocked() || !svgSnapshot || !model.view?.view) return;
    if (!canSave()) { feedback('Завершите или отмените текущую правку перед экспортом SVG.'); return; }
    const feedbackId = ++feedbackGeneration, generation = dialogGeneration;
    const store = model.store, revision = store.revision, viewId = model.viewId, documentToken = session.documentToken;
    const title = model.view.view.name;
    const current = () => feedbackId === feedbackGeneration && generation === dialogGeneration && dialog.open;
    const unchanged = () => model.store === store && store.revision === revision && model.viewId === viewId && session.documentToken === documentToken;
    try {
      const text = assertSvgExport(svgSnapshot());
      if (desktop) {
        if (!desktop.saveSvg) throw Error('Обновите настольное приложение для экспорта SVG.');
        saving = true; refresh();
        const result = await desktop.saveSvg(text, title);
        if (result.status === 'cancelled') { if (current()) feedback('Экспорт SVG отменён.'); return; }
        if (result.status !== 'saved') throw Error(result.message || 'Запись SVG не подтверждена.');
        if (current()) feedback((unchanged() ? 'SVG текущего представления записан на диск. Модель этим действием не сохранена.' : 'SVG прежнего представления записан на диск. Модель или выбранный вид уже изменились.') + (result.warning ? ` ${result.warning}` : ''));
      } else {
        downloader.download(text, projectFileName(title).replace(/\.arkita$/, '.svg'), 'image/svg+xml;charset=utf-8');
        if (current()) feedback('SVG передан браузеру; проверьте загрузку. Модель этим действием не сохранена.');
      }
    } catch (error) { if (current()) feedback(`SVG не выгружен: ${error.message}`); }
    finally { saving = false; refresh(); }
  });
  $('download-mermaid').addEventListener('click', async () => {
    if (saving || pending?.busy) return;
    const feedbackId = ++feedbackGeneration, generation = dialogGeneration;
    const current = () => feedbackId === feedbackGeneration && generation === dialogGeneration;
    try {
      const snapshot = mermaidSnapshot();
      if (desktop) {
        saving = true; refresh();
        const result = await desktop.saveMermaid(snapshot.text);
        if (result.status === 'cancelled') { if (current()) feedback('Экспорт отменён.'); return; }
        if (result.status !== 'saved') throw Error(result.message || 'Запись не подтверждена.');
        if (current()) feedback(`Mermaid записан на диск. Это проекция вида, не сохранение модели.${result.warning ? ` ${result.warning}` : ''}`);
      } else {
        downloader.download(snapshot.text, snapshot.name, 'text/plain;charset=utf-8');
        feedback('Mermaid передан браузеру; проверьте загрузку. Это проекция вида, не сохранение модели.');
      }
    } catch (error) { if (current()) feedback(`Mermaid не выгружен: ${error.message}`); }
    finally { saving = false; refresh(); }
  });
  $('copy-mermaid').addEventListener('click', async () => {
    if (copying) return;
    const operation = ++copyGeneration, generation = dialogGeneration, feedbackId = ++feedbackGeneration;
    let snapshot;
    const current = () => operation === copyGeneration && generation === dialogGeneration && feedbackId === feedbackGeneration && dialog.open;
    try {
      snapshot = mermaidSnapshot();
      if (!window.navigator.clipboard?.writeText) throw new Error('Буфер обмена недоступен. Скачайте .mmd');
      copying = true; refresh(); feedback('Копирование Mermaid…');
      await window.navigator.clipboard.writeText(snapshot.text);
      if (current()) feedback(snapshot.revision === model.store.revision && snapshot.viewId === model.viewId
        ? 'Mermaid текущего вида скопирован. Модель не сохранена этим действием.'
        : 'Скопирован снимок прежнего вида. Модель или выбранный вид уже изменились.');
    } catch (error) { if (current()) feedback(`Не скопировано: ${error.message}`); }
    finally { if (operation === copyGeneration) { copying = false; refresh(); } }
  });
  function proposeExternal({ bytes, name, source: externalSource = 'git', unsaved = false, afterCommit, onCancel }) {
    if (!['git', 'template', 'import'].includes(externalSource) || typeof unsaved !== 'boolean') throw Error('Неизвестный источник модели.');
    if (saving || pending?.busy) return false;
    if (desktop?.newDocument && externalSource !== 'git' && !afterCommit) {
      desktop.newDocument({ bytes, name, source: externalSource }).then(result => { if (result.status !== 'opened-window') throw Error(result.message || 'Не удалось открыть модель.'); feedback('Модель создана в отдельном окне. Сохраните её отдельным файлом.'); }).catch(error => feedback(error.message)); return true;
    }
    dialogGeneration++; cancelLoad(); openDialog('file-dialog');
    const owned = bytes.slice();
    const request = { ticket: session.beginLoad(), draftGeneration: inline.generation,
      interactionGeneration: readInteractionGeneration(), afterCommit, onCancel, unsaved };
    proposeReplacement({ name, size: owned.byteLength, arrayBuffer: async () => owned.slice().buffer }, externalSource, request);
    return true;
  }
  async function initializeDocument() {
    if (!desktop?.documentReady) return;
    initializing = true;
    openDialog('file-dialog');
    const request = pending = { ticket: session.beginLoad(), draftGeneration: inline.generation, interactionGeneration: readInteractionGeneration(), busy: true };
    refresh();
    try {
      const result = await desktop.documentReady(session.documentToken);
      if (pending !== request) return;
      if (result.status === 'none') { cancelLoad(); dialog.close(); return; }
      if (!['new', 'opened', 'external'].includes(result.status)) throw Error(result.message || 'Не удалось открыть модель этого окна.');
      const bytes = result.status === 'new' ? serializeProjectFile(createBlankModel().snapshot) : result.bytes;
      request.candidate = result.candidate; request.bytes = bytes; request.unsaved = result.status === 'external';
      proposeReplacement({ name: result.name || 'Новая модель', size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer }, result.status === 'new' ? 'new' : result.status === 'external' ? result.source : 'load', request);
      await commitLoad();
    } catch (error) { cancelLoad(); feedback(`Модель не открыта: ${error.message}`); }
    finally { initializing = false; refresh(); }
  }
  $('desktop-close-document')?.addEventListener('click', () => { if (desktop?.closeDocument && !saving && !pending?.busy) desktop.closeDocument(); });
  if ($('desktop-close-document')) $('desktop-close-document').hidden = !desktop?.closeDocument;
  const unsubscribeClose = desktop?.onSaveAndClose?.(async request => {
    if (saving || initializing || pending?.busy || blocked()) return;
    const token = session.documentToken;
    await save();
    if (token === session.documentToken && !session.dirty && !directoryWarning() && !saving && !pending) await desktop.finishSaveClose(request, token);
  });
  document.addEventListener('dragover', event => { if (desktop?.openDroppedFile && [...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
  document.addEventListener('drop', async event => {
    if (!desktop?.openDroppedFile || !event.dataTransfer?.files?.length) return;
    event.preventDefault(); event.stopPropagation();
    if (saving || initializing || pending?.busy || blocked()) { feedback('Завершите текущую операцию перед открытием файла.'); return; }
    const dropped = [...event.dataTransfer.files];
    if (dropped.length !== 1 || !dropped[0].name.toLowerCase().endsWith('.arkita')) { feedback('Перетащите один файл .arkita. Открытая модель не изменена.'); return; }
    try {
      const result = await desktop.openDroppedFile(dropped[0]);
      if (!['opened-window', 'focused', 'cancelled'].includes(result.status)) throw Error(result.message || 'Файл не открыт.');
      feedback(result.status === 'cancelled' ? 'Открытие отменено.' : result.status === 'focused' ? 'Модель уже открыта: её окно активировано.' : 'Модель открыта в отдельном окне.');
    } catch (error) { feedback(`Файл не открыт: ${error.message}. Текущая модель не изменена.`); }
  }, true);
  installDocumentUI({ document, window, session, status, openDialog });
  // Capture the startup guard after the app has mounted its synchronous editor modules.
  initializing = Boolean(desktop?.documentReady);
  void Promise.resolve().then(initializeDocument);
  window.addEventListener('pagehide', () => unsubscribeClose?.());
  window.addEventListener('pagehide', () => downloader.dispose());
  return { refresh, save, proposeExternal, get directoryWarning() { return directoryWarning(); }, get directoryMismatch() { return mismatch(); }, get transient() { return Boolean(pending || copying || saving || initializing); }, get sourceLabel() { return source === 'demo' ? 'Синтетический пример' : source === 'new' ? 'Новая модель' : source === 'git' ? 'Модель из Git' : source === 'template' ? 'Модель из шаблона' : source === 'import' ? 'Импортированная модель' : 'Модель из текущей файловой сессии'; } };
}
