// The null dimension — bare tags with no `dimension:` prefix (e.g. `science`).
//
// Its id is the empty string, which is not a placeholder: the prefix genuinely
// is empty, so its param key is the empty-suffix case of every other
// dimension's `filter.<id>` — a bare `filter=science`.
//
// It offers no nodes. Its values are only ever selected by clicking a tag on a
// card, never from the dimension bar, so the panel has nothing to render for it.
import type { CardMeta } from '../lib/cards';
import type { TagNode } from '../lib/browse-helpers';
import type { TagDisplay } from '../lib/tag-display';
import { displayFor } from '../lib/tag-display';
import { isValidDimensionlessValue } from '../lib/five-w';
import type { Dimension, ParamPair } from './types';

const PARAM_KEY = 'filter';

export const nullDimension: Dimension<string[]> = {
  id: '',
  paramKeys: [PARAM_KEY],

  nodes(): TagNode[] {
    return [];
  },

  // Exact equality, never prefix — a bare tag has no hierarchy beneath it.
  matches(card: CardMeta, sel: string[] | undefined): boolean {
    if (!sel || sel.length === 0) return true;
    return card.tags.some(tag => sel.includes(tag));
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

  toParams(sel: string[]): ParamPair[] {
    return sel.map(value => [PARAM_KEY, value]);
  },

  fromParams(params: URLSearchParams): string[] | undefined {
    const values = params.getAll(PARAM_KEY).filter(isValidDimensionlessValue);
    return values.length > 0 ? values : undefined;
  },

  chipLabel(value: string, display: Record<string, TagDisplay>): string {
    return displayFor(value, display).name;
  },
};
