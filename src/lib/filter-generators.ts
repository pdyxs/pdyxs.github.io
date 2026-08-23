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
import type { Action } from './card-actions.ts';
import { WHY_AFFORDANCES, WHY_SUPPRESSION_KEYS, deriveWhyTags } from './why-tags.ts';
import {
  EMPTY_EXCLUDE_PLAN,
  isEmptyExcludePlan,
  isVetoed,
  matchesVeto,
  type ExcludePlan,
} from './exclude-tags.ts';

/** The card fields a generator may read. Kept minimal and view-free. */
export type FilterGeneratorCard = {
  date?: Date;
  /**
   * The card's action links, already resolved (see resolveActions in
   * card-actions.ts) — so a generator reads the same list the masthead
   * renders, including the puzzle fields folded in there, rather than
   * reaching for raw frontmatter and re-deriving that fold.
   */
  actions?: Action[];
  /**
   * Content fields this generator reads, keyed by the frontmatter/
   * `_config.yaml` name it declares in `frontmatterKeys`. Populated by
   * getAllCards() (src/lib/cards.ts) as `frontmatter[key] ?? cascade[key]`.
   *
   * Exactly one generator uses this now: the difficulty generator reads a
   * puzzle's `difficulty:`. It is NOT an override of anything — that field
   * feeds four consumers (the ★★★☆☆ meta row, this tag, the panel label, and
   * `what/puzzles`' `sort: difficulty asc`) and the generator is one of them.
   * The two keys that WERE overrides (`location`, `era`) are retired: saying
   * "derive this instead" is now saying it in `tags`.
   */
  overrides?: Record<string, string | undefined>;
  /**
   * The card's parsed `excludeTags` (see exclude-tags.ts). A generator reads
   * only `suppressed`, and only for its own derivation names — it declines its
   * own derivation and can never reach an authored tag. The `vetoes` half is
   * applied once, over the whole generated delta, in generateTagsForCard().
   *
   * Re-enables (`tags: [generated/<name>]`) are already resolved out of
   * `suppressed` before any generator runs, so a re-enabled derivation is
   * simply not suppressed here. There is deliberately no second check inside a
   * generator for one to be sequenced wrongly against.
   */
  exclude?: ExcludePlan;
};

export type FilterGenerator = {
  /**
   * The names this generator's derived tags are attributable to — the
   * `generated/<name>` namespace that `excludeTags` suppresses and a
   * `tags: [generated/<name>]` entry re-enables.
   *
   * A generator may declare SEVERAL. The affordance generator declares
   * `playable` and `buyable` separately, which is what keeps them
   * independently suppressible: a card is routinely one and not the other, so
   * a single `generated/why` would be too blunt to be the thing on offer.
   *
   * This is deliberately its own field rather than the `frontmatterKeys`
   * below. The two used to be one list, which worked only for as long as
   * every derivation happened to have a frontmatter key behind it — retiring
   * `location:` and `era:` (issue #116) broke that coincidence, and the
   * namespace has nothing to do with which fields get read.
   */
  derivations: string[];
  /**
   * Frontmatter/`_config.yaml` field names this generator READS. Only the
   * difficulty generator has one; see the `overrides` note on
   * FilterGeneratorCard for why that is a content field and not an override.
   */
  frontmatterKeys?: string[];
  /** Returns `tags` with this generator's derived tags merged in. */
  apply(tags: string[], card: FilterGeneratorCard): string[];
  /** Every filter value this generator can emit, for the short-code manifest. */
  allValues(): string[];
};

/** This generator's name in the `generated/*` namespace. */
const LOCATION_DERIVATION = 'location';

/**
 * `where:*` location tags derived from the travel log (src/data/travel-log.ts),
 * by matching a card's date against the log's date ranges.
 *
 * There is no "derive this instead" knob. A card that belongs somewhere its
 * date does not say authors the tag and drops the derivation:
 *
 *     tags:
 *       - where/europe/norway/svalbard
 *     excludeTags:
 *       - generated/location
 *
 * Both halves are needed, and the asymmetry is the point: an authored tag ADDS
 * where the retired `location:` key REPLACED. Saying only the first leaves the
 * card in two places at once, which for a post written up a month after the
 * trip is often exactly right. (`location:` was retired in issue #116 along
 * with the `location: none` sentinel that preceded `excludeTags`.)
 *
 * Authored `where:*` tags — including `where:work/*` — are never touched: this
 * generator only ever declines its own derivation, and never reaches the tag
 * list it was handed.
 */
