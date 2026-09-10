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
  /**
   * The location's display title, refreshed on every generation.
   *
   * NOT append-only, unlike `code` — a retitled card must say its new title,
   * and nothing is addressed by this field. It exists so a cold-loaded stack
   * can paint a legible breadcrumb before any fragment arrives (issue #101):
   * the manifest already ships to the client for short-code decoding, so the
   * browser knows every entry's uid before it knows anything else about it,
   * and a title is the one fact that turns a blank skeleton into a stack you
   * can read.
   *
   * Absent rather than empty when the location has no title — `resolveCardTitle`
   * returns '' for a card with no frontmatter title, and an empty string is
   * worth neither the bytes nor a placeholder header rendering nothing.
   */
  title?: string;
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

/**
 * Returns `manifest` with every entry's `title` replaced by what `titles` says
 * now, dropping the field where it says nothing.
 *
 * Deliberately separate from `assignCodes`. That function's whole contract is
 * "never reassign", and titles are the opposite: they are refreshed wholesale
 * on every run. Folding the two together would put an append-only rule and a
 * replace-wholesale rule in one place and invite the wrong one being applied.
 *
 * Entries keep their order and their codes; only the title moves.
 */
export function withTitles(
  manifest: Manifest,
  titles: ReadonlyMap<string, string>,
): Manifest {
  return manifest.map(entry => {
    const title = titles.get(entry.uid);
    return title ? { uid: entry.uid, code: entry.code, title } : { uid: entry.uid, code: entry.code };
  });
}

export interface ManifestLookup {
  codeForUid(uid: string): string | undefined;
  uidForCode(code: string): string | undefined;
  /** The location's display title, or undefined when it declares none. */
  titleForUid(uid: string): string | undefined;
}

export function buildLookup(manifest: Manifest): ManifestLookup {
  const codeForUid = new Map(manifest.map(e => [e.uid, e.code]));
  const uidForCode = new Map(manifest.map(e => [e.code, e.uid]));
  const titleForUid = new Map(
    manifest.flatMap(e => (e.title ? [[e.uid, e.title] as const] : [])),
  );
  return {
    codeForUid: uid => codeForUid.get(uid),
    uidForCode: code => uidForCode.get(code),
    titleForUid: uid => titleForUid.get(uid),
  };
}
