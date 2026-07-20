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
//     fresh in the "newest" lens.
//
// This runs ONCE, upstream of hierarchy/count building and card serialisation
// (LensStackCard.astro), so the results grid, frontpage slots, and
// dimension-panel counts all see the collapsed view consistently. getAllCards()
// itself is never collapsed — the individual member cards remain real,
// navigable cards for direct routes, the stack, and series nav.

import type { CardMeta } from './cards';
import { computeContentHash } from './cards';
import { ownValueForCard } from './card-identity';
import type { CollapseConfig } from './collapse-config';

/** Folder identity (declared name/description) for a folder's colon-form value. */
export type FolderIdentity = { name?: string; description?: string };

/** Picks a folder's representative member: lowest `order`, tiebroken by uid. */
function pickFirst(members: CardMeta[]): CardMeta {
  return [...members].sort((a, b) => {
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    return a.uid.localeCompare(b.uid);
  })[0];
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

    let dest: CardMeta | undefined;
    if (target) {
      const targetUid = `${folderUid}/${target}`;
      // The target names a child folder; its card uid is either exactly that
      // (a flat index) or nested beneath it.
      dest = members.find(c => c.uid === targetUid || c.uid.startsWith(`${targetUid}/`));
    }
    if (!dest) dest = pickFirst(members);

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
      // Stable across which member is destination — keyed to folder identity.
      contentHash: computeContentHash(title, description, folderUid),
      // Collapse runs on an already-listing-filtered pool (see LensStackCard),
      // so every member (including dest) is already listed/reachable; carry
      // the representative's own status/visibility through unchanged.
      status: dest.status,
      visibility: dest.visibility,
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
