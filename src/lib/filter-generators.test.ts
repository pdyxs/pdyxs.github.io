import { describe, it, expect } from 'vitest';
import {
  generatedTagsForCard,
  generatorOverrideKeys,
  allGeneratedFilterValues,
  declaredGeneratedFilterValues,
  generatedDisplayName,
  generatedSortOrder,
} from './filter-generators';
import { TRAVEL_LOG } from '../data/travel-log';

describe('generatedTagsForCard', () => {
  it('injects the travel-log where:* tag for a card whose date falls in a range', () => {
    // 2017-08-30 → 2017-10-08 is the Taghazout, Morocco range.
    const tags = generatedTagsForCard(['what:writing'], { date: new Date('2017-09-15T00:00:00.000Z') });
    expect(tags).toContain('where:africa/morocco/taghazout');
    expect(tags).toContain('what:writing'); // existing tags preserved
  });

  it('leaves tags unchanged when the card has no date', () => {
    const base = ['what:writing'];
    expect(generatedTagsForCard(base, {})).toEqual(base);
  });

  it('a location override replaces the date-derived value', () => {
    // 2018-07-15 falls in the Berlin range, but the override wins.
    const tags = generatedTagsForCard(['what:writing'], {
      date: new Date('2018-07-15T00:00:00.000Z'),
      overrides: { location: 'europe/norway/svalbard' },
    });
    expect(tags).toContain('where:europe/norway/svalbard');
    expect(tags.filter(t => t.startsWith('where:'))).toEqual(['where:europe/norway/svalbard']);
  });

  it('an override coexists with an authored where:work tag', () => {
    const tags = generatedTagsForCard(['where:work/dot'], {
      date: new Date('2018-07-15T00:00:00.000Z'),
      overrides: { location: 'europe/norway/svalbard' },
    });
    expect(tags).toContain('where:work/dot');
    expect(tags).toContain('where:europe/norway/svalbard');
  });

  it('location: none suppresses the date-derived tag', () => {
    // 2017-09-15 is the Taghazout range, but `none` opts out of derivation.
    const tags = generatedTagsForCard(['what:writing'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      overrides: { location: 'none' },
    });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    expect(tags).toContain('what:writing');
  });

  it('location: none leaves an authored where:work tag in place', () => {
    const tags = generatedTagsForCard(['where:work/dot'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      overrides: { location: 'none' },
    });
    // location suppressed → no derived where:* geo tag; authored work tag stays.
    expect(tags.filter(t => t.startsWith('where:'))).toEqual(['where:work/dot']);
  });

  it('date-derivation still runs alongside an authored where:work tag (no skip)', () => {
    // 2017-09-15 is the Taghazout range; the authored work tag must not suppress it.
    const tags = generatedTagsForCard(['where:work/dot'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
    });
    expect(tags).toContain('where:work/dot');
    expect(tags).toContain('where:africa/morocco/taghazout');
  });

  it('injects the ongoing (to: null) location for a present-day date', () => {
    // Final entry is australia/sydney with to: null.
    const tags = generatedTagsForCard([], { date: new Date('2030-01-01T00:00:00.000Z') });
    expect(tags).toContain('where:australia/sydney');
  });

  it('injects the date/era when:<era>/<year>/<month> tag from a card date', () => {
    // 2013-06 falls in the seethrough era (2010–2014).
    const tags = generatedTagsForCard(['what:writing'], { date: new Date('2013-06-09T00:00:00.000Z') });
    expect(tags).toContain('when:seethrough/2013/06');
    expect(tags).toContain('what:writing');
  });

  it('injects both a where:* and a when:* tag for the same dated card', () => {
    // 2017-09-15 → Taghazout (where) and the nomad era (when).
    const tags = generatedTagsForCard([], { date: new Date('2017-09-15T00:00:00.000Z') });
    expect(tags).toContain('where:africa/morocco/taghazout');
    expect(tags).toContain('when:nomad/2017/09');
  });

  it('an era override replaces the date-derived when tag', () => {
    const tags = generatedTagsForCard(['what:writing'], {
      date: new Date('2013-06-09T00:00:00.000Z'),
      overrides: { era: 'current/2024/01' },
    });
    expect(tags).toContain('when:current/2024/01');
    expect(tags.filter(t => t.startsWith('when:'))).toEqual(['when:current/2024/01']);
  });

  it('era: none suppresses the date-derived when tag', () => {
    const tags = generatedTagsForCard(['what:writing'], {
      date: new Date('2013-06-09T00:00:00.000Z'),
      overrides: { era: 'none' },
    });
    expect(tags.filter(t => t.startsWith('when:'))).toEqual([]);
    expect(tags).toContain('what:writing');
  });

  it('the era and location overrides are independent', () => {
    const tags = generatedTagsForCard([], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      overrides: { location: 'none' },
    });
    // location suppressed, but the date/era tag still derives.
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    expect(tags).toContain('when:nomad/2017/09');
  });
});

