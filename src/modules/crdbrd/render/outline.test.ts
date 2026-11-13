import { describe, it, expect } from 'vitest';
import { outline } from './outline.ts';
import type { ComponentSet } from '../model/types.ts';

const set = (over: Partial<ComponentSet> = {}): ComponentSet => ({ id: 's', name: 'S', substitute: '', properties: [], components: [], children: [], ...over });

describe('outline', () => {
  it('draws a square-cornered rectangle from the set size, with its bleed', () => {
    const o = outline(set({ size: { width: 63, height: 88 }, bleed: 3 }));
    expect(o.size).toEqual({ width: 63, height: 88 });
    expect(o.bleed).toBe(3);
    expect(o.cutPath).toBe('M0 0H63V88H0Z');
  });

  it('rounds the corners with arcs when the outline has a radius', () => {
    const o = outline(set({ size: { width: 60, height: 80 }, outline: { kind: 'rectangle', radius: 5 } }));
    expect(o.cutPath).toBe('M5 0H55A5 5 0 0 1 60 5V75A5 5 0 0 1 55 80H5A5 5 0 0 1 0 75V5A5 5 0 0 1 5 0Z');
  });

  it('caps a radius that is larger than half the shorter side', () => {
    const o = outline(set({ size: { width: 20, height: 40 }, outline: { kind: 'rectangle', radius: 50 } }));
    expect(o.cutPath).toContain('A10 10');
  });

  it('falls back to a poker card with no bleed for a set with no geometry', () => {
    const o = outline(set());
    expect(o.size).toEqual({ width: 63.5, height: 88.9 });
    expect(o.bleed).toBe(0);
  });
});
