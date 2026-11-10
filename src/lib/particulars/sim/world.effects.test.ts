import { describe, it, expect } from 'vitest';
import { World } from './world';
import type { Scenario } from '../scenario/types';
import { EXPLOSION_SECONDS, FIXED_DT, PLAYER_EXPLOSION_COOLDOWN_SECONDS } from '../constants';

const BASE: Scenario = { walls: { width: 40, height: 20 }, player: { x: 0, y: 0 } };
const NONE = { x: 0, y: 0 };
const EXPLODE = [{ kind: 'explode' as const }];
const secs = (s: number) => Math.round(s / FIXED_DT);

/** A matter/antimatter electron pair that meets near (0, 6), away from the player. */
const colliding = (over: Partial<Scenario> = {}, y = 6): Scenario => ({
  ...BASE,
  ...over,
  waves: [{ id: 'w', entries: [
    { spawn: 'electron', position: { x: -3, y }, velocity: { x: 2, y: 0 } },
    { spawn: { type: 'electron', parity: -1 }, position: { x: 3, y }, velocity: { x: -2, y: 0 } },
  ] }],
  triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
});

function until(world: World, done: () => boolean, limit = 400) {
  for (let i = 0; i < limit && !done(); i++) world.step(NONE);
}

describe('explosions', () => {
  it('an annihilation sets one off at the midpoint, which grows and then goes', () => {
    const world = new World(colliding());
    until(world, () => world.snapshot().explosions.length > 0);
    const [x] = world.snapshot().explosions;
    expect(x.y).toBeCloseTo(6, 0);
    expect(x.radius).toBeLessThan(x.maxRadius);
    for (let i = 0; i < secs(EXPLOSION_SECONDS) + 5; i++) world.step(NONE);
    expect(world.snapshot().explosions).toEqual([]);
  });

  it('pushes a particle inside it away', () => {
    const scenario = colliding();
    scenario.waves![0].entries.push({ spawn: 'muon', position: { x: 0, y: 8 }, velocity: { x: 0, y: 0 } });
    const world = new World(scenario);
    until(world, () => world.snapshot().explosions.length > 0);
    const before = world.snapshot().particles.find((p) => p.type === 'muon')!;
    for (let i = 0; i < 20; i++) world.step(NONE);
    const after = world.snapshot().particles.find((p) => p.type === 'muon')!;
    expect(after.y).toBeGreaterThan(before.y); // the muon sits below (y down) the blast
  });

  it('the player sets one off with explode, once per cooldown, and is not pushed by it', () => {
    const world = new World(BASE);
    world.step(NONE, EXPLODE);
    expect(world.snapshot().explosions).toHaveLength(1);
    expect(world.drainEvents()).toMatchObject([{ kind: 'exploded', byPlayer: true }]);
    world.step(NONE, EXPLODE);
    expect(world.snapshot().explosions).toHaveLength(1);
    for (let i = 0; i < secs(PLAYER_EXPLOSION_COOLDOWN_SECONDS); i++) world.step(NONE);
    world.step(NONE, EXPLODE);
    expect(world.drainEvents().filter((e) => e.kind === 'exploded')).toHaveLength(1);
    expect(Math.hypot(world.snapshot().player.x, world.snapshot().player.y)).toBeLessThan(1e-9);
  });
});

describe('pickups', () => {
  it('are off unless the scenario asks for them', () => {
    const world = new World(colliding());
    for (let i = 0; i < 300; i++) world.step(NONE);
    expect(world.snapshot()).toMatchObject({ pickupsEnabled: false, pickups: [], collected: 0 });
  });

  it('an annihilation drops one, which drifts to the player and is collected', () => {
    const world = new World(colliding({ pickups: true }));
    until(world, () => world.snapshot().pickups.length > 0);
    expect(world.snapshot().pickupsEnabled).toBe(true);
    until(world, () => world.snapshot().collected > 0, 1000);
    const snap = world.snapshot();
    expect(snap.collected).toBe(1);
    expect(snap.pickups).toEqual([]);
    expect(world.drainEvents()).toContainEqual({ tick: expect.any(Number), kind: 'pickedUp', collected: 1 });
  });

  it('fade away if nothing collects them', () => {
    const world = new World(colliding({ pickups: true, walls: { width: 400, height: 200 } }, 60));
    until(world, () => world.snapshot().pickups.length > 0);
    for (let i = 0; i < secs(6); i++) world.step(NONE);
    expect(world.snapshot()).toMatchObject({ pickups: [], collected: 0 });
  });
});

describe('switching forces at run time', () => {
  it('setForce changes what the snapshot reports, and forces act from then on', () => {
    const world = new World({ ...BASE, forces: { em: false } });
    expect(world.snapshot().forces.em).toBe(false);
    world.setForce('em', true);
    expect(world.snapshot().forces).toMatchObject({ em: true, weak: false });
    world.setForce('em', false);
    expect(world.snapshot().forces.em).toBe(false);
  });

  it('turning the weak force on enables a change that was refused', () => {
    const world = new World({ ...BASE, forces: { weak: false } });
    world.step(NONE, [{ kind: 'change' }]);
    expect(world.snapshot().player.type).toBe('down');
    world.setForce('weak', true);
    world.step(NONE, [{ kind: 'change' }]);
    expect(world.snapshot().player.type).toBe('up');
  });
});
