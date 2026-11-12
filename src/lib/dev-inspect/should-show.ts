/**
 * Whether the "mark inspected" button shows. Pure: the island reads the DOM
 * into `inspectedByUid` (card uid -> its `data-inspected`) and applies the
 * answer. Only the ACTIVE card counts; a card with no entry (a lens, or a card
 * not rendered) never shows the button.
 */
export function shouldShowInspect(
  activeSlot: string | null,
  inspectedByUid: Readonly<Record<string, boolean>>,
): boolean {
  return activeSlot !== null && inspectedByUid[activeSlot] === false;
}
