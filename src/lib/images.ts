import type { ImageMetadata } from 'astro';

const localImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/**/*.{jpg,jpeg,png,gif,webp,avif}',
  { eager: true }
);

// Videos can't go through astro:assets (getImage is image-only), so they're
// resolved to a plain URL string and rendered as <video>. See resolveLocalVideo
// and the `kind` discriminator on GalleryImageSource.
const localVideos = import.meta.glob<string>(
  '/src/content/**/*.{mp4,webm,mov}',
  { query: '?url', import: 'default', eager: true }
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

/**
 * Resolves a bare video filename the same way as resolveLocalImage, returning
 * the video's URL string (videos aren't run through astro:assets). Returns
 * undefined for remote URLs or filenames with no colocated file.
 */
export function resolveLocalVideo(entryId: string, filename: string | undefined): string | undefined {
  if (!filename || filename.startsWith('http')) return undefined;
  const path = `/src/content/${entryId}/${filename}`;
  return localVideos[path];
}

/**
 * Every colocated asset filename in a card's own directory, relative to that
 * directory (e.g. "hero.png", "shots/wide.jpg"). Images and videos both count —
 * a body reference resolves against whatever is actually sitting next to the
 * card. Used by the dev-only audit lens to decide whether a local image
 * reference resolves (see auditCards in src/lib/audit.ts).
 */
export function localAssetFilenames(entryId: string): string[] {
  const prefix = `/src/content/${entryId}/`;
  return [...Object.keys(localImages), ...Object.keys(localVideos)]
    .filter(path => path.startsWith(prefix))
    .map(path => path.slice(prefix.length))
    .sort();
}

export type MediaKind = 'image' | 'video';

export interface GalleryImageSource {
  /** ImageMetadata for local images; a URL string for remote images and all videos. */
  src: ImageMetadata | string;
  kind: MediaKind;
}

const IMAGE_URL_PATTERN = /\.(jpe?g|png|gif|webp|avif)$/i;
const VIDEO_URL_PATTERN = /\.(mp4|webm|mov)$/i;
const REMOTE_IMAGE_URL = /^https?:\/\/.*\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i;

/**
 * Whether a remote URL is safe to use as an image source (thumbnail, og:image).
 * The extension check matters because the legacy `images[]` field carries video
 * and embed URLs too — using one as an image yields a broken reference.
 */
export function isRemoteImageUrl(url: string): boolean {
  return REMOTE_IMAGE_URL.test(url);
}

/**
 * Resolves the set of media to show in a card's gallery.
 *
 * If `images` (from frontmatter) is non-empty and at least one entry resolves,
 * each entry is resolved the same way as the `image:` field (bare filename →
 * colocated asset, full URL → used as-is), dropping any that don't resolve.
 * Image filenames/URLs resolve to `kind: 'image'`; video filenames/URLs (mp4,
 * webm, mov) resolve to `kind: 'video'`. Remote URLs without a known media
 * extension (e.g. YouTube/Vimeo/Facebook embed links left over from the Jekyll
 * migration) are dropped rather than rendered as a broken `<img>`.
 *
 * Otherwise (no `images` override, or every entry in it fails to resolve),
 * defaults to every colocated image and video in the entry's own directory,
 * excluding the entry's header image.
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
          if (IMAGE_URL_PATTERN.test(filename)) return { src: filename, kind: 'image' };
          if (VIDEO_URL_PATTERN.test(filename)) return { src: filename, kind: 'video' };
          return undefined;
        }
        const localImg = resolveLocalImage(entryId, filename);
        if (localImg) return { src: localImg, kind: 'image' };
        const localVid = resolveLocalVideo(entryId, filename);
        if (localVid) return { src: localVid, kind: 'video' };
        return undefined;
      })
      .filter((m): m is GalleryImageSource => m !== undefined);

    if (resolved.length > 0) return resolved;
  }

  const prefix = `/src/content/${entryId}/`;
  const headerPath = headerImage && !headerImage.startsWith('http')
    ? `${prefix}${headerImage}`
    : undefined;

  const imageEntries = Object.keys(localImages)
    .filter(path => path.startsWith(prefix) && path !== headerPath)
    .map(path => ({ path, item: { src: localImages[path].default, kind: 'image' as const } }));
  const videoEntries = Object.keys(localVideos)
    .filter(path => path.startsWith(prefix) && path !== headerPath)
    .map(path => ({ path, item: { src: localVideos[path], kind: 'video' as const } }));

  return [...imageEntries, ...videoEntries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(e => e.item);
}
