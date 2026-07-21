import type { ParamPairs } from './stack-codec';

/**
 * Decides the per-location param map after the active slot is replaced by
 * another location (a lens swap from DimensionPanel, a series prev/next, the
 * home filter fallthrough).
 *
 * Two rules, both about not letting a location's params outlive it:
 *
 * - The outgoing location leaves the stack, so its params leave with it. Held
 *   on, they'd be re-serialised the next time that uid came back into the
 *   stack — filter a browse lens, switch to a lens that can't hold filters,
 *   switch back, and the dropped selection reappears from the stale entry.
 * - The incoming location's params are exactly what the caller carries in
 *   (a serialised FilterState, when the selection should follow the user
 *   across the swap) — never carried-plus-whatever-it-held-last-time, which
 *   is how a single selection ends up in the URL twice.
 *
 * Re-selecting the location that's already active is the one exception: its
 * shell doesn't remount, so nothing would report its live selection back
 * afterwards, and dropping what we hold would silently lose it.
 */
export function paramsAfterSlotReplace(
  current: ReadonlyMap<string, ParamPairs>,
  outgoingKey: string | null,
  incomingUid: string,
  carried: ParamPairs,
): Map<string, ParamPairs> {
  const next = new Map(current);
  const sameSlot = outgoingKey === incomingUid;

  if (outgoingKey && !sameSlot) next.delete(outgoingKey);

  if (carried.length) next.set(incomingUid, carried);
  else if (!sameSlot) next.delete(incomingUid);

  return next;
}
