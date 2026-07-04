import { describe, it, expect } from 'vitest';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';

describe('derivePathTags', () => {
  it('derives dimension:value from a dimension-rooted uid with a nested subdirectory', () => {
    expect(derivePathTags('what/stories/arctic/ch-01')).toEqual(['what:stories/arctic']);
  });

  it('derives dimension:collection for a uid with no subdirectory beyond the collection', () => {
    expect(derivePathTags('what/posts/2008-07-27-why-portal')).toEqual(['what:posts']);
  });

  it('derives the dimension from the first path segment, not a hardcoded "what"', () => {
    expect(derivePathTags('when/released/2020')).toEqual(['when:released']);
  });

  it('matches the issue example: what/projects/games/x -> what:projects/games', () => {
    expect(derivePathTags('what/projects/games/x')).toEqual(['what:projects/games']);
  });
});

describe('mergeEffectiveTags', () => {
  it('merges multiple arrays without duplicates', () => {
    expect(mergeEffectiveTags(['what:stories/arctic'], ['where:norway'], ['what:stories/arctic', 'writing']))
      .toEqual(['what:stories/arctic', 'where:norway', 'writing']);
  });
});
