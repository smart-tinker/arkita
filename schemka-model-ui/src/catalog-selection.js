import { modelSearchRecords } from '../../schemka-model-core/src/model-search.js';
import { commonProperties, ownerKey } from '../../schemka-model-core/src/bulk-metadata.js';

const selector = 'button[data-rename-kind][data-rename-id],button[data-search-kind][data-search-id],button[data-folder-focus]';
const kinds = new Set(['project', 'element', 'junction', 'relationship', 'view', 'folder']);
function ownerOf(button) {
  if (button.dataset.renameKind) return { kind: button.dataset.renameKind, id: button.dataset.renameId };
  if (button.dataset.searchKind) return { kind: button.dataset.searchKind, id: button.dataset.searchId };
  const row = button.closest('[data-catalog-kind][data-catalog-id]'); return row ? { kind: row.dataset.catalogKind, id: row.dataset.catalogId } : null;
}
function visible(button, root) {
  for (let element = button; element && element !== root.parentElement; element = element.parentElement) {
    if (element.hidden || element.style.display === 'none' || element.getAttribute('aria-hidden') === 'true') return false;
    if (element.tagName === 'DETAILS' && !element.open && !element.querySelector(':scope > summary')?.contains(button)) return false;
  }
  return true;
}
/** A separate catalogue scope; it never inserts concepts into canvas drawing selections. */
export function installCatalogSelection({ document, model, openDialog, status = () => {}, blocked = () => false, onPrimary = () => {}, editProperties = () => {} }) {
  const root = document.querySelector('.catalog'); if (!root) throw Error('Catalogue panel is missing');
  const node = (tag, text, id) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (id) item.id = id; return item; };
  const button = (text, action, id) => { const item = node('button', text, id); item.type = 'button'; item.addEventListener('click', action); return item; };
  const summary = node('div', undefined, 'catalog-selection-summary'); summary.className = 'catalog-selection-summary'; summary.hidden = true;
  const description = node('span', '', 'catalog-selection-status'); description.setAttribute('role', 'status');
  summary.append(description, button('Снять выделение', reset, 'catalog-selection-clear')); const searchRegion = root.querySelector('#model-search-region'); if (searchRegion) searchRegion.after(summary); else root.prepend(summary);
  const dialog = node('dialog', undefined, 'catalog-selection-dialog'), title = node('h2', 'Свойства выделения дерева', 'catalog-selection-title'), body = node('div', undefined, 'catalog-selection-details'); dialog.setAttribute('aria-labelledby', title.id);
  dialog.append(title, body, button('Изменить свойства выбранных…', () => { const owners = selection.map(item => ({ ...item })); cancel(); editProperties(owners); }, 'catalog-selection-edit'), button('Закрыть', cancel, 'catalog-selection-close')); document.body.append(dialog);
  let selection = [], primary = null, anchor = null, generation = 0, cachedStore = null, cachedRevision = -1, records = new Map(), projectId = null;
  function index() { if (cachedStore !== model.store || cachedRevision !== model.store.revision) { cachedStore = model.store; cachedRevision = model.store.revision; records = new Map(modelSearchRecords(model.store.snapshot).map(row => [ownerKey(row.owner), row])); } return records; }
  function rows() {
    const all = index(), unique = new Map();
    for (const element of root.querySelectorAll(selector)) { const owner = ownerOf(element); if (!owner || !kinds.has(owner.kind) || !all.has(ownerKey(owner)) || !visible(element, root)) continue; if (!unique.has(ownerKey(owner))) unique.set(ownerKey(owner), { owner, element }); }
    return [...unique.values()];
  }
  function reconcile() {
    const stateId = model.store.snapshot.project.id; if (projectId !== null && projectId !== stateId) { selection = []; primary = anchor = null; generation++; } projectId = stateId;
    const allowed = new Set(rows().map(row => ownerKey(row.owner))), next = selection.filter(owner => allowed.has(ownerKey(owner)));
    if (next.length !== selection.length) { selection = next; if (!selection.some(owner => ownerKey(owner) === ownerKey(primary || {}))) primary = selection.at(-1) || null; if (!allowed.has(ownerKey(anchor || {}))) anchor = primary; generation++; }
  }
  function paint() {
    const keys = new Set(selection.map(ownerKey));
    for (const element of root.querySelectorAll(selector)) { const owner = ownerOf(element); if (!owner) continue; const selected = keys.has(ownerKey(owner)), was = element.dataset.catalogSelected === 'true'; element.dataset.catalogSelected = String(selected); element.classList.toggle('catalog-selection-primary', selected && ownerKey(owner) === ownerKey(primary || {})); if (selected || was) element.setAttribute('aria-pressed', String(selected)); }
    summary.hidden = selection.length < 2; const record = index().get(ownerKey(primary || {})); description.textContent = `Выбрано в дереве: ${selection.length}. Основной: ${record?.name || '(без имени)'}.`;
    if (dialog.open) renderDetails(body);
  }
  function announce() { paint(); status(selection.length ? `Выделение дерева: ${selection.length}. Ctrl/⌘ — добавить; Shift — диапазон; Ctrl/⌘+A — видимые строки текущей страницы.` : 'Выделение дерева снято.'); }
  function choose(owner, { toggle = false, range = false } = {}) {
    const visibleRows = rows(), at = visibleRows.findIndex(row => ownerKey(row.owner) === ownerKey(owner)); if (at < 0) return;
    const oldKeys = new Set(selection.map(ownerKey));
    if (range && anchor) {
      const start = visibleRows.findIndex(row => ownerKey(row.owner) === ownerKey(anchor)), additions = visibleRows.slice(start < 0 ? at : Math.min(start, at), start < 0 ? at + 1 : Math.max(start, at) + 1).map(row => row.owner);
      selection = toggle ? [...new Map([...selection, ...additions].map(item => [ownerKey(item), item])).values()] : additions;
    } else if (toggle) { selection = oldKeys.has(ownerKey(owner)) ? selection.filter(item => ownerKey(item) !== ownerKey(owner)) : [...selection, owner]; anchor = owner; }
    else { selection = [owner]; anchor = owner; }
    primary = selection.find(item => ownerKey(item) === ownerKey(owner)) || selection.at(-1) || null; generation++;
    if ((toggle || range) && primary && ['element', 'junction', 'relationship'].includes(primary.kind)) onPrimary({ ...primary });
    announce();
  }
  function selectAll() { selection = rows().map(row => row.owner); primary = selection.find(owner => ownerKey(owner) === ownerKey(primary || {})) || selection[0] || null; anchor = primary; generation++; announce(); }
  function reset() { const changed = selection.length || primary; selection = []; primary = anchor = null; if (changed) generation++; paint(); }
  function renderDetails(container, compact = false) {
    container.replaceChildren(); const chosen = selection.map(owner => index().get(ownerKey(owner))).filter(Boolean);
    container.append(node('p', `Область: видимые объекты дерева. Выбрано ${chosen.length}; скрытые фильтром, закрытые группы и другие страницы не включены.`));
    const main = index().get(ownerKey(primary || {})); container.append(node('p', `Основной объект: ${main?.name || '(без имени)'} · ${primary?.kind || ''} · ${primary?.id || ''}`));
    for (const [label, get] of [['Название', row => row.name], ['Тип', row => row.type || row.owner.kind], ['Документация', row => row.item.documentation || '']]) { const values = chosen.map(get), common = values.every(value => value === values[0]); container.append(node('p', `${label}: ${common ? values[0] || '⟨пусто⟩' : 'Разные значения'}`)); }
    const properties = commonProperties(chosen); if (!properties.length) container.append(node('p', 'Пользовательских свойств нет.'));
    for (const item of properties) container.append(node('p', `${item.key || '⟨пустое имя⟩'}: ${item.mixed ? 'Разные значения' : item.values.map(value => JSON.stringify(value)).join(', ') || '⟨пусто⟩'} · ${item.common ? 'у всех' : `есть у ${item.owners} из ${chosen.length}`} · записей ${item.count}`));
    if (compact) container.append(button('Открыть свойства выделения дерева…', openProperties));
    else { const list = node('ul'); for (const row of chosen) list.append(node('li', `${row.name || '(без имени)'} · ${row.owner.kind} · ${row.owner.id}`)); container.append(list); }
  }
  function refresh() { reconcile(); paint(); }
  function openProperties() { if (blocked()) return false; refresh(); if (!selection.length) return false; openDialog(dialog.id); renderDetails(body); return true; }
  function cancel() { if (dialog.open) { generation++; dialog.close(); } }
  root.addEventListener('click', event => {
    const element = event.target.closest?.(selector); if (!element || !root.contains(element) || blocked() || element.disabled) return; const owner = ownerOf(element); if (!owner || !index().has(ownerKey(owner))) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); }
    choose(owner, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey });
  }, true);
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || blocked() || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyA' || event.key.toLowerCase() === 'a')) { event.preventDefault(); event.stopImmediatePropagation(); selectAll(); }
    else if (event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { const list = rows(), at = list.findIndex(row => row.element === event.target), next = list[at + (event.key === 'ArrowUp' ? -1 : 1)]; if (next) { event.preventDefault(); event.stopImmediatePropagation(); choose(next.owner, { range: true, toggle: event.ctrlKey || event.metaKey }); next.element.focus(); } }
    else if (event.key === 'Escape' && selection.length) { event.preventDefault(); event.stopImmediatePropagation(); reset(); }
  }, true);
  root.addEventListener('toggle', refresh, true); root.addEventListener('input', () => queueMicrotask(refresh)); root.addEventListener('change', () => queueMicrotask(refresh));
  let queued = false;
  const observer = new document.defaultView.MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; refresh(); }); });
  for (const region of root.querySelectorAll('#tree-model,#catalog-folders,#model-search-results')) observer.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'style'] });
  document.defaultView.addEventListener('pagehide', () => observer.disconnect());
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }); dialog.addEventListener('close', () => { generation++; });
  return { refresh, reset, cancel, openProperties, scopeFromCanvas: reset, renderInspector(container) { refresh(); if (selection.length < 2) return false; renderDetails(container, true); return true; }, get count() { return selection.length; }, get owners() { return selection.map(item => ({ ...item })); }, get primary() { return primary && { ...primary }; }, get active() { return dialog.open; }, get transient() { return false; }, get generation() { return generation; } };
}
