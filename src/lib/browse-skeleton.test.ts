import { describe, it, expect } from 'vitest';
import {
  SKELETON_TILE_COUNT,
  SKELETON_STRIP_TILE_COUNT,
  skeletonTiles,
  skeletonTileCount,
} from './browse-skeleton';
import { DEFAULT_REVEAL_STEP } from './progressive-reveal';

describe('browse skeleton', () => {
  it('never claims more tiles than the grid renders in its first slice', () => {
    // A skeleton promising 30 tiles for a 24-card first reveal would shrink on
    // arrival — the layout shift the anti-FOUC guard exists to prevent.
    expect(SKELETON_TILE_COUNT).toBeLessThanOrEqual(DEFAULT_REVEAL_STEP);
  });

  it('draws at least one row of the desktop grid', () => {
    expect(SKELETON_TILE_COUNT).toBeGreaterThanOrEqual(3);
  });

  it('returns stable, distinct keys', () => {
    expect(skeletonTiles()).toHaveLength(SKELETON_TILE_COUNT);
    expect(new Set(skeletonTiles())).toHaveLength(SKELETON_TILE_COUNT);
    expect(skeletonTiles(3)).toEqual([0, 1, 2]);
  });

  it('degrades to an empty grid rather than throwing on a nonsense count', () => {
    expect(skeletonTiles(0)).toEqual([]);
    expect(skeletonTiles(-4)).toEqual([]);
  });
});

describe('strip skeleton (issue #123)', () => {
  it('reaches past the clip rather than reading as a complete short run', () => {
    // Three 280px cards fill the 960px lens width; the fourth is the one cut
    // off at the edge, which is the strip's own "there is more" affordance.
    expect(SKELETON_STRIP_TILE_COUNT).toBeGreaterThanOrEqual(4);
  });

  it('draws fewer tiles than the grid — one row, not two', () => {
    expect(SKELETON_STRIP_TILE_COUNT).toBeLessThan(SKELETON_TILE_COUNT);
  });

  it('is the one place the per-layout count is decided', () => {
    expect(skeletonTileCount('strip')).toBe(SKELETON_STRIP_TILE_COUNT);
    expect(skeletonTileCount('grid')).toBe(SKELETON_TILE_COUNT);
    expect(skeletonTiles(skeletonTileCount('strip'))).toHaveLength(
      SKELETON_STRIP_TILE_COUNT,
    );
  });
});
