import type { WallDef } from '../../../lib/particulars/scenario/types';

const r = (n: number) => Math.round(n * 1e4) / 1e4 + 0; // + 0 folds -0 into 0
const pt = (cx: number, cy: number, rad: number, deg: number) =>
  `${r(cx + rad * Math.cos((deg * Math.PI) / 180))} ${r(cy + rad * Math.sin((deg * Math.PI) / 180))}`;

/** Pure: the SVG path of an arc wall's band (y down, so a positive sweep runs clockwise on screen). */
export function arcPath(wall: Extract<WallDef, { shape: 'arc' }>): string {
  const { x, y, radius: outer } = wall;
  const inner = outer - wall.thickness;
  const start = wall.start ?? 0;
  const sweep = wall.sweep ?? 360;
  if (sweep >= 360) {
    const ring = (rad: number, flag: 0 | 1) =>
      `M ${pt(x, y, rad, start)} A ${rad} ${rad} 0 1 ${flag} ${pt(x, y, rad, start + 180)} A ${rad} ${rad} 0 1 ${flag} ${pt(x, y, rad, start)} Z`;
    return `${ring(outer, 1)} ${ring(inner, 0)}`;
  }
  const large = sweep > 180 ? 1 : 0;
  return [
    `M ${pt(x, y, outer, start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${pt(x, y, outer, start + sweep)}`,
    `L ${pt(x, y, inner, start + sweep)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${pt(x, y, inner, start)}`,
    'Z',
  ].join(' ');
}
