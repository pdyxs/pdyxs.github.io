// Publish-lifecycle `status` field — the tracer bullet for the whole
// draft/published/scheduled/unlisted/archived pipeline (issue #46).
//
// computeStatusVisibility is the single source of the visibility rules. Two
// thin appliers consume its output:
//   - the listing filter: the card pool lenses/browse/timeline draw from
//     (LensStackCard.astro filters getAllCards() on `.listed`)
//   - the reachability filter: getStaticPaths (card/[...path].astro and its
//     fragment counterpart filter getAllCards() on `.reachable`)
//
// This module must stay pure (no IO, no Astro, no mutable reads) so it's
// testable in isolation and so future slices (#47 unlisted/archived, #48
// scheduled) can extend it without touching its callers' plumbing.

/** All five publish-lifecycle values. The schema enum includes every one of
 * these even though this slice (#46) only enforces `draft`/`published` —
 * later issues add enforcement for the rest without needing a schema change. */
export const STATUS_VALUES = ['draft', 'published', 'scheduled', 'unlisted', 'archived'] as const;

export type StatusValue = typeof STATUS_VALUES[number];

/** Narrows an arbitrary value (e.g. a raw `_config.yaml` string) to a known StatusValue. */
export function isStatusValue(value: unknown): value is StatusValue {
  return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value);
}

export type StatusVisibility = {
  /** Whether the card appears in the listing pool (lenses/browse/timeline). */
  listed: boolean;
  /** Whether the card has a working URL (included in getStaticPaths). */
  reachable: boolean;
};

export type StatusVisibilityOptions = {
  /** import.meta.env.DEV — bypasses every rule below so the dev/preview server always sees everything. */
  isDev: boolean;
  /** Caller-supplied clock, kept explicit (not read internally) so this stays pure/testable. */
  now: Date;
};

/**
 * Resolves a card's listing/reachability visibility from its `status`
 * (absent means `published`) and `date`. This slice (#46) enforces `draft`
 * (neither listed nor reachable) and `published` (both). `scheduled`,
 * `unlisted`, and `archived` fall through to the published default until
 * #47/#48 add their own enforcement — `date`/`now` are already threaded
 * through for that future `scheduled` gating.
 */
export function computeStatusVisibility(
  status: StatusValue | undefined,
  date: Date | undefined,
  { isDev, now }: StatusVisibilityOptions
): StatusVisibility {
  if (isDev) return { listed: true, reachable: true };

  const resolved = status ?? 'published';
  if (resolved === 'draft') return { listed: false, reachable: false };

  return { listed: true, reachable: true };
}
