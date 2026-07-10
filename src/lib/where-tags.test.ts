import { describe, it, expect } from 'vitest';
import { lookupLocationForDate, injectWhereTags } from './where-tags';
import type { TravelEntry } from '../data/travel-log';

// ---------------------------------------------------------------------------
// Shared fixture travel log used throughout these tests
// ---------------------------------------------------------------------------

const LOG: TravelEntry[] = [
  { location: 'australia/sydney', from: '2000-01-01', to: '2014-12-31' },
  { location: 'usa/san-francisco', from: '2015-01-01', to: '2018-06-30' },
  // deliberate gap: 2018-07-01 to 2018-12-31 has no entry
  { location: 'australia/sydney', from: '2019-01-01', to: null }, // ongoing
];

// ---------------------------------------------------------------------------
// lookupLocationForDate
// ---------------------------------------------------------------------------

describe('lookupLocationForDate', () => {
  it('returns the correct where tag for a date within a range', () => {
    const date = new Date('2010-06-15T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBe('where:australia/sydney');
  });

  it('returns the correct where tag for a date in the second range', () => {
    const date = new Date('2016-03-20T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBe('where:usa/san-francisco');
  });

  it('returns the where tag on the `from` boundary date (inclusive)', () => {
    const date = new Date('2015-01-01T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBe('where:usa/san-francisco');
  });

  it('returns the where tag on the `to` boundary date (inclusive)', () => {
    const date = new Date('2018-06-30T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBe('where:usa/san-francisco');
  });

  it('returns null for a date that falls in a gap between entries', () => {
    const date = new Date('2018-09-01T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBeNull();
  });

  it('returns null for a date before all log entries', () => {
    const date = new Date('1999-12-31T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBeNull();
  });

  it('returns the where tag for a date in an ongoing entry (null `to`)', () => {
    const date = new Date('2023-08-10T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBe('where:australia/sydney');
  });

  it('returns the where tag on the `from` boundary of an ongoing entry', () => {
    const date = new Date('2019-01-01T00:00:00.000Z');
    expect(lookupLocationForDate(date, LOG)).toBe('where:australia/sydney');
  });

  it('returns null when the log is empty', () => {
    const date = new Date('2020-01-01T00:00:00.000Z');
    expect(lookupLocationForDate(date, [])).toBeNull();
  });

  it('handles a log with a single ongoing entry starting from the very beginning', () => {
    const singleEntry: TravelEntry[] = [
      { location: 'australia/melbourne', from: '2000-01-01', to: null },
    ];
    expect(lookupLocationForDate(new Date('2024-01-01T00:00:00.000Z'), singleEntry)).toBe(
      'where:australia/melbourne',
    );
  });
});

// ---------------------------------------------------------------------------
// injectWhereTags
// ---------------------------------------------------------------------------

describe('injectWhereTags', () => {
  it('appends the derived tag when the card has no where:* tags', () => {
    const tags = ['what:projects', 'why:professional'];
    const result = injectWhereTags(tags, 'where:australia/sydney');
    expect(result).toEqual(['what:projects', 'why:professional', 'where:australia/sydney']);
  });

  it('does not mutate the original array', () => {
    const tags = ['what:projects'];
    const result = injectWhereTags(tags, 'where:australia/sydney');
    expect(tags).toEqual(['what:projects']); // original unchanged
    expect(result).not.toBe(tags);           // different reference
  });

  it('appends alongside an existing where:* tag (authored where:work tags coexist)', () => {
    const tags = ['what:projects', 'where:work/dot'];
    const result = injectWhereTags(tags, 'where:australia/sydney');
    expect(result).toEqual(['what:projects', 'where:work/dot', 'where:australia/sydney']);
  });

  it('dedups an exact-duplicate derived tag', () => {
    const tags = ['what:projects', 'where:usa/san-francisco'];
    const result = injectWhereTags(tags, 'where:usa/san-francisco');
    expect(result).toEqual(tags);
  });

  it('returns tags unchanged when derivedWhereTag is null and no existing where:* tag', () => {
    const tags = ['what:projects'];
    const result = injectWhereTags(tags, null);
    expect(result).toEqual(['what:projects']);
  });

  it('returns empty array unchanged when derivedWhereTag is null and card has no tags', () => {
    const result = injectWhereTags([], null);
    expect(result).toEqual([]);
  });

  it('appends derived tag to a card with no other tags', () => {
    const result = injectWhereTags([], 'where:australia/sydney');
    expect(result).toEqual(['where:australia/sydney']);
  });
});
