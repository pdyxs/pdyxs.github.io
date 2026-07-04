import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import FilterRenderer from '../components/card-renderers/FilterRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';
import WorkRenderer from '../components/card-renderers/WorkRenderer.astro';
import SeriesNavRenderer from '../components/card-renderers/SeriesNavRenderer.astro';

// Keyed by renderer *name* (the cascaded _config.yaml / frontmatter `renderer`
// value), not collection name. Only renderers with a dedicated component are
// listed here — 'post', 'story', and 'card' legitimately have none and fall
// back to GenericRenderer via resolveCardRenderer().
export const COLLECTION_RENDERERS: Record<string, AstroComponentFactory> = {
  tag: FilterRenderer,
  puzzle: PuzzleRenderer,
  work: WorkRenderer,
};

export const NAV_RENDERERS: Record<string, AstroComponentFactory> = {
  stories: SeriesNavRenderer,
};

// Collection-view browsing pages (bare collection-name uids, e.g. "posts")
// are retired (issue #26) — "browse a collection" is now the browse lens
// pre-filtered (see collection-link.ts). This map is kept as the registration
// point for a future collection-view, but is empty for now.
export const COLLECTION_VIEW_RENDERERS: Record<string, AstroComponentFactory> = {};
