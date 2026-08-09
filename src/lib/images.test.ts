import { describe, it, expect } from 'vitest';
import { resolveGalleryImages } from './images';

describe('resolveGalleryImages', () => {
  it('defaults to colocated media excluding the header image', () => {
    // art-heist holds outside.jpg (the header) and trailer.mp4, so excluding
    // the header leaves the video alone.
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', []);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('video');
  });

  it('defaults to colocated media when no header image is set', () => {
    const result = resolveGalleryImages('what/art/art-heist', undefined, []);
    expect(result.map(m => m.kind)).toEqual(['image', 'video']);
    // Images arrive as imported asset objects, videos as plain URL strings.
    expect(typeof result[0].src).toBe('object');
    expect(typeof result[1].src).toBe('string');
  });

  it('uses the images[] override when present, resolving bare filenames', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', ['outside.jpg']);
    expect(result).toHaveLength(1);
    expect(typeof result[0].src).toBe('object');
  });

  it('passes remote image URLs from images[] through as-is', () => {
    const result = resolveGalleryImages('what/art/art-heist', undefined, ['https://example.com/x.jpg']);
    expect(result).toEqual([{ src: 'https://example.com/x.jpg', kind: 'image' }]);
  });

  it('passes remote video URLs from images[] through with kind video', () => {
    const result = resolveGalleryImages('what/art/art-heist', undefined, ['https://example.com/clip.mp4']);
    expect(result).toEqual([{ src: 'https://example.com/clip.mp4', kind: 'video' }]);
  });

  it('resolves YouTube URLs in images[] to an embed with a poster', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', [
      'https://www.youtube.com/embed/HS1Xem613Rw',
    ]);
    expect(result).toEqual([
      {
        src: 'https://www.youtube-nocookie.com/embed/HS1Xem613Rw',
        kind: 'embed',
        poster: 'https://i.ytimg.com/vi/HS1Xem613Rw/mqdefault.jpg',
      },
    ]);
  });

  it('resolves Vimeo URLs in images[] even with no generated poster', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', [
      'https://player.vimeo.com/video/257695244',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('embed');
    expect(result[0].src).toBe('https://player.vimeo.com/video/257695244');
  });

  // These three pair the bad entry with a resolvable one so the images[]
  // override branch stays active — an override that resolves to nothing falls
  // back to the folder default, which would mask the drop.
  it('still drops remote URLs that are neither media nor a known embed host', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', [
      'https://www.facebook.com/plugins/video.php?href=x',
      'outside.jpg',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('image');
  });

  it('drops local video filenames with no colocated file', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', [
      'missing.mp4',
      'outside.jpg',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('image');
  });

  it('resolves colocated video filenames in images[] to kind video', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', ['trailer.mp4']);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('video');
    expect(typeof result[0].src).toBe('string');
  });

  it('drops images[] entries with no colocated file', () => {
    const result = resolveGalleryImages('what/art/art-heist', 'outside.jpg', [
      'missing.jpg',
      'outside.jpg',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('image');
  });

  it('returns empty for an entry directory with no images', () => {
    const result = resolveGalleryImages('what/projects/does-not-exist', undefined, []);
    expect(result).toEqual([]);
  });

  it('falls back to the folder default when every images[] entry fails to resolve', () => {
    const result = resolveGalleryImages('what/art/art-heist', undefined, [
      'https://www.facebook.com/plugins/video.php?href=x',
      'missing.jpg',
    ]);
    expect(result.map(m => m.kind)).toEqual(['image', 'video']);
  });
});
