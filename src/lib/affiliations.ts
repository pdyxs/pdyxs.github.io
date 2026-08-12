// Affiliation tags — filter values whose membership is a property of the
// *whole card pool*, not of any one card.
//
// A `.tag.yaml` declares `seeds:` (a list of content paths). A card belongs to
// that value if it is a seed, or if it tags a member, transitively:
//
//     who/seethrough.tag.yaml  seeds: [where/work/seethrough]
//       → the studio card itself
//       → every card tagged `where:work/seethrough` (Particulars, the devlogs)
//       → every card tagged `what:games/digital/particulars` (older writing
//         that names the game but never named the studio)
//
// That last hop is the whole point: the transitive step reaches content that
// predates, or simply never mentions, the organisation.
//
// This is why affiliations are NOT a FilterGenerator. A generator's
// `apply(tags, card)` sees one card's date and overrides; membership here is a
// fixed point over every card's tags and can only be decided once, over the
// pool. So it stays a separate pass: pure here, applied by getAllCards()
// (src/lib/cards.ts) after every card has resolved.
//
// Must stay pure (no Astro, fs, or browser imports) — the seed lists are read
// from the filesystem by the caller (discoverTagSources in tag-registry.ts).

/** One declared affiliation: the filter value, and the content paths it grows from. */
export type AffiliationDeclaration = {
  /** Colon-form filter value this membership grants, e.g. "who:seethrough". */
  value: string;
  /**
   * Content paths (uid form, `where/work/seethrough`) that seed the closure.
   * A seed may name a card *or* a container folder — a container has no card
   * of its own, but its children carry it as their path tag, so the same edge
   * rule reaches them without a special case.
   */
  seeds: string[];
};

/** The card fields the closure reads. Deliberately smaller than CardMeta. */
export type AffiliationCard = {
  uid: string;
  tags: readonly string[];
};

/**
 * The tag value that *points at* a content path — the colon form of its uid.
 * Mirrors `ownValueForCard` in card-identity.ts, but takes a bare path so it
 * also works for container folders, which have no card.
 */
function pathToValue(path: string): string | undefined {
  const slashIdx = path.indexOf('/');
  if (slashIdx === -1) return undefined;
  const rest = path.slice(slashIdx + 1);
  return rest ? `${path.slice(0, slashIdx)}:${rest}` : undefined;
}

/**
 * Every affiliation value each card earns, keyed by uid.
 *
 * Cards with no affiliation are absent from the map rather than present with an
 * empty array, so callers can skip the merge entirely for the common case.
 *
 * The traversal is breadth-first from the seeds over the reverse-tag index,
 * with a per-declaration `members` set — so a tag cycle terminates, and a card
 * reachable by two paths is visited once.
 */
export function computeAffiliationTags(
  declarations: readonly AffiliationDeclaration[],
  cards: readonly AffiliationCard[],
): Map<string, string[]> {
  // value → uids of the cards that carry it as a tag. Built once and shared by
  // every declaration; this is the only pass over the full tag lists.
  const taggedBy = new Map<string, string[]>();
  const uids = new Set<string>();
  for (const card of cards) {
    uids.add(card.uid);
    for (const tag of card.tags) {
      const existing = taggedBy.get(tag);
      if (existing) existing.push(card.uid);
      else taggedBy.set(tag, [card.uid]);
    }
  }

  const result = new Map<string, string[]>();

  for (const { value, seeds } of declarations) {
    const members = new Set<string>();
    // Values whose taggers have not been swept yet. Seeded with the colon form
    // of every seed path, whether or not a card sits at that path.
    const frontier: string[] = [];

    for (const seed of seeds) {
      if (uids.has(seed)) members.add(seed);
      const seedValue = pathToValue(seed);
      if (seedValue) frontier.push(seedValue);
    }

    const swept = new Set<string>(frontier);
    while (frontier.length > 0) {
      const target = frontier.pop()!;
      for (const uid of taggedBy.get(target) ?? []) {
        if (members.has(uid)) continue;
        members.add(uid);
        // The new member is now itself a link target: anything tagging it joins.
        const ownValue = pathToValue(uid);
        if (ownValue && !swept.has(ownValue)) {
          swept.add(ownValue);
          frontier.push(ownValue);
        }
      }
    }

    for (const uid of members) {
      const existing = result.get(uid);
      if (existing) {
        if (!existing.includes(value)) existing.push(value);
      } else {
        result.set(uid, [value]);
      }
    }
  }

  return result;
}
