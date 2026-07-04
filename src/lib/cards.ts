import { getCollection } from 'astro:content';
import { derivePathTags, mergeEffectiveTags } from './tag-inheritance';
import { resolveFolderCascade, makeFileReader } from './folder-config';
import { TRAVEL_LOG } from '../data/travel-log';
import { lookupLocationForDate, injectWhereTags } from './where-tags';
import { applyFilters, DIMENSIONS, tagIdToFilterValue } from './filters';
import type { Dimension, FilterState } from './filters';

// Re-exported for existing call sites; the canonical definition lives in
// filters.ts (client-safe — no astro:content) so client-side code (e.g.
// collection-link.ts, imported by CardStack.svelte) can use it without
// pulling this server-only module into the client bundle.
export { tagIdToFilterValue };

/** Merges a card's path-derived tag, its ancestors' cascade tags, and its own frontmatter tags (in that precedence, deduped). */
function effectiveTags(
  collection: string,
  id: string,
  frontmatterTags: string[],
  cascadeTags: string[],
): string[] {
  return mergeEffectiveTags(
    derivePathTags(collection, id),
    cascadeTags,
    frontmatterTags,
  );
}

export type CardMeta = {
  uid: string;        // "collection/id", e.g. "writing/why-portal"
  collection: string;
  id: string;
  title: string;
  description?: string;
  date?: Date;
  tags: string[];
  renderer: string;
  contentHash: string; // djb2 hash of title + description + body; resets view state on edit
};

function compareByDateDesc(a: CardMeta, b: CardMeta): number {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.getTime() - a.date.getTime();
}

/** Builds the FilterState that selects a tag entry's own subtree (itself plus any descendant tags), if its id has a recognised dimension prefix. */
export function filterStateForTagId(id: string): FilterState {
  const slashIdx = id.indexOf('/');
  if (slashIdx === -1) return { selections: {} };
  const dim = id.slice(0, slashIdx);
  if (!(DIMENSIONS as readonly string[]).includes(dim)) return { selections: {} };
  return { selections: { [dim as Dimension]: [tagIdToFilterValue(id)] } };
}

/**
 * Matches cards belonging to a tag entry: its own dimension subtree (prefix-matched,
 * so a parent tag also picks up descendant-tagged cards) unioned with legacy literal
 * matches against the tag's name/aliases — a safety net for content still using
 * pre-canonical tag strings.
 */
export function getCardsForTag(
  entry: { id: string; data: { name: string; aliases: string[] } },
  allCards: CardMeta[]
): CardMeta[] {
  const idAsTag = tagIdToFilterValue(entry.id);
  const literals = new Set([
    idAsTag.toLowerCase(),
    entry.data.name.toLowerCase(),
    ...entry.data.aliases.map((a: string) => a.toLowerCase()),
  ]);

  const filterState = filterStateForTagId(entry.id);
  const hasDimensionSelection = Object.keys(filterState.selections).length > 0;
  const prefixMatched = hasDimensionSelection ? applyFilters(allCards, filterState) : [];
  const matchedUids = new Set(prefixMatched.map(c => c.uid));

  const literalMatched = allCards.filter(
    c => !matchedUids.has(c.uid) && c.tags.some(t => literals.has(t.toLowerCase()))
  );

  return [...prefixMatched, ...literalMatched].sort(compareByDateDesc);
}

/** Resolves a card's display title, applying the stories-fallback-to-series rule. */
export function resolveCardTitle(
  collection: string,
  data: { title?: string; series?: string }
): string {
  return data.title ?? (collection === 'stories' ? (data.series ?? '') : '') ?? '';
}

/** Resolves a card's description, synthesising one from puzzle metadata when absent. */
export function resolveCardDescription(
  collection: string,
  data: { description?: string; puzzle_type?: string; difficulty?: string }
): string | undefined {
  if (collection === 'puzzles' && !data.description) {
    return [data.puzzle_type, data.difficulty].filter(Boolean).join(' · ') || undefined;
  }
  return data.description;
}

function djb2Hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function computeContentHash(title: string, description?: string, body?: string): string {
  return String(djb2Hash(`${title}||${description ?? ''}||${body ?? ''}`));
}

export async function getAllCards(): Promise<CardMeta[]> {
  const [allContent, tags] = await Promise.all([
    getCollection('content'),
    getCollection('tag'),
  ]);

  const reader = makeFileReader();

  const contentMeta = await Promise.all(
    allContent
      .filter(e => {
        const col = e.id.split('/')[0];
        return col !== 'stories' || import.meta.env.DEV || e.data.published !== false;
      })
      .map(async e => {
        const slashIdx = e.id.indexOf('/');
        const collection = e.id.slice(0, slashIdx);
        const id = e.id.slice(slashIdx + 1);
        const cascade = await resolveFolderCascade(collection, id, reader);

        const title = resolveCardTitle(collection, e.data);
        const description = resolveCardDescription(collection, e.data);

        const baseTags = effectiveTags(collection, id, e.data.tags, cascade.cascadeTags);
        const finalTags = e.data.date
          ? injectWhereTags(baseTags, lookupLocationForDate(e.data.date, TRAVEL_LOG))
          : baseTags;

        return {
          uid: e.id,
          collection,
          id,
          title,
          description,
          date: e.data.date,
          tags: finalTags,
          renderer: e.data.renderer ?? cascade.renderer ?? 'card',
          contentHash: computeContentHash(title, description, e.body),
        } satisfies CardMeta;
      })
  );

  const tagsMeta = tags.map(t => ({
    uid: `tag/${t.id}`,
    collection: 'tag',
    id: t.id,
    title: t.data.name,
    description: t.data.description,
    tags: [] as string[],
    renderer: 'tag',
    contentHash: computeContentHash(t.data.name, t.data.description),
  }));

  return [...contentMeta, ...tagsMeta];
}
