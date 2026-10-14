import { describe, it, expect } from 'vitest';
import { World } from './world';
import type { Scenario } from '../scenario/types';

const SCENARIO: Scenario = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0, radius: 0.5 } };
const RIGHT = { x: 1, y: 0 };
const NONE = { x: 0, y: 0 };
// Box2D lets bodies sink a hair into contacts (linear slop, 0.005); containment is within that.
const SLOP = 0.02;

function run(world: World, input: { x: number; y: number }, steps: number) {
  for (let i = 0; i < steps; i++) world.step(input);
  return world.snapshot();
}

describe('World', () => {
  it('starts at rest where the scenario puts the player', () => {
    const snap = new World(SCENARIO).snapshot();
    expect(snap.player).toMatchObject({ x: 0, y: 0, radius: 0.5 });
    expect(snap.walls).toEqual({ width: 20, height: 10 });
    expect(snap.tick).toBe(0);
  });

  it('steering accelerates the player in that direction', () => {
    const world = new World(SCENARIO);
    const snap = run(world, RIGHT, 30);
    expect(snap.tick).toBe(30);
    expect(snap.player.x).toBeGreaterThan(0.1);
    expect(snap.player.y).toBeCloseTo(0, 5);
  });

  it('without steering the player slows to a stop', () => {
    const world = new World(SCENARIO);
    run(world, RIGHT, 30);
    run(world, NONE, 600);
    const a = world.snapshot().player.x;
    run(world, NONE, 60);
    expect(world.snapshot().player.x).toBeCloseTo(a, 2);
  });

  it('cannot leave the walls, however long it pushes', () => {
    const world = new World(SCENARIO);
    for (const dir of [RIGHT, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 0.7, y: 0.7 }]) {
      for (let i = 0; i < 1500; i++) {
        world.step(dir);
        const { player } = world.snapshot();
        expect(Math.abs(player.x) + player.radius).toBeLessThanOrEqual(10 + SLOP);
        expect(Math.abs(player.y) + player.radius).toBeLessThanOrEqual(5 + SLOP);
      }
    }
  });

  it('reaches the wall when pushed into it', () => {
    const snap = run(new World(SCENARIO), RIGHT, 1500);
    expect(snap.player.x).toBeGreaterThan(9);
  });

  it('snapshots are plain data, detached from the world', () => {
    const world = new World(SCENARIO);
    const before = world.snapshot();
    run(world, RIGHT, 10);
    expect(before.player.x).toBe(0);
    expect(JSON.parse(JSON.stringify(before))).toEqual(before);
  });
});

