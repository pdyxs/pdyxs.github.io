// A card's display title, as its own leaf module.
//
// Extracted from cards.ts (issue #101) for one reason: the stack-manifest
// generator needs it, and `scripts/*.mjs` import .ts sources directly through
// Node's type stripping — which resolves specifiers literally, so it can only
// reach modules whose whole import graph is extension-qualified. `cards.ts`
// pulls in the content layer and is unreachable from a plain Node script.
//
// The alternative was writing `data.title ?? ''` a second time in the script,
// which is not the trivial duplication it looks like: the *absence* of a
// fallback here is a decision with reasoning behind it (see below), and a
// second copy is where that reasoning goes to die.

/**
 * Resolves a card's display title. There is no fallback: a card with no
 * frontmatter `title` renders as ''.
 *
 * (A stories-fallback-to-series rule lived here until #77. It had been dead
 * since stories moved from `what/stories/` to `what/posts/stories/`, and it
 * would have produced the lowercase slug — "arctic", not "Arctic" — if
 * revived. Untitled story chapters get a frontmatter title like their
 * siblings.)
 */
export function resolveCardTitle(data: { title?: string }): string {
  return data.title ?? '';
}

/**
 * The title a PLACEHOLDER card carries: the manifest's, else the clicked
 * link's, else nothing. Never the uid (issue #105).
 *
 * The manifest wins, and the reason is that a placeholder's title is not
 * transient. `replaceBody` swaps only the body, so the shell a location mounts
 * with is the shell it keeps — a wrong title here is wrong for the rest of the
 * session, in the header, in the spine, and in any pile band that later names
 * this card (issue #111). The manifest carries the card's own resolved title,
 * produced by `resolveCardTitle` above — the same function the real fragment
 * renders through — so it is the one source guaranteed to agree with what
 * lands. A clicked link carries whatever label its listing chose to show,
 * which is usually the same string and occasionally a contextual or truncated
 * one.
 *
 * The link stays as a fallback rather than being dropped: the manifest is
 * regenerated at build, so a location it does not know about is a location
 * whose real title we have no other copy of, and a label the visitor just
 * clicked beats nothing.
 *
 * The uid is never a candidate. A visible `what/games/digital/numbeanies`
 * reads as a bug to a visitor, where an empty header reads as loading.
 */
export function placeholderTitle(
  manifestTitle: string | undefined,
  linkTitle?: string | null,
): string {
  return manifestTitle || linkTitle || '';
}
