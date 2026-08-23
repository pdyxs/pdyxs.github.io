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
