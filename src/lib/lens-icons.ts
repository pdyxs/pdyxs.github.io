// Monochrome SVG icons for lenses. Keyed by the `icon` field in the lens
// registry — that field stays a semantic *key*, never markup, so the registry
// remains pure data (see lens-registry.ts). Resolution key -> markup lives
// here, the rendering layer.
//
// Every icon draws in `currentColor`, so the same markup inherits whatever
// text colour surrounds it — a light lens-list row, or the dark indicator
// strip above a dimension button — with no per-context variants. viewBox is a
// uniform 0 0 24 24 and each <svg> carries width/height 1em, so a caller sizes
// an icon purely via font-size.

const LENS_ICONS: Record<string, string> = {
  // "A bit of everything" — a scatter plot stripped of its axes: dots strewn
  // across the field with no ordering, standing in for a varied mix.
  scatter:
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<circle cx="5" cy="7" r="1.7"/><circle cx="11" cy="4" r="1.7"/>' +
    '<circle cx="17" cy="8" r="1.7"/><circle cx="7" cy="14" r="1.7"/>' +
    '<circle cx="13" cy="12" r="1.7"/><circle cx="20" cy="15" r="1.7"/>' +
    '<circle cx="9" cy="20" r="1.7"/><circle cx="17" cy="20" r="1.7"/></svg>',

  // "Newest" — a time axis with a tall origin tick at the left and an arrowhead
  // at the leading (right) end: advancing toward the most recent point. Its
  // mirror `timeline-oldest` (tall tick right, arrow left) is ready for the
  // forthcoming Oldest lens.
  timeline:
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<line x1="3.5" y1="5.5" x2="3.5" y2="18.5"/>' +
    '<line x1="3.5" y1="12" x2="20.5" y2="12"/>' +
    '<line x1="9.5" y1="9.5" x2="9.5" y2="14.5"/>' +
    '<line x1="15" y1="9.5" x2="15" y2="14.5"/>' +
    '<polyline points="17,8 21,12 17,16"/></svg>',

  'timeline-oldest':
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<line x1="20.5" y1="5.5" x2="20.5" y2="18.5"/>' +
    '<line x1="3.5" y1="12" x2="20.5" y2="12"/>' +
    '<line x1="14.5" y1="9.5" x2="14.5" y2="14.5"/>' +
    '<line x1="9" y1="9.5" x2="9" y2="14.5"/>' +
    '<polyline points="7,8 3,12 7,16"/></svg>',

  // Generic fallback marker for a lens that declares no icon (or an unknown
  // key) — mirrors the old '●' text marker.
  dot:
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="4"/></svg>',
};

/**
 * Resolves a lens icon key to its inline SVG markup. Returns undefined for a
 * missing key (no icon to show); an unknown key falls back to the generic dot
 * so a typo degrades to a visible marker rather than nothing.
 */
export function lensIconMarkup(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  return LENS_ICONS[name] ?? LENS_ICONS.dot;
}
