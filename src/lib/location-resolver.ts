// Location→fragment resolver.
//
// Collapses the three inline renderer registries (COLLECTION_RENDERERS,
// NAV_RENDERERS, COLLECTION_VIEW_RENDERERS — see renderers.ts) plus the lens
// registry into a single decision: given a stack path ("posts",
// "what/posts/about-me", "tag/who", "lens/home"), what should render it?
//
// Both /pages/card/[...path].astro and /pages/lens/[name].astro (and their
// fragment-partial counterparts) call resolveLocation() so the two routes
// make this decision the same way, in one place.
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { COLLECTION_RENDERERS, NAV_RENDERERS, COLLECTION_VIEW_RENDERERS } from './renderers';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';
import { getLensDefinition } from './lens-registry';
import type { LensDefinition } from './lens-registry';

export type CardLocation = {
  kind: 'card';
  /** Full uid, e.g. "what/stories/arctic/ch-01" or "tag/who". */
  path: string;
  /** Set when this card's collection has a nav renderer (e.g. stories prev/next chapter). */
  navComponent: AstroComponentFactory | null;
};

export type CollectionViewLocation = {
  kind: 'collection-view';
  collection: string;
  component: AstroComponentFactory;
};

export type LensLocation = {
  kind: 'lens';
  name: string;
  definition: LensDefinition;
};

export type UnknownLocation = { kind: 'unknown' };

export type LocationResolution = CardLocation | CollectionViewLocation | LensLocation | UnknownLocation;

const LENS_PREFIX = 'lens/';

/** Finds the registered NAV_RENDERERS entry whose prefix owns this uid, or null. */
function matchNavRenderer(path: string): AstroComponentFactory | null {
  for (const prefix of Object.keys(NAV_RENDERERS)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return NAV_RENDERERS[prefix];
  }
  return null;
}

/**
 * Resolves a stack path to the fragment/renderer that should handle it.
 *
 * - "lens/<name>" resolves against the lens registry (kind: 'lens'), or
 *   'unknown' if the name isn't registered.
 * - A bare collection name ("posts") resolves to its collection-view
 *   renderer (kind: 'collection-view'), or 'unknown' if none is registered.
 * - Any other non-empty path (a full-path uid, e.g. "what/stories/arctic/ch-01"
 *   or "tag/who") resolves to kind: 'card', carrying its nav renderer (if any,
 *   matched by NAV_RENDERERS prefix) — the per-entry content renderer itself
 *   still depends on frontmatter/collection data fetched by the caller, so use
 *   resolveCardRenderer() once that data is available.
 * - An empty path is 'unknown'.
 */
export function resolveLocation(path: string): LocationResolution {
  if (!path) return { kind: 'unknown' };

  if (path.startsWith(LENS_PREFIX)) {
    const name = path.slice(LENS_PREFIX.length);
    const definition = name ? getLensDefinition(name) : undefined;
    if (!definition) return { kind: 'unknown' };
    return { kind: 'lens', name, definition };
  }

  if (path.indexOf('/') === -1) {
    const component = COLLECTION_VIEW_RENDERERS[path];
    return component ? { kind: 'collection-view', collection: path, component } : { kind: 'unknown' };
  }

  return { kind: 'card', path, navComponent: matchNavRenderer(path) };
}

/**
 * Maps a cascaded renderer name (frontmatter override, else nearest-ancestor
 * `_config.yaml`, else 'card' — see resolveFolderCascade in folder-config.ts
 * and getAllCards in cards.ts) to its component. Renderer names with no
 * dedicated component ('post', 'story', 'card') fall back to GenericRenderer.
 */
export function resolveCardRenderer(rendererName: string): AstroComponentFactory {
  return COLLECTION_RENDERERS[rendererName] ?? GenericRenderer;
}
