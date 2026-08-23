import { describe, it, expect } from 'vitest';
import {
  EMPTY_EXCLUDE_PLAN,
  GENERATED_EXCLUDE_PREFIX,
  applyReEnables,
  isEmptyExcludePlan,
  isVetoed,
  matchesVeto,
  parseExcludeTags,
  partitionGeneratedTags,
} from './exclude-tags';
import {
  generateTagsForCard,
  generatedTagsForCard,
  generatorDerivations,
} from './filter-generators';
import { WHY_BUYABLE, WHY_PLAYABLE, WHY_VIEWABLE } from './why-tags';

const KEYS = generatorDerivations();
const EXCLUDE = (entries: string[]) => parseExcludeTags(entries, KEYS);

// 2017-09-15 falls in the Taghazout, Morocco travel-log range and the `nomad`
// era — one date that exercises both date generators at once.
const NOMAD = new Date('2017-09-15T00:00:00.000Z');

describe('parseExcludeTags', () => {
  it('splits the two forms', () => {
    const plan = EXCLUDE(['generated/location', 'why/playable']);
    expect([...plan.suppressed]).toEqual(['location']);
    expect(plan.vetoes).toEqual(['why:playable']);
  });

  it('normalises a value-form entry from authored to canonical form', () => {
    // The same authored → canonical boundary the `tags` field crosses; this is
    // the fourth call site on it (see five-w.ts).
    expect(EXCLUDE(['where/europe/norway']).vetoes).toEqual(['where:europe/norway']);
  });

  it('leaves a dimensionless value alone, as normaliseAuthoredTag does', () => {
    expect(EXCLUDE(['interactive']).vetoes).toEqual(['interactive']);
  });

  it('accepts an already-canonical value', () => {
    expect(EXCLUDE(['why:playable']).vetoes).toEqual(['why:playable']);
  });

  it('ignores blank entries rather than vetoing everything', () => {
    // A veto of '' would prefix-match nothing (no tag is '' or starts with
    // '/'), but silently carrying it would still make `isEmptyExcludePlan`
    // lie about a plan that does nothing.
    expect(isEmptyExcludePlan(EXCLUDE(['', '   ']))).toBe(true);
  });

  it('THROWS on a generated/* entry naming no real key', () => {
    // The whole reason the generator form is a closed set: a suppression knob
    // that fails open is invisible — the card just keeps a tag the author
    // asked to drop, with nothing anywhere saying so.
    expect(() => EXCLUDE(['generated/locatoin'])).toThrow(/names no generated derivation/);
  });

  it('names the legal keys and the offending entry in the error', () => {
    expect(() => EXCLUDE(['generated/nope'])).toThrow(/generated\/nope/);
    expect(() => EXCLUDE(['generated/nope'])).toThrow(/location/);
  });

  it('names the card in the error when given one', () => {
    expect(() => parseExcludeTags(['generated/nope'], KEYS, 'what/puzzles/x'))
      .toThrow(/what\/puzzles\/x/);
  });

  it('rejects generated/viewable — nothing derives it, so nothing can suppress it', () => {
    // Falls out of the key set rather than being special-cased (issue #116).
    expect(() => EXCLUDE(['generated/viewable'])).toThrow();
  });

  it('accepts every derivation a generator actually declares', () => {
    for (const key of KEYS) {
      expect(() => EXCLUDE([`${GENERATED_EXCLUDE_PREFIX}${key}`])).not.toThrow();
    }
  });
});

describe('matchesVeto', () => {
  it('matches exactly', () => {
    expect(matchesVeto('why:playable', 'why:playable')).toBe(true);
  });

  it('matches a descendant', () => {
    expect(matchesVeto('where:europe/norway/svalbard', 'where:europe')).toBe(true);
  });

  it('anchors on segment boundaries, so a shared prefix is not a match', () => {
    expect(matchesVeto('where:europe-central', 'where:europe')).toBe(false);
  });

  it('does not match an ancestor of the veto', () => {
    expect(matchesVeto('where:europe', 'where:europe/norway')).toBe(false);
  });
});

