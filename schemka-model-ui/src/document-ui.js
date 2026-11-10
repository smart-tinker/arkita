/** Local document controls: native MRU/backups/settings never enter model JSON. */
export function installDocumentUI({ document, window, session, status, openDialog }) {
  const desktop = window.schemkaDesktop; if (!desktop?.documentPreferences) return;
  const launch = document.createElement('button'); launch.type = 'button'; launch.id = 'document-settings-button'; launch.textContent = 'Недавние файлы и настройки документов…';
  const recover = document.createElement('button'); recover.type = 'button'; recover.id = 'document-backups-button'; recover.textContent = 'Резервные копии и восстановление…';
  document.getElementById('file-dialog').append(launch, recover);
  const dialog = document.createElement('dialog'); dialog.id = 'document-settings-dialog'; dialog.setAttribute('aria-labelledby', 'document-settings-title');
  dialog.innerHTML = '<h2 id="document-settings-title">Документы и резервные копии</h2><p role="status" data-feedback></p><form><fieldset><legend>Локальные настройки</legend><label>Недавние модели (0–50) <input name="recentLimit" type="number" min="0" max="50" required></label><label><input name="backupEnabled" type="checkbox"> Резервная копия перед перезаписью</label><label>Копий каждой модели (1–20) <input name="backupLimit" type="number" min="1" max="20" required></label><label>Открывать представления при загрузке <select name="openViews"><option value="none">Ни одного</option><option value="first">Первое</option><option value="limited">Первые N</option></select></label><label>N (1–100) <input name="autoViewLimit" type="number" min="1" max="100" required></label><button type="submit">Сохранить настройки</button></fieldset></form><h3>Недавние модели</h3><div data-recent></div><h3>Резервные копии</h3><p>Перед изменением сохранённой модели создаётся её предыдущая версия, если резервное копирование включено. Для новых настроек оно включено по умолчанию; ранее сохранённый выбор сохраняется. Это не периодическое автосохранение.</p><p>Восстановление создаёт отдельный новый файл .arkita. Выберите ещё не занятое имя: существующие файлы, открытая модель и её история не изменяются. Копию каталога модели тоже можно восстановить в отдельный файл.</p><label>Найти копию <input id="document-backup-search" type="search" placeholder="Имя или путь исходной модели"></label><div data-backups></div><button type="button" data-close-documents>Закрыть</button>';
  document.body.append(dialog); let busy = false, generation = 0, backups = [];
  const feedback = text => { dialog.querySelector('[data-feedback]').textContent = text; status(text); };
  const field = name => dialog.querySelector(`[name="${name}"]`);
  const search = dialog.querySelector('#document-backup-search');
  function paintBackups() {
    const target = dialog.querySelector('[data-backups]'), query = search.value.trim().toLocaleLowerCase(); target.replaceChildren();
    const found = backups.filter(item => item.sourcePath.toLocaleLowerCase().includes(query));
    if (!found.length) { target.textContent = backups.length ? 'Копии не найдены.' : 'Резервных копий пока нет. Они появятся перед изменением ранее сохранённой модели.'; return; }
    for (const item of found) {
      const row = document.createElement('p'), label = document.createElement('span'), button = document.createElement('button'), date = new Date(item.created).toLocaleString();
      label.textContent = `${date} · ${item.sourcePath} `; button.type = 'button'; button.textContent = 'Восстановить в новый файл…';
      button.setAttribute('aria-label', `Восстановить ${item.sourcePath} от ${date} в новый файл`);
      button.addEventListener('click', () => run(() => desktop.recoverBackup(item.id, session.documentToken)));
      row.append(label, button); target.append(row);
    }
  }
  function paint(result) {
    if (result.status !== 'ok') throw Error(result.message || 'Не удалось прочитать настройки документов.');
    for (const [key, value] of Object.entries(result.settings)) field(key)[typeof value === 'boolean' ? 'checked' : 'value'] = value;
    const target = dialog.querySelector('[data-recent]'); target.replaceChildren();
    if (!result.recent.length) target.textContent = 'Список пуст.';
    for (const item of result.recent) {
      const row = document.createElement('p'), button = document.createElement('button'); button.type = 'button'; button.textContent = item.path; button.title = item.path;
      button.addEventListener('click', () => run(() => desktop.openRecent(item.id))); row.append(button); target.append(row);
    }
    backups = result.backups; paintBackups();
  }
  async function run(action) {
    if (busy) return; busy = true; const request = generation;
    for (const control of dialog.querySelectorAll('button,input,select')) control.disabled = true;
    try { const result = await action(); if (request !== generation || !dialog.open) return;
      if (result.status === 'error') throw Error(result.message || result.code || 'Операция не выполнена.');
      feedback(result.status === 'cancelled' ? 'Действие отменено. Существующие файлы и открытая модель не изменены.' : result.status === 'saved' ? `Копия сохранена в новый файл: ${result.name}. Откройте его через «Файл → Открыть».` : result.status === 'focused' ? 'Окно модели активировано.' : result.status === 'opened-window' ? 'Модель открыта в отдельном окне.' : 'Настройки сохранены.');
    } catch (error) { if (request === generation) feedback(error.message); }
    finally { busy = false; for (const control of dialog.querySelectorAll('button,input,select')) control.disabled = false; }
  }
  async function open(showBackups = false) {
    if (busy) return; document.getElementById('file-dialog').close(); openDialog('document-settings-dialog'); const request = ++generation;
    dialog.querySelector('[data-feedback]').textContent = ''; search.value = '';
    try { const result = await desktop.documentPreferences(); if (request === generation && dialog.open) { paint(result); if (showBackups) search.focus(); } } catch (error) { if (request === generation && dialog.open) feedback(error.message); }
  }
  launch.addEventListener('click', () => open()); recover.addEventListener('click', () => open(true));
  search.addEventListener('input', paintBackups);
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault(); if (!event.target.checkValidity()) return;
    const settings = Object.fromEntries(['recentLimit', 'backupLimit', 'autoViewLimit'].map(name => [name, Number(field(name).value)])); settings.backupEnabled = field('backupEnabled').checked; settings.openViews = field('openViews').value;
    run(async () => { const result = await desktop.setDocumentPreferences(settings); if (result.status === 'ok' && dialog.open) { paint(result); window.dispatchEvent(new window.CustomEvent('arkita-document-settings', { detail: result.settings })); } return result; });
  });
  dialog.addEventListener('cancel', event => { if (busy) { event.preventDefault(); feedback('Завершите действие или нажмите «Отмена» в системном окне.'); } });
  dialog.querySelector('[data-close-documents]').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => { generation++; });
}
