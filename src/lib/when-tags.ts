import type { WhenEra } from '../data/when-eras';

/**
 * Normalise a Date to plain UTC YYYY / MM / YYYY-MM-DD parts, so range
 * comparison isn't tripped up by time-of-day offsets (mirrors where-tags.ts).
 */
function dateParts(date: Date): { yyyy: string; mm: string; dateStr: string } {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return { yyyy, mm, dateStr: `${yyyy}-${mm}-${dd}` };
}

/**
 * The era slug whose inclusive range covers `date`, or null if the date falls
 * outside every era (before the earliest baseline). The era list is scanned in
 * order and assumed non-overlapping.
 */
export function eraSlugForDate(date: Date, eras: WhenEra[]): string | null {
  const { dateStr } = dateParts(date);
  for (const era of eras) {
    if (dateStr < era.from) continue;                      // before this era starts
    if (era.to !== null && dateStr > era.to) continue;     // after this era ends
    return era.slug;
  }
  return null;
}

/**
 * The derived `when:<era>/<yyyy>/<mm>` leaf tag for a card's date, or null when
 * the date resolves to no era. Only the leaf is returned — the panel and the
 * short-code manifest synthesise the `when:<era>` / `when:<era>/<yyyy>` ancestors.
 */
export function deriveWhenTag(date: Date, eras: WhenEra[]): string | null {
  const era = eraSlugForDate(date, eras);
  if (era === null) return null;
  const { yyyy, mm } = dateParts(date);
  return `when:${era}/${yyyy}/${mm}`;
}

/**
 * Every `when:<era>/<yyyy>/<mm>` leaf the generator could ever emit, from the
 * earliest era's start year through `currentYear` inclusive. This is a superset
 * of what's actually present on content (empty months are filtered back out of
 * the panel by declaredGeneratedFilterValues); it exists so the short-code
 * manifest can assign compact URL codes to every emittable value.
 *
 * `currentYear` is injected (not read from `new Date()` here) to keep this
 * module pure and deterministically testable.
 */
export function enumerateWhenTags(eras: WhenEra[], currentYear: number): string[] {
  if (eras.length === 0) return [];
  const startYear = Math.min(...eras.map(era => Number(era.from.slice(0, 4))));
  const out: string[] = [];
  for (let year = startYear; year <= currentYear; year++) {
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0');
      // Look up mid-month so the probe lands squarely inside a range regardless
      // of era boundaries (which are year-aligned in practice).
      const era = eraSlugForDate(new Date(`${year}-${mm}-15T00:00:00.000Z`), eras);
      if (era === null) continue;
      out.push(`when:${era}/${year}/${mm}`);
    }
  }
  return out;
}
