import { describe, it, expect } from 'vitest';
import {
  generatedTagsForCard,
  generatorOverrideKeys,
  allGeneratedFilterValues,
  declaredGeneratedFilterValues,
  generatedDisplayName,
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
});

describe('generatorOverrideKeys', () => {
  it('includes the travel generator\'s location key', () => {
    expect(generatorOverrideKeys()).toContain('location');
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

  it('emits only where:* values (all in dimension:value form)', () => {
    for (const value of allGeneratedFilterValues()) {
      expect(value).toMatch(/^where:.+/);
    }
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
});
