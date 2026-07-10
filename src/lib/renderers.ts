import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';
import WorkRenderer from '../components/card-renderers/WorkRenderer.astro';
import SeriesNavRenderer from '../components/card-renderers/SeriesNavRenderer.astro';

// Keyed by renderer *name* (the cascaded _config.yaml / frontmatter `renderer`
// value), not collection name. Only renderers with a dedicated component are
// listed here — 'post', 'story', and 'card' legitimately have none and fall
// back to GenericRenderer via resolveCardRenderer(). The 'tag' renderer
// retired along with the `tag` content collection (see tag-registry.ts).
export const COLLECTION_RENDERERS: Record<string, AstroComponentFactory> = {
  puzzle: PuzzleRenderer,
  work: WorkRenderer,
};

// Keyed by nav-renderer *name* — the cascaded `navRenderer` value from
// frontmatter or a `_config.yaml` (see resolveFolderCascade in
// folder-config.ts), resolved via resolveNavRenderer() once that data is
// available. This mirrors COLLECTION_RENDERERS (keyed by `renderer` name)
// rather than binding a renderer to a hardcoded content path, so moving or
// renaming content folders can't silently unhook their nav shell.
export const NAV_RENDERERS: Record<string, AstroComponentFactory> = {
  series: SeriesNavRenderer,
};

// Collection-view browsing pages (bare collection-name uids, e.g. "posts")
// are retired (issue #26) — "browse a collection" is now the browse lens
// pre-filtered (see collection-link.ts). This map is kept as the registration
// point for a future collection-view, but is empty for now.
export const COLLECTION_VIEW_RENDERERS: Record<string, AstroComponentFactory> = {};
