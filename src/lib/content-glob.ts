/**
 * The glob the content collection is loaded with (see src/content.config.ts).
 *
 * Everything it matches under src/content becomes a card, so it is also the
 * gate that keeps non-card markdown out of the site. The content vault (issue
 * #54) puts Templater scaffolds in `_templates/`, which must never be loaded.
 */
export const CONTENT_GLOB_PATTERN = [
    "**/[!_]*.{md,mdx}",
    // `[!_]` only guards the file's own name — without this, `_templates/card.md`
    // is still a match because `**/` happily traverses the underscored folder.
    "!**/_*/**",
];
