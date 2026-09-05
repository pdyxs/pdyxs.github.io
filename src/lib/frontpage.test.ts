import { describe, it, expect, beforeEach } from 'vitest';
import { buildBrowseUrl, resolvePinnedCards, resolveFrontPageSlots } from './frontpage';
import type { FrontPageConfig, SerialisedCardFull } from './frontpage';
import { parseHomeSlots } from './home-slots';
import type { NormalisedSlot } from './home-slots';
import { BROWSE_CARD_VARIANTS } from './browse-card-variants';
import { fakeCardMeta } from '../test/fixtures';
import { clearViewState, getViewState, hasBeenRead } from './card-view-state';
import type { FilterState } from '../dimensions';
import { DIMENSIONS, selectedValues } from '../dimensions';
import { DEFAULT_BROWSE_LENS_ID, getLensDefinition } from './lens-registry';
import { DEFAULT_PRIORITY } from './priority';
import { DEFAULT_FOLDER_SORT } from './folder-sort';

// ---------------------------------------------------------------------------
// buildBrowseUrl
// ---------------------------------------------------------------------------

describe('buildBrowseUrl', () => {
  // Home (the sole acceptsFilters:false lens) can't render a filter, so
  // buildBrowseUrl always targets the fallback browse lens (issue #26) —
  // never bare `/`, which would silently drop the filter.
  it('routes to the default browse lens with no params for an empty filter', () => {
    expect(buildBrowseUrl({ })).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
  });

  it('includes filter params for a single-dimension filter', () => {
    const url = buildBrowseUrl({ what: ['what:projects'] });
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe(`/lens/${DEFAULT_BROWSE_LENS_ID}`);
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['projects']);
  });

  it('includes multiple values for the same dimension', () => {
    const filter: FilterState = { what: ['what:projects', 'what:games'] };
    const url = buildBrowseUrl(filter);
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['projects', 'games']);
  });

  it('includes values from multiple dimensions', () => {
    const filter: FilterState = {
      what: ['what:projects'], who: ['who:pdyxs'],
    };
    const url = buildBrowseUrl(filter);
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.getAll('filter.what')).toEqual(['projects']);
    expect(parsed.searchParams.getAll('filter.who')).toEqual(['pdyxs']);
  });
});

// ---------------------------------------------------------------------------
// resolvePinnedCards
// ---------------------------------------------------------------------------

