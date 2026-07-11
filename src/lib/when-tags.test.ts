import { describe, it, expect } from 'vitest';
import { eraSlugForDate, deriveWhenTag, enumerateWhenTags } from './when-tags';
import type { WhenEra } from '../data/when-eras';

// ---------------------------------------------------------------------------
// Shared fixture era timeline (contiguous, non-overlapping, with a low baseline)
// ---------------------------------------------------------------------------

const ERAS: WhenEra[] = [
  { slug: 'uni', label: 'University', from: '2000-01-01', to: '2009-12-31' },
  { slug: 'seethrough', label: 'SeeThrough Studios', from: '2010-01-01', to: '2014-12-31' },
  { slug: 'current', label: 'Current', from: '2015-01-01', to: null }, // ongoing
];

describe('eraSlugForDate', () => {
  it('returns the era covering a date mid-range', () => {
    expect(eraSlugForDate(new Date('2012-06-15T00:00:00.000Z'), ERAS)).toBe('seethrough');
  });

  it('is inclusive of range boundaries', () => {
    expect(eraSlugForDate(new Date('2010-01-01T00:00:00.000Z'), ERAS)).toBe('seethrough');
    expect(eraSlugForDate(new Date('2014-12-31T00:00:00.000Z'), ERAS)).toBe('seethrough');
  });

  it('resolves ongoing (null `to`) eras', () => {
    expect(eraSlugForDate(new Date('2025-08-01T00:00:00.000Z'), ERAS)).toBe('current');
  });

  it('returns null before the earliest baseline', () => {
    expect(eraSlugForDate(new Date('1999-12-31T00:00:00.000Z'), ERAS)).toBeNull();
  });

  it('is not tripped up by time-of-day (uses UTC calendar date)', () => {
    // 2009-12-31 late UTC is still within uni, not seethrough.
    expect(eraSlugForDate(new Date('2009-12-31T23:59:59.000Z'), ERAS)).toBe('uni');
  });
});

describe('deriveWhenTag', () => {
  it('builds a zero-padded when:<era>/<year>/<month> leaf', () => {
    expect(deriveWhenTag(new Date('2013-06-09T00:00:00.000Z'), ERAS)).toBe('when:seethrough/2013/06');
  });

  it('pads single-digit months', () => {
    expect(deriveWhenTag(new Date('2021-03-01T00:00:00.000Z'), ERAS)).toBe('when:current/2021/03');
  });

  it('returns null when the date resolves to no era', () => {
    expect(deriveWhenTag(new Date('1990-01-01T00:00:00.000Z'), ERAS)).toBeNull();
  });
});

describe('enumerateWhenTags', () => {
  it('emits every month from the earliest era start year through currentYear', () => {
    const values = enumerateWhenTags(ERAS, 2015);
    // 2000..2015 inclusive = 16 years * 12 months
    expect(values).toHaveLength(16 * 12);
    expect(values).toContain('when:uni/2000/01');
    expect(values).toContain('when:seethrough/2013/06');
    expect(values).toContain('when:current/2015/12');
  });

  it('maps each month to the correct era across boundaries', () => {
    const values = enumerateWhenTags(ERAS, 2015);
    expect(values).toContain('when:uni/2009/12');
    expect(values).toContain('when:seethrough/2010/01');
    expect(values).toContain('when:seethrough/2014/12');
    expect(values).toContain('when:current/2015/01');
  });

  it('returns only leaves (no bare era or year ancestors)', () => {
    const values = enumerateWhenTags(ERAS, 2015);
    expect(values.every(v => /^when:[^/]+\/\d{4}\/\d{2}$/.test(v))).toBe(true);
    expect(values).not.toContain('when:seethrough');
    expect(values).not.toContain('when:seethrough/2013');
  });

  it('returns an empty list for an empty era timeline', () => {
    expect(enumerateWhenTags([], 2015)).toEqual([]);
  });
});
