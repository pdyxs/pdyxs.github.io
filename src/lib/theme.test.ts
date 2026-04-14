import { describe, it, expect } from 'vitest';
import { resolveTheme } from './theme';

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
