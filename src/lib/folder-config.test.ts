import { describe, it, expect } from 'vitest';
import { resolveFolderCascade } from './folder-config';

describe('resolveFolderCascade', () => {
  it('resolves the renderer from a single collection-root _config.yaml', async () => {
    const files: Record<string, string> = {
      'puzzles/_config.yaml': 'renderer: puzzle\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('puzzles/some-puzzle', readFile);
    expect(result.renderer).toBe('puzzle');
  });

  it('reads cardDescriptionParts and lets a nearer ancestor override', async () => {
    const files: Record<string, string> = {
      'puzzles/_config.yaml': 'cardDescriptionParts:\n  - "{{puzzle_type}}"\n  - "{{difficulty}}"\n',
      'puzzles/special/_config.yaml': 'cardDescriptionParts:\n  - "{{difficulty}}"\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('puzzles/a-puzzle', readFile)).cardDescriptionParts)
      .toEqual(['{{puzzle_type}}', '{{difficulty}}']);
    expect((await resolveFolderCascade('puzzles/special/a-puzzle', readFile)).cardDescriptionParts)
      .toEqual(['{{difficulty}}']);
  });

  it('leaves cardDescriptionParts undefined when no ancestor declares it', async () => {
    const files: Record<string, string> = { 'puzzles/_config.yaml': 'renderer: puzzle\n' };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('puzzles/a-puzzle', readFile)).cardDescriptionParts).toBeUndefined();
  });

  it('a nearer ancestor _config.yaml renderer overrides a further one', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'renderer: story\n',
      'stories/arctic/_config.yaml': 'renderer: arctic-special\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories/arctic/ch-01', readFile);
    expect(result.renderer).toBe('arctic-special');
  });

  it('falls back to a further ancestor when the nearer one has no renderer set', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'renderer: story\n',
      'stories/arctic/_config.yaml': 'tags:\n  - where:norway\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories/arctic/ch-01', readFile);
    expect(result.renderer).toBe('story');
  });

  it('resolves navRenderer from an ancestor _config.yaml, nearest-wins like renderer', async () => {
    const files: Record<string, string> = {
      'what/posts/stories/_config.yaml': 'renderer: story\nnavRenderer: series\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('what/posts/stories/arctic/00-introduction', readFile);
    expect(result.navRenderer).toBe('series');
  });

  it('leaves navRenderer undefined when no ancestor _config.yaml declares one', async () => {
    const files: Record<string, string> = {
      'what/posts/_config.yaml': 'renderer: post\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('what/posts/some-post', readFile);
    expect(result.navRenderer).toBeUndefined();
  });

  it('accumulates cascade tags across every ancestor _config.yaml, deduped and order-preserving', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'tags:\n  - why:creative\n',
      'stories/arctic/_config.yaml': 'tags:\n  - where:norway\n  - why:creative\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories/arctic/ch-01', readFile);
    expect(result.cascadeTags).toEqual(['why:creative', 'where:norway']);
  });

  it('returns an empty cascadeTags array when no ancestor _config.yaml declares tags', async () => {
    const readFile = async (_path: string) => null;
    const result = await resolveFolderCascade('posts/2008-07-27-why-portal', readFile);
    expect(result.cascadeTags).toEqual([]);
  });

  it('returns this-folder tag identity (name/description) from the file\'s own directory config', async () => {
    const files: Record<string, string> = {
      'stories/arctic/_config.yaml': 'name: Arctic\ndescription: A cold expedition\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories/arctic/ch-01', readFile);
    expect(result.tagIdentity).toEqual({ name: 'Arctic', description: 'A cold expedition' });
  });

  it('does not inherit an ancestor\'s tag identity for a descendant file', async () => {
    const files: Record<string, string> = {
      'stories/_config.yaml': 'name: Stories\ndescription: All stories\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('stories/arctic/ch-01', readFile);
    expect(result.tagIdentity).toEqual({});
  });

  it('a file with no subdirectory takes tag identity from the collection-root config', async () => {
    const files: Record<string, string> = {
      'puzzles/_config.yaml': 'renderer: puzzle\nname: Puzzles\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('puzzles/some-puzzle', readFile);
    expect(result.tagIdentity).toEqual({ name: 'Puzzles', description: undefined });
  });

  it('collects a requested override key from an ancestor _config.yaml', async () => {
    const files: Record<string, string> = {
      'what/posts/stories/arctic/_config.yaml': 'location: europe/norway/svalbard\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade(
      'what/posts/stories/arctic/05-reindeer',
      readFile,
      ['location'],
    );
    expect(result.overrides.location).toBe('europe/norway/svalbard');
  });

  it('an override key cascades nearest-wins', async () => {
    const files: Record<string, string> = {
      'trips/_config.yaml': 'location: europe/germany/berlin\n',
      'trips/arctic/_config.yaml': 'location: europe/norway/svalbard\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('trips/arctic/ch-01', readFile, ['location']);
    expect(result.overrides.location).toBe('europe/norway/svalbard');
  });

  it('ignores config keys that were not requested as override keys', async () => {
    const files: Record<string, string> = {
      'trips/arctic/_config.yaml': 'location: europe/norway/svalbard\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('trips/arctic/ch-01', readFile);
    expect(result.overrides).toEqual({});
  });

  it('resolves status from an ancestor _config.yaml, nearest-wins like renderer', async () => {
    const files: Record<string, string> = {
      'what/projects/_config.yaml': 'status: draft\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('what/projects/some-project', readFile);
    expect(result.status).toBe('draft');
  });

  it('a nearer ancestor _config.yaml status overrides a further one', async () => {
    const files: Record<string, string> = {
      'what/projects/_config.yaml': 'status: draft\n',
      'what/projects/games/_config.yaml': 'status: published\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('what/projects/games/x', readFile);
    expect(result.status).toBe('published');
  });

  it('leaves status undefined when no ancestor _config.yaml declares one', async () => {
    const files: Record<string, string> = {
      'what/projects/_config.yaml': 'renderer: project\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('what/projects/some-project', readFile);
    expect(result.status).toBeUndefined();
  });

  it('cascades dateLabel nearest-wins, and lets a subfolder suppress it with "none"', async () => {
    const files: Record<string, string> = {
      'what/posts/_config.yaml': 'dateLabel: Published\n',
      'what/posts/stories/_config.yaml': 'dateLabel: none\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/posts/x', readFile)).dateLabel).toBe('Published');
    expect((await resolveFolderCascade('what/posts/stories/x', readFile)).dateLabel).toBe('none');
  });

  it('leaves dateLabel undefined when no ancestor declares one, so no dateline shows', async () => {
    const files: Record<string, string> = { 'what/games/_config.yaml': 'name: Games\n' };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/games/x', readFile)).dateLabel).toBeUndefined();
  });

  // ── priority: the one key that accumulates ────────────────────────────────

  it('SUMS priority across ancestors instead of taking the nearest', async () => {
    const files: Record<string, string> = {
      'what/_config.yaml': 'priority: 10\n',
      'what/puzzles/_config.yaml': 'priority: 100\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/puzzles/fog', readFile)).priority).toBe(110);
  });

  it('sums negative priorities too, so a folder can push itself down', async () => {
    const files: Record<string, string> = {
      'what/_config.yaml': 'priority: 100\n',
      'what/posts/_config.yaml': 'priority: -30\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/posts/a', readFile)).priority).toBe(70);
  });

  it('leaves priority undefined when no ancestor declares one', async () => {
    const files: Record<string, string> = { 'what/posts/_config.yaml': 'renderer: card\n' };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/posts/a', readFile)).priority).toBeUndefined();
  });

  // ── sort: nearest-wins, unlike priority ───────────────────────────────────

  it('cascades sort nearest-wins, parsed into a key and a direction', async () => {
    const files: Record<string, string> = {
      'what/_config.yaml': 'sort: date desc\n',
      'what/puzzles/_config.yaml': 'sort: difficulty asc\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/posts/a', readFile)).sort)
      .toEqual({ key: 'date', direction: 'desc' });
    expect((await resolveFolderCascade('what/puzzles/fog', readFile)).sort)
      .toEqual({ key: 'difficulty', direction: 'asc' });
  });

  it('treats an unparseable sort as undeclared, so the inherited one survives', async () => {
    const files: Record<string, string> = {
      'what/_config.yaml': 'sort: title asc\n',
      'what/puzzles/_config.yaml': 'sort: rating\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/puzzles/fog', readFile)).sort)
      .toEqual({ key: 'title', direction: 'asc' });
  });

  it('leaves sort undefined when no ancestor declares one', async () => {
    const files: Record<string, string> = { 'what/posts/_config.yaml': 'renderer: card\n' };
    const readFile = async (path: string) => files[path] ?? null;
    expect((await resolveFolderCascade('what/posts/a', readFile)).sort).toBeUndefined();
  });

  it('walks a dimension-rooted uid, checking every ancestor including the dimension root', async () => {
    const files: Record<string, string> = {
      'what/projects/_config.yaml': 'renderer: project\n',
      'what/projects/games/_config.yaml': 'renderer: game\n',
    };
    const readFile = async (path: string) => files[path] ?? null;
    const result = await resolveFolderCascade('what/projects/games/x', readFile);
    expect(result.renderer).toBe('game');
  });
});
