// Puzzle difficulty: one authored string, three renderings.
//
// Logic Masters Deutschland rates a puzzle 1–5 and words it "Level 3 (Medium)",
// which is how it arrives in frontmatter. That string is the source of truth —
// it's what the LMD page says, and it round-trips if a puzzle is re-rated — but
// it isn't what a reader wants to read, and it sorts alphabetically, which puts
// Level 5 next to Level 1.
//
// So the level is parsed out once, here, and everything downstream renders it
// as a star rating: the card's credits row, the filter value it generates, and
// that value's label in the panel.
//
// Pure: no Astro, no fs, no DOM. Imported by the plain-node manifest script
// (via filter-generators.ts) as well as by SSR.

/** Ratings run 1–5, matching LMD's scale. */
export const MAX_DIFFICULTY = 5;

const FILLED_STAR = '★';
const EMPTY_STAR = '☆';

/** The `what:` filter value a level maps to, e.g. `what:puzzles/level-3`. */
export function difficultyTagValue(level: number): string {
  return `what:puzzles/level-${level}`;
}

/** The level a generated difficulty filter value carries, or undefined if it isn't one. */
export function difficultyLevelFromTag(value: string): number | undefined {
  const match = /^what:puzzles\/level-([1-5])$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

/**
 * The rating in an authored difficulty string.
 *
 * Accepts LMD's own wording ("Level 3 (Medium)"), a bare level ("Level 3"), and
 * a bare number ("3") — the last two because frontmatter is hand-edited in
 * Obsidian and the parenthetical is the easiest part to drop. Anything else,
 * including an out-of-range level, returns undefined: the caller falls back to
 * showing the authored text as written rather than inventing a rating.
 */
export function parseDifficultyLevel(difficulty: string | undefined): number | undefined {
  if (!difficulty) return undefined;
  const match = /^(?:level\s*)?([1-5])\b/i.exec(difficulty.trim());
  return match ? Number(match[1]) : undefined;
}

/** A level as filled/empty stars, e.g. 3 → "★★★☆☆". */
export function formatDifficultyStars(level: number): string {
  const filled = Math.max(0, Math.min(MAX_DIFFICULTY, Math.round(level)));
  return FILLED_STAR.repeat(filled) + EMPTY_STAR.repeat(MAX_DIFFICULTY - filled);
}

/** Spoken form of a rating, for the `aria-label` on the stars. */
export function difficultyAriaLabel(level: number): string {
  return `Difficulty ${level} out of ${MAX_DIFFICULTY}`;
}
