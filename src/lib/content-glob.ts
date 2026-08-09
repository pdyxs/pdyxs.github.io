import { FIVE_W_DIMENSIONS } from "./five-w.ts";

/**
 * The glob the content collection is loaded with (see src/content.config.ts).
 *
 * Everything it matches under src/content becomes a card, so it is also the
 * gate that keeps non-card files out of the site. src/content is an Obsidian
 * vault root (issue #54), so it carries vault infrastructure that must never
 * load: `_templates/` (Templater scaffolds), `.obsidian/` (vault config,
 * rewritten constantly while the vault is open) and `.trash/` (soft-deleted
 * cards, still full markdown).
 *
 * **It must be a single positive pattern — never an array with a `!` exclude.**
 * Astro's glob loader matches with two different engines. The initial scan uses
 * tinyglobby, which reads `["**\/*.md", "!**\/_*\/**"]` as include-then-exclude.
 * The dev watcher then re-matches every changed file with bare
 * `picomatch.isMatch(entry, pattern)`, which ORs an array instead: a path is
 * "matched" if it satisfies *any* element, and a negated element is satisfied by
 * everything it doesn't exclude. So the exclude turned into a wildcard include,
 * and any file touched under src/content — `.obsidian/workspace.json` above all
 * — got loaded as a card mid-session (uid `obsidian/workspace`), appearing in
 * the audit lens until the next cold start. Excluding by *not matching* is the
 * only form both engines agree on.
 *
 * The dimension roots are the positive form of that exclusion: per DEC-004
 * every card path starts with a 5 W dimension folder, so anchoring there rejects
 * `.obsidian/`, `.trash/` and `_templates/` by construction rather than by
 * listing them. (`why` has no content folder yet; an unmatched brace member is
 * harmless.) `[^_.]` on the filename keeps dot- and underscore-prefixed
 * markdown out of a dimension folder too.
 *
 * That class is spelled `[^_.]`, not the POSIX `[!_.]`, for the same
 * two-engines reason: picomatch does not implement `[!…]` — it compiles it to
 * the literal alternation `(?:\[!_\]|[!_])` — so the old `**\/[!_]*.{md,mdx}`
 * matched *nothing* on a watcher event, leaving the broken exclude as the only
 * element that could match. tinyglobby accepts both spellings.
 */
export const CONTENT_GLOB_PATTERN = `{${FIVE_W_DIMENSIONS.join(",")}}/**/[^_.]*.{md,mdx}`;

/**
 * Whether a path under src/content is vault infrastructure rather than content.
 *
 * The build scripts that walk src/content themselves (generate-stack-manifest,
 * generate-redirects) can't use CONTENT_GLOB_PATTERN: they legitimately consume
 * `tag/*.yaml`, which is not under a dimension root and so isn't a card. They
 * need the *other* half of the pattern's job — the exclusion — on its own.
 *
 * Both `_` and `.` prefixes count, on any segment. Underscore is the authored
 * convention (`_templates/`, `_config.yaml`); dot is Obsidian's (`.obsidian/`
 * rewritten on every pane change, `.trash/` holding soft-deleted cards that are
 * still intact markdown). Missing the dot case let `.trash/` into the manifests,
 * where it was assigned permanent uid codes.
 *
 * Accepts either separator so callers can pass a raw `path.relative()` result.
 */
export function isVaultInfrastructurePath(relPath: string): boolean {
  return relPath
    .split(/[\\/]/)
    .some(segment => segment.startsWith("_") || segment.startsWith("."));
}
