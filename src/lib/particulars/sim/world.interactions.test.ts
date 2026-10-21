import { describe, it, expect } from 'vitest';
import { World } from './world';
import type { Intent } from './world';
import { BINDINGS, intentFor } from '../input/bindings';
import type { InputEvent } from '../input/bindings';
import type { Scenario } from '../scenario/types';
import { DECAY_TIME_BY_TYPE, FIXED_DT, radiusOf } from '../constants';

const BASE: Scenario = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0 } };
const NONE = { x: 0, y: 0 };
const CHANGE: Intent[] = [{ kind: 'change' }];

function run(world: World, steps: number, steer = NONE) {
  for (let i = 0; i < steps; i++) world.step(steer);
  return world.snapshot();
}

describe('the player is a particle', () => {
  it('is a down quark unless the scenario says otherwise', () => {
    expect(new World(BASE).snapshot().player).toMatchObject({ type: 'down', colour: 'white', parity: 1, alive: true });
    const top = new World({ ...BASE, player: { ...BASE.player, particle: { type: 'top', parity: -1 } } });
    expect(top.snapshot().player).toMatchObject({ type: 'top', parity: -1 });
  });
});

const WEAK: Scenario = { ...BASE, forces: { weak: true } };

describe('player-initiated change', () => {
  it('turns the player into its sidegrade, emits a W and a changed event', () => {
    const world = new World(WEAK);
    world.step(NONE, CHANGE);
    const snap = world.snapshot();
    expect(snap.player).toMatchObject({ type: 'up', alive: true });
    expect(snap.particles).toHaveLength(1);
    expect(snap.particles[0]).toMatchObject({ type: 'W', parity: -1, live: true });
    expect(world.drainEvents()).toEqual([
      {
        tick: 0,
        kind: 'changed',
        isPlayer: true,
        from: { type: 'down', colour: 'white', parity: 1 },
        to: { type: 'up', colour: 'white', parity: 1 },
      },
    ]);
    expect(world.drainEvents()).toEqual([]);
  });

  it('sends the W opposite to the steering, and recoils the player', () => {
    const world = new World(WEAK);
    world.step({ x: 1, y: 0 }, CHANGE);
    const snap = run(world, 5, { x: 1, y: 0 });
    expect(snap.particles[0].x).toBeLessThan(0);
  });

  it('is free and unlimited: it flips back and forth', () => {
    const world = new World(WEAK);
    const types = [1, 2, 3].map(() => {
      world.step(NONE, CHANGE);
      return world.snapshot().player.type;
    });
    expect(types).toEqual(['up', 'down', 'up']);
  });

  it('control is kept: the same player still steers after a change', () => {
    const world = new World(WEAK);
    world.step(NONE, CHANGE);
    const snap = run(world, 30, { x: 0, y: 1 });
    expect(snap.player.y).toBeGreaterThan(0.1);
    expect(snap.player.alive).toBe(true);
  });

  it('does nothing without the weak force', () => {
    const world = new World(BASE);
    world.step(NONE, CHANGE);
    expect(world.snapshot().player.type).toBe('down');
    expect(world.snapshot().particles).toEqual([]);
    expect(world.drainEvents()).toEqual([]);
  });
});

