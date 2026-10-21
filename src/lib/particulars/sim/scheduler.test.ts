import { describe, it, expect } from 'vitest';
import { dueSpawns, initialSchedule } from './scheduler';
import type { Scenario } from '../scenario/types';

const base = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0 } };
const scenario = (triggers: Scenario['triggers']): Scenario => ({
  ...base,
  waves: [{ id: 'w', entries: [{ spawn: 'electron' }, { spawn: 'up' }] }],
  triggers,
});

describe('dueSpawns', () => {
  it('fires a time trigger once its time has come, and only once', () => {
    const s = scenario([{ kind: 'time', at: 2, actions: [{ kind: 'spawn', wave: 'w' }] }]);
    const early = dueSpawns(s, 1.9, initialSchedule());
    expect(early.spawns).toEqual([]);
    const on = dueSpawns(s, 2, early.state);
    expect(on.spawns.map((x) => x.particle.type)).toEqual(['electron', 'up']);
    const after = dueSpawns(s, 3, on.state);
    expect(after.spawns).toEqual([]);
  });

  const count = (s: Scenario, times: number[]) => {
    let state = initialSchedule();
    return times.map((t) => {
      const r = dueSpawns(s, t, state);
      state = r.state;
      return r.spawns.length / 2;
    });
  };

  it('a repeating trigger fires every interval, the given number of extra times', () => {
    const s = scenario([{ kind: 'time', at: 1, every: 2, repeats: 2, actions: [{ kind: 'spawn', wave: 'w' }] }]);
    // fires at 1, 3, 5 and then never again
    expect(count(s, [0.5, 1, 2, 3, 4, 5, 6, 100])).toEqual([0, 1, 0, 1, 0, 1, 0, 0]);
  });

  it('omitted repeats means forever', () => {
    const s = scenario([{ kind: 'time', at: 0, every: 1, actions: [{ kind: 'spawn', wave: 'w' }] }]);
    expect(count(s, [0, 1, 2, 50]).slice(0, 3)).toEqual([1, 1, 1]);
    expect(count(s, [0, 1000])[1]).toBeGreaterThan(0);
  });

  it('a late call catches up on every missed firing', () => {
    const s = scenario([{ kind: 'time', at: 0, every: 1, repeats: 9, actions: [{ kind: 'spawn', wave: 'w' }] }]);
    expect(count(s, [4.5])).toEqual([5]);
  });

  it('tolerates floating-point drift in the clock', () => {
    const s = scenario([{ kind: 'time', at: 0.3, actions: [{ kind: 'spawn', wave: 'w' }] }]);
    expect(count(s, [0.1 + 0.2])).toEqual([1]);
  });
});

describe('dueSpawns page-button triggers', () => {
  const s = scenario([
    { kind: 'page-button', button: 'go', actions: [{ kind: 'spawn', wave: 'w' }] },
    { kind: 'time', at: 0, actions: [] },
  ]);

  it('spawns nothing until the button is pressed, and each press spawns once', () => {
    const idle = dueSpawns(s, 5, initialSchedule());
    expect(idle.spawns).toEqual([]);
    const press = dueSpawns(s, 5, idle.state, ['go']);
    expect(press.spawns.map((x) => x.particle.type)).toEqual(['electron', 'up']);
    const next = dueSpawns(s, 6, press.state);
    expect(next.spawns).toEqual([]);
    expect(dueSpawns(s, 7, next.state, ['go', 'go']).spawns).toHaveLength(4);
  });

  it('ignores a button no trigger names', () => {
    expect(dueSpawns(s, 1, initialSchedule(), ['nope']).spawns).toEqual([]);
  });
});
