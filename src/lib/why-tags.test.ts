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
import { generatedTagsForCard, generatorDerivations } from './filter-generators';
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
    });
    expect(tags).toEqual([WHY_PLAYABLE, WHY_BUYABLE]);
  });

  it('emits nothing for a card that qualifies for nothing', () => {
    expect(deriveWhyTags({})).toEqual([]);
  });

  it('never derives `viewable`, whatever the card carries', () => {
    // Issue #96 retired the image + short-body derivation; issue #116 retired
    // the `viewable: always` key that replaced it. The value is now reached
    // only by authoring the tag, so this function has no opinion on it at all.
    const source = {
      actions: [
        { text: 'Play it', url: 'https://x', kind: 'play' as const },
        { text: 'Buy a nice copy', url: 'https://y', kind: 'buy' as const },
      ],
    };
    expect(deriveWhyTags(source)).not.toContain(WHY_VIEWABLE);
    expect(deriveWhyTags({})).not.toContain(WHY_VIEWABLE);
  });

  it('a suppression key drops an affordance the derivation would have given', () => {
    const source = { actions: [{ text: 'Play it', url: 'https://x', kind: 'play' as const }] };
    expect(deriveWhyTags(source)).toEqual([WHY_PLAYABLE]);
    expect(deriveWhyTags(source, new Set(['playable']))).toEqual([]);
  });

  it('suppression is per-affordance: one does not touch the others', () => {
    // The whole reason the generator form is keyed on the override key rather
    // than on the generator — `generated/why` could not express this.
    const source = {
      actions: [
        { text: 'Play it', url: 'https://x', kind: 'play' as const },
        { text: 'Buy a nice copy', url: 'https://y', kind: 'buy' as const },
      ],
    };
    expect(deriveWhyTags(source, new Set(['playable']))).toEqual([WHY_BUYABLE]);
    expect(deriveWhyTags(source, new Set(['buyable']))).toEqual([WHY_PLAYABLE]);
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
    expect(declared).toContain('why:learn/gamedev');
    expect(declared).toContain('why:learn/travel');

    // THE ONE WITH NO SYMPTOM: filterVisibleNodes drops an undeclared node and
    // recurses into its children, so without why/learn/_config.yaml both
    // topics above vanish from the panel with no error anywhere.
    expect(declared).toContain('why:learn');
  });
});
