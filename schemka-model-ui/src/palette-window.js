import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { createNotationPaletteGlyph } from './notation.js';
export const PALETTE_MIME = 'application/x-arkita-palette';

/** A view of an owner-issued DTO. This window never owns a model/controller. */
export function installPaletteWindow({ document, window, bridge = window.arkitaPalette }) {
  const input = document.getElementById('palette-window-query'), host = document.getElementById('palette-window-items'), feedback = document.getElementById('palette-window-status'), dock = document.getElementById('palette-dock');
  let state = null, received = false, composing = false; const collapsed = new Set();
  const key = entry => `${entry.kind}:${entry.type}:${entry.profileId ?? ''}`;
  const isPage = entry => entry.kind==='tool'&&['palette-next','palette-previous'].includes(entry.type);
  const known = entry => (CURRENT_CATALOG[`${entry.kind}Types`] ?? []).includes(entry.type) || entry.kind === 'tool' && ['smart-link', 'visual-connector', 'palette-next', 'palette-previous'].includes(entry.type) || entry.kind === 'visualNode' && ['note', 'group', 'legend', 'viewReference', 'image'].includes(entry.type);
  const message = text => { feedback.textContent = text; };
  function render() {
    const focus = document.activeElement?.dataset.paletteKey, scrollTop = host.scrollTop, query = input.value.toLocaleLowerCase().trim(), groups = new Map(); host.replaceChildren();
    if (!state) { message('Ожидание модели…'); return; }
    const entries = state.types.map((entry, index) => ({ entry, index })).filter(({ entry }) => known(entry) && (isPage(entry)||`${entry.label} ${entry.type} ${entry.description}`.toLocaleLowerCase().includes(query)));
    for (const { entry, index } of entries) {
      const category = entry.category || (entry.profileId ? 'Специализации' : entry.kind === 'relationship' ? 'Отношения' : entry.kind === 'junction' ? 'Junctions' : entry.kind === 'tool' ? 'Инструменты' : entry.kind === 'visualNode' ? 'Аннотации' : 'Элементы');
      if (!groups.has(category)) { const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = category; details.open = Boolean(query) || !collapsed.has(category); details.append(summary); details.addEventListener('toggle', () => { if (query) return; if (details.open) collapsed.delete(category); else collapsed.add(category); }); groups.set(category, details); host.append(details); }
      const button = document.createElement('button'), glyph = document.createElement('span'), label = document.createElement('strong'); button.type = 'button'; button.className = 'palette-tool'; button.disabled = !entry.enabled; button.title = entry.description; button.dataset.paletteKey = key(entry); button.setAttribute('aria-pressed', String(Boolean(entry.active))); button.draggable = entry.enabled;
      glyph.className = 'palette-glyph'; const icon = state.icons?.find(item => item.id === entry.iconId); if (icon) { const image = document.createElement('img'); image.src = `data:${icon.mediaType};base64,${icon.data}`; image.alt = ''; image.width = 42; image.height = 24; glyph.append(image); } else if (['element', 'junction', 'relationship'].includes(entry.kind)) glyph.append(createNotationPaletteGlyph(document, entry.type, undefined, `detached-palette-${index}`)); else glyph.textContent = entry.kind === 'tool' ? '✦' : '▧'; label.textContent = entry.label; button.append(glyph, label); groups.get(category).append(button);
      const nonce = state.nonce; let dragged = false;
      button.addEventListener('click', async () => { if (dragged) return; try { const result = await bridge.command({ nonce, index }); if (result?.status && !['ok', 'sent'].includes(result.status)) message(result.message || result.reason || 'Инструмент недоступен.'); } catch (failure) { message(failure.message); } });
      button.addEventListener('dragstart', event => { if (!entry.enabled) { event.preventDefault(); return; } dragged = true; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(PALETTE_MIME, JSON.stringify({ nonce, index })); });
      button.addEventListener('dragend', () => window.setTimeout(() => { dragged = false; }, 0));
    }
    host.scrollTop = scrollTop; for (const item of host.querySelectorAll('[data-palette-key]')) if (item.dataset.paletteKey === focus) item.focus({ preventScroll: true });
    const results=entries.filter(({entry})=>!isPage(entry)),paged=state.types.some(isPage);message(query&&paged?`${results.length?'Поиск по текущей странице.':'На этой странице ничего не найдено.'} Переключите страницу или очистите поиск.`:results.length?'':query?'Ничего не найдено.':'Для этой модели нет доступных инструментов.');
  }
  function accept(value) {
    const snapshot = value?.snapshot ?? value;
    if (!snapshot || !Array.isArray(snapshot.types) || snapshot.types.length > 512 || typeof snapshot.nonce !== 'string' || !['dark', 'light'].includes(snapshot.theme)) { message('Не удалось получить состояние палитры.'); return; }
    state = snapshot; document.documentElement.dataset.theme = state.theme; render();
  }
  input.addEventListener('input', () => { if (!composing) render(); }); input.addEventListener('compositionstart', () => { composing = true; }); input.addEventListener('compositionend', () => { composing = false; render(); });
  dock.addEventListener('click', async () => { try { const result = await bridge.dock(); if (result?.status && !['ok', 'docked'].includes(result.status)) message(result.message || result.reason); } catch (failure) { message(failure.message); } });
  if (!bridge) { message('Откройте палитру из окна Arkita.'); dock.disabled = true; input.disabled = true; return { render, accept }; }
  const unsubscribe = bridge.onState(value => { received = true; accept(value); });
  Promise.resolve(bridge.ready()).then(value => { if (!received) accept(value); }).catch(failure => message(failure.message));
  window.addEventListener('pagehide', () => unsubscribe?.());
  return { render, accept };
}
if (typeof window !== 'undefined' && window.arkitaPalette) installPaletteWindow({ document, window });
