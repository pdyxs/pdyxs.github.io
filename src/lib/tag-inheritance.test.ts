import { describe, it, expect } from 'vitest';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';

describe('derivePathTags', () => {
  it('returns what:collection/subdir for a file in a subdirectory', () => {
    expect(derivePathTags('stories', 'arctic/ch-01')).toEqual(['what:stories/arctic']);
  });

  it('returns what:collection for a flat file with no subdirectory', () => {
    expect(derivePathTags('posts', '2008-07-27-why-portal')).toEqual(['what:posts']);
  });
});

describe('mergeEffectiveTags', () => {
  it('merges multiple arrays without duplicates', () => {
    expect(mergeEffectiveTags(['what:stories/arctic'], ['where:norway'], ['what:stories/arctic', 'writing']))
      .toEqual(['what:stories/arctic', 'where:norway', 'writing']);
  });
});
