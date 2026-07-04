// Filter evaluation and URL serialisation layer.
//
// FilterState holds per-dimension selections plus optional date predicates for
// the `when` dimension. Matching is prefix-based: selecting `what:projects`
// returns cards tagged `what:projects` or `what:projects/*`.

export const DIMENSIONS = ["who", "what", "when", "where", "why"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type DatePredicate = {
    from?: Date;
    to?: Date;
};

export type FilterState = {
    /** Selected tag prefixes per dimension, e.g. { what: ['what:projects'] } */
    selections: Partial<Record<Dimension, string[]>>;
    /** Optional date-range predicates for the `when` dimension */
    datePredicate?: DatePredicate;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns false for bare dimension roots (e.g. "what", "why") and true for
 * any valid `dimension:value` tag prefix.
 */
export function isValidFilterValue(value: string): boolean {
    // Must contain a colon and the part before the colon must be a known dimension
    const colonIdx = value.indexOf(":");
    if (colonIdx === -1) return false;
    const dim = value.slice(0, colonIdx) as Dimension;
    if (!DIMENSIONS.includes(dim)) return false;
    // The part after the colon must be non-empty
    const rest = value.slice(colonIdx + 1);
    return rest.length > 0;
}

// ---------------------------------------------------------------------------
// Prefix matching
// ---------------------------------------------------------------------------

/**
 * Returns true if `tag` equals `prefix` or starts with `prefix + "/"`.
 */
function tagMatchesPrefix(tag: string, prefix: string): boolean {
    return tag === prefix || tag.startsWith(prefix + "/");
}

// ---------------------------------------------------------------------------
// Filter application
// ---------------------------------------------------------------------------

import type { CardMeta } from "./cards";
import { DEFAULT_BROWSE_LENS_ID } from "./lens-registry";

/**
 * Returns cards that match all active dimension selections.
 *
 * A card matches a dimension selection if it has at least one tag that prefix-
 * matches at least one of the selected values for that dimension.
 *
 * The `when` dimension additionally matches if the card's `date` field falls
 * within any active `datePredicate` range.
 */
export function applyFilters(
    cards: CardMeta[],
    filterState: FilterState,
): CardMeta[] {
    const { selections, datePredicate } = filterState;

    return cards.filter((card) => {
        // Check each dimension that has active selections
        for (const dim of DIMENSIONS) {
            const selected = selections[dim];
            if (!selected || selected.length === 0) continue;

            const tagsMatch = card.tags.some((tag) =>
                selected.some((sel) => tagMatchesPrefix(tag, sel)),
            );

            if (tagsMatch) continue;

            // Special `when` date-range predicate — alternative match path
            if (dim === "when" && datePredicate && card.date) {
                const { from, to } = datePredicate;
                const t = card.date.getTime();
                const fromOk = from === undefined || t >= from.getTime();
                const toOk = to === undefined || t <= to.getTime();
                if (fromOk && toOk) continue;
            }

            // Neither tag match nor date predicate matched — card is excluded
            return false;
        }

        // Also check date predicate when there are NO when-dimension tag selections
        // but a date predicate is active. In that case the predicate acts as an
        // independent when filter.
        if (datePredicate) {
            const whenSelected = selections["when"];
            if (!whenSelected || whenSelected.length === 0) {
                if (!card.date) return false;
                const { from, to } = datePredicate;
                const t = card.date.getTime();
                const fromOk = from === undefined || t >= from.getTime();
                const toOk = to === undefined || t <= to.getTime();
                if (!fromOk || !toOk) return false;
            }
        }

        return true;
    });
}

/**
 * Builds the browse-lens push URL that selects a single tag value's dimension
 * subtree, e.g. "who:about" -> "/lens/newest?filter.who=who%3Aabout".
 *
 * Returns the bare browse-lens URL for values with no recognised dimension
 * prefix (nothing to pre-select).
 */
export function filterUrlForTagValue(tagValue: string): string {
    const base = `/lens/${DEFAULT_BROWSE_LENS_ID}`;
    const colonIdx = tagValue.indexOf(":");
    if (colonIdx === -1) return base;
    const dim = tagValue.slice(0, colonIdx) as Dimension;
    if (!(DIMENSIONS as readonly string[]).includes(dim)) return base;
    const params = filterStateToParams({ selections: { [dim]: [tagValue] } });
    return `${base}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// URL encoding / decoding
// ---------------------------------------------------------------------------

const PARAM_PREFIX = "filter.";
const DATE_FROM_PARAM = "when.from";
const DATE_TO_PARAM = "when.to";

/**
 * Encodes a FilterState into URLSearchParams.
 *
 * Each dimension's selections are stored as repeated params:
 *   filter.what=what:projects&filter.what=what:games
 *
 * Date predicates are stored as ISO strings:
 *   when.from=2020-01-01T00:00:00.000Z&when.to=2020-12-31T23:59:59.999Z
 */
export function filterStateToParams(state: FilterState): URLSearchParams {
    const params = new URLSearchParams();

    for (const dim of DIMENSIONS) {
        const selected = state.selections[dim];
        if (!selected || selected.length === 0) continue;
        for (const val of selected) {
            params.append(`${PARAM_PREFIX}${dim}`, val);
        }
    }

    if (state.datePredicate) {
        const { from, to } = state.datePredicate;
        if (from !== undefined) {
            params.set(DATE_FROM_PARAM, from.toISOString());
        }
        if (to !== undefined) {
            params.set(DATE_TO_PARAM, to.toISOString());
        }
    }

    return params;
}

/**
 * Decodes a FilterState from URLSearchParams (inverse of filterStateToParams).
 *
 * Unknown or invalid filter values are silently dropped.
 */
export function filterStateFromParams(params: URLSearchParams): FilterState {
    const selections: Partial<Record<Dimension, string[]>> = {};

    for (const dim of DIMENSIONS) {
        const values = params
            .getAll(`${PARAM_PREFIX}${dim}`)
            .filter(isValidFilterValue);
        if (values.length > 0) {
            selections[dim] = values;
        }
    }

    let datePredicate: DatePredicate | undefined;
    const fromStr = params.get(DATE_FROM_PARAM);
    const toStr = params.get(DATE_TO_PARAM);

    if (fromStr !== null || toStr !== null) {
        datePredicate = {};
        if (fromStr !== null) {
            const d = new Date(fromStr);
            if (!isNaN(d.getTime())) datePredicate.from = d;
        }
        if (toStr !== null) {
            const d = new Date(toStr);
            if (!isNaN(d.getTime())) datePredicate.to = d;
        }
    }

    return { selections, datePredicate };
}
