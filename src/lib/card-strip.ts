// Pure decisions for the horizontal card strip (CardStrip.svelte).
//
// The component only measures the scroller and applies the result; what those
// measurements *mean* is decided here, so it's testable without a layout engine.

export type StripMetrics = {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
};

export type StripOverflow = {
  /** Content is clipped to the left — the "back" control is live. */
  canScrollBack: boolean;
  /** Content is clipped to the right — the "forward" control is live. */
  canScrollOn: boolean;
};

// A pixel of slack. scrollLeft and the width sums are fractional at most zoom
// levels and device pixel ratios, so an exact comparison leaves the forward
// control live by a hair's breadth at the very end of the strip.
const EPSILON = 1;

/**
 * Whether either end of the strip is clipped.
 *
 * Derived from measurements rather than card counts on purpose: how many cards
 * fit depends on the rendered card width, which varies with the lens width and
 * the viewport. Counting would be a guess.
 */
export function computeStripOverflow(metrics: StripMetrics): StripOverflow {
  const { scrollLeft, scrollWidth, clientWidth } = metrics;
  return {
    canScrollBack: scrollLeft > EPSILON,
    canScrollOn: scrollLeft + clientWidth < scrollWidth - EPSILON,
  };
}

/** Minimum paging step, for a strip narrower than one card. */
const MIN_STEP = 200;
/** Fraction of the viewport to advance, leaving the edge card partly in view. */
const STEP_RATIO = 0.8;

/**
 * How far one press of a control should scroll.
 *
 * Just under a full viewport, so the card at the edge stays partly visible and
 * the eye keeps its place instead of jumping to an entirely new set.
 */
export function stripScrollStep(clientWidth: number): number {
  return Math.max(clientWidth * STEP_RATIO, MIN_STEP);
}

// ---------------------------------------------------------------------------
// Custom scrollbar
//
// The native scrollbar is hidden and replaced by a track between the two arrow
// controls, so it can be tall enough to hit comfortably and can carry a dot per
// card behind it.
//
// Everything below works in ONE coordinate space: a percentage of scrollWidth.
// That is what makes the thumb and the dots agree — a dot falls under the thumb
// exactly when its card is in view. The usual scrollbar mapping (which spreads
// the thumb's travel over `trackWidth - thumbWidth` and clamps a minimum thumb
// size) would break that alignment, so it is deliberately not used.
// ---------------------------------------------------------------------------

/** A card's horizontal extent within the scroller's content box, in pixels. */
export type CardExtent = { start: number; end: number };

export type ThumbGeometry = {
  /** Left edge as a percentage of the track. */
  leftPct: number;
  /** Width as a percentage of the track. */
  widthPct: number;
};

/**
 * The thumb's position and size — the viewport expressed as a fraction of the
 * scrollable content.
 *
 * At maximum scroll `scrollLeft + clientWidth === scrollWidth`, so left+width
 * lands exactly on 100 with no special-casing.
 */
export function computeThumbGeometry(metrics: StripMetrics): ThumbGeometry {
  const { scrollLeft, scrollWidth, clientWidth } = metrics;
  if (scrollWidth <= 0) return { leftPct: 0, widthPct: 100 };
  const widthPct = Math.min(100, (clientWidth / scrollWidth) * 100);
  const leftPct = clamp((scrollLeft / scrollWidth) * 100, 0, 100 - widthPct);
  return { leftPct, widthPct };
}

export type StripDot = {
  /** Centre of the card, as a percentage of the track. */
  leftPct: number;
};

/**
 * One dot per card, placed at the card's centre.
 *
 * Position only — a dot carries no visible/hidden state. Which cards are in
 * view is shown by the thumb passing over their dots, and the dot itself is
 * drawn to read against both surfaces (an ink disc inside a paper ring), so
 * nothing needs to change appearance. An earlier version flipped a dot's colour
 * when its card was in view, which broke on the common case of a card that is
 * only *partly* in view: it counts as visible while its centre — and so its dot
 * — is still outside the thumb, leaving the dot painted to match a surface it
 * wasn't on, and invisible.
 */
export function computeStripDots(cards: CardExtent[], metrics: StripMetrics): StripDot[] {
  const { scrollWidth } = metrics;
  if (scrollWidth <= 0) return [];
  return cards.map(({ start, end }) => ({
    leftPct: clamp(((start + end) / 2 / scrollWidth) * 100, 0, 100),
  }));
}

/**
 * Where to scroll when the track is clicked or the thumb dragged to `fraction`
 * (0–1 of the track's width). Clamped so a drag past either end parks at the
 * end rather than overshooting.
 */
export function scrollLeftForFraction(
  fraction: number,
  metrics: Pick<StripMetrics, 'scrollWidth' | 'clientWidth'>,
): number {
  const { scrollWidth, clientWidth } = metrics;
  return clamp(fraction * scrollWidth, 0, Math.max(0, scrollWidth - clientWidth));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
