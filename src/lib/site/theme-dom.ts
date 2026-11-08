// The theme's page-wide effects, for code that can import: the mark's theme
// bauble (mark-tools/theme.ts). The footer's ThemeToggle and Base's head
// script are inline and do the same by hand; all three store the setting in
// localStorage `theme` (absent for "system") and announce `html[data-theme]`
// changes with THEME_CHANGE_EVENT.

import { THEME_CHANGE_EVENT, resolveTheme, type ActiveButton, type ThemeChangeDetail, type ThemePreference } from '@site/theme';

const KEY = 'theme';
const DARK = '(prefers-color-scheme: dark)';

/** The stored setting: 'light', 'dark', or null for following the OS. */
export function storedThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

let following = false;

/**
 * While the setting is "system", follow the OS. Base's head script only does
 * this for a page that loaded on "system", so a page switched to it later
 * needs its own listener; it checks the setting each time, so it is harmless
 * once the setting moves off "system" again, and it is only ever added once.
 */
function followSystem() {
  if (following) return;
  following = true;
  window.matchMedia(DARK).addEventListener('change', (e) => {
    if (storedThemePreference() === null) apply(e.matches ? 'dark' : 'light');
  });
}

function apply(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  document.dispatchEvent(new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, { detail: { theme } }));
}

/** Keep `setting`, and apply it. */
export function setThemePreference(setting: ActiveButton): void {
  try {
    if (setting === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, setting);
  } catch {
    /* storage blocked: still applied for this page */
  }
  if (setting === 'system') followSystem();
  apply(resolveTheme(setting === 'system' ? null : setting, window.matchMedia(DARK).matches));
}

/** Call `cb` on every theme change, from any control. Returns an unsubscribe. */
export function onThemeChange(cb: () => void): () => void {
  document.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => document.removeEventListener(THEME_CHANGE_EVENT, cb);
}
