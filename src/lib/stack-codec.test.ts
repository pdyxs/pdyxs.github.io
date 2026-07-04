import { describe, it, expect } from 'vitest';
import { serialiseStack, deserialiseStack } from './stack-codec';
import type { ParamPairs } from './stack-codec';
import { cardEntry } from './stack-layout';
import type { StackState, LocationEntry } from './stack-layout';
import { buildLookup } from './stack-manifest';

const manifest = buildLookup([
  { uid: 'posts/about-me', code: '0' },
  { uid: 'posts/hello', code: '1' },
  { uid: 'tag/travel', code: '2' },
]);

describe('serialiseStack', () => {
  it('serialiseStack_single_active_card: active-only stack has a readable path and no query', () => {
    const state: StackState = { entries: [cardEntry('posts/about-me')], activeKey: 'posts/about-me' };
    const result = serialiseStack(state, new Map(), manifest);
    expect(result.path).toBe('/card/posts/about-me');
    expect(result.search).toBe('');
  });

  it('serialiseStack_from_and_to: inactive locations encode as short manifest codes', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me'), cardEntry('tag/travel')],
      activeKey: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest);
    expect(result.path).toBe('/card/posts/about-me');
    expect(result.search).toBe('?from=1&to=2');
  });

  it('serialiseStack_active_params_ride_the_path_as_plain_query', () => {
    const state: StackState = { entries: [cardEntry('posts/about-me')], activeKey: 'posts/about-me' };
    const paramsByKey = new Map([['posts/about-me', [['tab', 'bio']] as const]]);
    const result = serialiseStack(state, paramsByKey as any, manifest);
    expect(result.search).toBe('?tab=bio');
  });

  it('serialiseStack_inactive_params_ride_as_escape_hatch_suffix_on_the_code', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me')],
      activeKey: 'posts/about-me',
    };
    const paramsByKey = new Map([['posts/hello', [['tab', 'bio']] as const]]);
    const result = serialiseStack(state, paramsByKey as any, manifest);
    // URLSearchParams.toString() percent-encodes '~' (form encoding, not URI encoding) —
    // the important property is that it round-trips, not the literal string shape.
    expect(result.search).toBe('?from=1%7Etab%3Dbio');
    const decoded = new URLSearchParams(result.search);
    expect(decoded.get('from')).toBe('1~tab=bio');
  });

  it('serialiseStack_unknown_uid_falls_back_to_raw_uid: no manifest entry still produces a usable (if longer) token', () => {
    const state: StackState = {
      entries: [cardEntry('posts/unmapped'), cardEntry('posts/about-me')],
      activeKey: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest);
    expect(result.search).toBe('?from=posts%2Funmapped');
  });

  it('serialiseStack_empty_stack_returns_homepage', () => {
    const state: StackState = { entries: [], activeKey: null };
    const result = serialiseStack(state, new Map(), manifest);
    expect(result.path).toBe('/');
    expect(result.search).toBe('');
  });
});

describe('deserialiseStack', () => {
  it('deserialiseStack_active_only: a bare card path with no query', () => {
    const result = deserialiseStack('/card/posts/about-me', '', manifest);
    expect(result.state).toEqual({
      entries: [{ key: 'posts/about-me', uid: 'posts/about-me' }],
      activeKey: 'posts/about-me',
    });
    expect(result.paramsByKey.size).toBe(0);
  });

  it('deserialiseStack_from_and_to: short codes resolve back to uids via the manifest', () => {
    const result = deserialiseStack('/card/posts/about-me', '?from=1&to=2', manifest);
    expect(result.state.entries.map(e => e.uid)).toEqual(['posts/hello', 'posts/about-me', 'tag/travel']);
    expect(result.state.activeKey).toBe('posts/about-me');
  });

  it('deserialiseStack_non_card_path_returns_empty_stack', () => {
    const result = deserialiseStack('/', '', manifest);
    expect(result.state).toEqual({ entries: [], activeKey: null });
  });
});

describe('round-trip property', () => {
  // Small deterministic PRNG so the fuzz run is reproducible.
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const uidPool = ['posts/about-me', 'posts/hello', 'tag/travel', 'posts/unmapped-thing'];
  const paramKeyPool = ['tab', 'x'];
  const paramValuePool = ['bio', 'games', 'a b', 'c&d'];

  function randomStack(rand: () => number): { state: StackState; paramsByKey: Map<string, ParamPairs> } {
    const n = 1 + Math.floor(rand() * 5);
    const entries: LocationEntry[] = [];
    const usedUids = new Set<string>();
    for (let i = 0; i < n; i++) {
      let uid = uidPool[Math.floor(rand() * uidPool.length)];
      let guard = 0;
      while (usedUids.has(uid) && guard++ < 10) {
        uid = `${uid}-${i}`;
      }
      usedUids.add(uid);
      entries.push(cardEntry(uid));
    }
    const activeIdx = Math.floor(rand() * n);
    const activeKey = entries[activeIdx].key;

    const paramsByKey = new Map<string, ParamPairs>();
    for (const entry of entries) {
      if (rand() < 0.5) continue;
      const numParams = 1 + Math.floor(rand() * 3);
      const pairs: ParamPairs = [];
      for (let j = 0; j < numParams; j++) {
        const k = paramKeyPool[Math.floor(rand() * paramKeyPool.length)];
        const v = paramValuePool[Math.floor(rand() * paramValuePool.length)];
        pairs.push([k, v]);
      }
      paramsByKey.set(entry.key, pairs);
    }

    return { state: { entries, activeKey }, paramsByKey };
  }

  it('deserialise(serialise(stack)) round-trips across many random card-only stacks, including repeated escape-hatch param keys', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const { state, paramsByKey } = randomStack(rand);
      const { path, search } = serialiseStack(state, paramsByKey, manifest);
      const decoded = deserialiseStack(path, search, manifest);

      expect(decoded.state).toEqual(state);
      for (const [key, pairs] of paramsByKey) {
        expect(decoded.paramsByKey.get(key)).toEqual(pairs);
      }
      // No stray params beyond what was encoded.
      expect(decoded.paramsByKey.size).toBe(paramsByKey.size);
    }
  });

  it('round-trip preserves repeated param keys explicitly (escape hatch, single case)', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me')],
      activeKey: 'posts/about-me',
    };
    const paramsByKey = new Map<string, ParamPairs>([
      ['posts/hello', [['x', '1'], ['x', '2'], ['tab', 'bio']]],
    ]);
    const { path, search } = serialiseStack(state, paramsByKey, manifest);
    const decoded = deserialiseStack(path, search, manifest);
    expect(decoded.paramsByKey.get('posts/hello')).toEqual([['x', '1'], ['x', '2'], ['tab', 'bio']]);
    expect(decoded.state).toEqual(state);
  });
});
