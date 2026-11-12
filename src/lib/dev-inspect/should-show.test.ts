import { describe, it, expect } from 'vitest';
import { shouldShowInspect } from './should-show.ts';

describe('shouldShowInspect', () => {
  it('shows for an uninspected active card', () => {
    expect(shouldShowInspect('what/a', { 'what/a': false })).toBe(true);
  });

  it('hides for an inspected active card', () => {
    expect(shouldShowInspect('what/a', { 'what/a': true })).toBe(false);
  });

  it('hides for an inspected active card even when another card in the stack is uninspected', () => {
    expect(shouldShowInspect('what/a', { 'what/a': true, 'what/b': false })).toBe(false);
  });

  it('hides when there is no active slot', () => {
    expect(shouldShowInspect(null, { 'what/a': false })).toBe(false);
  });

  it('hides when the active location is not a card on the page (a lens)', () => {
    expect(shouldShowInspect('lens:home', { 'what/a': false })).toBe(false);
  });
});