describe('weak decay', () => {
  // A wide box, so the shed W does not come back and get reabsorbed mid-test.
  const TOP: Scenario = { ...WEAK, walls: { width: 400, height: 40 }, player: { ...BASE.player, particle: { type: 'top' } } };
  const ticksFor = (seconds: number) => Math.round(seconds / FIXED_DT);

  it('the player decays when its time is up, and stays the same player', () => {
    const world = new World(TOP);
    run(world, ticksFor(DECAY_TIME_BY_TYPE.top) - 2);
    expect(world.snapshot().player.type).toBe('top');
    const snap = run(world, 4);
    expect(snap.player).toMatchObject({ type: 'strange', alive: true });
    expect(snap.particles.map((p) => p.type)).toEqual(['W']);
    expect(world.drainEvents()).toMatchObject([{ kind: 'decayed', isPlayer: true, from: { type: 'top' }, to: { type: 'strange' } }]);
  });

  it('the decay clock is not reset by a change: top decays to strange at 7s, then strange at 24s', () => {
    const world = new World(TOP);
    run(world, ticksFor(DECAY_TIME_BY_TYPE.top) + 2);
    expect(world.snapshot().player.type).toBe('strange');
    run(world, ticksFor(DECAY_TIME_BY_TYPE.strange - DECAY_TIME_BY_TYPE.top) - 10);
    expect(world.snapshot().player.type).toBe('strange');
    run(world, 20);
    expect(world.snapshot().player.type).toBe('up');
  });

  it('a type that decays sooner than the timer already shows decays straight on: bottom (16s) -> charm (14s) -> down', () => {
    const world = new World({ ...TOP, player: { ...BASE.player, particle: { type: 'bottom' } } });
    run(world, ticksFor(DECAY_TIME_BY_TYPE.bottom) + 5);
    expect(world.snapshot().player.type).toBe('down');
  });

  it('a decaying particle sheds a W along its motion and recoils from it', () => {
    const world = new World({ ...TOP, player: { ...BASE.player, particle: { type: 'strange' } } });
    // strange: decay expulsion 5 for both the W and the recoil.
    world.step(NONE);
    const before = world.snapshot().player;
    run(world, ticksFor(DECAY_TIME_BY_TYPE.strange) + 2);
    const w = world.snapshot().particles.find((p) => p.type === 'W')!;
    expect(w).toBeDefined();
    expect(w.x).toBeLessThan(before.x); // no motion: the original sends it to the left
  });

  it('a non-player particle decays too, but not while it telegraphs or without the weak force', () => {
    const spawnCharm = (forces: Scenario['forces']): Scenario => ({
      ...BASE,
      forces,
      waves: [{ id: 'w', entries: [{ spawn: 'charm', position: { x: 6, y: 2 }, telegraph: 1 }] }],
      triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
    });
    const on = new World(spawnCharm({ weak: true }));
    run(on, ticksFor(DECAY_TIME_BY_TYPE.charm));
    expect(on.snapshot().particles[0].type).toBe('charm'); // telegraphed for 1s, so not yet
    run(on, ticksFor(1) + 5);
    expect(on.snapshot().particles.map((p) => p.type).sort()).toEqual(['W', 'down']);
    const off = new World(spawnCharm({}));
    run(off, ticksFor(DECAY_TIME_BY_TYPE.charm + 2));
    expect(off.snapshot().particles.map((p) => p.type)).toEqual(['charm']);
  });
});

/** Spawn `entries` at time zero, each already live. */
const withParticles = (base: Scenario, entries: { spawn: object | string; x: number; y: number; vx?: number; vy?: number }[]): Scenario => ({
  ...base,
  waves: [{
    id: 'w',
    entries: entries.map((e) => ({ spawn: e.spawn as never, position: { x: e.x, y: e.y }, velocity: { x: e.vx ?? 0, y: e.vy ?? 0 } })),
  }],
  triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
});

describe('annihilation', () => {
  it('a particle and its antiparticle that meet are both gone, with an event', () => {
    const world = new World(withParticles(BASE, [
      { spawn: 'electron', x: -3, y: 3, vx: 2 },
      { spawn: { type: 'electron', parity: -1 }, x: 3, y: 3, vx: -2 },
    ]));
    expect(run(world, 30).particles).toHaveLength(2);
    const snap = run(world, 120);
    expect(snap.particles).toEqual([]);
    expect(world.drainEvents()).toMatchObject([
      { kind: 'annihilated', playerDied: false, a: { type: 'electron' }, b: { type: 'electron' } },
    ]);
  });

  it('two of the same parity just bounce', () => {
    const world = new World(withParticles(BASE, [
      { spawn: 'electron', x: -3, y: 3, vx: 2 },
      { spawn: 'electron', x: 3, y: 3, vx: -2 },
    ]));
    expect(run(world, 150).particles).toHaveLength(2);
    expect(world.drainEvents()).toEqual([]);
  });

  it('the player can be annihilated; nothing special follows', () => {
    const world = new World(withParticles(BASE, [{ spawn: { type: 'down', parity: -1 }, x: 4, y: 0, vx: -3 }]));
    const snap = run(world, 120);
    expect(snap.player.alive).toBe(false);
    expect(snap.particles).toEqual([]);
    expect(world.drainEvents()).toMatchObject([{ kind: 'annihilated', playerDied: true }]);
    const at = { x: snap.player.x, y: snap.player.y };
    world.step({ x: 1, y: 0 }, CHANGE); // still steps, still ignores the dead
    expect(world.snapshot().player).toMatchObject({ ...at, alive: false });
  });
});

