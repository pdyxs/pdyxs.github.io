import { describe, it, expect } from 'vitest';
import { parseUidEntry, serializeUidEntry } from './card-url-params';

describe('parseUidEntry', () => {
  it('parseUidEntry_plain', () => {
    expect(parseUidEntry('posts')).toEqual({ uid: 'posts', params: {} });
  });

  it('parseUidEntry_with_tag', () => {
    expect(parseUidEntry('posts:tag=games')).toEqual({ uid: 'posts', params: { tag: 'games' } });
  });
});

describe('serializeUidEntry', () => {
  it('serializeUidEntry_plain', () => {
    expect(serializeUidEntry('posts', {})).toBe('posts');
  });

  it('serializeUidEntry_with_tag', () => {
    expect(serializeUidEntry('posts', { tag: 'games' })).toBe('posts:tag=games');
  });
});
