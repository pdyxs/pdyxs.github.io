// Filter generators — build-time derivation of filter tags from card data.
//
// A generator derives extra `dimension:value` filter tags for a card from
// something other than its folder path or frontmatter (e.g. its date). It has
// two faces that MUST stay in sync:
//
//   - `apply(tags, card)` runs per-card in getAllCards() (src/lib/cards.ts) and
//     returns the card's tag list with the generator's tags merged in. Written
//     as a reducer step so generators chain and each sees the prior output.
//   - `allValues()` enumerates every filter value the generator could ever
//     emit, so the short-code manifest build
//     (scripts/generate-stack-manifest.mjs) can assign URL codes to them —
//     runtime-injected tags never touch the filesystem the manifest walks, so
//     without this they'd fall back to raw (long) URL encoding.
//
// Adding a future generator is a single entry in FILTER_GENERATORS; both the
// runtime injection and the manifest pick it up automatically.
//
// This module must stay pure (no Astro, fs, or browser imports) — it is
// imported both by SSR card loading and by the plain-node manifest script.

import { TRAVEL_LOG } from '../data/travel-log.ts';
import { lookupLocationForDate, injectWhereTags } from './where-tags.ts';

/** The card fields a generator may read. Kept minimal and view-free. */
export type FilterGeneratorCard = {
  date?: Date;
  /**
   * Explicit override attributes, keyed by the frontmatter/`_config.yaml`
   * attribute name a generator declares in `overrideKeys`. Populated by
   * getAllCards() (src/lib/cards.ts) as `frontmatter[key] ?? cascade[key]`.
   */
  overrides?: Record<string, string | undefined>;
};

export type FilterGenerator = {
  /**
   * Frontmatter/`_config.yaml` attribute names this generator consumes as
   * explicit overrides. Each generator owns its own keys so two generators
   * that both touch the same dimension never collide. See generatorOverrideKeys().
   */
  overrideKeys?: string[];
  /** Returns `tags` with this generator's derived tags merged in. */
  apply(tags: string[], card: FilterGeneratorCard): string[];
  /** Every filter value this generator can emit, for the short-code manifest. */
  allValues(): string[];
};

/** The attribute the travel generator reads to override its date-derived value. */
const LOCATION_OVERRIDE_KEY = 'location';

/**
 * Sentinel `location:` value that suppresses date-derivation entirely: the card
 * gets no geographic `where:*` tag even if its date falls in a travel-log range.
 * Reserved — no real travel-log location path is `none`. Only the *derived* tag
 * is suppressed; authored `where:*` tags (e.g. `where:work/*`) are left in place.
 */
const LOCATION_NONE = 'none';

/**
 * `where:*` location tags derived from the travel log (src/data/travel-log.ts).
 * A card's date is matched against the log's date ranges. A card (or a folder,
 * via `_config.yaml`) can override this by setting `location:` to a bare
 * location path — the override replaces the date lookup entirely — or to `none`
 * to suppress the derived tag altogether. Either way, authored `where:*` tags
 * (e.g. `where:work/*`) are left untouched.
 */
const travelWhereGenerator: FilterGenerator = {
  overrideKeys: [LOCATION_OVERRIDE_KEY],
  apply(tags, { date, overrides }) {
    const override = overrides?.[LOCATION_OVERRIDE_KEY];
    const derived = override === LOCATION_NONE
      ? null
      : override
        ? `where:${override}`
        : date
          ? lookupLocationForDate(date, TRAVEL_LOG)
          : null;
    return injectWhereTags(tags, derived);
  },
  allValues() {
    return [...new Set(TRAVEL_LOG.map(entry => `where:${entry.location}`))];
  },
};

/** The active generators, applied in order. Add new generators here. */
export const FILTER_GENERATORS: FilterGenerator[] = [travelWhereGenerator];

/**
 * Display-name overrides for generated values whose humanised last segment
 * reads wrong — acronyms/initialisms. Applied by the tag registry only to
 * values that are already declared+present, so this affects the label, never
 * panel visibility (post-less locations still don't appear).
 */
const GENERATED_DISPLAY_NAMES: Record<string, string> = {
  'where:europe/uk': 'UK',
  'where:north-america/usa': 'USA',
  'where:asia/uae': 'UAE',
  'where:north-america/usa/washington-dc': 'Washington DC',
};

/** Proper display name for a generated value, or undefined to let it humanise. */
export function generatedDisplayName(value: string): string | undefined {
  return GENERATED_DISPLAY_NAMES[value];
}

/** Runs every generator over a card's tags, returning the augmented list. */
export function generatedTagsForCard(tags: string[], card: FilterGeneratorCard): string[] {
  return FILTER_GENERATORS.reduce((acc, gen) => gen.apply(acc, card), tags);
}

/** The union of every override attribute key any generator declares (for the cascade + card plumbing). */
export function generatorOverrideKeys(): string[] {
  return [...new Set(FILTER_GENERATORS.flatMap(gen => gen.overrideKeys ?? []))];
}

/** Sorted, deduped union of every value any generator can emit (for the manifest). */
export function allGeneratedFilterValues(): string[] {
  return [...new Set(FILTER_GENERATORS.flatMap(gen => gen.allValues()))].sort();
}

/** A value plus every dimensioned ancestor prefix (excl. the bare `dim:` root). */
function withAncestorPrefixes(value: string): string[] {
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) return [value];
  const dimension = value.slice(0, colonIdx);
  const segments = value.slice(colonIdx + 1).split('/');
  const out: string[] = [];
  let acc = '';
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    out.push(`${dimension}:${acc}`);
  }
  return out;
}

/**
 * The generator-emitted values *actually present on content* (intersect the
 * given tag list with what the generators can emit), expanded to include the
 * intermediate ancestor levels a drill-down panel navigates (`where:europe`,
 * `where:europe/uk` for `where:europe/uk/london`).
 *
 * The tag registry treats these as *declared* identities so they surface in the
 * filter panel — a generator is a first-class declaration source, unlike a
 * plain tag that merely appears on a card (those stay hidden; see
 * filterVisibleNodes in browse-helpers.ts). Filtering to present values keeps
 * post-less locations (travelled-through but never written about) out of the
 * panel: every declared value here has at least one matching card, and so does
 * each synthesised ancestor.
 */
export function declaredGeneratedFilterValues(presentTags: Iterable<string>): string[] {
  const emittable = new Set(allGeneratedFilterValues());
  const out = new Set<string>();
  for (const tag of presentTags) {
    if (!emittable.has(tag)) continue;
    for (const prefix of withAncestorPrefixes(tag)) out.add(prefix);
  }
  return [...out].sort();
}
