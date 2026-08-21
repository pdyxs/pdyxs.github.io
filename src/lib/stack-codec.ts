// Stack codec: serialises/deserialises the whole card-navigation stack to
// and from a URL. The active location is readable in the path/params;
// inactive locations (from/to) are encoded compactly.
//
// An inactive entry is `<locationcode>` (a short base62 code from the location
// manifest, src/lib/stack-manifest.ts) followed by zero or more `~`-separated
// param tokens; entries within from/to are `.`-separated. Each param token is
// produced by the codec registry (src/lib/param-codecs.ts) — filters resolve
// to a tag-manifest code, everything else rides an escape-free base64url
// fallback. The whole from/to value is drawn from `[A-Za-z0-9._~-]`, so it
// survives to the URL with no percent-escaping:
//   from=4~f0~f1   (lens/newest with filter.what=projects & filter.what=puzzles)
//
// The active entry's own params ride as plain, readable query pairs instead
// (e.g. ?filter.what=projects), keeping the address bar legible.
import type { LocationEntry, StackState } from './stack-layout';
import { allocateSlot, cardEntry, lensEntry, withFreeSlot } from './stack-layout';
import { filtersForKey, isLensUid, lensNameForKey, splitLocationParams } from './lens-key';
import type { ManifestLookup } from './stack-manifest';
import { encodeParam, decodeParam } from './param-codecs';
import type { CodecContext } from './param-codecs';

export type ParamPairs = [string, string][];

export interface SerialisedStack {
  path: string;
  search: string; // includes leading '?' when non-empty, '' otherwise
}

export interface DeserialisedStack {
  state: StackState;
  paramsByKey: Map<string, ParamPairs>;
}

const PARAM_SEP = '~';
const ENTRY_SEP = '.';
const LENS_PREFIX = 'lens/';
const LENS_BASE = '/lens';

/** Builds the readable path for a stack's active location — "/lens/<name>" for a
 * lens uid, "<basePath>/<uid>" for anything else (cards). */
function pathForActive(activeUid: string, basePath: string): string {
  if (activeUid.startsWith(LENS_PREFIX)) {
    return `${LENS_BASE}/${activeUid.slice(LENS_PREFIX.length)}`;
  }
  return `${basePath}/${activeUid}`;
}

/**
 * Every param a location puts in the URL: a lens's filter set (which lives in
 * its KEY, issue #100 - it is what the location *is*) plus whatever side state
 * the caller holds for it in `paramsByKey` (a card's `tab=bio`, the browse
 * page's `stack=`). Identity first, so the readable query reads filter-first.
 */
function paramsForEntry(entry: LocationEntry, paramsByKey: ReadonlyMap<string, ParamPairs>): ParamPairs {
  const side = paramsByKey.get(entry.key) ?? [];
  const identity = filtersForKey(entry.key);
  return identity.length ? [...identity, ...side] : side;
}

function encodeEntry(entry: LocationEntry, params: ParamPairs | undefined, manifest: ManifestLookup, ctx: CodecContext): string {
  const code = manifest.codeForUid(entry.uid) ?? entry.uid;
  if (!params || params.length === 0) return code;
  let out = code;
  for (const [k, v] of params) out += PARAM_SEP + encodeParam(k, v, ctx);
  return out;
}

function decodeEntryToken(token: string, manifest: ManifestLookup, ctx: CodecContext): { uid: string; params: ParamPairs } {
  const parts = token.split(PARAM_SEP);
  const uid = manifest.uidForCode(parts[0]) ?? parts[0];
  const params: ParamPairs = [];
  for (const paramTok of parts.slice(1)) {
    const pair = decodeParam(paramTok, ctx);
    if (pair) params.push(pair);
  }
  return { uid, params };
}

/**
 * Builds a location entry from a decoded uid + its params, splitting them the
 * way serialisation joined them: a lens's filter params become part of its key
 * (issue #100), everything else is returned as side state for `paramsByKey`.
 *
 * `taken` is the set of slots already allocated in this decode, so a URL
 * holding two differently-filtered views of one lens gets two distinct
 * handles rather than colliding on `lens/<name>`.
 */
function entryFrom(uid: string, params: ParamPairs, taken: LocationEntry[]): { entry: LocationEntry; side: ParamPairs } {
  const { identity, other } = splitLocationParams(uid, params);
  if (!isLensUid(uid)) return { entry: withFreeSlot(taken, cardEntry(uid)), side: other };
  const name = lensNameForKey(uid)!;
  const slot = allocateSlot(taken, uid);
  return { entry: lensEntry(name, identity, slot), side: other };
}

