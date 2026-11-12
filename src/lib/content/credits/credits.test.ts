import { describe, it, expect } from 'vitest';
import { findCreditNameDrift, teamSizeBucket, creditIdentity, madeByLine, creditListing, creditsView, type Credit } from '@content/credits/credits';

const credit = (over: Partial<Credit> & { name: string }): Credit => ({ listed: 'map', ...over });

describe('creditIdentity', () => {
  it('is the person slug when one is given', () => {
    expect(creditIdentity(credit({ name: 'Nick Kolan', person: 'nick-kolan' }))).toBe('person:nick-kolan');
  });

  it('is the exact name when there is no person slug', () => {
    expect(creditIdentity(credit({ name: 'Nick Kolan' }))).toBe('name:Nick Kolan');
  });

  it('keeps a slug and an identical name apart', () => {
    expect(creditIdentity(credit({ name: 'x', person: 'x' }))).not.toBe(creditIdentity(credit({ name: 'x' })));
  });
});

describe('madeByLine', () => {
  it('names one to three distinct map-listed people, in authored order', () => {
    const credits = [
      credit({ name: 'Nick Kolan', person: 'nick-kolan' }),
      credit({ name: 'Paul Sztajer', person: 'me' }),
      credit({ name: 'Thomas Bowker' }),
    ];
    expect(madeByLine(credits)).toEqual({ names: ['Nick Kolan', 'Paul Sztajer', 'Thomas Bowker'] });
  });

  it('counts above three', () => {
    const credits = ['a', 'b', 'c', 'd'].map(name => credit({ name }));
    expect(madeByLine(credits)).toEqual({ count: 4 });
  });

  it('never counts or names a listing-only credit', () => {
    const credits = [
      credit({ name: 'Nick Kolan' }),
      credit({ name: 'the Academy', listed: 'listing' }),
    ];
    expect(madeByLine(credits)).toEqual({ names: ['Nick Kolan'] });
    const many = ['a', 'b', 'c'].map(name => credit({ name })).concat(credit({ name: 'z', listed: 'listing' }));
    expect(madeByLine(many)).toEqual({ names: ['a', 'b', 'c'] });
  });

  it('counts a repeated identity once, whether by slug or by name', () => {
    const credits = [
      credit({ name: 'Paul Sztajer', person: 'me', role: 'Lead Programmer' }),
      credit({ name: 'Paul', person: 'me', role: 'Producer' }),
      credit({ name: 'Nick' }),
      credit({ name: 'Nick', role: 'Designer' }),
    ];
    expect(madeByLine(credits)).toEqual({ names: ['Paul Sztajer', 'Nick'] });
  });
});

describe('creditListing', () => {
  it('groups by group then role, in authored order of first appearance, with notes', () => {
    const credits = [
      credit({ name: 'Nick', role: 'Designer' }),
      credit({ name: 'Thomas', role: 'Programming' }),
      credit({ name: 'Ann', group: 'Level Design', role: 'Lead' }),
      credit({ name: 'David', role: 'Programming' }),
      credit({ name: 'Alison', group: 'Level Design', role: 'Lead', note: 'as Alison Scott' }),
      credit({ name: 'Academy', group: 'Special thanks', listed: 'listing' }),
    ];
    expect(creditListing(credits)).toEqual([
      {
        rows: [
          { role: 'Designer', entries: [{ name: 'Nick', personId: 'name:Nick' }] },
          { role: 'Programming', entries: [{ name: 'Thomas', personId: 'name:Thomas' }, { name: 'David', personId: 'name:David' }] },
        ],
      },
      {
        heading: 'Level Design',
        rows: [{ role: 'Lead', entries: [{ name: 'Ann', personId: 'name:Ann' }, { name: 'Alison', personId: 'name:Alison', note: 'as Alison Scott' }] }],
      },
      { heading: 'Special thanks', rows: [{ entries: [{ name: 'Academy' }] }] },
    ]);
  });
});

describe('creditListing map identity', () => {
  it('tags map-listed entries with their identity, and leaves listing-only ones plain', () => {
    const [section] = creditListing([
      credit({ name: 'Nick', person: 'nick', role: 'R' }),
      credit({ name: 'Academy', role: 'R', listed: 'listing' }),
    ]);
    expect(section.rows[0].entries).toEqual([{ name: 'Nick', personId: 'person:nick' }, { name: 'Academy' }]);
  });
});

