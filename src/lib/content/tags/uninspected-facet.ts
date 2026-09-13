// Dev-only `why:uninspected` filter — lets Paul narrow the read-through
// worklist by other dimensions at the same time ("uninspected puzzles",
// "uninspected posts from 2019"), which the audit lens's flat list can't do.
//
// Deliberately NOT a FilterGenerator (see filter-generators.ts): a generator's
// value is enumerated by allValues() for the stack-manifest build, and this
// value must never receive a manifest short code — the manifest is
// append-only forever, so a code assigned during a dev run could never be
// withdrawn once a build shipped it (the same reasoning src/dimensions/status.ts
// already states for the dev-only status dimension). Kept as a standalone
// pure step instead, called directly by resolveCard() and gated on isDev at
// both ends: the tag is only ever added to a card in dev, and the panel only
// ever declares the value in dev — production never carries it, never shows
// it, and never allocates a code for it.
export const UNINSPECTED_TAG = 'why:uninspected';

/**
 * Appends `why:uninspected` when the card hasn't been marked inspected AND
 * we're in a dev build. Absent `inspected` counts the same as `false` — a
 * card that never got the backfill still needs a look, same rule the
 * `not-inspected` audit finding already applies (audit.ts).
 */
export function withUninspectedTag(tags: string[], inspected: boolean | undefined, isDev: boolean): string[] {
  if (!isDev || inspected === true) return tags;
  return [...tags, UNINSPECTED_TAG];
}
