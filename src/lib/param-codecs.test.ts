import { describe, it, expect } from 'vitest';
import { buildLookup } from './stack-manifest';
import { encodeParam, decodeParam, filterCodec, rawCodec } from './param-codecs';
import type { CodecContext } from './param-codecs';

// A tag manifest mixing dimensioned tags and a future dimensionless tag.
const ctx: CodecContext = {
  tags: buildLookup([
    { uid: 'what:art', code: '0' },
    { uid: 'what:projects/games', code: '1' },
    { uid: 'boardgames', code: '2' }, // dimensionless (no colon)
  ]),
};

describe('filter codec', () => {
  it('encodes a dimensioned filter as its tag code (dimension dropped, no %-escapes)', () => {
    expect(filterCodec.encode('filter.what', 'art', ctx)).toBe('0');
    const token = encodeParam('filter.what', 'art', ctx);
    expect(token).toBe('f0');
    expect(token).not.toMatch(/[%=&]/);
  });

  it('reconstructs the dimensioned key and short value on decode', () => {
    expect(filterCodec.decode('0', ctx)).toEqual(['filter.what', 'art']);
    expect(decodeParam('f0', ctx)).toEqual(['filter.what', 'art']);
  });

  it('round-trips a nested tag value, collapsing the slash into one code', () => {
    const token = encodeParam('filter.what', 'projects/games', ctx);
    expect(token).toBe('f1');
    expect(decodeParam(token, ctx)).toEqual(['filter.what', 'projects/games']);
  });

  it('supports dimensionless filters: key "filter", value is the whole tag', () => {
    const token = encodeParam('filter', 'boardgames', ctx);
    expect(token).toBe('f2');
    expect(decodeParam(token, ctx)).toEqual(['filter', 'boardgames']);
  });

  it('declines (returns null) when the tag is not in the manifest, so it falls back to raw', () => {
    expect(filterCodec.encode('filter.what', 'not-a-known-tag', ctx)).toBeNull();
    expect(filterCodec.encode('filter', 'unknown-loose-tag', ctx)).toBeNull();
  });

  it('declines non-filter keys', () => {
    expect(filterCodec.encode('tab', 'bio', ctx)).toBeNull();
    expect(filterCodec.encode('when.from', '2020-01-01', ctx)).toBeNull();
  });

  it('decode returns null for an unknown code (corrupt/hand-edited link)', () => {
    expect(filterCodec.decode('zzz', ctx)).toBeNull();
  });
});

describe('raw fallback codec', () => {
  it('encodes any key/value as escape-free base64url and round-trips', () => {
    const token = encodeParam('tab', 'bio', ctx);
    expect(token[0]).toBe('q');
    expect(token).not.toMatch(/[%=&+/]/); // no reserved sub-delims, no b64 padding/altchars
    expect(decodeParam(token, ctx)).toEqual(['tab', 'bio']);
  });

  it('round-trips values containing reserved characters (=, &, space, /, :)', () => {
    for (const [k, v] of [
      ['when.from', '2022-01-01T00:00:00.000Z'],
      ['x', 'a b'],
      ['x', 'c&d'],
      ['x', 'k=v'],
      ['x', 'a/b:c'],
    ] as const) {
      const token = encodeParam(k, v, ctx);
      expect(token).not.toMatch(/[%=&+/]/);
      expect(decodeParam(token, ctx)).toEqual([k, v]);
    }
  });

  it('unknown tag filter round-trips through raw (declined by filter codec)', () => {
    const token = encodeParam('filter.what', 'brand-new-tag', ctx);
    expect(token[0]).toBe('q'); // raw sigil, not 'f'
    expect(decodeParam(token, ctx)).toEqual(['filter.what', 'brand-new-tag']);
  });
});

describe('registry dispatch', () => {
  it('decodeParam returns null for an unknown sigil (forward-compat)', () => {
    expect(decodeParam('Zabc', ctx)).toBeNull();
  });

  it('every token body is drawn from the URL-safe palette [A-Za-z0-9-_]', () => {
    for (const [k, v] of [
      ['filter.what', 'art'],
      ['filter', 'boardgames'],
      ['tab', 'bio'],
      ['when.from', '2022-01-01T00:00:00.000Z'],
    ] as const) {
      const token = encodeParam(k, v, ctx);
      expect(token).toMatch(/^[A-Za-z0-9-_]+$/);
    }
  });

  it('exposes distinct single-char sigils', () => {
    expect(filterCodec.sigil).toBe('f');
    expect(rawCodec.sigil).toBe('q');
    expect(filterCodec.sigil).not.toBe(rawCodec.sigil);
  });
});
