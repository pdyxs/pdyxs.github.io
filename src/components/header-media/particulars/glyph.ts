import type { ParticleType } from '../../../lib/particulars/scenario/types';

/**
 * Minimal distinct shapes for the 12 types: triangles and squares for the light
 * quarks, pentagons for the heavy ones (flipped within a pair), circles and
 * rounder polygons for the charged leptons, stars for the neutrinos.
 */
type Spec = { sides: number; rotation: number; star?: boolean } | { circle: true };
const SPECS: Record<ParticleType, Spec> = {
  up: { sides: 3, rotation: -90 },
  down: { sides: 3, rotation: 90 },
  strange: { sides: 4, rotation: 0 },
  charm: { sides: 4, rotation: 45 },
  top: { sides: 5, rotation: -90 },
  bottom: { sides: 5, rotation: 90 },
  electron: { circle: true },
  muon: { sides: 6, rotation: 0 },
  tau: { sides: 8, rotation: 22.5 },
  electronNeutrino: { sides: 4, rotation: 0, star: true },
  muonNeutrino: { sides: 5, rotation: -90, star: true },
  tauNeutrino: { sides: 6, rotation: 0, star: true },
};

export type Glyph = { kind: 'circle' } | { kind: 'polygon'; points: (radius: number) => string };

/** Pure: the outline to draw for a particle type, scalable to any radius. */
export function glyphFor(type: ParticleType): Glyph {
  const spec = SPECS[type];
  if ('circle' in spec) return { kind: 'circle' };
  const { sides, rotation, star } = spec;
  return {
    kind: 'polygon',
    points: (radius) => {
      const n = star ? sides * 2 : sides;
      return Array.from({ length: n }, (_, i) => {
        const a = ((rotation + (360 * i) / n) * Math.PI) / 180;
        const r = star && i % 2 === 1 ? radius * 0.45 : radius;
        return `${+(r * Math.cos(a)).toFixed(4)},${+(r * Math.sin(a)).toFixed(4)}`;
      }).join(' ');
    },
  };
}
