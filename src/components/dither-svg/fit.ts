// Where a square viewBox sits inside a box of any shape: scaled to fit the
// shorter side, centred on the longer one (what `preserveAspectRatio="xMidYMid
// meet"` does for the HitLayer svg, so the drawing and its hit areas agree).
// Pure: box size in, transform out.
export function fitTransform(
  box: { width: number; height: number },
  view: { x: number; y: number; size: number },
): string {
  const scale = Math.min(box.width, box.height) / view.size;
  const left = (box.width - scale * view.size) / 2;
  const top = (box.height - scale * view.size) / 2;
  return `translate(${left} ${top}) scale(${scale}) translate(${-view.x} ${-view.y})`;
}
