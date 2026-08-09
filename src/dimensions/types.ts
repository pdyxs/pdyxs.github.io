// The Dimension seam (issue #76, DEC-008).
//
// A dimension is an axis the card pool is narrowed along. Each one offers its
// own values, decides for itself whether a card matches, owns its own URL
// params, and ANDs with every other active dimension — a card must satisfy all
// of them. Three kinds exist: the five 5 W dimensions, the null dimension
// (bare tags, id ''), and the dev-only status dimension.
//
// Dimensions own data and behaviour, never rendering. Panel rows and chips are
// drawn by shared components, because Svelte's scoping inflates selector
// specificity and a per-dimension component would have to restate every
// --color-selected-* rule (see CLAUDE.md, "Selected states").
import type { CardMeta } from '../lib/cards';
import type { TagNode } from '../lib/browse-helpers';
import type { TagDisplay } from '../lib/tag-display';
import type { FiveWDimension } from '../lib/five-w';
import type { DimensionId } from './id';

/** One `[key, value]` URL param pair. Matches stack-codec's ParamPairs. */
export type ParamPair = [string, string];

export type { DimensionId } from './id';

/**
 * What a dimension holds when something is selected. `undefined` always means
 * "nothing selected", and is the identity for the applyFilters fold — a
 * dimension with no selection must never exclude a card.
 */
export type DimensionSelection = string[] | string;

/** Everything a dimension needs to enumerate its offerable values. */
export interface NodeContext {
  /** The browse pool — already listing-filtered and collapsed. */
  cards: CardMeta[];
  /** Enumerable filter values from the tag registry, in colon form. */
  declaredValues: string[];
  /** Flat `value -> {name, description}` map from the tag registry. */
  display: Record<string, TagDisplay>;
  /**
   * Card-backed values from the FULL card set — see applyFilters for why this
   * must not be re-derived from `cards`. Optional so a caller with a
   * self-contained pool can omit it.
   */
  cardBackedValues?: Set<string>;
}

/** Shared per-pool derivation, computed once per applyFilters call. */
export interface MatchContext {
  /**
   * Values that are some card's own path. A tag like this is a direct link to
   * that card, not a category claim, so it only ever matches by exact equality
   * — see cardOwnValues.
   */
  cardBackedValues: Set<string>;
}

/** Where a dimension's nodes are injected, for dimensions that have any. */
export interface DimensionPlacement {
  /** The 5 W panel this dimension's nodes render inside. */
  panel: FiveWDimension;
  /** Placed above that panel's own sections. */
  position: 'top';
}

export interface Dimension<TSel extends DimensionSelection = DimensionSelection> {
  /**
   * Stable identity. Also the param-key suffix: `filter.<id>`, or a bare
   * `filter` for the null dimension, whose id is the empty string.
   */
  readonly id: DimensionId;

  /**
   * Excluded from production builds. Gated twice, mirroring lens-registry +
   * lens-components: this flag drives the pure isDimensionVisible predicate,
   * and the registry additionally spreads the dimension conditionally so the
   * production bundle eliminates it outright.
   */
  readonly devOnly?: boolean;

  /** Param keys this dimension may emit. The strip list — must cover every
   * key toParams can produce, which the contract test asserts. */
  readonly paramKeys: readonly string[];

  /** Where this dimension's nodes render, if it offers any. */
  readonly placement?: DimensionPlacement;

  /** Values offered in the panel. Empty for the null dimension, whose values
   * are only ever selected by clicking a tag on a card. */
  nodes(ctx: NodeContext): TagNode[];

  /** True when `sel` is absent (the identity) or the card satisfies it. */
  matches(card: CardMeta, sel: TSel | undefined, ctx: MatchContext): boolean;

  /** Adds or removes `value`. Returns undefined when nothing remains selected
   * — never an empty array, since callers read the selection's truthiness. */
  toggle(sel: TSel | undefined, value: string): TSel | undefined;

  /** The selected values, flattened. Drives chips and panel highlighting
   * without any consumer needing to know this dimension's selection shape. */
  values(sel: TSel | undefined): string[];

  toParams(sel: TSel): ParamPair[];
  fromParams(params: URLSearchParams): TSel | undefined;

  /** Chip text for one selected value. */
  chipLabel(value: string, display: Record<string, TagDisplay>): string;
}

/**
 * The whole filter selection: a flat dimension-id -> selection map. Absent and
 * undefined keys both mean "this dimension is not narrowing anything".
 *
 * Keyed by DimensionId rather than `string`, so a key naming no dimension is a
 * type error at the construction site instead of a no-op dimension nobody
 * notices (issue #79).
 */
export type FilterState = Readonly<Partial<Record<DimensionId, DimensionSelection>>>;
