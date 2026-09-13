import { describe, it, expect } from 'vitest';
import {
  HEADER_MEDIA_RENDERERS,
  GENERIC_RENDERERS,
  COLLECTION_RENDERERS,
  resolveHeaderMedia,
} from '@render/renderers';

describe('resolveHeaderMedia', () => {
  it('returns undefined when no headerMedia is declared', () => {
    expect(resolveHeaderMedia(undefined)).toBeUndefined();
    expect(resolveHeaderMedia('')).toBeUndefined();
  });

  it('maps a registered name to its component', () => {
    expect(resolveHeaderMedia('lino-canvas')).toBe(HEADER_MEDIA_RENDERERS['lino-canvas']);
  });

  // Issue #174: this used to return undefined, which renders the plain <img> —
  // an ordinary-looking card that gives no sign the bespoke header was dropped.
  it('throws for a declared-but-unregistered name', () => {
    expect(() => resolveHeaderMedia('lino-canvs')).toThrow(/not registered/);
  });
});

describe('GENERIC_RENDERERS', () => {
  // The set is a claim that GenericRenderer already expresses these names, so
  // a name appearing in both places would mean the claim is stale.
  it('does not overlap COLLECTION_RENDERERS', () => {
    const overlap = Object.keys(COLLECTION_RENDERERS).filter((k) => GENERIC_RENDERERS.has(k));
    expect(overlap).toEqual([]);
  });
});
