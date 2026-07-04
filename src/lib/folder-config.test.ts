import { describe, it, expect } from 'vitest';
import { resolveFolderCascade } from './folder-config';

describe('resolveFolderCascade', () => {
  it('resolves the renderer from a single collection-root _config.yaml', async () => {
    const files: Record<string, string> = {
      'puzzles/_config.yaml': 'renderer: puzzle\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('puzzles', 'some-puzzle', readFile);
    expect(result.renderer).toBe('puzzle');
  });

  it('a nearer ancestor _config.yaml renderer overrides a further one', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'renderer: story\n',
      'stories/arctic/_config.yaml': 'renderer: arctic-special\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories', 'arctic/ch-01', readFile);
    expect(result.renderer).toBe('arctic-special');
  });

  it('falls back to a further ancestor when the nearer one has no renderer set', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'renderer: story\n',
      'stories/arctic/_config.yaml': 'tags:\n  - where:norway\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories', 'arctic/ch-01', readFile);
    expect(result.renderer).toBe('story');
  });

  it('accumulates cascade tags across every ancestor _config.yaml, deduped and order-preserving', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'tags:\n  - why:creative\n',
      'stories/arctic/_config.yaml': 'tags:\n  - where:norway\n  - why:creative\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories', 'arctic/ch-01', readFile);
    expect(result.cascadeTags).toEqual(['why:creative', 'where:norway']);
  });

  it('returns an empty cascadeTags array when no ancestor _config.yaml declares tags', async () => {
    const readFile = async (_path: string) => null;
    const result = await resolveFolderCascade('posts', '2008-07-27-why-portal', readFile);
    expect(result.cascadeTags).toEqual([]);
  });

  it('returns this-folder tag identity (name/description) from the file\'s own directory config', async () => {
    const files: Record<string, string> = {
      'stories/arctic/_config.yaml': 'name: Arctic\ndescription: A cold expedition\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories', 'arctic/ch-01', readFile);
    expect(result.tagIdentity).toEqual({ name: 'Arctic', description: 'A cold expedition' });
  });

  it('does not inherit an ancestor\'s tag identity for a descendant file', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'name: Stories\ndescription: All stories\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories', 'arctic/ch-01', readFile);
    expect(result.tagIdentity).toEqual({});
  });

  it('a file with no subdirectory takes tag identity from the collection-root config', async () => {
    const files: Record<string, string> = {
      'puzzles/_config.yaml': 'renderer: puzzle\nname: Puzzles\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('puzzles', 'some-puzzle', readFile);
    expect(result.tagIdentity).toEqual({ name: 'Puzzles', description: undefined });
  });
});
