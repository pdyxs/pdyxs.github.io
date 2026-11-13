// Fading trails behind every particle and the player, over permanent faint marks
// that build up on the background. Ported from the Unity original — see constants.ts
// for every source file. Variants:
//   bold    — (default) the multi-strand TrailRenderer rig (Trail3Point0Pos) + marks three
//             times Unity's strength: at 1x they need minutes of play to show, and the
//             charge layer's dark background swallows them
//   unity   — the same strands, marks at exactly Unity's strength
//   ribbon  — the older single spline ribbon (TrailView / Trail.prefab) + marks
//   strands — the strands alone, no marks
import type { FrameInfo, Layer, LayerDef, Theme, ViewBox } from '../types';
import { PERMA_DISPLAY_ALPHA, PERMA_MARK_RGB, PERMA_MAX_TEXELS, PERMA_TEXELS_PER_UNIT } from './constants';
import { TrailsGL } from './gl';
import { explosionDiscs, MarkTracker } from './perma';
import { RibbonHistory, writeAllRibbons } from './ribbon';
import { trailSources, type TrailSource } from './sources';
import { TrailHistory, writeAllStrands } from './strands';
import { StripWriter } from './strip';

interface VariantConfig {
  trail: 'strands' | 'ribbon';
  /** Multiplier on PermaTrailMaterial's alpha, per theme; 0 turns marks off. */
  marks: Record<Theme, number>;
}

const VARIANTS: Record<string, VariantConfig> = {
  unity: { trail: 'strands', marks: { dark: 1, light: 1 } },
  // Light paper shows the same coverage far more readily than the dark ground does.
  bold: { trail: 'strands', marks: { dark: 3, light: 2 } },
  ribbon: { trail: 'ribbon', marks: { dark: 1, light: 1 } },
  strands: { trail: 'strands', marks: { dark: 0, light: 0 } },
};

/** The mark buffer covers the view box at a fixed density, so canvas resizes never touch it. Pure. */
export function markBufferSize(view: ViewBox): { width: number; height: number } {
  const density = Math.min(PERMA_TEXELS_PER_UNIT, PERMA_MAX_TEXELS / view.width, PERMA_MAX_TEXELS / view.height);
  return { width: Math.max(1, Math.round(view.width * density)), height: Math.max(1, Math.round(view.height * density)) };
}

function createTrails(canvas: HTMLCanvasElement, variant: string): Layer {
  const cfg = VARIANTS[variant] ?? VARIANTS.unity;
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: true });
  if (!gl) return { frame() {}, destroy() {} };
  const fx = new TrailsGL(gl);
  const strands = new TrailHistory();
  const ribbons = new RibbonHistory();
  const marks = new MarkTracker();
  const out = new StripWriter();
  const sources: TrailSource[] = [];
  let clock = 0;
  let viewKey = '';
  /** Real time since the marks last advanced (they only move on sim steps). */
  let markDt = 0;

  return {
    frame(f: FrameInfo) {
      clock += f.dt;
      trailSources(f.snapshot, sources);
      if (cfg.trail === 'strands') strands.update(sources, clock, f.dt);
      else ribbons.update(sources, clock, f.dt);

      // Marks accumulate whatever the theme, so a flip back finds them intact.
      if (cfg.marks.dark > 0 || cfg.marks.light > 0) {
        const key = `${f.view.x},${f.view.y},${f.view.width},${f.view.height}`;
        if (key !== viewKey) {
          // A new view box is a new level: the original cleared its marks then too.
          viewKey = key;
          fx.ensureMarkBuffer(markBufferSize(f.view));
        }
        markDt += f.dt;
        if (f.stepped) {
          marks.update(sources, markDt);
          markDt = 0;
          fx.stampMarks(f.view, explosionDiscs(f.snapshot.explosions), marks.data, marks.count);
        }
      }

      out.reset();
      const theme: Theme = f.theme === 'light' ? 'light' : 'dark';
      if (cfg.trail === 'strands') writeAllStrands(out, strands, clock, theme);
      else writeAllRibbons(out, ribbons, clock, theme);
      fx.drawFrame(f.projection, f.view, PERMA_DISPLAY_ALPHA * cfg.marks[theme], PERMA_MARK_RGB[theme], out.data, out.count);
    },
    // The canvas backing store was reset; the mark buffer is an offscreen texture
    // sized to the world, so it survives untouched and the next frame redraws everything.
    resize() {},
    destroy() {
      fx.destroy();
    },
  };
}

export const trailsLayer: LayerDef = {
  id: 'trails',
  z: -30,
  variants: Object.keys(VARIANTS),
  defaultVariant: 'bold',
  create: createTrails,
};
