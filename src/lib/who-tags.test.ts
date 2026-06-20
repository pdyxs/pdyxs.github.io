import { describe, it, expect } from 'vitest';
import { lookupOrgForDate, injectWhoTags } from './who-tags';
import type { OrgEntry } from '../data/org-history';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HISTORY: OrgEntry[] = [
  { slug: 'university', from: '2005-01-01', to: '2010-12-31' },
  { slug: 'accenture',  from: '2011-01-01', to: '2013-06-30' },
  // deliberate gap: 2013-07-01 to 2014-12-31
  { slug: 'pivotal',    from: '2015-01-01', to: '2018-12-31' },
  { slug: 'freelance',  from: '2019-01-01', to: null          },
];

// ---------------------------------------------------------------------------
// lookupOrgForDate
// ---------------------------------------------------------------------------

describe('lookupOrgForDate', () => {
  it('returns the correct who: tag for a date within a range', () => {
    const result = lookupOrgForDate(new Date('2007-06-15'), HISTORY);
    expect(result).toBe('who:university');
  });

  it('returns the correct who: tag for a date in a second range', () => {
    const result = lookupOrgForDate(new Date('2012-03-01'), HISTORY);
    expect(result).toBe('who:accenture');
  });

  it('matches on the from boundary date (inclusive)', () => {
    const result = lookupOrgForDate(new Date('2011-01-01'), HISTORY);
    expect(result).toBe('who:accenture');
  });

  it('matches on the to boundary date (inclusive)', () => {
    const result = lookupOrgForDate(new Date('2013-06-30'), HISTORY);
    expect(result).toBe('who:accenture');
  });

  it('returns null for a date in a gap between ranges', () => {
    const result = lookupOrgForDate(new Date('2014-01-01'), HISTORY);
    expect(result).toBeNull();
  });

  it('returns null for a date before all entries', () => {
    const result = lookupOrgForDate(new Date('2001-01-01'), HISTORY);
    expect(result).toBeNull();
  });

  it('returns the ongoing entry for a date after the last closed range', () => {
    const result = lookupOrgForDate(new Date('2024-06-01'), HISTORY);
    expect(result).toBe('who:freelance');
  });

  it('matches the ongoing entry on its from boundary date', () => {
    const result = lookupOrgForDate(new Date('2019-01-01'), HISTORY);
    expect(result).toBe('who:freelance');
  });

  it('returns null for an empty history', () => {
    const result = lookupOrgForDate(new Date('2020-01-01'), []);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// injectWhoTags
// ---------------------------------------------------------------------------

describe('injectWhoTags', () => {
  it('appends the derived who: tag when the card has no who: tags', () => {
    const result = injectWhoTags(['what:projects', 'why:professional'], 'who:accenture');
    expect(result).toContain('who:accenture');
    expect(result).toContain('what:projects');
  });

  it('does not modify tags when the card already has a who: tag in frontmatter', () => {
    const tags = ['what:projects', 'who:freelance'];
    const result = injectWhoTags(tags, 'who:accenture');
    expect(result).toEqual(tags);
    expect(result).not.toContain('who:accenture');
  });

  it('preserves the frontmatter who: tag even when derivedWhoTag is null', () => {
    const tags = ['who:freelance'];
    const result = injectWhoTags(tags, null);
    expect(result).toEqual(tags);
  });

  it('returns tags unchanged when derivedWhoTag is null and no who: tag in frontmatter', () => {
    const tags = ['what:projects'];
    const result = injectWhoTags(tags, null);
    expect(result).toEqual(tags);
    expect(result.some(t => t.startsWith('who:'))).toBe(false);
  });

  it('works correctly with an empty tag array and a derived tag', () => {
    const result = injectWhoTags([], 'who:university');
    expect(result).toEqual(['who:university']);
  });

  it('works correctly with an empty tag array and no derived tag', () => {
    const result = injectWhoTags([], null);
    expect(result).toEqual([]);
  });

  it('handles multiple who: tags in frontmatter (preserves all, ignores derived)', () => {
    const tags = ['who:freelance', 'who:client-x'];
    const result = injectWhoTags(tags, 'who:accenture');
    expect(result).toEqual(tags);
    expect(result).not.toContain('who:accenture');
  });

  it('does not mutate the original tags array', () => {
    const tags = ['what:projects'];
    const original = [...tags];
    injectWhoTags(tags, 'who:accenture');
    expect(tags).toEqual(original);
  });
});
