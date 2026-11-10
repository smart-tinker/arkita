import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import { installAdvancedSearch } from './advanced-search.js';
import { shortcutKey } from './workbench.js';

const categoryNames = { project: 'Модель', element: 'Элемент', junction: 'Узел связи', relationship: 'Отношение', view: 'Представление' };
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' }), lexicalCollator = new Intl.Collator('ru',{numeric:false,sensitivity:'base'});
const normalized = value => value.normalize('NFC').toLowerCase();
const recordName = (kind, item) => kind === 'relationship' ? item.label || '(без подписи)' : item.name || '(без названия)';

/** Search shared records, including those with no drawing in any view. */
export function findModelObjects(state, query, category = 'all', { naturalSort = true } = {}) {
  const needle = normalized(query.trim());
  if (!needle) return [];
  const collections = [['project', [state.project]], ['element', state.elements], ['junction', state.junctions], ['relationship', state.relationships], ['view', state.views.map(entry => entry.view)]];
  const names = new Map(collections.flatMap(([kind, records]) => records.map(item => [`${kind}:${item.id}`, recordName(kind, item)])));
  const matches = [];
  for (const [kind, records] of collections) {
    if (category !== 'all' && category !== kind) continue;
    for (const item of records) {
      const name = recordName(kind, item);
      const context = kind === 'relationship' ? `${names.get(`${item.source.kind}:${item.source.id}`)} → ${names.get(`${item.target.kind}:${item.target.id}`)}` : '';
      const fields = [item.name || '', item.label || '', item.id, item.type || '', item.documentation || '', ...propertyEntries(item.properties).flatMap(row => [row.key, row.value]), context];
      if (normalized(fields.join('\n')).includes(needle)) matches.push({ kind, id: item.id, name, type: item.type || '', context });
    }
  }
  return matches.sort((a, b) => (naturalSort ? collator : lexicalCollator).compare(a.name, b.name) || a.kind.localeCompare(b.kind, 'en') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Search state belongs to the editor session, never to the model or its history. */
export function installModelSearch({ document, model, panel, openConcept, openMetadata, selectConcept = ref => model.select(ref), activateView, blocked, status, openDialog, render, revealDrawing, preferences = null }) {
  const $ = id => document.getElementById(id);
  const input = $('model-search'), category = $('model-search-category'), clear = $('model-search-clear');
  const results = $('model-search-results'), summary = $('model-search-summary'), tree = $('tree-model'), more = $('model-search-more');
  const advanced = installAdvancedSearch({ document, model, openDialog, render, revealDrawing, blocked, status, openOwner(owner) {
    if (owner.kind === 'view') activateView(owner.id);
    else if (['element', 'junction', 'relationship'].includes(owner.kind)) openConcept(owner);
    else openMetadata?.(owner);
  } });
  let query = '', selectedCategory = 'all', projectId = null, store = null, visibleCount = 100;

  function refresh() {
    advanced.refresh();
    const state = model.store.snapshot;
    if (store !== model.store || projectId !== state.project.id) {
      store = model.store; projectId = state.project.id;
      query = ''; selectedCategory = 'all'; input.value = ''; category.value = 'all';
      visibleCount = 100;
    }
    const searching = Boolean(query.trim());
    const focusKey = document.activeElement?.dataset.searchKey;
    const found = findModelObjects(state,query,selectedCategory,{naturalSort:preferences?.get('behavior').naturalSort ?? true});
    tree.hidden = searching; results.hidden = !searching; summary.hidden = !searching;
    clear.disabled = !query && selectedCategory === 'all'; category.disabled = !searching;
    more.hidden = found.length <= visibleCount;
    summary.textContent = found.length ? `Найдено: ${found.length}${found.length > visibleCount ? ` · показано: ${visibleCount}` : ''}` : 'Ничего не найдено. Измените запрос или очистите поиск.';
    results.replaceChildren();
    const sourceStore = model.store, sourceProject = state.project.id;
    for (const result of found.slice(0, visibleCount)) {
      const row = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'model-search-result';
      button.dataset.searchKey = `${result.kind}:${result.id}`;
      button.dataset.focusKey = `search-${result.kind}-${result.id}`;
      button.dataset.searchKind = result.kind; button.dataset.searchId = result.id;
      const name = document.createElement('strong'), description = document.createElement('span'), identity = document.createElement('span');
      name.textContent = result.name;
      description.textContent = [categoryNames[result.kind], result.type, result.context].filter(Boolean).join(' · ');
      identity.textContent = result.id; identity.className = 'model-search-id';
      button.append(name, description, identity); row.append(button); results.append(row);
      button.addEventListener('click', () => {
        if (blocked()) { status('Завершите или отмените текущую правку перед переходом.'); return; }
        const current = model.store.snapshot;
        if (!button.isConnected || sourceStore !== model.store || sourceProject !== current.project.id ||
            !findModelObjects(current, query, selectedCategory).some(item => item.kind === result.kind && item.id === result.id)) {
          refresh(); status('Результаты поиска изменились. Выберите объект заново.'); return;
        }
        if (result.kind === 'view') activateView(result.id);
        else selectConcept({ kind: result.kind, id: result.id });
      });
    }
    if (focusKey) [...results.querySelectorAll('button')].find(button => button.dataset.searchKey === focusKey)?.focus({ preventScroll: true });
  }
  function focusSearch() {
    if (blocked()) return;
    panel('catalog'); input.focus(); input.select();
  }
  function clearSearch() {
    if (blocked()) return;
    query = ''; selectedCategory = 'all'; input.value = ''; category.value = 'all'; visibleCount = 100; refresh(); input.focus();
  }
  input.addEventListener('input', () => {
    if (blocked()) { input.value = query; return; }
    if(preferences?.get('behavior').searchTrigger === 'enter') {clear.disabled=!input.value&&!query&&selectedCategory==='all';return;}
    query = input.value; visibleCount = 100; refresh();
  });
  category.addEventListener('change', () => {
    if (blocked()) { category.value = selectedCategory; return; }
    selectedCategory = category.value; visibleCount = 100; refresh();
  });
  clear.addEventListener('click', clearSearch);
  more.addEventListener('click', () => {
    if (blocked()) return;
    const next = visibleCount; visibleCount += 100; refresh(); results.querySelectorAll('button')[next]?.focus();
  });
  $('model-search-focus').addEventListener('click', focusSearch);
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || blocked()) return;
    if (event.key === 'Escape' && (query || input.value)) { event.preventDefault(); event.stopPropagation(); clearSearch(); }
    if(event.key==='Enter' && preferences?.get('behavior').searchTrigger==='enter') {query=input.value;visibleCount=100;refresh();}
    if (['Enter', 'ArrowDown'].includes(event.key) && query.trim()) {
      event.preventDefault(); event.stopPropagation(); results.querySelector('button')?.focus();
    }
  });
  results.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !blocked()) {
      event.preventDefault(); event.stopPropagation(); clearSearch();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.shiftKey || shortcutKey(event) !== 'f' || blocked()) return;
    if (event.target !== input && event.target.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')) return;
    event.preventDefault(); focusSearch();
  });
  // Do not let a search click discard an unfinished inline or native operation.
  for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
    if (event.target.closest?.('#model-search-region') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation(); status('Завершите или отмените текущую правку перед поиском.');
    }
  }, true);
  preferences?.subscribe((_value,changed)=>{if(changed.includes('behavior')){if(preferences.get('behavior').searchTrigger==='input')query=input.value;refresh();}});
  refresh();
  return { refresh, advanced };
}
