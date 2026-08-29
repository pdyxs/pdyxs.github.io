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
    /** The in-world/trip date this chapter depicts — see computeSeriesDateBar. */
    storyDate?: Date;
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

export type SeriesDateBarCell = {
  /** Day of month, UTC. */
  day: number;
  /** yyyy-mm-dd, UTC. */
  iso: string;
  /** Whether this is the chapter currently being viewed. */
  active: boolean;
  /** The (first, by order) sibling with a `storyDate` on this day — absent
   * for the active cell (it never links to itself) and for gap days with no
   * chapter. */
  uid?: string;
};

export type SeriesDateBarMonth = {
  /** e.g. "Jun 2018". */
  label: string;
  /** How many leading cells this month's header spans. */
  span: number;
};

export type SeriesDateBar = {
  months: SeriesDateBarMonth[];
  cells: SeriesDateBarCell[];
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function monthLabel(date: Date): string {
  return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Builds a calendar-style date bar spanning a series' `storyDate` range —
 * every day from the earliest to the latest dated chapter (inclusive), so a
 * gap between chapters shows as a gap rather than compressing the timeline.
 * All arithmetic is UTC: `storyDate` is authored as a bare `yyyy-mm-dd`,
 * which zod's date coercion parses as UTC midnight, and local-time getters
 * would shift cells by a day depending on the build machine's timezone.
 *
 * Returns null when the entry itself has no `storyDate` (most chapters, and
 * every chapter in a series with no trip dates at all — see `dateBar` on
 * ResolvedCard, the switch for whether this is even called).
 */
export function computeSeriesDateBar<T extends StoryEntry>(
  entry: T,
  allEntries: T[],
  options: GetSeriesSiblingsOptions
): SeriesDateBar | null {
  const activeDate = entry.data.storyDate;
  if (!activeDate) return null;

  const { siblings } = getSeriesSiblings(entry, allEntries, options);
  const dated = siblings.filter((s): s is T & { data: { storyDate: Date } } => !!s.data.storyDate);
  if (dated.length === 0) return null;

  // First sibling (by order — `siblings` is already order-sorted) claims a
  // shared date's link target, so two chapters on the same day don't fight.
  const firstByIso = new Map<string, T>();
  for (const s of dated) {
    const iso = toIsoDate(s.data.storyDate);
    if (!firstByIso.has(iso)) firstByIso.set(iso, s);
  }

  const activeIso = toIsoDate(activeDate);
  const times = dated.map(s => s.data.storyDate.getTime());
  const start = new Date(Math.min(...times));
  const end = new Date(Math.max(...times));

  const months: SeriesDateBarMonth[] = [];
  const cells: SeriesDateBarCell[] = [];

  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const iso = toIsoDate(cursor);
    const label = monthLabel(cursor);
    const last = months[months.length - 1];
    if (last?.label === label) last.span += 1;
    else months.push({ label, span: 1 });

    const match = firstByIso.get(iso);
    cells.push({
      day: cursor.getUTCDate(),
      iso,
      active: iso === activeIso,
      uid: match && iso !== activeIso ? match.id : undefined,
    });

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return { months, cells };
}
