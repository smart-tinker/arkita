/** Owner-issued bounded DTO only; the child window never owns model state. */
export function installCatalogWindow({ document, window, bridge = window.arkitaCatalog }) {
  const input = document.getElementById('catalog-window-query'), host = document.getElementById('catalog-window-items');
  const feedback = document.getElementById('catalog-window-status'), count = document.getElementById('catalog-window-count');
  const previous = document.getElementById('catalog-previous'), next = document.getElementById('catalog-next');
  const expanded = new Set(), pages = new Map();
  let state = null, page = 0, query = '', received = false, composing = false;
  const message = text => { feedback.textContent = text; };
  const validViewId = value => value === null || typeof value === 'string' && /^view-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const rowKey = (entry, index) => `${entry.kind}:${entry.id}:${entry.parent ?? index}`;
  function valid(value) {
    return value && typeof value.nonce === 'string' && Array.isArray(value.entries) && value.entries.length <= 65536 &&
      Number.isSafeInteger(value.revision) && typeof value.documentToken === 'string' && validViewId(value.viewId) && typeof value.projectName === 'string' && ['light', 'dark'].includes(value.theme);
  }
  function send(index, action = 'select') {
    if (!state || !bridge) return;
    bridge.command({ nonce: state.nonce, index, action }).then(result => {
      if (result?.status && result.status !== 'ok') message(result.message || result.reason || 'Действие недоступно.');
    }).catch(error => message(error.message));
  }
  function leaf(entry, index) {
    const row = document.createElement('div'), choose = document.createElement('button');
    row.className = 'catalog-window-row'; choose.type = 'button'; choose.textContent = entry.label; choose.dataset.catalogIndex = String(index);
    choose.title = [entry.type, entry.id].filter(Boolean).join(' · '); choose.setAttribute('aria-pressed', String(entry.selected));
    if (entry.active) choose.setAttribute('aria-current', 'true');
    choose.addEventListener('click', () => send(index)); row.append(choose);
    const meta = document.createElement('small'); meta.textContent = `${entry.type || 'Объект'} · в модели: ${entry.uses}${entry.kind === 'view' ? '' : ` · в текущем виде: ${entry.drawings}`}`; choose.append(meta);
    if (entry.canAdd) {
      const add = document.createElement('button'); add.type = 'button'; add.className = 'catalog-window-add'; add.textContent = '＋';
      add.setAttribute('aria-label', `Добавить в текущий вид: ${entry.label}`); add.title = 'Добавить экземпляр в текущий вид';
      add.addEventListener('click', event => { event.stopPropagation(); send(index, 'add'); }); row.append(add);
    }
    return row;
  }
  function descendants(parent, children, container) {
    const source = children.get(parent) || [], start = pages.get(parent) || 0, shown = source.slice(start, start + 100), folders = [];
    for (const index of shown) {
      const entry = state.entries[index];
      if (entry.kind !== 'folder') { container.append(leaf(entry, index)); continue; }
      const details = document.createElement('details'), summary = document.createElement('summary'), label = document.createElement('span'), branch = document.createElement('div');
      label.textContent = entry.label; summary.append(label); details.open = expanded.has(rowKey(entry, index)); branch.className = 'catalog-branch';
      details.append(summary, branch); container.append(details);
      if (details.open) folders.push({ parent: index, branch });
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) expanded.add(rowKey(entry, index)); else expanded.delete(rowKey(entry, index));
        render();
      });
    }
    if (start > 0 || start + shown.length < source.length) {
      const controls = document.createElement('div'); controls.className = 'catalog-window-pages';
      const back = document.createElement('button'), label = document.createElement('span'), more = document.createElement('button');
      back.type = more.type = 'button'; back.textContent = '← Предыдущие'; more.textContent = 'Следующие →';
      back.disabled = start === 0; more.disabled = start + shown.length >= source.length;
      label.textContent = `${start + 1}–${Math.min(start + 100, source.length)} из ${source.length}`;
      back.addEventListener('click', () => { pages.set(parent, Math.max(0, start - 100)); render(); });
      more.addEventListener('click', () => { pages.set(parent, start + 100); render(); });
      controls.append(back, label, more); container.append(controls);
    }
    return folders;
  }
  function renderTree() {
    const byParent = new Map();
    state.entries.forEach((entry, index) => { if (entry.parent !== null) { if (!byParent.has(entry.parent)) byParent.set(entry.parent, []); byParent.get(entry.parent).push(index); } });
    for (let section = 0; section < state.entries.length; section++) {
      const entry = state.entries[section]; if (entry.kind !== 'section') continue;
      const details = document.createElement('details'), summary = document.createElement('summary'), label = document.createElement('span'), branch = document.createElement('div');
      details.open = true; label.textContent = `${entry.label} · ${entry.drawings}`; summary.append(label); branch.className = 'catalog-branch'; details.append(summary, branch); host.append(details);
      const stack = [{ parent: section, branch }];
      while (stack.length) { const current = stack.pop(); for (const item of descendants(current.parent, byParent, current.branch)) stack.push(item); }
    }
    const total = state.entries.filter(entry => !['section', 'folder'].includes(entry.kind)).length;
    count.textContent = `${total} объектов`;
  }
  function breadcrumbs(index) {
    const path = []; let entry = state.entries[index], parent = entry.parent;
    while (parent !== null) { const ancestor = state.entries[parent]; if (ancestor.kind === 'section' || ancestor.kind === 'folder') path.unshift(ancestor.label); parent = ancestor.parent; }
    return path.join(' / ');
  }
  function renderSearch() {
    const matches = [];
    state.entries.forEach((entry, index) => { if (!['section', 'folder'].includes(entry.kind) && `${entry.label} ${entry.type} ${breadcrumbs(index)}`.toLocaleLowerCase().includes(query)) matches.push({ entry, index }); });
    const totalPages = Math.max(1, Math.ceil(matches.length / 100)); page = Math.min(page, totalPages - 1);
    const visible = matches.slice(page * 100, (page + 1) * 100);
    previous.hidden = page === 0; next.hidden = page >= totalPages - 1; previous.disabled = page === 0; next.disabled = page >= totalPages - 1;
    previous.onclick = () => { page--; render(); }; next.onclick = () => { page++; render(); };
    for (const { entry, index } of visible) {
      const item = document.createElement('div'), path = document.createElement('div'); item.className = 'catalog-window-result'; path.className = 'catalog-path';
      path.textContent = breadcrumbs(index); item.append(path, leaf(entry, index)); host.append(item);
    }
    count.textContent = matches.length ? `${page * 100 + 1}–${Math.min((page + 1) * 100, matches.length)} из ${matches.length}` : 'Ничего не найдено.';
  }
  function render() {
    const focus = document.activeElement?.dataset.catalogIndex, scroll = host.scrollTop;
    host.replaceChildren(); if (!state) { message('Ожидание модели…'); return; }
    query = input.value.toLocaleLowerCase().trim(); document.getElementById('catalog-window-title').textContent = `Дерево · ${state.projectName || 'без названия'}`;
    document.documentElement.dataset.theme = state.theme;
    previous.hidden = next.hidden = true;
    if (query) renderSearch(); else renderTree();
    host.scrollTop = scroll;
    if (focus !== undefined) host.querySelector(`[data-catalog-index="${focus}"]`)?.focus({ preventScroll: true });
    message(query && count.textContent !== 'Ничего не найдено.' ? 'Поиск охватывает все разделы и папки.' : '');
  }
  function accept(value) {
    const snapshot = value?.snapshot ?? value;
    if (!valid(snapshot)) { message('Не удалось получить дерево модели.'); return; }
    state = snapshot; document.documentElement.dataset.theme = state.theme; render();
  }
  input.addEventListener('input', () => { page = 0; if (!composing) render(); });
  input.addEventListener('compositionstart', () => { composing = true; }); input.addEventListener('compositionend', () => { composing = false; page = 0; render(); });
  document.getElementById('catalog-dock').addEventListener('click', async () => { try { const result = await bridge.dock(); if (result?.status && result.status !== 'docked') message(result.message || result.reason || 'Дерево не возвращено.'); } catch (error) { message(error.message); } });
  if (!bridge) { message('Откройте дерево из окна Arkita.'); document.getElementById('catalog-dock').disabled = true; input.disabled = true; return { render, accept }; }
  const unsubscribe = bridge.onState(value => { received = true; accept(value); });
  Promise.resolve(bridge.ready()).then(value => { if (!received) accept(value); }).catch(error => message(error.message));
  window.addEventListener('pagehide', () => unsubscribe?.());
  return { render, accept };
}
if (typeof window !== 'undefined' && window.arkitaCatalog) installCatalogWindow({ document, window });
