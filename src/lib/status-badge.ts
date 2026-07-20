// Pure decision logic for the dev-only status badge (issue #51). Computes
// what a card's status pill should say from its `status`/`date` — a
// generic status string + date pair is all that's needed, so this works
// today for `draft` (#46, merged) and is already correct for `scheduled`,
// `unlisted`, `archived` once #47/#48 land real cards in those states.
//
// The DEV gate itself is NOT here — it's a thin conditional at each call
// site (CardHeader.astro, BrowseCard.svelte), same split as
// computeStatusVisibility/isDev in status-visibility.ts. Keeping it out of
// this function keeps it pure and directly testable without stubbing
// import.meta.env.

import type { StatusValue } from './status-visibility';

export type StatusBadge = {
  status: Exclude<StatusValue, 'published'>;
  label: string;
  /** Only set for `scheduled`: the formatted date to show alongside the label. */
  dateLabel?: string;
};

const STATUS_LABELS: Record<Exclude<StatusValue, 'published'>, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  unlisted: 'Unlisted',
  archived: 'Archived',
};

/** Same date shape used elsewhere for card metadata (e.g. BrowseCard's own `<time>`). */
export function formatBadgeDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Resolves a card's status pill: `published` (or an absent status) shows no
 * pill at all (returns null). Every other status shows its label;
 * `scheduled` additionally carries a formatted `dateLabel` when a date is
 * available, per the "scheduled always shows its date" rule.
 */
export function computeStatusBadge(
  status: StatusValue | undefined,
  date: Date | undefined
): StatusBadge | null {
  if (!status || status === 'published') return null;

  const badge: StatusBadge = { status, label: STATUS_LABELS[status] };
  if (status === 'scheduled' && date) {
    badge.dateLabel = formatBadgeDate(date);
  }
  return badge;
}
