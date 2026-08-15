import { describe, it, expect } from 'vitest';
import { ancestorFolderValues, resolveCardPriority, tagPrioritySum } from './priority';

describe('ancestorFolderValues', () => {
  it('lists every ancestor folder as a filter value, deepest last', () => {
    expect(ancestorFolderValues('what/posts/stories/arctic/ch-1')).toEqual([
      'what:posts',
      'what:posts/stories',
      'what:posts/stories/arctic',
    ]);
  });

  it('excludes the bare dimension root, which is not a filter value', () => {
    expect(ancestorFolderValues('what/about-me')).toEqual([]);
  });

  it('never includes the card itself', () => {
    expect(ancestorFolderValues('what/puzzles/fog')).toEqual(['what:puzzles']);
  });
});

describe('resolveCardPriority', () => {
  const uid = 'what/puzzles/fog';

  it('is zero when nothing declares anything', () => {
    expect(resolveCardPriority({ uid, tags: ['what:puzzles'] })).toBe(0);
  });

  it('takes the card\'s own frontmatter', () => {
    expect(resolveCardPriority({ uid, own: 5, tags: [] })).toBe(5);
  });

  it('takes the ancestor folders\' summed cascade', () => {
    expect(resolveCardPriority({ uid, cascade: 100, tags: [] })).toBe(100);
  });

  it('takes a `.tag.yaml` declaration for a tag the card carries', () => {
    expect(resolveCardPriority({ uid, tags: ['who:me'] }, { 'who:me': 200 })).toBe(200);
  });

  it('SUMS all three — this is the one cascading key that accumulates', () => {
    expect(
      resolveCardPriority(
        { uid, own: 5, cascade: 100, tags: ['who:me', 'why:playable'] },
        { 'who:me': 200, 'why:playable': 10 },
      ),
    ).toBe(315);
  });

  it('allows negatives, which push a card down', () => {
    expect(resolveCardPriority({ uid, own: -50, cascade: 100, tags: [] })).toBe(50);
    expect(resolveCardPriority({ uid, own: -150, cascade: 100, tags: [] })).toBe(-50);
  });

  it('counts a folder ONCE, as an ancestor — never again as a filter value', () => {
    // The card lives in what/puzzles, so it carries `what:puzzles` as its path
    // tag. A declaration for that same value must not be added on top of the
    // cascade that already counted the folder.
    expect(
      resolveCardPriority(
        { uid, cascade: 100, tags: ['what:puzzles'] },
        { 'what:puzzles': 100 },
      ),
    ).toBe(100);
  });

  it('still counts a folder value the card merely tags but does not live in', () => {
    expect(
      resolveCardPriority(
        { uid: 'what/writing/a-post', tags: ['what:puzzles'] },
        { 'what:puzzles': 7 },
      ),
    ).toBe(7);
  });

  it('counts a repeated tag once', () => {
    expect(tagPrioritySum(uid, ['who:me', 'who:me'], { 'who:me': 3 })).toBe(3);
  });

  it('ignores tags with no declared priority', () => {
    expect(tagPrioritySum(uid, ['what:games', 'interactive'], { 'who:me': 3 })).toBe(0);
  });
});
