import { describe, it, expect } from 'vitest';
import { serialiseStack, deserialiseStack } from './stack-codec';
import type { ParamPairs } from './stack-codec';
import { cardEntry, lensEntry } from './stack-layout';
import type { StackState, LocationEntry } from './stack-layout';
import { buildLookup } from './stack-manifest';

const manifest = buildLookup([
  { uid: 'posts/about-me', code: '0' },
  { uid: 'posts/hello', code: '1' },
  { uid: 'tag/travel', code: '2' },
  { uid: 'lens/home', code: '3' },
  { uid: 'lens/newest', code: '4' },
]);

// Separate tag manifest — filter params in from/to encode against this.
const tags = buildLookup([
  { uid: 'what:projects', code: '0' },
  { uid: 'what:puzzles', code: '1' },
]);

describe('serialiseStack', () => {
  it('serialiseStack_single_active_card: active-only stack has a readable path and no query', () => {
    const state: StackState = { entries: [cardEntry('posts/about-me')], activeKey: 'posts/about-me' };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/card/posts/about-me');
    expect(result.search).toBe('');
  });

  it('serialiseStack_from_and_to: inactive locations encode as short manifest codes', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me'), cardEntry('tag/travel')],
      activeKey: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/card/posts/about-me');
    expect(result.search).toBe('?from=1&to=2');
  });

  it('serialiseStack_active_params_ride_the_path_as_plain_query', () => {
    const state: StackState = { entries: [cardEntry('posts/about-me')], activeKey: 'posts/about-me' };
    const paramsByKey = new Map([['posts/about-me', [['tab', 'bio']] as const]]);
    const result = serialiseStack(state, paramsByKey as any, manifest, tags);
    expect(result.search).toBe('?tab=bio');
  });

  it('serialiseStack_inactive_params_ride_as_escape-free_codec_tokens_on_the_code', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me')],
      activeKey: 'posts/about-me',
    };
    const paramsByKey = new Map([['posts/hello', [['tab', 'bio']] as const]]);
    const result = serialiseStack(state, paramsByKey as any, manifest, tags);
    // 'tab' is not a filter, so it rides the raw base64url codec (sigil 'q').
    // No %-escapes at all — the whole token is URL-safe.
    expect(result.search).toBe('?from=1~qdGFiPWJpbw');
    expect(result.search).not.toMatch(/%/);
  });

  it('serialiseStack_inactive_filter_params_encode_via_the_tag_manifest', () => {
    const state: StackState = {
      entries: [lensEntry('newest'), cardEntry('posts/about-me')],
      activeKey: 'posts/about-me',
    };
    // Short filter values (dimension lives in the key); what:projects -> tag code 0.
    const paramsByKey = new Map<string, ParamPairs>([
      ['lens/newest', [['filter.what', 'projects'], ['filter.what', 'puzzles']]],
    ]);
    const result = serialiseStack(state, paramsByKey, manifest, tags);
    // lens/newest = location code 4; filters = tag codes 0 and 1.
    expect(result.search).toBe('?from=4~f0~f1');
    expect(result.search).not.toMatch(/%/);
  });

  it('serialiseStack_unknown_uid_falls_back_to_raw_uid: no manifest entry still produces a usable (if longer) token', () => {
    const state: StackState = {
      entries: [cardEntry('posts/unmapped'), cardEntry('posts/about-me')],
      activeKey: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.search).toBe('?from=posts/unmapped');
  });

  it('serialiseStack_empty_stack_returns_homepage', () => {
    const state: StackState = { entries: [], activeKey: null };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/');
    expect(result.search).toBe('');
  });
});

describe('deserialiseStack', () => {
  it('deserialiseStack_active_only: a bare card path with no query', () => {
    const result = deserialiseStack('/card/posts/about-me', '', manifest, tags);
    expect(result.state).toEqual({
      entries: [{ key: 'posts/about-me', uid: 'posts/about-me' }],
      activeKey: 'posts/about-me',
    });
    expect(result.paramsByKey.size).toBe(0);
  });

  it('deserialiseStack_from_and_to: short codes resolve back to uids via the manifest', () => {
    const result = deserialiseStack('/card/posts/about-me', '?from=1&to=2', manifest, tags);
    expect(result.state.entries.map(e => e.uid)).toEqual(['posts/hello', 'posts/about-me', 'tag/travel']);
    expect(result.state.activeKey).toBe('posts/about-me');
  });

  it('deserialiseStack_inactive_filter_params: coded tokens resolve back to short filter pairs', () => {
    const result = deserialiseStack('/card/posts/about-me', '?from=4~f0~f1', manifest, tags);
    expect(result.state.entries.map(e => e.uid)).toEqual(['lens/newest', 'posts/about-me']);
    expect(result.paramsByKey.get('lens/newest')).toEqual([
      ['filter.what', 'projects'],
      ['filter.what', 'puzzles'],
    ]);
  });

  it('deserialiseStack_non_card_path_returns_empty_stack', () => {
    const result = deserialiseStack('/', '', manifest, tags);
    expect(result.state).toEqual({ entries: [], activeKey: null });
  });
});

