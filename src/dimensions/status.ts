// The dev-only status dimension (issue #52) — narrows on the publish lifecycle.
//
// Status is a production concern, not a question a reader asks, which is why
// it isn't a 5 W dimension. It renders nested under the What panel purely as a
// presentation convenience — declared here as `placement`, so the arrangement
// is data rather than a special case wired through FilterBar.
//
// Its values are not tags: they exact-match CardMeta.status. They are also
// deliberately outside the `dimension:value` tag shape (isValidFilterValue
// rejects `status:draft`), so they can never prefix-match a card's tags.
//
// It must never receive a stack-manifest short code. The manifest is
// append-only forever, so a code assigned during a dev run could never be
// withdrawn once a build shipped it — the same reasoning that bars devOnly
// lenses. Its params ride the raw codec fallback instead: correct, just longer.
import type { CardMeta } from '../lib/cards';
import type { TagNode } from '../lib/browse-helpers';
import type { TagDisplay } from '../lib/tag-display';
import { STATUS_VALUES, isStatusValue } from '../lib/status-visibility';
import type { StatusValue } from '../lib/status-visibility';
import type { Dimension, NodeContext, ParamPair } from './types';

const PARAM_KEY = 'filter.status';

/** Value of the drill-in parent row. Bare (no `dimension:` prefix) so it can
 * never collide with a real `what:` tag or match a card. */
export const STATUS_ROOT_VALUE = 'status';

export const statusDimension: Dimension<StatusValue> = {
  id: 'status',
  devOnly: true,
  paramKeys: [PARAM_KEY],
  placement: { panel: 'what', position: 'top' },

  // One collapsed "Status" row that drills in to the lifecycle values, rather
  // than five chips inline at the top of the What panel. Every value gets a
  // leaf even at zero count, so the full lifecycle is always browsable in dev.
  nodes(ctx: NodeContext): TagNode[] {
    const children: TagNode[] = STATUS_VALUES.map(value => ({
      dimensionId: 'status',
      value,
      label: value,
      name: value,
      declared: true,
      count: ctx.cards.filter(c => c.status === value).length,
      children: [],
    }));

    return [{
      dimensionId: 'status',
      value: STATUS_ROOT_VALUE,
      label: 'Status',
      name: 'Status',
      declared: true,
      drillOnly: true,
      count: 0,
      children,
    }];
  },

  matches(card: CardMeta, sel: StatusValue | undefined): boolean {
    if (!sel) return true;
    return card.status === sel;
  },

  // Exclusive, not multi-select: a card has exactly one status, so selecting a
  // different value replaces the current one and re-selecting clears it.
  toggle(sel: StatusValue | undefined, value: string): StatusValue | undefined {
    if (!isStatusValue(value)) return sel;
    return sel === value ? undefined : value;
  },

  values(sel: StatusValue | undefined): string[] {
    return sel ? [sel] : [];
  },

  toParams(sel: StatusValue): ParamPair[] {
    return [[PARAM_KEY, sel]];
  },

  fromParams(params: URLSearchParams): StatusValue | undefined {
    const raw = params.get(PARAM_KEY);
    return isStatusValue(raw) ? raw : undefined;
  },

  // Status values aren't tags, so the tag registry has no display name for
  // them — the raw lifecycle word is the label.
  chipLabel(value: string, _display: Record<string, TagDisplay>): string {
    return value;
  },
};
