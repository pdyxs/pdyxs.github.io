// Pure transform that collapses opted-in content folders to a single
// representative card for browse/filter/search surfaces.
//
// A collapsed folder (see collapse-config.ts for the opt-in marker) is
// replaced in the card list by ONE synthetic representative:
//   - it carries the folder's declared identity (name/description from its
//     `_config.yaml`, supplied via `identityFor`) so it reads as "the series",
//   - its uid is the destination child's uid, so clicking it opens that real
//     card and any series prev/next nav takes over from there,
//   - it carries the UNION of all member cards' tags, so any filter that
//     matched any chapter still surfaces the collapsed series,
//   - it sorts by the LATEST member date, so an actively-updated series stays
//     fresh in the "newest" lens,
//   - its content hash is the destination's OWN hash, not one derived from the
//     folder identity — see the comment at the assignment below.
//
// This runs ONCE, upstream of hierarchy/count building and card serialisation
// (LensStackCard.astro), so the results grid, frontpage slots, and
// dimension-panel counts all see the collapsed view consistently. getAllCards()
// itself is never collapsed — the individual member cards remain real,
// navigable cards for direct routes, the stack, and series nav.

import type { CardMeta } from './cards';
import { ownValueForCard } from './card-identity';
import type { CollapseConfig } from './collapse-config';

/** Folder identity (declared name/description) for a folder's colon-form value. */
export type FolderIdentity = { name?: string; description?: string };

/**
 * A folder's members in series order: lowest `order` first, tiebroken by uid.
 * This is the "reading order" for the folder — independent of which member
 * `target` (or the lowest-order default) picks as the clickable destination,
 * since a series can name a different chapter as its destination (see
 * `resolveFolder` below) without changing what order its chapters read in.
 */
function sortMembers(members: CardMeta[]): CardMeta[] {
  return [...members].sort((a, b) => {
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    return a.uid.localeCompare(b.uid);
  });
}

/** Most recent member date, or undefined if no member carries a date. */
function latestDate(members: CardMeta[]): Date | undefined {
  let latest: Date | undefined;
  for (const m of members) {
    if (m.date && (!latest || m.date.getTime() > latest.getTime())) latest = m.date;
  }
  return latest;
}

/** Order-preserving union of every member's tags. */
function unionTags(members: CardMeta[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of members) {
    for (const tag of m.tags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
    }
  }
  return out;
}

/**
 * The colon-form value of every collapsed folder (see collapse-config.ts) —
 * i.e. the values that name a whole rather than a category.
 *
 * Two consumers, one idea. `CardMeta.collapsedContainer` is the same fact seen
 * from a card ("the whole I am a part of", which suppresses its chip); this is
 * it seen from the panel ("not somewhere to drill into", NodeContext's
 * `excludedValues`).
 */
export function collapsedFolderValues(config: CollapseConfig): Set<string> {
  const values = new Set<string>();
  for (const folderUid of config.keys()) {
    const value = ownValueForCard(folderUid);
    if (value) values.add(value);
  }
  return values;
}

/** A folder's resolved destination card plus its full series-ordered membership. */
type ResolvedFolder = { dest: CardMeta; orderedMembers: CardMeta[] };

/**
 * Resolves one collapsed folder's destination (per `target`, falling back to
 * the lowest-`order` member) and its full series order. Shared by
 * `collapseCollections` (which only needs `dest`) and `collapsedSeriesMembers`
 * (which only needs `orderedMembers`) so the two can never disagree about
 * either — the earlier bug class this file guards against elsewhere.
 */
function resolveFolder(folderUid: string, target: string | undefined, members: CardMeta[]): ResolvedFolder {
  const orderedMembers = sortMembers(members);
  let dest: CardMeta | undefined;
  if (target) {
    const targetUid = `${folderUid}/${target}`;
    // The target names a child folder; its card uid is either exactly that
    // (a flat index) or nested beneath it.
    dest = members.find(c => c.uid === targetUid || c.uid.startsWith(`${targetUid}/`));
  }
  return { dest: dest ?? orderedMembers[0], orderedMembers };
}