describe('boson absorption', () => {
  const W_PLUS = { type: 'W', parity: 1 };

  it('a charged particle that meets an opposite W upgrades; the W is consumed', () => {
    const world = new World(withParticles(WEAK, [
      { spawn: 'down', x: 3, y: 3 },
      { spawn: W_PLUS, x: -3, y: 3, vx: 3 },
    ]));
    const snap = run(world, 200);
    expect(snap.particles.map((p) => p.type)).toEqual(['charm']);
    expect(world.drainEvents()).toMatchObject([
      { kind: 'absorbed', isPlayer: false, from: { type: 'down' }, to: { type: 'charm' } },
    ]);
  });

  it('the player absorbs a W, becomes the new particle, and keeps control', () => {
    const world = new World(withParticles(WEAK, [{ spawn: W_PLUS, x: 4, y: 0, vx: -3 }]));
    const snap = run(world, 120);
    expect(snap.player).toMatchObject({ type: 'charm', alive: true });
    expect(snap.particles).toEqual([]);
    expect(world.drainEvents()).toMatchObject([{ kind: 'absorbed', isPlayer: true, to: { type: 'charm' } }]);
    expect(run(world, 30, { x: 0, y: 1 }).player.y).toBeGreaterThan(0.1);
  });

  it('a W of the wrong sign, or no weak force, just bounces off', () => {
    const wrongSign = new World(withParticles(WEAK, [{ spawn: { type: 'W', parity: -1 }, x: 4, y: 0, vx: -3 }]));
    expect(run(wrongSign, 120).player.type).toBe('down');
    const noWeak = new World(withParticles(BASE, [{ spawn: W_PLUS, x: 4, y: 0, vx: -3 }]));
    expect(run(noWeak, 120).player.type).toBe('down');
    expect(run(noWeak, 0).particles).toHaveLength(1);
  });
});

describe('input to behaviour, through the bindings table', () => {
  /** What the view does: one input event in, at most one intent out, into the world. */
  const press = (world: World, event: InputEvent, table = BINDINGS) => {
    const intent = intentFor(event, world.snapshot().forces, table);
    world.step(NONE, intent ? [intent] : []);
  };

  it('Space and a tap on the player each change a weak-force player', () => {
    for (const event of ['space', 'tap-self'] as const) {
      const world = new World(WEAK);
      press(world, event);
      expect(world.snapshot().player.type).toBe('up');
    }
  });

  it('editing the one table is enough to rewire an input', () => {
    const world = new World(WEAK);
    press(world, 'space', { ...BINDINGS, space: 'none' });
    expect(world.snapshot().player.type).toBe('down');
    press(world, 'tap-self', { ...BINDINGS, 'tap-self': 'change' });
    expect(world.snapshot().player.type).toBe('up');
  });
});

