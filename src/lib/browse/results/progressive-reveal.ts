// Progressive reveal for a long browse grid (issue #81, decided in #68).
//
// Most* Interesting is uncapped — it is the archive, and the whole point of it
// is that card 200 of 264 is reachable — so the list can't be truncated the way
// Newest/Oldest are. Instead it is revealed in steps: the grid renders a leading
// slice, and a sentinel below it asks for the next step *early*, so a reader
// scrolling down never arrives at an end.
//
// **This is not virtualisation.** Reveal only ever appends; nothing is removed
// on scroll. Windowing would want `contain: paint` / `will-change: transform`
// on the scroll container, and per CLAUDE.md either of those re-anchors every
// dithered surface inside it and brings the shimmer back. Thumbnails are
// already `loading="lazy"`, so what reveal buys is DOM weight and fetch pacing,
// not first-paint bytes.
//
// Pure: the decisions live here, the observer and the button live in
// BrowseResults.svelte.

/** Cards revealed initially, and per step, when a lens declares nothing. */
export const DEFAULT_REVEAL_STEP = 24;

/**
 * How far *outside* the viewport the sentinel counts as visible.
 *
 * Deliberately generous: the sentinel must trip well before the reader reaches
 * the last row, or the reveal reads as a stall rather than as a list that
 * simply keeps going. One step is roughly eight rows of a 3-up grid, so 800px
 * of lead is about a third of a step.
 */
export const REVEAL_ROOT_MARGIN = '800px 0px';

export type RevealSettings = {
  /** How many cards the first (and server) render shows. */
  initial: number;
  /** How many more each reveal adds. */
  step: number;
};

/**
 * A lens's reveal settings, or null when the lens opts out.
 *
 * `reveal: false` disables it (the whole set renders at once); a number sets
 * both the initial slice and the step. Absent means the default — reveal is ON
 * for every grid lens rather than opted into one at a time, which is what makes
 * a short result set cost nothing (nothing is hidden, so no sentinel and no
 * button ever render) and a long one behave the same everywhere.
 */
export function revealSettings(config?: Record<string, unknown>): RevealSettings | null {
  const declared = config?.reveal;
  if (declared === false) return null;
  if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) {
    return { initial: declared, step: declared };
  }
  return { initial: DEFAULT_REVEAL_STEP, step: DEFAULT_REVEAL_STEP };
}

/**
 * How many cards are revealed after `steps` steps beyond the initial slice.
 *
 * Counted in STEPS rather than carried as a running card count, because the
 * component's state has to survive a server render that never runs an effect:
 * a card count would have to be seeded from the settings prop, and step zero
 * needs no seeding at all. `Math.max(1, step)` is the deadlock guard — a step
 * of zero would leave the sentinel asking for more forever and never getting
 * any.
 */
export function revealedAfter(settings: RevealSettings, steps: number, total: number): number {
  return Math.min(total, settings.initial + Math.max(0, steps) * Math.max(1, settings.step));
}

export type RevealStatus = {
  /** Cards actually rendered. */
  shown: number;
  /** Cards still held back. */
  remaining: number;
  /** Whether anything is left to reveal. */
  more: boolean;
};

/** What the current reveal position amounts to, clamped against the real set. */
export function revealStatus(total: number, revealed: number): RevealStatus {
  const shown = Math.min(total, Math.max(0, revealed));
  const remaining = total - shown;
  return { shown, remaining, more: remaining > 0 };
}

/**
 * The fallback button's label.
 *
 * States the size of the *next* step, not the whole remainder — the button is
 * one press of the same reveal the sentinel performs, and promising "show 240
 * more" would be a different (and much heavier) action than the one it takes.
 */
export function revealButtonLabel(remaining: number, step: number): string {
  return `Show ${Math.min(Math.max(1, step), Math.max(0, remaining))} more`;
}
