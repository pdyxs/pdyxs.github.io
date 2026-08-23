import { describe, it, expect } from 'vitest';
import { manifestLookup } from './stack-manifest-client';
import { allLensUids } from './lens-registry';
import manifestData from '../data/stack-manifest.json';

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
    const titled = manifestData.filter((e: { title?: string }) => e.title).length;
    expect(titled).toBeGreaterThan(manifestData.length * 0.9);
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
