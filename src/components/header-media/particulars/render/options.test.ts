import { describe, it, expect } from 'vitest';
import { chooseVariants } from './options';
import { projectionFor } from './projection';
import type { LayerDef } from './types';

const def = (id: string, variants: string[], defaultVariant: string): LayerDef => ({
  id, z: 0, variants, defaultVariant, create: () => ({ frame() {}, destroy() {} }),
});

describe('chooseVariants', () => {
  const defs = [def('trails', ['a', 'b'], 'a'), def('blobs', ['x'], 'off')];
  it('uses defaults with no query', () => {
    expect(chooseVariants(defs, '')).toEqual({ trails: 'a', blobs: 'off' });
  });
  it('honours a known variant and off', () => {
    expect(chooseVariants(defs, '?pv-trails=b&pv-blobs=x')).toEqual({ trails: 'b', blobs: 'x' });
    expect(chooseVariants(defs, '?pv-trails=off')).toEqual({ trails: 'off', blobs: 'off' });
  });
  it('ignores an unknown variant', () => {
    expect(chooseVariants(defs, '?pv-trails=zzz')).toEqual({ trails: 'a', blobs: 'off' });
  });
});

describe('projectionFor', () => {
  it('letterboxes like xMidYMid meet', () => {
    const p = projectionFor({ x: -10, y: -5, width: 20, height: 10 }, 100, 100, 2);
    expect(p.scale).toBe(10);
    expect(p.offsetX).toBe(0);
    expect(p.offsetY).toBe(50);
    expect(p.width).toBe(200);
  });
});
