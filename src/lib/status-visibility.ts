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
// testable in isolation and so future slices can extend it without touching
// its callers' plumbing.

/** All five publish-lifecycle values. The schema enum includes every one of
 * these even though enforcement lands incrementally — #46 added `draft`/
 * `published`, #48 added `scheduled`; later issues add the rest without
 * needing a schema change. */
export const STATUS_VALUES = ['draft', 'published', 'scheduled', 'unlisted', 'archived'] as const;

export type StatusValue = typeof STATUS_VALUES[number];

/** Narrows an arbitrary value (e.g. a raw `_config.yaml` string) to a known StatusValue. */
export function isStatusValue(value: unknown): value is StatusValue {
  return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * Resolves a card's effective status: its own frontmatter value wins, else
 * the nearest-ancestor `_config.yaml` cascade value, else the `published`
 * default. This is the same precedence getAllCards() (src/lib/cards.ts)
 * applies inline — shared here so the tag-manifest generator (a plain Node
 * script that walks the filesystem directly rather than going through
 * getAllCards(), see scripts/generate-stack-manifest.mjs) resolves status
 * identically instead of re-deriving its own copy of this rule.
 */
export function resolveStatus(rawStatus: unknown, cascadeStatus: string | undefined): StatusValue {
  if (isStatusValue(rawStatus)) return rawStatus;
  if (isStatusValue(cascadeStatus)) return cascadeStatus;
  return 'published';
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
 * (absent means `published`) and `date`. Enforces the finished-content
 * states: `draft` (neither listed nor reachable), `unlisted` (reachable but
 * not listed — still renders at its URL, absent from every listing),
 * `archived` (neither listed nor reachable — 404s, no static path at all),
 * `scheduled` (hidden until its `date` is reached via a build-time
 * comparison against `now`, then behaves exactly as `published`), and
 * `published` (both). Every rule is bypassed to
 * `{listed: true, reachable: true}` when `isDev`, so the dev/preview server
 * always shows everything regardless of status.
 */
export function computeStatusVisibility(
  status: StatusValue | undefined,
  date: Date | undefined,
  { isDev, now }: StatusVisibilityOptions
): StatusVisibility {
  if (isDev) return { listed: true, reachable: true };

  const resolved = status ?? 'published';
  if (resolved === 'draft') return { listed: false, reachable: false };
  if (resolved === 'unlisted') return { listed: false, reachable: true };
  if (resolved === 'archived') return { listed: false, reachable: false };

  if (resolved === 'scheduled') {
    const reached = date !== undefined && date.getTime() <= now.getTime();
    if (!reached) return { listed: false, reachable: false };
  }

  return { listed: true, reachable: true };
}
