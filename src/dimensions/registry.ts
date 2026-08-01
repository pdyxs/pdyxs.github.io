// The dimension registry (issue #76, DEC-008).
//
// Every station folds over this list instead of enumerating kinds by hand —
// which is what the four repeated facet lists in the old filters.ts cost.
import { FIVE_W_DIMENSIONS } from '../lib/five-w';
import { makeFiveWDimension } from './five-w';
import { nullDimension } from './null-dimension';
import { statusDimension } from './status';
import type { Dimension, DimensionId, DimensionSelection, FilterState, MatchContext } from './types';

/**
 * All registered dimensions.
 *
 * The five 5 W dimensions are *derived* from FIVE_W_DIMENSIONS rather than
 * hand-listed, so the content model stays their single source.
 *
 * The status dimension is gated twice, mirroring lens-registry +
 * lens-components: `devOnly` drives isDimensionVisible (a pure predicate,
 * testable without a Vite environment), and this conditional spread lets a
 * production build eliminate the module outright. `import.meta.env.DEV` is
 * substituted at build time, so the ternary constant-folds away.
 */
export const DIMENSIONS: readonly Dimension<any>[] = [
  ...FIVE_W_DIMENSIONS.map(makeFiveWDimension),
  nullDimension,
  ...(import.meta.env.DEV ? [statusDimension] : []),
];

const BY_ID = new Map(DIMENSIONS.map(d => [d.id, d]));

/**
 * Lookup for an id of unknown provenance — a URL param key, a lens YAML key.
 * Deliberately takes `string`, not DimensionId: validating an untrusted id is
 * the whole job, and returning undefined is how it says "no such dimension".
 * Callers that already hold a DimensionId don't need it.
 */
export function dimensionById(id: string): Dimension<any> | undefined {
  return BY_ID.get(id as DimensionId);
}

/**
 * Pure visibility decision for a devOnly dimension. Callers pass
 * `import.meta.env.DEV` as `isDev` — kept as a plain boolean parameter rather
 * than read internally, so this stays testable outside Vite/Astro.
 */
export function isDimensionVisible(
  dimension: Pick<Dimension<any>, 'devOnly'>,
  isDev: boolean,
): boolean {
  return isDev || !dimension.devOnly;
}

/** The selection held for one dimension, or undefined when it isn't narrowing. */
export function selectionFor(state: FilterState, id: DimensionId): DimensionSelection | undefined {
  return state[id];
}

/** Selected values for one dimension, flattened — chips and panel highlighting
 * use this rather than knowing any dimension's selection shape. */
export function selectedValues(state: FilterState, id: DimensionId): string[] {
  const dimension = BY_ID.get(id);
  if (!dimension) return [];
  return dimension.values(state[id]);
}

/** True when any dimension is narrowing. Drives the active-filter chip bar. */
export function hasAnySelection(state: FilterState): boolean {
  return DIMENSIONS.some(d => d.values(state[d.id]).length > 0);
}

/** Toggles one value within one dimension, dropping the key entirely when
 * nothing remains selected — so hasAnySelection never sees a phantom empty. */
export function toggleValue(state: FilterState, id: DimensionId, value: string): FilterState {
  const dimension = BY_ID.get(id);
  if (!dimension) return state;
  const next = dimension.toggle(state[id], value);
  const { [id]: _dropped, ...rest } = state;
  return next === undefined ? rest : { ...rest, [id]: next };
}

/** Clears one dimension entirely (the panel's "clear" control). */
export function clearDimension(state: FilterState, id: DimensionId): FilterState {
  const { [id]: _dropped, ...rest } = state;
  return rest;
}

/** The empty selection. */
export function emptyFilterState(): FilterState {
  return {};
}

export function makeMatchContext(cardBackedValues: Set<string>): MatchContext {
  return { cardBackedValues };
}
