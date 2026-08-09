/**
 * The one place a card's dateline is decided and formatted.
 *
 * Nearly every card carries a `date:` — it feeds the `when:` tag generator and
 * sort order — so date *presence* says nothing about whether a date should be
 * shown. What differs is whether the date means anything to a reader: a post's
 * date is a publication date, a game's is a release date that reads wrong under
 * the same wording, and a contact card's is neither.
 *
 * So the switch is the label, not a boolean: a folder declares `dateLabel:` in
 * its `_config.yaml` (cascading nearest-wins like `renderer`) to say both *that*
 * its cards are dated things and *what* their date means. No label, no dateline.
 * The reserved value "none" suppresses an inherited label in a subfolder,
 * mirroring the `location`/`era` override knobs.
 */

/** Reserved `dateLabel` value: suppress a label inherited from an ancestor folder. */
export const DATE_LABEL_NONE = 'none';

export type Dateline = {
  /** The declared meaning of the date — "Published", "Released", … */
  label: string;
  /** Human-readable date, e.g. "9 Aug 2026". */
  text: string;
  /** Machine-readable value for <time datetime>. */
  iso: string;
};

/**
 * Formats a card date for display. Matches BrowseCard's listing format so a
 * card reads the same date string in a browse result and on its own header.
 */
export function formatCardDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Decides whether a card shows a dateline, and what it says. Pure: both inputs
 * are already resolved onto the card by resolveCard().
 */
export function resolveDateline(
  dateLabel: string | undefined,
  date: Date | undefined,
): Dateline | null {
  if (!dateLabel || dateLabel === DATE_LABEL_NONE) return null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return {
    label: dateLabel,
    text: formatCardDate(date),
    iso: date.toISOString(),
  };
}
