// `excludeTags` — the one way a card (or a folder) says "not this tag".
//
// It replaced five ad-hoc knobs that all meant the same thing (issue #116):
// `location: none`, `era: none`, and `playable`/`viewable`/`buyable: never`.
// Each generator had grown its own sentinel, none of them generalised, and
// the affordance trio had to exist in triplicate because the values are
// independent facts.
//
// Two forms live in the one list, and they answer different questions:
//
//   excludeTags:
//     - why/playable          # this value, whoever proposed it
//     - generated/location    # whatever the location derivation proposed
//
// The GENERATOR form is the robust one: the author says "no location" without
// needing to know what the travel log currently derives, so shifting a
// travel-log date range can never silently un-suppress the card. The VALUE
// form is the general one: it subtracts a value without caring which
// generator proposed it, and prefix-matches, so `where/europe` drops any
// European derivation.
//
// The generator form is keyed on the DERIVATION NAME, not on the generator —
// `generated/why` would kill `playable` and `buyable` together, and those are
// exactly the two facts a card is routinely one of but not both.
// `generatorDerivations()` enumerates the legal set, so a mistyped
// `generated/*` entry is a build error rather than the silent no-op that a
// suppression knob failing open would otherwise be.
//
// The same reserved namespace runs the other way in `tags`. A folder can
// exclude a derivation for everything under it, and one card can take that
// back:
//
//   tags:
//     - generated/location    # re-enable what the folder excluded
//
// A re-enable WINS over an exclusion, wherever each was declared. That is the
// only rule that makes the escape hatch work: exclusions accumulate down the
// cascade, so if the nearer declaration won, a card could never undo an
// inherited one — which is the whole case the form exists for. Re-enables are
// resolved out of the suppression set BEFORE any generator runs, so a
// re-enabled derivation is simply not suppressed and no generator has a second
// check to sequence wrongly.
//
// A `generated/*` entry in `tags` is STRIPPED once read. It is a directive,
// not a tag: left in, `generated:location` would reach the filter panel, the
// short-code manifest and the card's own rendered chips.
//
// Pure: every function takes plain data and returns plain data.
//
// Explicit .ts extensions: reached from filter-generators.ts, which Node build
// scripts load via type stripping (no extension resolution).

import { normaliseAuthoredTag } from './five-w.ts';

/**
 * Reserved first tag segment marking the generator form.
 *
 * `generated` is deliberately NOT a dimension, so `normaliseAuthoredTag` would
 * pass `generated/location` straight through as an ordinary dimensionless tag.
 * That is why these entries are intercepted *before* normalisation rather than
 * after — making `excludeTags` the fourth call site on the authored →
 * canonical tag boundary (see five-w.ts).
 */
export const GENERATED_EXCLUDE_PREFIX = 'generated/';

/** A parsed `excludeTags` list, split into the two forms. */
export type ExcludePlan = {
  /**
   * Generator override keys whose derivation is suppressed. Each generator
   * consults this at exactly the point it used to check its own sentinel, so a
   * generator can only ever decline its OWN derivation — it cannot reach an
   * authored tag. That is what preserves the standing ruling that suppressing
   * a derived `where:*` leaves an authored `where:work/*` in place.
   */
  suppressed: ReadonlySet<string>;
  /**
   * Canonical tag values to veto from the generated delta, prefix-matching on
   * segment boundaries. Applied after every generator has run.
   */
  vetoes: readonly string[];
};

/** An `excludeTags` list that excludes nothing — the common case. */
export const EMPTY_EXCLUDE_PLAN: ExcludePlan = {
  suppressed: new Set<string>(),
  vetoes: [],
};

/** True when this plan can never remove anything, so callers can skip the work. */
export function isEmptyExcludePlan(plan: ExcludePlan): boolean {
  return plan.suppressed.size === 0 && plan.vetoes.length === 0;
}

/** True for the `generated/<key>` form. */
export function isGeneratorEntry(entry: string): boolean {
  return entry.startsWith(GENERATED_EXCLUDE_PREFIX);
}

/** The override key a `generated/<key>` entry names (`''` when it names nothing). */
export function generatorEntryKey(entry: string): string {
  return entry.slice(GENERATED_EXCLUDE_PREFIX.length);
}