/**
 * Every collapsed folder's full membership, in series order, keyed by its
 * representative's uid (the same `dest.uid` `collapseCollections` uses) — the
 * lookup `expandCollapsedSeries` (collapsed-series.ts) needs client-side to
 * decide whether a series counts as read and, if so, which chapter is next.
 *
 * A folder with only one member (or none) is omitted: there is no "series" to
 * distinguish from the representative itself.
 */
export function collapsedSeriesMembers(cards: CardMeta[], config: CollapseConfig): Map<string, CardMeta[]> {
  const result = new Map<string, CardMeta[]>();
  for (const [folderUid, { target }] of config) {
    const prefix = `${folderUid}/`;
    const members = cards.filter(c => c.uid.startsWith(prefix));
    if (members.length < 2) continue;
    const { dest, orderedMembers } = resolveFolder(folderUid, target, members);
    result.set(dest.uid, orderedMembers);
  }
  return result;
}

/**
 * Returns a new card list in which every folder named in `config` is replaced
 * by a single representative card. Cards outside any collapsed folder pass
 * through untouched, and the representative keeps the destination card's
 * original position so date/order-based sorting stays stable.
 *
 * `identityFor` maps a folder's colon-form value (e.g.
 * "what:posts/stories/arctic") to its declared name/description — in practice
 * the flattened tag registry (tagDisplay) already assembled by the caller.
 *
 * Nested collapse folders (a folder and one of its ancestors both opting in)
 * are not a supported configuration.
 */
export function collapseCollections(
  cards: CardMeta[],
  config: CollapseConfig,
  identityFor: (folderValue: string) => FolderIdentity,
): CardMeta[] {
  if (config.size === 0) return cards;

  // destUid → representative card; every dropped member uid.
  const repByDestUid = new Map<string, CardMeta>();
  const dropUids = new Set<string>();

  for (const [folderUid, { target }] of config) {
    const prefix = `${folderUid}/`;
    const members = cards.filter(c => c.uid.startsWith(prefix));
    if (members.length === 0) continue;

    const { dest } = resolveFolder(folderUid, target, members);

    const folderValue = ownValueForCard(folderUid);
    const identity = folderValue ? identityFor(folderValue) : {};
    const title = identity.name ?? dest.title;
    const description = identity.description ?? dest.description;

    repByDestUid.set(dest.uid, {
      uid: dest.uid,
      title,
      description,
      date: latestDate(members),
      tags: unionTags(members),
      renderer: dest.renderer,
      image: dest.image,
      collapsed: { count: members.length },
      // The representative IS the folder, so the folder's value is its own
      // container too — which is what suppresses a chip repeating the title
      // this card was just given (see card-tag-display.ts).
      collapsedContainer: folderValue,
      // The destination's OWN hash, not one derived from the folder identity
      // (title/description above): opening the representative literally opens
      // `dest`, and read tracking (getViewState) compares this hash against
      // whatever `dest`'s own direct card page recorded on read. Those two
      // must be byte-identical or a collapsed series can never register as
      // seen — reading the chapter stamps `dest.contentHash`, but a
      // folder-derived hash here would almost never match it, so the pool's
      // representative would sit at 'unseen' forever regardless of what was
      // actually read.
      contentHash: dest.contentHash,
      // Collapse runs on an already-listing-filtered pool (see LensStackCard),
      // so every member (including dest) is already listed/reachable; carry
      // the representative's own status/visibility through unchanged.
      status: dest.status,
      visibility: dest.visibility,
      // The folder ranks as its strongest member, the same way its date is the
      // latest and its tags the union: boosting one chapter is a statement
      // about the folder the reader actually sees, and taking the
      // representative's own priority would silently discard it.
      priority: Math.max(...members.map(m => m.priority ?? 0)),
      sort: dest.sort,
    });
    for (const m of members) dropUids.add(m.uid);
  }

  const result: CardMeta[] = [];
  for (const card of cards) {
    const rep = repByDestUid.get(card.uid);
    if (rep) {
      result.push(rep);
    } else if (!dropUids.has(card.uid)) {
      result.push(card);
    }
  }
  return result;
}
