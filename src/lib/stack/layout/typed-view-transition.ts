// A View Transition that says which way it is going.
//
// A named pair whose two sides are different elements can need CSS that only
// one side gets: `page-rule` is the page's line on one side and a card header
// on the other, and only the header's image is stretched to the morphing box
// (stretched, the line would be a solid bar). Which side is the header depends
// on the direction, so the CSS needs a direction marker.
//
// The marker is a View Transition type (`startViewTransition({ update, types })`,
// matched in CSS with `:active-view-transition-type(...)`). Where the browser
// has View Transitions but not types, the same name is written to
// `html[data-vt-type]` for the length of the transition instead, and the CSS
// carries a second selector for it. That attribute is never set where types
// work, so the two can't disagree.
//
// An effect, like `transition-wait.ts`: there is no decision here, only the
// plumbing to get right once.

/** The directions the stack's page ↔ card transitions declare. */
export type StackVtType = 'page-to-card' | 'card-to-page';

/** The part of `ViewTransition` the stack uses. */
export interface StackViewTransition {
  finished: Promise<void>;
}

/** Starts a view transition, optionally typed. */
export type StartStackVT = (update: () => void, type?: StackVtType) => StackViewTransition;

/** The fallback marker's attribute, as `dataset` spells it (`data-vt-type`). */
const FALLBACK_KEY = 'vtType';

/**
 * Wraps `document.startViewTransition`, or returns `undefined` where there is
 * none (the caller's instant-fallback path).
 */
export function typedViewTransitions(doc: Document = document): StartStackVT | undefined {
  const start = (doc as any).startViewTransition?.bind(doc) as
    | ((arg: (() => void) | { update: () => void; types: string[] }) => StackViewTransition)
    | undefined;
  if (!start) return undefined;

  const VT = (doc.defaultView as any)?.ViewTransition;
  const typesSupported = typeof VT === 'function' && 'types' in VT.prototype;
  const html = doc.documentElement;

  return (update, type) => {
    if (!type) return start(update);
    if (typesSupported) return start({ update, types: [type] });

    html.dataset[FALLBACK_KEY] = type;
    const vt = start(update);
    const clear = () => {
      if (html.dataset[FALLBACK_KEY] === type) delete html.dataset[FALLBACK_KEY];
    };
    // `finished` rejects only if the update callback threw; the marker comes off either way.
    vt.finished.then(clear, clear);
    return vt;
  };
}
