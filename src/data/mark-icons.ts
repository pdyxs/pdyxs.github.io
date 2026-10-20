// Icons for the mark's tool baubles (src/data/mark-tools.ts names them).
//
// Each is an SVG body drawn in a unit box about the bauble's centre: the
// body circle is radius 1, so everything here sits inside -1..1 and is scaled
// by the tool's `radius`. The body circle itself (paper, with an ink ring) is
// the bauble's, not the icon's: an icon is what goes on it.
//
// Colour only through the two classes, never a literal colour, so a palette
// or theme change recolours every icon:
//   .site-mark-icon-ink   → the ink colour (--color-text)
//   .site-mark-icon-paper → the paper colour (--color-bg)
// Shapes are fills: those classes set `fill`, and a stroke would scale with
// the radius. Draw a line as a thin rect or a path outline.

export const MARK_ICONS: Record<string, string> = {
  /** The palette: an ink core in the ring (the experiment's look). */
  palette: '<circle class="site-mark-icon-ink" r="0.39"></circle>',
  /** Revert: an ×. */
  cross:
    '<rect class="site-mark-icon-ink" x="-0.55" y="-0.11" width="1.1" height="0.22" transform="rotate(45)"></rect>' +
    '<rect class="site-mark-icon-ink" x="-0.55" y="-0.11" width="1.1" height="0.22" transform="rotate(-45)"></rect>',
  /** A +. */
  plus:
    '<rect class="site-mark-icon-ink" x="-0.55" y="-0.11" width="1.1" height="0.22"></rect>' +
    '<rect class="site-mark-icon-ink" x="-0.11" y="-0.55" width="0.22" height="1.1"></rect>',
  /** Something to drag: four arrowheads about a point. */
  move:
    '<circle class="site-mark-icon-ink" r="0.14"></circle>' +
    '<path class="site-mark-icon-ink" d="M0 -0.7 L0.22 -0.42 L-0.22 -0.42 Z M0 0.7 L0.22 0.42 L-0.22 0.42 Z M-0.7 0 L-0.42 0.22 L-0.42 -0.22 Z M0.7 0 L0.42 0.22 L0.42 -0.22 Z"></path>',
  /** A ring inside the ring: an ink disc with a paper hole. */
  ring:
    '<circle class="site-mark-icon-ink" r="0.5"></circle>' + '<circle class="site-mark-icon-paper" r="0.28"></circle>',
};
