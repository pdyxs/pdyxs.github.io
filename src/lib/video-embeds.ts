import { parseEmbedUrl, EMBED_IFRAME_ALLOW, type VideoEmbed } from './embeds.ts';

/**
 * Video embeds in card body markdown.
 *
 * The Jekyll content wrote these as raw `<iframe>` inside a Bootstrap grid
 * wrapper (`<div class="col-xs-12 text-center">`), which carried a fixed
 * 560×315 that overflows a narrow card and a class that means nothing here.
 * The markdown-native replacement is **a bare video link on its own line** —
 * GFM autolinks it, and this plugin turns that paragraph into a responsive
 * figure. Raw HTML in a body is a data bug (the audit lens flags it as
 * `legacy-markup`).
 *
 * Only a paragraph containing *nothing but* the link is rewritten, so a video
 * referenced mid-sentence stays an ordinary external link.
 */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** Whitespace-only text between block children isn't content. */
function isIgnorable(node: HastNode): boolean {
  return node.type === 'text' && (node.value ?? '').trim() === '';
}

/**
 * The embed a paragraph is *entirely* made of, or undefined.
 *
 * Requires a single anchor child whose visible text is the URL itself — a link
 * with its own label ("[the talk](youtu.be/…)") is prose the author wrote
 * deliberately, and stays a link.
 */
export function paragraphEmbed(node: HastNode): VideoEmbed | undefined {
  if (node.tagName !== 'p') return undefined;

  const children = (node.children ?? []).filter(child => !isIgnorable(child));
  if (children.length !== 1) return undefined;

  const anchor = children[0];
  if (anchor.tagName !== 'a') return undefined;

  const href = anchor.properties?.href;
  if (typeof href !== 'string') return undefined;

  const text = (anchor.children ?? [])
    .map(child => child.value ?? '')
    .join('')
    .trim();
  if (text !== href) return undefined;

  return parseEmbedUrl(href);
}

/** The figure that replaces the paragraph. `.video-embed` is a CSS contract (global.css). */
export function embedFigure(embed: VideoEmbed): HastNode {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['video-embed'], 'data-provider': embed.provider },
    children: [
      {
        type: 'element',
        tagName: 'iframe',
        properties: {
          src: embed.embedUrl,
          title: embed.provider === 'youtube' ? 'YouTube video' : 'Vimeo video',
          loading: 'lazy',
          allow: EMBED_IFRAME_ALLOW,
          allowfullscreen: true,
          referrerpolicy: 'strict-origin-when-cross-origin',
          frameborder: '0',
        },
        children: [],
      },
    ],
  };
}

/**
 * rehype plugin: the thin applier for {@link paragraphEmbed}.
 *
 * Walks by hand for the same reason rehypeExternalLinks does — the project has
 * no direct unified dependencies. Must run *before* rehypeExternalLinks so the
 * anchor is gone before it can be given a `target`.
 */
export function rehypeVideoEmbeds() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children) return;
      node.children = node.children.map(child => {
        const embed = paragraphEmbed(child);
        if (embed) return embedFigure(embed);
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}
