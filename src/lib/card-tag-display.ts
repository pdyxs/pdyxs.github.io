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

import { FIVE_W_DIMENSIONS } from './five-w';
import type { FiveWDimension } from './five-w';
import { isDerivedWhenTag } from './when-tags';
import { selectedValues } from '../dimensions';
import type { FilterState } from '../dimensions';

export type TagChip = { value: string; active: boolean };
export type CardTagDisplay = { tags: TagChip[]; overflow: number };

/**
 * Tags that are never rendered as a chip, wherever a card is shown.
 *
 * Only the date-derived `when:<era>/<yyyy>/<mm>` tag qualifies. It displays as
 * a bare humanised month ("June") with no year or era, which says less than the
 * date every card already shows — and it costs a slot in the chip cap that a
 * real tag would use. Everything else a card carries is kept: its folder
 * category (`what:art`), its cascade and frontmatter tags (including authored
 * `when:` markers like `when:released`), and its date-derived `where:` location.
 *
 * This is deliberately the ONE place the rule lives, so a card's chips are
 * identical on its own masthead and in every listing.
 */
export function isChipHidden(tag: string): boolean {
  return isDerivedWhenTag(tag);
}

/** The dimension a tag belongs to, or null for a dimensionless (colon-less) tag. */
function dimensionOf(tag: string): FiveWDimension | null {
  const colonIdx = tag.indexOf(':');
  if (colonIdx === -1) return null;
  const dim = tag.slice(0, colonIdx) as FiveWDimension;
  return FIVE_W_DIMENSIONS.includes(dim) ? dim : null;
}

/** Selected filter values that apply to a tag: those of its own dimension,
 * falling back to the null dimension for a bare tag. */
function selectedFor(tag: string, filter: FilterState): string[] {
  return selectedValues(filter, dimensionOf(tag) ?? '');
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
    if (isChipHidden(tag)) continue;
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
