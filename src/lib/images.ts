import type { ImageMetadata } from 'astro:assets';

const localImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/**/*.{jpg,jpeg,png,gif,webp,avif}',
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

export interface GalleryImageSource {
  src: ImageMetadata | string;
}

const IMAGE_URL_PATTERN = /\.(jpe?g|png|gif|webp|avif)$/i;

/**
 * Resolves the set of images to show in a card's gallery.
 *
 * If `images` (from frontmatter) is non-empty and at least one entry resolves,
 * each entry is resolved the same way as the `image:` field (bare filename →
 * colocated asset, full URL → used as-is), dropping any that don't resolve to
 * a real image. Remote URLs without an image file extension (e.g.
 * YouTube/Vimeo/Facebook embed links left over from the Jekyll migration) are
 * dropped rather than rendered as a broken `<img>`.
 *
 * Otherwise (no `images` override, or every entry in it fails to resolve),
 * defaults to every colocated image in the entry's own directory, excluding
 * the entry's header image.
 */
export function resolveGalleryImages(
  entryId: string,
  headerImage: string | undefined,
  images: string[] | undefined,
): GalleryImageSource[] {
  if (images && images.length > 0) {
    const resolved = images
      .map((filename): GalleryImageSource | undefined => {
        if (filename.startsWith('http')) {
          return IMAGE_URL_PATTERN.test(filename) ? { src: filename } : undefined;
        }
        const local = resolveLocalImage(entryId, filename);
        return local ? { src: local } : undefined;
      })
      .filter((img): img is GalleryImageSource => img !== undefined);

    if (resolved.length > 0) return resolved;
  }

  const prefix = `/src/content/${entryId}/`;
  const headerPath = headerImage && !headerImage.startsWith('http')
    ? `${prefix}${headerImage}`
    : undefined;

  return Object.keys(localImages)
    .filter(path => path.startsWith(prefix) && path !== headerPath)
    .sort()
    .map(path => ({ src: localImages[path].default }));
}
