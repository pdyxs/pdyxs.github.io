import { describe, it, expect } from 'vitest';
import { toSharedAsset, type CardPoolBundle } from './card-pool';

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
