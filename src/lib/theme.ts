export type ThemePreference = 'light' | 'dark' | 'system' | null;
export type ResolvedTheme = 'light' | 'dark';

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