const travelWhereGenerator: FilterGenerator = {
  derivations: [LOCATION_DERIVATION],
  apply(tags, { date, exclude }) {
    if (exclude?.suppressed.has(LOCATION_DERIVATION)) return tags;
    const derived = date ? lookupLocationForDate(date, TRAVEL_LOG) : null;
    return injectWhereTags(tags, derived);
  },
  allValues() {
    return [...new Set(TRAVEL_LOG.map(entry => `where:${entry.location}`))];
  },
};

/** This generator's name in the `generated/*` namespace. */
const ERA_DERIVATION = 'era';

/**
 * `when:<era>/<year>/<month>` tags derived from a card's date via the era
 * timeline (src/data/when-eras.ts). The date/era analogue of the travel
 * generator, and it lost its `era:` override key for the same reason: a card
 * that belongs to an era its date does not say authors `tags: [when/...]` and
 * drops this derivation with `excludeTags: [generated/era]`. A card with no
 * `date` simply gets no derived `when:*` tag.
 */
const dateEraGenerator: FilterGenerator = {
  derivations: [ERA_DERIVATION],
  apply(tags, { date, exclude }) {
    if (exclude?.suppressed.has(ERA_DERIVATION)) return tags;
    const derived = date ? deriveWhenTag(date, WHEN_ERAS) : null;
    if (derived === null || tags.includes(derived)) return tags;
    return [...tags, derived];
  },
  allValues() {
    return enumerateWhenTags(WHEN_ERAS, new Date().getUTCFullYear());
  },
};

/**
 * A puzzle's `difficulty:` frontmatter — read as a CONTENT FIELD, not as an
 * override. It doubles as this generator's `generated/*` name, which is a
 * convenience, not a coupling: the two are separate fields on FilterGenerator.
 *
 * `difficulty:` survived the retirement of `location:`/`era:` because it was
 * never the same kind of thing. Those two existed only to redirect a
 * derivation; this one is authored content with four consumers (the ★★★☆☆ meta
 * row via resolveMetaRows, this filter tag, generatedDisplayName's panel
 * label, and `what/puzzles`' `sort: difficulty asc`). It merely looked like an
 * override because the generator borrowed that plumbing to read it.
 */
const DIFFICULTY_FIELD = 'difficulty';

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
  derivations: [DIFFICULTY_FIELD],
  frontmatterKeys: [DIFFICULTY_FIELD],
  apply(tags, { overrides, exclude }) {
    // Suppressing the TAG leaves the field alone: the stars, the panel label
    // and the folder sort all still read `difficulty:`.
    if (exclude?.suppressed.has(DIFFICULTY_FIELD)) return tags;
    const level = parseDifficultyLevel(overrides?.[DIFFICULTY_FIELD]);
    if (level === undefined) return tags;
    const derived = difficultyTagValue(level);
    return tags.includes(derived) ? tags : [...tags, derived];
  },
  allValues() {
    return Array.from({ length: MAX_DIFFICULTY }, (_, i) => difficultyTagValue(i + 1));
  },
};

/**
 * `why:playable` / `why:buyable` — what a card offers a visitor, derived from
 * its resolved actions. The whole decision lives in why-tags.ts; this is the
 * shell that hands it the card.
 *
 * Two suppression keys rather than one: the affordances are independent facts
 * (a card is routinely playable but not buyable), so `excludeTags` addresses
 * them separately — `generated/playable` leaves `generated/buyable` alone,
 * where a hypothetical `generated/why` could not.
 *
 * The other three `why` values — `why:viewable` and the two `why:learn/*`
 * topics — are authored curation and are not generated at all. Note the
 * `!tags.includes` dedupe below: that is what lets an authored
 * `tags: [why/playable]` stand as the "force it on" knob, so no `always`
 * override needs to exist (issue #116).
 */
const whyAffordanceGenerator: FilterGenerator = {
  derivations: [...WHY_SUPPRESSION_KEYS],
  apply(tags, { actions, exclude }) {
    const derived = deriveWhyTags({ actions }, exclude?.suppressed);
    const missing = derived.filter(tag => !tags.includes(tag));
    return missing.length === 0 ? tags : [...tags, ...missing];
  },
  allValues() {
    return [...WHY_AFFORDANCES];
  },
};

