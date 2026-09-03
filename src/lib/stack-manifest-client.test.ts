import { describe, it, expect } from 'vitest';
import { manifestLookup } from './stack-manifest-client';
import { allLensUids } from './lens-registry';
import manifestData from '../data/stack-manifest.json';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_ROOT } from './content-root';

/**
 * Whether a manifest uid still names something the site renders: a lens (which
 * has no file behind it), or a content path that is still on disk. See the
 * ratio assertion below for why the distinction matters.
 */
function isLiveUid(uid: string): boolean {
  if (uid.startsWith('lens/') || !uid.includes('/')) return true;
  const path = join(CONTENT_ROOT, uid);
  return existsSync(join(path, 'index.md')) || existsSync(`${path}.md`);
}

describe('manifestLookup (shipped manifest)', () => {
  it('cold_deep_link_decode: a code from the shipped manifest resolves back to its uid', () => {
    // Every manifest build assigns "0" to the first-enumerated uid, so this
    // is stable across regenerations even though *which* uid it is may change.
    const uid = manifestLookup.uidForCode('0');
    expect(uid).toBeTruthy();
    expect(manifestLookup.codeForUid(uid!)).toBe('0');
  });

  it('the shipped manifest carries titles, which is what the cold-load skeleton paints', () => {
    // #101: a `from`/`to` entry has no fragment yet, so its spine title comes
    // from here. Every lens must have one — a lens's label is always declared.
    for (const uid of allLensUids()) {
      expect(manifestLookup.titleForUid(uid), `expected a title for ${uid}`).toBeTruthy();
    }
    // The ratio is measured over the LIVE entries only. Codes are append-only
    // (see stack-manifest.ts) precisely so a shared short-coded URL keeps
    // resolving, so the manifest necessarily accumulates an entry for every uid
    // that has ever existed — and a relocated card leaves its old uid behind
    // forever. `withTitles` refreshes titles wholesale from the current tree,
    // so those stranded entries have none, by design. Counting them would make
    // this guard fail on the next content move rather than on a real
    // title-resolution regression, which is the only thing it is here to catch.
    const live = manifestData.filter((e: { uid: string }) => isLiveUid(e.uid));
    const titled = live.filter((e: { title?: string }) => e.title).length;
    expect(titled).toBeGreaterThan(live.length * 0.9);
  });

  it('unknown_code_returns_undefined', () => {
    expect(manifestLookup.uidForCode('does-not-exist-code')).toBeUndefined();
  });

  it('every registry lens has a manifest code (manifest enumeration is registry-driven)', () => {
    for (const uid of allLensUids()) {
      const code = manifestLookup.codeForUid(uid);
      expect(code, `expected a manifest code for ${uid}`).toBeTruthy();
      expect(manifestLookup.uidForCode(code!)).toBe(uid);
    }
  });
});
