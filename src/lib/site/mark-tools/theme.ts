// The theme tool: a bauble showing the current setting (system, light or
// dark) that steps to the next one when pressed. Its icons, one per state,
// are in its config (src/data/mark-tools.ts).
//
// `subscribe` is the theme change event, so the icon follows the footer's
// ThemeToggle and the OS too.

import { getActiveButton, nextPreference } from '@site/theme';
import { onThemeChange, setThemePreference, storedThemePreference } from '@site/theme-dom';
import type { ToolBehaviour } from './types';

export const theme: ToolBehaviour = {
  kind: 'press',

  state(): string {
    return getActiveButton(storedThemePreference());
  },

  subscribe(changed: () => void): () => void {
    return onThemeChange(() => changed());
  },

  press(): void {
    setThemePreference(nextPreference(storedThemePreference()));
  },
};