describe('weak force: what the original does around a change', () => {
  const BIG: Scenario = { ...WEAK, walls: { width: 400, height: 40 } };
  const ticksFor = (seconds: number) => Math.round(seconds / FIXED_DT);
  const types = (w: World) => w.snapshot().particles.map((p) => p.type);

  it('a changing particle takes half a second to reach its new size', () => {
    const world = new World(BIG);
    world.step(NONE, CHANGE);
    expect(world.snapshot().player.radius).toBeCloseTo(radiusOf('down'), 2);
    const after = run(world, ticksFor(0.5) + 1);
    expect(after.player.type).toBe('up');
    expect(after.player.radius).toBeCloseTo(radiusOf('up'), 5);
  });

  it('the W it sheds grows from nothing', () => {
    const world = new World(BIG);
    world.step(NONE, CHANGE);
    expect(world.snapshot().particles[0].radius).toBeLessThan(0.2);
    expect(run(world, ticksFor(0.5) + 1).particles[0].radius).toBeCloseTo(radiusOf('W'), 5);
  });

  it('a W decays after 5s into an electron (shot along its heading) and a neutrino (sent the other way)', () => {
    const world = new World(withParticles(BIG, [{ spawn: { type: 'W', parity: 1 }, x: 50, y: 15 }]));
    run(world, ticksFor(DECAY_TIME_BY_TYPE.W) - 2);
    expect(types(world)).toEqual(['W']);
    run(world, 4);
    expect(types(world).sort()).toEqual(['electron', 'electronNeutrino']);
    expect(world.drainEvents()).toMatchObject([{ kind: 'bosonDecayed', boson: { type: 'W' } }]);
    const before = world.snapshot().particles;
    const after = run(world, 5).particles;
    const moved = (t: string) => after.find((p) => p.type === t)!.x - before.find((p) => p.type === t)!.x;
    // The W faces the player (to its left), so the electron goes left at 10 and the neutrino right at 100.
    expect(moved('electron')).toBeCloseTo(-10 * 5 * FIXED_DT, 0);
    expect(moved('electronNeutrino')).toBeCloseTo(100 * 5 * FIXED_DT, 0);
  });

  it('a neutrino is destroyed half a second after it should have reached the bounds', () => {
    const world = new World(withParticles(BIG, [{ spawn: { type: 'W', parity: 1 }, x: 50, y: 0 }]));
    run(world, ticksFor(DECAY_TIME_BY_TYPE.W) + 2);
    expect(types(world)).toContain('electronNeutrino');
    // From x = 50 to the right wall at 200: 1.5s of flight, plus 0.5s.
    run(world, ticksFor(1.9));
    expect(types(world)).toContain('electronNeutrino');
    run(world, ticksFor(0.3));
    expect(types(world)).not.toContain('electronNeutrino');
  });

  it('an electron that absorbs a W becomes a neutrino, flying at neutrino speed', () => {
    const world = new World(withParticles(BIG, [
      { spawn: 'electron', x: 50, y: 15 },
      { spawn: { type: 'W', parity: 1 }, x: 47, y: 15, vx: 3 },
    ]));
    for (let i = 0; i < 300 && !types(world).includes('muonNeutrino'); i++) world.step(NONE);
    expect(types(world)).toEqual(['muonNeutrino']);
    const a = world.snapshot().particles[0];
    world.step(NONE);
    const b = world.snapshot().particles[0];
    expect(Math.hypot(b.x - a.x, b.y - a.y) / FIXED_DT).toBeGreaterThan(90);
  });

  it('a quark that absorbs a W keeps the momentum of both, spread over the change', () => {
    // A heavier W than the quark would drag it: just check it ends up moving the way the sum says.
    const world = new World(withParticles(BIG, [
      { spawn: 'down', x: 50, y: 15 },
      { spawn: { type: 'W', parity: 1 }, x: 47, y: 15, vx: 6 },
    ]));
    for (let i = 0; i < 300 && !types(world).includes('charm'); i++) world.step(NONE);
    const start = world.snapshot().particles[0].x;
    run(world, ticksFor(0.5) + 25);
    const end = world.snapshot().particles[0].x;
    // Momentum: W (6 * 5.15) over charm (mass pi * 2^2 = 12.57), about 2.5 units/s.
    expect((end - start) / (0.75 + 0.5)).toBeGreaterThan(1);
  });
});
