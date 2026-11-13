// Layered particle bodies: a port of the original's six-layer particle sprites (ParticleMesh,
// ParticleEye, PlayerEye, WeakForceDecayView, PlayerIndicatorView, SpawnerView). Replaces the SVG
// glyphs: draws every particle, the player, and particles still telegraphing their arrival.
//
// Each particle is a stack of sprites from the original atlas — body, charge-tinted glow, iris
// layers, pupil — and every layer above the body leans by its own amount: a particle's toward the
// player, the player's along the steering input, each easing in at its own speed. The player's
// iris layers take the player colour; the pupil takes the strong colour when the strong force is on.
//
// Variants:
//   unity   — the shipped game: green player (#37b34a), pure-primary strong colours, the player's
//             two indicator rings (faint; strong with the weak force on). Default.
//   trailer — the trailer's build: sky-blue player, the authored (softer) strong colours, and no
//             indicator rings round the player (none show in the trailer).
//   lean    — unity, with every layer leaning 1.6× as far (for the small toy).
import type { FrameInfo, Layer, LayerDef } from '../types';
import atlasUrl from './atlas/atlas.webp?url';
import { ATLAS } from './atlas/atlas-map';
import { BodiesRenderer } from './gl';
import { paletteFor, TRAILER, TRAILER_LIGHT, UNITY, UNITY_LIGHT, type ThemedPalette } from './palette';
import { buildScene, type Draw } from './scene';
import { Tracker } from './tracker';

interface VariantSpec {
  palette: ThemedPalette;
  lean: number;
  indicator: boolean;
}

const UNITY_SET: ThemedPalette = { dark: UNITY, light: UNITY_LIGHT };
const TRAILER_SET: ThemedPalette = { dark: TRAILER, light: TRAILER_LIGHT };

const VARIANTS: Record<string, VariantSpec> = {
  unity: { palette: UNITY_SET, lean: 1, indicator: true },
  trailer: { palette: TRAILER_SET, lean: 1, indicator: false },
  lean: { palette: UNITY_SET, lean: 1.6, indicator: true },
};

const has = (name: string): boolean => name in ATLAS;

export const bodiesLayer: LayerDef = {
  id: 'bodies',
  z: 10,
  variants: Object.keys(VARIANTS),
  defaultVariant: 'unity',
  replacesGlyphs: true,
  create(canvas, variant): Layer {
    const spec = VARIANTS[variant] ?? VARIANTS.unity;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return flatFallback(canvas);
    const renderer = new BodiesRenderer(gl, atlasUrl);
    const tracker = new Tracker(spec.lean);
    const draws: Draw[] = [];
    return {
      frame(f: FrameInfo) {
        tracker.update(f.snapshot, f.dt);
        buildScene(
          { snapshot: f.snapshot, palette: paletteFor(spec.palette, f.theme), has, state: (id) => tracker.get(id), cooldownLeft: tracker.cooldownLeft, indicator: spec.indicator },
          draws,
        );
        renderer.draw(draws, f.projection, f.view);
      },
      destroy() {
        renderer.destroy();
      },
    };
  },
};

/** Without WebGL2 the glyphs are still hidden, so draw plain discs: matter light, antimatter dark. */
function flatFallback(canvas: HTMLCanvasElement): Layer {
  const ctx = canvas.getContext('2d');
  return {
    frame({ snapshot: s, projection: p, view }: FrameInfo) {
      if (!ctx) return;
      ctx.clearRect(0, 0, p.width, p.height);
      const disc = (x: number, y: number, r: number, parity: number, live: boolean) => {
        ctx.beginPath();
        ctx.arc((x - view.x) * p.scale + p.offsetX, (y - view.y) * p.scale + p.offsetY, r * p.scale, 0, Math.PI * 2);
        ctx.globalAlpha = live ? 1 : 0.4;
        ctx.fillStyle = parity > 0 ? '#f4f4f4' : '#202020';
        ctx.fill();
      };
      for (const q of s.particles) disc(q.x, q.y, q.radius, q.parity, q.live);
      if (s.player.alive) disc(s.player.x, s.player.y, s.player.radius, s.player.parity, true);
      ctx.globalAlpha = 1;
    },
    destroy() {},
  };
}
