export const THEME_KEY = 'schemka-model-theme';
export const normalizeTheme = value => ['light', 'dark', 'system'].includes(value) ? value : 'system';
export const resolveTheme = (value, dark) => normalizeTheme(value) === 'system' ? (dark ? 'dark' : 'light') : value;

/** Only a UI preference is persisted. Storage failure never blocks the model. */
export function createTheme({ read, write, dark, apply }) {
  let preference = 'system';
  try { preference = normalizeTheme(read()); } catch { /* Private/blocked storage. */ }
  const update = () => apply(resolveTheme(preference, dark()), preference);
  update();
  return {
    get preference() { return preference; },
    choose(value) {
      preference = normalizeTheme(value);
      try { write(preference); } catch { /* Keep the explicit choice for this tab. */ }
      update();
    },
    systemChanged() { if (preference === 'system') update(); },
  };
}
export function installTheme(document, window, preferences = null, refreshColors = () => {}) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const control = document.getElementById('theme-mode');
  const theme = createTheme({
    read: () => preferences ? preferences.get('theme') : window.localStorage.getItem(THEME_KEY),
    write: value => preferences ? preferences.update('theme',value) : window.localStorage.setItem(THEME_KEY,value),
    dark: () => media.matches,
    apply: (resolved, preference) => { document.documentElement.dataset.theme = resolved; control.value = preference; refreshColors(); },
  });
  preferences?.subscribe((value,changed) => { if (changed.includes('theme') && value.theme !== theme.preference) theme.choose(value.theme); });
  media.addEventListener('change', () => theme.systemChanged());
  control.addEventListener('change', () => theme.choose(control.value));
  return theme;
}
