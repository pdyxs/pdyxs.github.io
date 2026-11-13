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

describe('outline: circle', () => {
  it('is a circle whose diameter is the set width, with a square bounding size', () => {
    const o = outline(set({ size: { width: 40, height: 99 }, bleed: 2, outline: { kind: 'circle' } }));
    expect(o.size).toEqual({ width: 40, height: 40 });
    expect(o.bleed).toBe(2);
    expect(o.cutPath).toBe('M0 20A20 20 0 0 1 40 20A20 20 0 0 1 0 20Z');
  });
});

describe('outline: hexagon', () => {
  const hex = (orientation: 'pointy' | 'flat', measure: 'flat-to-flat' | 'point-to-point', width: number) =>
    outline(set({ size: { width, height: 1 }, outline: { kind: 'hexagon', orientation, measure } }));

  it('flat-topped, width measured point-to-point: height is the flat-to-flat', () => {
    const o = hex('flat', 'point-to-point', 20);
    expect(o.size).toEqual({ width: 20, height: 17.321 });
    expect(o.cutPath).toBe('M0 8.66L5 0L15 0L20 8.66L15 17.321L5 17.321Z');
  });

  it('pointy-topped, width measured flat-to-flat: height is the point-to-point', () => {
    const o = hex('pointy', 'flat-to-flat', 10 * Math.sqrt(3));
    expect(o.size).toEqual({ width: 17.321, height: 20 });
    expect(o.cutPath).toBe('M8.66 0L17.321 5L17.321 15L8.66 20L0 15L0 5Z');
  });

  it('the width is the flat-to-flat when asked, whichever way up', () => {
    expect(hex('flat', 'flat-to-flat', 10 * Math.sqrt(3)).size).toEqual({ width: 20, height: 17.321 });
    expect(hex('pointy', 'point-to-point', 20).size).toEqual({ width: 17.321, height: 20 });
  });
});

describe('outline: custom', () => {
  it('uses the path as given, in the set size', () => {
    const o = outline(set({ size: { width: 30, height: 20 }, bleed: 1, outline: { kind: 'custom', path: 'M0 0L30 0L15 20Z' } }));
    expect(o).toEqual({ cutPath: 'M0 0L30 0L15 20Z', size: { width: 30, height: 20 }, bleed: 1 });
  });

  it('falls back to a rectangle when the path is not valid, so a preview never breaks', () => {
    const o = outline(set({ size: { width: 30, height: 20 }, outline: { kind: 'custom', path: 'M0 0 nonsense' } }));
    expect(o.cutPath).toBe('M0 0H30V20H0Z');
  });
});
