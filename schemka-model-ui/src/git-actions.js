import { exportFiles } from '../../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/index.js';

/** Git snapshots have their own baseline; they never mark a local file saved. */
export function installGitActions({ document, window, model, session, files, openDialog, render, status,
  blocked = () => false, readInteractionGeneration = () => 0 }) {
  const $ = id => document.getElementById(id), dialog = $('git-dialog'), desktop = window.schemkaDesktop;
  let state = null, busy = false, generation = 0, pending = null, inspection = null, stateRevision = -1, stateToken = null;
  const snapshot = () => serializeProjectFile(model.store.snapshot);
  const capture = () => ({ token: session.documentToken, revision: model.store.revision, interaction: readInteractionGeneration() });
  const unchanged = boundary => boundary.token === session.documentToken && boundary.revision === model.store.revision && boundary.interaction === readInteractionGeneration();
  function feedback(text) { $('git-feedback').textContent = text; status(text); }
  function element(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
  const types = { model: 'Модель', element: 'Элемент', junction: 'Junction', relationship: 'Отношение', view: 'Представление', occurrence: 'Размещение', connection: 'Связь на представлении', viewpoint: 'Viewpoint', 'visual-node': 'Визуальный объект', 'visual-connector': 'Визуальный коннектор', asset: 'Изображение', folder: 'Папка' };
  const valueText = (value, present = true) => !present ? '(отсутствует)' : JSON.stringify(value);
  const changePages = new Map(), emptyChanges = [], changePageSize = 100;
  function changeItem(change) {
    const item = element('li'), title = `${({ added: 'Добавлен', modified: 'Изменён', deleted: 'Удалён' })[change.kind] || change.kind}: ${change.label}`;
    item.append(element('span', `${title}${change.type ? ` · ${types[change.type] || change.type}` : ''}${change.viewName ? ` · ${change.viewName}` : ''}`));
    if (change.fields?.length) {
      const detail = element('details'); detail.append(element('summary', `Поля (${change.fields.length}) · ${change.id || change.path}`));
      let populated = false;
      detail.addEventListener('toggle', () => {
        if (!detail.open || populated) return;
        populated = true; const list = element('ul');
        for (const field of change.fields) list.append(element('li', `${field.category === 'geometry' ? 'Геометрия' : 'Данные'} · ${field.field}: ${valueText(field.before, field.beforePresent)} → ${valueText(field.after, field.afterPresent)}`));
        detail.append(list);
      });
      item.append(detail);
    }
    return item;
  }
  function renderChanges(id, changes) {
    changes ||= emptyChanges;
    // Status/message/busy refreshes reuse the same diff; retain its page and open fields.
    if (changePages.get(id)?.changes === changes) return;
    const view = { changes, page: 0 }, list = $(id);
    changePages.set(id, view);
    function paint(focusLabel) {
      if (changePages.get(id) !== view) return;
      const start = view.page * changePageSize, end = Math.min(start + changePageSize, changes.length);
      const rows = changes.slice(start, end).map(changeItem), buttons = [];
      if (changes.length > changePageSize) {
        const pager = element('li'); pager.append(element('span', `${start + 1}–${end} из ${changes.length} `));
        for (const [label, direction, disabled] of [['Назад', -1, start === 0], ['Далее', 1, end === changes.length]]) {
          const button = element('button', label); button.type = 'button'; button.disabled = disabled;
          button.addEventListener('click', () => { view.page += direction; paint(label); });
          pager.append(button); buttons.push(button);
        }
        rows.unshift(pager);
      }
      list.replaceChildren(...rows); list.scrollTop = 0;
      if (focusLabel) (buttons.find(button => button.textContent === focusLabel && !button.disabled) || buttons.find(button => !button.disabled))?.focus({ preventScroll: true });
    }
    paint();
  }
  function actionButton(text, action, disabled = false) {
    const button = element('button', text); button.type = 'button'; button.disabled = busy || disabled; button.addEventListener('click', action); return button;
  }
  function accepted(result, expected = 'ok') {
    if (result?.status !== expected) {
      const error = Error(result?.message || 'Git не подтвердил операцию.'); error.code = result?.code; throw error;
    }
    return result;
  }
  function recordState(result) {
    state = accepted(result); stateRevision = model.store.revision; stateToken = session.documentToken;
    if (!state.target) {
      if (!$('git-author-name').value) $('git-author-name').value = state.authorName || '';
      if (!$('git-author-email').value) $('git-author-email').value = state.authorEmail || '';
      if (!$('git-author-name').value || !$('git-author-email').value) $('git-author').open = true;
    }
  }
  function resolution() {
    if ($('git-whole').value) return { whole: $('git-whole').value };
    const records = {};
    for (const input of $('git-conflicts').querySelectorAll('input:checked')) records[input.dataset.path] = input.value;
    return { records };
  }
  function refresh() {
    const supported = Boolean(desktop?.gitStatus), target = state?.target;
    const stale = stateRevision !== model.store.revision || stateToken !== session.documentToken;
    const attached = Boolean(state?.attached && !stale);
    dialog.setAttribute('aria-busy', String(busy));
    $('git-state').textContent = !supported ? 'Git доступен в приложении Arkita для Windows.'
      : state?.available === false ? 'Git недоступен. Переустановите Arkita для Windows.'
        : busy ? 'Выполняется операция Git…' : target ? 'Подключено к Git.' : 'Подключите репозиторий GitHub, GitLab или другого Git-сервера. Можно указать локальный репозиторий.';
    $('git-connect-form').hidden = !supported || state?.available === false || Boolean(target);
    $('git-connected').hidden = !target || Boolean(pending) || Boolean(inspection);
    $('git-inspection').hidden = !inspection;
    $('git-merge').hidden = !pending;
    for (const input of $('git-connect-form').querySelectorAll('input,button')) input.disabled = busy;
    for (const id of ['git-open', 'git-refresh', 'git-disconnect', 'git-push', 'git-receive', 'git-commit', 'git-message']) $(id).disabled = busy || Boolean(pending);
    $('git-open').disabled ||= !state?.hasModel;
    $('git-push').disabled ||= !state?.head || !state?.attached;
    $('git-receive').disabled ||= !attached || !state?.hasModel;
    $('git-commit').disabled ||= stale || (state?.hasModel && !state?.attached) || !(state?.changes?.length) || !$('git-message').value.trim();
    $('git-apply').disabled = busy || !pending || !unchanged(pending.boundary)
      || (!resolution().whole && (Boolean(pending.structuralError) || pending.conflicts.some(item => !resolution().records[item.path])));
    $('git-merge-cancel').disabled = busy; $('git-whole').disabled = busy;
    $('git-bulk-choices').hidden = !pending?.conflicts?.length;
    for (const id of ['git-choose-local', 'git-choose-remote']) $(id).disabled = busy;
    for (const id of ['git-create-branch', 'git-prepare-branch', 'git-create-milestone']) $(id).disabled = busy || !attached || !state?.head;
    for (const id of ['git-new-branch', 'git-local-branch', 'git-milestone-name', 'git-record', 'git-inspection-milestone-name', 'git-replace-confirm', 'git-inspection-close']) $(id).disabled = busy;
    for (const button of $('git-inspection-parents').querySelectorAll('button')) button.disabled = busy;
    $('git-inspection-create-milestone').disabled = busy || !attached || !inspection || inspection.kind !== 'revision' || inspection.canRestore === false;
    $('git-restore').disabled = busy || !inspection || !unchanged(inspection.boundary) || inspection.canRestore === false || (!$('git-replace-warning').hidden && !$('git-replace-confirm').checked);
    for (const input of $('git-conflicts').querySelectorAll('input')) input.disabled = busy || Boolean($('git-whole').value);
    if (target) {
      $('git-target').textContent = `${target.remote} · ${target.directory}`;
      $('git-revisions').textContent = `Локальная ветвь: ${state.localBranch || 'main'} · upstream: ${target.branch} · открытая версия: ${state.openRevision?.slice(0, 8) || (state.attached ? state.head?.slice(0, 8) : 'не привязана')}`;
      $('git-push').textContent = `Отправить в ${target.branch}`;
      $('git-sync-state').textContent = `Файл .arkita: ${session.dirty ? 'есть несохранённые изменения' : 'без несохранённых изменений'}. Не записано в Git: ${state.changes?.length || 0}. К отправке: ${state.ahead ?? 0}. К получению: ${state.behind ?? 0}. Сведения о сервере — после последнего подключения или получения.`;
      $('git-attachment').textContent = stale ? 'Модель изменилась. Обновите статус перед сохранением версии.'
        : state.hasModel && !state.attached ? 'Открытая модель не привязана к этой истории. Сначала явно откройте модель из Git.'
          : !state.hasModel ? 'Каталог модели пуст. Первая версия сохранит в нём текущую модель.' : 'Работа с Git не меняет привязку и состояние сохранения файла .arkita.';
      const changes = stale ? emptyChanges : state.changes || emptyChanges;
      $('git-changes-empty').textContent = stale ? '' : changes.length ? `Изменений: ${changes.length}` : 'Новых изменений для локальной версии нет.';
      renderChanges('git-changes', changes);
      $('git-history').replaceChildren(...(state.history || []).map(entry => {
        const date = new Date(entry.date);
        const when = Number.isNaN(date.valueOf()) ? entry.date : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
        const row = element('li'); row.append(actionButton(`${entry.message} — ${entry.author}, ${when} · ${entry.oid.slice(0, 8)}`, () => inspect(entry.oid))); return row;
      }));
      const selectedBranch = $('git-local-branch').value;
      $('git-local-branch').replaceChildren(...(state.branches || []).map(branch => { const option = element('option', `${branch.name}${branch.name === state.localBranch ? ' (текущая)' : ''}`); option.value = branch.name; return option; }));
      $('git-local-branch').value = (state.branches || []).some(branch => branch.name === selectedBranch) ? selectedBranch : state.localBranch || '';
      $('git-prepare-branch').disabled ||= !$('git-local-branch').value || $('git-local-branch').value === state.localBranch;
      $('git-milestones').replaceChildren(...(state.milestones || []).map(milestone => {
        const row = element('li'), published = milestone.oid && milestone.oid === milestone.remoteOid;
        row.append(element('span', `${milestone.name} · ${published ? 'опубликована' : milestone.oid ? 'локальная' : 'на сервере'} `));
        if (milestone.oid) row.append(actionButton(`Просмотр ${milestone.oid.slice(0, 8)}`, () => inspect(milestone.oid)),
          actionButton('Опубликовать веху', () => milestoneAction('gitPublishMilestone', milestone), !attached || published),
          actionButton('Удалить локальную веху', () => milestoneAction('gitDeleteMilestone', milestone), !attached));
        if (milestone.remoteOid && !published) row.append(actionButton(`Серверная ${milestone.remoteOid.slice(0, 8)}`, () => inspect(milestone.remoteOid)));
        return row;
      }));
    }
  }
  async function run(action) {
    if (busy) return;
    busy = true; const operation = ++generation, boundary = capture(); refresh();
    const current = () => operation === generation && dialog.open && unchanged(boundary);
    try { await action({ boundary, current }); }
    catch (error) {
      if (current()) {
        if (error.code === 'GIT_MODEL_CONFLICT' && pending) {
          pending.structuralError = error.message; $('git-whole-choice').hidden = false;
          $('git-merge-summary').textContent = error.message;
        }
        feedback(error.message);
      }
    } finally {
      busy = false; refresh();
      if (pending?.boundary === boundary && current()) $('git-merge-cancel').focus();
    }
  }
  async function readStatus(current) {
    const result = await desktop.gitStatus(snapshot(), session.documentToken);
    if (current()) {
      if (result?.available === false) { state = { ...result, target: null }; stateRevision = model.store.revision; stateToken = session.documentToken; }
      else recordState(result);
    }
  }
  function showPlan(result, boundary) {
    pending = { ...result, conflicts: result.conflicts || [], boundary };
    $('git-whole').value = ''; $('git-whole-choice').hidden = !result.structuralError;
    $('git-merge-summary').textContent = result.structuralError || (pending.conflicts.length
      ? `Пересекающихся изменений: ${pending.conflicts.length}. Для каждого объекта выберите версию.`
      : 'Изменения совместимы. Проверьте результат перед применением.');
    renderChanges('git-merge-changes', result.changes);
    $('git-conflicts').replaceChildren(...pending.conflicts.map((conflict, index) => {
      const field = element('fieldset'); field.append(element('legend', conflict.label));
      for (const [side, label] of [['local', 'Моя версия'], ['remote', 'Полученная версия']]) {
        const row = element('label'), input = element('input'); input.type = 'radio'; input.name = `git-conflict-${index}`;
        input.value = side; input.dataset.path = conflict.path; input.addEventListener('change', () => { pending.structuralError = null; refresh(); });
        row.append(input, document.createTextNode(label)); field.append(row);
      }
      const details = element('details'); details.append(element('summary', 'Сравнить записи'));
      for (const [side, label] of [['base', 'Общая исходная версия'], ['local', 'Моя версия'], ['remote', 'Полученная версия']]) {
        const context = conflict.context?.[side];
        if (context) {
          details.append(element('p', `${label}: ${context.label} · ${context.id}`));
          if (context.relationships.length) details.append(element('p', `Затронутые отношения: ${context.relationships.map(item => `${item.label} (${item.id})`).join(', ')}`));
          if (context.views.length) details.append(element('p', `Представления: ${context.views.map(item => `${item.name} (${item.id})`).join(', ')}`));
        }
        details.append(element('strong', label), element('pre', conflict[side] == null ? '(удалено / отсутствует)' : typeof conflict[side] === 'string' ? conflict[side] : JSON.stringify(conflict[side], null, 2)));
      }
      field.append(details); return field;
    }));
    refresh();
  }
  $('git-button').addEventListener('click', () => {
    if (busy || blocked()) return;
    $('git-feedback').textContent = ''; openDialog('git-dialog'); refresh();
    if (desktop?.gitStatus) run(async ({ current }) => { await readStatus(current); });
  });
  $('git-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    generation++; pending = null; inspection = null;
    document.querySelector('[data-command="git-button"]')?.closest('.app-menu').querySelector('summary').focus({ preventScroll: true });
  });
  for (const id of ['git-author-name', 'git-author-email']) $(id).addEventListener('invalid', () => { $('git-author').open = true; });
  $('git-connect-form').addEventListener('submit', event => {
    event.preventDefault(); if (!desktop?.gitConnect || busy || !$('git-connect-form').reportValidity()) return;
    const options = { remote: $('git-remote').value.trim(), branch: $('git-branch').value.trim(), directory: $('git-directory').value.trim(),
      authorName: $('git-author-name').value.trim(), authorEmail: $('git-author-email').value.trim() };
    run(async ({ current }) => {
      accepted(await desktop.gitConnect(options)); if (!current()) return;
      await readStatus(current); if (current()) feedback('Репозиторий подключён. Открытая модель не изменена.');
    });
  });
  $('git-refresh').addEventListener('click', () => run(async ({ current }) => { await readStatus(current); }));
  $('git-open').addEventListener('click', () => run(async ({ boundary, current }) => {
    const result = accepted(await desktop.gitOpen(boundary.token), 'ready'); if (!current()) return;
    dialog.close();
    const proposed = files.proposeExternal({ bytes: result.bytes, name: `Git · ${state.target.branch}/${state.target.directory}`,
      afterCommit: async token => {
        const before = state, operation = generation;
        accepted(await desktop.gitAdopt(result.candidate, token));
        if (session.documentToken === token && state === before && generation === operation) state = null;
      },
    });
    if (!proposed) status('Модель из Git подготовлена, но окно открытия занято. Повторите открытие.');
  }));
  $('git-message').addEventListener('input', refresh);
  $('git-commit-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy || $('git-commit').disabled) return;
    const message = $('git-message').value.trim();
    run(async ({ boundary, current }) => {
      accepted(await desktop.gitCommit(snapshot(), boundary.token, message)); if (!current()) return;
      $('git-message').value = ''; await readStatus(current);
      if (current()) feedback('Версия сохранена локально в Git. Для коллег нажмите «Отправить». Файл .arkita не записывался.');
    });
  });
  $('git-push').addEventListener('click', () => run(async ({ boundary, current }) => {
    accepted(await desktop.gitPush(boundary.token)); if (!current()) return;
    await readStatus(current); if (current()) feedback('Локальные версии отправлены в репозиторий.');
  }));
  $('git-receive').addEventListener('click', () => run(async ({ boundary, current }) => {
    const result = accepted(await desktop.gitReceive(snapshot(), boundary.token), 'ready');
    if (current()) { showPlan(result, boundary); feedback('Полученные изменения подготовлены. Открытая модель ещё не изменена.'); }
  }));
  $('git-whole').addEventListener('change', refresh);
  $('git-merge-cancel').addEventListener('click', () => {
    if (busy) return; pending = null; refresh(); feedback('Получение отменено. Открытая модель и её история сохранены.'); $('git-receive').focus();
  });
  $('git-apply').addEventListener('click', () => {
    if (busy || $('git-apply').disabled || !pending || !unchanged(pending.boundary)) return;
    const proposal = pending, choice = resolution();
    run(async ({ boundary, current }) => {
      const result = accepted(await desktop.gitApply(proposal.plan, choice, boundary.token), 'ready');
      if (!current()) { status('Результат сохранён в Git, но редактор изменился. Откройте модель из Git, чтобы продолжить.'); return; }
      try {
        const changed = !session.matchesProject(result.bytes);
        if (changed) {
          const next = exportFiles(deserializeProjectFile(result.bytes));
          model.execute({ type: 'applyProjectSnapshot', files: next }, boundary.revision);
        }
        accepted(await desktop.gitAdopt(result.candidate, boundary.token));
        pending = null; render();
        const updated = capture(), operation = generation;
        await readStatus(() => dialog.open && operation === generation && unchanged(updated));
        feedback(changed ? 'Изменения применены. Их можно отменить одним шагом. Сохраните файл .arkita отдельно.'
          : 'Модель уже актуальна. Связь с историей Git обновлена; история действий и состояние файла .arkita сохранены.');
      } catch (error) {
        pending = null; render();
        feedback(`Результат уже сохранён в Git: ${error.message}. Откройте модель из Git, чтобы продолжить; текущий файл не перезаписан.`);
      }
    });
  });
  function showInspection(result, boundary, kind = 'revision') {
    inspection = { ...result, boundary, kind };
    $('git-inspection-title').textContent = kind === 'branch' ? `Переключение на ${result.name}` : `Версия ${result.oid.slice(0, 8)} — только чтение`;
    $('git-inspection-state').textContent = kind === 'branch'
      ? `Открытая модель пока не изменена.${result.dirty ? ' В текущей модели есть изменения без локального commit. Создайте версию Git перед переключением, если хотите сохранить их в ветви.' : ''}`
      : `${result.entry?.message || ''} · ${result.entry?.author || ''}. Просмотр не меняет модель, файл, ветвь и историю действий. Восстановление создаст изменение редактора; commit и отправка выполняются отдельно.`;
    $('git-inspection-milestone-form').hidden = kind === 'branch';
    $('git-revision-changes').hidden = kind === 'branch'; $('git-records-details').hidden = kind === 'branch';
    renderChanges('git-inspection-changes', result.changes);
    renderChanges('git-working-changes', kind === 'branch' ? result.changes : result.workingChanges);
    $('git-replace-confirm').checked = false;
    $('git-replace-warning').hidden = !(kind === 'branch' ? result.dirty : (result.workingChanges || []).length);
    $('git-restore').textContent = kind === 'branch' ? 'Переключить и загрузить модель' : 'Восстановить в редакторе';
    $('git-record').replaceChildren(...(result.records || []).map((record, index) => { const option = element('option', record.path); option.value = String(index); return option; }));
    showRecord();
    $('git-inspection-parents').replaceChildren(...(result.parents || []).map(oid => actionButton(`Родитель ${oid.slice(0, 8)}`, () => inspect(oid))));
    refresh(); $('git-inspection-close').focus();
  }
  function showRecord() { $('git-record-value').textContent = JSON.stringify(inspection?.records?.[Number($('git-record').value)]?.record ?? null, null, 2); }
  function inspect(oid) { run(async ({ boundary, current }) => {
    const result = accepted(await desktop.gitInspect(oid, snapshot(), boundary.token), 'ready');
    if (current()) showInspection(result, boundary);
  }); }
  async function applySnapshot(result, boundary, needsAdoption) {
    const changed = !session.matchesProject(result.bytes);
    if (changed) model.execute({ type: 'applyProjectSnapshot', files: exportFiles(deserializeProjectFile(result.bytes)) }, boundary.revision);
    if (needsAdoption) accepted(await desktop.gitAdopt(result.candidate, boundary.token));
    inspection = null; render();
    const updated = capture(), operation = generation;
    await readStatus(() => dialog.open && operation === generation && unchanged(updated));
    return changed;
  }
  $('git-record').addEventListener('change', showRecord);
  $('git-replace-confirm').addEventListener('change', refresh);
  $('git-inspection-close').addEventListener('click', () => { if (!busy) { inspection = null; refresh(); } });
  $('git-restore').addEventListener('click', () => {
    if (busy || $('git-restore').disabled) return;
    const selected = inspection;
    run(async ({ boundary, current }) => {
      const switching = selected.kind === 'branch';
      const result = accepted(await desktop[switching ? 'gitSwitchBranch' : 'gitRestore'](selected.inspection, snapshot(), boundary.token), 'ready');
      if (!current()) { if (switching) status('Локальная ветвь переключена, но редактор изменился. Откройте модель из Git.'); return; }
      try {
        const changed = await applySnapshot(result, boundary, switching);
        feedback(switching ? 'Локальная ветвь переключена. Модель загружена; отправка не выполнялась.' : changed
          ? 'Версия восстановлена одним шагом Undo. Сохраните файл и создайте новый commit, когда будете готовы.'
          : 'Открытая модель уже совпадает с этой версией. История действий сохранена.');
      } catch (error) { inspection = null; render(); feedback(`${error.message}${switching ? ' Ветвь уже переключена. Откройте модель из Git.' : ''}`); }
    });
  });
  $('git-local-branch').addEventListener('change', refresh);
  $('git-branch-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy || $('git-create-branch').disabled || !$('git-branch-form').reportValidity()) return;
    const name = $('git-new-branch').value.trim();
    run(async ({ boundary, current }) => { accepted(await desktop.gitCreateBranch(name, boundary.token)); if (!current()) return;
      $('git-new-branch').value = ''; await readStatus(current); if (current()) feedback(`Локальная ветвь ${name} создана. Текущая модель и сервер не изменены.`); });
  });
  $('git-prepare-branch').addEventListener('click', () => {
    if ($('git-prepare-branch').disabled) return;
    const name = $('git-local-branch').value;
    run(async ({ boundary, current }) => { const result = accepted(await desktop.gitPrepareBranch(name, snapshot(), boundary.token), 'ready'); if (current()) showInspection(result, boundary, 'branch'); });
  });
  $('git-milestone-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy || $('git-create-milestone').disabled || !$('git-milestone-form').reportValidity()) return;
    const name = $('git-milestone-name').value.trim(), oid = state.head;
    run(async ({ boundary, current }) => { accepted(await desktop.gitCreateMilestone(name, oid, boundary.token)); if (!current()) return;
      $('git-milestone-name').value = ''; await readStatus(current); if (current()) feedback(`Локальная веха ${name} создана для ${oid.slice(0, 8)}. Публикация выполняется отдельно.`); });
  });
  $('git-inspection-milestone-form').addEventListener('submit', event => {
    event.preventDefault(); if (busy || $('git-inspection-create-milestone').disabled || !$('git-inspection-milestone-form').reportValidity()) return;
    const name = $('git-inspection-milestone-name').value.trim(), oid = inspection.oid;
    run(async ({ boundary, current }) => { accepted(await desktop.gitCreateMilestone(name, oid, boundary.token)); if (!current()) return;
      $('git-inspection-milestone-name').value = ''; await readStatus(current); if (current()) feedback(`Локальная веха ${name} создана для ${oid.slice(0, 8)}. Открытая модель не изменена; публикация выполняется отдельно.`); });
  });
  function milestoneAction(method, milestone) {
    run(async ({ boundary, current }) => { accepted(await desktop[method](milestone.name, milestone.oid, boundary.token)); if (!current()) return;
      await readStatus(current); if (current()) feedback(method === 'gitPublishMilestone' ? 'Веха опубликована.' : 'Локальная веха удалена. Опубликованная копия и версии модели сохранены.'); });
  }
  for (const side of ['local', 'remote']) $(`git-choose-${side}`).addEventListener('click', () => {
    if (busy || !pending) return;
    $('git-whole').value = ''; pending.structuralError = null;
    for (const input of $('git-conflicts').querySelectorAll('input')) input.checked = input.value === side;
    refresh(); feedback('Выбор заполнен для всех конфликтов. Перед применением вся модель будет проверена.');
  });
  $('git-disconnect').addEventListener('click', () => run(async ({ current }) => {
    accepted(await desktop.gitDisconnect()); if (!current()) return;
    state = null; await readStatus(current); if (current()) feedback('Репозиторий отключён. Локальные версии и открытая модель сохранены.');
  }));
  return { refresh, get transient() { return busy || Boolean(pending) || inspection?.kind === 'branch'; } };
}
