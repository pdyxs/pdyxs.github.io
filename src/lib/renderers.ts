import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import SeriesNavRenderer from '../components/card-renderers/SeriesNavRenderer.astro';
import LinoCanvas from '../components/header-media/LinoCanvas.astro';

// Keyed by renderer *name* (the cascaded _config.yaml / frontmatter `renderer`
// value), not collection name. Only renderers with a dedicated component are
// listed here — 'post', 'story', 'card', 'puzzle' and 'work' legitimately have
// none and fall back to GenericRenderer via resolveCardRenderer(). The 'tag'
// renderer retired along with the `tag` content collection (see
// tag-registry.ts); 'puzzle' retired into GenericRenderer once its meta rows
// and play link became ordinary folded fields (see card-meta.ts /
// card-actions.ts), and 'work' the same way once its `when`/`roles` <dl>
// became folded meta rows — its own version had no tag chips, no card strips
// and no gallery, which stranded the work cards (issue #89).
//
// The map is empty by design, not by accident: a card renderer that needs to
// exist is one GenericRenderer can't express, and so far none has been.
export const COLLECTION_RENDERERS: Record<string, AstroComponentFactory> = {};

// Keyed by nav-renderer *name* — the cascaded `navRenderer` value from
// frontmatter or a `_config.yaml` (see resolveFolderCascade in
// folder-config.ts), resolved via resolveNavRenderer() once that data is
// available. This mirrors COLLECTION_RENDERERS (keyed by `renderer` name)
// rather than binding a renderer to a hardcoded content path, so moving or
// renaming content folders can't silently unhook their nav shell.
export const NAV_RENDERERS: Record<string, AstroComponentFactory> = {
  series: SeriesNavRenderer,
};

// Keyed by header-media *name* — the card's `headerMedia` frontmatter value.
// The registered component replaces the plain <img> at the top of
// `.generic-bleed` and nothing else; every other part of GenericRenderer still
// runs. It receives HeaderMediaProps (src/lib/header-media.ts). Unlike
// `renderer`, this is frontmatter-only and does not cascade: a bespoke header
// belongs to one card, not to a folder shape.
//
// Entries are *Astro* components even when the real work is a Svelte island,
// and that is load-bearing: Astro attaches hydration metadata at the static
// import site, so a Svelte component fetched from this map at runtime and
// mounted `client:load` dies with NoMatchingImport. Each entry is a thin
// wrapper that statically imports its own island — see LinoCanvas.astro.
export const HEADER_MEDIA_RENDERERS: Record<string, AstroComponentFactory> = {
  'lino-canvas': LinoCanvas,
};

/** The component for a card's `headerMedia` value, or undefined if unset/unregistered. */
export function resolveHeaderMedia(name: string | undefined): AstroComponentFactory | undefined {
  return name ? HEADER_MEDIA_RENDERERS[name] : undefined;
}

// Collection-view browsing pages (bare collection-name uids, e.g. "posts")
// are retired (issue #26) — "browse a collection" is now the browse lens
// pre-filtered (see collection-link.ts). This map is kept as the registration
// point for a future collection-view, but is empty for now.
export const COLLECTION_VIEW_RENDERERS: Record<string, AstroComponentFactory> = {};