function decodeSide(
  value: string | null,
  manifest: ManifestLookup,
  ctx: CodecContext,
  taken: LocationEntry[],
  paramsByKey: Map<string, ParamPairs>,
): LocationEntry[] {
  if (!value) return [];
  const out: LocationEntry[] = [];
  for (const tok of value.split(ENTRY_SEP).filter(Boolean)) {
    const { uid, params } = decodeEntryToken(tok, manifest, ctx);
    const { entry, side } = entryFrom(uid, params, taken);
    taken.push(entry);
    out.push(entry);
    if (side.length) paramsByKey.set(entry.key, side);
  }
  return out;
}

/**
 * Serialises a stack (entries + activeSlot) plus a per-key params map to a
 * URL path + search string. The active location is human-readable in the
 * path; inactive locations (from/to) are short-coded via the manifest.
 *
 * The active entry is found by SLOT (issue #106) — two entries can legitimately
 * hold the same key (an unfiltered lens you passed through, plus the same lens
 * after you cleared its filters), and a key lookup would resolve to whichever
 * came first and serialise the wrong location into the path. `paramsByKey`
 * stays keyed by key on purpose: two entries with one key are the same
 * location, so they carry the same side params by definition.
 */
export function serialiseStack(
  state: StackState,
  paramsByKey: ReadonlyMap<string, ParamPairs>,
  manifest: ManifestLookup,
  tagManifest: ManifestLookup,
  basePath = '/card'
): SerialisedStack {
  if (state.entries.length === 0) {
    return { path: '/', search: '' };
  }

  const ctx: CodecContext = { tags: tagManifest };

  const activeSlot = state.activeSlot ?? state.entries[state.entries.length - 1].slot;
  let activeIdx = state.entries.findIndex(e => e.slot === activeSlot);
  if (activeIdx === -1) activeIdx = state.entries.length - 1;
  const active = state.entries[activeIdx];

  const before = state.entries.slice(0, activeIdx);
  const after = state.entries.slice(activeIdx + 1);

  const path = pathForActive(active.uid, basePath);

  const encodeSide = (entries: LocationEntry[]) =>
    entries.map(e => encodeEntry(e, paramsForEntry(e, paramsByKey), manifest, ctx)).join(ENTRY_SEP);

  // from/to values are drawn from a URL-safe palette, so we assemble them by
  // hand and keep them literal (no URLSearchParams re-escaping of '~'). The
  // active entry's params, which can hold arbitrary values, still go through
  // URLSearchParams for correct encoding.
  const parts: string[] = [];
  if (before.length) parts.push(`from=${encodeSide(before)}`);
  if (after.length) parts.push(`to=${encodeSide(after)}`);

  const activeParams = new URLSearchParams();
  for (const [k, v] of paramsForEntry(active, paramsByKey)) activeParams.append(k, v);
  const activeStr = activeParams.toString();
  if (activeStr) parts.push(activeStr);

  const search = parts.join('&');
  return { path, search: search ? `?${search}` : '' };
}

/**
 * Reconstructs a stack (entries + activeSlot) plus a per-key params map from
 * a URL path + search string produced by serialiseStack.
 *
 * Repeated keys round-trip: `entryFrom` allocates a fresh slot per decoded
 * entry against the ones already taken, so a URL holding one lens twice comes
 * back as two entries, never deduplicated (issue #106).
 */
export function deserialiseStack(
  pathname: string,
  search: string,
  manifest: ManifestLookup,
  tagManifest: ManifestLookup,
  basePath = '/card'
): DeserialisedStack {
  const cardPrefix = `${basePath}/`;
  const lensPrefix = `${LENS_BASE}/`;

  let activeUid: string;
  if (pathname.startsWith(lensPrefix)) {
    activeUid = `${LENS_PREFIX}${pathname.slice(lensPrefix.length)}`;
  } else if (pathname.startsWith(cardPrefix)) {
    activeUid = pathname.slice(cardPrefix.length);
  } else {
    return { state: { entries: [], activeSlot: null }, paramsByKey: new Map() };
  }

  const ctx: CodecContext = { tags: tagManifest };
  const usp = new URLSearchParams(search);
  const paramsByKey = new Map<string, ParamPairs>();

  // The active location's slot is allocated first, so it keeps the unsuffixed
  // handle: it is the one the SSR fragment on the page already carries.
  const activeRawParams: ParamPairs = [];
  usp.forEach((v, k) => {
    if (k !== 'from' && k !== 'to') activeRawParams.push([k, v]);
  });
  const taken: LocationEntry[] = [];
  const { entry: activeEntry, side: activeSide } = entryFrom(activeUid, activeRawParams, taken);
  taken.push(activeEntry);
  if (activeSide.length) paramsByKey.set(activeEntry.key, activeSide);

  const fromEntries = decodeSide(usp.get('from'), manifest, ctx, taken, paramsByKey);
  const toEntries = decodeSide(usp.get('to'), manifest, ctx, taken, paramsByKey);

  const entries: LocationEntry[] = [...fromEntries, activeEntry, ...toEntries];

  return { state: { entries, activeSlot: activeEntry.slot }, paramsByKey };
}
