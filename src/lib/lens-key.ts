// A lens location's identity (issue #100).
//
// A card location is identified by its uid alone: `/card/what/puzzles/foo` is
// one thing, wherever you reached it from. A *lens* is not — "Most Interesting"
// filtered to puzzles and "Most Interesting" filtered to Norway are two
// different things to look at, and the stack has to be able to hold both at
// once. So a lens location's identity is **the lens plus its filter set**, and
// this module is where that string is built and read back.
//
//   uid   lens/interesting                        (what gets fetched)
//   key   lens/interesting?filter.what=puzzles    (what it *is*)
//
// Before this, filters rode in a side map keyed by the bare uid, which made
// three bugs representable: a differently-filtered link re-activated the
// existing lens instead of pushing, the already-mounted lens kept its own
// filter state while the side map said otherwise, and two filtered views of
// one lens could never coexist. Putting the filters in the key makes all
// three unrepresentable rather than fixed.
//
// **Canonical order is load-bearing.** Two links that select the same filters
// in a different order must produce the same key, or "already in the stack"
// silently stops matching and every such link pushes a duplicate. `lensKey`
// therefore sorts by key then value and drops exact duplicates.
//
// The `?` separator is chosen because the key then reads as exactly what it
// is: the lens's own path plus its query. No uid contains a `?`, so the split
// is unambiguous and `uidForKey` is a single `indexOf`.
import { URL_PARAM_PROVIDERS } from './url-param-providers';

export type KeyParamPairs = readonly (readonly [string, string])[];

const LENS_PREFIX = 'lens/';
const QUERY_SEP = '?';

/** Param keys some registered provider owns: the ones that name a location. */
const IDENTITY_PARAM_KEYS: ReadonlySet<string> = new Set(
  URL_PARAM_PROVIDERS.flatMap(p => [...p.paramKeys]),
);

/**
 * True for a param that is part of *what a lens location is* (a filter), as
 * opposed to side state it merely carries (a card's `tab=bio`, the browse
 * page's `stack=`). Folded from the provider registry rather than listed here,
 * so a new provider needs no second edit.
 */
export function isIdentityParamKey(key: string): boolean {
  return IDENTITY_PARAM_KEYS.has(key);
}

/** True for a uid (or key) naming a lens rather than a card. */
export function isLensUid(uidOrKey: string): boolean {
  return uidOrKey.startsWith(LENS_PREFIX);
}

/**
 * Splits a location's params into the half that belongs in its key and the
 * half that stays side state. Only lens locations have an identity half: a
 * card's uid already names it completely.
 */
export function splitLocationParams(
  uid: string,
  pairs: KeyParamPairs,
): { identity: [string, string][]; other: [string, string][] } {
  if (!isLensUid(uid)) return { identity: [], other: pairs.map(p => [p[0], p[1]]) };
  const identity: [string, string][] = [];
  const other: [string, string][] = [];
  for (const [k, v] of pairs) (isIdentityParamKey(k) ? identity : other).push([k, v]);
  return { identity, other };
}

/**
 * Canonical order for a lens's filter pairs: sorted by key then value, exact
 * duplicates removed. This is what makes two differently-ordered links produce
 * one key, per the note at the top of this file.
 */
export function canonicalFilterPairs(pairs: KeyParamPairs): [string, string][] {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const [k, v] of pairs) {
    const id = `${k} ${v}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push([k, v]);
  }
  out.sort((a, b) => (a[0] === b[0]
    ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
    : (a[0] < b[0] ? -1 : 1)));
  return out;
}

/** The canonical query string for a filter set. Empty when there are none. */
export function filterQueryString(pairs: KeyParamPairs): string {
  const usp = new URLSearchParams();
  for (const [k, v] of canonicalFilterPairs(pairs)) usp.append(k, v);
  return usp.toString();
}

/** `lens/<name>`, or `lens/<name>?<canonical query>` when filters are set. */
export function lensKey(name: string, filters: KeyParamPairs = []): string {
  const query = filterQueryString(filters);
  return query ? `${LENS_PREFIX}${name}${QUERY_SEP}${query}` : `${LENS_PREFIX}${name}`;
}

/** The fetchable uid behind any location key: the key minus its query. */
export function uidForKey(key: string): string {
  const q = key.indexOf(QUERY_SEP);
  return q === -1 ? key : key.slice(0, q);
}

/**
 * The identity params carried in a key, in canonical order. Empty for a card
 * key and for an unfiltered lens.
 */
export function filtersForKey(key: string): [string, string][] {
  const q = key.indexOf(QUERY_SEP);
  if (q === -1) return [];
  const out: [string, string][] = [];
  new URLSearchParams(key.slice(q + 1)).forEach((v, k) => { out.push([k, v]); });
  return out;
}

/** The lens id in a lens key/uid (`lens/interesting?...` gives `interesting`). */
export function lensNameForKey(key: string): string | null {
  if (!isLensUid(key)) return null;
  return uidForKey(key).slice(LENS_PREFIX.length);
}

/** True when two filter sets name the same location. */
export function sameFilters(a: KeyParamPairs, b: KeyParamPairs): boolean {
  return filterQueryString(a) === filterQueryString(b);
}
