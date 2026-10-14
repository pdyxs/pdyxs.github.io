import { ARC_PIECE_DEGREES } from '../constants';
import type { WallDef, WallMode } from '../scenario/types';

export type WallResponse = 'block' | 'pass' | 'destroy';

/** Pure: what a wall of `mode` does to a particle of signed `charge` (thirds of e). */
export function wallResponse(mode: WallMode, charge: number): WallResponse {
  switch (mode) {
    case 'all': return 'block';
    case 'positive': return charge > 0 ? 'block' : 'pass';
    case 'negative': return charge < 0 ? 'block' : 'pass';
    case 'destroy': return 'destroy';
  }
}

/** A box a wall is built from: centre, half extents, rotation in radians. */
export interface WallPiece {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  angle: number;
}

/** Pure: the collision boxes that make up a wall. */
export function wallPieces(wall: WallDef): WallPiece[] {
  if (wall.shape === 'rect') {
    return [{ cx: wall.x, cy: wall.y, hw: wall.width / 2, hh: wall.height / 2, angle: ((wall.angle ?? 0) * Math.PI) / 180 }];
  }
  // Boxes laid tangent to the band's mid-radius. Each is as long as the arc's outer chord, so
  // neighbours meet flush on the outside and overlap on the inside: no gap a particle can slip through.
  const sweep = wall.sweep ?? 360;
  const n = Math.ceil(sweep / ARC_PIECE_DEGREES - 1e-9);
  const step = ((sweep / n) * Math.PI) / 180;
  const start = ((wall.start ?? 0) * Math.PI) / 180;
  const mid = wall.radius - wall.thickness / 2;
  return Array.from({ length: n }, (_, i) => {
    const a = start + step * (i + 0.5);
    return {
      cx: wall.x + Math.cos(a) * mid,
      cy: wall.y + Math.sin(a) * mid,
      hw: wall.radius * Math.tan(step / 2),
      hh: wall.thickness / 2,
      angle: a + Math.PI / 2,
    };
  });
}
