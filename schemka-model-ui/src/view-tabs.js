import { orderedViews } from './controller.js';
/** Opened editor tabs are session UI state. Closing/reordering never edits a model. */
export function installViewTabs({ document, window, model, activateView, render, blocked, status }) {
  const tabs = document.getElementById('view-tabs'), remembered = new Map();
  let ids = [], settings = { openViews: 'first', autoViewLimit: 5 }, resetGeneration = 0, touched = 0, dragged = null, bulkGeneration = 0;
  function capture() { if (model.viewId) remembered.set(model.viewId, { selection: model.selection, selections: model.selections }); }
  function ensure(id) { if (id && !ids.includes(id)) ids.push(id); }
  function beforeActivate(id) { touched++; capture(); ensure(id); }
  function afterActivate(id) {
    const old = remembered.get(id); if (!old) return;
    if (old.selections.length) model.selectMany(old.selections, old.selection); else if (old.selection) model.select(old.selection);
  }
  function reset(nextSettings = settings) {
    settings = nextSettings; resetGeneration++; bulkGeneration++; remembered.clear();
    const all = orderedViews(model.store.snapshot.views).map(entry => entry.view.id);
    ids = settings.openViews === 'none' ? [] : all.slice(0, settings.openViews === 'limited' ? settings.autoViewLimit : 1);
    if (!ids.length) model.closeView(); else model.switchView(ids[0]);
  }
  function reconcile() {
    const available = new Set(model.store.snapshot.views.map(entry => entry.view.id));
    ids = ids.filter(id => available.has(id)); for (const id of remembered.keys()) if (!available.has(id)) remembered.delete(id);
    ensure(model.viewId);
  }
  function close(id) {
    if (blocked()) return false;
    capture(); const index = ids.indexOf(id); if (index < 0) return false;
    ids.splice(index, 1); touched++;
    if (model.viewId === id) { const next = ids[Math.min(index, ids.length - 1)]; if (next) activateView(next); else { model.closeView(); render(); } }
    else paint();
    status('Вкладка закрыта. Представление остаётся в модели.'); return true;
  }
  function reorder(id, before) {
    const from = ids.indexOf(id), to = ids.indexOf(before); if (from < 0 || to < 0 || id === before || blocked()) return;
    ids.splice(from, 1); ids.splice(ids.indexOf(before), 0, id); touched++; paint();
  }
  function paint() {
    reconcile(); const focused = document.activeElement?.closest('[data-view-scope="tabs"]')?.dataset.viewId;
    const views = new Map(model.store.snapshot.views.map(entry => [entry.view.id, entry.view]));
    const fragment = document.createDocumentFragment();
    ids.forEach((id, index) => {
      const view = views.get(id), item = document.createElement('button'); item.type = 'button'; item.className = 'view-tab'; item.id = `tab-${id}`;
      item.dataset.viewId = id; item.dataset.viewScope = 'tabs'; item.dataset.focusKey = `tabs-${id}`; item.dataset.renameKind = 'view'; item.dataset.renameId = id;
      item.setAttribute('role', 'tab'); item.setAttribute('aria-controls', 'view-panel'); item.setAttribute('aria-selected', String(model.viewId === id)); item.tabIndex = model.viewId === id ? 0 : -1;
      item.title = `${view.name || '(без названия)'} · Ctrl+W: закрыть вкладку · Alt+←/→: порядок`; item.draggable = true;
      const number = document.createElement('span'); number.className = 'view-symbol'; number.textContent = String(index + 1).padStart(2, '0'); const label = document.createElement('span'); label.textContent = view.name || '(без названия)';
      const remove = document.createElement('span'); remove.textContent = '×'; remove.dataset.closeTab = id; remove.setAttribute('aria-hidden', 'true'); remove.className = 'tab-close'; item.append(number, label, remove);
      item.addEventListener('click', event => event.target.closest('[data-close-tab]') ? close(id) : !blocked() && activateView(id));
      item.addEventListener('auxclick', event => { if (event.button === 1) { event.preventDefault(); close(id); } });
      item.addEventListener('dragstart', event => { if (blocked()) { event.preventDefault(); return; } dragged = id; event.dataTransfer.setData('application/x-arkita-tab', id); event.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragover', event => { if (dragged) event.preventDefault(); });
      item.addEventListener('drop', event => { if (!dragged) return; event.preventDefault(); reorder(dragged, id); dragged = null; });
      item.addEventListener('dragend', () => { dragged = null; }); fragment.append(item);
    });
    tabs.replaceChildren(fragment); if (focused) tabs.querySelector(`[data-view-id="${focused}"]`)?.focus({ preventScroll: true });
  }
  tabs.addEventListener('keydown', event => {
    const id = event.target.closest('[data-view-scope="tabs"]')?.dataset.viewId; if (!id) return;
    if (event.key === 'Delete' || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') { event.preventDefault(); event.stopPropagation(); close(id); }
    if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); const i = ids.indexOf(id), next = i + (event.key === 'ArrowLeft' ? -1 : 1); if (next >= 0 && next < ids.length) { [ids[i], ids[next]] = [ids[next], ids[i]]; touched++; paint(); } }
  });
  const dialog = document.createElement('dialog'); dialog.id = 'open-views-dialog'; dialog.setAttribute('aria-labelledby', 'open-views-title');
  dialog.innerHTML = '<h2 id="open-views-title">Открыть представления</h2><p id="open-views-count"></p><progress hidden></progress><div class="button-row"><button type="button" data-confirm>Открыть</button><button type="button" data-cancel>Отмена</button></div>';
  document.body.append(dialog); let queued = [], stamp;
  const cancel = () => { bulkGeneration++; queued = []; dialog.close(); };
  dialog.querySelector('[data-cancel]').addEventListener('click', cancel); dialog.addEventListener('cancel', cancel);
  dialog.querySelector('[data-confirm]').addEventListener('click', async () => {
    const generation = ++bulkGeneration, candidates = queued.slice(), prepared = [], progress = dialog.querySelector('progress'); progress.hidden = false; progress.max = candidates.length;
    dialog.querySelector('[data-confirm]').disabled = true;
    for (let i = 0; i < candidates.length; i += 100) { if (generation !== bulkGeneration || stamp !== model.store.revision || !dialog.open) return; prepared.push(...candidates.slice(i, i + 100)); progress.value = prepared.length; await new Promise(resolve => window.setTimeout(resolve, 0)); }
    if (generation !== bulkGeneration || stamp !== model.store.revision || !dialog.open) return;
    for (const id of prepared) ensure(id); dialog.close(); touched++; if (prepared[0]) activateView(prepared[0]); else paint(); status(`Открыто вкладок: ${prepared.length}. На полотне рисуется только активное представление.`);
  });
  function openMany(requested) {
    if (blocked()) return false; reconcile(); const available = new Set(model.store.snapshot.views.map(entry => entry.view.id)); queued = [...new Set(requested)].filter(id => available.has(id) && !ids.includes(id)); stamp = model.store.revision;
    dialog.querySelector('#open-views-count').textContent = `Будет открыто вкладок: ${queued.length}. Уже открытые повторно не добавляются.`;
    dialog.querySelector('progress').hidden = true; dialog.querySelector('[data-confirm]').disabled = !queued.length; dialog.showModal(); return true;
  }
  const openAll = document.createElement('button'); openAll.type = 'button'; openAll.textContent = 'Открыть все представления…'; openAll.id = 'open-all-views'; openAll.addEventListener('click', () => openMany(orderedViews(model.store.snapshot.views).map(entry => entry.view.id))); document.getElementById('views')?.after(openAll);
  window.addEventListener('arkita-document-settings', event => { settings = event.detail; });
  reset();
  if (window.schemkaDesktop?.documentPreferences) { const generation = resetGeneration, interactions = touched; window.schemkaDesktop.documentPreferences().then(result => { if (result.status !== 'ok') return; settings = result.settings; if (interactions === touched) { reset(); render(); } }).catch(() => {}); }
  window.addEventListener('pagehide', () => { bulkGeneration++; });
  return { beforeActivate, afterActivate, reset, render: paint, close, reorder, openMany, get ids() { reconcile(); return ids.slice(); } };
}
