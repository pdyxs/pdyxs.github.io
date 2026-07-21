// Dev-only publish-lifecycle facet, rendered as a drill-in node at the top of
// the What dimension panel (replaces the old always-visible StatusFacet).
//
// The facet is NOT a 5W dimension and status is NOT a tag — it's a separate
// CardMeta.status field (see status-visibility.ts). So the node built here is
// synthetic: a `drillOnly` parent whose leaves carry `status:<value>` values.
// Those values are deliberately outside the `dimension:value` shape
// (isValidFilterValue rejects them), so they can never prefix-match a card's
// tags. LensFilterShell recognises the `status:` prefix and routes the
// selection to FilterState.status instead of a dimension bucket.
//
// This module is pure (no IO, no Astro) so it's unit-testable. The DEV gate
// lives at the injection site (LensStackCard.astro) — a production build never
// calls this, so the whole facet is dead-code-eliminated out of prod output.
import type { CardMeta } from './cards';
import type { TagNode } from './browse-helpers';
import { STATUS_VALUES } from './status-visibility';

/** Sentinel value of the drill-in parent node. Bare (no `dimension:` prefix)
 * so it never collides with a real `what:` tag and never matches a card. */
export const STATUS_FACET_VALUE = 'status';

/** Prefix on each leaf's value; the segment after it is a StatusValue. */
export const STATUS_LEAF_PREFIX = 'status:';

/**
 * Builds the synthetic "Status" node for the What panel. Every status value
 * gets a leaf (even zero-count ones, so the full lifecycle is always
 * browsable in dev); the leaf count is the number of cards resolving to that
 * status in the given pool.
 */
export function buildStatusFacetNode(cards: CardMeta[]): TagNode {
  const children: TagNode[] = STATUS_VALUES.map(value => ({
    value: `${STATUS_LEAF_PREFIX}${value}`,
    label: value,
    name: value,
    declared: true,
    count: cards.filter(c => c.status === value).length,
    children: [],
  }));

  return {
    value: STATUS_FACET_VALUE,
    label: 'Status',
    name: 'Status',
    declared: true,
    drillOnly: true,
    count: 0,
    children,
  };
}
