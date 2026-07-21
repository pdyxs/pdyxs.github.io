// Houdini paint worklet: ordered (Bayer 4x4) dithering.
// Reads a continuous grey level and two theme colours from custom properties,
// paints a two-colour ordered dither whose ink coverage tracks the grey value.
// Chromium-only (Firefox/Safari lack the Paint API) — callers must provide a
// flat-colour @supports fallback.

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

registerPaint(
  'dither',
  class {
    static get inputProperties() {
      return ['--dither-grey', '--dither-size', '--dither-ink', '--dither-paper'];
    }

    paint(ctx, size, props) {
      // grey: 0 = paper (light), 1 = solid ink. Coverage of ink = grey.
      const grey = clamp01(parseFloat(props.get('--dither-grey')) || 0);
      const cell = Math.max(1, parseFloat(props.get('--dither-size')) || 4);
      const ink = (props.get('--dither-ink') || '').toString().trim() || '#000';
      const paper = (props.get('--dither-paper') || '').toString().trim() || '#fff';

      // Paper first, then stamp ink cells over it.
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, size.width, size.height);

      // How many of the 16 Bayer cells are "on" for this grey level.
      const on = Math.round(grey * 16);
      if (on <= 0) return;

      ctx.fillStyle = ink;
      const cols = Math.ceil(size.width / cell);
      const rows = Math.ceil(size.height / cell);
      for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
          const threshold = BAYER4[(ry & 3) * 4 + (rx & 3)];
          if (threshold < on) {
            ctx.fillRect(rx * cell, ry * cell, cell, cell);
          }
        }
      }
    }
  }
);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
