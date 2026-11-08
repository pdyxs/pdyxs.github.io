import { describe, it, expect } from 'vitest';
import { creditIdentity, madeByLine, creditListing, creditsView, type Credit } from '@content/credits/credits';

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
          { role: 'Designer', entries: [{ name: 'Nick' }] },
          { role: 'Programming', entries: [{ name: 'Thomas' }, { name: 'David' }] },
        ],
      },
      {
        heading: 'Level Design',
        rows: [{ role: 'Lead', entries: [{ name: 'Ann' }, { name: 'Alison', note: 'as Alison Scott' }] }],
      },
      { heading: 'Special thanks', rows: [{ entries: [{ name: 'Academy' }] }] },
    ]);
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
      listing: [{ rows: [{ role: 'Designer', entries: [{ name: 'Nick' }] }] }],
    });
  });
});
