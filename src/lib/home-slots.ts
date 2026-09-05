/**
 * The home lens's slot layout: schema, normalisation and the two tier
 * resolvers (issues #131, #132).
 *
 * A LEAF module. It imports zod, `browse-card-variants.ts` and types only,
 * because `scripts/generate-lens-registry.mjs` imports `parseHomeSlots` and
 * that script carries an explicit rule that it must not import
 * `lens-registry.ts` or anything that does — it would depend on the file it
 * generates. `frontpage.ts` is disqualified as this code's home for exactly
 * that reason: it imports DEFAULT_BROWSE_LENS_ID.
 *
 * The generator validates AND normalises, baking the normalised slots into
 * `lenses.generated.ts`. Validate-at-generation but normalise-at-runtime would
 * put the defaults in two places and make the generated file show the author's
 * YAML rather than what actually renders.
 */

import { z } from 'astro/zod';
import type { FilterState } from '../dimensions';
import { BROWSE_CARD_VARIANT_NAMES, DEFAULT_BROWSE_CARD_VARIANT } from './browse-card-variants.ts';
import type { BrowseCardVariantName } from './browse-card-variants.ts';

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

/**
 * The two authorable tiers. Mobile is deliberately absent and NOT authorable:
 * the base CSS rules are a literal `span 12` / `span 1`. A slot that could be
 * half-width at 500px would re-litigate the crop-vs-reflow line the card stack
 * owns at 681px, and `span: { mobile: 6 }` is exactly the request that would
 * arrive later and be refused — better it is unrepresentable.
 */
export type SlotTiers = { small: number; large: number };

/** Declared form of a tiered value: one scalar for both tiers, or a mapping. */
export type DeclaredTiers = number | { small?: number; large?: number };

/** A slot that declares no `span` is full width at every tier. */
export const DEFAULT_SLOT_SPAN = 12;
/** A slot that declares no `rows` is one row tall at every tier. */
export const DEFAULT_SLOT_ROWS = 1;

/**
 * Cascades a declared tiered value upward, mobile-first.
 *
 * | declared      | result                              |
 * |---------------|-------------------------------------|
 * | `undefined`   | `{ small: base, large: base }`       |
 * | `n`           | `{ small: n, large: n }`             |
 * | `{ small }`   | large inherits small                 |
 * | `{ large }`   | small falls back to the base         |
 *
 * `resolveSlotSpans` and `resolveSlotRows` are the same function shape by
 * design: two keys sitting beside each other in the same slot must not read
 * differently.
 */
function resolveTiers(declared: DeclaredTiers | undefined, base: number): SlotTiers {
  if (declared === undefined) return { small: base, large: base };
  if (typeof declared === 'number') return { small: declared, large: declared };
  const small = declared.small ?? base;
  return { small, large: declared.large ?? small };
}

export function resolveSlotSpans(declared?: DeclaredTiers): SlotTiers {
  return resolveTiers(declared, DEFAULT_SLOT_SPAN);
}

