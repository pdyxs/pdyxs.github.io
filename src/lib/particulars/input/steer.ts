export interface Vec {
  x: number;
  y: number;
}

/** Everything currently held, in plain data. Pointers are in world coordinates. */
export interface Inputs {
  pointers: Vec[];
  keys: string[];
}

const KEY_VECTORS: Record<string, Vec> = {
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
};

export const isSteerKey = (key: string): boolean => key.toLowerCase() in KEY_VECTORS;

function unit(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y);
  return len < 1e-9 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

/**
 * Every held pointer contributes the raw vector from the player to it (farther pointers weigh more), every
 * held key a unit vector; the sum is normalized. Returns unit length or zero.
 */
export function steer(inputs: Inputs, playerPos: Vec): Vec {
  let sum: Vec = { x: 0, y: 0 };
  for (const p of inputs.pointers) {
    sum = { x: sum.x + p.x - playerPos.x, y: sum.y + p.y - playerPos.y };
  }
  for (const key of inputs.keys) {
    const d = KEY_VECTORS[key.toLowerCase()];
    if (d) sum = { x: sum.x + d.x, y: sum.y + d.y };
  }
  return unit(sum);
}
