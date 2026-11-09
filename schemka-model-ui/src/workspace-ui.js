const STORAGE_KEY = 'arkita.workspace.v1';
export { WORKSPACE_DEFAULTS, workspacePreferences } from '../../schemka-model-io/src/preferences-profile.js';
import { WORKSPACE_DEFAULTS, WORKSPACE_ORDERS, workspacePreferences } from '../../schemka-model-io/src/preferences-profile.js';
const categories=['elements','junctions','relationships','views'];
const categoryNames=['Элементы','Узлы связей','Отношения','Представления'];

const HELP = [
  ['overview', 'Начало работы', 'Arkita редактирует модели ArchiMate 4. Слева находятся общие концепты и представления, справа — палитра типов, в центре — активное представление. Один концепт может иметь несколько рисунков в разных видах.'],
  ['catalog', 'Каталог и поиск', 'Каталог содержит концепты всей модели, в том числе без рисунков. Поиск (Ctrl+F) проверяет имя, ID, документацию и пользовательские свойства по всей модели. Фильтр и скрытие категорий меняют отображение. Они не удаляют данные. Одинаковые названия различайте по ID.'],
  ['canvas', 'Диаграмма и выбор', 'Щелчок выбирает рисунок. Shift+щелчок изменяет состав выделения; рамка выбирает рисунки на полотне. Перетаскивание и стрелки перемещают выбор, одна завершённая операция отменяется одним Undo. Имя и свойства принадлежат общему концепту, положение — рисунку в конкретном виде.'],
  ['palette', 'Создание элементов и связей', 'Найдите тип в палитре. Элемент можно перетащить на полотно. Для отношения выберите инструмент связи и конкретные концы. Проверка использует профиль ArchiMate 4; UNKNOWN означает, что допустимость не установлена. Escape отменяет незавершённое создание.'],
  ['properties', 'Документация и свойства', 'Откройте свойства выбранного объекта. Имя, документация и пользовательские свойства относятся к показанному владельцу. Изменение общего концепта видно во всех его рисунках. Применение и отмена правки — отдельные действия; текст не выполняется как HTML или код.'],
  ['files', 'Сохранение и восстановление', 'Ctrl+S сохраняет текущую модель, Ctrl+Shift+S открывает «Сохранить как». Смотрите на состояние файла: завершённая загрузка в браузере и запись на диск в desktop различаются. При конфликте с внешним изменением сохранение требует разрешения конфликта. Ошибка не является подтверждением записи.'],
  ['views', 'Представления и viewpoint', 'Представления используют общие концепты и собственные координаты рисунков. Дублирование вида сохраняет общие концепты. Viewpoint определяет отображаемые типы; скрытый рисунок продолжает храниться в модели. Удаление из вида отличается от удаления концепта из всей модели.'],
  ['clipboard', 'Копирование фрагмента', 'На полотне Ctrl+C копирует выбранный фрагмент. Ctrl+V создаёт новые рисунки общих концептов; Ctrl+Shift+V создаёт независимые концепты и рисунки. Одна вставка отменяется одним Undo. Перед вставкой редактор проверяет совместимость и актуальность фрагмента.'],
  ['git', 'Работа через Git', 'Сохранение записывает модель на диск. Commit фиксирует локальную версию. Push публикует коммиты в выбранную удалённую ветку. Получение и объединение изменений проходит проверку модели; неразрешённые конфликты требуют явного выбора. Ошибка сети не отменяет уже созданный локальный commit.'],
  ['workspace', 'Панели и клавиатура', 'Меню «Вид → Рабочее пространство» меняет локальные настройки дерева и палитры. «Восстановить панели» возвращает исходную компоновку. F1 открывает справку по текущей области, F11 включает или выключает полный экран. Эти действия не меняют модель и историю.'],
];
const TUTORIAL = [
  ['Откройте модель', 'В меню «Файл» создайте новую модель или откройте учебный пример. Если уже работаете со своей моделью, сохраните её перед заменой.', 'new'],
  ['Добавьте элемент', 'Найдите подходящий тип в правой палитре и перетащите его на полотно. Дайте концепту понятное имя.', 'palette-search'],
  ['Создайте отношение', 'Добавьте второй элемент. Команда «Модель → Создать связь» позволяет выбрать тип и точные концы; прочитайте результат проверки.', 'smart-link-dialog'],
  ['Покажите концепт в другом виде', 'Создайте представление кнопкой ＋. Добавьте в него существующий концепт из дерева. Переименуйте концепт и проверьте его имя в обоих видах.', 'new-view'],
  ['Проверьте историю', 'Переместите рисунок, затем выполните Undo и Redo. Убедитесь, что восстанавливается именно это действие.', 'undo'],
  ['Сохраните и откройте', 'Сохраните модель отдельным файлом, затем откройте её и проверьте представления и свойства. Только успешная запись подтверждает сохранение.', 'file-button'],
];

