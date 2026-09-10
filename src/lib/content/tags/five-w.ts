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

// ---------------------------------------------------------------------------
// Authored form → canonical form
// ---------------------------------------------------------------------------

/**
 * Rewrites the *authored* tag form into the canonical `dimension:value` form.
 *
 * Content authors write `where/work/seethrough`, not `where:work/seethrough`,
 * because `src/content` is an Obsidian vault and `tags` is one of Obsidian's
 * reserved frontmatter keys: it rejects `:` outright ("invalid tag name"),
 * which cost autocomplete, the tag pane and tag search on every dimensioned
 * tag. `/` is what Obsidian uses for nested tags, so the authored form is both
 * valid *and* renders the dimension hierarchy in the tag pane for free — and,
 * having no colon, it no longer needs YAML quoting.
 *
 * Everything downstream of the schema keeps the colon: it is the canonical
 * form in URLs, generated data (`src/data/*.generated.ts`), lens/tag YAML,
 * `stack-manifest.json` and every `indexOf(':')` split site. This function is
 * the *only* boundary between the two, and is applied in exactly two places —
 * the `tags` field in `src/content.config.ts` and the `_config.yaml` cascade
 * in `resolveFolderCascade`. Anything reading raw frontmatter without going
 * through those sees the authored form.
 *
 * Conversion happens only when the first `/`-segment is a known dimension and
 * something follows it. So bare tags pass through untouched — including ones
 * that collide with a dimension name (`why` is an authored tag) — as does a
 * value that already carries a colon.
 */
export function normaliseAuthoredTag(value: string): string {
    if (value.includes(":")) return value;
    const slashIdx = value.indexOf("/");
    if (slashIdx === -1) return value;
    const dim = value.slice(0, slashIdx) as FiveWDimension;
    if (!FIVE_W_DIMENSIONS.includes(dim)) return value;
    const rest = value.slice(slashIdx + 1);
    if (rest.length === 0) return value;
    return `${dim}:${rest}`;
}

/** normaliseAuthoredTag over a list. */
export function normaliseAuthoredTags(values: string[]): string[] {
    return values.map(normaliseAuthoredTag);
}
