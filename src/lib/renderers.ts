import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import TagRenderer from '../components/card-renderers/TagRenderer.astro';
import PuzzleRenderer from '../components/card-renderers/PuzzleRenderer.astro';

export const COLLECTION_RENDERERS: Record<string, AstroComponentFactory> = {
  tag: TagRenderer,
  puzzles: PuzzleRenderer,
};