describe('the value form', () => {
  it('removes a generated tag whoever proposed it', () => {
    const tags = generatedTagsForCard(['what:writing'], {
      date: NOMAD,
      exclude: EXCLUDE(['where/africa/morocco/taghazout']),
    });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    expect(tags).toContain('what:writing');
  });

  it('prefix-matches, so an ancestor drops the derivation below it', () => {
    const tags = generatedTagsForCard([], { date: NOMAD, exclude: EXCLUDE(['where/africa']) });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
  });

  it('leaves the other generators alone', () => {
    const tags = generatedTagsForCard([], { date: NOMAD, exclude: EXCLUDE(['where/africa']) });
    expect(tags).toContain('when:nomad/2017/09');
  });

  it('CANNOT remove an authored tag — the veto applies to the generated delta only', () => {
    // The invariant that makes the two forms safe to mix: you write the tag or
    // you write the veto, and they can never contradict each other.
    const tags = generatedTagsForCard(['where:africa/morocco/taghazout'], {
      exclude: EXCLUDE(['where/africa']),
    });
    expect(tags).toContain('where:africa/morocco/taghazout');
  });

  it('cannot remove a path-derived or cascade tag either, for the same reason', () => {
    const tags = generatedTagsForCard(['what:puzzles', 'who:me'], {
      exclude: EXCLUDE(['what/puzzles', 'who/me']),
    });
    expect(tags).toEqual(expect.arrayContaining(['what:puzzles', 'who:me']));
  });

  it('removes a derived affordance', () => {
    const tags = generatedTagsForCard([], {
      actions: [{ text: 'Play it', url: 'https://x', kind: 'play' }],
      exclude: EXCLUDE(['why/playable']),
    });
    expect(tags).not.toContain(WHY_PLAYABLE);
  });
});

describe('the generator form', () => {
  it('suppresses one generator without touching the others', () => {
    const tags = generatedTagsForCard([], {
      date: NOMAD,
      exclude: EXCLUDE(['generated/location']),
    });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    expect(tags).toContain('when:nomad/2017/09');
  });

  it('suppresses one affordance without touching its sibling', () => {
    const card = {
      actions: [
        { text: 'Play it', url: 'https://x', kind: 'play' as const },
        { text: 'Buy a nice copy', url: 'https://y', kind: 'buy' as const },
      ],
    };
    const tags = generatedTagsForCard([], { ...card, exclude: EXCLUDE(['generated/playable']) });
    expect(tags).not.toContain(WHY_PLAYABLE);
    expect(tags).toContain(WHY_BUYABLE);
  });

  it('beats an explicit override of the same generator', () => {
    // The exclusion is checked before the override is read, so "no location"
    // wins over "this location" rather than the two fighting.
    const tags = generatedTagsForCard([], {
      date: NOMAD,
      overrides: { location: 'europe/norway/svalbard' },
      exclude: EXCLUDE(['generated/location']),
    });
    expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
  });

  it('does not need to know what the derivation would have produced', () => {
    // The robustness the value form lacks: this holds for any date, so
    // shifting a travel-log range cannot silently un-suppress the card.
    for (const date of [NOMAD, new Date('2013-06-09T00:00:00.000Z'), new Date('2030-01-01T00:00:00.000Z')]) {
      const tags = generatedTagsForCard([], { date, exclude: EXCLUDE(['generated/location']) });
      expect(tags.filter(t => t.startsWith('where:'))).toEqual([]);
    }
  });
});

describe('inert reporting', () => {
  it('reports a value-form entry that caught nothing', () => {
    const { inert } = generateTagsForCard([], {
      date: NOMAD,
      exclude: EXCLUDE(['where/europe/norway/svalbard']),
    });
    expect(inert).toEqual(['where:europe/norway/svalbard']);
  });

  it('reports nothing for a value-form entry that did its job', () => {
    const { inert } = generateTagsForCard([], {
      date: NOMAD,
      exclude: EXCLUDE(['where/africa/morocco/taghazout']),
    });
    expect(inert).toEqual([]);
  });

  it('counts an entry that only matches an AUTHORED tag as inert', () => {
    // It is: the veto never applies to authored tags, so this removed nothing
    // and the author should be told rather than left believing it worked.
    const { inert } = generateTagsForCard(['where:work/dot'], {
      exclude: EXCLUDE(['where/work/dot']),
    });
    expect(inert).toEqual(['where:work/dot']);
  });

  it('reports a generator-form entry whose derivation had nothing to say', () => {
    // No date, so the location generator would have produced nothing anyway.
    const { inert } = generateTagsForCard([], { exclude: EXCLUDE(['generated/location']) });
    expect(inert).toEqual(['generated/location']);
  });

  it('reports nothing for a generator-form entry that suppressed something real', () => {
    const { inert } = generateTagsForCard([], {
      date: NOMAD,
      exclude: EXCLUDE(['generated/location']),
    });
    expect(inert).toEqual([]);
  });

  it('judges each entry separately when several are present', () => {
    const { inert, tags } = generateTagsForCard([], {
      date: NOMAD,
      exclude: EXCLUDE(['generated/location', 'generated/era', 'why/buyable']),
    });
    expect(tags.filter(t => t.startsWith('where:') || t.startsWith('when:'))).toEqual([]);
    expect(inert).toEqual(['why:buyable']);
  });

  it('is empty when the card excludes nothing', () => {
    expect(generateTagsForCard([], { date: NOMAD }).inert).toEqual([]);
  });
});

