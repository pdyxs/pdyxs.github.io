// Pure logic for parsing `collection:` link hrefs.
//
// The `collection:` protocol is used in card body content to link to a
// browse-lens filter view. This module decodes the href and returns the
// filter action the navigation layer should push.
//
// There is deliberately only one action shape now (issue #26): the old
// "plain collection-view" branch (navigate to /card/posts, /card/projects,
// /card/puzzles) is gone along with those pages — every `collection:` href
// resolves to a browse-lens filter, so a visitor can never be left at a
// dead link.

import { DIMENSIONS, isValidFilterValue, tagIdToFilterValue } from './filters';
import type { Dimension, FilterState } from './filters';
import { buildBrowseUrl } from './frontpage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Navigate to the browse lens with pre-applied dimension filter. */
export type FilterAction = {
  type: 'filter';
  /** Absolute URL (e.g. `/lens/newest?filter.what=what%3Apuzzles`) ready for navigation. */
  url: string;
};

export type CollectionLinkAction = FilterAction;

// ---------------------------------------------------------------------------
// parseCollectionLink
// ---------------------------------------------------------------------------

function filterActionFor(dim: Dimension, value: string): FilterAction {
  const filterState: FilterState = { selections: { [dim]: [value] } };
  return { type: 'filter', url: buildBrowseUrl(filterState) };
}

/**
 * Parses the href of a `collection:` link (the part after `collection:`) and
 * returns the browse-lens filter action to perform.
 *
 * **Filter expression links** start with a known dimension name (`what`,
 * `when`, `where`, `who`, `why`) followed by `:` and the tag value:
 *   - `what:puzzles`          → filter on `what:puzzles`
 *   - `what:projects/games`   → filter on `what:projects/games`
 *
 * **`?tag=` query links** carry a legacy tag id in slash-form (as declared in
 * the `tag` content collection, e.g. "what/projects/software-engineering")
 * and are translated to filter colon-form via tagIdToFilterValue():
 *   - `projects?tag=what/projects/software-engineering` → filter on
 *     `what:projects/software-engineering`
 *
 * **Bare collection names** (no query, no recognised dimension prefix) map to
 * the `what:<name>` bucket every card in that collection inherits (see
 * tag-inheritance.ts's derivePathTags) — this reproduces the old
 * collection-view pages as a pre-filtered browse-lens view:
 *   - `puzzles` → filter on `what:puzzles`
 *   - `posts`   → filter on `what:posts`
 */
export function parseCollectionLink(href: string): FilterAction {
  const qIdx = href.indexOf('?');
  const path = qIdx === -1 ? href : href.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : href.slice(qIdx + 1);

  if (queryStr) {
    const tagId = new URLSearchParams(queryStr).get('tag');
    if (tagId) {
      const filterValue = tagIdToFilterValue(tagId);
      if (isValidFilterValue(filterValue)) {
        const dim = filterValue.slice(0, filterValue.indexOf(':')) as Dimension;
        return filterActionFor(dim, filterValue);
      }
    }
  }

  const colonIdx = path.indexOf(':');
  if (colonIdx !== -1) {
    const maybeDim = path.slice(0, colonIdx) as Dimension;
    if ((DIMENSIONS as readonly string[]).includes(maybeDim)) {
      return filterActionFor(maybeDim, path);
    }
  }

  return filterActionFor('what', `what:${path}`);
}
