// Filter evaluation and URL serialisation layer.
//
// FilterState holds per-dimension selections. Matching is prefix-based:
// selecting `what:projects` returns cards tagged `what:projects` or
// `what:projects/*`.

/**
 * The five question axes a reader browses along (see the vault Glossary's
 * "5 W dimension"). Four of them root the content tree per DEC-004; `why` has
 * no content folder and exists only as declared tags. These five — and only
 * these — make a `dimension:value` string well-formed, which is why
 * isValidFilterValue binds here rather than to the wider dimension registry.
 */
export const FIVE_W_DIMENSIONS = ["who", "what", "when", "where", "why"] as const;
export type FiveWDimension = (typeof FIVE_W_DIMENSIONS)[number];

export type FilterState = {
    /** Selected tag prefixes per dimension, e.g. { what: ['what:projects'] } */
    selections: Partial<Record<FiveWDimension, string[]>>;
    /**
     * Null-dimension values (bare slugs with no `dimension:` prefix, e.g.
     * `science`). Match cards by exact tag equality — no hierarchy — and never
     * appear in the 5 W dimension bar.
     */
    tags?: string[];
    /**
     * Dev-only publish-lifecycle dimension (issue #52). Not a 5 W dimension and
     * not derived from the tag registry — a hardcoded chip set (see
     * status-visibility.ts's STATUS_VALUES) exact-matches CardMeta.status.
     * ANDs with dimension selections/null-dimension tags like any other.
     */
    status?: StatusValue;
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
    const dim = value.slice(0, colonIdx) as FiveWDimension;
    if (!FIVE_W_DIMENSIONS.includes(dim)) return false;
    // The part after the colon must be non-empty
    const rest = value.slice(colonIdx + 1);
    return rest.length > 0;
}

/**
 * Returns true for a valid dimensionless filter value — a non-empty slug with
 * no colon. A colon would make it a (mis-scoped) dimensioned value, so those
 * are rejected here.
 */
export function isValidDimensionlessValue(value: string): boolean {
    return value.length > 0 && !value.includes(":");
}

// ---------------------------------------------------------------------------
// Prefix matching
// ---------------------------------------------------------------------------

/**
 * Returns true if `tag` equals `prefix` or starts with `prefix + "/"`.
 *
 * Exception: a tag that is some *other* card's own path (a "card-backed
 * tag" — see cardOwnValues) is a direct link to that card, not a category
 * membership claim, so it only ever matches by exact equality — it must
 * never prefix-match into an ancestor filter.
 */
function tagMatchesPrefix(tag: string, prefix: string, cardBackedValues: Set<string>): boolean {
    if (tag === prefix) return true;
    if (cardBackedValues.has(tag)) return false;
    return tag.startsWith(prefix + "/");
}

// ---------------------------------------------------------------------------
// Filter application
// ---------------------------------------------------------------------------

import type { CardMeta } from "./cards";
import { cardOwnValues } from "./card-identity";
import { DEFAULT_BROWSE_LENS_ID } from "./lens-registry";
import { isStatusValue } from "./status-visibility";
import type { StatusValue } from "./status-visibility";

/**
 * Returns cards that match all active dimension selections.
 *
 * A card matches a dimension selection if it has at least one tag that prefix-
 * matches at least one of the selected values for that dimension. Every active
 * dimension ANDs with every other; values within one dimension OR.
 *
 * Date-range narrowing is expressed as derived `when:<era>/<year>/<month>` tags
 * (see filter-generators.ts), so it needs no separate predicate here.
 */
