// The active card's title over the mark.
//
// The title can't be raised above the mark with z-index: the sticky
// `.card-header` is a stacking context of its own, and on desktop so is every
// `.stack-card`, so the title and the header's dithered surface always stack
// as one piece. Instead the mark cuts the title out of itself: an SVG
// luminance mask on the threads and the dot, with the title's words drawn in
// it, in the title's own font, at its own place, stroked by its outline. The
// mark reads the title; it never writes to the stack (stack-state.md).
//
// Three parts, as architecture.md has them:
//   - `readTitleWords`: the DOM read, one box per word of the title;
//   - `maskGlyphs`: pure, those boxes in the overlay's coordinates;
//   - `renderMaskGlyphs`: the thin applier, the mask's <text> elements.
// And `watchTitleMask`, which decides when to re-read.

/** One word of the title as laid out: its text, its box, and how it is drawn. */
export interface TitleWord {
  text: string;
  /** The word's box, viewport px (Range.getBoundingClientRect: the font's content area). */
  left: number;
  width: number;
  bottom: number;
  /** The font's descent at this size, px: the baseline sits this far above `bottom`. */
  descent: number;
  font: TitleFont;
}

export interface TitleFont {
  family: string;
  size: string;
  weight: string;
  style: string;
  letterSpacing: string;
  textTransform: string;
  /** The `-webkit-text-stroke` width, px: the outline the cut-out includes. */
  stroke: number;
}

/** One <text> of the mask, in the overlay's coordinates. */
export interface MaskGlyph {
  text: string;
  x: number;
  /** The baseline. */
  y: number;
  /** The word's laid-out width: the mask's text is fitted to it (`textLength`). */
  width: number;
  font: TitleFont;
}

/** Each word placed on its baseline, relative to the overlay's top-left `origin`. */
export function maskGlyphs(words: readonly TitleWord[], origin: { x: number; y: number }): MaskGlyph[] {
  return words
    .filter((w) => w.text.trim() !== '' && w.width > 0)
    .map((w) => ({
      text: w.text,
      x: w.left - origin.x,
      y: w.bottom - w.descent - origin.y,
      width: w.width,
      font: w.font,
    }));
}

// ── The read ─────────────────────────────────────────────────────────

/** The active card's title, the one the mask follows. */
export const TITLE_SELECTOR = '.stack-card--active > .card-header .card-header-title';

const descents = new Map<string, number>();
let measureCtx: CanvasRenderingContext2D | null = null;

/** The font's descent at this size, px, from the canvas's font metrics. */
function fontDescent(cs: CSSStyleDeclaration): number {
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const cached = descents.get(font);
  if (cached !== undefined) return cached;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = font;
  const d = measureCtx.measureText('x').fontBoundingBoxDescent ?? 0;
  descents.set(font, d);
  return d;
}

/** One box per word of `title`'s text, each with the font of the element it is in. */
export function readTitleWords(title: Element): TitleWord[] {
  const words: TitleWord[] = [];
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    const font: TitleFont = {
      family: cs.fontFamily,
      size: cs.fontSize,
      weight: cs.fontWeight,
      style: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      stroke: parseFloat(cs.getPropertyValue('-webkit-text-stroke-width')) || 0,
    };
    const descent = fontDescent(cs);
    for (const m of node.data.matchAll(/\S+/g)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      words.push({ text: m[0], left: r.left, width: r.width, bottom: r.bottom, descent, font });
    }
  }
  return words;
}

// ── The applier ──────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Replace `group`'s <text> children with `glyphs`. Fill and stroke colour are the mask's (CSS). */
export function renderMaskGlyphs(group: SVGGElement, glyphs: readonly MaskGlyph[]): void {
  const texts = glyphs.map((g) => {
    const t = document.createElementNS(SVG_NS, 'text');
    t.textContent = g.text;
    t.setAttribute('x', g.x.toFixed(2));
    t.setAttribute('y', g.y.toFixed(2));
    t.setAttribute('textLength', g.width.toFixed(2));
    t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    const s = t.style;
    s.fontFamily = g.font.family;
    s.fontSize = g.font.size;
    s.fontWeight = g.font.weight;
    s.fontStyle = g.font.style;
    s.letterSpacing = g.font.letterSpacing;
    s.textTransform = g.font.textTransform;
    s.strokeWidth = `${g.font.stroke}px`;
    return t;
  });
  group.replaceChildren(...texts);
}

// ── When to re-read ──────────────────────────────────────────────────

/**
 * How long to keep re-reading every frame after anything that may move the
 * title: a card sliding into place (`--stack-motion-ms`), the header's
 * compact swap (`--stack-stuck-ms`), a View Transition settling. Longer than
 * any of them; a scroll or a resize restarts it.
 */
const SETTLE_MS = 700;

/**
 * Keep `group` (the mask's glyphs) on the active card's title, in `overlay`'s
 * coordinates, until the returned function is called, which also clears it.
 * Re-reads on scroll, resize and any change in the stack (a card opening or
 * closing, the header compacting), each frame for a while after.
 */
export function watchTitleMask(group: SVGGElement, overlay: SVGSVGElement): () => void {
  let frame = 0;
  let until = 0;
  const read = () => {
    const title = document.querySelector(TITLE_SELECTOR);
    const o = overlay.getBoundingClientRect();
    renderMaskGlyphs(group, title ? maskGlyphs(readTitleWords(title), { x: o.left, y: o.top }) : []);
  };
  const tick = (now: number) => {
    read();
    frame = now < until ? requestAnimationFrame(tick) : 0;
  };
  const poke = () => {
    until = performance.now() + SETTLE_MS;
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const stack = document.getElementById('card-stack');
  const mo = new MutationObserver(poke);
  if (stack) mo.observe(stack, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('scroll', poke, { passive: true });
  window.addEventListener('resize', poke);
  document.fonts.ready.then(poke);
  poke();
  return () => {
    mo.disconnect();
    window.removeEventListener('scroll', poke);
    window.removeEventListener('resize', poke);
    cancelAnimationFrame(frame);
    frame = 0;
    until = 0;
    group.replaceChildren();
  };
}
