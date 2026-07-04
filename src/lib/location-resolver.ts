// Location→fragment resolver.
//
// Collapses the three inline renderer registries (COLLECTION_RENDERERS,
// NAV_RENDERERS, COLLECTION_VIEW_RENDERERS — see renderers.ts) plus the lens
// registry into a single decision: given a stack path ("posts", "posts/about-me",
// "tag/who", "lens/home"), what should render it?
//
// Both /pages/card/[...path].astro and /pages/lens/[name].astro (and their
// fragment-partial counterparts) call resolveLocation() so the two routes
// make this decision the same way, in one place.
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { COLLECTION_RENDERERS, NAV_RENDERERS, COLLECTION_VIEW_RENDERERS } from './renderers';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';
import { getLensDefinition } from './lens-registry';
import type { LensDefinition } from './lens-registry';
import { LENS_COMPONENT_LOADERS } from './lens-components';
import type { LensComponentLoader } from './lens-components';

export type CardLocation = {
  kind: 'card';
  collection: string;
  id: string;
  /** Set when this collection has a nav renderer (e.g. stories prev/next chapter). */
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
  /** The lazy-import boundary — only called (and thus only imported) once a lens route actually renders. */
  loadComponent: LensComponentLoader;
};

export type UnknownLocation = { kind: 'unknown' };

export type LocationResolution = CardLocation | CollectionViewLocation | LensLocation | UnknownLocation;

const LENS_PREFIX = 'lens/';

/**
 * Resolves a stack path to the fragment/renderer that should handle it.
 *
 * - "lens/<name>" resolves against the lens registry (kind: 'lens'), or
 *   'unknown' if the name isn't registered or its component isn't wired up
 *   in LENS_COMPONENT_LOADERS yet.
 * - A bare collection name ("posts") resolves to its collection-view
 *   renderer (kind: 'collection-view'), or 'unknown' if none is registered.
 * - "<collection>/<id>" resolves to kind: 'card', carrying the collection's
 *   nav renderer (if any) — the per-entry content renderer itself still
 *   depends on frontmatter/collection data fetched by the caller, so use
 *   resolveCardRenderer() once that data is available.
 * - Anything else (empty path) is 'unknown'.
 */
export function resolveLocation(path: string): LocationResolution {
  if (!path) return { kind: 'unknown' };

  if (path.startsWith(LENS_PREFIX)) {
    const name = path.slice(LENS_PREFIX.length);
    const definition = name ? getLensDefinition(name) : undefined;
    if (!definition) return { kind: 'unknown' };
    const loadComponent = LENS_COMPONENT_LOADERS[definition.component];
    if (!loadComponent) return { kind: 'unknown' };
    return { kind: 'lens', name, definition, loadComponent };
  }

  const slashIdx = path.indexOf('/');
  if (slashIdx === -1) {
    const component = COLLECTION_VIEW_RENDERERS[path];
    return component ? { kind: 'collection-view', collection: path, component } : { kind: 'unknown' };
  }

  const collection = path.slice(0, slashIdx);
  const id = path.slice(slashIdx + 1);
  return { kind: 'card', collection, id, navComponent: NAV_RENDERERS[collection] ?? null };
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
