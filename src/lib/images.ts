import type { ImageMetadata } from 'astro:assets';

const localImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/**/*.{jpg,jpeg,png,gif}',
  { eager: true }
);

/**
 * Resolves a bare filename from an `image:` frontmatter field against the
 * colocated directory for that content entry (src/content/<entryId>/<filename>).
 * Returns undefined for remote URLs or filenames with no colocated file.
 */
export function resolveLocalImage(entryId: string, filename: string | undefined): ImageMetadata | undefined {
  if (!filename || filename.startsWith('http')) return undefined;
  const path = `/src/content/${entryId}/${filename}`;
  return localImages[path]?.default;
}
