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
