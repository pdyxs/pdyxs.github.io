import { describe, it, expect } from 'vitest';
import { computeAffiliationTags } from './affiliations';
import type { AffiliationCard } from './affiliations';

const card = (uid: string, ...tags: string[]): AffiliationCard => ({ uid, tags });

// A miniature of the real shape: a studio card, a game that tags the studio,
// and an old post that only ever tagged the game.
const POOL: AffiliationCard[] = [
  card('where/work/seethrough'),
  card('what/games/digital/particulars', 'where:work/seethrough'),
  card('what/writing/2013-a-particular-vision', 'where:work/seethrough'),
  card('what/writing/2011-of-shapes-and-flies', 'what:games/digital/particulars'),
  card('what/writing/2019-unrelated', 'what:topics/design'),
];

const seethrough = { value: 'who:seethrough', seeds: ['where/work/seethrough'] };

describe('computeAffiliationTags', () => {
  it('includes the seed card itself', () => {
    const tags = computeAffiliationTags([seethrough], POOL);
    expect(tags.get('where/work/seethrough')).toEqual(['who:seethrough']);
  });

  it('includes cards that tag the seed directly', () => {
    const tags = computeAffiliationTags([seethrough], POOL);
    expect(tags.get('what/games/digital/particulars')).toEqual(['who:seethrough']);
    expect(tags.get('what/writing/2013-a-particular-vision')).toEqual(['who:seethrough']);
  });

  it('recurses — a card tagging a member joins, even with no link to the seed', () => {
    const tags = computeAffiliationTags([seethrough], POOL);
    expect(tags.get('what/writing/2011-of-shapes-and-flies')).toEqual(['who:seethrough']);
  });

  it('leaves unrelated cards out of the map entirely', () => {
    const tags = computeAffiliationTags([seethrough], POOL);
    expect(tags.has('what/writing/2019-unrelated')).toBe(false);
  });

  it('reaches a container seed through its children path tags', () => {
    // `where/contact` has no card of its own — but its children carry
    // `where:contact` as their derived path tag.
    const pool = [card('where/contact/send-me', 'where:contact'), card('who/about-me')];
    const tags = computeAffiliationTags(
      [{ value: 'who:me', seeds: ['who/about-me', 'where/contact'] }],
      pool,
    );
    expect(tags.get('where/contact/send-me')).toEqual(['who:me']);
    expect(tags.get('who/about-me')).toEqual(['who:me']);
  });

  it('accumulates multiple affiliations on one card', () => {
    const pool = [
      card('where/work/a'),
      card('where/work/b'),
      card('what/writing/joint', 'where:work/a', 'where:work/b'),
    ];
    const tags = computeAffiliationTags(
      [
        { value: 'who:a', seeds: ['where/work/a'] },
        { value: 'who:b', seeds: ['where/work/b'] },
      ],
      pool,
    );
    expect(tags.get('what/writing/joint')).toEqual(['who:a', 'who:b']);
  });

  it('terminates on a tag cycle', () => {
    const pool = [
      card('what/a', 'what:b'),
      card('what/b', 'what:a'),
    ];
    const tags = computeAffiliationTags([{ value: 'who:x', seeds: ['what/a'] }], pool);
    expect(tags.get('what/a')).toEqual(['who:x']);
    expect(tags.get('what/b')).toEqual(['who:x']);
  });

  it('yields nothing for a seed no card references and no card occupies', () => {
    const tags = computeAffiliationTags(
      [{ value: 'who:ghost', seeds: ['where/work/ghost'] }],
      POOL,
    );
    expect(tags.size).toBe(0);
  });

  it('ignores a dimension-root seed with no value part', () => {
    const tags = computeAffiliationTags([{ value: 'who:all', seeds: ['what'] }], POOL);
    expect(tags.size).toBe(0);
  });
});
