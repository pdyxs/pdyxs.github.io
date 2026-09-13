import { describe, it, expect } from 'vitest';
import {
  SKELETON_TILE_COUNT,
  SKELETON_STRIP_TILE_COUNT,
  skeletonTiles,
  skeletonTileCount,
  poolFailureMessage,
} from '@browse/results/browse-skeleton';
import { DEFAULT_REVEAL_STEP } from '@browse/results/progressive-reveal';

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

describe('poolFailureMessage (issue #149)', () => {
  const reasons = ['timeout', 'network', 'malformed'] as const;

  it('says something different for each reason the loader can tell apart', () => {
    const messages = reasons.map(poolFailureMessage);
    expect(new Set(messages).size).toBe(reasons.length);
  });

  it('claims nothing the loader does not know', () => {
    // A blocked request and a dead network are the same TypeError, and nothing
    // here knows whether "later" is different or how many cards were coming.
    // The retry control beside the message is what offers the action.
    for (const reason of reasons) {
      const message = poolFailureMessage(reason);
      expect(message).not.toMatch(/connection|offline|internet|later|\d/i);
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it('names the timeout as a timeout rather than as a failure', () => {
    expect(poolFailureMessage('timeout')).toMatch(/too long/i);
    expect(poolFailureMessage('network')).not.toMatch(/too long/i);
  });
});
