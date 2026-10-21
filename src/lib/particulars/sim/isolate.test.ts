import { describe, it, expect } from 'vitest';
import { isolateWaves } from './isolate';
import { World } from './world';
import type { Scenario } from '../scenario/types';

const SCENARIO: Scenario = {
  walls: { width: 40, height: 20 },
  player: { x: 0, y: 8 },
  forces: {},
  formations: { trio: { kind: 'line', count: 3, distance: 2, contents: ['electron'] } },
  waves: [
    { id: 'one', entries: [{ spawn: 'electron', position: { x: -5, y: 0 } }] },
    { id: 'three', entries: [{ spawn: 'trio', position: { x: 5, y: 0 } }] },
    { id: 'late', entries: [{ spawn: 'muon', position: { x: 0, y: -5 } }] },
  ],
  triggers: [
    { kind: 'time', at: 5, actions: [{ kind: 'spawn', wave: 'one' }] },
    { kind: 'page-button', button: 'go', actions: [{ kind: 'spawn', wave: 'late' }] },
  ],
};

/** Run headless for `seconds` and say what appeared. */
function spawnedBy(scenario: Scenario, seconds = 0.1) {
  const world = new World(scenario);
  for (let i = 0; i < seconds * 60; i++) world.step({ x: 0, y: 0 });
  return world.snapshot().particles.map((p) => p.type).sort();
}

describe('isolateWaves', () => {
  it('spawns the chosen waves at once and nothing else', () => {
    expect(spawnedBy(isolateWaves(SCENARIO, ['three']))).toEqual(['electron', 'electron', 'electron']);
  });

  it('two waves run together', () => {
    expect(spawnedBy(isolateWaves(SCENARIO, ['one', 'late']))).toEqual(['electron', 'muon']);
  });

  it('ignores the original triggers: a wave on a later timer or a button still runs, and an unchosen one never does', () => {
    expect(spawnedBy(isolateWaves(SCENARIO, ['one']), 0.1)).toEqual(['electron']);
    expect(spawnedBy(isolateWaves(SCENARIO, ['one']), 6)).toEqual(['electron']);
  });

  it('does not mutate the scenario it is given', () => {
    const before = JSON.stringify(SCENARIO);
    isolateWaves(SCENARIO, ['one']);
    expect(JSON.stringify(SCENARIO)).toBe(before);
  });

  it('choosing nothing, or ids that do not exist, spawns nothing', () => {
    expect(spawnedBy(isolateWaves(SCENARIO, []))).toEqual([]);
    expect(spawnedBy(isolateWaves(SCENARIO, ['nope']))).toEqual([]);
  });
});
