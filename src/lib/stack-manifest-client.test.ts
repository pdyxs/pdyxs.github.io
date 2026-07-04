import { describe, it, expect } from 'vitest';
import { manifestLookup } from './stack-manifest-client';

describe('manifestLookup (shipped manifest)', () => {
  it('cold_deep_link_decode: a code from the shipped manifest resolves back to its uid', () => {
    // Every manifest build assigns "0" to the first-enumerated uid, so this
    // is stable across regenerations even though *which* uid it is may change.
    const uid = manifestLookup.uidForCode('0');
    expect(uid).toBeTruthy();
    expect(manifestLookup.codeForUid(uid!)).toBe('0');
  });

  it('unknown_code_returns_undefined', () => {
    expect(manifestLookup.uidForCode('does-not-exist-code')).toBeUndefined();
  });
});
