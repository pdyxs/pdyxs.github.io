// Stack codec: serialises/deserialises the whole card-navigation stack to
// and from a URL. The active location is readable in the path/params;
// inactive locations (from/to) are encoded as short base62 codes drawn from
// the build-generated manifest (src/lib/stack-manifest.ts), so shared URLs
// stay short and durable across rebuilds.
//
// Arbitrary per-entry params (e.g. tab=bio, repeated keys allowed) ride as
// a compact escape-hatch suffix on that entry's code: "a3~tab=bio".
import type { LocationEntry, StackState } from './stack-layout';
import type { ManifestLookup } from './stack-manifest';

export type ParamPairs = [string, string][];

export interface SerialisedStack {
  path: string;
  search: string; // includes leading '?' when non-empty, '' otherwise
}

export interface DeserialisedStack {
  state: StackState;
  paramsByKey: Map<string, ParamPairs>;
}

const ESCAPE_SEP = '~';

function encodeEntry(entry: LocationEntry, params: ParamPairs | undefined, manifest: ManifestLookup): string {
  const code = manifest.codeForUid(entry.uid) ?? entry.uid;
  if (!params || params.length === 0) return code;
  const usp = new URLSearchParams();
  for (const [k, v] of params) usp.append(k, v);
  return `${code}${ESCAPE_SEP}${usp.toString()}`;
}

function decodeEntryToken(token: string, manifest: ManifestLookup): { uid: string; params: ParamPairs } {
  const sepIdx = token.indexOf(ESCAPE_SEP);
  const codePart = sepIdx === -1 ? token : token.slice(0, sepIdx);
  const uid = manifest.uidForCode(codePart) ?? codePart;
  const params: ParamPairs = [];
  if (sepIdx !== -1) {
    new URLSearchParams(token.slice(sepIdx + 1)).forEach((v, k) => params.push([k, v]));
  }
  return { uid, params };
}

function decodeSide(value: string | null, manifest: ManifestLookup): LocationEntry[] {
  if (!value) return [];
  return value.split(',').filter(Boolean).map(tok => {
    const { uid } = decodeEntryToken(tok, manifest);
    return { key: uid, uid };
  });
}

function decodeSideParams(value: string | null, manifest: ManifestLookup, paramsByKey: Map<string, ParamPairs>): void {
  if (!value) return;
  for (const tok of value.split(',').filter(Boolean)) {
    const { uid, params } = decodeEntryToken(tok, manifest);
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
  basePath = '/card'
): SerialisedStack {
  if (state.entries.length === 0) {
    return { path: '/', search: '' };
  }

  const activeKey = state.activeKey ?? state.entries[state.entries.length - 1].key;
  let activeIdx = state.entries.findIndex(e => e.key === activeKey);
  if (activeIdx === -1) activeIdx = state.entries.length - 1;
  const active = state.entries[activeIdx];

  const before = state.entries.slice(0, activeIdx);
  const after = state.entries.slice(activeIdx + 1);

  const path = `${basePath}/${active.uid}`;
  const usp = new URLSearchParams();

  const encodeSide = (entries: LocationEntry[]) =>
    entries.map(e => encodeEntry(e, paramsByKey.get(e.key), manifest)).join(',');

  if (before.length) usp.set('from', encodeSide(before));
  if (after.length) usp.set('to', encodeSide(after));

  for (const [k, v] of paramsByKey.get(active.key) ?? []) {
    usp.append(k, v);
  }

  const search = usp.toString();
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
  basePath = '/card'
): DeserialisedStack {
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) {
    return { state: { entries: [], activeKey: null }, paramsByKey: new Map() };
  }

  const activeUid = pathname.slice(prefix.length);
  const usp = new URLSearchParams(search);
  const paramsByKey = new Map<string, ParamPairs>();

  const fromEntries = decodeSide(usp.get('from'), manifest);
  decodeSideParams(usp.get('from'), manifest, paramsByKey);
  const toEntries = decodeSide(usp.get('to'), manifest);
  decodeSideParams(usp.get('to'), manifest, paramsByKey);

  const activeParams: ParamPairs = [];
  usp.forEach((v, k) => {
    if (k !== 'from' && k !== 'to') activeParams.push([k, v]);
  });
  if (activeParams.length) paramsByKey.set(activeUid, activeParams);

  const entries: LocationEntry[] = [...fromEntries, { key: activeUid, uid: activeUid }, ...toEntries];

  return { state: { entries, activeKey: activeUid }, paramsByKey };
}
