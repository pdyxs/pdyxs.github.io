import { describe, expect, it } from 'vitest';
import type { ParticleSnapshot, Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import { chargeOf, glowScale, packGlows, PLAYER_GLOW_ID, stepEmFade, stepGlows, type Glow } from './glows';
import { GROW_SECONDS, MAX_CHARGE } from './palette';

function particle(over: Partial<ParticleSnapshot>): ParticleSnapshot {
  return { id: 0, type: 'electron', colour: 'white', parity: 1, x: 0, y: 0, radius: 0.35, live: true, vx: 0, vy: 0, ...over };
}

function snap(particles: ParticleSnapshot[], player: Partial<Snapshot['player']> = {}): Snapshot {
  return {
    tick: 0,
    walls: { width: 64, height: 36 },
    player: {
      x: 1, y: 2, radius: 0.5, type: 'up', colour: 'white', parity: 1, alive: true,
      vx: 0, vy: 0, steer: { x: 0, y: 0 }, ...player,
    },
    particles,
    blackHoles: [],
    barriers: [],
    forces: { em: true, strong: false, weak: false, gravity: false } as Snapshot['forces'],
    explosions: [],
    pickupsEnabled: false,
    pickups: [],
    collected: 0,
  };
}

/** Step `seconds` in small frames. */
function run(glows: Glow[], s: Snapshot, seconds: number, dt = 0.05): Glow[] {
  for (let t = 0; t < seconds - 1e-9; t += dt) glows = stepGlows(glows, s, dt);
  return glows;
}

describe('chargeOf', () => {
  it('is the type charge times parity, in thirds of e', () => {
    expect(chargeOf('up', 1)).toBe(2);
    expect(chargeOf('down', 1)).toBe(-1);
    expect(chargeOf('electron', -1)).toBe(3);
    expect(chargeOf('electronNeutrino', 1)).toBe(0);
  });
});

describe('glowScale', () => {
  it('eases in cubically while growing and out while shrinking', () => {
    expect(glowScale({ grow: 0.5, present: true })).toBeCloseTo(0.125);
    expect(glowScale({ grow: 1, present: true })).toBe(1);
    expect(glowScale({ grow: 0.5, present: false })).toBeCloseTo(0.875);
    expect(glowScale({ grow: 0, present: false })).toBe(0);
  });
});

describe('stepGlows', () => {
  it('lights the player and every live charged particle, not neutrinos or telegraphs', () => {
    const s = snap([
      particle({ id: 1, type: 'electron' }),
      particle({ id: 2, type: 'electronNeutrino' }),
      particle({ id: 3, type: 'down', live: false }),
    ]);
    const glows = stepGlows([], s, 0.1);
    expect(glows.map((g) => [g.id, g.charge])).toEqual([[PLAYER_GLOW_ID, 2], [1, -3]]);
  });

  it('skips a dead player', () => {
    expect(stepGlows([], snap([], { alive: false }), 0.1)).toEqual([]);
  });

  it('grows a new glow to full over the spawn tween', () => {
    const s = snap([particle({ id: 1 })]);
    const half = run([], s, GROW_SECONDS / 2);
    expect(half[1].grow).toBeCloseTo(0.5);
    const full = run(half, s, GROW_SECONDS);
    expect(full[1].grow).toBe(1);
  });

  it('follows the particle and picks up a charge change at once', () => {
    let glows = run([], snap([particle({ id: 1 })]), 1);
    glows = stepGlows(glows, snap([particle({ id: 1, x: 5, type: 'muon', parity: -1 })]), 0.02);
    expect(glows[1]).toMatchObject({ x: 5, charge: 3, grow: 1, present: true });
  });

  it('shrinks a vanished particle where it was, then drops it', () => {
    let glows = run([], snap([particle({ id: 1, x: 7 })]), 1);
    const empty = snap([]);
    glows = stepGlows(glows, empty, 0.1);
    const gone = glows.find((g) => g.id === 1)!;
    expect(gone).toMatchObject({ x: 7, present: false });
    expect(glowScale(gone)).toBeLessThan(1);
    glows = run(glows, empty, GROW_SECONDS);
    expect(glows.find((g) => g.id === 1)).toBeUndefined();
  });

  it('regrows from the visible scale when a shrinking glow comes back', () => {
    let glows = run([], snap([particle({ id: 1 })]), 1);
    glows = run(glows, snap([]), 0.2);
    const before = glowScale(glows.find((g) => g.id === 1)!);
    glows = stepGlows(glows, snap([particle({ id: 1 })]), 0);
    expect(glowScale(glows.find((g) => g.id === 1)!)).toBeCloseTo(before);
  });
});

describe('stepEmFade', () => {
  it('moves toward the switch and stays in 0..1', () => {
    expect(stepEmFade(0, true, 0.3)).toBeCloseTo(0.5);
    expect(stepEmFade(1, true, 0.3)).toBe(1);
    expect(stepEmFade(0.1, false, 1)).toBe(0);
  });
});

describe('packGlows', () => {
  const full = (id: number, charge: number): Glow => ({ id, x: id, y: -id, charge, grow: 1, present: true });

  it('writes x, y, scale and clamped charge', () => {
    const out = new Float32Array(8);
    const n = packGlows([full(1, 2), full(2, -3)], 1, out);
    expect(n).toBe(2);
    expect(Array.from(out.slice(0, 4))).toEqual([1, -1, 1, 2]);
    expect(out[7]).toBeCloseTo(-MAX_CHARGE);
  });

  it('scales charge by the EM fade and writes nothing when it is off', () => {
    const out = new Float32Array(4);
    packGlows([full(1, 2)], 0.5, out);
    expect(out[3]).toBeCloseTo(1);
    expect(packGlows([full(1, 2)], 0, out)).toBe(0);
  });

  it('stops at the buffer size', () => {
    expect(packGlows([full(1, 1), full(2, 1), full(3, 1)], 1, new Float32Array(8))).toBe(2);
  });
});
