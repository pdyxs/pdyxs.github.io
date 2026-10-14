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
