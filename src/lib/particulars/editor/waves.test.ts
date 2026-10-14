import { describe, it, expect } from 'vitest';
import { triggersForWave } from './waves.ts';
import type { Scenario } from '../scenario/types';

const s: Scenario = {
  walls: { width: 10, height: 6 },
  player: { x: 0, y: 0, radius: 0.5 },
  waves: [{ id: 'a', entries: [] }, { id: 'b', entries: [] }],
  triggers: [
    { kind: 'time', at: 2, actions: [{ kind: 'spawn', wave: 'a' }] },
    { kind: 'page-button', button: 'go', actions: [{ kind: 'spawn', wave: 'a' }] },
    { kind: 'time', at: 5, every: 3, actions: [{ kind: 'spawn', wave: 'b' }, { kind: 'spawn', wave: 'a' }] },
  ],
};

describe('triggersForWave', () => {
  it('lists, in authored order, the triggers whose actions spawn the wave, with their index', () => {
    expect(triggersForWave(s, 'a').map((t) => t.index)).toEqual([0, 1, 2]);
    expect(triggersForWave(s, 'b').map((t) => t.index)).toEqual([2]);
    expect(triggersForWave(s, 'none')).toEqual([]);
  });
});
