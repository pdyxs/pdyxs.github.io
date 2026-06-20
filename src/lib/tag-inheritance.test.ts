import { describe, it, expect } from 'vitest';
import { derivePathTags, mergeEffectiveTags, loadDefaultsTags } from './tag-inheritance';

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

describe('loadDefaultsTags', () => {
  it('accumulates tags from root to leaf _defaults.yaml files', async () => {
    const files: Record<string, string> = {
      'stories/_defaults.yaml': 'tags:\n  - why:creative\n',
      'stories/arctic/_defaults.yaml': 'tags:\n  - where:norway\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await loadDefaultsTags('stories', 'arctic/ch-01', readFile);
    expect(result).toEqual(['why:creative', 'where:norway']);
  });

  it('returns empty array when no _defaults.yaml files exist', async () => {
    const readFile = async (_path: string) => null;
    const result = await loadDefaultsTags('posts', '2008-07-27-why-portal', readFile);
    expect(result).toEqual([]);
  });

  it('only uses the collection root when file is at top level of collection', async () => {
    const files: Record<string, string> = {
      'stories/_defaults.yaml': 'tags:\n  - why:creative\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await loadDefaultsTags('stories', 'ch-01', readFile);
    expect(result).toEqual(['why:creative']);
  });
});
