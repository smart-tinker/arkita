import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { conceptRecord, conceptName, endpointConcept } from './concepts.js';
import { modelProfiles } from './profile-ui.js';

const kindNames = { element: 'Элемент', junction: 'Junction', relationship: 'Отношение' };
const excerpt = (value, limit = 1200) => typeof value !== 'string' ? '' : value.length <= limit ? value : `${value.slice(0, limit)}…\nОписание сокращено; полный текст доступен в свойствах.`;

/** Read-only hints are snapshots of existing catalogue prose and the selected model context. */
export function installContextHints({ document, window, model, blocked, status, readEnabled = () => true }) {
  const $ = id => document.getElementById(id), panel = $('context-hints-panel'), toggle = $('context-hints-toggle');
  const abort = new window.AbortController(), on = (target, type, action, options = {}) => target.addEventListener(type, action, { ...options, signal: abort.signal });
  const descriptions = new Map(), tools = new Map();
  for (const [kind, types] of [['element', CURRENT_CATALOG.elementTypes], ['junction', CURRENT_CATALOG.junctionTypes], ['relationship', CURRENT_CATALOG.relationshipTypes]]) {
    for (const type of types) {
      const id = `create-${type.toLowerCase()}`;
      descriptions.set(`${kind}:${type}`, $(`${id}-description`)?.textContent.trim() || 'Назначение этого типа пока не описано в установленном каталоге.');
      tools.set(id, { kind: 'type', conceptKind: kind, type });
    }
  }
  tools.set('smart-link-tool', { kind: 'smart-link' });
  let following = { kind: 'selection' }, pinned = null, observedStore = model.store, observedSelection = '', bookmark = null, disposed = false;
  let cachedState = null, cachedStore = null, cachedRevision = -1;
  const selectionKey = () => {
    const first = model.selection;
    return `${model.viewId ?? ''}|${first?.kind ?? ''}|${first?.id ?? ''}`;
  };
  function describe() {
    if (!cachedState || cachedStore !== model.store || cachedRevision !== model.store.revision) {
      cachedState = model.store.snapshot; cachedStore = model.store; cachedRevision = model.store.revision;
    }
    const state = cachedState, entry = state.views.find(item => item.view.id === model.viewId), view = entry?.view;
    const profile = modelProfiles.get(state.project.metamodel), reference = state.project.metamodel;
    const result = { title: '', identity: '', description: '', documentation: '', lines: [], revision: model.store.revision };
    result.lines.push(`Профиль каталога: ${reference.id} · версия ${reference.version}${profile ? '' : ' · UNKNOWN: профиль не установлен'}.`);
    result.lines.push('Пояснения интерфейса Arkita. Допустимость конкретного отношения проверяется отдельно; соответствие всей модели стандарту — UNKNOWN.');
    let target = following;
    if (target.kind === 'selection') {
      const chosen = model.selection;
      const ref = ['occurrence', 'connection'].includes(chosen?.kind) ? entry && endpointConcept(entry, chosen) : chosen;
      target = conceptRecord(state, ref) ? ref : { kind: 'view', id: model.viewId };
    }
    if (target.kind === 'smart-link') {
      result.title = 'Инструмент связи'; result.identity = 'smart-link-tool';
      result.description = 'Протяните от одного видимого объекта к другому, затем выберите тип отношения. Действующая проверка показывает подтверждённые и неизвестные варианты. Escape отменяет незавершённое создание.';
    } else if (target.kind === 'type' || kindNames[target.kind]) {
      const record = target.kind === 'type' ? null : conceptRecord(state, target), kind = target.conceptKind ?? target.kind, type = target.type ?? record?.type;
      if (target.kind !== 'type' && !record) { result.title = 'Объект больше не существует'; result.identity = target.id; return result; }
      result.title = record ? conceptName(state, target) : `Инструмент: ${type}`;
      result.identity = `${kindNames[kind]} · ${type}${record ? ` · ${record.id}` : ''}`;
      result.description = descriptions.get(`${kind}:${type}`) ?? 'Назначение этого типа пока не описано в установленном каталоге.';
      result.documentation = excerpt(record?.documentation);
      for (const application of record?.profileApplications ?? []) {
        const definition = state.customizationProfiles?.find(item => item.id === application.profileId);
        result.lines.push(`Локальный профиль: ${excerpt(definition?.name, 180) || '(нет определения)'} · ${application.profileId} · ${definition?.purpose ?? 'UNKNOWN'}. Базовый тип остаётся ${type}.`);
      }
    } else {
      const viewpoint = state.viewpoints?.find(item => item.id === view?.viewpointId);
      if (target.kind === 'viewpoint') {
        result.title = viewpoint?.name || 'Представление без viewpoint'; result.identity = viewpoint ? `Viewpoint · ${viewpoint.id}` : 'Ручной выбор содержания';
        result.description = 'Viewpoint задаёт задачи представления и точный выбор типов. Скрытые рисунки остаются в модели; фильтр не является нормативной проверкой.';
        result.documentation = excerpt(viewpoint?.documentation);
        if (viewpoint) {
          for (const [label, values] of [['Заинтересованные стороны', viewpoint.stakeholders], ['Задачи', viewpoint.concerns], ['Purpose', viewpoint.purpose], ['Content', viewpoint.content]]) {
            result.lines.push(`${label}: ${excerpt((values ?? []).join('; '), 400) || 'не указано'}`);
          }
          result.lines.push(`Выбрано типов: элементы ${viewpoint.selection.elementTypes.length}, junctions ${viewpoint.selection.junctionTypes.length}, отношения ${viewpoint.selection.relationshipTypes.length}.`);
        }
      } else {
        result.title = view?.name || 'В модели нет открытого представления'; result.identity = view ? `Представление · ${view.id}` : 'Выберите концепт или тип в палитре';
        result.description = 'Представление использует общие концепты и хранит собственные рисунки и координаты. Изменение имени концепта видно во всех его использованиях; перемещение рисунка относится к одному виду.';
        result.documentation = excerpt(view?.documentation);
        result.lines.push(viewpoint ? `Viewpoint: ${viewpoint.name} · ${viewpoint.id}. Подведите фокус к выбору viewpoint для его описания.` : 'Viewpoint не назначен.');
      }
    }
    return result;
  }
  function paint(value) {
    $('context-hints-title').textContent = value.title; $('context-hints-identity').textContent = value.identity;
    $('context-hints-description').textContent = value.description; $('context-hints-documentation').textContent = value.documentation;
    $('context-hints-documentation').hidden = !value.documentation;
    const list = $('context-hints-details'); list.replaceChildren();
    for (const text of value.lines) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
  }
  function pinStatus() {
    $('context-hints-pin').setAttribute('aria-pressed', String(Boolean(pinned)));
    $('context-hints-pin').textContent = pinned ? 'Закреплено' : 'Закрепить';
    $('context-hints-status').textContent = pinned ? `Закреплённый текст. Смена выделения его не заменяет.${pinned.revision !== model.store.revision ? ' Модель после закрепления изменилась.' : ''}` : 'Следует выбору объекта и фокусу на типе инструмента или viewpoint.';
  }
  function refresh({ selectionChanged = false } = {}) {
    if (disposed) return;
    if (!readEnabled()) { if (!panel.hidden) close(); return; }
    if (observedStore !== model.store) { pinned = null; following = { kind: 'selection' }; observedStore = model.store; observedSelection = ''; }
    const key = selectionKey();
    if (selectionChanged || key !== observedSelection) { following = { kind: 'selection' }; observedSelection = key; }
    if (panel.hidden) return;
    if (!pinned) paint(describe());
    pinStatus();
  }
  function close() {
    panel.hidden = true; cachedState = null; toggle.setAttribute('aria-expanded', 'false');
    if (bookmark?.isConnected && bookmark.getClientRects().length) bookmark.focus({ preventScroll: true });
    bookmark = null;
  }
  function open() {
    if (!readEnabled()) { status('Подсказки выключены в настройках.'); return false; }
    if (disposed || blocked()) return false;
    bookmark = document.activeElement?.closest('.app-menu')?.querySelector('summary') || document.activeElement;
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); refresh(); $('context-hints-title').focus({ preventScroll: true }); return true;
  }
  function reset() { pinned = null; cachedState = null; following = { kind: 'selection' }; observedSelection = ''; observedStore = model.store; refresh(); }
  // Protect buffered text before the application's outside-pointer draft cancellation.
  for (const type of ['pointerdown', 'click']) on(document, type, event => {
    if (event.target.closest?.('#context-hints-panel,#context-hints-toggle,[data-command="context-hints-toggle"]') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation(); status('Завершите или отмените текущую правку перед открытием подсказок.');
    }
  }, { capture: true });
  on(toggle, 'click', () => { if (panel.hidden) open(); else close(); });
  on($('context-hints-close'), 'click', close);
  on($('context-hints-pin'), 'click', () => { pinned = pinned ? null : describe(); if (pinned) paint(pinned); else refresh(); pinStatus(); });
  on(panel, 'keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    // The panel owns its text/controls; diagram shortcuts cannot edit the old selection.
    event.stopPropagation();
  });
  on(document, 'focusin', event => {
    const control = event.target.closest?.('button,select'), target = tools.get(control?.id) || (control?.id === 'viewpoint-binding' ? { kind: 'viewpoint' } : null);
    if (!target) return;
    following = target;
    if (!panel.hidden && !pinned) paint(describe());
    if (!panel.hidden) pinStatus();
  });
  on($('viewpoint-binding'), 'change', () => { following = { kind: 'viewpoint' }; if (!panel.hidden && !pinned) { paint(describe()); pinStatus(); } });
  function dispose() { disposed = true; abort.abort(); }
  on(window, 'pagehide', dispose);
  return { open, close, refresh, reset, dispose };
}
