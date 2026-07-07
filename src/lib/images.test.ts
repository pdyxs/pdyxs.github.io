import { describe, it, expect } from 'vitest';
import { resolveGalleryImages } from './images';

describe('resolveGalleryImages', () => {
  it('defaults to colocated images excluding the header image', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', 'outside.jpg', []);
    expect(result).toEqual([]);
  });

  it('defaults to colocated images when no header image is set', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', undefined, []);
    expect(result).toHaveLength(1);
    expect(typeof result[0].src).toBe('object');
  });

  it('uses the images[] override when present, resolving bare filenames', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', 'outside.jpg', ['outside.jpg']);
    expect(result).toHaveLength(1);
    expect(typeof result[0].src).toBe('object');
  });

  it('passes remote image URLs from images[] through as-is', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', undefined, ['https://example.com/x.jpg']);
    expect(result).toEqual([{ src: 'https://example.com/x.jpg', kind: 'image' }]);
  });

  it('passes remote video URLs from images[] through with kind video', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', undefined, ['https://example.com/clip.mp4']);
    expect(result).toEqual([{ src: 'https://example.com/clip.mp4', kind: 'video' }]);
  });

  it('drops non-media remote URLs (e.g. YouTube embeds) from images[]', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', 'outside.jpg', [
      'https://www.youtube.com/embed/abc123',
    ]);
    expect(result).toEqual([]);
  });

  it('drops local video filenames with no colocated file', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', 'outside.jpg', ['missing.mp4']);
    expect(result).toEqual([]);
  });

  it('tags default colocated images with kind image', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', undefined, []);
    expect(result.every(m => m.kind === 'image')).toBe(true);
  });

  it('drops images[] entries with no colocated file', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', 'outside.jpg', ['missing.jpg']);
    expect(result).toEqual([]);
  });

  it('returns empty for an entry directory with no images', () => {
    const result = resolveGalleryImages('what/projects/does-not-exist', undefined, []);
    expect(result).toEqual([]);
  });

  it('falls back to the folder default when every images[] entry fails to resolve', () => {
    const result = resolveGalleryImages('what/projects/interactive-theatre/art-heist', undefined, [
      'https://www.youtube.com/embed/abc123',
      'missing.jpg',
    ]);
    expect(result).toHaveLength(1);
    expect(typeof result[0].src).toBe('object');
  });
});
