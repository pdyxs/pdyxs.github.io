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
