// `site:presentation`: how the card stack tells the rest of the page whether
// it is presenting as a page (a lens as the sole entry, its site header
// showing) or as a card. CardStack.svelte announces; the suspended mark
// (SuspendedMark.astro) listens. Neither imports the other, only this.
//
// Two channels, because the listener's script and the island hydrate in no
// fixed order:
//
//   - the event, on `document`, for every change from then on;
//   - `html[data-presentation]`, the LAST value announced, for a listener that
//     starts after the first event has already gone by.
//
// A listener reads the attribute once at startup, then follows the event.

export type Presentation = 'page' | 'card';

export interface PresentationDetail {
  to: Presentation;
  /**
   * The View Transition the change runs inside, when there is one, so a
   * listener can animate its own part of it. Announced right after
   * `startViewTransition` returns, before the old state is captured, so a
   * listener can still name elements into it. Null for a change with no
   * transition (the trim close back onto a page, a popstate, the mount).
   */
  vt: ViewTransition | null;
}

export const PRESENTATION_EVENT = 'site:presentation';

/** On `<html>`: the last presentation announced, `page` or `card`. */
export const PRESENTATION_ATTR = 'data-presentation';

/** Record `detail` on `<html>` and dispatch it. */
export function announcePresentation(detail: PresentationDetail, doc: Document = document): void {
  doc.documentElement.setAttribute(PRESENTATION_ATTR, detail.to);
  doc.dispatchEvent(new CustomEvent<PresentationDetail>(PRESENTATION_EVENT, { detail }));
}

/** The last presentation announced, or null if none has been yet. */
export function currentPresentation(doc: Document = document): Presentation | null {
  const v = doc.documentElement.getAttribute(PRESENTATION_ATTR);
  return v === 'page' || v === 'card' ? v : null;
}

declare global {
  interface DocumentEventMap {
    'site:presentation': CustomEvent<PresentationDetail>;
  }
}
