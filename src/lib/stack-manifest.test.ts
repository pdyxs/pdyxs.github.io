import { describe, it, expect } from 'vitest';
import { assignCodes, buildLookup, withTitles } from './stack-manifest';

describe('assignCodes', () => {
  it('assignCodes_first_entry: a single new uid gets the shortest code ("0")', () => {
    const result = assignCodes([], ['posts/about-me']);
    expect(result).toEqual([{ uid: 'posts/about-me', code: '0' }]);
  });

  it('assignCodes_multiple_new_uids: each gets the next shortest free code, in input order', () => {
    const result = assignCodes([], ['posts/a', 'posts/b', 'posts/c']);
    expect(result).toEqual([
      { uid: 'posts/a', code: '0' },
      { uid: 'posts/b', code: '1' },
      { uid: 'posts/c', code: '2' },
    ]);
  });

  it('assignCodes_skips_already_known_uids: existing entries are preserved verbatim', () => {
    const existing = [{ uid: 'posts/a', code: '0' }];
    const result = assignCodes(existing, ['posts/a', 'posts/b']);
    expect(result).toEqual([
      { uid: 'posts/a', code: '0' },
      { uid: 'posts/b', code: '1' },
    ]);
  });

  it('assignCodes_is_append_only: rerunning with the same input is a no-op', () => {
    const first = assignCodes([], ['posts/a', 'posts/b']);
    const second = assignCodes(first, ['posts/a', 'posts/b']);
    expect(second).toEqual(first);
  });

  it('manifest_stability: a code assigned to an entity is never reassigned after new entities are added', () => {
    const gen1 = assignCodes([], ['posts/a', 'posts/b', 'posts/c']);
    const codesGen1 = new Map(gen1.map(e => [e.uid, e.code]));

    // A new build sees more content — some new uids appear.
    const gen2 = assignCodes(gen1, ['posts/a', 'posts/b', 'posts/c', 'posts/d', 'posts/e']);

    for (const [uid, code] of codesGen1) {
      const entry = gen2.find(e => e.uid === uid);
      expect(entry?.code).toBe(code);
    }
    // No two entries in the final manifest share a code.
    const allCodes = gen2.map(e => e.code);
    expect(new Set(allCodes).size).toBe(allCodes.length);
  });

  it('assignCodes_never_reassigns_a_code_to_a_different_uid_even_across_many_generations', () => {
    let manifest = assignCodes([], []);
    const seenUidForCode = new Map<string, string>();

    for (let gen = 0; gen < 20; gen++) {
      const uids = Array.from({ length: 5 }, (_, i) => `posts/gen${gen}-item${i}`);
      manifest = assignCodes(manifest, uids);
    }

    for (const entry of manifest) {
      const prior = seenUidForCode.get(entry.code);
      if (prior) {
        expect(prior).toBe(entry.uid);
      } else {
        seenUidForCode.set(entry.code, entry.uid);
      }
    }
    // Sanity: every uid still resolves to exactly one code.
    const uids = manifest.map(e => e.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe('buildLookup', () => {
  it('buildLookup_resolves_both_directions', () => {
    const lookup = buildLookup([{ uid: 'posts/about-me', code: '0' }]);
    expect(lookup.codeForUid('posts/about-me')).toBe('0');
    expect(lookup.uidForCode('0')).toBe('posts/about-me');
  });

  it('buildLookup_returns_undefined_for_unknown_entries', () => {
    const lookup = buildLookup([]);
    expect(lookup.codeForUid('nope')).toBeUndefined();
    expect(lookup.uidForCode('0')).toBeUndefined();
  });
});

describe('withTitles', () => {
  const manifest = [
    { uid: 'posts/a', code: '0' },
    { uid: 'posts/b', code: '1', title: 'Old B' },
    { uid: 'posts/c', code: '2', title: 'Kept C' },
  ];

  it('refreshes wholesale — a retitled card says its new title', () => {
    // The opposite rule to assignCodes, which is why they are separate
    // functions: codes are append-only, titles are replaced every run.
    const result = withTitles(manifest, new Map([['posts/b', 'New B'], ['posts/c', 'Kept C']]));
    expect(result[1]).toEqual({ uid: 'posts/b', code: '1', title: 'New B' });
    expect(result[2]).toEqual({ uid: 'posts/c', code: '2', title: 'Kept C' });
  });

  it('drops the field for a location that no longer has a title', () => {
    // Absent, not empty: `resolveCardTitle` returns '' for an untitled card,
    // and '' is worth neither the bytes nor a header rendering nothing.
    const result = withTitles(manifest, new Map());
    expect(result.every(e => !('title' in e))).toBe(true);
  });

  it('never touches a code, and never reorders', () => {
    const result = withTitles(manifest, new Map([['posts/a', 'A']]));
    expect(result.map(e => [e.uid, e.code])).toEqual(manifest.map(e => [e.uid, e.code]));
  });
});

describe('buildLookup titles', () => {
  it('resolves a title by uid, and undefined for an entry that declares none', () => {
    const lookup = buildLookup([
      { uid: 'posts/a', code: '0', title: 'About me' },
      { uid: 'posts/b', code: '1' },
    ]);
    expect(lookup.titleForUid('posts/a')).toBe('About me');
    expect(lookup.titleForUid('posts/b')).toBeUndefined();
    expect(lookup.titleForUid('posts/nope')).toBeUndefined();
  });
});
