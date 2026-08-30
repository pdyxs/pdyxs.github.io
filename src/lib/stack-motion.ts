// Motion policy for the card stack (issue #110): the two decisions that say
// *how* a navigation moves, kept out of the applier so they can be swept in a
// test instead of observed in a browser.
//
// Both are about the same user preference from opposite directions, and they
// deliberately read different sources — see `transitionWillFire`.

/** Scroll animation for one navigation. */
export type StackScrollBehaviour = 'auto' | 'smooth';

/**
 * Smooth for a navigation, instant for a rebuild.
 *
 * A *rebuild* is a cold load or a popstate: the whole stack is reconstructed
 * and its entries arrive one fetch at a time, each one moving the active card
 * further down as it is spliced in ahead of it. Smoothing those reads as the
 * page fighting itself — and on first paint a smooth scroll races the browser's
 * own scroll restoration and loses visibly. A *navigation* is a push, a close
 * or a re-activation: one deliberate move, which is exactly what smooth is for.
 *
 * Reduced motion collapses the distinction, because the whole point of the
 * preference is that nothing travels.
 */
export function scrollBehaviourFor(
  rebuilding: boolean,
  reducedMotion: boolean,
): StackScrollBehaviour {
  return rebuilding || reducedMotion ? 'auto' : 'smooth';
}

/**
 * Whether a `transitionend` can be expected for a computed `transition-duration`.
 *
 * This is the hazard `transition-wait.ts` left for this slice. A transition
 * whose computed duration is zero starts nothing and fires no event, so a
 * caller that awaits one stalls for the whole of its fallback instead of being
 * caught by it. Reduced motion is the reason that became reachable — the
 * `prefers-reduced-motion` block zeroes `--stack-motion-ms` and the body
 * collapse with it.
 *
 * It reads the COMPUTED STYLE rather than `matchMedia('(prefers-reduced-motion)')`
 * on purpose, and the distinction is not pedantry: the caller's real question is
 * "will an event arrive?", which is a property of the resolved CSS. A duration
 * can be zero for reasons that have nothing to do with the preference — a rule
 * added later, a breakpoint, a print stylesheet — and every one of them would
 * reintroduce the stall in a version that asked the preference instead.
 *
 * `transition-duration` is a LIST when several properties are transitioned, so
 * any non-zero entry means something will fire. Values arrive normalised to
 * seconds by `getComputedStyle` (`"0s"`, `"0.3s"`), but `ms` is parsed too
 * rather than trusting that normalisation.
 */
export function transitionWillFire(computedDuration: string | null | undefined): boolean {
  if (!computedDuration) return false;
  return computedDuration
    .split(',')
    .some(part => {
      const raw = part.trim();
      const value = parseFloat(raw);
      if (!Number.isFinite(value)) return false;
      return value > 0;
    });
}

/**
 * How long to keep waiting for the layout to stop moving before aiming anyway.
 *
 * Generous against the 450ms body collapse it exists for — twice it, which is
 * the ratio to preserve if `--stack-body-ms` moves again — because the cost of
 * the two errors is not symmetric: aiming a frame late is invisible, while
 * aiming early lands the visitor inside the card with its header off-screen —
 * which is the whole bug. Bounded at all only because a page whose height never
 * settles (a slow image above the fold) must not leave the scroll unaimed.
 *
 * Multiplied by `--stack-motion-scale` at the call site, so slowing the stack
 * down to watch it does not make this fire mid-collapse.
 */
export const SCROLL_SETTLE_TIMEOUT_MS = 900;

/**
 * Frames to watch before "nothing moved" is allowed to mean "nothing is going
 * to move".
 *
 * Counted in FRAMES, not milliseconds, because what is being waited for is
 * frame-driven: a class toggle needs a style flush and a frame before the
 * transition it starts exists to be observed. Measured on the real page, the
 * card's node appears, its offset reads identical on the next two frames, and
 * only on the third does the collapse begin — so two samples of "stable" is
 * exactly the wrong number to trust. Four frames is ~64ms at 60Hz, which is
 * three times the gap and imperceptible against a scroll that takes 450ms.
 */
export const SCROLL_SETTLE_MIN_FRAMES = 4;

/** What the settle loop should do with the measurement it just took. */
export type ScrollSettleAction = 'wait' | 'aim';

export interface ScrollSettleInput {
  /** Document offset measured on the previous frame; null on the first. */
  previousOffset: number | null;
  /** Document offset measured now. */
  currentOffset: number;
  /** Whether a layout-affecting transition is running inside the stack. */
  animating: boolean;
  /** Frames measured so far, including this one. */
  framesSeen: number;
  elapsedMs: number;
  minFrames?: number;
  timeoutMs?: number;
}

/**
 * Whether the layout that determines the scroll target has stopped moving.
 *
 * This is the mobile half of the crop-vs-reflow asymmetry, arriving in the
 * scroll owner (issue #110 follow-up). On DESKTOP a collapse is a crop: no
 * height changes, so the target measured the instant the store moves is already
 * final. On MOBILE it is a reflow: the outgoing card's body animates `1fr` to
 * `0fr` over 450ms, and everything below it — including the card being
 * navigated to — travels up by the whole of that body. Aimed at the first
 * measurement, a push out of a long lens aimed at a 12089px document and landed
 * in a 2314px one, with the header ~800px above the viewport.
 *
 * Three tests, and each covers a hole in the others:
 *
 * - **`animating`** carries the whole collapse. It is the honest question —
 *   "is the layout still moving?" — and it is breakpoint-free without asking
 *   about breakpoints: desktop never changes `grid-template-rows`, so no
 *   transition is created there and nothing is waited for.
 * - **`minFrames`** covers the gap BEFORE that transition exists. This is the
 *   trap: the offset reads identical on the two frames after the card mounts,
 *   so a stability test alone reports "settled" at the one moment everything is
 *   about to move.
 * - **offset stability** catches what neither sees — a late image, a fragment
 *   landing above the active card — none of which is a transition at all.
 *
 * Document offset, not `getBoundingClientRect().top`: the browser clamps
 * `scrollY` as the page shrinks and a smooth scroll is animating it, so a
 * viewport-relative reading changes for reasons that are not the layout
 * settling and never comes to rest.
 */
export function scrollSettleAction({
  previousOffset,
  currentOffset,
  animating,
  framesSeen,
  elapsedMs,
  minFrames = SCROLL_SETTLE_MIN_FRAMES,
  timeoutMs = SCROLL_SETTLE_TIMEOUT_MS,
}: ScrollSettleInput): ScrollSettleAction {
  if (elapsedMs >= timeoutMs) return 'aim';
  if (animating) return 'wait';
  if (framesSeen < minFrames) return 'wait';
  if (previousOffset === null) return 'wait';
  return previousOffset === currentOffset ? 'aim' : 'wait';
}
