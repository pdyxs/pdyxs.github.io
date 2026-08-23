import { describe, it, expect } from 'vitest';
import { cardEntry, lensEntry, allocateSlot, withFreeSlot, slotForKey, keyForSlot, locationKind, presentationMode, planPush } from './stack-layout';
import type { StackState } from './stack-layout';

describe('locationKind', () => {
  it('classifies a "lens/<name>" uid as a lens', () => {
    expect(locationKind('lens/home')).toBe('lens');
    expect(locationKind('lens/newest')).toBe('lens');
  });

  it('classifies a "collection/id" uid as a card', () => {
    expect(locationKind('posts/about-me')).toBe('card');
    expect(locationKind('tag/who')).toBe('card');
  });
});

describe('presentationMode', () => {
  it('page mode: a lens is the sole/root active entry (stack depth 1)', () => {
    expect(presentationMode('lens', 1)).toBe('page');
  });

  it('card mode: the same lens deeper in the stack (depth > 1)', () => {
    expect(presentationMode('lens', 2)).toBe('card');
    expect(presentationMode('lens', 5)).toBe('card');
  });

  it('card mode: a card is always card mode, even at depth 1', () => {
    expect(presentationMode('card', 1)).toBe('card');
    expect(presentationMode('card', 3)).toBe('card');
  });
});


// ── Location identity vs DOM handle (issue #100) ───────────────────────────

describe('lensEntry', () => {
  it('separates what is fetched from what the location is', () => {
    const entry = lensEntry('interesting', [['filter.what', 'puzzles']]);
    expect(entry.uid).toBe('lens/interesting');
    expect(entry.key).toBe('lens/interesting?filter.what=puzzles');
    // The handle defaults to the uid, so a lone filtered lens still mounts
    // under the data-uid its SSR fragment already carries.
    expect(entry.slot).toBe('lens/interesting');
  });

  it('leaves a card with all three equal', () => {
    expect(cardEntry('posts/hello')).toEqual({
      key: 'posts/hello', uid: 'posts/hello', slot: 'posts/hello',
    });
  });
});

describe('allocateSlot', () => {
  it('hands back the preferred handle when it is free', () => {
    expect(allocateSlot([cardEntry('a')], 'lens/newest')).toBe('lens/newest');
  });

  it('suffixes a second view of the same lens rather than colliding', () => {
    const first = lensEntry('newest', [['filter.what', 'puzzles']]);
    expect(allocateSlot([first], 'lens/newest')).toBe('lens/newest#2');
    const second = { ...first, slot: 'lens/newest#2' };
    expect(allocateSlot([first, second], 'lens/newest')).toBe('lens/newest#3');
  });

  it('withFreeSlot returns the same object when nothing clashes', () => {
    const entry = lensEntry('newest');
    expect(withFreeSlot([cardEntry('a')], entry)).toBe(entry);
  });
});

describe('slotForKey / keyForSlot', () => {
  const a = lensEntry('newest', [['filter.what', 'puzzles']]);
  const b = { ...lensEntry('newest', [['filter.what', 'projects']]), slot: 'lens/newest#2' };
  const state: StackState = { entries: [a, b], activeSlot: b.slot };

  it('maps identity to handle and back', () => {
    expect(slotForKey(state, a.key)).toBe('lens/newest');
    expect(slotForKey(state, b.key)).toBe('lens/newest#2');
    expect(keyForSlot(state, 'lens/newest#2')).toBe(b.key);
  });

  it('is null for anything not stacked', () => {
    expect(slotForKey(state, 'lens/newest?filter.what=nope')).toBeNull();
    expect(slotForKey(state, null)).toBeNull();
    expect(keyForSlot(state, 'lens/nope')).toBeNull();
  });
});

describe('planPush', () => {
  const stack = (entries: ReturnType<typeof cardEntry>[], activeSlot: string | null = null): StackState =>
    ({ entries, activeSlot: activeSlot ?? entries.at(-1)?.slot ?? null });

  it('pushes a location the stack has never held', () => {
    const plan = planPush(stack([cardEntry('a/one')]), [], cardEntry('b/two'));
    expect(plan).toEqual({ kind: 'push', entry: cardEntry('b/two') });
  });

  it('activates a location already stacked, by its slot', () => {
    const there = cardEntry('b/two');
    expect(planPush(stack([cardEntry('a/one'), there]), [], cardEntry('b/two')))
      .toEqual({ kind: 'activate', slot: 'b/two' });
  });

  it('ignores a location a push is already in flight for (#112)', () => {
    // The double-click. One intent delivered twice is still one navigation, and
    // the in-flight push ends by activating the location and writing the URL.
    const inFlight = cardEntry('b/two');
    expect(planPush(stack([cardEntry('a/one')]), [inFlight], cardEntry('b/two')))
      .toEqual({ kind: 'ignore' });
  });

  it('never hands out a slot an in-flight push has reserved (#112)', () => {
    // Two DIFFERENT locations that both want the handle `lens/interesting`:
    // clicking two differently-filtered links in quick succession. The second
    // must not be given the slot the first is about to occupy.
    const first = lensEntry('interesting', [['filter.what', 'what:puzzles']]);
    const second = lensEntry('interesting', [['filter.where', 'where:norway']]);
    expect(first.slot).toBe(second.slot);

    const plan = planPush(stack([cardEntry('a/one')]), [first], second);
    expect(plan.kind).toBe('push');
    expect((plan as { entry: { slot: string } }).entry.slot).toBe('lens/interesting#2');
  });

  it('prefers ignore over activate while a key is briefly in both', () => {
    // The window between a push landing in the store and its reservation being
    // released. Activating is harmless there (it is already active) but doing
    // nothing is the answer that cannot be wrong.
    const landed = cardEntry('b/two');
    expect(planPush(stack([landed]), [landed], cardEntry('b/two')))
      .toEqual({ kind: 'ignore' });
  });

  it('leaves a repeated location pushable once nothing is in flight (#106)', () => {
    // Keys are not unique — a path can pass the same place twice — so an empty
    // `pending` must not make `planPush` refuse a second, differently-handled
    // view. That case reaches the stack through rekeying, not through push, so
    // what this asserts is that the guard is scoped to in-flight pushes only.
    const first = lensEntry('interesting');
    expect(planPush(stack([first]), [], lensEntry('interesting')))
      .toEqual({ kind: 'activate', slot: 'lens/interesting' });
  });
});