describe('generatorOverrideKeys', () => {
  it('includes the travel generator\'s location key', () => {
    expect(generatorOverrideKeys()).toContain('location');
  });

  it('includes the date/era generator\'s era key', () => {
    expect(generatorOverrideKeys()).toContain('era');
  });

  it('is deduplicated', () => {
    const keys = generatorOverrideKeys();
    expect(keys).toEqual([...new Set(keys)]);
  });
});

describe('allGeneratedFilterValues', () => {
  it('covers every distinct travel-log location as a where:* value', () => {
    const values = allGeneratedFilterValues();
    const expected = [...new Set(TRAVEL_LOG.map(e => `where:${e.location}`))];
    for (const value of expected) {
      expect(values).toContain(value);
    }
  });

  it('is sorted and deduplicated', () => {
    const values = allGeneratedFilterValues();
    expect(values).toEqual([...new Set(values)].sort());
  });

  it('emits where:* and when:* values (all in dimension:value form)', () => {
    for (const value of allGeneratedFilterValues()) {
      expect(value).toMatch(/^(where|when):.+/);
    }
  });

  it('covers date/era when:* leaves across the era timeline', () => {
    const values = allGeneratedFilterValues();
    expect(values).toContain('when:seethrough/2013/06');
    expect(values).toContain('when:edtech/2015/09');
    expect(values).toContain('when:nomad/2018/02');
  });
});

describe('declaredGeneratedFilterValues', () => {
  it('expands a present leaf to its ancestor levels for drill-down', () => {
    const values = declaredGeneratedFilterValues(['where:europe/uk/london']);
    expect(values).toContain('where:europe');
    expect(values).toContain('where:europe/uk');
    expect(values).toContain('where:europe/uk/london');
  });

  it('excludes a location that is not present on any card (post-less travel)', () => {
    // Only London is present; Copenhagen (also in TRAVEL_LOG) is not.
    const values = declaredGeneratedFilterValues(['where:europe/uk/london']);
    expect(values).not.toContain('where:europe/denmark');
    expect(values).not.toContain('where:europe/denmark/copenhagen');
  });

  it('ignores present tags that no generator can emit', () => {
    const values = declaredGeneratedFilterValues(['what:writing', 'where:work/dot']);
    expect(values).toEqual([]);
  });

  it('is sorted, deduplicated, and never a bare dimension root', () => {
    const values = declaredGeneratedFilterValues([
      'where:australia/sydney',
      'where:australia/sydney',
      'where:europe/uk/london',
    ]);
    expect(values).toEqual([...new Set(values)].sort());
    for (const value of values) {
      expect(value.split(':')[1]).not.toBe('');
    }
  });
});

describe('generatedDisplayName', () => {
  it('overrides acronym/initialism slugs that humanise badly', () => {
    expect(generatedDisplayName('where:europe/uk')).toBe('UK');
    expect(generatedDisplayName('where:north-america/usa')).toBe('USA');
    expect(generatedDisplayName('where:asia/uae')).toBe('UAE');
    expect(generatedDisplayName('where:north-america/usa/washington-dc')).toBe('Washington DC');
  });

  it('returns undefined for values with no override (humanisation applies)', () => {
    expect(generatedDisplayName('where:europe/italy')).toBeUndefined();
    expect(generatedDisplayName('where:australia/sydney')).toBeUndefined();
  });

  it('labels era nodes from the era registry', () => {
    expect(generatedDisplayName('when:seethrough')).toBe('SeeThrough Studios');
    expect(generatedDisplayName('when:edtech')).toBe('EdTech');
    expect(generatedDisplayName('when:current')).toBe('Current');
  });

  it('labels month leaves with month names', () => {
    expect(generatedDisplayName('when:seethrough/2013/06')).toBe('June');
    expect(generatedDisplayName('when:current/2020/01')).toBe('January');
    expect(generatedDisplayName('when:nomad/2018/12')).toBe('December');
  });

  it('leaves year nodes to humanisation', () => {
    expect(generatedDisplayName('when:seethrough/2013')).toBeUndefined();
  });
});

describe('generatedSortOrder', () => {
  it('orders era roots chronologically (their WHEN_ERAS index)', () => {
    // uni < seethrough < edtech < nomad < current in the era registry.
    expect(generatedSortOrder('when:uni')).toBe(0);
    expect(generatedSortOrder('when:seethrough')).toBe(1);
    expect(generatedSortOrder('when:current')).toBe(4);
    expect(generatedSortOrder('when:uni')!).toBeLessThan(
      generatedSortOrder('when:current')!,
    );
  });

  it('returns undefined for year/month levels and non-era values', () => {
    expect(generatedSortOrder('when:seethrough/2013')).toBeUndefined();
    expect(generatedSortOrder('when:current/2020/01')).toBeUndefined();
    expect(generatedSortOrder('where:europe/uk')).toBeUndefined();
  });
});
