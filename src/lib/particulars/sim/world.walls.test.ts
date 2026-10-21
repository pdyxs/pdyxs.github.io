import { describe, it, expect } from 'vitest';
import { World } from './world';
import { radiusOf } from '../constants';
import type { ParticleDef, Scenario, WallDef, WallMode } from '../scenario/types';

const RIGHT = { x: 1, y: 0 };
const POSITIVE: ParticleDef = { type: 'up' }; // +2
const NEGATIVE: ParticleDef = { type: 'electron' }; // -3

/** A tall wall at x = 3 across the player's path, in the given mode. */
const wallScenario = (mode: WallMode, particle: ParticleDef): Scenario => ({
  walls: { width: 20, height: 10 },
  player: { x: 0, y: 0, particle },
  barriers: [{ shape: 'rect', mode, x: 3, y: 0, width: 0.5, height: 8 }],
});

function pushRight(scenario: Scenario, steps = 400) {
  const world = new World(scenario);
  for (let i = 0; i < steps; i++) world.step(RIGHT);
  return world;
}

describe('rect walls by mode', () => {
  it.each([
    ['all', POSITIVE, 'blocks'],
    ['all', NEGATIVE, 'blocks'],
    ['positive', POSITIVE, 'blocks'],
    ['positive', NEGATIVE, 'passes'],
    ['negative', NEGATIVE, 'blocks'],
    ['negative', POSITIVE, 'passes'],
  ] as const)('%s wall %s %s', (mode, particle, outcome) => {
    const { player } = pushRight(wallScenario(mode, particle)).snapshot();
    if (outcome === 'blocks') expect(player.x).toBeLessThan(3 - 0.25 - radiusOf(particle.type as 'up') + 0.02);
    else expect(player.x).toBeGreaterThan(5);
    expect(player.alive).toBe(true);
  });

  it('destroy walls block nothing and kill what touches them', () => {
    const world = pushRight(wallScenario('destroy', POSITIVE));
    const { player } = world.snapshot();
    expect(player.alive).toBe(false);
    expect(world.drainEvents()).toEqual([
      expect.objectContaining({ kind: 'destroyed', isPlayer: true, particle: expect.objectContaining({ type: 'up' }) }),
    ]);
  });

  it('a destroy wall removes a spawned particle too', () => {
    const world = new World({
      walls: { width: 20, height: 10 },
      player: { x: -8, y: 4 },
      barriers: [{ shape: 'rect', mode: 'destroy', x: 3, y: 0, width: 0.5, height: 8 }],
      waves: [{ id: 'w', entries: [{ spawn: 'electron', position: { x: 0, y: 0 }, velocity: { x: 3, y: 0 } }] }],
      triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
    });
    for (let i = 0; i < 120; i++) world.step({ x: 0, y: 0 });
    expect(world.snapshot().particles).toHaveLength(0);
    expect(world.drainEvents()).toEqual([expect.objectContaining({ kind: 'destroyed', isPlayer: false })]);
  });

  it('exposes walls in the snapshot as plain data', () => {
    const barriers: WallDef[] = [{ shape: 'rect', mode: 'negative', x: 3, y: 0, width: 0.5, height: 8 }];
    const snap = new World({ ...wallScenario('all', POSITIVE), barriers }).snapshot();
    expect(snap.barriers).toEqual(barriers);
  });
});

describe('arc walls', () => {
  it('a ring of collision pieces contains particles fired at it from every angle', () => {
    const angles = Array.from({ length: 24 }, (_, i) => i * 15 + 7);
    const world = new World({
      walls: { width: 20, height: 12 },
      player: { x: 8, y: 5 },
      barriers: [{ shape: 'arc', mode: 'all', x: 0, y: 0, radius: 4, thickness: 0.5 }],
      waves: [{ id: 'w', entries: angles.map((angle) => ({ spawn: 'electron', velocity: { magnitude: 8, angle } })) }],
      triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
    });
    for (let i = 0; i < 600; i++) {
      world.step({ x: 0, y: 0 });
      for (const p of world.snapshot().particles) {
        expect(Math.hypot(p.x, p.y) + p.radius).toBeLessThanOrEqual(3.5 + 0.05);
      }
    }
    expect(world.snapshot().particles).toHaveLength(24);
  });

  it('a positive arc passes a negative particle through', () => {
    const world = new World({
      walls: { width: 20, height: 12 },
      player: { x: 0, y: 0, particle: NEGATIVE },
      barriers: [{ shape: 'arc', mode: 'positive', x: 0, y: 0, radius: 3, thickness: 0.5 }],
    });
    for (let i = 0; i < 400; i++) world.step(RIGHT);
    expect(world.snapshot().player.x).toBeGreaterThan(5);
  });
});
