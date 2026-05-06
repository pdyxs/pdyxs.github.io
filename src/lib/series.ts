export type StoryEntry = {
  id: string;
  data: {
    series: string;
    order: number;
    published?: boolean;
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

export function getSeriesSiblings<T extends StoryEntry>(
  entry: T,
  allEntries: T[],
  isDev: boolean
): SeriesSiblings<T> {
  const siblings = allEntries
    .filter(e => e.data.series === entry.data.series && (isDev || e.data.published !== false))
    .sort((a, b) => a.data.order - b.data.order);

  const idx = siblings.findIndex(e => e.id === entry.id);
  const current = idx + 1;
  const total = siblings.length;
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  return { siblings, prev, next, current, total };
}