describe('lens locations', () => {
  it('serialiseStack_active_lens: an active lens location paths to /lens/<name>, not /card', () => {
    const state: StackState = { entries: [lensEntry('newest')], activeKey: 'lens/newest' };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/lens/newest');
    expect(result.search).toBe('');
  });

  it('deserialiseStack_active_lens: a /lens/<name> path resolves to a lens/<name> uid', () => {
    const result = deserialiseStack('/lens/newest', '', manifest, tags);
    expect(result.state).toEqual({
      entries: [{ key: 'lens/newest', uid: 'lens/newest' }],
      activeKey: 'lens/newest',
    });
  });

  it('active lens + multi-value filter params are readable in the URL', () => {
    const state: StackState = { entries: [lensEntry('newest')], activeKey: 'lens/newest' };
    // Active params ride as plain, readable query pairs (short values).
    const paramsByKey = new Map([
      ['lens/newest', [['filter.what', 'projects'], ['filter.what', 'puzzles']] as ParamPairs],
    ]);
    const result = serialiseStack(state, paramsByKey, manifest, tags);
    expect(result.path).toBe('/lens/newest');

    const parsed = new URLSearchParams(result.search);
    expect(parsed.getAll('filter.what')).toEqual(['projects', 'puzzles']);

    const decoded = deserialiseStack(result.path, result.search, manifest, tags);
    expect(decoded.state.activeKey).toBe('lens/newest');
    expect(decoded.paramsByKey.get('lens/newest')).toEqual([
      ['filter.what', 'projects'],
      ['filter.what', 'puzzles'],
    ]);
  });

  it('mixed card<->lens interleaved stacks round-trip, with inactive locations short-coded via the manifest', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), lensEntry('home'), cardEntry('posts/about-me'), lensEntry('newest')],
      activeKey: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/card/posts/about-me');
    // Entries are '.'-separated (escape-free) rather than ','-escaped.
    expect(result.search).toBe('?from=1.3&to=4');

    const decoded = deserialiseStack(result.path, result.search, manifest, tags);
    expect(decoded.state).toEqual(state);
  });

  it('an inactive lens in the stack while a lens is active round-trips through /lens/<name>', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), lensEntry('newest')],
      activeKey: 'lens/newest',
    };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/lens/newest');
    expect(result.search).toBe('?from=1');

    const decoded = deserialiseStack(result.path, result.search, manifest, tags);
    expect(decoded.state).toEqual(state);
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

  const uidPool = ['posts/about-me', 'posts/hello', 'tag/travel', 'posts/unmapped-thing', 'lens/home', 'lens/newest'];
  // Mixes filter keys (some values in the tag manifest → coded, some not → raw
  // fallback) and arbitrary params (raw fallback), plus reserved-char values.
  const paramKeyPool = ['tab', 'x', 'filter.what', 'filter'];
  const paramValuePool = ['bio', 'projects', 'puzzles', 'unknown', 'a b', 'c&d', 'k=v'];

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
      const { path, search } = serialiseStack(state, paramsByKey, manifest, tags);
      const decoded = deserialiseStack(path, search, manifest, tags);

      expect(decoded.state).toEqual(state);
      for (const [key, pairs] of paramsByKey) {
        expect(decoded.paramsByKey.get(key)).toEqual(pairs);
      }
      // No stray params beyond what was encoded.
      expect(decoded.paramsByKey.size).toBe(paramsByKey.size);
      // The raw from/to segments carry no %-escapes (unmapped-uid fallback aside).
      for (const seg of search.replace(/^\?/, '').split('&')) {
        if ((seg.startsWith('from=') || seg.startsWith('to=')) && !seg.includes('unmapped')) {
          expect(seg).not.toMatch(/%/);
        }
      }
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
    const { path, search } = serialiseStack(state, paramsByKey, manifest, tags);
    const decoded = deserialiseStack(path, search, manifest, tags);
    expect(decoded.paramsByKey.get('posts/hello')).toEqual([['x', '1'], ['x', '2'], ['tab', 'bio']]);
    expect(decoded.state).toEqual(state);
  });
});