/** The active generators, applied in order. Add new generators here. */
export const FILTER_GENERATORS: FilterGenerator[] = [
  travelWhereGenerator,
  dateEraGenerator,
  puzzleDifficultyGenerator,
  whyAffordanceGenerator,
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

/** What generation produced, plus what it could not act on. */
export type GeneratedTags = {
  /** The card's tag list with every generator's tags merged in and vetoes applied. */
  tags: string[];
  /**
   * `excludeTags` entries that removed nothing — the `inert-derivation-control` audit
   * finding. The value form is the half that can stop matching silently (shift
   * a travel-log range and `where/europe/norway` quietly vetoes nothing), and
   * the generator form can go inert too when the derivation it suppresses had
   * nothing to say. Reported in the authored form, so it can be found in the
   * file it was written in.
   */
  inert: string[];
};

/**
 * Runs every generator over a card's tags, applies its `excludeTags`, and
 * reports any exclusion that turned out to be inert.
 *
 * The value-form veto is applied to the generated DELTA — the tags the
 * generators added — never to `tags` itself. So an authored tag is unvetoable
 * by construction: you write the tag or you write the veto, and the two can
 * never contradict each other. The generator form is already handled inside
 * each generator, at the point it decides.
 */
export function generateTagsForCard(
  tags: string[],
  card: FilterGeneratorCard,
): GeneratedTags {
  const plan = card.exclude ?? EMPTY_EXCLUDE_PLAN;
  const proposed = FILTER_GENERATORS.reduce((acc, gen) => gen.apply(acc, card), tags);

  if (isEmptyExcludePlan(plan)) return { tags: proposed, inert: [] };

  const base = new Set(tags);
  // Order-preserving: a base tag is always kept, a generated one only if no
  // veto catches it.
  const kept = proposed.filter(tag => base.has(tag) || !isVetoed(tag, plan));

  return { tags: kept, inert: inertExclusions(tags, card, plan, proposed) };
}

/**
 * Which of this card's exclusions removed nothing.
 *
 * The value form is a straight question — did any veto catch a generated tag?
 * The generator form has to be asked backwards: a suppressed generator emits
 * nothing, so "did it matter?" means re-running that one generator unsuppressed
 * and seeing whether it would have added anything. That costs one extra pass
 * per generator-form entry, on the handful of cards that carry one.
 */
function inertExclusions(
  tags: string[],
  card: FilterGeneratorCard,
  plan: ExcludePlan,
  proposed: string[],
): string[] {
  const inert: string[] = [];

  for (const key of plan.suppressed) {
    const without: ExcludePlan = {
      suppressed: new Set([...plan.suppressed].filter(k => k !== key)),
      vetoes: plan.vetoes,
    };
    const unsuppressed = FILTER_GENERATORS.reduce(
      (acc, gen) => gen.apply(acc, { ...card, exclude: without }),
      tags,
    );
    if (unsuppressed.length === proposed.length) inert.push(`generated/${key}`);
  }

  for (const veto of plan.vetoes) {
    const base = new Set(tags);
    const caught = proposed.some(tag => !base.has(tag) && matchesVeto(tag, veto));
    if (!caught) inert.push(veto);
  }

  return inert;
}

/** Runs every generator over a card's tags, returning the augmented list. */
export function generatedTagsForCard(tags: string[], card: FilterGeneratorCard): string[] {
  return generateTagsForCard(tags, card).tags;
}

/**
 * Every legal name in the `generated/*` namespace — what `excludeTags` may
 * suppress and what `tags: [generated/<name>]` may re-enable. The closed set
 * that makes a typo in either a build error.
 */
export function generatorDerivations(): string[] {
  return [...new Set(FILTER_GENERATORS.flatMap(gen => gen.derivations))];
}

/**
 * The union of every frontmatter/`_config.yaml` field any generator READS (for
 * the cascade + card plumbing). Just `difficulty` now — see DIFFICULTY_FIELD.
 */
export function generatorFrontmatterKeys(): string[] {
  return [...new Set(FILTER_GENERATORS.flatMap(gen => gen.frontmatterKeys ?? []))];
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
