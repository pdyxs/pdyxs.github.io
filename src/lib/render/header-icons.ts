// The card header's solo and close buttons, as markup strings.
//
// Strings rather than an Astro component because the same buttons are built in
// two places: the server-rendered headers (CardStackCard, SeriesNavRenderer,
// LensStackCard) and the client's placeholder fragment (card-fragments.ts),
// which a pushed card keeps its header from. One source keeps them identical.
//
// The icons are SVG, not text glyphs, so both share one box by construction —
// ⊡ and ⊠ as characters come from whichever font carries them, and there is no
// glyph with a lighter ×. Every shape is drawn twice: a wide `halo` stroke in
// the paper colour first, then the `ink` on top. That is the SVG form of the
// -webkit-text-stroke halo text uses to read over a dither. Stroke widths and
// colours come from CSS (stack.css), so hover can thicken them.

// 16-unit grid. The box is inset so its halo stays inside the viewBox.
const BOX = '<rect x="2.5" y="2.5" width="11" height="11"/>';
const DOT = '<circle cx="8" cy="8" r="1.25"/>';
const CROSS = '<path d="M5.75 5.75 10.25 10.25M10.25 5.75 5.75 10.25"/>';

function icon(inner: string): string {
  return (
    '<svg class="header-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    `<g class="header-icon-halo">${BOX}${inner}</g>` +
    `<g class="header-icon-ink"><g class="header-icon-box">${BOX}</g><g class="header-icon-mark">${inner}</g></g>` +
    '</svg>'
  );
}

export const SOLO_BUTTON =
  `<button class="stack-card-solo" aria-label="Show only this card">${icon(DOT)}</button>`;

export const CLOSE_BUTTON =
  `<button class="stack-card-close" aria-label="Close">${icon(CROSS)}</button>`;
