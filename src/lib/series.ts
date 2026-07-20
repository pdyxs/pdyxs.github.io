import { computeStatusVisibility } from './status-visibility';
import type { StatusValue } from './status-visibility';

export type StoryEntry = {
  id: string;
  data: {
    series: string;
    order: number;
    status?: StatusValue;
    date?: Date;
    title?: string;
  };
};

export type SeriesSiblings<T extends StoryEntry> = {
  siblings: T[];
  prev: T | undefined;
  next: T | undefined;
  current: number;
  total: number;
};

export type GetSeriesSiblingsOptions = {
  /** import.meta.env.DEV — bypasses hidden-chapter gating, mirroring computeStatusVisibility. */
  isDev: boolean;
  /** Caller-supplied clock, threaded through to computeStatusVisibility (kept explicit for purity). */
  now: Date;
};

/**
 * Resolves a story chapter's siblings within its series, skipping chapters
 * that aren't reachable (see computeStatusVisibility) so prev/next never
 * links to a 404 in production. This is the same shared visibility rule
 * every other collection uses — no stories-only branch.
 */
export function getSeriesSiblings<T extends StoryEntry>(
  entry: T,
  allEntries: T[],
  { isDev, now }: GetSeriesSiblingsOptions
): SeriesSiblings<T> {
  const siblings = allEntries
    .filter(e => e.data.series === entry.data.series &&
      computeStatusVisibility(e.data.status, e.data.date, { isDev, now }).reachable)
    .sort((a, b) => a.data.order - b.data.order);

  const idx = siblings.findIndex(e => e.id === entry.id);
  const current = idx + 1;
  const total = siblings.length;
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  return { siblings, prev, next, current, total };
}
