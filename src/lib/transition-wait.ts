// Waiting for a CSS transition to finish, with a fallback that cannot fight it
// (issue #104).
//
// One function, and it exists mostly so there is only one. The shape it
// replaces — an inline `new Promise` with an `addEventListener` and a bare
// `setTimeout(resolve, n)` beside it — is the kind of thing that gets copied to
// the next call site rather than reused, and every copy has to remember both
// halves of the cleanup independently:
//
//   - the timeout must be CLEARED when the event wins, or a slow transition
//     resolves the promise a second time and leaves a timer pending;
//   - the listener must be REMOVED when the timeout wins, or it outlives the
//     wait attached to an element the caller has moved on from.
//
// Neither is observable through the promise (a settled promise ignores a second
// resolve), which is exactly why it stayed wrong: the bug has no symptom, only
// a leak. Settling once, here, means no call site has to think about it.
//
// This is an effect, not a decision — there is no pure half to extract, only
// DOM plumbing to get right once. It lives in `src/lib` on the same terms as
// `card-fragments.ts`: framework-agnostic, importable, testable without Svelte.

/**
 * Resolves when `el` finishes transitioning `property`, or after `fallbackMs`,
 * whichever happens first. Whichever loses is torn down.
 *
 * `property` is matched, not counted. A transition fires one `transitionend`
 * per property, and the global reset in `global.css` transitions `color`,
 * `background-color` and `border-color` on *every* element — so an unfiltered
 * listener resolves on whichever of those happens to land first, which is not
 * the transition the caller is waiting for.
 *
 * The fallback is a safety net for the cases where no event ever arrives: a
 * transition that never starts because the value did not really change, an
 * element removed mid-flight, or a browser that declines to animate the
 * property at all. It is not a floor — the event resolves early and the timer
 * is cleared.
 *
 * NOTE for whoever lands the reduced-motion half of #110: a transition whose
 * computed duration is zero starts no transition and fires no event, so forcing
 * `--stack-motion-ms: 0` (or zeroing this transition) would turn the fallback
 * from a net into a mandatory stall of `fallbackMs`. If that lands, the caller
 * should skip the wait outright rather than lengthen it here.
 */
export function waitForTransition(
  el: HTMLElement,
  property: string,
  fallbackMs: number,
): Promise<void> {
  return new Promise<void>(resolve => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Declared as hoisted functions because the two reference each other: the
    // listener finishes the wait, and finishing removes the listener.
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeEventListener('transitionend', onEnd);
      resolve();
    }

    function onEnd(event: Event) {
      if ((event as TransitionEvent).propertyName === property) finish();
    }

    el.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, fallbackMs);
  });
}