describe('creditsView', () => {
  it('is undefined with no credits, so no section renders', () => {
    expect(creditsView(undefined)).toBeUndefined();
    expect(creditsView([])).toBeUndefined();
  });

  it('is undefined when nobody is map-listed: there is no line to show', () => {
    expect(creditsView([credit({ name: 'the Academy', listed: 'listing' })])).toBeUndefined();
  });

  it('pairs the line with the full listing', () => {
    const credits = [credit({ name: 'Nick', role: 'Designer' })];
    expect(creditsView(credits)).toEqual({
      line: { names: ['Nick'] },
      listing: [{ rows: [{ role: 'Designer', entries: [{ name: 'Nick', personId: 'name:Nick' }] }] }],
    });
  });
});

describe('teamSizeBucket', () => {
  const people = (n: number): Credit[] => Array.from({ length: n }, (_, i) => credit({ name: `P${i}`, person: `p${i}` }));

  it.each([[0, 'none'], [1, 'small'], [4, 'small'], [5, 'large']])('%i other people is %s', (n, bucket) => {
    expect(teamSizeBucket(people(n), false)).toBe(bucket);
  });

  it('is undefined with neither credits nor solo', () => {
    expect(teamSizeBucket(undefined, false)).toBeUndefined();
  });

  it('is none for solo with no credits', () => {
    expect(teamSizeBucket(undefined, true)).toBe('none');
  });

  it('excludes me by slug, but not a name that merely looks like me', () => {
    expect(teamSizeBucket([credit({ name: 'Paul', person: 'me' })], false)).toBe('none');
    expect(teamSizeBucket([credit({ name: 'Paul Swe' })], false)).toBe('small');
  });

  it('ignores listing-only credits', () => {
    expect(teamSizeBucket([credit({ name: 'A', listed: 'listing' })], false)).toBe('none');
  });

  it('counts a repeated identity once', () => {
    const c = [credit({ name: 'A', person: 'a' }), credit({ name: 'A again', person: 'a' }), credit({ name: 'B' }), credit({ name: 'B' })];
    expect(teamSizeBucket(c, false)).toBe('small');
    expect(teamSizeBucket([...c, ...people(3)], false)).toBe('large');
  });

  it('uses the credits bucket when solo contradicts them', () => {
    expect(teamSizeBucket(people(2), true)).toBe('small');
  });
});

describe('findCreditNameDrift', () => {
  const card = (uid: string, ...credits: Credit[]) => ({ uid, credits });

  it('flags the same name under two person slugs', () => {
    const findings = findCreditNameDrift([
      card('a', credit({ name: 'Tom Dicker', person: 'tom-dicker' })),
      card('b', credit({ name: 'Tom Dicker', person: 'tom-dickers' })),
    ]);
    expect(findings).toEqual([{ kind: 'same-name-different-person', names: ['Tom Dicker'], uids: ['a', 'b'] }]);
  });

  it('does not flag the same identity on two cards', () => {
    expect(
      findCreditNameDrift([
        card('a', credit({ name: 'Tom Dicker', person: 'tom-dicker' })),
        card('b', credit({ name: 'Tom Dicker', person: 'tom-dicker' })),
      ]),
    ).toEqual([]);
  });

  it('flags Withnall vs Whitnall under two slugs as a near-duplicate', () => {
    const findings = findCreditNameDrift([
      card('a', credit({ name: 'Amy Withnall', person: 'amy-withnall' })),
      card('b', credit({ name: 'Amy Whitnall', person: 'amy-whitnall' })),
    ]);
    expect(findings).toEqual([{ kind: 'near-duplicate', names: ['Amy Whitnall', 'Amy Withnall'], uids: ['a', 'b'] }]);
  });

  it('does not flag near names that share one identity', () => {
    expect(
      findCreditNameDrift([
        card('a', credit({ name: 'Amy Withnall', person: 'amy-withnall' })),
        card('b', credit({ name: 'Amy Whitnall', person: 'amy-withnall' })),
      ]),
    ).toEqual([]);
  });

  it('does not flag Paul Swe vs Paul Sztajer (distance above 2)', () => {
    expect(
      findCreditNameDrift([
        card('a', credit({ name: 'Paul Sztajer', person: 'me' })),
        card('b', credit({ name: 'Paul Swe', person: 'paul-swe' })),
      ]),
    ).toEqual([]);
  });

  it('does not flag an allowlisted pair, in either order or case', () => {
    const cards = [
      card('a', credit({ name: 'Val', person: 'val' })),
      card('b', credit({ name: 'Max', person: 'max' })),
    ];
    expect(findCreditNameDrift(cards, [])).toHaveLength(1);
    expect(findCreditNameDrift(cards, [['max', 'VAL']])).toEqual([]);
  });
});
