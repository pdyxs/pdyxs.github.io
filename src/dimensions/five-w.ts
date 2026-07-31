// The five 5 W dimensions — who/what/when/where/why (see the vault Glossary).
//
// All five behave identically and differ only in their id, so they are derived
// from FIVE_W_DIMENSIONS rather than hand-registered. That is also what keeps
// the dimension bar at exactly five buttons by construction, with no
// "renders as a bar button" opt-in flag to keep in sync.
import type { CardMeta } from '../lib/cards';
import type { TagNode } from '../lib/browse-helpers';
import { buildTagHierarchy } from '../lib/browse-helpers';
import type { TagDisplay } from '../lib/tag-display';
import { displayFor } from '../lib/tag-display';
import { isValidFilterValue, type FiveWDimension } from '../lib/five-w';
import type { Dimension, MatchContext, NodeContext, ParamPair } from './types';

const PARAM_PREFIX = 'filter.';

/**
 * True if `tag` equals `prefix` or sits beneath it.
 *
 * Exception: a tag that is some *other* card's own path (a "card-backed tag")
 * is a direct link to that card, not a category membership claim, so it only
 * ever matches by exact equality — it must never prefix-match into an ancestor.
 */
function tagMatchesPrefix(tag: string, prefix: string, cardBackedValues: Set<string>): boolean {
  if (tag === prefix) return true;
  if (cardBackedValues.has(tag)) return false;
  return tag.startsWith(prefix + '/');
}

export function makeFiveWDimension(id: FiveWDimension): Dimension<string[]> {
  const paramKey = `${PARAM_PREFIX}${id}`;
  const valuePrefix = `${id}:`;

  return {
    id,
    paramKeys: [paramKey],

    nodes(ctx: NodeContext): TagNode[] {
      return buildTagHierarchy(ctx.cards, id, ctx.declaredValues, ctx.display);
    },

    matches(card: CardMeta, sel: string[] | undefined, ctx: MatchContext): boolean {
      if (!sel || sel.length === 0) return true;
      // Values within one dimension OR; dimensions AND with each other.
      return card.tags.some(tag =>
        sel.some(value => tagMatchesPrefix(tag, value, ctx.cardBackedValues)),
      );
    },

    toggle(sel: string[] | undefined, value: string): string[] | undefined {
      const existing = sel ?? [];
      const next = existing.includes(value)
        ? existing.filter(v => v !== value)
        : [...existing, value];
      return next.length > 0 ? next : undefined;
    },

    values(sel: string[] | undefined): string[] {
      return sel ?? [];
    },

    // The dimension already lives in the param key, so the redundant `<id>:`
    // prefix is stripped from each value — `what:projects/games` under key
    // `filter.what` rides as just `projects/games`, keeping the URL free of
    // percent-escaped colons.
    toParams(sel: string[]): ParamPair[] {
      return sel.map(value => [
        paramKey,
        value.startsWith(valuePrefix) ? value.slice(valuePrefix.length) : value,
      ]);
    },

    // Re-adds the prefix stripped on encode. A tag sub-value never contains a
    // colon of its own, so the round-trip is unambiguous — and fully-qualified
    // legacy links (`filter.what=what:games`) still decode untouched.
    fromParams(params: URLSearchParams): string[] | undefined {
      const values = params
        .getAll(paramKey)
        .map(v => (v.startsWith(valuePrefix) ? v : `${valuePrefix}${v}`))
        .filter(isValidFilterValue);
      return values.length > 0 ? values : undefined;
    },

    chipLabel(value: string, display: Record<string, TagDisplay>): string {
      return displayFor(value, display).name;
    },
  };
}