describe('EMPTY_EXCLUDE_PLAN', () => {
  it('changes nothing', () => {
    const withPlan = generatedTagsForCard(['what:writing'], { date: NOMAD, exclude: EMPTY_EXCLUDE_PLAN });
    const without = generatedTagsForCard(['what:writing'], { date: NOMAD });
    expect(withPlan).toEqual(without);
  });

  it('is recognised as empty', () => {
    expect(isEmptyExcludePlan(EMPTY_EXCLUDE_PLAN)).toBe(true);
    expect(isEmptyExcludePlan(EXCLUDE(['why/playable']))).toBe(false);
  });
});

describe('isVetoed', () => {
  it('is true when any veto in the plan catches the tag', () => {
    const plan = EXCLUDE(['why/playable', 'where/europe']);
    expect(isVetoed('where:europe/norway/svalbard', plan)).toBe(true);
    expect(isVetoed(WHY_PLAYABLE, plan)).toBe(true);
    expect(isVetoed(WHY_VIEWABLE, plan)).toBe(false);
  });
});

describe('partitionGeneratedTags', () => {
  it('splits re-enables out of the tag list', () => {
    const { tags, reEnabled } = partitionGeneratedTags(
      ['what:puzzles', 'generated/location', 'where:work/dot'],
      KEYS,
    );
    expect(tags).toEqual(['what:puzzles', 'where:work/dot']);
    expect([...reEnabled]).toEqual(['location']);
  });

  it('STRIPS the directive, so it can never reach the panel or the manifest', () => {
    // `generated:location` is not a filter value: it has no .tag.yaml, names
    // nothing, and would render as a nonsense chip on the card itself.
    const { tags } = partitionGeneratedTags(['generated/era'], KEYS);
    expect(tags).toEqual([]);
  });

  it('leaves an ordinary dimensionless tag alone', () => {
    // The interception is on the reserved first segment, not on "has a slash".
    const { tags, reEnabled } = partitionGeneratedTags(['interactive'], KEYS);
    expect(tags).toEqual(['interactive']);
    expect(reEnabled.size).toBe(0);
  });

  it('THROWS on a generated/* tag naming no real derivation', () => {
    // Exactly as invisible as a bad exclusion when it fails open: the card
    // silently keeps whatever a folder excluded, with nothing saying why.
    expect(() => partitionGeneratedTags(['generated/locatoin'], KEYS))
      .toThrow(/names no generated derivation/);
  });

  it('names the card in the error when given one', () => {
    expect(() => partitionGeneratedTags(['generated/nope'], KEYS, 'what/posts/x'))
      .toThrow(/what\/posts\/x/);
  });

  it('accepts every derivation a generator declares', () => {
    for (const key of KEYS) {
      expect(() => partitionGeneratedTags([`${GENERATED_EXCLUDE_PREFIX}${key}`], KEYS)).not.toThrow();
    }
  });
});

describe('applyReEnables', () => {
  it('takes a derivation back out of the suppression set', () => {
    const plan = applyReEnables(EXCLUDE(['generated/location']), new Set(['location']));
    expect(plan.suppressed.size).toBe(0);
  });

  it('leaves the other suppressions alone', () => {
    const plan = applyReEnables(
      EXCLUDE(['generated/location', 'generated/era']),
      new Set(['location']),
    );
    expect([...plan.suppressed]).toEqual(['era']);
  });

  it('leaves value-form vetoes alone — a re-enable only addresses derivations', () => {
    const plan = applyReEnables(EXCLUDE(['where/europe']), new Set(['location']));
    expect(plan.vetoes).toEqual(['where:europe']);
  });

  it('is a no-op when nothing was suppressed', () => {
    const plan = EXCLUDE([]);
    expect(applyReEnables(plan, new Set(['location']))).toBe(plan);
  });

  it('RE-ENABLE BEATS EXCLUDE, which is the whole point of the form', () => {
    // Exclusions accumulate down the cascade, so a nearer-wins rule would make
    // the escape hatch unable to escape an inherited exclusion.
    const plan = applyReEnables(EXCLUDE(['generated/location']), new Set(['location']));
    const tags = generatedTagsForCard([], { date: NOMAD, exclude: plan });
    expect(tags).toContain('where:africa/morocco/taghazout');
  });
});
