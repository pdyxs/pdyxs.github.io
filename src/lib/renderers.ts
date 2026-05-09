import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import TagRenderer from '../components/card-renderers/TagRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';
import WorkRenderer from '../components/card-renderers/WorkRenderer.astro';
import SeriesNavRenderer from '../components/card-renderers/SeriesNavRenderer.astro';
import PostsRenderer from '../components/card-renderers/PostsRenderer.astro';
import ProjectsRenderer from '../components/card-renderers/ProjectsRenderer.astro';

export const COLLECTION_RENDERERS: Record<string, AstroComponentFactory> = {
  tag: TagRenderer,
  puzzles: PuzzleRenderer,
  work: WorkRenderer,
};

export const NAV_RENDERERS: Record<string, AstroComponentFactory> = {
  stories: SeriesNavRenderer,
};

export const COLLECTION_VIEW_RENDERERS: Record<string, AstroComponentFactory> = {
  posts: PostsRenderer,
  projects: ProjectsRenderer,
};
