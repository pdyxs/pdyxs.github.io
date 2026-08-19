import type { ImageMetadata } from 'astro';
import { parseEmbedUrl, embedPosterUrl } from './embeds.ts';
import { isVaultInfrastructurePath } from './content-glob.ts';

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
    .filter(isCardOwnAsset)
    .sort();
}

/**
 * Every colocated *image* in a card's own directory, filename-sorted, as
 * astro:assets `ImageMetadata` (so intrinsic width/height are available before
 * any `getImage` call). Videos and `_original/` sidecars are excluded, on the
 * same rule as localAssetFilenames.
 *
 * This is the raw sweep, with none of resolveGalleryImages' editorial rules
 * applied — no header-image promotion, no skipping of files the body already
 * links. A custom header-media island (see HEADER_MEDIA_RENDERERS in
 * renderers.ts) lays its own images out and needs the unfiltered set.
 */
export function cardLocalImages(entryId: string): { filename: string; image: ImageMetadata }[] {
  const prefix = `/src/content/${entryId}/`;
  return Object.keys(localImages)
    .filter(path => path.startsWith(prefix))
    .map(path => ({ filename: path.slice(prefix.length), image: localImages[path]!.default }))
    .filter(({ filename }) => isCardOwnAsset(filename))
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * Whether a path *below* a card's directory is one of the card's own assets.
 *
 * `startsWith(prefix)` alone also matches infrastructure the card carries but
 * does not display — `_original/<file>`, the unpadded source kept by
 * `npm run pad:images` (see src/lib/image-padding.ts). Left in, the gallery
 * sweep below would show every padded image twice: once padded, once not.
 * Reuses the vault-infrastructure rule rather than naming `_original/`, so any
 * future `_`-prefixed sidecar is excluded by construction.
 */
function isCardOwnAsset(pathWithinCard: string): boolean {
  return !isVaultInfrastructurePath(pathWithinCard);
}

export type MediaKind = 'image' | 'video' | 'embed';

export interface GalleryImageSource {
  /**
   * ImageMetadata for local images; a URL string for remote images and all
   * videos. For `kind: 'embed'` it is the provider's iframe URL.
   */
  src: ImageMetadata | string;
  kind: MediaKind;
  /**
   * Embeds only: the still frame to show before playback. Undefined when the
   * provider has no resolvable poster (see embedPosterUrl), in which case the
   * gallery renders a labelled tile.
   */
  poster?: string;
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
 * webm, mov) resolve to `kind: 'video'`. YouTube and Vimeo URLs — which the
 * Jekyll migration left scattered through `images[]` — resolve to
 * `kind: 'embed'`, carrying the iframe URL and a poster. Any other remote URL
 * without a known media extension is dropped rather than rendered as a broken
 * `<img>`.
 *
 * Otherwise (no `images` override, or every entry in it fails to resolve),
 * defaults to every colocated image and video in the entry's own directory —
 * minus any the body already renders inline. A card whose prose walks through
 * a worked example image by image (see the puzzle "Plans of a Medic") would
 * otherwise show every one of those images a second time as a gallery strip.
 * An explicit `images[]` is never filtered this way: naming a file there is a
 * deliberate request to gallery it.
 *
 * The header image leads the gallery in both branches — it's the card's own
 * media and belongs in the lightbox set — and is only prepended when the
 * resolved list doesn't already carry it, so an `images[]` that names the
 * header doesn't show it twice.
 */
export function resolveGalleryImages(
  entryId: string,
  headerImage: string | undefined,
  images: string[] | undefined,
  /** The card's raw markdown body, used to spot images it already renders inline. */
  body?: string,
): GalleryImageSource[] {
  const header = resolveMediaRef(entryId, headerImage);
  const withHeader = (sources: GalleryImageSource[]): GalleryImageSource[] =>
    header && !sources.some(s => s.src === header.src) ? [header, ...sources] : sources;

  if (images && images.length > 0) {
    const resolved = images
      .map(filename => resolveMediaRef(entryId, filename))
      .filter((m): m is GalleryImageSource => m !== undefined);

    if (resolved.length > 0) return withHeader(resolved);
  }

  const prefix = `/src/content/${entryId}/`;

  // A colocated file the body links to by name is already on the page.
  const inlined = (path: string) => {
    if (!body) return false;
    const filename = path.slice(prefix.length);
    return body.includes(`(${filename})`) || body.includes(`(./${filename})`);
  };

  const swept = (path: string) =>
    path.startsWith(prefix) && isCardOwnAsset(path.slice(prefix.length)) && !inlined(path);

  const imageEntries = Object.keys(localImages)
    .filter(swept)
    .map(path => ({ path, item: { src: localImages[path].default, kind: 'image' as const } }));
  const videoEntries = Object.keys(localVideos)
    .filter(swept)
    .map(path => ({ path, item: { src: localVideos[path], kind: 'video' as const } }));

  return withHeader(
    [...imageEntries, ...videoEntries]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(e => e.item)
  );
}

/**
 * Resolves one media reference — a bare colocated filename or a full URL — to a
 * gallery source. Shared by the `images[]` override and the header image so
 * both accept the same shapes. Returns undefined for a filename with no
 * colocated file, or a remote URL that is neither media nor a known embed.
 */
function resolveMediaRef(entryId: string, ref: string | undefined): GalleryImageSource | undefined {
  if (!ref) return undefined;
  if (ref.startsWith('http')) {
    if (IMAGE_URL_PATTERN.test(ref)) return { src: ref, kind: 'image' };
    if (VIDEO_URL_PATTERN.test(ref)) return { src: ref, kind: 'video' };
    const embed = parseEmbedUrl(ref);
    if (embed) return { src: embed.embedUrl, kind: 'embed', poster: embedPosterUrl(embed) };
    return undefined;
  }
  const localImg = resolveLocalImage(entryId, ref);
  if (localImg) return { src: localImg, kind: 'image' };
  const localVid = resolveLocalVideo(entryId, ref);
  if (localVid) return { src: localVid, kind: 'video' };
  return undefined;
}
