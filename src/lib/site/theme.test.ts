import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveTheme, getActiveButton, THEME_CHANGE_EVENT } from '@site/theme';

describe('resolveTheme', () => {
  it('returns light when preference is light, system dark', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('returns light when preference is light, system light', () => {
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('returns dark when preference is dark, system dark', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('returns dark when preference is dark, system light', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('returns dark when preference is system and system is dark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('returns light when preference is system and system is light', () => {
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('returns dark when preference is null and system is dark', () => {
    expect(resolveTheme(null, true)).toBe('dark');
  });

  it('returns light when preference is null and system is light', () => {
    expect(resolveTheme(null, false)).toBe('light');
  });
});

describe('getActiveButton', () => {
  it('returns light when preference is light', () => {
    expect(getActiveButton('light')).toBe('light');
  });

  it('returns dark when preference is dark', () => {
    expect(getActiveButton('dark')).toBe('dark');
  });

  it('returns system when preference is system', () => {
    expect(getActiveButton('system')).toBe('system');
  });

  it('returns system when preference is null', () => {
    expect(getActiveButton(null)).toBe('system');
  });
});

// The inline scripts that change data-theme can't import the constant, so they
// spell the event name out. A source guard is the only way to hold them to it.
describe('THEME_CHANGE_EVENT', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  it.each(['src/components/site/ThemeToggle.astro', 'src/layouts/Base.astro'])('%s fires it by name', (file) => {
    const src = readFileSync(path.join(root, file), 'utf8');
    expect(src).toContain(`new CustomEvent('${THEME_CHANGE_EVENT}'`);
  });
});
