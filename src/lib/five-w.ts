// The 5 W dimensions and filter-value validation.
//
// A leaf module by design: matching, URL serialisation and the FilterState
// shape all live in src/dimensions/, which imports from here. Nothing in this
// file may import from there, or the registry would be circular.

/**
 * The five question axes a reader browses along (see the vault Glossary's
 * "5 W dimension"). Four of them root the content tree per DEC-004; `why` has
 * no content folder and exists only as declared tags. These five — and only
 * these — make a `dimension:value` string well-formed, which is why
 * isValidFilterValue binds here rather than to the wider dimension registry.
 */
export const FIVE_W_DIMENSIONS = ["who", "what", "when", "where", "why"] as const;
export type FiveWDimension = (typeof FIVE_W_DIMENSIONS)[number];

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
