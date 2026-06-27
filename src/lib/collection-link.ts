// Pure logic for parsing `collection:` link hrefs.
//
// The `collection:` protocol is used in card body content to link to other
// collections or to filtered browse views. This module decodes the href and
// returns the action the navigation layer should take.

import { DIMENSIONS } from './filters';
import type { Dimension, FilterState } from './filters';
import { buildBrowseUrl } from './frontpage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Navigate to a collection-view card at /card/<uid>. */
export type CardAction = {
  type: 'card';
  uid: string;
  /** Optional card-level params to associate with the pushed card. */
  params?: Record<string, string>;
};

/** Navigate to the browse/homepage with pre-applied dimension filter. */
export type FilterAction = {
  type: 'filter';
  /** Absolute URL (e.g. `/?filter.what=what%3Apuzzles`) ready for navigation. */
  url: string;
};

export type CollectionLinkAction = CardAction | FilterAction;

// ---------------------------------------------------------------------------
// parseCollectionLink
// ---------------------------------------------------------------------------

/**
 * Parses the href of a `collection:` link (the part after `collection:`) and
 * returns the navigation action to perform.
 *
 * **Plain collection links** navigate to the collection-view card:
 *   - `posts`               → `{ type: 'card', uid: 'posts' }`
 *   - `posts?tag=games`     → `{ type: 'card', uid: 'posts', params: { tag: 'games' } }`
 *
 * **Filter expression links** navigate to the browse view with a pre-applied
 * dimension filter. A filter expression starts with a known dimension name
 * (`what`, `when`, `where`, `who`, `why`) followed by `:` and the tag value:
 *   - `what:puzzles`          → `{ type: 'filter', url: '/?filter.what=what%3Apuzzles' }`
 *   - `what:projects/games`   → `{ type: 'filter', url: '/?filter.what=what%3Aprojects%2Fgames' }`
 */
export function parseCollectionLink(href: string): CollectionLinkAction {
  const qIdx = href.indexOf('?');
  const path = qIdx === -1 ? href : href.slice(0, qIdx);
  const queryStr = qIdx === -1 ? '' : href.slice(qIdx + 1);

  // Detect filter expressions: `<dimension>:<value>` where dimension is one of
  // the known 5W dimension names.
  const colonIdx = path.indexOf(':');
  if (colonIdx !== -1) {
    const maybeDim = path.slice(0, colonIdx) as Dimension;
    if ((DIMENSIONS as readonly string[]).includes(maybeDim)) {
      const tagValue = path; // already `dim:value`
      const filterState: FilterState = { selections: { [maybeDim]: [tagValue] } };
      return { type: 'filter', url: buildBrowseUrl(filterState) };
    }
  }

  // Plain collection link
  const params: Record<string, string> = {};
  if (queryStr) {
    new URLSearchParams(queryStr).forEach((v, k) => { params[k] = v; });
  }
  return {
    type: 'card',
    uid: path,
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };
}