export function applyFilters(
    cards: CardMeta[],
    filterState: FilterState,
): CardMeta[] {
    const { selections, status } = filterState;
    const cardBackedValues = cardOwnValues(cards);

    return cards.filter((card) => {
        // Dev-only status dimension: exact match, ANDed with everything below.
        if (status && card.status !== status) return false;

        // Check each dimension that has active selections
        for (const dim of FIVE_W_DIMENSIONS) {
            const selected = selections[dim];
            if (!selected || selected.length === 0) continue;

            const tagsMatch = card.tags.some((tag) =>
                selected.some((sel) => tagMatchesPrefix(tag, sel, cardBackedValues)),
            );

            if (!tagsMatch) return false;
        }

        // Null dimension: exact-match, OR within the bucket, AND with the
        // dimension buckets above.
        const nullDimension = filterState.tags;
        if (nullDimension && nullDimension.length > 0) {
            if (!card.tags.some((tag) => nullDimension.includes(tag))) return false;
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
    // A colon-less value belongs to the null dimension — select it as such.
    if (colonIdx === -1) {
        const params = filterStateToParams({ selections: {}, tags: [tagValue] });
        return `${base}?${params.toString()}`;
    }
    const dim = tagValue.slice(0, colonIdx) as FiveWDimension;
    if (!(FIVE_W_DIMENSIONS as readonly string[]).includes(dim)) return base;
    const params = filterStateToParams({ selections: { [dim]: [tagValue] } });
    return `${base}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// URL encoding / decoding
// ---------------------------------------------------------------------------

const PARAM_PREFIX = "filter.";
const NULL_DIMENSION_PARAM = "filter";
const STATUS_PARAM = "status";

/**
 * Encodes a FilterState into URLSearchParams.
 *
 * The dimension already lives in the param key, so the redundant `<dim>:`
 * prefix is stripped from each value — `what:projects/games` under key
 * `filter.what` rides as just `projects/games`. This keeps the URL readable
 * (no percent-escaped `%3A` colon):
 *   filter.what=projects&filter.what=games
 *
 * Decoding re-adds the prefix; because a tag sub-value never itself contains a
 * colon (the dimension separator is the only one), the round-trip is
 * unambiguous and still accepts old fully-qualified `filter.what=what:games`
 * links.
 */
export function filterStateToParams(state: FilterState): URLSearchParams {
    const params = new URLSearchParams();

    for (const dim of FIVE_W_DIMENSIONS) {
        const selected = state.selections[dim];
        if (!selected || selected.length === 0) continue;
        const prefix = `${dim}:`;
        for (const val of selected) {
            const short = val.startsWith(prefix) ? val.slice(prefix.length) : val;
            params.append(`${PARAM_PREFIX}${dim}`, short);
        }
    }

    for (const tag of state.tags ?? []) {
        params.append(NULL_DIMENSION_PARAM, tag);
    }

    if (state.status !== undefined) {
        params.set(STATUS_PARAM, state.status);
    }

    return params;
}

/**
 * Decodes a FilterState from URLSearchParams (inverse of filterStateToParams).
 *
 * Unknown or invalid filter values are silently dropped.
 */
export function filterStateFromParams(params: URLSearchParams): FilterState {
    const selections: Partial<Record<FiveWDimension, string[]>> = {};

    for (const dim of FIVE_W_DIMENSIONS) {
        const prefix = `${dim}:`;
        const values = params
            .getAll(`${PARAM_PREFIX}${dim}`)
            // Re-add the dimension prefix stripped on encode. Fully-qualified
            // legacy values (already `<dim>:...`) pass through untouched.
            .map((v) => (v.startsWith(prefix) ? v : `${prefix}${v}`))
            .filter(isValidFilterValue);
        if (values.length > 0) {
            selections[dim] = values;
        }
    }

    const tags = params
        .getAll(NULL_DIMENSION_PARAM)
        .filter(isValidDimensionlessValue);

    const rawStatus = params.get(STATUS_PARAM);
    const status = isStatusValue(rawStatus) ? rawStatus : undefined;

    return { selections, ...(tags.length > 0 ? { tags } : {}), ...(status ? { status } : {}) };
}

/**
 * Removes every filter param from a copy of `params` — for landing on a lens
 * that can't accept filters (acceptsFilters: false), where a stray filter.*
 * query string would otherwise linger (e.g. carried forward by a lens
 * replacement, or briefly stale mid-navigation).
 */
export function stripFilterParams(params: URLSearchParams): URLSearchParams {
    const next = new URLSearchParams(params);
    for (const dim of FIVE_W_DIMENSIONS) {
        next.delete(`${PARAM_PREFIX}${dim}`);
    }
    next.delete(NULL_DIMENSION_PARAM);
    next.delete(STATUS_PARAM);
    return next;
}
