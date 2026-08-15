// A folder's declared sort — the fifth rung of the ranking comparator
// (see ranking.ts, issue #80).
//
// `sort: difficulty asc` in a `_config.yaml` says how the cards *of that
// folder* order among themselves. It cascades nearest-wins like `renderer`
// (unlike `priority`, which accumulates — see priority.ts), and it only ever
// fires between two cards that share a folder: results are not grouped by
// folder, but boosting a folder clusters its cards, and adjacency is exactly
// when this rung applies.
//
// A key alone is not enough — "sort by date" leaves the interesting half
// unsaid — so a declaration is a key AND a direction, and a key written on its
// own resolves to that key's natural direction (newest posts first, easiest
// puzzles first).
//
// Pure: no fs, no Astro. Difficulty is not re-parsed here; parseDifficultyLevel
// (difficulty.ts) already owns that string and this is its fourth consumer.

import { parseDifficultyLevel } from './difficulty.ts';

/** The fields a folder may order its cards by. */
export const SORT_KEYS = ['date', 'difficulty', 'order', 'title'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SortDirection = 'asc' | 'desc';

/** A folder's declared sort: what to order by, and which way. */
export type FolderSort = {
  key: SortKey;
  direction: SortDirection;
};

/**
 * What a folder that declares nothing gets. Recency, which is what the site
 * sorted by everywhere before folders could say otherwise.
 */
export const DEFAULT_FOLDER_SORT: FolderSort = { key: 'date', direction: 'desc' };

/**
 * The direction a key means when written without one. Dates read newest-first
 * ("what's recent"); a difficulty, a sequence number and a title all read
 * smallest-first.
 */
const NATURAL_DIRECTION: Record<SortKey, SortDirection> = {
  date: 'desc',
  difficulty: 'asc',
  order: 'asc',
  title: 'asc',
};

function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

/**
 * Parses a `_config.yaml` `sort:` declaration ("difficulty asc", "title").
 *
 * Returns undefined for anything unrecognised, which the cascade treats as "not
 * declared here" — a typo therefore falls back to the inherited (or default)
 * sort rather than throwing a build.
 */
export function parseFolderSort(raw: unknown): FolderSort | undefined {
  if (typeof raw !== 'string') return undefined;
  const [rawKey, rawDirection, ...rest] = raw.trim().toLowerCase().split(/\s+/);
  if (rest.length > 0) return undefined;
  if (!rawKey || !isSortKey(rawKey)) return undefined;
  if (rawDirection !== undefined && rawDirection !== 'asc' && rawDirection !== 'desc') return undefined;
  return { key: rawKey, direction: rawDirection ?? NATURAL_DIRECTION[rawKey] };
}

/**
 * The fields a sort value can be read from — a structural subset of a card's
 * frontmatter, so this is callable on a plain object in a test.
 */
export type SortableFields = {
  date?: Date;
  /** Authored difficulty string ("Level 3 (Medium)") — parsed, never compared raw. */
  difficulty?: string;
  order?: number;
  title?: string;
};

/**
 * Resolves the one comparable value a card contributes to its folder's sort.
 *
 * Resolved at build so the comparator never has to know what `difficulty`
 * means, and so the client payload carries one primitive rather than four
 * fields it would only use one of. Undefined means "this card has no value for
 * that key", and sorts last in both directions.
 */
export function resolveSortValue(key: SortKey, fields: SortableFields): number | string | undefined {
  switch (key) {
    case 'date':
      return fields.date?.getTime();
    case 'difficulty':
      return parseDifficultyLevel(fields.difficulty);
    case 'order':
      return typeof fields.order === 'number' ? fields.order : undefined;
    case 'title':
      // Compared with localeCompare below, so the raw title is the value.
      return fields.title || undefined;
  }
}

/**
 * Compares two resolved sort values under a direction.
 *
 * Missing values sort last whichever way the direction points: an undeclared
 * difficulty is not "difficulty zero", and flipping to `desc` should not
 * promote every card that failed to say.
 */
export function compareSortValues(
  a: number | string | undefined,
  b: number | string | undefined,
  direction: SortDirection,
): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  const diff =
    typeof a === 'string' || typeof b === 'string'
      ? String(a).localeCompare(String(b))
      : a - b;
  return direction === 'desc' ? -diff : diff;
}
