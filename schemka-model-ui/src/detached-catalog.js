import { LIMITS } from '../../schemka-model-core/src/json.js';
import { CATALOG_SECTIONS, catalogTreeIndex } from './catalog-tree.js';
import { captionText } from './visual-drawings.js';

const collators = { natural: new Intl.Collator('ru', { numeric: true, sensitivity: 'base' }), lexical: new Intl.Collator('ru', { numeric: false, sensitivity: 'base' }) };
const key = ref => `${ref.kind}:${ref.id}`;
const title = item => item?.name || item?.label || '(без названия)';

/** The detached window is a read-only view; all model commands return to this owner. */
export function installDetachedCatalog({ document, window, model, session, preferences, status, activate, desktop = window.schemkaDesktop }) {
  const button = (label, id, action) => { const control = document.createElement('button'); control.type = 'button'; control.id = id; control.textContent = label; control.addEventListener('click', action); return control; };
  let detached = false, busy = false, generation = 0, signature = '', publishing = false, publishAgain = false;
  const trigger = button('Отделить дерево', 'catalog-detach', open);
  trigger.hidden = !desktop?.catalogOpen;
  document.querySelector('.section-heading')?.append(trigger);
  const dock = button('Вернуть дерево модели', 'catalog-owner-dock', async () => {
    try { await desktop.catalogDock(); docked(); }
    catch (error) { status(`Дерево не возвращено: ${error.message}`); }
  });
  dock.hidden = true;
  [...document.querySelectorAll('.app-menu')].find(item => item.querySelector('summary')?.textContent === 'Вид')?.querySelector('.menu-items')?.append(dock);

  function selectedRef(state) {
    const selection = model.selection, view = model.view;
    if (selection?.kind === 'occurrence') return view?.occurrences.find(item => item.id === selection.id)?.concept ?? null;
    if (selection?.kind === 'connection') { const item = view?.connections.find(entry => entry.id === selection.id); return item ? { kind: 'relationship', id: item.relationshipId } : null; }
    if (selection?.kind === 'view') return state.views.some(item => item.view.id === selection.id) ? selection : null;
    if (['element', 'junction', 'relationship', 'folder'].includes(selection?.kind)) return catalogTreeIndex(state).records.has(key(selection)) ? selection : null;
    return null;
  }
  function snapshot() {
    const state = model.store.snapshot, view = model.view, index = catalogTreeIndex(state), selected = selectedRef(state), selectedKey = selected && key(selected);
    const behavior = preferences?.get('behavior'), collator = behavior?.naturalSort === false ? collators.lexical : collators.natural;
    const uses = new Map();
    for (const entry of state.views) {
      for (const item of entry.occurrences) { const ref = key(item.concept); uses.set(ref, (uses.get(ref) || 0) + 1); }
      for (const item of entry.connections) { const ref = `relationship:${item.relationshipId}`; uses.set(ref, (uses.get(ref) || 0) + 1); }
    }
    const entries = CATALOG_SECTIONS.map(section => ({ kind: 'section', id: section.id, parent: null, label: section.label, selected: false, active: false, uses: 0, drawings: index.counts.get(section.id) || 0, canAdd: false }));
    const compare = (a, b) => collator.compare(title(index.records.get(key(a))), title(index.records.get(key(b)))) || a.id.localeCompare(b.id);
    for (const section of CATALOG_SECTIONS) {
      const root = entries.findIndex(item => item.kind === 'section' && item.id === section.id), pending = [{ folderId: null, parent: root }];
      while (pending.length) {
        const { folderId, parent } = pending.pop(), folder = folderId ? index.records.get(`folder:${folderId}`) : null;
        const folders = (index.children.get(folderId) || []).filter(item => index.sectionsForFolder.get(item.id)?.has(section.id)).map(item => ({ kind: 'folder', id: item.id }));
        const members = (folder ? folder.members : [
          ...state.elements.map(item => ({ kind: 'element', id: item.id })),
          ...state.junctions.map(item => ({ kind: 'junction', id: item.id })),
          ...state.relationships.map(item => ({ kind: 'relationship', id: item.id })),
          ...state.views.map(item => ({ kind: 'view', id: item.view.id })),
        ].filter(ref => !index.owners.has(key(ref)))).filter(ref => index.sectionFor(ref) === section.id);
        const refs = [...folders, ...members].sort(compare), nested = [];
        for (const ref of refs) {
          const item = index.records.get(key(ref)), owner = ref.kind === 'folder' ? index.records.get(`folder:${item.parentFolderId}`) : folder;
          const label = owner?.childLabelTemplate ? captionText(owner.childLabelTemplate, { ...item, kind: ref.kind }, state, LIMITS.string) : title(item);
          const drawings = ref.kind === 'relationship' ? view?.connections.filter(entry => entry.relationshipId === ref.id).length || 0
            : ['element', 'junction'].includes(ref.kind) ? view?.occurrences.filter(entry => key(entry.concept) === key(ref)).length || 0 : 0;
          const entryIndex = entries.push({ kind: ref.kind, id: ref.id, parent, label, type: item.type || (ref.kind === 'view' ? 'Представление' : ref.kind === 'folder' ? 'Папка' : ''),
            selected: key(ref) === selectedKey, active: ref.kind === 'view' && model.viewId === ref.id, uses: uses.get(key(ref)) || 0, drawings,
            canAdd: Boolean(view && ['element', 'junction'].includes(ref.kind) && model.conceptVisible(ref)) }) - 1;
          if (ref.kind === 'folder') nested.push({ folderId: ref.id, parent: entryIndex });
        }
        for (let i = nested.length - 1; i >= 0; i--) pending.push(nested[i]);
      }
    }
    return { documentToken: session.documentToken, revision: model.store.revision, viewId: model.viewId, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', projectName: state.project.name, entries };
  }
  function currentSignature() {
    const selection = selectedRef(model.store.snapshot);
    return [session.documentToken, model.store.revision, model.viewId, selection ? key(selection) : '', document.documentElement.dataset.theme, preferences?.revision ?? 0].join(':');
  }
  function paint() { document.body.dataset.catalogDetached = String(detached); trigger.disabled = busy; dock.hidden = !detached; }
  function docked() { detached = false; signature = ''; generation++; paint(); }
  async function open() {
    if (busy || !desktop?.catalogOpen) return;
    busy = true; paint(); const ticket = ++generation;
    try {
      const result = await desktop.catalogOpen(snapshot());
      if (ticket !== generation) return;
      if (result?.status !== 'detached') throw Error(result?.message || result?.reason || 'Окно недоступно.');
      detached = true; signature = ''; paint(); await refresh();
    } catch (error) { status(`Дерево не открыто: ${error.message}`); }
    finally { busy = false; paint(); }
  }
  async function refresh() {
    if (!detached || publishing) { publishAgain = detached; return; }
    if (currentSignature() === signature) return;
    publishing = true;
    try {
      do {
        publishAgain = false; const next = snapshot(), forSignature = currentSignature();
        const result = await desktop.catalogPublish(next);
        if (result?.status === 'docked') { docked(); break; }
        if (result?.status !== 'ok') throw Error(result?.message || result?.reason || 'Состояние не принято.');
        signature = forSignature;
      } while (publishAgain || signature !== currentSignature());
    } catch (error) { status(`Дерево не обновлено: ${error.message}`); }
    finally { publishing = false; }
  }
  function command(request) {
    if (!detached || request?.documentToken !== session.documentToken || request.revision !== model.store.revision || request.viewId !== model.viewId) { status('Элемент дерева устарел. Выберите его заново.'); void refresh(); return; }
    const ref = { kind: request.kind, id: request.id };
    if (request.action === 'add') {
      if (!['element', 'junction'].includes(ref.kind) || !model.conceptVisible(ref) || !model.view) { status('Элемент нельзя добавить в текущий вид.'); void refresh(); return; }
      activate(ref, 'add');
    } else if (request.kind === 'view' || ['element', 'junction', 'relationship'].includes(ref.kind)) activate(ref, 'select');
    void refresh();
  }
  const unsubscribe = desktop?.onCatalogAction?.(command), undock = desktop?.onCatalogDocked?.(docked);
  const themeObserver = new window.MutationObserver(() => void refresh()); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pagehide', () => { generation++; themeObserver.disconnect(); unsubscribe?.(); undock?.(); });
  paint();
  return { open, refresh, get detached() { return detached; }, get transient() { return busy; } };
}
