import { describe, it, expect } from 'vitest';
import { ownValueForCard, cardOwnValues, computeRelatedCardsIndex } from './card-identity';
import { fakeCardMeta } from '../test/fixtures';

describe('ownValueForCard', () => {
  it('derives the dimension:path value from a uid', () => {
    expect(ownValueForCard('what/projects/games/foo')).toBe('what:projects/games/foo');
  });

  it('returns undefined for a bare dimension root with no slash', () => {
    expect(ownValueForCard('what')).toBeUndefined();
  });
});

describe('cardOwnValues', () => {
  it('collects every card own-path value', () => {
    const cards = [
      fakeCardMeta({ uid: 'what/projects/foo' }),
      fakeCardMeta({ uid: 'who/about-me' }),
    ];
    expect(cardOwnValues(cards)).toEqual(new Set(['what:projects/foo', 'who:about-me']));
  });
});

describe('computeRelatedCardsIndex', () => {
  it('finds cards that tag another card via its own-path value', () => {
    const project = fakeCardMeta({ uid: 'what/projects/foo', title: 'Foo' });
    const post = fakeCardMeta({ uid: 'posts/bar', title: 'Bar', tags: ['what:projects/foo'] });
    const unrelated = fakeCardMeta({ uid: 'posts/baz', title: 'Baz', tags: ['what:puzzles'] });

    const index = computeRelatedCardsIndex([project, post, unrelated]);

    expect(index.get('what/projects/foo')).toEqual([post]);
    expect(index.get('posts/baz')).toBeUndefined();
  });

  it('excludes a card from its own related list even if it somehow tags itself', () => {
    const card = fakeCardMeta({ uid: 'what/projects/foo', tags: ['what:projects/foo'] });

    const index = computeRelatedCardsIndex([card]);

    expect(index.get('what/projects/foo')).toBeUndefined();
  });

  it('returns no entries when no card is tagged by another card', () => {
    const cards = [
      fakeCardMeta({ uid: 'what/projects/foo' }),
      fakeCardMeta({ uid: 'posts/bar', tags: ['what:puzzles'] }),
    ];

    const index = computeRelatedCardsIndex(cards);

    expect(index.size).toBe(0);
  });
});
