export function shortcutKey(event) {
  if (event.isComposing || event.keyCode === 229 || event.altKey) return '';
  return /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : (event.key?.toLowerCase() || '');
}

/** Menus and shortcuts use the same guarded controls as the visible editor. */
export function installWorkbench({ document, window, files, blocked, status, preferences = null, onDefaultPaste = null, onHelp = null, onHistory = null }) {
  const $ = id => document.getElementById(id);
  const closeMenus = () => { for (const menu of document.querySelectorAll('.app-menu[open]')) menu.open = false; };
  function run(command) {
    closeMenus();
    if (blocked()) { status('Завершите или отмените текущую правку перед этой командой.'); return; }
    if (command === 'save') { files.save(); return; }
    if (['new', 'open', 'save-as', 'example'].includes(command)) {
      $('file-button').click();
      const target = { new: 'new-project', open: window.schemkaDesktop ? 'desktop-open-project' : 'project-file', 'save-as': 'save-project', example: 'reset-example' }[command];
      $(target).click(); return;
    }
    $(command)?.click();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-command]');
    if (button) { event.preventDefault(); run(button.dataset.command); }
    else if (!event.target.closest('.app-menu')) closeMenus();
  });
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-command],.app-menu>summary') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation();
      status('Завершите или отмените текущую правку перед этой командой.');
    }
  }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-command],.app-menu>summary') && blocked()) {
      event.preventDefault(); event.stopImmediatePropagation();
      status('Завершите или отмените текущую правку перед этой командой.');
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) return;
    if (preferences) {
      const keys = preferences.get('keys'), code = /^Key[A-Z]$|^Digit[0-9]$|^F(?:[1-9]|1[0-2])$/.test(event.code) ? event.code : /^F(?:[1-9]|1[0-2])$/.test(event.key) ? event.key : /^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}` : /^[0-9]$/.test(event.key) ? `Digit${event.key}` : '';
      const chord = `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${code}`;
      const command = Object.entries(keys).find(([,binding]) => binding && binding === chord)?.[0] || (chord === 'Ctrl+Shift+KeyZ' && keys.redo === 'Ctrl+KeyY' ? 'redo' : null);
      const text = event.target.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]'), canvasOnly = value => value?.startsWith('fragment-');
      if (text && !['save','save-as','open','new','help-button'].includes(command)) return;
      if (canvasOnly(command) && !event.target.closest?.('#canvas')) return;
      if (command) { event.preventDefault(); event.stopImmediatePropagation(); if (command === 'help-button') {if(onHelp)onHelp(event.target);else $('help-button').click();} else if (['undo','redo'].includes(command) && onHistory) onHistory(command); else if(command==='fragment-paste-reuse'&&onDefaultPaste){if(!blocked())onDefaultPaste();else status('Завершите или отмените текущую правку перед этой командой.');}else run(command); return; }
      // Earlier fixed handlers must not also run an old binding after reassignment.
      const previous = {'Ctrl+KeyS':'save','Ctrl+Shift+KeyS':'save-as','Ctrl+KeyO':'open','Ctrl+KeyN':'new','Ctrl+KeyZ':'undo','Ctrl+Shift+KeyZ':'redo','Ctrl+KeyY':'redo','Ctrl+KeyC':'fragment-copy','Ctrl+KeyX':'fragment-cut','Ctrl+KeyV':'fragment-paste-reuse','Ctrl+Shift+KeyV':'fragment-paste-clone','Ctrl+KeyF':'model-search-focus','F1':'help-button'}[chord];
      if (previous && keys[previous] !== chord && (!canvasOnly(previous) || event.target.closest?.('#canvas'))) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = shortcutKey(event);
    const command = key === 's' ? event.shiftKey ? 'save-as' : 'save' : key === 'o' ? 'open' : key === 'n' ? 'new' : null;
    if (command) { event.preventDefault(); run(command); }
  }, true);
  for (const menu of document.querySelectorAll('.app-menu')) menu.addEventListener('toggle', () => {
    if (menu.open) for (const button of menu.querySelectorAll('[data-command]')) {
      const command = button.dataset.command;
      if (!['new', 'open', 'save', 'save-as', 'example'].includes(command)) button.disabled = !$(command) || $(command).disabled;
    }
    if (menu.open) for (const other of document.querySelectorAll('.app-menu')) if (other !== menu) other.open = false;
  });
  function paintKeys() { if(!preferences)return;const keys=preferences.get('keys');for(const button of document.querySelectorAll('[data-command]')){const hint=button.querySelector('kbd');if(!hint||!Object.hasOwn(keys,button.dataset.command))continue;hint.textContent=keys[button.dataset.command].replace(/Key([A-Z])/g,'$1').replace(/Digit([0-9])/g,'$1');hint.hidden=!hint.textContent;} }
  preferences?.subscribe((_value,changed)=>{if(changed.includes('keys'))paintKeys();});paintKeys();
  return { run };
}
