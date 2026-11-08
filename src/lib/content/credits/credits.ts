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

export type CreditNameDrift = {
  kind: 'same-name-different-person' | 'near-duplicate';
  names: string[];
  uids: string[];
};

/**
 * Name pairs confirmed to be different people despite looking alike, so the
 * near-duplicate check stays quiet about them. Each pair is matched
 * case-insensitively and in either order.
 */
export const KNOWN_DISTINCT: readonly (readonly [string, string])[] = [
  // Flatland's special thanks: "Val, Jono and Max (patience)" are three people; the short first names are 2 edits apart.
  ['Val', 'Max'],
];

/**
 * Identity drift across cards. With no person records the `person` slug is the
 * only identity, so a typo splits one person in two (same name under two
 * identities) or merges two people.
 */
export function findCreditNameDrift(
  cards: { uid: string; credits: Credit[] }[],
  knownDistinct: readonly (readonly [string, string])[] = KNOWN_DISTINCT,
): CreditNameDrift[] {
  const byName = new Map<string, { name: string; identities: Set<string>; uids: Set<string> }>();
  for (const { uid, credits } of cards) {
    for (const c of credits) {
      const key = c.name.toLowerCase();
      const entry = byName.get(key) ?? { name: c.name, identities: new Set(), uids: new Set() };
      entry.identities.add(creditIdentity(c));
      entry.uids.add(uid);
      byName.set(key, entry);
    }
  }
  const findings: CreditNameDrift[] = [];
  for (const e of byName.values()) {
    if (e.identities.size > 1) {
      findings.push({ kind: 'same-name-different-person', names: [e.name], uids: [...e.uids].sort() });
    }
  }
  const allowed = new Set(knownDistinct.map(pairKey));
  const entries = [...byName.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ka, a] = entries[i];
      const [kb, b] = entries[j];
      if ([...a.identities].some(id => b.identities.has(id))) continue;
      if (allowed.has(pairKey([ka, kb])) || editDistance(ka, kb) > 2) continue;
      findings.push({
        kind: 'near-duplicate',
        names: [a.name, b.name].sort(),
        uids: [...new Set([...a.uids, ...b.uids])].sort(),
      });
    }
  }
  return findings;
}

/** Order- and case-insensitive key for a name pair. */
function pairKey(pair: readonly [string, string]): string {
  return pair.map(n => n.toLowerCase()).sort().join('\u0000');
}

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}
