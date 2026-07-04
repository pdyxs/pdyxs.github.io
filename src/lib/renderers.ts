import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import FilterRenderer from '../components/card-renderers/FilterRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';
import WorkRenderer from '../components/card-renderers/WorkRenderer.astro';
import SeriesNavRenderer from '../components/card-renderers/SeriesNavRenderer.astro';
import PostsRenderer from '../components/card-renderers/PostsRenderer.astro';
import ProjectsRenderer from '../components/card-renderers/ProjectsRenderer.astro';
import PuzzlesRenderer from '../components/card-renderers/PuzzlesRenderer.astro';
import FilterBrowserRenderer from '../components/card-renderers/FilterBrowserRenderer.astro';

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

export const COLLECTION_VIEW_RENDERERS: Record<string, AstroComponentFactory> = {
  posts: PostsRenderer,
  projects: ProjectsRenderer,
  puzzles: PuzzlesRenderer,
  filter: FilterBrowserRenderer,
};
