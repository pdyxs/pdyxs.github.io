import { describe, it, expect } from 'vitest';
import { buildCardPool, toSharedAsset, type CardPoolBundle } from './card-pool';

/**
 * A bundle with every key populated by a distinguishable sentinel, so the pick
 * can be asserted field-for-field. Cast rather than typed out in full: the
 * point of the test is which keys survive, not what the real shapes are.
 */
function fakeBundle(): CardPoolBundle {
  return {
    allCards: [{ uid: 'all' }],
    listedCards: [{ uid: 'listed' }],
    cardBackedValues: new Set(['what:games', 'who:me']),
    registry: { registry: true },
    groupOrder: { what: ['Series'] },
    tagDisplay: { 'what:games': { name: 'Games', declared: true } },
    declaredValues: ['what:games'],
    collapseConfig: new Map([['what/stories', { target: true }]]),
    browseCards: [{ uid: 'browse' }],
    hierarchies: { what: [{ value: 'what:games' }] },
    cards: [{ uid: 'serialised' }],
  } as unknown as CardPoolBundle;
}

describe('toSharedAsset', () => {
  it('picks exactly the five shared keys', () => {
    // Key EQUALITY, not inclusion: a field later added to the bundle must not
    // be able to join the client asset silently. See CLAUDE.md, "The client
    // payload is an explicit pick, never a spread".
    expect(Object.keys(toSharedAsset(fakeBundle())).sort()).toEqual([
      'cardBackedValues',
      'cards',
      'groupOrder',
      'hierarchies',
      'tagDisplay',
    ]);
  });

  it('carries each key through by reference', () => {
    const bundle = fakeBundle();
    const asset = toSharedAsset(bundle);
    expect(asset.cards).toBe(bundle.cards);
    expect(asset.tagDisplay).toBe(bundle.tagDisplay);
    expect(asset.hierarchies).toBe(bundle.hierarchies);
    expect(asset.groupOrder).toBe(bundle.groupOrder);
  });

  it('serialises cardBackedValues from a Set to an array', () => {
    const bundle = fakeBundle();
    const asset = toSharedAsset(bundle);
    expect(Array.isArray(asset.cardBackedValues)).toBe(true);
    expect(asset.cardBackedValues).toEqual(['what:games', 'who:me']);
  });

  it('omits the server-only half of the bundle', () => {
    const asset = toSharedAsset(fakeBundle()) as unknown as Record<string, unknown>;
    for (const key of [
      'allCards',
      'listedCards',
      'registry',
      'declaredValues',
      'collapseConfig',
      'browseCards',
    ]) {
      expect(asset).not.toHaveProperty(key);
    }
  });

  it('is pure — it does not mutate the bundle', () => {
    const bundle = fakeBundle();
    const before = JSON.stringify({ ...bundle, cardBackedValues: [...bundle.cardBackedValues] });
    toSharedAsset(bundle);
    const after = JSON.stringify({ ...bundle, cardBackedValues: [...bundle.cardBackedValues] });
    expect(after).toBe(before);
  });
});

/**
 * The endpoint's contract, against the REAL builder rather than a sentinel
 * bundle. `src/pages/cards.json.ts` is `JSON.stringify(toSharedAsset(await
 * buildCardPool()))` and nothing else, so what is asserted here is what that
 * route emits — the route itself is unreachable from a test (it is an Astro
 * page module, and the `island` project could not import it at all).
 *
 * This runs in the `astro` project deliberately: `buildCardPool` reaches
 * `browse-card.ts` and therefore `astro:assets`, which only resolves through
 * Astro's own Vite config.
 */
describe('the /cards.json payload', () => {
  it('has exactly the five shared keys, and each round-trips through JSON', async () => {
    const asset = toSharedAsset(await buildCardPool());

    // Key EQUALITY again, this time on the real bundle: the fake-bundle test
    // above guards the pick, this one guards what actually ships.
    expect(Object.keys(asset).sort()).toEqual([
      'cardBackedValues',
      'cards',
      'groupOrder',
      'hierarchies',
      'tagDisplay',
    ]);

    // Round-trippable per key, not just in aggregate: a `Set`, a `Map`, a
    // `Date` or an `undefined` reaching the asset survives JSON.stringify by
    // silently becoming `{}`, a string or a dropped key, and only a per-key
    // comparison names which one did it.
    for (const [key, value] of Object.entries(asset)) {
      expect(JSON.parse(JSON.stringify(value)), key).toEqual(value);
    }

    // And the whole document, which is the byte sequence the route writes.
    expect(JSON.parse(JSON.stringify(asset))).toEqual(asset);
  }, 60_000);

  it('is memoised at module level — two builds are one object', async () => {
    expect(await buildCardPool()).toBe(await buildCardPool());
  }, 60_000);
});
