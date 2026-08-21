import { describe, it, expect } from 'vitest';
import { serialiseStack, deserialiseStack, locationParamsFromSearch, STACK_STRUCTURE_PARAM_KEYS } from './stack-codec';
import { filtersForKey } from './lens-key';
import type { ParamPairs } from './stack-codec';
import { cardEntry, lensEntry } from './stack-layout';
import { isLensUid, lensNameForKey, splitLocationParams } from './lens-key';
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
    const state: StackState = { entries: [cardEntry('posts/about-me')], activeSlot: 'posts/about-me' };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/card/posts/about-me');
    expect(result.search).toBe('');
  });

  it('serialiseStack_from_and_to: inactive locations encode as short manifest codes', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me'), cardEntry('tag/travel')],
      activeSlot: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/card/posts/about-me');
    expect(result.search).toBe('?from=1&to=2');
  });

  it('serialiseStack_active_params_ride_the_path_as_plain_query', () => {
    const state: StackState = { entries: [cardEntry('posts/about-me')], activeSlot: 'posts/about-me' };
    const paramsByKey = new Map([['posts/about-me', [['tab', 'bio']] as const]]);
    const result = serialiseStack(state, paramsByKey as any, manifest, tags);
    expect(result.search).toBe('?tab=bio');
  });

  it('serialiseStack_inactive_params_ride_as_escape-free_codec_tokens_on_the_code', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me')],
      activeSlot: 'posts/about-me',
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
      activeSlot: 'posts/about-me',
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
      activeSlot: 'posts/about-me',
    };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.search).toBe('?from=posts/unmapped');
  });

  it('serialiseStack_empty_stack_returns_homepage', () => {
    const state: StackState = { entries: [], activeSlot: null };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/');
    expect(result.search).toBe('');
  });
});

describe('deserialiseStack', () => {
  it('deserialiseStack_active_only: a bare card path with no query', () => {
    const result = deserialiseStack('/card/posts/about-me', '', manifest, tags);
    expect(result.state).toEqual({
      entries: [cardEntry('posts/about-me')],
      activeSlot: 'posts/about-me',
    });
    expect(result.paramsByKey.size).toBe(0);
  });

  it('deserialiseStack_from_and_to: short codes resolve back to uids via the manifest', () => {
    const result = deserialiseStack('/card/posts/about-me', '?from=1&to=2', manifest, tags);
    expect(result.state.entries.map(e => e.uid)).toEqual(['posts/hello', 'posts/about-me', 'tag/travel']);
    expect(result.state.activeSlot).toBe('posts/about-me');
  });

  it('deserialiseStack_inactive_filter_params: coded tokens resolve back to short filter pairs', () => {
    const result = deserialiseStack('/card/posts/about-me', '?from=4~f0~f1', manifest, tags);
    expect(result.state.entries.map(e => e.uid)).toEqual(['lens/newest', 'posts/about-me']);
    // A lens's filters are its identity, so they land in the KEY (issue #100),
    // not in the side map. The uid stays the fetchable `lens/newest`.
    expect(result.state.entries[0]).toEqual(
      lensEntry('newest', [['filter.what', 'projects'], ['filter.what', 'puzzles']]),
    );
    expect(result.paramsByKey.size).toBe(0);
  });

  it('deserialiseStack_non_card_path_returns_empty_stack', () => {
    const result = deserialiseStack('/', '', manifest, tags);
    expect(result.state).toEqual({ entries: [], activeSlot: null });
  });
});