/**
 * Split an authored `excludeTags` list into the two forms.
 *
 * Throws on a `generated/*` entry naming a key no generator declares. This is
 * the whole reason the generator form is a closed set: a suppression knob that
 * fails open is invisible — the card simply keeps a tag the author asked to
 * drop, and nothing anywhere says so. A build error is the only honest
 * failure mode. (The value form cannot be validated this way — any tag value
 * is legal to name — which is what the `inert-derivation-control` audit finding is
 * for.)
 *
 * @param entries    - authored entries, in Obsidian's slash form
 * @param legalKeys  - every derivation name; see generatorDerivations()
 */
export function parseExcludeTags(
  entries: readonly string[],
  legalKeys: readonly string[],
  context?: string,
): ExcludePlan {
  const suppressed = new Set<string>();
  const vetoes: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (isGeneratorEntry(trimmed)) {
      const key = generatorEntryKey(trimmed);
      if (!legalKeys.includes(key)) {
        const where = context ? ` on ${context}` : '';
        throw new Error(
          `excludeTags${where}: "${trimmed}" names no generated derivation. ` +
            `Legal names are: ${[...legalKeys].sort().join(', ')}. ` +
            `(To exclude a tag value instead, write it in the ordinary slash ` +
            `form, e.g. "why/playable".)`,
        );
      }
      suppressed.add(key);
      continue;
    }

    // Value form: same authored → canonical normalisation the `tags` field
    // gets, so an exclusion is written exactly the way the tag itself is.
    vetoes.push(normaliseAuthoredTag(trimmed));
  }

  return { suppressed, vetoes };
}

/**
 * True when `tag` is caught by `veto`, matching on segment boundaries.
 *
 * Prefix rather than equality so `where/europe` drops any European
 * derivation. Exact match would be sufficient for today's generators —
 * `injectWhereTags` appends one tag and does not inject ancestors, which are
 * synthesised later in buildTagHierarchy — so this is the useful superset,
 * not a correctness fix.
 *
 * Segment-boundary anchored: `where:europe` must not catch a hypothetical
 * `where:europe-central`.
 */
export function matchesVeto(tag: string, veto: string): boolean {
  return tag === veto || tag.startsWith(`${veto}/`);
}

/** True when any veto in the plan catches this tag. */
export function isVetoed(tag: string, plan: ExcludePlan): boolean {
  return plan.vetoes.some(veto => matchesVeto(tag, veto));
}

/**
 * Split a card's tag list into its `generated/<name>` re-enables and the tags
 * that are actually tags.
 *
 * Validated and stripped in one pass, both deliberately. Validated because a
 * re-enable is exactly as invisible as a suppression when it fails open — the
 * card silently keeps whatever a folder excluded, with nothing saying why.
 * Stripped because `generated/*` is a directive, not a tag: it names no filter
 * value, has no `.tag.yaml`, and would otherwise ride into the panel, the
 * manifest and the card's rendered chips as a nonsense value.
 *
 * @param tags       - merged tag list, still in authored form for `generated/*`
 * @param legalKeys  - every derivation name; see generatorDerivations()
 * @param context    - optional label (a uid) for the error message
 */
export function partitionGeneratedTags(
  tags: readonly string[],
  legalKeys: readonly string[],
  context?: string,
): { tags: string[]; reEnabled: Set<string> } {
  const kept: string[] = [];
  const reEnabled = new Set<string>();

  for (const tag of tags) {
    if (!isGeneratorEntry(tag)) {
      kept.push(tag);
      continue;
    }
    const key = generatorEntryKey(tag);
    if (!legalKeys.includes(key)) {
      const where = context ? ` on ${context}` : '';
      throw new Error(
        `tags${where}: "${tag}" names no generated derivation. ` +
          `Legal names are: ${[...legalKeys].sort().join(', ')}. ` +
          `(A "generated/" tag re-enables a derivation an ancestor _config.yaml ` +
          `excluded; it is not itself a filter value.)`,
      );
    }
    reEnabled.add(key);
  }

  return { tags: kept, reEnabled };
}

/**
 * The plan a card actually runs under: its exclusions, less anything a
 * `generated/*` tag re-enabled.
 *
 * Re-enable beats exclude — see the module comment. Doing it here, once,
 * before any generator runs, is what keeps the two from being sequenced
 * against each other inside a generator's `apply`.
 */
export function applyReEnables(plan: ExcludePlan, reEnabled: ReadonlySet<string>): ExcludePlan {
  if (reEnabled.size === 0 || plan.suppressed.size === 0) return plan;
  return {
    suppressed: new Set([...plan.suppressed].filter(key => !reEnabled.has(key))),
    vetoes: plan.vetoes,
  };
}