describe('World waves', () => {
  const WAVES: Scenario = {
    ...SCENARIO,
    waves: [{ id: 'w', entries: [{ spawn: 'electron', position: { x: 5, y: 2 }, telegraph: 1 }] }],
    triggers: [{ kind: 'time', at: 0.5, actions: [{ kind: 'spawn', wave: 'w' }] }],
  };
  const TICKS_PER_SECOND = 60;

  it('a scheduled wave appears on time, flagged not live while it telegraphs', () => {
    const world = new World(WAVES);
    run(world, NONE, 0.5 * TICKS_PER_SECOND);
    expect(world.snapshot().particles).toEqual([]);
    run(world, NONE, 2);
    const [p] = world.snapshot().particles;
    expect(p).toMatchObject({ type: 'electron', colour: 'white', parity: 1, x: 5, y: 2, live: false });
  });

  it('goes live once the telegraph has run, and not a step before', () => {
    const world = new World(WAVES);
    run(world, NONE, 31); // spawned on the 31st step (tick 30)
    run(world, NONE, 59);
    expect(world.snapshot().particles[0].live).toBe(false);
    run(world, NONE, 1);
    expect(world.snapshot().particles[0].live).toBe(true);
  });

  const ON_PLAYER: Scenario = {
    ...SCENARIO,
    waves: [{ id: 'w', entries: [{ spawn: 'electron', position: { x: 0.2, y: 0 }, velocity: { x: 3, y: 0 }, telegraph: 1 }] }],
    triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
  };

  it('a telegraphing particle neither moves nor collides, even overlapping the player', () => {
    const world = new World(ON_PLAYER);
    const snap = run(world, NONE, 59);
    expect(snap.particles[0]).toMatchObject({ x: 0.2, y: 0, live: false });
    expect(snap.player).toMatchObject({ x: 0, y: 0 });
  });

  it('once live it moves with its velocity and collides with the player', () => {
    const world = new World(ON_PLAYER);
    const snap = run(world, NONE, 90);
    expect(snap.particles[0].live).toBe(true);
    expect(snap.particles[0].x).toBeGreaterThan(0.2);
    expect(Math.abs(snap.player.x)).toBeGreaterThan(0.001);
  });

  it('a repeating trigger spawns a fresh wave on schedule', () => {
    const world = new World({
      ...SCENARIO,
      waves: [{ id: 'w', entries: [{ spawn: 'up', position: { x: 8, y: 3 } }] }],
      triggers: [{ kind: 'time', at: 1, every: 1, repeats: 2, actions: [{ kind: 'spawn', wave: 'w' }] }],
    });
    const counts = [60, 1, 59, 1, 59, 1, 120].map((n) => run(world, NONE, n).particles.length);
    expect(counts).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('World forces', () => {
  const pairScenario = (forces: Scenario['forces'], right: object): Scenario => ({
    ...SCENARIO,
    forces,
    waves: [{
      id: 'w',
      entries: [
        { spawn: { type: 'electron' }, position: { x: -2, y: 0 } },
        { spawn: { type: 'electron', ...right }, position: { x: 2, y: 0 } },
      ],
    }],
    triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
  });
  const gap = (snap: ReturnType<World['snapshot']>) => snap.particles[1].x - snap.particles[0].x;

  it('with EM on, an electron and a positron accelerate together', () => {
    const snap = run(new World(pairScenario({ em: true }, { parity: -1 })), NONE, 30);
    expect(gap(snap)).toBeLessThan(3.9);
    expect(snap.particles[0].x).toBeGreaterThan(-2);
    expect(snap.particles[1].x).toBeLessThan(2);
  });

  it('with EM off they do not move', () => {
    const snap = run(new World(pairScenario({ em: false }, { parity: -1 })), NONE, 30);
    expect(gap(snap)).toBe(4);
  });

  it('with EM on, two electrons push apart', () => {
    const snap = run(new World(pairScenario({ em: true }, {})), NONE, 30);
    expect(gap(snap)).toBeGreaterThan(4.1);
  });

  const holeScenario = (forces: Scenario['forces']): Scenario => ({
    ...SCENARIO,
    forces,
    blackHoles: [{ x: 0, y: 0, mass: 10 }],
    waves: [{ id: 'w', entries: [{ spawn: 'electronNeutrino', position: { x: 5, y: 0 } }] }],
    triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
  });

  it('a black hole is inert until gravity is on', () => {
    expect(run(new World(holeScenario({ gravity: false })), NONE, 60).particles[0].x).toBe(5);
    expect(run(new World(holeScenario(undefined)), NONE, 60).particles[0].x).toBe(5);
  });

  it('with gravity on, a black hole pulls a particle toward it', () => {
    const snap = run(new World(holeScenario({ gravity: true })), NONE, 60);
    expect(snap.particles[0].x).toBeLessThan(4.5);
    expect(snap.particles[0].y).toBeCloseTo(0, 5);
  });

  it('the snapshot reports the switches and the black holes as plain data', () => {
    const snap = new World(holeScenario({ em: true })).snapshot();
    expect(snap.forces).toEqual({ strong: false, weak: false, em: true, gravity: false });
    expect(snap.blackHoles).toEqual([{ x: 0, y: 0, mass: 10, radius: Math.sqrt(10 / Math.PI) }]);
  });
});

describe('World page buttons', () => {
  const BUTTON: Scenario = {
    ...SCENARIO,
    waves: [{ id: 'w', entries: [{ spawn: 'electron', position: { x: 5, y: 2 } }] }],
    triggers: [{ kind: 'page-button', button: 'go', actions: [{ kind: 'spawn', wave: 'w' }] }],
  };

  it('spawns when the named button is pressed in a step, and not otherwise', () => {
    const world = new World(BUTTON);
    run(world, NONE, 5);
    expect(world.snapshot().particles).toEqual([]);
    world.step(NONE, [], ['other']);
    expect(world.snapshot().particles).toEqual([]);
    world.step(NONE, [], ['go']);
    expect(world.snapshot().particles).toHaveLength(1);
    run(world, NONE, 5);
    expect(world.snapshot().particles).toHaveLength(1);
  });
});
