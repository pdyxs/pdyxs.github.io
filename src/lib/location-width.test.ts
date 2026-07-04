import { describe, it, expect } from 'vitest';
import { extractLocationWidth } from './location-width';

describe('extractLocationWidth', () => {
  it('reads the data-width attribute from a rendered stack-card fragment', () => {
    const html = '<div class="stack-card" data-uid="lens/newest" data-width="960px"><p>body</p></div>';
    expect(extractLocationWidth(html)).toBe('960px');
  });

  it('returns undefined when the fragment has no data-width attribute', () => {
    const html = '<div class="stack-card" data-uid="lens/home"><p>body</p></div>';
    expect(extractLocationWidth(html)).toBeUndefined();
  });

  it('returns undefined when given undefined html (not-yet-cached location)', () => {
    expect(extractLocationWidth(undefined)).toBeUndefined();
  });
});
