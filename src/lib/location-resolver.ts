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
import { COLLECTION_RENDERERS, NAV_RENDERERS, COLLECTION_VIEW_RENDERERS, GENERIC_RENDERERS } from './renderers';
import GenericRenderer from '../components/card-renderers/GenericRenderer.astro';
import { getLensDefinition } from './lens-registry';
import type { LensDefinition } from './lens-registry';

export type CardLocation = {
  kind: 'card';
  /** Full uid, e.g. "what/posts/stories/arctic/ch-01" or "tag/who". */
  path: string;
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

/**
 * Resolves a stack path to the fragment/renderer that should handle it.
 *
 * - "lens/<name>" resolves against the lens registry (kind: 'lens'), or
 *   'unknown' if the name isn't registered.
 * - A bare collection name ("posts") resolves to its collection-view
 *   renderer (kind: 'collection-view'), or 'unknown' if none is registered.
 * - Any other non-empty path (a full-path uid, e.g.
 *   "what/posts/stories/arctic/ch-01" or "tag/who") resolves to kind: 'card'.
 *   Both the content renderer and the nav renderer depend on
 *   frontmatter/`_config.yaml` data fetched by the caller, so resolve them with
 *   resolveCardRenderer() / resolveNavRenderer() once that data is available.
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
    // Index access is typed as always-defined (no noUncheckedIndexedAccess), but
    // an unregistered collection really returns undefined at runtime — cast so the
    // truthiness check below is meaningful rather than "always true".
    const component = COLLECTION_VIEW_RENDERERS[path] as AstroComponentFactory | undefined;
    return component ? { kind: 'collection-view', collection: path, component } : { kind: 'unknown' };
  }

  return { kind: 'card', path };
}

/**
 * Maps a cascaded renderer name (frontmatter override, else nearest-ancestor
 * `_config.yaml`, else 'card' — see resolveFolderCascade in folder-config.ts
 * and getAllCards in cards.ts) to its component.
 *
 * A name must be REGISTERED in COLLECTION_RENDERERS or DECLARED GENERIC in
 * GENERIC_RENDERERS; anything else throws, which fails the build. The
 * unconditional `?? GenericRenderer` this replaces could not tell a folder
 * that wants the generic card apart from a typo, and rendered a plausible card
 * for both (issue #174).
 */
export function resolveCardRenderer(rendererName: string): AstroComponentFactory {
  const registered = COLLECTION_RENDERERS[rendererName] as AstroComponentFactory | undefined;
  if (registered) return registered;
  if (GENERIC_RENDERERS.has(rendererName)) return GenericRenderer;
  throw new Error(
    `renderer: "${rendererName}" is neither registered nor declared generic. ` +
      `Register it in COLLECTION_RENDERERS, or add it to GENERIC_RENDERERS ` +
      `(src/lib/renderers.ts) if GenericRenderer already expresses it.`,
  );
}

/**
 * Maps a cascaded nav-renderer name (frontmatter `navRenderer` override, else
 * nearest-ancestor `_config.yaml` `navRenderer` — see resolveFolderCascade) to
 * its component.
 *
 * Returns null when NO name is declared, meaning "plain card shell, no nav
 * renderer" — that is the ordinary case for almost every card. A DECLARED name
 * with no registered component THROWS: unlike `renderer` there is no generic
 * nav shell to fall back to, so the old `?? null` silently served the plain
 * shell and the series run simply never appeared (issue #174).
 */
export function resolveNavRenderer(navRendererName: string | undefined): AstroComponentFactory | null {
  if (!navRendererName) return null;
  const registered = NAV_RENDERERS[navRendererName] as AstroComponentFactory | undefined;
  if (!registered) {
    throw new Error(
      `navRenderer: "${navRendererName}" is not registered. ` +
        `Registered: ${Object.keys(NAV_RENDERERS).join(', ') || '(none)'}. ` +
        `Add it to NAV_RENDERERS in src/lib/renderers.ts, or remove the declaration.`,
    );
  }
  return registered;
}
