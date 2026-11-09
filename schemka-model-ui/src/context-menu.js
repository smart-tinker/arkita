const STALE_MESSAGE = 'Модель или представление изменились. Откройте контекстное меню заново.';
const NATIVE_CONTEXT = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),.inline-editor,dialog,[role="dialog"]';
const FOCUSABLE = '[tabindex],button,a[href],input,select,textarea,[contenteditable]';

/**
 * One transient menu for trusted application actions, never model-provided code.
 * resolveContext(target, event) returns an ID-only context; buildItems(context)
 * returns { id?, label, disabled?, action(context) } records. Opening and moving
 * focus do not select or mutate model objects. The application owns those actions.
 * readBoundary() returns { revision, viewId }; both must still match on activation.
 */
export function installContextMenu({ document, window, host, resolveContext, buildItems, readBoundary,
  beforeOpen = () => {}, status = () => {}, restoreFocus = () => {} }) {
  let current = null;
  let destroyed = false;
  const listeners = [];
  const element = target => target?.nodeType === 3 ? target.parentElement : target;
  const inside = target => Boolean(target?.nodeType && host.contains(target));
  const listen = (target, type, handler, capture = false) => {
    target.addEventListener(type, handler, capture);
    listeners.push(() => target.removeEventListener(type, handler, capture));
  };
  const consume = event => { event.preventDefault?.(); event.stopPropagation?.(); };
  const connected = target => target?.isConnected === true && typeof target.focus === 'function';
  host.hidden = true;
  host.setAttribute('role', 'menu');
  host.setAttribute('aria-orientation', 'vertical');
  if (!host.getAttribute('aria-label') && !host.getAttribute('aria-labelledby')) host.setAttribute('aria-label', 'Контекстное меню');

  function restore(session) {
    if (connected(session.origin) && (!session.origin.getClientRects || session.origin.getClientRects().length)) {
      session.origin.focus({ preventScroll: true });
      if (document.activeElement === session.origin) return;
    }
    restoreFocus(session.origin, session.context);
  }

  function close(restoreOrigin = false) {
    const session = current;
    if (!session) return false;
    current = null; // Detached controls and reentrant events can no longer act.
    host.hidden = true;
    host.replaceChildren();
    if (restoreOrigin) restore(session);
    return true;
  }

  function invalidate(message = STALE_MESSAGE) {
    if (close(inside(document.activeElement)) && message) status(message);
  }

  function focusItem(session, index) {
    if (current !== session) return;
    const button = session.buttons[index];
    session.index = index;
    button.focus({ preventScroll: true });
    // Scroll only the menu, never the page or canvas underneath it.
    const bounds = host.getBoundingClientRect(), item = button.getBoundingClientRect();
    if (item.top < bounds.top) host.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) host.scrollTop += item.bottom - bounds.bottom;
  }

  function position(event, target, keyboard) {
    const visual = window.visualViewport;
    const width = visual?.width || document.documentElement.clientWidth || window.innerWidth;
    const height = visual?.height || document.documentElement.clientHeight || window.innerHeight;
    const left = visual?.offsetLeft || 0, top = visual?.offsetTop || 0;
    const margin = Math.min(8, width / 2, height / 2);
    const availableWidth = Math.max(0, width - margin * 2), availableHeight = Math.max(0, height - margin * 2);
    Object.assign(host.style, { position: 'fixed', boxSizing: 'border-box', minWidth: '0px', minHeight: '0px',
      maxWidth: `${availableWidth}px`, maxHeight: `${availableHeight}px`, overflow: 'auto', overflowWrap: 'anywhere',
      left: `${left + margin}px`, top: `${top + margin}px` });
    const anchor = target.getBoundingClientRect?.() || { left, bottom: top };
    const x = !keyboard && Number.isFinite(event.clientX) ? event.clientX : anchor.left;
    const y = !keyboard && Number.isFinite(event.clientY) ? event.clientY : anchor.bottom;
    const bounds = host.getBoundingClientRect();
    const menuWidth = Math.min(bounds.width, availableWidth), menuHeight = Math.min(bounds.height, availableHeight);
    host.style.left = `${Math.max(left + margin, Math.min(x, left + width - margin - menuWidth))}px`;
    host.style.top = `${Math.max(top + margin, Math.min(y, top + height - margin - menuHeight))}px`;
    host.scrollTop = 0;
    host.scrollLeft = 0;
  }

  function activate(session, index) {
    if (current !== session) return;
    const item = session.items[index];
    if (!item || item.disabled) return;
    const unchanged = () => {
      let boundary;
      try { boundary = readBoundary(); } catch { /* A lost model boundary is stale too. */ }
      return boundary && boundary.revision === session.boundary.revision && boundary.viewId === session.boundary.viewId;
    };
    if (!unchanged()) {
      close(true); status(STALE_MESSAGE); return;
    }
    close(true); // Close and restore before a command opens a dialog or replaces DOM.
    // Restoring focus can synchronously run application handlers. Check again at
    // the invocation boundary so they cannot silently retarget an old command.
    if (!unchanged()) { status(STALE_MESSAGE); return; }
    try { item.action(session.context); }
    catch (error) {
      let applied = null;
      try { applied = readBoundary().revision !== session.boundary.revision; } catch { /* Report uncertainty if even the boundary is unavailable. */ }
      status(applied === null ? `Не удалось проверить результат действия: ${error.message}` : applied ? `Изменение применено, но интерфейс не обновлён полностью: ${error.message}` : `Не выполнено: ${error.message}`);
    }
  }

  function open(event = {}, { keyboard = false } = {}) {
    if (destroyed) return false;
    const zeroKeyboard = event.type === 'contextmenu' && event.button !== 2 && event.clientX === 0 && event.clientY === 0;
    keyboard ||= zeroKeyboard || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY);
    let target = element(event.target);
    if (!target || target === document || (keyboard && target === document.body)) target = document.activeElement;
    if (current && inside(target)) { consume(event); return true; }
    if (!target || target.closest?.(NATIVE_CONTEXT) || target.isContentEditable || document.querySelector('dialog[open]')) {
      close(false); return false;
    }
    // Some browsers dispatch a native contextmenu after the shortcut keydown.
    if (keyboard && current?.keyboard && target === current.target) { consume(event); return true; }
    const resolved = resolveContext(target, event);
    if (!resolved) { close(false); return false; }
    const context = Object.freeze({ ...resolved });
    const origin = keyboard ? target : (target.closest?.(FOCUSABLE) || target);
    close(false);
    if (beforeOpen(context, event) === false) return false;
    const { revision, viewId } = readBoundary();
    const items = buildItems(context).map(item => ({ id: item.id, label: String(item.label ?? ''),
      disabled: Boolean(item.disabled) || typeof item.action !== 'function', action: item.action }));
    if (!items.length) return false;
    const session = { context, target, origin, keyboard, boundary: { revision, viewId }, items, buttons: [], index: 0 };
    for (const [index, item] of items.entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.tabIndex = -1;
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-disabled', String(item.disabled));
      if (item.id !== undefined) button.dataset.contextAction = String(item.id);
      button.textContent = item.label; // Names and labels are text, never HTML/SVG.
      button.addEventListener('click', click => { consume(click); activate(session, index); });
      button.addEventListener('focus', () => { if (current === session) session.index = index; });
      button.addEventListener('pointermove', event => { if (event.pointerType !== 'touch' && document.activeElement !== button) focusItem(session, index); });
      session.buttons.push(button);
    }
    host.replaceChildren(...session.buttons);
    current = session;
    host.hidden = false;
    position(event, target, keyboard);
    focusItem(session, 0);
    consume(event);
    return true;
  }

  function onKeyDown(event) {
    const target = element(event.target);
    if (current && inside(target)) {
      event.stopPropagation(); // Canvas shortcuts must not act through the menu.
      if (event.isComposing || event.keyCode === 229) return;
      const session = current, count = session.buttons.length;
      switch (event.key) {
        case 'ArrowDown': consume(event); focusItem(session, (session.index + 1) % count); break;
        case 'ArrowUp': consume(event); focusItem(session, (session.index + count - 1) % count); break;
        case 'Home': consume(event); focusItem(session, 0); break;
        case 'End': consume(event); focusItem(session, count - 1); break;
        case 'Enter': case ' ': consume(event); if (!event.repeat) activate(session, session.index); break;
        case 'Escape': consume(event); close(true); break;
        case 'Tab': close(true); break; // Native traversal continues from the invoking context.
        case 'ContextMenu': consume(event); break;
        case 'F10': if (event.shiftKey) consume(event); break;
      }
      return;
    }
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      if (!event.repeat) open(event, { keyboard: true });
    }
  }

  listen(document, 'contextmenu', event => open(event), true);
  listen(document, 'keydown', onKeyDown, true);
  listen(document, 'pointerdown', event => { if (current && !inside(element(event.target))) close(false); }, true);
  listen(document, 'focusin', event => { if (current && !inside(element(event.target))) close(false); }, true);
  const dismissViewport = () => close(inside(document.activeElement));
  const onScroll = event => { if (current && !inside(element(event.target))) dismissViewport(); };
  listen(document, 'scroll', onScroll, true);
  listen(window, 'scroll', onScroll, true);
  listen(window, 'blur', () => close(false));
  listen(window, 'resize', dismissViewport);
  if (window.visualViewport) {
    listen(window.visualViewport, 'scroll', dismissViewport);
    listen(window.visualViewport, 'resize', dismissViewport);
  }
  return {
    open, close, invalidate,
    get active() { return Boolean(current); },
    destroy() { close(false); destroyed = true; for (const remove of listeners.splice(0)) remove(); },
  };
}
