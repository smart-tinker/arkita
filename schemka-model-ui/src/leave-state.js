/** Read-only application boundary; no model, history, draft or baseline mutation. */
export function createModelLeaveState({ model, session, inline, transient, directoryWarning = () => false }) {
  return () => Object.freeze({ ready: true, dirty: session.dirty,
    transient: Boolean(inline.active || transient()), directoryWarning: Boolean(directoryWarning()),
    revision: model.store.revision, generation: inline.generation });
}

/** Local native close/reload protection; no product navigation dependencies. */
export function installModelUnloadGuard({ window, readState }) {
  const beforeUnload = event => {
    let state;
    try { state = readState(); } catch { /* An unreadable boundary stays protected. */ }
    const valid = state?.ready === true && typeof state.dirty === 'boolean' && typeof state.transient === 'boolean';
    if (!valid || state.dirty || state.transient || state.directoryWarning) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', beforeUnload, true);
  return Object.freeze({ destroy() { window.removeEventListener('beforeunload', beforeUnload, true); } });
}
