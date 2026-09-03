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
 * Two kinds qualify:
 *
 *   - The date-derived `when:<era>/<yyyy>/<mm>` tag. It displays as a bare
 *     humanised month ("June") with no year or era, which says less than the
 *     date every card already shows — and it costs a slot in the chip cap that
 *     a real tag would use.
 *   - A bare dimension root — a tag with a colon and nothing after it (`who:`).
 *     `derivePathTags` joins the directory segments *between* the dimension and
 *     the slug, so a card one folder under the dimension root (`who/about-me`)
 *     derives an empty value. Every chip is a `tag:` link, and that one resolves
 *     to `/lens/…?filter.who=` — a selection with no value, a state no other
 *     route can reach, and a chip with no label worth clicking.
 *     `isValidFilterValue` already draws this line ("returns false for bare
 *     dimension roots"); the guard belongs here, in the one shared decision,
 *     rather than at `GenericRenderer` and `BrowseCard` separately (#94).
 *     Dimensionless tags (`installation`) are untouched — they filter fine.
 *
 * Everything else a card carries is kept: its folder category (`what:art`), its
 * cascade and frontmatter tags (including authored `when:` markers like
 * `when:released`), and its date-derived `where:` location.
 *
 * This is deliberately the ONE place the rule lives, so a card's chips are
 * identical on its own masthead and in every listing.
 */
export function isChipHidden(tag: string): boolean {
  if (isDerivedWhenTag(tag)) return true;
  const colonIdx = tag.indexOf(':');
  return colonIdx !== -1 && tag.slice(colonIdx + 1).length === 0;
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
 *
 * `labelOf` resolves a tag's display name and enables same-label deduping —
 * see the note on `labelOf` in the signature.
 */
export function computeCardTagDisplay(
  cardTags: string[],
  filter: FilterState,
  cap = 4,
  /**
   * Resolves a tag's display name, for deduping chips that would render
   * identically. An affiliation (`who:seethrough`, see affiliations.ts) is
   * named after the organisation, and every card in the first hop of its
   * closure also carries the card-backed tag for the org's own card
   * (`where:work/seethrough`) — which resolves to the same name. Two chips
   * reading "SeeThrough Studios" say nothing the first didn't; the earlier one
   * wins, since tag order puts the authored, card-linking tag first.
   *
   * Cards deeper in the closure (an old post that names only the game) have no
   * such twin, so their affiliation chip survives — which is exactly where it
   * carries information.
   *
   * Omitted (the default) means no deduping: callers without a display map
   * resolve names downstream and would only ever compare raw values.
   */
  labelOf?: (tag: string) => string,
  /**
   * This card's collapsed container (`CardMeta.collapsedContainer`) — the
   * colon-form value of the folder it is a *part of*, when that folder opts
   * into collapsing. That tag is dropped.
   *
   * Every card carries its parent folder's value as a path tag
   * (`derivePathTags`), and for nearly every folder that reads as a category:
   * an art card chipped "Art" is telling you something. A collapsed folder is
   * not a category — it is one work, and its cards are its chapters. The chip
   * then says "In Fate's Hands" on a chapter *of* In Fate's Hands, and its
   * `tag:` link filters to a lens holding exactly one result: the collapsed
   * representative, i.e. where you already are. On the representative itself
   * it is worse — the folder's identity is that card's own title, so the chip
   * repeats it verbatim.
   *
   * Only the chip is dropped. The tag stays on the card, so filtering, the
   * collapse union and the lens are untouched — and the containment relation
   * is still stated, by the series section naming the story (GenericRenderer)
   * and by the nav renderer's position indicator.
   */
  selfContainer?: string,
): CardTagDisplay {
  const kept: TagChip[] = [];
  const seenLabels = new Set<string>();

  for (const tag of cardTags) {
    if (isChipHidden(tag)) continue;
    if (selfContainer && tag === selfContainer) continue;
    if (labelOf) {
      const label = labelOf(tag);
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
    }
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