export function helpContext(element) {
  if (element?.closest('#model-search-region,.catalog')) return 'catalog';
  if (element?.closest('.toolbox')) return 'palette';
  if (element?.closest('#inspector-panel,#metadata-dialog,#documentation-dialog,#object-properties-dialog')) return 'properties';
  if (element?.closest('#git-dialog')) return 'git';
  if (element?.closest('#file-dialog')) return 'files';
  if (element?.closest('#view-tabs,#viewpoint-dialog')) return 'views';
  if (element?.closest('#view-panel')) return 'canvas';
  if (element?.closest('#workspace-dialog')) return 'workspace';
  return 'overview';
}

export function installWorkspace({ document, window, blocked, status, openDialog, panel, canHelp = () => true, beforeHelp = () => {}, preferences = null }) {
  const $ = id => document.getElementById(id), dialog = $('workspace-dialog'), help = $('help-dialog');
  const orderLabel=document.createElement('label'),orderSelect=document.createElement('select'),panelNames={catalog:'Каталог',canvas:'Полотно',palette:'Палитра'};orderLabel.textContent='Порядок панелей';orderSelect.id='workspace-order';
  for(const value of WORKSPACE_ORDERS){const option=document.createElement('option');option.value=value;option.textContent=value.split('-').map(key=>panelNames[key]).join(' → ');orderSelect.append(option);}orderLabel.append(orderSelect);$('workspace-form').querySelector('fieldset').append(orderLabel);
  let settings = workspacePreferences(null), bookmark = null, helpBookmark = null, helpHandoff = null;
  const focusTarget = element => element?.closest('.app-menu')?.querySelector('summary') || element;
  try { settings = preferences ? preferences.get('workspace') : workspacePreferences(JSON.parse(window.localStorage.getItem(STORAGE_KEY))); } catch { /* Unavailable or old local settings use defaults. */ }
  function persist() {
    try { if (preferences) { const result = preferences.update('workspace',settings); if (result?.persisted === false) return false; } else window.localStorage.setItem(STORAGE_KEY,JSON.stringify(settings)); return true; }
    catch { status('Настройки применены в этом окне; сохранить их между запусками не удалось.'); return false; }
  }
  const shell = document.querySelector('.editor-shell');
  const panes = { catalog: shell.querySelector('.catalog'), canvas: shell.querySelector('.canvas-panel'), palette: shell.querySelector('.toolbox') };
  const handles = {};
  let resize = null;
  const desktop = () => !window.matchMedia?.('(max-width: 850px)').matches && window.innerWidth > 850;
  const widthLimit = () => Math.max(180, Math.min(420, Math.floor((shell.getBoundingClientRect().width || window.innerWidth) * .3)));
  const visible = key => settings[key] && !(key === 'palette' && document.body.dataset.paletteDetached === 'true');
  const towardRight = key => settings.order.indexOf(key) < settings.order.indexOf('canvas');
  const shownWidth = (key, limit = widthLimit()) => resize?.key === key ? resize.value : Math.min(settings[`${key}Width`], limit);
  function finishResize(commit = false) {
    const previous = resize;
    if (!previous) return;
    resize = null; document.body.classList.remove('workspace-resizing');
    if (previous.handle.hasPointerCapture?.(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    if (commit && previous.value !== previous.startWidth) { settings[`${previous.key}Width`] = previous.value; persist(); }
    paint();
  }
  function paintHandles(limit) {
    const shellBounds = shell.getBoundingClientRect();
    for (const key of ['catalog', 'palette']) {
      const handle = handles[key], bounds = panes[key].getBoundingClientRect();
      handle.hidden = !desktop() || !visible(key);
      handle.setAttribute('aria-valuemin', '180'); handle.setAttribute('aria-valuemax', String(limit));
      handle.setAttribute('aria-valuenow', String(Math.round(shownWidth(key, limit))));
      handle.style.left = `${(towardRight(key) ? bounds.right : bounds.left) - shellBounds.left}px`;
      if (handle.hidden && document.activeElement === handle) $('canvas').focus({ preventScroll: true });
    }
  }
  for (const key of ['catalog', 'palette']) {
    const handle = document.createElement('div'); handle.id = `workspace-resize-${key}`; handle.className = 'workspace-resizer';
    if (!panes[key].id) panes[key].id = `workspace-${key}-panel`;
    handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', key === 'catalog' ? 'Ширина дерева модели' : 'Ширина палитры');
    handle.setAttribute('aria-controls', panes[key].id); handle.title = 'Перетащите границу; стрелки изменяют ширину, Home и End — пределы';
    handles[key] = handle; shell.append(handle);
    handle.addEventListener('pointerdown', event => {
      if (event.defaultPrevented || event.button !== 0 || event.isPrimary === false || resize || blocked() || !desktop() || !visible(key)) return;
      event.preventDefault(); event.stopPropagation();
      const startWidth = Math.max(180, Math.min(widthLimit(), Math.round(panes[key].getBoundingClientRect().width || shownWidth(key))));
      resize = { key, handle, pointerId: event.pointerId, startX: event.clientX, startWidth, value: startWidth, direction: towardRight(key) ? 1 : -1 };
      handle.setPointerCapture?.(event.pointerId); handle.focus({ preventScroll: true }); document.body.classList.add('workspace-resizing');
    });
    handle.addEventListener('lostpointercapture', event => { if (resize?.pointerId === event.pointerId) finishResize(); });
    handle.addEventListener('keydown', event => {
      if (['Delete', 'F2', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); return; }
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (resize || blocked() || !desktop() || !visible(key)) return;
      const step = event.shiftKey ? 30 : 10, direction = towardRight(key) ? 1 : -1;
      const value = event.key === 'Home' ? 180 : event.key === 'End' ? widthLimit() : shownWidth(key) + (event.key === 'ArrowRight' ? 1 : -1) * direction * step;
      const width = Math.max(180, Math.min(widthLimit(), Math.round(value)));
      if (width !== shownWidth(key)) { settings[`${key}Width`] = width; paint(); persist(); }
    });
  }
  window.addEventListener('pointermove', event => {
    if (!resize || event.pointerId !== resize.pointerId) return;
    if (!(event.buttons & 1)) { finishResize(); return; }
    event.preventDefault();
    resize.value = Math.max(180, Math.min(widthLimit(), Math.round(resize.startWidth + (event.clientX - resize.startX) * resize.direction)));
    paint();
  }, { passive: false });
  window.addEventListener('pointerup', event => { if (resize?.pointerId === event.pointerId) finishResize(true); });
  window.addEventListener('pointercancel', event => { if (resize?.pointerId === event.pointerId) finishResize(); });
  document.addEventListener('keydown', event => { if (resize && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finishResize(); } }, true);
  for (const type of ['blur', 'pagehide']) window.addEventListener(type, () => finishResize());
  window.addEventListener('resize', () => { finishResize(); paint(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishResize(); });
  const sizeObserver = window.ResizeObserver ? new window.ResizeObserver(() => { finishResize(); paint(); }) : null;
  sizeObserver?.observe(shell);
  function paint() {
    const body = document.body, limit = widthLimit();
    body.dataset.workspaceCatalog = String(settings.catalog); body.dataset.workspacePalette = String(settings.palette);
    body.dataset.workspaceOrder=settings.order;
    const columns=[];
    for(const key of settings.order.split('-')){const visible=key==='canvas'||settings[key]&&!(key==='palette'&&body.dataset.paletteDetached==='true');if(visible)columns.push(key==='canvas'?'minmax(0,1fr)':`min(var(--workspace-${key}-width,240px),30vw)`);panes[key]?.style.setProperty('--workspace-panel-column',String(Math.max(1,columns.length)));}
    body.style.setProperty('--workspace-ordered-columns',columns.join(' '));
    body.dataset.paletteMode = settings.paletteMode;
    body.style.setProperty('--workspace-catalog-width', `${shownWidth('catalog', limit)}px`);
    body.style.setProperty('--workspace-palette-width', `${shownWidth('palette', limit)}px`);
    body.style.setProperty('--workspace-palette-size', `${settings.paletteSize}px`);
    body.style.setProperty('--workspace-palette-font', `${settings.paletteFont}px`);
    for (const category of categories) body.toggleAttribute(`data-hide-${category}`, settings.hiddenCategories.includes(category));
    const hidden = settings.hiddenCategories.map(key => categoryNames[categories.indexOf(key)]);
    $('workspace-filter-note').hidden = hidden.length === 0;
    $('workspace-filter-note').textContent = hidden.length ? `Скрыты разделы: ${hidden.join(', ')}. Поиск охватывает всю модель.` : '';
    $('workspace-toggle-catalog').setAttribute('aria-pressed', String(settings.catalog));
    $('workspace-toggle-palette').setAttribute('aria-pressed', String(settings.palette));
    if ((body.dataset.mobilePanel === 'catalog' && !settings.catalog) || (body.dataset.mobilePanel === 'inspector' && !settings.palette)) panel('canvas');
    paintHandles(limit);
  }
  function revealPanel(name) {
    const key = name === 'catalog' ? 'catalog' : name === 'inspector' ? 'palette' : null;
    if (key && !settings[key]) { finishResize(); settings[key] = true; paint(); persist(); }
  }
  function readForm() {
    const value = {};
    for (const key of ['catalog', 'palette']) value[key] = $(`workspace-${key}`).checked;
    for (const key of ['catalogWidth', 'paletteWidth', 'paletteSize', 'paletteFont']) value[key] = Number($(`workspace-${key}`).value);
    value.paletteMode = $('workspace-paletteMode').value; value.order=orderSelect.value;
    value.hiddenCategories = categories.filter(key => !$(`workspace-category-${key}`).checked);
    return workspacePreferences(value);
  }
  function fill(value) {
    for (const key of ['catalog', 'palette']) $(`workspace-${key}`).checked = value[key];
    for (const key of ['catalogWidth', 'paletteWidth', 'paletteSize', 'paletteFont', 'paletteMode']) $(`workspace-${key}`).value = value[key];
    orderSelect.value=value.order;
    for (const key of categories) $(`workspace-category-${key}`).checked = !value.hiddenCategories.includes(key);
  }
  function open() {
    if (blocked()) return false;
    finishResize(); bookmark = focusTarget(document.activeElement); fill(settings); openDialog('workspace-dialog'); $('workspace-catalog').focus(); return true;
  }
  $('workspace-button').addEventListener('click', open);
  $('workspace-form').addEventListener('submit', event => {
    event.preventDefault(); if (!dialog.open || !$('workspace-form').checkValidity()) return;
    finishResize(); settings = readForm(); paint(); persist(); dialog.close();
  });
  $('workspace-defaults').addEventListener('click', () => fill(workspacePreferences(null)));
  $('workspace-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open || document.querySelector('dialog[open]')) return;
    if (bookmark?.isConnected && bookmark.getClientRects().length) bookmark.focus({ preventScroll: true });
    else { panel('canvas'); $('canvas').focus({ preventScroll: true }); }
    bookmark = null;
  });
  $('workspace-reset').addEventListener('click', () => {
    if (blocked()) return;
    finishResize(); settings = workspacePreferences(null); paint(); if (persist()) status('Исходная компоновка восстановлена.');
  });
  for (const key of ['catalog', 'palette']) $(`workspace-toggle-${key}`).addEventListener('click', () => {
    if (blocked()) return;
    finishResize(); settings[key] = !settings[key]; paint(); persist();
  });
  // These controls also exist outside menus; guard before the editor's outside-pointer draft cancellation.
  for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
    const control = event.target.closest?.('#workspace-button,#workspace-toggle-catalog,#workspace-toggle-palette,#workspace-reset,#workspace-fullscreen,#help-button,#tutorial-button,.workspace-resizer');
    if (control && ['help-button', 'tutorial-button'].includes(control.id)) beforeHelp();
    if (control && !(control.id === 'workspace-fullscreen' && document.fullscreenElement) && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation(); status('Завершите или отмените текущую правку перед этой командой.');
    }
  }, true);

  // Keep the original detailed guide as the general article; contextual articles are additional offline content.
  const original = document.createElement('section'); original.id = 'help-original';
  for (const item of [...help.children]) if (item.tagName !== 'H2' && !item.classList.contains('dialog-actions')) original.append(item);
  const nav = document.createElement('nav'); nav.className = 'help-navigation'; nav.setAttribute('aria-label', 'Разделы справки');
  const article = document.createElement('section'); article.id = 'help-article';
  const articleTitle = document.createElement('h3'), articleBody = document.createElement('p'); article.append(articleTitle, articleBody);
  function showArticle(key) {
    const found = HELP.find(item => item[0] === key) || HELP[0];
    articleTitle.textContent = found[1]; articleBody.textContent = found[2];
    original.hidden = found[0] !== 'overview'; $('help-tutorial').hidden = key !== 'tutorial'; article.hidden = key === 'tutorial';
    for (const button of nav.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.helpTopic === key));
  }
  const tutorial = document.createElement('section'); tutorial.id = 'help-tutorial'; tutorial.hidden = true;
  const tutorialTitle = document.createElement('h3'); tutorialTitle.textContent = 'Первая архитектурная модель'; tutorial.append(tutorialTitle);
  const tutorialNote = document.createElement('p'); tutorialNote.textContent = 'Выполняйте шаги в редакторе и отмечайте завершённые. Открытие справки и отметки не изменяют модель.'; tutorial.append(tutorialNote);
  let progress = [];
  try { const value = JSON.parse(window.localStorage.getItem('arkita.tutorial.v1')); if (Array.isArray(value)) progress = value.filter(n => Number.isInteger(n) && n >= 0 && n < TUTORIAL.length); } catch { /* Optional local progress. */ }
  const progressInputs = [];
  function saveProgress() { try { window.localStorage.setItem('arkita.tutorial.v1', JSON.stringify(progressInputs.flatMap((input, n) => input.checked ? [n] : []))); } catch { status('Отметки учебных шагов сохраняются только в этом окне.'); } }
  const steps = document.createElement('ol');
  TUTORIAL.forEach(([title, text, target], n) => {
    const item = document.createElement('li'), label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.checked = progress.includes(n); input.addEventListener('change', saveProgress); progressInputs.push(input);
    label.append(input, ` ${title}`); const description = document.createElement('p'); description.textContent = text;
    const focus = document.createElement('button'); focus.type = 'button'; focus.textContent = 'Перейти к команде';
    focus.addEventListener('click', () => {
      helpHandoff = previous => {
        if (blocked()) { restoreHelpFocus(previous); status('Завершите или отмените текущую правку перед переходом к учебной команде.'); return; }
        const control = $(target), region = control?.closest('.toolbox') ? 'inspector' : control?.closest('.catalog') ? 'catalog' : control?.closest('.canvas-panel') ? 'canvas' : null;
        if (region) { revealPanel(region); panel(region); }
        if (control && !control.disabled && control.getClientRects().length) control.focus({ preventScroll: true });
        else {
          const command = document.querySelector(`.app-menu [data-command="${target}"]`), menu = command?.closest('.app-menu');
          if (menu) { menu.open = true; (control?.disabled ? menu.querySelector('summary') : command).focus({ preventScroll: true }); }
        }
        status(text);
      };
      help.close();
    });
    item.append(label, description, focus); steps.append(item);
  });
  tutorial.append(steps);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Сбросить отметки';
  reset.addEventListener('click', () => { for (const input of progressInputs) input.checked = false; saveProgress(); }); tutorial.append(reset);
  for (const [key, title] of [...HELP, ['tutorial', 'Учебный сценарий']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.helpTopic = key; button.textContent = title;
    button.addEventListener('click', () => showArticle(key)); nav.append(button);
  }
  const actions = help.querySelector('.dialog-actions'); help.insertBefore(nav, actions); help.insertBefore(article, actions); help.insertBefore(tutorial, actions); help.insertBefore(original, actions);
  function openHelp(key = 'overview') {
    beforeHelp();
    if (!canHelp()) { status('Дождитесь завершения текущей операции перед открытием справки.'); return false; }
    showArticle(key);
    if (!help.open) { helpHandoff = null; helpBookmark = focusTarget(document.activeElement); help.showModal(); }
    nav.querySelector(`[data-help-topic="${key}"]`)?.focus(); return true;
  }
  $('help-button').addEventListener('click', () => openHelp());
  $('tutorial-button').addEventListener('click', () => openHelp('tutorial'));
  function restoreHelpFocus(target) {
    const currentDialog = document.querySelector('dialog[open]');
    if (target?.isConnected && target.getClientRects().length && (!currentDialog || currentDialog.contains(target))) target.focus({ preventScroll: true });
  }
  help.addEventListener('close', () => {
    if (help.open) return;
    const handoff = helpHandoff, previous = helpBookmark; helpHandoff = null; helpBookmark = null;
    if (handoff) handoff(previous); else restoreHelpFocus(previous);
  });
  let fullscreenPending = false;
  async function fullscreen() {
    if (fullscreenPending || (!document.fullscreenElement && blocked())) return;
    fullscreenPending = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw Error('Полный экран не поддерживается этой средой');
    } catch (error) { status(`Полный экран: ${error.message}`); }
    finally { fullscreenPending = false; }
  }
  $('workspace-fullscreen').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => $('workspace-fullscreen').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement))));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'F1') { event.preventDefault(); openHelp(helpContext(event.target)); }
    if (event.key === 'F11') { event.preventDefault(); fullscreen(); }
  });
  const detachedObserver=new window.MutationObserver(() => { finishResize(); paint(); });detachedObserver.observe(document.body,{attributes:true,attributeFilter:['data-palette-detached']});window.addEventListener('pagehide',()=>{detachedObserver.disconnect();sizeObserver?.disconnect();});
  preferences?.subscribe((value,changed) => { if (changed.includes('workspace')) { finishResize(); settings = value.workspace; paint(); } });
  paint();
  return { open, openHelp, openContextHelp:target=>openHelp(helpContext(target)), revealPanel, get active() { return resize !== null; }, get settings() { return structuredClone(settings); } };
}
