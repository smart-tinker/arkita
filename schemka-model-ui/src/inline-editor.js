import { renameCommand, renameTarget } from './rename.js';

/** A single disposable draft, anchored to the visible name. Blur always cancels. */
export function createInlineEditor({ document, read, revision, execute, render, report, restore }) {
  let current = null;
  let generation = 0;
  const create = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  function dispose(focus) {
    const previous = current; if (!previous) return;
    current = null; generation++;
    if (previous.foreign) previous.foreign.remove();
    else previous.editor.replaceWith(previous.anchor);
    if (focus) restore(previous.bookmark);
  }
  function cancel(focus = true) {
    if (!current) return;
    dispose(focus); report('Переименование отменено');
  }
  function commit() {
    const edit = current;
    if (!edit || edit.composing) return;
    try {
      if (revision() !== edit.revision) throw new Error('Модель изменилась. Отмените поле и начните переименование заново.');
      // Single-line inputs remove CR/LF when an imported value is assigned.
      // An untouched (or restored) displayed draft must preserve the exact
      // original model string instead of committing that browser normalization.
      const value = edit.input.value === edit.initialValue ? edit.originalValue : edit.input.value;
      const command = renameCommand(read(), edit.target, value);
      if (command) execute(command);
      dispose(false);
      render(); restore(edit.bookmark);
      report(command ? 'Имя изменено · общая история обновлена' : 'Имя не изменилось');
    } catch (error) {
      edit.error.textContent = error.message;
      edit.input.setAttribute('aria-invalid', 'true');
      edit.input.focus();
    }
  }
  return {
    get generation() { return generation; },
    get active() { return Boolean(current); },
    cancel,
    start(target, anchor, bookmark, bounds = null) {
      cancel(false);
      const descriptor = renameTarget(read(), target);
      const editor = create('span', undefined, 'inline-editor');
      const input = create(descriptor.multiline ? 'textarea' : 'input'); if(!descriptor.multiline)input.type = 'text';else {input.rows=3;input.setAttribute('aria-multiline','true');} input.value = descriptor.value; input.maxLength = 8192;
      input.autocomplete = 'off'; input.setAttribute('aria-label', descriptor.label); input.setAttribute('aria-describedby', 'rename-hint rename-error');
      const accept = create('button', '✓'); accept.type = 'button'; accept.setAttribute('aria-label', 'Применить имя');
      const reject = create('button', '×'); reject.type = 'button'; reject.setAttribute('aria-label', 'Отменить переименование');
      const multiline = /[\r\n]/.test(descriptor.value);
      const hintText = descriptor.multiline ? 'Enter — новая строка · Ctrl + Enter — применить · Esc / уход — отменить' : multiline ? 'В имени есть переносы строк: без правок они сохранятся. Изменение поля заменит имя одной строкой.' : 'Enter — применить · Esc / уход — отменить';
      const hint = create('span', hintText, multiline||descriptor.multiline ? 'rename-hint' : 'rename-hint sr-only'); hint.id = 'rename-hint';
      const error = create('span', '', 'rename-error'); error.id = 'rename-error'; error.setAttribute('role', 'alert');
      editor.append(input, accept, reject, hint, error);
      let foreign = null;
      if (bounds) {
        foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        for (const [key, value] of Object.entries(descriptor.multiline?{...bounds,height:Math.max(142,bounds.height)}:bounds)) foreign.setAttribute(key, String(value));
        foreign.setAttribute('class', 'rename-foreign'); foreign.append(editor); anchor.append(foreign);
      } else anchor.replaceWith(editor);
      generation++;
      current = { target: { ...target }, anchor, editor, foreign, input, originalValue: descriptor.value, initialValue: input.value, error, bookmark, revision: revision(), composing: false };
      // Keep the input focused until the button's click. Some browsers do not
      // focus mouse-clicked buttons, so their default mousedown can otherwise
      // trigger the outside-focus cancellation before Apply receives its click.
      for (const control of [accept, reject]) control.addEventListener('mousedown', event => {
        if (event.button === 0) event.preventDefault();
      });
      accept.addEventListener('click', commit); reject.addEventListener('click', () => cancel());
      input.addEventListener('compositionstart', () => { if (current) current.composing = true; });
      input.addEventListener('compositionend', () => { if (current) current.composing = false; });
      editor.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.isComposing || current?.composing || event.keyCode === 229) return;
        if (event.key === 'Enter' && event.target === input && (!descriptor.multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
        if (event.key === 'Escape') { event.preventDefault(); cancel(); }
      });
      for (const name of ['pointerdown', 'mousedown', 'click', 'dblclick']) editor.addEventListener(name, event => event.stopPropagation());
      editor.addEventListener('focusout', () => queueMicrotask(() => {
        if (current?.editor === editor && !editor.contains(document.activeElement)) cancel(false);
      }));
      input.focus(); input.select();
      report(`${descriptor.label}: ${descriptor.multiline ? 'Enter — новая строка; Ctrl + Enter — применить' : 'Enter — применить'}; Escape или уход из поля — отменить`);
    },
  };
}
