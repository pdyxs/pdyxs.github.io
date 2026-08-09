/**
 * New-tab behaviour for links in card body content.
 *
 * The Jekyll site annotated every off-site link with Kramdown's
 * `{:target="_blank"}`. That syntax isn't CommonMark, so it rendered as
 * literal text here; it has been stripped from the content and replaced by
 * this one rule. The card stack *is* the page — following an external link
 * in the same tab discards the whole stack — so off-site links open in a new
 * tab, and nothing else does.
 *
 * Internal navigation goes through the `card:` / `collection:` / `tag:`
 * protocols (see CLAUDE.md), which stay inside the stack and must never be
 * given a target.
 */

const SITE_HOSTS = new Set(['pdyxs.wtf', 'www.pdyxs.wtf']);

/**
 * True when `href` points off-site and should open in a new tab.
 *
 * Everything without an `http(s):` scheme is internal by definition: the
 * in-stack protocols, relative paths, fragments and `mailto:` all stay put.
 */
export function isExternalHref(href: string | undefined | null): boolean {
  if (!href) return false;

  let url: URL;
  try {
    url = new URL(href, 'https://pdyxs.wtf/');
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return !SITE_HOSTS.has(url.hostname);
}

/** The attributes an external link carries. `noopener` blocks reverse-tabnabbing. */
export const EXTERNAL_LINK_PROPERTIES = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * rehype plugin: the thin applier for {@link isExternalHref}.
 *
 * Walks the tree by hand rather than pulling in `unist-util-visit` — the
 * project has no direct unified dependencies and this is the only traversal.
 */
export function rehypeExternalLinks() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string' && isExternalHref(href)) {
          node.properties = { ...node.properties, ...EXTERNAL_LINK_PROPERTIES };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
