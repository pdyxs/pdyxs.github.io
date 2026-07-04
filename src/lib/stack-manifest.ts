// Append-only short-code manifest.
//
// Maps card uids ("collection/id") to short base62 codes. Existing uids keep
// their code forever — the manifest only ever grows. New uids are assigned
// the shortest code not already in use. This is what lets a short-coded URL
// (e.g. from a shared link) keep resolving correctly across rebuilds, even
// as new content is added.

import { encodeBase62 } from './short-code.ts';

export interface ManifestEntry {
  uid: string;
  code: string;
}

export type Manifest = ManifestEntry[];

/**
 * Returns a new manifest containing every entry in `existing` unchanged,
 * plus a freshly-assigned entry for each uid in `uids` that isn't already
 * present. Never reassigns or reorders an existing uid's code.
 */
export function assignCodes(existing: Manifest, uids: readonly string[]): Manifest {
  const knownUids = new Set(existing.map(e => e.uid));
  const usedCodes = new Set(existing.map(e => e.code));
  const result: Manifest = [...existing];

  let nextIndex = 0;
  for (const uid of uids) {
    if (knownUids.has(uid)) continue;

    let code = encodeBase62(nextIndex);
    while (usedCodes.has(code)) {
      nextIndex++;
      code = encodeBase62(nextIndex);
    }

    result.push({ uid, code });
    knownUids.add(uid);
    usedCodes.add(code);
    nextIndex++;
  }

  return result;
}

export interface ManifestLookup {
  codeForUid(uid: string): string | undefined;
  uidForCode(code: string): string | undefined;
}

export function buildLookup(manifest: Manifest): ManifestLookup {
  const codeForUid = new Map(manifest.map(e => [e.uid, e.code]));
  const uidForCode = new Map(manifest.map(e => [e.code, e.uid]));
  return {
    codeForUid: uid => codeForUid.get(uid),
    uidForCode: code => uidForCode.get(code),
  };
}
