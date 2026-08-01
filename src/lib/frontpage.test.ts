import { describe, it, expect, beforeEach } from 'vitest';
import { buildBrowseUrl, resolvePinnedCards, resolveFrontPageSlots } from './frontpage';
import type { FilterSlotConfig, FrontPageConfig, ResolvedFilter, SerialisedCardFull } from './frontpage';
import { fakeCardMeta } from '../test/fixtures';
import { clearViewState } from './card-view-state';
import type { FilterState } from '../dimensions';
import { DIMENSIONS, selectedValues } from '../dimensions';
import { DEFAULT_BROWSE_LENS_ID, getLensDefinition } from './lens-registry';

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
    ...overrides,
  };
}

describe('resolveFrontPageSlots', () => {
  beforeEach(() => {
    clearViewState();
  });

  it('resolves a pinned slot to its known card, in slot order', () => {
    const config: FrontPageConfig = { slots: [{ type: 'pinned', uid: 'posts/about-me' }] };
    const cards = [fakeSerialisedCard({ uid: 'posts/about-me', title: 'About Me', description: 'bio' })];

    const { slots } = resolveFrontPageSlots(config, cards, new Date('2024-03-15T08:00:00Z'));

    expect(slots).toEqual([{ type: 'pinned', uid: 'posts/about-me', title: 'About Me', description: 'bio' }]);
  });

  it('drops a pinned slot whose uid matches no card', () => {
    const config: FrontPageConfig = { slots: [{ type: 'pinned', uid: 'posts/missing' }] };
    const { slots } = resolveFrontPageSlots(config, [], new Date('2024-03-15T08:00:00Z'));
    expect(slots).toEqual([]);
  });

  it('resolves a filter slot to a day-seeded pick among matching cards', () => {
    const config: FrontPageConfig = {
      slots: [{ type: 'filter', label: 'A Project', filter: { what: ['what:projects'] } }],
    };
    const cards = [
      fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'] }),
      fakeSerialisedCard({ uid: 'projects/b', tags: ['what:projects'] }),
    ];

    const { slots } = resolveFrontPageSlots(config, cards, new Date('2024-03-15T08:00:00Z'));

    expect(slots).toHaveLength(1);
    expect(slots[0].type).toBe('filter');
    expect(slots[0]).toMatchObject({ label: 'A Project', browseUrl: `/lens/${DEFAULT_BROWSE_LENS_ID}?filter.what=projects` });
    expect(['projects/a', 'projects/b']).toContain((slots[0] as any).card?.uid);
  });

  it('resolves a filter slot to null when no card matches', () => {
    const config: FrontPageConfig = {
      slots: [{ type: 'filter', label: 'A Project', filter: { what: ['what:projects'] } }],
    };
    const { slots } = resolveFrontPageSlots(config, [], new Date('2024-03-15T08:00:00Z'));
    expect(slots).toEqual([{ type: 'filter', label: 'A Project', card: null, browseUrl: `/lens/${DEFAULT_BROWSE_LENS_ID}?filter.what=projects` }]);
  });

  it('reports the picked filter-slot card as displayed, without writing view-state itself', () => {
    const config: FrontPageConfig = {
      slots: [{ type: 'filter', label: 'A Project', filter: { what: ['what:projects'] } }],
    };
    const cards = [fakeSerialisedCard({ uid: 'projects/a', tags: ['what:projects'], contentHash: 'hash:a' })];

    const { displayed } = resolveFrontPageSlots(config, cards, new Date('2024-03-15T08:00:00Z'));

    expect(displayed).toEqual([{ uid: 'projects/a', contentHash: 'hash:a' }]);
  });
});

// ---------------------------------------------------------------------------
// The real home lens config (issue #79)
//
// Every test above hand-builds its FrontPageConfig, so the suite only ever
// exercised the shape the code expects — never the shape the YAML actually
// produces. That is exactly how the `selections:` nesting survived: it made
// each slot's FilterState empty, so all three slots drew from the whole pool
// and the day-seed picked the same card three times. These run against the
// generated registry, so an authoring slip fails here rather than on the page.
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
  const filterSlots = (): FilterSlotConfig[] =>
    homeConfig.slots.filter((s): s is FilterSlotConfig => s.type === 'filter');

  /** What a slot's filter asks for, read the way applyFilters reads it — via
   * the dimension registry, never Object.values. A filter nested under a key
   * that names no dimension yields nothing here, which is the whole point:
   * the registry is what can tell "narrows by `what`" from "narrows by
   * nothing", and a raw key walk cannot. */
  const wantedTags = (slot: FilterSlotConfig): string[] =>
    DIMENSIONS.flatMap(d => selectedValues(slot.filter, d.id));

  // One card per tag the slot actually asks for, so a slot that isn't
  // narrowing gets an empty pool and can't help but reveal itself.
  const pool = (): SerialisedCardFull[] =>
    filterSlots().flatMap((slot, i) =>
      wantedTags(slot).map(tag =>
        fakeSerialisedCard({ uid: `pool/${i}-${tag}`, tags: [tag], contentHash: `hash:${i}-${tag}` }),
      ),
    );

  const resolvedFilterSlots = (): ResolvedFilter[] =>
    resolveFrontPageSlots(homeConfig, pool(), SEED).slots.filter(
      (s): s is ResolvedFilter => s.type === 'filter',
    );

  it('gives every filter slot a filter that actually narrows a dimension', () => {
    for (const slot of filterSlots()) {
      expect(wantedTags(slot), `slot "${slot.label}" narrows no dimension`).not.toHaveLength(0);
    }
  });

  it("picks a card matching that slot's own filter, for every slot", () => {
    const resolved = resolvedFilterSlots();
    const slots = filterSlots();

    expect(resolved).toHaveLength(slots.length);
    resolved.forEach((slot, i) => {
      expect(slot.card, `slot "${slot.label}" picked no card`).not.toBeNull();
      expect(wantedTags(slots[i])).toContain(slot.card!.tags[0]);
    });
  });

  it('does not show the same card in every slot', () => {
    const uids = resolvedFilterSlots().map(s => s.card?.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('gives every See-more link its slot filter params', () => {
    for (const slot of resolvedFilterSlots()) {
      const parsed = new URL(slot.browseUrl, 'http://x');
      expect([...parsed.searchParams.keys()], `slot "${slot.label}" links to a bare lens`).not.toHaveLength(0);
    }
  });
});
