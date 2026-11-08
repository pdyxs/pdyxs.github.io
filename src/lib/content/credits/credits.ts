/**
 * Card credits: the pure decisions behind the "made by …" line and the full
 * listing. No Astro, fs or DOM imports — `resolveCard()` normalises the
 * authored `credits:` block into `Credit[]`, `CardStackCard` turns that into the
 * plain-data view the `CreditsSection` island takes.
 */

/** `map` credits count toward the line (and later the map); `listing` ones show in the full listing only. */
export const CREDIT_LISTED = ['map', 'listing'] as const;
export type CreditListed = (typeof CREDIT_LISTED)[number];

/** One normalised credit. Empty authored strings are already gone: absent means absent. */
export type Credit = {
  name: string;
  person?: string;
  role?: string;
  group?: string;
  note?: string;
  listed: CreditListed;
};

/**
 * Two credits are the same person if they share `person`, otherwise the exact
 * same `name`. The prefix keeps a slug from colliding with someone's name.
 */
export function creditIdentity(credit: Credit): string {
  return credit.person ? `person:${credit.person}` : `name:${credit.name}`;
}

export type MadeByLine = { names: string[] } | { count: number };

/** The people the line counts: map-listed, distinct by identity, first appearance wins the name. */
function mapPeople(credits: Credit[]): Credit[] {
  const seen = new Set<string>();
  return credits.filter(c => {
    if (c.listed !== 'map') return false;
    const id = creditIdentity(c);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** One to three people are named; more are counted. */
export function madeByLine(credits: Credit[]): MadeByLine {
  const people = mapPeople(credits);
  return people.length <= 3 ? { names: people.map(p => p.name) } : { count: people.length };
}

/** The site owner's person slug. Matched by slug, never by display name. */
export const OWNER_PERSON = 'me';

/** Distinct map-listed people other than the site owner. */
export function otherPeople(credits: Credit[]): Credit[] {
  return mapPeople(credits).filter(c => c.person !== OWNER_PERSON);
}

export type TeamSize = 'none' | 'small' | 'large';

/**
 * The team-size bucket for the Collaborators filter. A card with credits is
 * bucketed by how many others they name (0 none, 1-4 small, 5+ large); one
 * without is `none` only if flagged `solo`, else `undefined` (unknown, not solo).
 * `solo` alongside credits naming others is a contradiction the audit reports;
 * the credits win here.
 */
export function teamSizeBucket(credits: Credit[] | undefined, solo: boolean | undefined): TeamSize | undefined {
  if (!credits) return solo ? 'none' : undefined;
  const n = otherPeople(credits).length;
  return n === 0 ? 'none' : n <= 4 ? 'small' : 'large';
}

export type CreditListingEntry = { name: string; note?: string };
export type CreditListingRow = { role?: string; entries: CreditListingEntry[] };
export type CreditListingSection = { heading?: string; rows: CreditListingRow[] };

/**
 * The full listing: every credit, `listing`-only ones included, grouped by
 * `group` and then `role`, each in order of first appearance.
 */
export function creditListing(credits: Credit[]): CreditListingSection[] {
  const sections = new Map<string, CreditListingSection>();
  const rows = new Map<string, CreditListingRow>();
  for (const c of credits) {
    const groupKey = c.group ?? '';
    let section = sections.get(groupKey);
    if (!section) {
      section = c.group ? { heading: c.group, rows: [] } : { rows: [] };
      sections.set(groupKey, section);
    }
    const rowKey = `${groupKey}\u0000${c.role ?? ''}`;
    let row = rows.get(rowKey);
    if (!row) {
      row = c.role ? { role: c.role, entries: [] } : { entries: [] };
      rows.set(rowKey, row);
      section.rows.push(row);
    }
    row.entries.push(c.note ? { name: c.name, note: c.note } : { name: c.name });
  }
  return [...sections.values()];
}

/** An authored credit as frontmatter delivers it: every key but `name` may be absent or an empty string. */
export type RawCredit = {
  name: string;
  person?: string | null;
  role?: string | null;
  group?: string | null;
  note?: string | null;
  listed?: CreditListed | null;
};

/**
 * Authored block -> normalised credits. `undefined` stays `undefined`: an
 * absent block and an empty one mean different things, so neither is coerced.
 */
export function normaliseCredits(raw: RawCredit[] | undefined): Credit[] | undefined {
  if (!raw) return undefined;
  return raw.map(r => ({
    name: r.name,
    ...(r.person && { person: r.person }),
    ...(r.role && { role: r.role }),
    ...(r.group && { group: r.group }),
    ...(r.note && { note: r.note }),
    listed: r.listed ?? 'map',
  }));
}

/** The plain-data prop `CreditsSection` takes. */
export type CreditsView = { line: MadeByLine; listing: CreditListingSection[] };

/**
 * What to render for a card's credits, or `undefined` for nothing at all: no
 * block, an empty block, or one that names nobody (all listing-only) has no
 * line to open the panel from.
 */
export function creditsView(credits: Credit[] | undefined): CreditsView | undefined {
  if (!credits) return undefined;
  const line = madeByLine(credits);
  if ('names' in line && line.names.length === 0) return undefined;
  return { line, listing: creditListing(credits) };
}
