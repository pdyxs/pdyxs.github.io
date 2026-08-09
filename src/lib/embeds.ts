import { VIMEO_POSTERS } from '../data/vimeo-posters.generated.ts';

/**
 * Video embeds: the one place a YouTube/Vimeo URL is turned into a player.
 *
 * Two appliers consume this, and neither decides anything itself:
 *
 * - `rehypeVideoEmbeds` (src/lib/video-embeds.ts) rewrites a bare video link
 *   in card body markdown into a responsive `<figure>`.
 * - `resolveGalleryImages` (src/lib/images.ts) turns an embed URL sitting in
 *   the legacy `images[]` frontmatter into a gallery tile.
 *
 * Both paths exist because the Jekyll content used both: raw `<iframe>` in the
 * body, and embed URLs stuffed into `images[]`. Neither is authored by hand
 * any more — a bare link on its own line is the body form.
 */

export type EmbedProvider = 'youtube' | 'vimeo';

export interface VideoEmbed {
  provider: EmbedProvider;
  /** Provider-native video id — the key into VIMEO_POSTERS, and the poster path for YouTube. */
  id: string;
  /** The URL to put in an iframe `src`. */
  embedUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const YOUTUBE_SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** YouTube ids are 11 chars of the URL-safe base64 alphabet; Vimeo ids are numeric. */
const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d+$/;

/**
 * Parses a YouTube or Vimeo URL into the pieces an embed needs, or returns
 * undefined for anything else (including a video *page* on some other host).
 *
 * Accepts every shape the migrated content actually carries: `/embed/<id>`,
 * `watch?v=<id>`, `youtu.be/<id>`, `vimeo.com/<id>` and
 * `player.vimeo.com/video/<id>`. Query strings beyond the id are dropped —
 * Jekyll-era `?rel=0` and tracking params are not worth preserving.
 */
export function parseEmbedUrl(url: string | undefined | null): VideoEmbed | undefined {
  if (!url) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    // /embed/<id>, /v/<id>, /shorts/<id>, or /watch?v=<id>
    const fromPath =
      segments.length === 2 && ['embed', 'v', 'shorts'].includes(segments[0])
        ? segments[1]
        : undefined;
    const id = fromPath ?? parsed.searchParams.get('v') ?? undefined;
    return id && YOUTUBE_ID.test(id) ? youtube(id) : undefined;
  }

  if (YOUTUBE_SHORT_HOSTS.has(host)) {
    const id = segments[0];
    return segments.length === 1 && id && YOUTUBE_ID.test(id) ? youtube(id) : undefined;
  }

  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/<id> or player.vimeo.com/video/<id>
    const id = segments[0] === 'video' ? segments[1] : segments[0];
    return id && VIMEO_ID.test(id) ? vimeo(id) : undefined;
  }

  return undefined;
}

function youtube(id: string): VideoEmbed {
  // nocookie defers YouTube's cookies until playback actually starts. The
  // gallery and body embeds are both facades, so nothing loads until a click,
  // but the body figure's iframe is in the DOM from the start.
  return { provider: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
}

function vimeo(id: string): VideoEmbed {
  return { provider: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}` };
}

/**
 * The still frame to show before playback, or undefined when there isn't one.
 *
 * YouTube serves a poster at a predictable path. Vimeo does not — its only
 * official route is an oEmbed call, so posters are resolved at build time into
 * `src/data/vimeo-posters.generated.ts` by scripts/generate-vimeo-posters.mjs.
 * A Vimeo id missing from that map yields undefined, and the gallery falls back
 * to a labelled tile rather than a broken image.
 */
export function embedPosterUrl(
  embed: VideoEmbed,
  vimeoPosters: Record<string, string> = VIMEO_POSTERS,
): string | undefined {
  if (embed.provider === 'youtube') {
    // mqdefault, not hqdefault: hqdefault letterboxes 16:9 into a 4:3 frame, so
    // a square gallery tile would show YouTube's black bars. mqdefault is a
    // bare 320×180 with no bars, which is plenty for a thumbnail.
    return `https://i.ytimg.com/vi/${embed.id}/mqdefault.jpg`;
  }
  return vimeoPosters[embed.id];
}

/** Same embed URL with autoplay on — used when a gallery facade is clicked. */
export function autoplayEmbedUrl(embedUrl: string): string {
  const separator = embedUrl.includes('?') ? '&' : '?';
  return `${embedUrl}${separator}autoplay=1`;
}

/** The `allow` attribute an embed iframe needs for fullscreen and inline playback. */
export const EMBED_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
