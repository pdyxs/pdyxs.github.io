// Laws every registered UrlParamProvider must satisfy (issue #76, DEC-008).
//
// There is one provider today. These run over the list rather than over it by
// name, so the second provider (card-internal params like `tab=bio`) inherits
// the same guarantees the day it is registered.
import { describe, expect, it } from 'vitest';
import { URL_PARAM_PROVIDERS } from './url-param-providers';
import { PARAM_CODECS, encodeParam, decodeParam } from './param-codecs';

const ctx = {
  tags: { codeForUid: () => undefined, uidForCode: () => undefined },
};

describe('URL param providers', () => {
  it('provider ids are unique', () => {
    const ids = URL_PARAM_PROVIDERS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('codec sigils are unique across every provider plus the raw fallback', () => {
    // A collision would route decode to the wrong codec and silently corrupt
    // shared links, so param-codecs also throws at module load.
    const sigils = PARAM_CODECS.map(c => c.sigil);
    expect(new Set(sigils).size).toBe(sigils.length);
  });

  it('the raw fallback is last, so it can never pre-empt a real codec', () => {
    expect(PARAM_CODECS.at(-1)?.sigil).toBe('q');
  });

  it('every provider declares a non-empty paramKeys', () => {
    for (const provider of URL_PARAM_PROVIDERS) {
      expect(provider.paramKeys.length).toBeGreaterThan(0);
    }
  });

  it('params a provider does not claim still survive the codec', () => {
    // The guarantee that lets a provider skip codecs entirely.
    const claimed = new Set(URL_PARAM_PROVIDERS.flatMap(p => [...p.paramKeys]));
    const unclaimed: [string, string][] = [['tab', 'bio'], ['x', 'a b&c=d/e:f']];
    for (const [key, value] of unclaimed) {
      expect(claimed.has(key)).toBe(false);
      const token = encodeParam(key, value, ctx);
      expect(token).toMatch(/^[A-Za-z0-9-_]+$/);
      expect(decodeParam(token, ctx)).toEqual([key, value]);
    }
  });

  it('a provider round-trips its own state through its own params', () => {
    for (const provider of URL_PARAM_PROVIDERS) {
      const empty = provider.fromParams(new URLSearchParams());
      expect(provider.toParams(empty)).toEqual([]);
    }
  });
});
