// Pure, framework-agnostic tag display resolution — no fs, no Astro, no
// browser APIs. Shared by tag-registry.ts (server-side registry
// computation) and any client-rendered component that needs to resolve a
// filter value's display name from a serialised display map (e.g.
// BrowseCard.svelte, ActiveFilterChips.svelte). Must stay free of Node-only
// imports (fs, path, url) since it's imported directly into Svelte
// components that ship to the browser.

export type TagDisplay = {
  name: string;
  description?: string;
  /** True when this value has a container `_config.yaml` or `<name>.tag.yaml` identity — see tag-registry.ts's resolveDisplay. Undeclared (e.g. purely card-backed) values omit or set this false. */
  declared?: boolean;
  /** Set when this value is exactly some card's own path (see tag-registry.ts's ownValueForCard) — the uid to navigate to instead of filtering. */
  cardUid?: string;
  /** Section this value belongs to within its dimension panel — the tag's declared `group` (from its `_config.yaml`/`.tag.yaml`). Ungrouped values omit it and share the default section. See groupNodesIntoSections in browse-helpers.ts. */
  group?: string;
  /** Primary sort key for ordering sibling nodes ahead of the alphabetical fallback — lower sorts first. Set for values that need a non-alphabetical order (e.g. chronological `when` eras); omitted values sort alphabetically among themselves. See sortNodes in browse-helpers.ts. */
  order?: number;
};

/** Humanises the last path segment of a filter value: "data-art" -> "Data Art". */
export function humaniseSegment(value: string): string {
  const afterColon = value.slice(value.indexOf(':') + 1);
  const lastSegment = afterColon.split('/').pop() ?? afterColon;
  return lastSegment
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolves display info for a filter value from a (possibly partial) display
 * map: a declared entry wins; otherwise falls back to a humanised segment
 * with no description.
 */
export function displayFor(value: string, display: Record<string, TagDisplay> = {}): TagDisplay {
  return display[value] ?? { name: humaniseSegment(value), declared: false };
}

/**
 * The subset of a display map that a set of previews can actually render.
 *
 * A card page's `CardStrip`s used to be handed the whole site-wide display map
 * — ~18 KB, once per strip, `client:load`, on the site's most cold-entered
 * surface — to name a median of six values. `BrowseCard` resolves exactly two
 * things out of it: the label of every tag its card carries (`labelOf`, for the
 * same-label dedupe) and the label of each chip it renders, which is a subset
 * of the same list. So the union of the previews' own tags (plus each card's
 * `collapsedContainer`, the one other value the chip decision names) is the
 * whole of what the map is asked for.
 *
 * Pure and total: an unknown value is simply absent, which is what
 * `displayFor`'s `humaniseSegment` fallback already handles — but note that
 * fallback is also why narrowing too far is SILENT. Narrow only where the
 * complete preview set is in hand (see the three `CardStrip` call sites in
 * `GenericRenderer.astro`); a set narrowed before `seriesCards` is resolved
 * misses every series sibling's tags and quietly humanises their chips.
 */
export function narrowTagDisplay(
  display: Record<string, TagDisplay> | undefined,
  cards: readonly { tags?: string[]; collapsedContainer?: string }[],
): Record<string, TagDisplay> {
  if (!display) return {};
  const needed = new Set<string>();
  for (const card of cards) {
    for (const tag of card.tags ?? []) needed.add(tag);
    if (card.collapsedContainer) needed.add(card.collapsedContainer);
  }
  const out: Record<string, TagDisplay> = {};
  for (const value of needed) {
    const entry = display[value];
    if (entry) out[value] = entry;
  }
  return out;
}