describe('resolvePinnedCards', () => {
  it('returns card metas for known UIDs in the requested order', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    const b = fakeCardMeta({ uid: 'posts/b' });
    const result = resolvePinnedCards(['posts/b', 'posts/a'], [a, b]);
    expect(result.map(c => c.uid)).toEqual(['posts/b', 'posts/a']);
  });

  it('drops unknown UIDs silently', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    const result = resolvePinnedCards(['posts/a', 'posts/unknown'], [a]);
    expect(result.map(c => c.uid)).toEqual(['posts/a']);
  });

  it('returns empty array when no UIDs match', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    const result = resolvePinnedCards(['posts/unknown'], [a]);
    expect(result).toEqual([]);
  });

  it('returns empty array when uid list is empty', () => {
    const a = fakeCardMeta({ uid: 'posts/a' });
    expect(resolvePinnedCards([], [a])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveFrontPageSlots
// ---------------------------------------------------------------------------

function fakeSerialisedCard(overrides?: Partial<SerialisedCardFull>): SerialisedCardFull {
  return {
    uid: 'posts/a',
    title: 'A Post',
    date: null,
    tags: [],
    renderer: 'card',
    contentHash: 'hash:a',
    priority: DEFAULT_PRIORITY,
    sort: DEFAULT_FOLDER_SORT,
    ...overrides,
  };
}

describe('resolveFrontPageSlots', () => {
  beforeEach(() => {
    clearViewState();
  });

  /** Authored slots, run through the same normaliser the generator uses — so
   * these tests exercise the shape the YAML actually produces rather than a
   * hand-built one. That is how the `selections:` nesting of issue #79
   * survived as long as it did. */
  const slots = (...authored: unknown[]): NormalisedSlot[] =>
    parseHomeSlots({ slots: authored });

  const config = (...authored: unknown[]): FrontPageConfig => ({ slots: slots(...authored) });

  it('resolves a uid slot to its known card', () => {
    const cards = [fakeSerialisedCard({ uid: 'posts/about-me', title: 'About Me', description: 'bio' })];

    const { slots: resolved } = resolveFrontPageSlots(
      config({ uid: 'posts/about-me' }),
      cards,
      new Date('2024-03-15T08:00:00Z'),
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].card?.uid).toBe('posts/about-me');
    expect(resolved[0].seeMoreUrl).toBeUndefined();
  });

  // A uid naming no card renders with card: null — chrome and grid cell
  // intact, no card. Dropping the slot silently (which the old PinnedSlot did)
  // would reflow every other slot around a typo now that `span` exists; a
  // visible hole is a signal.
  it('keeps a uid slot whose uid matches no card, with a null card', () => {
    const { slots: resolved } = resolveFrontPageSlots(
      config({ uid: 'posts/missing' }),
      [],
      new Date('2024-03-15T08:00:00Z'),
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].card).toBeNull();
  });

  it('resolves a filter slot to a day-seeded pick among matching cards', () => {
    const cards = [
      fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'] }),
      fakeSerialisedCard({ uid: 'projects/b', tags: ['what:projects'] }),
    ];

    const { slots: resolved } = resolveFrontPageSlots(
      config({ label: 'A Project', filter: { what: ['what:projects'] }, seeMore: true }),
      cards,
      new Date('2024-03-15T08:00:00Z'),
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      label: 'A Project',
      seeMoreUrl: `/lens/${DEFAULT_BROWSE_LENS_ID}?filter.what=projects`,
    });
    expect(['projects/a', 'projects/b']).toContain(resolved[0].card?.uid);
  });

  it('resolves a filter slot to null when no card matches', () => {
    const { slots: resolved } = resolveFrontPageSlots(
      config({ label: 'A Project', filter: { what: ['what:projects'] } }),
      [],
      new Date('2024-03-15T08:00:00Z'),
    );
    expect(resolved[0].card).toBeNull();
    expect(resolved[0].label).toBe('A Project');
  });

  // seeMoreUrl is present only when the slot asked for it — the link is chrome
  // the author opts into, not something every filter slot grows.
  it('omits seeMoreUrl unless the slot declared seeMore', () => {
    const { slots: resolved } = resolveFrontPageSlots(
      config({ filter: { what: ['what:projects'] } }),
      [],
      new Date('2024-03-15T08:00:00Z'),
    );
    expect(resolved[0].seeMoreUrl).toBeUndefined();
  });

  it('carries the normalised layout and the resolved variant straight through', () => {
    const { slots: resolved } = resolveFrontPageSlots(
      config({ filter: { what: ['what:projects'] }, span: { small: 5, large: 4 }, rows: 2, side: 'right', variant: 'brief' }),
      [],
      new Date('2024-03-15T08:00:00Z'),
    );
    expect(resolved[0]).toMatchObject({
      span: { small: 5, large: 4 },
      rows: { small: 2, large: 2 },
      side: 'right',
      variant: BROWSE_CARD_VARIANTS.brief,
    });
  });

  it('defaults a slot that declares no variant to full', () => {
    const { slots: resolved } = resolveFrontPageSlots(
      config({ uid: 'posts/a' }),
      [],
      new Date('2024-03-15T08:00:00Z'),
    );
    expect(resolved[0].variant).toBe(BROWSE_CARD_VARIANTS.full);
  });

  it('writes no view-state — showing a card is not an event the site records', () => {
    const cards = [fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'], contentHash: 'hash:a' })];

    resolveFrontPageSlots(
      config({ label: 'A Project', filter: { what: ['what:projects'] } }),
      cards,
      new Date('2024-03-15T08:00:00Z'),
    );

    expect(getViewState('projects/a', 'hash:a')).toBe('unseen');
    expect(hasBeenRead('projects/a')).toBe(false);
  });

  it("honours a slot's declared pool: pool 1 pins the top-priority card", () => {
    const cfg = config({ label: 'A Project', filter: { what: ['what:projects'] }, pool: 1 });
    const cards = [
      fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'], priority: 0 }),
      fakeSerialisedCard({ uid: 'projects/top', tags: ['what:projects'], priority: 100 }),
    ];

    for (const day of ['2024-03-15T08:00:00Z', '2024-06-02T08:00:00Z']) {
      const { slots: resolved } = resolveFrontPageSlots(cfg, cards, new Date(day));
      expect(resolved[0].card?.uid).toBe('projects/top');
    }
  });
});

// ---------------------------------------------------------------------------
// The real home lens config (issue #79)
//
// Every test above hand-builds its slot list, so the suite only ever exercised
// the shape the code expects — never the shape the YAML actually produces. That
// is exactly how the `selections:` nesting survived: it made each slot's
// FilterState empty, so all three slots drew from the whole pool and the
// day-seed picked the same card three times. These run against the generated
// registry, so an authoring slip fails here rather than on the page.
// ---------------------------------------------------------------------------

// Compile-time half of the #79 fix: FilterState is keyed by DimensionId, so
// the shape the YAML used to produce is now rejected outright. `npm run check`
// fails if this stops being an error — i.e. if the key ever reopens to string.
// @ts-expect-error — "selections" names no dimension
const _rejectsUnknownDimensionKey: FilterState = { selections: { what: ['what:puzzles'] } };
void _rejectsUnknownDimensionKey;

describe('resolveFrontPageSlots against the real home lens config', () => {
  beforeEach(() => {
    clearViewState();
  });

  const SEED = new Date('2024-03-15T08:00:00Z');

  const homeConfig = getLensDefinition('home')!.config as unknown as FrontPageConfig;
  const filterSlots = (): NormalisedSlot[] => homeConfig.slots.filter(s => s.filter !== undefined);

  /** What a slot's filter asks for, read the way applyFilters reads it — via
   * the dimension registry, never Object.values. A filter nested under a key
   * that names no dimension yields nothing here, which is the whole point:
   * the registry is what can tell "narrows by `what`" from "narrows by
   * nothing", and a raw key walk cannot. */
  const wantedTags = (slot: NormalisedSlot): string[] =>
    DIMENSIONS.flatMap(d => selectedValues(slot.filter!, d.id));

  // One card per tag the slot actually asks for, so a slot that isn't
  // narrowing gets an empty pool and can't help but reveal itself.
  const pool = (): SerialisedCardFull[] =>
    filterSlots().flatMap((slot, i) =>
      wantedTags(slot).map(tag =>
        fakeSerialisedCard({ uid: `pool/${i}-${tag}`, tags: [tag], contentHash: `hash:${i}-${tag}` }),
      ),
    );

  const resolvedFilterSlots = () => {
    const resolved = resolveFrontPageSlots(homeConfig, pool(), SEED).slots;
    return homeConfig.slots
      .map((slot, i) => ({ slot, resolved: resolved[i] }))
      .filter(({ slot }) => slot.filter !== undefined);
  };

  it('is normalised: every slot carries a span, rows, side and variant', () => {
    for (const [i, slot] of homeConfig.slots.entries()) {
      expect(slot.span, `slot ${i + 1}`).toEqual({ small: expect.any(Number), large: expect.any(Number) });
      expect(slot.rows, `slot ${i + 1}`).toEqual({ small: expect.any(Number), large: expect.any(Number) });
      expect(['main', 'right'], `slot ${i + 1}`).toContain(slot.side);
      expect(Object.keys(BROWSE_CARD_VARIANTS), `slot ${i + 1}`).toContain(slot.variant);
      // `type:` is dropped from the authored YAML and from the baked config —
      // `uid:`/`filter:` already say which kind a slot is.
      expect(slot).not.toHaveProperty('type');
    }
  });

  it('gives every filter slot a filter that actually narrows a dimension', () => {
    for (const slot of filterSlots()) {
      expect(wantedTags(slot), `slot "${slot.label}" narrows no dimension`).not.toHaveLength(0);
    }
  });

  it("picks a card matching that slot's own filter, for every slot", () => {
    for (const { slot, resolved } of resolvedFilterSlots()) {
      expect(resolved.card, `slot "${slot.label}" picked no card`).not.toBeNull();
      expect(wantedTags(slot)).toContain(resolved.card!.tags[0]);
    }
  });

  it('does not show the same card in every slot', () => {
    const uids = resolvedFilterSlots().map(({ resolved }) => resolved.card?.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('gives every See-more link its slot filter params', () => {
    for (const { slot, resolved } of resolvedFilterSlots()) {
      if (!slot.seeMore) continue;
      const parsed = new URL(resolved.seeMoreUrl!, 'http://x');
      expect([...parsed.searchParams.keys()], `slot "${slot.label}" links to a bare lens`).not.toHaveLength(0);
    }
  });
});
