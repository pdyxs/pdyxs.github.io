import { describe, it, expect } from 'vitest';
import { applyEdit } from './edit.ts';
import type { Scenario } from '../scenario/types';

const base: Scenario = {
  walls: { width: 24, height: 12 },
  player: { x: 0, y: 0 },
  waves: [
    { id: 'a', entries: [{ spawn: 'electron' }] },
    { id: 'b', entries: [{ spawn: 'up' }] },
  ],
};

describe('applyEdit', () => {
  it('sets a nested value without mutating the input', () => {
    const next = applyEdit(base, { kind: 'set', path: ['waves', 0, 'entries', 0, 'spawn'], value: 'muon' });
    expect(next.waves![0].entries[0].spawn).toBe('muon');
    expect(base.waves![0].entries[0].spawn).toBe('electron');
    expect(next.waves![1]).toBe(base.waves![1]);
  });
});

describe('applyEdit remove', () => {
  it('removes an array item', () => {
    const next = applyEdit(base, { kind: 'remove', path: ['waves', 0] });
    expect(next.waves!.map((w) => w.id)).toEqual(['b']);
    expect(base.waves).toHaveLength(2);
  });
  it('removes an object key', () => {
    const withForces = { ...base, forces: { em: true, gravity: true } };
    const next = applyEdit(withForces, { kind: 'remove', path: ['forces', 'em'] });
    expect(next.forces).toEqual({ gravity: true });
  });
});

describe('applyEdit insert', () => {
  it('appends to an array when no index is given', () => {
    const next = applyEdit(base, { kind: 'insert', path: ['waves'], value: { id: 'c', entries: [] } });
    expect(next.waves!.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });
  it('inserts at an index', () => {
    const next = applyEdit(base, { kind: 'insert', path: ['waves'], index: 1, value: { id: 'c', entries: [] } });
    expect(next.waves!.map((w) => w.id)).toEqual(['a', 'c', 'b']);
  });
  it('creates the array when the key is absent', () => {
    const next = applyEdit(base, { kind: 'insert', path: ['triggers'], value: { kind: 'time', at: 1, actions: [] } });
    expect(next.triggers).toHaveLength(1);
  });
});

describe('applyEdit move', () => {
  it('reorders an array item, so waves keep an authored order', () => {
    const next = applyEdit(base, { kind: 'move', path: ['waves'], from: 0, to: 1 });
    expect(next.waves!.map((w) => w.id)).toEqual(['b', 'a']);
  });
  it('ignores an out-of-range move', () => {
    expect(applyEdit(base, { kind: 'move', path: ['waves'], from: 0, to: 5 })).toBe(base);
  });
});

describe('applyEdit rename-wave', () => {
  const withTrigger: Scenario = {
    ...base,
    triggers: [{ kind: 'time', at: 1, actions: [{ kind: 'spawn', wave: 'a' }, { kind: 'spawn', wave: 'b' }] }],
  };
  it('renames the wave and every action that spawns it', () => {
    const next = applyEdit(withTrigger, { kind: 'rename-wave', from: 'a', to: 'z' });
    expect(next.waves!.map((w) => w.id)).toEqual(['z', 'b']);
    expect(next.triggers![0].actions.map((a) => a.wave)).toEqual(['z', 'b']);
  });
});
