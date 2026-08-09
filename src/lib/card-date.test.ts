import { describe, it, expect } from 'vitest';
import { resolveDateline, formatCardDate, DATE_LABEL_NONE } from './card-date';

const DATE = new Date('2026-08-09T00:00:00Z');

describe('formatCardDate', () => {
  it('matches the browse-listing format', () => {
    expect(formatCardDate(DATE)).toBe('9 Aug 2026');
  });
});

describe('resolveDateline', () => {
  it('returns a labelled dateline when a label is declared', () => {
    expect(resolveDateline('Published', DATE)).toEqual({
      label: 'Published',
      text: '9 Aug 2026',
      iso: DATE.toISOString(),
    });
  });

  // The whole point of labelling rather than a boolean: nearly every card has a
  // date (it feeds when:* tags and sort order), so presence must not imply display.
  it('shows nothing for a dated card with no label', () => {
    expect(resolveDateline(undefined, DATE)).toBeNull();
  });

  it('shows nothing for a labelled card with no date', () => {
    expect(resolveDateline('Published', undefined)).toBeNull();
  });

  it('treats "none" as a suppressed inherited label', () => {
    expect(resolveDateline(DATE_LABEL_NONE, DATE)).toBeNull();
  });

  it('ignores an unparseable date rather than rendering "Invalid Date"', () => {
    expect(resolveDateline('Published', new Date('nonsense'))).toBeNull();
  });
});
