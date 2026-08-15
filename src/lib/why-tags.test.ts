import { describe, it, expect } from 'vitest';
import {
  VIEWABLE_MAX_PROSE,
  WHY_BUYABLE,
  WHY_PLAYABLE,
  WHY_VIEWABLE,
  deriveWhyTags,
  isBuyable,
  isPlayable,
  isViewable,
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

describe('isViewable', () => {
  it('is true for a header image with a caption-length body', () => {
    expect(isViewable({ image: 'photo.jpg', body: 'A puffin, landing.' })).toBe(true);
  });

  it('is false without a header image, however short the body', () => {
    expect(isViewable({ body: 'A puffin, landing.' })).toBe(false);
  });

  it('is false once the body is long enough to be a read', () => {
    expect(isViewable({ image: 'photo.jpg', body: 'x '.repeat(VIEWABLE_MAX_PROSE) })).toBe(false);
  });

  it('measures prose, not markdown: inline images and links do not count', () => {
    // A body that is a run of image embeds is still a caption's worth of words.
    const body = `![](a.png)\n![](b.png)\n[a link](https://a-very-long-url.example.com/${'x'.repeat(400)})`;
    expect(body.length).toBeGreaterThan(VIEWABLE_MAX_PROSE);
    expect(isViewable({ image: 'photo.jpg', body })).toBe(true);
  });

  it('is true for a header image with no body at all', () => {
    expect(isViewable({ image: 'photo.jpg' })).toBe(true);
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
      image: 'box.jpg',
      body: 'A co-op game about escaping space.',
      actions: [
        { text: 'Play it', url: 'https://x', kind: 'play' },
        { text: 'Buy a nice copy', url: 'https://y', kind: 'buy' },
      ],
    });
    expect(tags).toEqual([WHY_PLAYABLE, WHY_VIEWABLE, WHY_BUYABLE]);
  });

  it('emits nothing for a card that qualifies for nothing', () => {
    expect(deriveWhyTags({ body: 'An essay.'.repeat(200) })).toEqual([]);
  });

  it('`always` forces an affordance the derivation would not have given', () => {
    // The art-card case: genuinely visual, write-up too long for the signal.
    const source = { image: 'print.jpg', body: 'x '.repeat(VIEWABLE_MAX_PROSE) };
    expect(deriveWhyTags(source)).toEqual([]);
    expect(deriveWhyTags(source, { viewable: 'always' })).toEqual([WHY_VIEWABLE]);
  });

  it('`never` suppresses an affordance the derivation would have given', () => {
    const source = { actions: [{ text: 'Play it', url: 'https://x', kind: 'play' as const }] };
    expect(deriveWhyTags(source)).toEqual([WHY_PLAYABLE]);
    expect(deriveWhyTags(source, { playable: 'never' })).toEqual([]);
  });

  it('overrides are per-value: one does not touch the others', () => {
    const source = {
      image: 'box.jpg',
      body: 'Short.',
      actions: [{ text: 'Play it', url: 'https://x', kind: 'play' as const }],
    };
    expect(deriveWhyTags(source, { playable: 'never' })).toEqual([WHY_VIEWABLE]);
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
      image: 'box.jpg',
      body: 'Short.',
      actions: [{ text: 'Play it', url: 'https://x', kind: 'play' }],
    });
    expect(tags).toEqual(expect.arrayContaining(['what:games/analog', WHY_PLAYABLE, WHY_VIEWABLE]));
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