export function resolveSlotRows(declared?: DeclaredTiers): SlotTiers {
  return resolveTiers(declared, DEFAULT_SLOT_ROWS);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const spanValue = z.number().int().min(1).max(12);
const spanSchema = z.union([
  spanValue,
  z.object({ small: spanValue.optional(), large: spanValue.optional() }).strict(),
]);

const rowsValue = z.number().int().positive();
const rowsSchema = z.union([
  rowsValue,
  z.object({ small: rowsValue.optional(), large: rowsValue.optional() }).strict(),
]);

/**
 * One authored slot.
 *
 * `.strict()` is load-bearing, for the reason CLAUDE.md already records twice
 * (`priorty:`, `imagePadding:`): zod STRIPS unknown keys silently, so `spann: 4`
 * would be a slot that quietly ignores its own layout.
 *
 * There is no `type:` key. `uid:` and `filter:` already say which kind a slot
 * is; `type:` is authoring noise that can contradict the keys beneath it. It is
 * validated as one object schema plus a refinement rather than a zod union — a
 * union you have to narrow isn't folded, and one object yields a single TS type.
 *
 * `side` is a one-member enum rather than `rail: true`, so `side: left` is a
 * validation error rather than a silent no-op, and the enum extends later
 * without a rename.
 */
const slotSchema = z
  .object({
    uid: z.string().optional(),
    filter: z.record(z.string(), z.array(z.string())).optional(),
    pool: z.number().int().positive().optional(),
    span: spanSchema.optional(),
    rows: rowsSchema.optional(),
    side: z.literal('right').optional(),
    // An unrecognised `variant:` is a GENERATION-time error, not a silent
    // render-time fallback (#130). resolveBrowseCardVariant's fallback exists
    // for the runtime path only.
    variant: z.enum(BROWSE_CARD_VARIANT_NAMES as [string, ...string[]]).optional(),
    label: z.string().optional(),
    seeMore: z.boolean().optional(),
  })
  .strict();

type AuthoredSlot = z.infer<typeof slotSchema>;

const configSchema = z.object({ slots: z.array(slotSchema) }).strict();

// ---------------------------------------------------------------------------
// Normalised output — what gets baked into lenses.generated.ts
// ---------------------------------------------------------------------------

export type NormalisedSlot = {
  /** Set on a pinned slot; mutually exclusive with `filter`. */
  uid?: string;
  /** Set on a filter slot; mutually exclusive with `uid`. */
  filter?: FilterState;
  /**
   * How many of this slot's TOP-RANKED cards the day-seed picks between.
   *
   * Deliberately NOT defaulted here: DEFAULT_SLOT_POOL lives in
   * `slot-selection.ts`, which pulls in `ranking`, `card-view-state` and
   * `cards` — importing it would cost this module its leaf status.
   * `frontpage.ts` passes `undefined` straight through to `selectSlotCard`,
   * which defaults it. One default, one place.
   */
  pool?: number;
  span: SlotTiers;
  rows: SlotTiers;
  side: 'main' | 'right';
  variant: BrowseCardVariantName;
  label?: string;
  seeMore: boolean;
};

/** Hand-written, slot-numbered message — naming the mistake was #129's
 * deciding criterion for validating here at all. */
function slotError(index: number, message: string): Error {
  return new Error(`home.lens.yaml: slot ${index + 1} ${message}`);
}

function normaliseSlot(slot: AuthoredSlot, index: number): NormalisedSlot {
  const hasUid = slot.uid !== undefined;
  const hasFilter = slot.filter !== undefined;

  if (hasUid === hasFilter) {
    throw slotError(
      index,
      hasUid
        ? 'declares both `uid:` and `filter:` — a slot is one or the other'
        : 'declares neither `uid:` nor `filter:` — every slot needs exactly one',
    );
  }
  if (!hasFilter && slot.seeMore !== undefined) {
    throw slotError(index, 'declares `seeMore:` on a `uid:` slot, which has no filter to point at');
  }
  if (!hasFilter && slot.pool !== undefined) {
    throw slotError(index, 'declares `pool:` on a `uid:` slot, which selects no card');
  }

  return {
    ...(hasUid ? { uid: slot.uid } : {}),
    ...(hasFilter ? { filter: slot.filter as FilterState } : {}),
    ...(slot.pool !== undefined ? { pool: slot.pool } : {}),
    span: resolveSlotSpans(slot.span),
    rows: resolveSlotRows(slot.rows),
    side: slot.side ?? 'main',
    variant: (slot.variant ?? DEFAULT_BROWSE_CARD_VARIANT) as BrowseCardVariantName,
    ...(slot.label !== undefined ? { label: slot.label } : {}),
    seeMore: slot.seeMore ?? false,
  };
}

/**
 * Validates and normalises the home lens's `config` block.
 *
 * `span: 12` / `rows: 1` as defaults mean an unmodified slot list renders as
 * today's stacked single column — the layout feature is opt-in per slot.
 *
 * Throws on any authoring mistake, with the offending slot's 1-based number in
 * the message. Called from `scripts/generate-lens-registry.mjs`, so a slip
 * fails the build rather than rendering a silently-wrong front page.
 */
export function parseHomeSlots(config: unknown): NormalisedSlot[] {
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) {
    // zod paths are `slots.<i>.<key>`; surface the slot number the same way the
    // hand-written refinements do so every message reads alike.
    const issues = parsed.error.issues
      .map(issue => {
        const [, index, ...rest] = issue.path;
        const where = typeof index === 'number' ? `slot ${index + 1}` : 'config';
        const key = rest.length > 0 ? ` (\`${rest.join('.')}\`)` : '';
        return `${where}${key}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`home.lens.yaml: ${issues}`);
  }
  return parsed.data.slots.map(normaliseSlot);
}
