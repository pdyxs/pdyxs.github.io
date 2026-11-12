// Version history. Pure: the commits that touched a card's index.json (newest
// first, with the file text as of each) in, one entry per version out.

import { parseEnvelope } from './envelope.ts';

export interface Snapshot {
  commit: string;
  date: string;
  /** index.json as of `commit`. */
  text: string;
}

export interface VersionEntry {
  version: string;
  commit: string;
  date: string;
}

export function versionHistory(snapshots: readonly Snapshot[]): VersionEntry[] {
  const seen = new Set<string>();
  const out: VersionEntry[] = [];
  for (const { commit, date, text } of snapshots) {
    const parsed = parseEnvelope(text);
    const version = parsed.ok ? (parsed.envelope as { version?: unknown } | null)?.version : undefined;
    if (typeof version !== 'string' || seen.has(version)) continue;
    seen.add(version);
    out.push({ version, commit, date });
  }
  return out;
}
