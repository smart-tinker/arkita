/** Small native form adapter; one create/duplicate command per confirmed submit. */
export function installViewActions({ document, model, openDialog, render, panel, status, setFit }) {
  const $ = id => document.getElementById(id);
  const displayName = item => item.name || '(без названия)';
  let pendingView = null;
  function openView(mode) {
    if (mode === 'duplicate' && !model.view) return;
    pendingView = { mode, viewId: model.viewId, revision: model.store.revision };
    $('view-dialog-title').textContent = mode === 'duplicate' ? 'Дублировать представление' : 'Новое представление';
    $('view-description').textContent = mode === 'duplicate'
      ? 'Новый вид получит независимую копию раскладки. Общие элементы и отношения останутся теми же; последующее переименование объектов видно в обоих видах.'
      : 'Пустой вид общей модели. Добавьте существующие элементы кнопкой ＋ в дереве или создайте новые из палитры.';
    $('new-view-name').value = mode === 'duplicate' ? `${displayName(model.view.view).slice(0, 8184).replace(/[\uD800-\uDBFF]$/u, '')} (копия)` : 'Новое представление';
    $('view-submit').textContent = mode === 'duplicate' ? 'Создать копию' : 'Создать вид';
    $('view-error').textContent = '';
    openDialog('view-dialog'); $('new-view-name').focus(); $('new-view-name').select();
  }
  $('new-view').addEventListener('click', () => openView('create'));
  $('duplicate-view').addEventListener('click', () => openView('duplicate'));
  $('view-dialog').addEventListener('close', () => { pendingView = null; });
  $('view-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pendingView) return;
    let applied = false;
    try {
      if (pendingView.revision !== model.store.revision) throw new Error('Модель изменилась. Закройте диалог и начните действие заново.');
      const command = pendingView.mode === 'duplicate'
        ? { type: 'duplicateView', viewId: pendingView.viewId, name: $('new-view-name').value }
        : { type: 'createView', name: $('new-view-name').value };
      const result = model.execute(command);
      applied = true;
      const duplicate = pendingView.mode === 'duplicate';
      pendingView = null; model.switchView(result.created.viewId); setFit(duplicate); $('view-dialog').close();
      render(); panel('canvas');
      $('view-tabs').querySelector(`[data-view-id="${model.viewId}"]`).focus();
      status(duplicate ? 'Независимая копия вида создана · общие объекты сохранены' : 'Пустое представление создано · добавьте элементы из дерева или палитры');
    } catch (error) {
      if (applied) status(`Представление создано, но интерфейс не обновлён полностью: ${error.message}`);
      else $('view-error').textContent = error.message;
    }
  });

}
