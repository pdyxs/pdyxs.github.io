import { describe, it, expect } from 'vitest';
import { parseEmbedUrl, embedPosterUrl, autoplayEmbedUrl } from './embeds.ts';

describe('parseEmbedUrl', () => {
  it('parses every YouTube shape the migrated content carries', () => {
    // /embed/ is what images[] and the old raw iframes used.
    expect(parseEmbedUrl('https://www.youtube.com/embed/u0nnn_4ZKGs')).toEqual({
      provider: 'youtube',
      id: 'u0nnn_4ZKGs',
      embedUrl: 'https://www.youtube-nocookie.com/embed/u0nnn_4ZKGs',
    });
    expect(parseEmbedUrl('https://www.youtube.com/watch?v=oP3c1h8v2ZQ')?.id).toBe('oP3c1h8v2ZQ');
    expect(parseEmbedUrl('http://www.youtube.com/watch?v=oP3c1h8v2ZQ')?.id).toBe('oP3c1h8v2ZQ');
    expect(parseEmbedUrl('https://youtu.be/BZxVzL2ssms')?.id).toBe('BZxVzL2ssms');
    expect(parseEmbedUrl('https://m.youtube.com/watch?v=BZxVzL2ssms')?.id).toBe('BZxVzL2ssms');
    expect(parseEmbedUrl('https://www.youtube.com/shorts/BZxVzL2ssms')?.id).toBe('BZxVzL2ssms');
  });

  it('keeps the id and drops other query params', () => {
    const embed = parseEmbedUrl('https://www.youtube.com/watch?v=oP3c1h8v2ZQ&t=42&rel=0');
    expect(embed?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/oP3c1h8v2ZQ');
  });

  it('parses both Vimeo shapes', () => {
    expect(parseEmbedUrl('https://vimeo.com/257695244')).toEqual({
      provider: 'vimeo',
      id: '257695244',
      embedUrl: 'https://player.vimeo.com/video/257695244',
    });
    expect(parseEmbedUrl('https://player.vimeo.com/video/257695244')?.id).toBe('257695244');
  });

  it('rejects ids that are not the provider shape', () => {
    // A YouTube id is exactly 11 URL-safe-base64 chars; a Vimeo id is numeric.
    expect(parseEmbedUrl('https://www.youtube.com/embed/tooshort')).toBeUndefined();
    expect(parseEmbedUrl('https://www.youtube.com/watch?v=way-too-long-for-an-id')).toBeUndefined();
    expect(parseEmbedUrl('https://vimeo.com/channels/staffpicks')).toBeUndefined();
  });

  it('rejects non-video hosts and non-video YouTube pages', () => {
    expect(parseEmbedUrl('https://example.com/embed/u0nnn_4ZKGs')).toBeUndefined();
    expect(parseEmbedUrl('https://www.youtube.com/user/pdyxs')).toBeUndefined();
    expect(parseEmbedUrl('https://example.com/clip.mp4')).toBeUndefined();
  });

  it('is safe on empty, relative and malformed input', () => {
    expect(parseEmbedUrl(undefined)).toBeUndefined();
    expect(parseEmbedUrl('')).toBeUndefined();
    expect(parseEmbedUrl('not a url')).toBeUndefined();
    expect(parseEmbedUrl('./local.jpg')).toBeUndefined();
    // The in-stack protocols must never be mistaken for an embed.
    expect(parseEmbedUrl('card:what/games/digital/numbeanies')).toBeUndefined();
  });
});

describe('embedPosterUrl', () => {
  const youtube = parseEmbedUrl('https://youtu.be/BZxVzL2ssms')!;
  const vimeo = parseEmbedUrl('https://vimeo.com/257695244')!;

  it('derives a YouTube poster from the id', () => {
    // mqdefault, not hqdefault: hqdefault letterboxes into 4:3.
    expect(embedPosterUrl(youtube)).toBe('https://i.ytimg.com/vi/BZxVzL2ssms/mqdefault.jpg');
  });

  it('reads a Vimeo poster from the generated map', () => {
    expect(embedPosterUrl(vimeo, { '257695244': 'https://i.vimeocdn.com/video/x.jpg' })).toBe(
      'https://i.vimeocdn.com/video/x.jpg',
    );
  });

  it('returns undefined for a Vimeo id with no generated poster', () => {
    // The gallery falls back to a labelled tile rather than a broken image.
    expect(embedPosterUrl(vimeo, {})).toBeUndefined();
  });
});

describe('autoplayEmbedUrl', () => {
  it('appends autoplay with the right separator', () => {
    expect(autoplayEmbedUrl('https://player.vimeo.com/video/1')).toBe(
      'https://player.vimeo.com/video/1?autoplay=1',
    );
    expect(autoplayEmbedUrl('https://example.com/e?a=b')).toBe('https://example.com/e?a=b&autoplay=1');
  });
});
