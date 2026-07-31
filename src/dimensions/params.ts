// URL serialisation — one fold over the dimension registry.
//
// This is the *active location's* readable query string. The stack codec sits
// above it, compacting these same pairs into short-code tokens for inactive
// entries; the two are layers, not rivals (see the amendment on DEC-002).
import { FIVE_W_DIMENSIONS } from '../lib/five-w';
import type { FiveWDimension } from '../lib/five-w';
import { DEFAULT_BROWSE_LENS_ID } from '../lib/lens-registry';
import { DIMENSIONS, dimensionById } from './registry';
import type { FilterState } from './types';

/**
 * Encodes a FilterState into URLSearchParams.
 *
 * Every dimension emits its own pairs under its own keys, so adding one needs
 * no edit here. Key convention: `filter.<id>`, with a bare `filter` for the
 * null dimension, whose id is empty.
 */
export function filterStateToParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const dimension of DIMENSIONS) {
    const selection = state[dimension.id];
    if (selection === undefined) continue;
    for (const [key, value] of dimension.toParams(selection)) {
      params.append(key, value);
    }
  }
  return params;
}

/**
 * Decodes a FilterState from URLSearchParams (inverse of filterStateToParams).
 * Unknown or invalid values are silently dropped by each dimension.
 */
export function filterStateFromParams(params: URLSearchParams): FilterState {
  const state: Record<string, any> = {};
  for (const dimension of DIMENSIONS) {
    const selection = dimension.fromParams(params);
    if (selection !== undefined) state[dimension.id] = selection;
  }
  return state;
}

/**
 * Removes every filter param from a copy of `params` — for landing on a lens
 * that can't accept filters (acceptsFilters: false), where a stray filter.*
 * query string would otherwise linger (carried forward by a lens replacement,
 * or briefly stale mid-navigation).
 *
 * Folds over each dimension's declared paramKeys, so a dimension can no longer
 * be strippable-in-theory but forgotten here — the contract test asserts every
 * key a dimension emits is one it declares.
 */
export function stripFilterParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const dimension of DIMENSIONS) {
    for (const key of dimension.paramKeys) next.delete(key);
  }
  return next;
}

/**
 * Builds the browse-lens push URL that selects a single tag value, e.g.
 * "who:about" -> "/lens/browse?filter.who=about".
 *
 * Returns the bare browse-lens URL for values with no recognised dimension
 * prefix (nothing to pre-select).
 */
export function filterUrlForTagValue(tagValue: string): string {
  const base = `/lens/${DEFAULT_BROWSE_LENS_ID}`;
  const colonIdx = tagValue.indexOf(':');

  // A colon-less value belongs to the null dimension.
  if (colonIdx === -1) {
    return `${base}?${filterStateToParams({ '': [tagValue] })}`;
  }

  const dim = tagValue.slice(0, colonIdx) as FiveWDimension;
  if (!(FIVE_W_DIMENSIONS as readonly string[]).includes(dim)) return base;
  if (!dimensionById(dim)) return base;
  return `${base}?${filterStateToParams({ [dim]: [tagValue] })}`;
}
