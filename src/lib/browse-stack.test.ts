import { describe, it, expect } from 'vitest';
import {
  appendStackToUrl,
  stackFromParams,
  buildCardUrl,
} from './browse-stack';

describe('appendStackToUrl', () => {
  it('appends stack param to a bare filter URL', () => {
    const url = appendStackToUrl(['card-a', 'card-b'], '/?filter.what=what%3Apuzzles');
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.get('stack')).toBe('card-a,card-b');
  });

  it('returns URL unchanged when stack is empty', () => {
    const filterUrl = '/?filter.what=what%3Apuzzles';
    expect(appendStackToUrl([], filterUrl)).toBe(filterUrl);
  });

  it('handles URLs with no existing query params', () => {
    const url = appendStackToUrl(['card-x'], '/');
    expect(url).toContain('stack=card-x');
  });

  it('single UID — no trailing comma', () => {
    const url = appendStackToUrl(['solo'], '/?filter.why=why%3Acreative');
    const parsed = new URL(url, 'http://x');
    expect(parsed.searchParams.get('stack')).toBe('solo');
  });
});

describe('stackFromParams', () => {
  it('returns empty array when stack param is absent', () => {
    const params = new URLSearchParams('filter.what=what%3Apuzzles');
    expect(stackFromParams(params)).toEqual([]);
  });

  it('decodes a single UID', () => {
    const params = new URLSearchParams('stack=card-a');
    expect(stackFromParams(params)).toEqual(['card-a']);
  });

  it('decodes multiple UIDs in order', () => {
    const params = new URLSearchParams('stack=card-a,card-b,card-c');
    expect(stackFromParams(params)).toEqual(['card-a', 'card-b', 'card-c']);
  });

  it('round-trips through appendStackToUrl', () => {
    const uids = ['alpha', 'beta', 'gamma'];
    const url = appendStackToUrl(uids, '/?filter.what=what%3Atest');
    const parsed = new URL(url, 'http://x');
    expect(stackFromParams(parsed.searchParams)).toEqual(uids);
  });
});

describe('buildCardUrl', () => {
  it('builds a plain card URL when active is the only entry', () => {
    const url = buildCardUrl(['card-a'], 0);
    expect(url).toBe('/card/card-a');
  });

  it('puts cards before active into from param', () => {
    const url = buildCardUrl(['card-a', 'card-b', 'card-c'], 2);
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe('/card/card-c');
    expect(parsed.searchParams.get('from')).toBe('card-a,card-b');
    expect(parsed.searchParams.has('to')).toBe(false);
  });

  it('puts cards after active into to param', () => {
    const url = buildCardUrl(['card-a', 'card-b', 'card-c'], 0);
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe('/card/card-a');
    expect(parsed.searchParams.has('from')).toBe(false);
    expect(parsed.searchParams.get('to')).toBe('card-b,card-c');
  });

  it('middle card has both from and to', () => {
    const url = buildCardUrl(['card-a', 'card-b', 'card-c'], 1);
    const parsed = new URL(url, 'http://x');
    expect(parsed.pathname).toBe('/card/card-b');
    expect(parsed.searchParams.get('from')).toBe('card-a');
    expect(parsed.searchParams.get('to')).toBe('card-c');
  });
});
