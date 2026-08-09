import { describe, it, expect } from 'vitest';
import { planDevReload, mergePlans } from './dev-reload';

describe('planDevReload', () => {
  it('regenerates the lens registry and manifest for a .lens.yaml', () => {
    expect(planDevReload('src/content/what/audit.lens.yaml', 'change')).toEqual({
      generators: ['lenses', 'manifest'],
      refreshRoutes: true,
    });
  });

  it('regenerates the manifest for a folder _config.yaml', () => {
    expect(planDevReload('src/content/what/art/_config.yaml', 'change')).toEqual({
      generators: ['manifest'],
      refreshRoutes: true,
    });
  });

  it('regenerates the manifest for a .tag.yaml', () => {
    expect(planDevReload('src/content/tag/featured.tag.yaml', 'change')).toEqual({
      generators: ['manifest'],
      refreshRoutes: true,
    });
  });

  it('ignores markdown edits — the glob loader already reloads them', () => {
    expect(planDevReload('src/content/what/art/art-heist/index.md', 'change')).toBeNull();
  });

  it('assigns a short code when a card is added or removed', () => {
    const added = planDevReload('src/content/what/art/new-thing/index.md', 'add');
    expect(added).toEqual({ generators: ['manifest'], refreshRoutes: true });
    expect(planDevReload('src/content/what/art/new-thing/index.md', 'unlink')).toEqual(added);
  });

  it('ignores vault infrastructure directories', () => {
    expect(planDevReload('src/content/.obsidian/workspace.json', 'change')).toBeNull();
    expect(planDevReload('src/content/.trash/what/art/old/index.md', 'add')).toBeNull();
    expect(planDevReload('src/content/_templates/card.md', 'add')).toBeNull();
    expect(planDevReload('src/content/_templates/thing.yaml', 'change')).toBeNull();
  });

  it('regenerates icons for a lens SVG', () => {
    expect(planDevReload('src/icons/lenses/home.svg', 'change')).toEqual({
      generators: ['lens-icons'],
      refreshRoutes: true,
    });
  });

  it('ignores everything else', () => {
    expect(planDevReload('src/lib/cards.ts', 'change')).toBeNull();
    expect(planDevReload('src/content/what/art/art-heist/photo.png', 'add')).toBeNull();
  });
});

describe('mergePlans', () => {
  it('unions generators into the fixed run order', () => {
    expect(
      mergePlans([
        { generators: ['manifest'], refreshRoutes: false },
        { generators: ['lenses', 'manifest'], refreshRoutes: true },
      ]),
    ).toEqual({ generators: ['lenses', 'manifest'], refreshRoutes: true });
  });

  it('is empty for no events', () => {
    expect(mergePlans([])).toEqual({ generators: [], refreshRoutes: false });
  });
});
