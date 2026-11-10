export const THEME_KEY = 'schemka-shell-theme';
export const THEME_KEYS = Object.freeze([THEME_KEY, 'schemka-model-theme', 'skhemka-theme']);
export const isTheme = value => value === 'system' || value === 'light' || value === 'dark';
export const normalizeTheme = value => isTheme(value) ? value : 'system';
export const resolveTheme = (value, dark) => normalizeTheme(value) === 'system' ? (dark ? 'dark' : 'light') : value;

/** Reading another editor's preference never changes that editor's storage. */
export function readThemePreference(read) {
  for (const key of THEME_KEYS) {
    try {
      const value = read(key);
      if (isTheme(value)) return value;
    } catch { /* Blocked storage is equivalent to an absent preference. */ }
  }
  return 'system';
}

/** Only an explicit theme choice writes data; diagrams and URL payloads are never stored. */
export function createTheme({ read, write, dark, apply }) {
  let preference = readThemePreference(read);
  const update = () => apply(resolveTheme(preference, dark()), preference);
  update();
  return {
    get preference() { return preference; },
    choose(value) {
      preference = normalizeTheme(value);
      try { write(THEME_KEY, preference); } catch { /* The choice still applies in this tab. */ }
      update();
    },
    systemChanged() { if (preference === 'system') update(); },
  };
}

export function installTheme(document, window) {
  const control = document.getElementById('theme-mode');
  let media;
  try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch { /* Light is the safe fallback. */ }
  const theme = createTheme({
    read: key => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    dark: () => Boolean(media?.matches),
    apply: (resolved, preference) => {
      document.documentElement.dataset.theme = resolved;
      if (control) control.value = preference;
    },
  });
  const onSystemChange = () => theme.systemChanged();
  const onChoice = () => theme.choose(control.value);
  if (media?.addEventListener) media.addEventListener('change', onSystemChange);
  else media?.addListener?.(onSystemChange);
  control?.addEventListener('change', onChoice);
  return {
    get preference() { return theme.preference; },
    choose: theme.choose,
    systemChanged: theme.systemChanged,
    destroy() {
      if (media?.removeEventListener) media.removeEventListener('change', onSystemChange);
      else media?.removeListener?.(onSystemChange);
      control?.removeEventListener('change', onChoice);
    },
  };
}
