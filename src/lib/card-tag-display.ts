// Pure decision for which of a card's tags to show on a condensed browse card,
// and how, given the active filter selections. No DOM, no store.
//
// Two filter-aware rules make the chips less noisy on a filtered page:
//   - A dimension with exactly ONE selected value: the tag that equals that
//     value is identical on every result, so it's dropped as redundant. More
//     specific descendants (filter `where:europe`, card `where:europe/uk`) are
//     NOT redundant and stay.
//   - A dimension with MORE THAN ONE selected value (an OR): the tags a card
//     matched on are informative — which branch matched differs per card — so
//     they're kept and flagged `active` for distinct styling.
// Tags in dimensions with no active selection are kept as normal chips.

import { FIVE_W_DIMENSIONS } from './filters';
import type { FiveWDimension, FilterState } from './filters';

export type TagChip = { value: string; active: boolean };
export type CardTagDisplay = { tags: TagChip[]; overflow: number };

/** The dimension a tag belongs to, or null for a dimensionless (colon-less) tag. */
function dimensionOf(tag: string): FiveWDimension | null {
  const colonIdx = tag.indexOf(':');
  if (colonIdx === -1) return null;
  const dim = tag.slice(0, colonIdx) as FiveWDimension;
  return FIVE_W_DIMENSIONS.includes(dim) ? dim : null;
}

/** Selected filter values that apply to a tag: its dimension's selections, or the dimensionless `tags` bucket. */
function selectedFor(tag: string, filter: FilterState): string[] {
  const dim = dimensionOf(tag);
  if (dim) return filter.selections[dim] ?? [];
  return filter.tags ?? [];
}

/** True when `tag` equals `value` or is a hierarchical descendant of it. */
function matchesValue(tag: string, value: string): boolean {
  return tag === value || tag.startsWith(value + '/');
}

/**
 * Decides the chips to render for a card's tags under the active filter.
 *
 * Hidden tags are dropped; the rest are ordered active-first (so highlighted
 * matches survive the cap), then truncated to `cap` with the remainder count
 * returned as `overflow`.
 */
export function computeCardTagDisplay(
  cardTags: string[],
  filter: FilterState,
  cap = 4,
): CardTagDisplay {
  const kept: TagChip[] = [];

  for (const tag of cardTags) {
    const selected = selectedFor(tag, filter);
    if (selected.length === 1) {
      if (tag === selected[0]) continue; // redundant: on every result
      kept.push({ value: tag, active: false });
    } else if (selected.length > 1) {
      kept.push({ value: tag, active: selected.some(v => matchesValue(tag, v)) });
    } else {
      kept.push({ value: tag, active: false });
    }
  }

  // Active chips first (stable within each group) so the cap keeps the
  // informative OR-matches over incidental tags.
  const ordered = [
    ...kept.filter(c => c.active),
    ...kept.filter(c => !c.active),
  ];

  return {
    tags: ordered.slice(0, cap),
    overflow: Math.max(0, ordered.length - cap),
  };
}
