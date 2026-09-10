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
