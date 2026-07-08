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

function decodeSide(value: string | null, manifest: ManifestLookup, ctx: CodecContext): LocationEntry[] {
  if (!value) return [];
  return value.split(ENTRY_SEP).filter(Boolean).map(tok => {
    const { uid } = decodeEntryToken(tok, manifest, ctx);
    return { key: uid, uid };
  });
}

function decodeSideParams(value: string | null, manifest: ManifestLookup, ctx: CodecContext, paramsByKey: Map<string, ParamPairs>): void {
  if (!value) return;
  for (const tok of value.split(ENTRY_SEP).filter(Boolean)) {
    const { uid, params } = decodeEntryToken(tok, manifest, ctx);
    if (params.length) paramsByKey.set(uid, params);
  }
}

/**
 * Serialises a stack (entries + activeKey) plus a per-key params map to a
 * URL path + search string. The active location is human-readable in the
 * path; inactive locations (from/to) are short-coded via the manifest.
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

  const activeKey = state.activeKey ?? state.entries[state.entries.length - 1].key;
  let activeIdx = state.entries.findIndex(e => e.key === activeKey);
  if (activeIdx === -1) activeIdx = state.entries.length - 1;
  const active = state.entries[activeIdx];

  const before = state.entries.slice(0, activeIdx);
  const after = state.entries.slice(activeIdx + 1);

  const path = pathForActive(active.uid, basePath);

  const encodeSide = (entries: LocationEntry[]) =>
    entries.map(e => encodeEntry(e, paramsByKey.get(e.key), manifest, ctx)).join(ENTRY_SEP);

  // from/to values are drawn from a URL-safe palette, so we assemble them by
  // hand and keep them literal (no URLSearchParams re-escaping of '~'). The
  // active entry's params, which can hold arbitrary values, still go through
  // URLSearchParams for correct encoding.
  const parts: string[] = [];
  if (before.length) parts.push(`from=${encodeSide(before)}`);
  if (after.length) parts.push(`to=${encodeSide(after)}`);

  const activeParams = new URLSearchParams();
  for (const [k, v] of paramsByKey.get(active.key) ?? []) activeParams.append(k, v);
  const activeStr = activeParams.toString();
  if (activeStr) parts.push(activeStr);

  const search = parts.join('&');
  return { path, search: search ? `?${search}` : '' };
}

/**
 * Reconstructs a stack (entries + activeKey) plus a per-key params map from
 * a URL path + search string produced by serialiseStack.
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
    return { state: { entries: [], activeKey: null }, paramsByKey: new Map() };
  }

  const ctx: CodecContext = { tags: tagManifest };
  const usp = new URLSearchParams(search);
  const paramsByKey = new Map<string, ParamPairs>();

  const fromEntries = decodeSide(usp.get('from'), manifest, ctx);
  decodeSideParams(usp.get('from'), manifest, ctx, paramsByKey);
  const toEntries = decodeSide(usp.get('to'), manifest, ctx);
  decodeSideParams(usp.get('to'), manifest, ctx, paramsByKey);

  const activeParams: ParamPairs = [];
  usp.forEach((v, k) => {
    if (k !== 'from' && k !== 'to') activeParams.push([k, v]);
  });
  if (activeParams.length) paramsByKey.set(activeUid, activeParams);

  const entries: LocationEntry[] = [...fromEntries, { key: activeUid, uid: activeUid }, ...toEntries];

  return { state: { entries, activeKey: activeUid }, paramsByKey };
}
