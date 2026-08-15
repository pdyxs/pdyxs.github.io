// Pure decisions for a lens that browses as a CardStrip timeline rather than
// as the wrapping browse grid (Newest and Oldest — issue #82, decided in #68).
//
// Two things are decided here: whether a lens's `config` asks for the strip at
// all, and what the terminal tile that closes a capped run should say and where
// it should send you. The components below (BrowseLensBrowser -> BrowseResults
// -> CardStrip) only apply the result.

import { lensUid } from './lens-registry';

/**
 * Whether a lens's registry `config` asks for the strip layout.
 *
 * A separate key from `presentation` (which is about the lens's own chrome —
 * card vs fullbleed) and from `limit` (which any lens may carry): the strip is
 * how the results are laid out, and nothing else about the lens changes.
 */
export function isStripLens(config?: Record<string, unknown>): boolean {
  return config?.display === 'strip';
}

/** The tile that closes a capped run — see stripTerminal(). */
export type StripTerminal = {
  /** Visible text, stating the true match count. */
  label: string;
  /** Lens uid to swap the current lens for ("lens/<id>"). */
  uid: string;
  /** Serialised filter params carried across the swap. */
  params: string;
};

/**
 * The terminal tile for a run of `renderedCount` cards out of `totalCount`
 * matches, or null when there shouldn't be one.
 *
 * The tile — not a faded edge — is the affordance. A fade reads as
 * "scrollable", which the strip already is, and it cannot distinguish "you have
 * seen all 12" from "this is 30 of 154"; only the tile is keyboard-reachable
 * and states the real number. That number is the *match* count, never the
 * rendered one, which is the same distinction BrowseResults' count line draws
 * with its `totalCount` prop.
 *
 * Null when nothing is hidden (the run is the whole set) or when no archive
 * lens exists to hand off to — see archiveLensId().
 */
export function stripTerminal(
  totalCount: number,
  renderedCount: number,
  params: string,
  archiveId: string | null,
): StripTerminal | null {
  if (!archiveId) return null;
  if (totalCount <= renderedCount) return null;
  return { label: `See all ${totalCount} →`, uid: lensUid(archiveId), params };
}
