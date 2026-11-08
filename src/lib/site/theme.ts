export type ThemePreference = 'light' | 'dark' | 'system' | null;
export type ResolvedTheme = 'light' | 'dark';
export type ActiveButton = 'light' | 'system' | 'dark';

/**
 * Resolve a theme preference to a concrete light/dark value.
 * Pure function — no DOM or storage reads.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  // 'system' or null: follow the OS
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Return which toggle button should appear active given the stored preference.
 * Pure function — no DOM or storage reads.
 */
export function getActiveButton(preference: ThemePreference): ActiveButton {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return 'system';
}

/**
 * Fired on `document` after `html[data-theme]` changes: a ThemeToggle click,
 * or the OS scheme changing while the preference is "system" (Base.astro's
 * head script and ThemeToggle both listen for that). Detail: `{ theme }`, the
 * resolved theme. The inline scripts that fire it can't import, so they spell
 * the name out; theme.test.ts holds them to this constant.
 */
export const THEME_CHANGE_EVENT = 'site:theme';

export interface ThemeChangeDetail {
  theme: ResolvedTheme;
}

/** The order a single control steps through the settings: following the OS, then light, then dark. */
export const THEME_CYCLE: readonly ActiveButton[] = ['system', 'light', 'dark'];

/**
 * The setting after `preference`, for a control that toggles through them
 * (the mark's theme bauble). Pure function.
 */
export function nextPreference(preference: ThemePreference): ActiveButton {
  const i = THEME_CYCLE.indexOf(getActiveButton(preference));
  return THEME_CYCLE[(i + 1) % THEME_CYCLE.length];
}
