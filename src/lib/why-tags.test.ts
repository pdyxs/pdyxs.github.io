import { describe, it, expect } from 'vitest';
import {
  WHY_BUYABLE,
  WHY_PLAYABLE,
  WHY_VIEWABLE,
  deriveWhyTags,
  isBuyable,
  isPlayable,
} from './why-tags';
import { resolveActions } from './card-actions';
import { generatedTagsForCard, generatorOverrideKeys } from './filter-generators';
import { discoverTagSources, makeContentTreeReader } from './tag-registry';

describe('isPlayable', () => {
  it('is true for a card with a play action', () => {
    expect(isPlayable({ actions: [{ text: 'Play it', url: 'https://x', kind: 'play' }] })).toBe(true);
  });

  it('is false for a card whose only actions are of other kinds', () => {
    expect(isPlayable({
      actions: [
        { text: 'Read the case study', url: 'https://x', kind: 'read' },
        { text: 'Website', url: 'https://y', kind: 'site' },
      ],
    })).toBe(false);
  });

  it('is false for an action whose label says "play" but carries no kind', () => {
    // The whole point of the schema change: intent is declared, never regexed.
    expect(isPlayable({ actions: [{ text: 'Play it', url: 'https://x' }] })).toBe(false);
  });

  it('is true for a puzzle, via the sudokupad_url resolveActions folds in', () => {
    const actions = resolveActions({ sudokupad_url: 'https://sudokupad.app/x', url: 'https://logic-masters.de/x' });
    expect(isPlayable({ actions })).toBe(true);
  });

  it('is false for a card with no actions at all', () => {
    expect(isPlayable({})).toBe(false);
  });
});

describe('isBuyable', () => {
  it('is true for a buy action', () => {
    expect(isBuyable({ actions: [{ text: 'Buy a nice copy', url: 'https://ko-fi.com/x', kind: 'buy' }] })).toBe(true);
  });

  it('is false for a store link to software, which is a play action', () => {
    expect(isBuyable({ actions: [{ text: 'Download on Steam', url: 'https://store.steampowered.com/x', kind: 'play' }] })).toBe(false);
  });
});

describe('deriveWhyTags', () => {
  it('emits every affordance a card qualifies for, in panel order', () => {
    const tags = deriveWhyTags({
      actions: [
        { text: 'Play it', url: 'https://x', kind: 'play' },
        { text: 'Buy a nice copy', url: 'https://y', kind: 'buy' },
      ],
    }, { viewable: 'always' });
    expect(tags).toEqual([WHY_PLAYABLE, WHY_VIEWABLE, WHY_BUYABLE]);
  });

  it('emits nothing for a card that qualifies for nothing', () => {
    expect(deriveWhyTags({})).toEqual([]);
  });

  it('`viewable` is never derived — only `always` ever adds it', () => {
    // Issue #96: viewable used to derive from image + short body. It no
    // longer derives from anything; curation is the only way in.
    expect(deriveWhyTags({})).toEqual([]);
    expect(deriveWhyTags({}, { viewable: 'always' })).toEqual([WHY_VIEWABLE]);
  });

  it('`viewable: never` is a no-op, since nothing would have derived it anyway', () => {
    expect(deriveWhyTags({}, { viewable: 'never' })).toEqual([]);
  });

  it('`never` suppresses an affordance the derivation would have given', () => {
    const source = { actions: [{ text: 'Play it', url: 'https://x', kind: 'play' as const }] };
    expect(deriveWhyTags(source)).toEqual([WHY_PLAYABLE]);
    expect(deriveWhyTags(source, { playable: 'never' })).toEqual([]);
  });

  it('overrides are per-value: one does not touch the others', () => {
    const source = { actions: [{ text: 'Play it', url: 'https://x', kind: 'play' as const }] };
    expect(deriveWhyTags(source, { playable: 'never', viewable: 'always' })).toEqual([WHY_VIEWABLE]);
  });

  it('an unrecognised override value falls through to the derivation', () => {
    // A typo should leave the card as it was, not silently drop it from a filter.
    const source = { actions: [{ text: 'Play it', url: 'https://x', kind: 'play' as const }] };
    expect(deriveWhyTags(source, { playable: 'yes' })).toEqual([WHY_PLAYABLE]);
  });
});

describe('the affordance filter generator', () => {
  it('declares its three override keys, so the cascade plumbing carries them', () => {
    expect(generatorOverrideKeys()).toEqual(expect.arrayContaining(['playable', 'viewable', 'buyable']));
  });

  it('merges its tags into the card tag list without disturbing existing ones', () => {
    const tags = generatedTagsForCard(['what:games/analog'], {
      actions: [{ text: 'Play it', url: 'https://x', kind: 'play' }],
    });
    expect(tags).toEqual(expect.arrayContaining(['what:games/analog', WHY_PLAYABLE]));
  });

  it('does not duplicate a why tag a card already carries', () => {
    const tags = generatedTagsForCard([WHY_PLAYABLE], {
      actions: [{ text: 'Play it', url: 'https://x', kind: 'play' }],
    });
    expect(tags.filter(t => t === WHY_PLAYABLE)).toHaveLength(1);
  });
});

describe('the why scaffold on disk', () => {
  it('declares every why value, including the learn container', async () => {
    const { containerIdentities, tagDeclarations } = await discoverTagSources(makeContentTreeReader());
    const declared = new Set([
      ...containerIdentities.map(i => i.value),
      ...tagDeclarations.map(d => d.value),
    ]);

    // The three generated affordances.
    expect(declared).toContain(WHY_PLAYABLE);
    expect(declared).toContain(WHY_VIEWABLE);
    expect(declared).toContain(WHY_BUYABLE);

    // The two authored topics (issue #87 tags the cards; the values exist now).
    expect(declared).toContain('why:learn/game-development');
    expect(declared).toContain('why:learn/travel');

    // THE ONE WITH NO SYMPTOM: filterVisibleNodes drops an undeclared node and
    // recurses into its children, so without why/learn/_config.yaml both
    // topics above vanish from the panel with no error anywhere.
    expect(declared).toContain('why:learn');
  });
});
