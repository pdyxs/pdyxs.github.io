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
  /**
   * The palette: the two colours it sets, as two half-discs split on a slant.
   * The body is already paper, so only the ink half is drawn: radius 1, out
   * to the ring, which covers its edge. Ink upper left, paper lower right.
   */
  palette: '<path class="site-mark-icon-ink" d="M-1 0 A1 1 0 0 1 1 0 Z" transform="rotate(-45)"></path>',
  /** The theme's three settings, as the footer's ThemeToggle draws them. Light: a sun. */
  sun: '<circle class="site-mark-icon-ink" r="0.3"></circle>' +
    '<rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(0)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(45)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(90)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(135)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(180)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(225)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(270)"></rect><rect class="site-mark-icon-ink" x="-0.07" y="-0.78" width="0.14" height="0.24" transform="rotate(315)"></rect>',
  /** Dark: a crescent moon, an ink disc with a paper one over it. */
  moon: '<circle class="site-mark-icon-ink" r="0.52"></circle>' + '<circle class="site-mark-icon-paper" cx="0.24" cy="-0.2" r="0.44"></circle>',
  /** System: a monitor. */
  monitor:
    '<rect class="site-mark-icon-ink" x="-0.55" y="-0.45" width="1.1" height="0.72"></rect>' +
    '<rect class="site-mark-icon-paper" x="-0.43" y="-0.33" width="0.86" height="0.48"></rect>' +
    '<rect class="site-mark-icon-ink" x="-0.07" y="0.27" width="0.14" height="0.18"></rect>' +
    '<rect class="site-mark-icon-ink" x="-0.3" y="0.43" width="0.6" height="0.1"></rect>',
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
