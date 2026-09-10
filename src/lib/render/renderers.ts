import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import SeriesNavRenderer from '@components/card-renderers/SeriesNavRenderer.astro';
import LinoCanvas from '@components/header-media/LinoCanvas.astro';

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

// Renderer names that legitimately have no dedicated component and are MEANT
// to reach GenericRenderer. Declaring them is what lets resolveCardRenderer()
// tell "this folder wants the generic card" apart from "somebody typed
// `renderer: gneric`" — which used to be the same thing, silently, and
// rendered a plausible-looking card either way (issue #174).
//
// The shape is `excludeTags`' generatorDerivations() precedent: a legal set
// enumerated in one place, so a mistyped value is a build error rather than a
// no-op that fails open. A new renderer name must be registered in
// COLLECTION_RENDERERS *or* declared here — and if you are adding it here,
// that is a claim that GenericRenderer already expresses it.
export const GENERIC_RENDERERS: ReadonlySet<string> = new Set([
  'card',
  'post',
  'story',
  // Both retired INTO GenericRenderer rather than being renamed away, so
  // content still names them: 'puzzle' once its meta rows and play link became
  // folded fields (card-meta.ts / card-actions.ts), 'work' once its
  // `when`/`roles` <dl> did (issue #89).
  'puzzle',
  'work',
]);

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
// runs. It receives HeaderMediaProps (src/lib/render/header-media.ts). Unlike
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

/**
 * The component for a card's `headerMedia` value, or undefined if unset.
 *
 * THROWS on a declared-but-unregistered name. There is no generic fallback
 * here (unlike `renderer`): a headerMedia name is only ever written to ask for
 * one specific bespoke component, so an unregistered one is always a mistake.
 * It used to fall back to the plain <img>, which renders a perfectly ordinary
 * card and gives no sign the bespoke header was dropped (issue #174).
 */
export function resolveHeaderMedia(name: string | undefined): AstroComponentFactory | undefined {
  if (!name) return undefined;
  const component = HEADER_MEDIA_RENDERERS[name] as AstroComponentFactory | undefined;
  if (!component) {
    throw new Error(
      `headerMedia: "${name}" is not registered. ` +
        `Registered: ${Object.keys(HEADER_MEDIA_RENDERERS).join(', ') || '(none)'}. ` +
        `Add it to HEADER_MEDIA_RENDERERS in src/lib/render/renderers.ts, or remove the frontmatter key.`,
    );
  }
  return component;
}

// Collection-view browsing pages (bare collection-name uids, e.g. "posts")
// are retired (issue #26) — "browse a collection" is now the browse lens
// pre-filtered (see collection-link.ts). This map is kept as the registration
// point for a future collection-view, but is empty for now.
export const COLLECTION_VIEW_RENDERERS: Record<string, AstroComponentFactory> = {};
