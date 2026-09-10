/**
 * How much of a card a `BrowseCard` preview shows (issue #130).
 *
 * A leaf module on purpose: `home-slots.ts` imports it, and that module is in
 * turn imported by `scripts/generate-lens-registry.mjs`, which carries an
 * explicit rule that it must not reach `lens-registry.ts` or anything that
 * does. So nothing here may import anything but types.
 *
 * The record holds booleans plus the two numbers that are hardcoded literals
 * in `BrowseCard.svelte` today — the `4` handed to `computeCardTagDisplay` and
 * the `-webkit-line-clamp: 3`. Both are exactly what a narrow rail column
 * wants different from a full-width row, and this record is the first place
 * either has ever had to live.
 *
 * The record drives *which* elements render; CSS drives how they look. The
 * clamp reads `--browse-card-desc-lines` rather than living in a per-variant
 * block, so a future variant needs no matching CSS for a number the record
 * already holds.
 */

export type BrowseCardVariant = {
  /** Render the 16/9 header banner. */
  thumb: boolean;
  /** Render the dateline in the header's meta group. */
  date: boolean;
  /** Render the tag chip row. */
  tags: boolean;
  /** How many chips before the `+N` overflow pill. 0 when `tags` is false. */
  tagLimit: number;
  /** `-webkit-line-clamp` on the description, via --browse-card-desc-lines. */
  descriptionLines: number;
  /**
   * Floor for the card's INTERIOR — `.browse-card-content`, the padded box
   * below the banner — so a placeholder can hold exactly its space
   * (issue #133).
   *
   * The banner is deliberately not in this number. It is `aspect-ratio: 16/9`,
   * so its height is a function of the card's width and no absolute floor can
   * express it; the placeholder draws its own 16/9 band above the pinned
   * interior instead and the two agree by construction.
   *
   * These are MEASURED, not guessed, and `browse-card-variants.test.ts`
   * asserts each one against what `BrowseCard` actually renders for that
   * variant. Derived in CSS it would be a `calc()` over a line-height and two
   * paddings that no test can read — and a floor disagreeing with the card it
   * holds space for is precisely the bug the placeholder exists to prevent.
   */
  minHeight: string;
};

export const BROWSE_CARD_VARIANTS = {
  full:  { thumb: true,  date: true,  tags: true,  tagLimit: 4, descriptionLines: 3, minHeight: '10.682rem' },
  brief: { thumb: false, date: false, tags: false, tagLimit: 0, descriptionLines: 2, minHeight: '7.33rem' },
} as const satisfies Record<string, BrowseCardVariant>;

export type BrowseCardVariantName = keyof typeof BROWSE_CARD_VARIANTS;

export const BROWSE_CARD_VARIANT_NAMES = Object.keys(
  BROWSE_CARD_VARIANTS,
) as BrowseCardVariantName[];

/** The variant a card renders as when it asks for none. */
export const DEFAULT_BROWSE_CARD_VARIANT: BrowseCardVariantName = 'full';

/**
 * Unknown or absent name -> `full`. The runtime half of the closed TS union:
 * every *authoring* path validates the name at generation time (see
 * `home-slots.ts`), so an unrecognised `variant:` in YAML is a build error
 * rather than a silent fallback. This fallback is for the runtime path alone —
 * a prop arriving from a call site that passes nothing.
 */
export function resolveBrowseCardVariant(name: string | undefined): BrowseCardVariant {
  if (name && name in BROWSE_CARD_VARIANTS) {
    return BROWSE_CARD_VARIANTS[name as BrowseCardVariantName];
  }
  return BROWSE_CARD_VARIANTS[DEFAULT_BROWSE_CARD_VARIANT];
}
