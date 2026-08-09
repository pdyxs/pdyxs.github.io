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
import { WHEN_ERAS } from '../data/when-eras.ts';
import { deriveWhenTag, enumerateWhenTags } from './when-tags.ts';
import {
  MAX_DIFFICULTY,
  difficultyLevelFromTag,
  difficultyTagValue,
  formatDifficultyStars,
  parseDifficultyLevel,
} from './difficulty.ts';

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

/** The attribute the date/era generator reads to override its date-derived value. */
const ERA_OVERRIDE_KEY = 'era';

/**
 * Sentinel `era:` value that suppresses date-derivation entirely: the card gets
 * no `when:*` tag even if its date falls in an era range. Mirrors the travel
 * generator's `location: none`.
 */
const ERA_NONE = 'none';

/**
 * `when:<era>/<year>/<month>` tags derived from a card's date via the era
 * timeline (src/data/when-eras.ts). The date/era analogue of the travel
 * generator: a card (or a folder, via `_config.yaml`) can override this by
 * setting `era:` to a bare `when` path — the override replaces the date lookup
 * entirely — or to `none` to suppress the derived tag altogether. A card with
 * no `date` simply gets no derived `when:*` tag.
 */
const dateEraGenerator: FilterGenerator = {
  overrideKeys: [ERA_OVERRIDE_KEY],
  apply(tags, { date, overrides }) {
    const override = overrides?.[ERA_OVERRIDE_KEY];
    const derived = override === ERA_NONE
      ? null
      : override
        ? `when:${override}`
        : date
          ? deriveWhenTag(date, WHEN_ERAS)
          : null;
    if (derived === null || tags.includes(derived)) return tags;
    return [...tags, derived];
  },
  allValues() {
    return enumerateWhenTags(WHEN_ERAS, new Date().getUTCFullYear());
  },
};

/** The attribute the difficulty generator reads — a puzzle's `difficulty:` frontmatter. */
const DIFFICULTY_OVERRIDE_KEY = 'difficulty';

/** Panel section the difficulty values form, below the (ungrouped) puzzle series. */
const DIFFICULTY_GROUP = 'Difficulty';

/**
 * `what:puzzles/level-<n>` tags derived from a puzzle's `difficulty:` string.
 *
 * Unlike the other two generators this one reads a field rather than a date, so
 * it declares that field as its override key and the existing frontmatter ??
 * cascade plumbing hands it over — there is no separate "derive" path for it to
 * override, and `difficulty` is simply the input.
 *
 * Rooted at `what:puzzles` so the values drill in under Puzzles alongside the
 * series folders. Only puzzles carry a `difficulty:`, which is what keeps the
 * value honest; a non-puzzle card that grew one would land under Puzzles, so
 * the field stays puzzle-only (see the `difficulty` note in card-meta.ts).
 */
const puzzleDifficultyGenerator: FilterGenerator = {
  overrideKeys: [DIFFICULTY_OVERRIDE_KEY],
  apply(tags, { overrides }) {
    const level = parseDifficultyLevel(overrides?.[DIFFICULTY_OVERRIDE_KEY]);
    if (level === undefined) return tags;
    const derived = difficultyTagValue(level);
    return tags.includes(derived) ? tags : [...tags, derived];
  },
  allValues() {
    return Array.from({ length: MAX_DIFFICULTY }, (_, i) => difficultyTagValue(i + 1));
  },
};

/** The active generators, applied in order. Add new generators here. */
export const FILTER_GENERATORS: FilterGenerator[] = [
  travelWhereGenerator,
  dateEraGenerator,
  puzzleDifficultyGenerator,
];

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

/** Month names, indexed 0–11, for the `when:<era>/<year>/<month>` leaf level. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Era display labels keyed by `when:<slug>`, derived from the era registry. */
const WHEN_ERA_LABELS: Record<string, string> = Object.fromEntries(
  WHEN_ERAS.map(era => [`when:${era.slug}`, era.label]),
);

/** Chronological index keyed by `when:<slug>` — the era's position in WHEN_ERAS (which is date-ordered). */
const WHEN_ERA_ORDER: Record<string, number> = Object.fromEntries(
  WHEN_ERAS.map((era, i) => [`when:${era.slug}`, i]),
);

/**
 * Proper display name for a generated value, or undefined to let it humanise.
 * Year nodes (`when:<era>/2013`) return undefined — "2013" humanises to itself.
 */
export function generatedDisplayName(value: string): string | undefined {
  if (GENERATED_DISPLAY_NAMES[value]) return GENERATED_DISPLAY_NAMES[value];
  // A difficulty reads as its rating, not as "Level 3" — same stars the card
  // itself shows (see difficulty.ts).
  const difficulty = difficultyLevelFromTag(value);
  if (difficulty !== undefined) return formatDifficultyStars(difficulty);
  if (WHEN_ERA_LABELS[value]) return WHEN_ERA_LABELS[value];
  const monthMatch = value.match(/^when:[^/]+\/\d{4}\/(0[1-9]|1[0-2])$/);
  if (monthMatch) return MONTH_NAMES[Number(monthMatch[1]) - 1];
  return undefined;
}

/**
 * Explicit sibling sort order for a generated value, or undefined to let it
 * sort alphabetically. Only `when:<era>` root nodes need one — they'd
 * otherwise sort by slug instead of chronologically; year (`when:<era>/2013`)
 * and month (`.../03`) segments already sort chronologically as strings.
 */
export function generatedSortOrder(value: string): number | undefined {
  // Difficulties sort by rating: as strings, ★★★★★ and ★☆☆☆☆ are indistinguishable
  // to a collator, and the underlying slugs would sort level-10 before level-2.
  const difficulty = difficultyLevelFromTag(value);
  if (difficulty !== undefined) return difficulty;
  return WHEN_ERA_ORDER[value];
}

/**
 * Panel section a generated value belongs to, or undefined to leave it in the
 * default (ungrouped) section. The tag-registry equivalent of a `group:` key in
 * a `_config.yaml` — see groupNodesIntoSections in browse-helpers.ts.
 */
export function generatedGroup(value: string): string | undefined {
  return difficultyLevelFromTag(value) !== undefined ? DIFFICULTY_GROUP : undefined;
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