describe('lens locations', () => {
  it('serialiseStack_active_lens: an active lens location paths to /lens/<name>, not /card', () => {
    const state: StackState = { entries: [lensEntry('newest')], activeSlot: 'lens/newest' };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/lens/newest');
    expect(result.search).toBe('');
  });

  it('deserialiseStack_active_lens: a /lens/<name> path resolves to a lens/<name> uid', () => {
    const result = deserialiseStack('/lens/newest', '', manifest, tags);
    expect(result.state).toEqual({
      entries: [lensEntry('newest')],
      activeSlot: 'lens/newest',
    });
  });

  it('active lens + multi-value filter params are readable in the URL', () => {
    // The selection is part of the location now: it rides in the entry's key,
    // and the path/query it serialises to is unchanged from before #100.
    const filtered = lensEntry('newest', [['filter.what', 'projects'], ['filter.what', 'puzzles']]);
    const state: StackState = { entries: [filtered], activeSlot: filtered.slot };
    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/lens/newest');

    const parsed = new URLSearchParams(result.search);
    expect(parsed.getAll('filter.what')).toEqual(['projects', 'puzzles']);

    const decoded = deserialiseStack(result.path, result.search, manifest, tags);
    expect(decoded.state).toEqual(state);
    expect(decoded.paramsByKey.size).toBe(0);
  });

  it('two differently-filtered views of one lens coexist with distinct keys and handles', () => {
    const puzzles = lensEntry('newest', [['filter.what', 'puzzles']]);
    const projects = lensEntry('newest', [['filter.what', 'projects']], 'lens/newest#2');
    const state: StackState = { entries: [puzzles, projects], activeSlot: projects.slot };

    const result = serialiseStack(state, new Map(), manifest, tags);
    expect(result.path).toBe('/lens/newest');
    // The inactive one short-codes with its own filter token.
    expect(result.search).toBe('?from=4~f1&filter.what=projects');

    const decoded = deserialiseStack(result.path, result.search, manifest, tags);
    expect(decoded.state.entries.map(e => e.key)).toEqual([puzzles.key, projects.key]);
    // Distinct DOM/cache handles, so both fragments can mount side by side.
    expect(new Set(decoded.state.entries.map(e => e.slot)).size).toBe(2);
  });

  it('a filter set is canonically ordered, so two orderings name one location', () => {
    const a = lensEntry('newest', [['filter.what', 'puzzles'], ['filter.what', 'projects']]);
    const b = lensEntry('newest', [['filter.what', 'projects'], ['filter.what', 'puzzles']]);
    expect(a.key).toBe(b.key);
  });

  it('a pre-#100 shared link, whose filters rode the side map, still restores the same stack', () => {
    // This is the exact URL the old codec emitted for "newest filtered to
    // projects+puzzles, sitting behind an open card". Nothing about the wire
    // format changed — only which side of the decode the filters land on.
    const decoded = deserialiseStack('/card/posts/about-me', '?from=4~f0~f1', manifest, tags);
    expect(decoded.state.entries.map(e => e.uid)).toEqual(['lens/newest', 'posts/about-me']);
    expect(filtersForKey(decoded.state.entries[0].key)).toEqual([
      ['filter.what', 'projects'],
      ['filter.what', 'puzzles'],
    ]);
    // And it re-serialises byte-identically, so the link is stable.
    expect(serialiseStack(decoded.state, decoded.paramsByKey, manifest, tags)).toEqual({
      path: '/card/posts/about-me',
      search: '?from=4~f0~f1',
    });
  });

  it('mixed card<->lens interleaved stacks round-trip, with inactive locations short-coded via the manifest', () => {
    const state: StackState = {
      entries: [cardEntry('posts/hello'), lensEntry('home'), cardEntry('posts/about-me'), lensEntry('newest')],
      activeSlot: 'posts/about-me',
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
      activeSlot: 'lens/newest',
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
    const uids: string[] = [];
    const usedUids = new Set<string>();
    for (let i = 0; i < n; i++) {
      let uid = uidPool[Math.floor(rand() * uidPool.length)];
      let guard = 0;
      while (usedUids.has(uid) && guard++ < 10) {
        uid = `${uid}-${i}`;
      }
      usedUids.add(uid);
      uids.push(uid);
    }

    const paramsByKey = new Map<string, ParamPairs>();
    for (const uid of uids) {
      const pairs: ParamPairs = [];
      if (rand() >= 0.5) {
        const numParams = 1 + Math.floor(rand() * 3);
        for (let j = 0; j < numParams; j++) {
          const k = paramKeyPool[Math.floor(rand() * paramKeyPool.length)];
          const v = paramValuePool[Math.floor(rand() * paramValuePool.length)];
          pairs.push([k, v]);
        }
      }
      // A valid state puts a lens's filter params in its key and everything
      // else in the side map — the same split deserialise performs.
      const { identity, other } = splitLocationParams(uid, pairs);
      const entry = isLensUid(uid) ? lensEntry(lensNameForKey(uid)!, identity) : cardEntry(uid);
      entries.push(entry);
      if (other.length) paramsByKey.set(entry.key, other);
    }

    const activeIdx = Math.floor(rand() * n);
    const activeSlot = entries[activeIdx].slot;

    return { state: { entries, activeSlot }, paramsByKey };
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
      activeSlot: 'posts/about-me',
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

describe('locationParamsFromSearch (#103)', () => {
  it('keeps a location its own params, in order', () => {
    expect(locationParamsFromSearch('?tab=bio&filter.what=puzzles')).toEqual([
      ['tab', 'bio'],
      ['filter.what', 'puzzles'],
    ]);
    // The leading `?` is optional — pushFilteredLens hands it a bare query.
    expect(locationParamsFromSearch('tab=bio')).toEqual([['tab', 'bio']]);
    expect(locationParamsFromSearch('')).toEqual([]);
  });

  it('never hands back the structural keys, which belong to the stack', () => {
    // `?from=…` says where this location sits, not what it is. Adopted as a
    // location's own param it is re-emitted beside the structural pair for
    // ever after (issue #103).
    expect(locationParamsFromSearch('?from=1&to=2&tab=bio')).toEqual([['tab', 'bio']]);
    expect(locationParamsFromSearch('?from=1.4~f0&to=2')).toEqual([]);
    expect(STACK_STRUCTURE_PARAM_KEYS.has('from')).toBe(true);
    expect(STACK_STRUCTURE_PARAM_KEYS.has('to')).toBe(true);
  });

  it('is the same reading deserialiseStack gives the active entry', () => {
    // One decision, two consumers: the codec's own active-param split is this
    // function, so a URL the codec wrote round-trips to the same side params
    // whichever door you come in by.
    const state: StackState = {
      entries: [cardEntry('posts/hello'), cardEntry('posts/about-me')],
      activeSlot: 'posts/about-me',
    };
    const paramsByKey = new Map<string, ParamPairs>([['posts/about-me', [['tab', 'bio']]]]);
    const { path, search } = serialiseStack(state, paramsByKey, manifest, tags);
    expect(search).toContain('from=');
    const decoded = deserialiseStack(path, search, manifest, tags);
    expect(decoded.paramsByKey.get('posts/about-me')).toEqual(locationParamsFromSearch(search));
  });
});
