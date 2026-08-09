import { describe, it, expect } from 'vitest';
import { ownValueForCard, cardOwnValues, computeRelatedCardsIndex, computeSubjectCardsIndex } from './card-identity';
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

describe('computeSubjectCardsIndex', () => {
  it('finds the cards a card points at through its own card-backed tags', () => {
    const project = fakeCardMeta({ uid: 'what/projects/foo', title: 'Foo' });
    const post = fakeCardMeta({ uid: 'posts/bar', tags: ['what:projects/foo', 'what:puzzles'] });

    const index = computeSubjectCardsIndex([project, post]);

    // The plain category tag has no card behind it and is not a subject.
    expect(index.get('posts/bar')).toEqual([project]);
  });

  it('is the mirror of computeRelatedCardsIndex', () => {
    const project = fakeCardMeta({ uid: 'what/projects/foo' });
    const post = fakeCardMeta({ uid: 'posts/bar', tags: ['what:projects/foo'] });
    const cards = [project, post];

    expect(computeSubjectCardsIndex(cards).get('posts/bar')).toEqual([project]);
    expect(computeRelatedCardsIndex(cards).get('what/projects/foo')).toEqual([post]);
  });

  it('preserves authoring tag order so chips and previews agree', () => {
    const a = fakeCardMeta({ uid: 'what/projects/a' });
    const b = fakeCardMeta({ uid: 'what/projects/b' });
    const post = fakeCardMeta({ uid: 'posts/p', tags: ['what:projects/b', 'what:projects/a'] });

    expect(computeSubjectCardsIndex([a, b, post]).get('posts/p')).toEqual([b, a]);
  });

  it('excludes the card itself and de-duplicates repeated targets', () => {
    const self = fakeCardMeta({ uid: 'what/projects/foo', tags: ['what:projects/foo'] });
    const target = fakeCardMeta({ uid: 'what/projects/bar' });
    const post = fakeCardMeta({ uid: 'posts/p', tags: ['what:projects/bar', 'what:projects/bar'] });

    const index = computeSubjectCardsIndex([self, target, post]);

    expect(index.get('what/projects/foo')).toBeUndefined();
    expect(index.get('posts/p')).toEqual([target]);
  });

  it('returns no entries when no tag is card-backed', () => {
    const cards = [fakeCardMeta({ uid: 'posts/bar', tags: ['what:puzzles'] })];
    expect(computeSubjectCardsIndex(cards).size).toBe(0);
  });
});
