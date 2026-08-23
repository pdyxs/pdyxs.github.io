import { describe, it, expect } from 'vitest';
import { generatedTagsForCard, generatorDerivations, generatorFrontmatterKeys, allGeneratedFilterValues, declaredGeneratedFilterValues, generatedDisplayName, generatedSortOrder, generatedGroup } from './filter-generators';
import { parseExcludeTags } from './exclude-tags';
import { TRAVEL_LOG } from '../data/travel-log';

/** Parse an authored excludeTags list against the real generator key set. */
const EXCLUDE = (entries: string[]) => parseExcludeTags(entries, generatorDerivations());

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

  it('an authored where tag ADDS to the derived one, rather than replacing it', () => {
    // The semantic shift when `location:` was retired (issue #116): a card
    // sitting in two places at once is often right for a post written up long
    // after the trip. Replacing is now said explicitly, with an exclusion.
    const tags = generatedTagsForCard(['where:europe/norway/svalbard'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
    });
    expect(tags).toContain('where:europe/norway/svalbard');
    expect(tags).toContain('where:africa/morocco/taghazout');
  });

  it('…and the exclusion is what makes it a replacement', () => {
    const tags = generatedTagsForCard(['where:europe/norway/svalbard'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      exclude: EXCLUDE(['generated/location']),
    });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual(['where:europe/norway/svalbard']);
  });

  it('generated/location suppresses the date-derived tag', () => {
    // 2017-09-15 is the Taghazout range, but the exclusion opts out of derivation.
    const tags = generatedTagsForCard(['what:writing'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      exclude: EXCLUDE(['generated/location']),
    });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    expect(tags).toContain('what:writing');
  });

  it('generated/location leaves an authored where:work tag in place', () => {
    // Structural, not incidental: a generator declines its own derivation and
    // never touches the list it was handed.
    const tags = generatedTagsForCard(['where:work/dot'], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      exclude: EXCLUDE(['generated/location']),
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

  it('an authored when tag plus an exclusion replaces the date-derived one', () => {
    const tags = generatedTagsForCard(['when:current/2024/01'], {
      date: new Date('2013-06-09T00:00:00.000Z'),
      exclude: EXCLUDE(['generated/era']),
    });
    expect(tags.filter(t => t.startsWith('when:'))).toEqual(['when:current/2024/01']);
  });

  it('generated/era suppresses the date-derived when tag', () => {
    const tags = generatedTagsForCard(['what:writing'], {
      date: new Date('2013-06-09T00:00:00.000Z'),
      exclude: EXCLUDE(['generated/era']),
    });
    expect(tags.filter(t => t.startsWith('when:'))).toEqual([]);
    expect(tags).toContain('what:writing');
  });

  it('the era and location exclusions are independent', () => {
    const tags = generatedTagsForCard([], {
      date: new Date('2017-09-15T00:00:00.000Z'),
      exclude: EXCLUDE(['generated/location']),
    });
    // location suppressed, but the date/era tag still derives.
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    expect(tags).toContain('when:nomad/2017/09');
  });
});

describe('generatorDerivations', () => {
  it("includes the travel generator's location derivation", () => {
    expect(generatorDerivations()).toContain('location');
  });

  it("includes the date/era generator's era derivation", () => {
    expect(generatorDerivations()).toContain('era');
  });

  it('is deduplicated', () => {
    const keys = generatorDerivations();
    expect(keys).toEqual([...new Set(keys)]);
  });

  it('is the whole legal `generated/*` namespace', () => {
    expect([...generatorDerivations()].sort()).toEqual(
      ['buyable', 'difficulty', 'era', 'location', 'playable'],
    );
  });
});

describe('generatorFrontmatterKeys', () => {
  it('is just `difficulty` — the two real overrides were retired (issue #116)', () => {
    // `difficulty` is not an override: it is authored content with four
    // consumers, one of which is this generator. `location`/`era` existed only
    // to redirect a derivation, which `tags` + `excludeTags` now says.
    expect(generatorFrontmatterKeys()).toEqual(['difficulty']);
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

  it('emits only dimension:value forms, across every generator', () => {
    for (const value of allGeneratedFilterValues()) {
      expect(value).toMatch(/^(where|when|what|why):.+/);
    }
  });

  it('covers every difficulty rating', () => {
    const values = allGeneratedFilterValues();
    for (let level = 1; level <= 5; level++) {
      expect(values).toContain(`what:puzzles/level-${level}`);
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

describe('puzzle difficulty generator', () => {
  it('derives a level tag from the difficulty frontmatter', () => {
    expect(generatedTagsForCard(['what:puzzles/timeline'], {
      overrides: { difficulty: 'Level 3 (Medium)' },
    })).toContain('what:puzzles/level-3');
  });

  it('leaves a card with no difficulty alone', () => {
    expect(generatedTagsForCard(['what:posts'], { overrides: {} })).toEqual(['what:posts']);
  });

  it('leaves a difficulty it cannot read alone', () => {
    expect(generatedTagsForCard(['what:puzzles'], { overrides: { difficulty: 'Fiendish' } }))
      .toEqual(['what:puzzles']);
  });

  it('does not duplicate a level the card already carries', () => {
    const tags = ['what:puzzles', 'what:puzzles/level-2'];
    expect(generatedTagsForCard(tags, { overrides: { difficulty: 'Level 2 (Easy)' } })).toEqual(tags);
  });

  it('declares `difficulty` as a read field so the cascade plumbing supplies it', () => {
    expect(generatorFrontmatterKeys()).toContain('difficulty');
  });

  it('labels a level with its stars and sorts it by rating', () => {
    expect(generatedDisplayName('what:puzzles/level-4')).toBe('★★★★☆');
    expect(generatedSortOrder('what:puzzles/level-4')).toBe(4);
  });

  it('puts levels in their own panel section, and nothing else', () => {
    expect(generatedGroup('what:puzzles/level-4')).toBe('Difficulty');
    expect(generatedGroup('what:puzzles/timeline')).toBeUndefined();
    expect(generatedGroup('when:seethrough/2013/06')).toBeUndefined();
  });
});
