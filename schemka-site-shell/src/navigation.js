/** Native navigation only. No custom confirmation, state reset or accepted-navigation token. */
export function installNavigationGuard({ document, window, readState, report }) {
  const destinations = new Set(['/', '/mermaid/', '/model/', '/catalog/']);
  const listeners = [];
  const listen = (name, callback) => { window.addEventListener(name, callback, true); listeners.push(() => window.removeEventListener(name, callback, true)); };
  const state = () => {
    try {
      const value = readState();
      return value && value.ready === true && typeof value.dirty === 'boolean' && typeof value.transient === 'boolean' ? value : null;
    } catch { return null; }
  };
  const managed = target => target?.closest?.('a[data-mode-link]');
  const block = (event, message) => {
    event.preventDefault(); event.stopImmediatePropagation();
    // Reporting must never focus a control or dispose a draft.
    try { report(message); } catch { /* Refusal remains in force if status UI fails. */ }
  };
  const check = event => {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    const anchor = managed(event.target);
    if (!anchor) return;
    if (!destinations.has(anchor.getAttribute('href'))) {
      block(event, 'Переход недоступен: неизвестный адрес режима.'); return;
    }
    const current = state();
    if (!current) { block(event, 'Редактор ещё не готов к переходу. Попробуйте после завершения загрузки.'); return; }
    if (current.transient) { block(event, 'Завершите или отмените текущее действие перед переходом.'); return; }
    // Plain same-tab anchors invoke the browser's beforeunload confirmation if dirty.
    // Explicit new-tab/modified clicks keep normal browser behavior and the current tab.
  };
  for (const name of ['pointerdown', 'mousedown', 'click', 'auxclick', 'keydown']) listen(name, check);
  listen('beforeunload', event => {
    const current = state();
    if (!current || current.dirty || current.transient) { event.preventDefault(); event.returnValue = ''; }
  });
  return Object.freeze({ destroy() { for (const remove of listeners.splice(0)) remove(); } });
}
