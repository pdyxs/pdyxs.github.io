// Lens body loaders — the lazy-import boundary for lenses.
//
// This is the ONLY place a lens's rendering code is ever referenced, and
// only behind a dynamic import() inside a function. lens-registry.ts (the
// data) never imports this file, and this file is only imported by
// LensStackCard.astro, which awaits the right loader server-side (same
// pattern resolveLocation used to follow) — so a lens's body code only loads
// when that lens is actually navigated to, never as a side effect of
// importing the registry or enumerating the manifest.
//
// Each loader points at a thin Astro shim (HomeLensBody.astro,
// BrowseLensBody.astro), not the Svelte component directly — client:load
// requires a statically analyzable component reference, so the actual
// Svelte body must be a static import inside its shim; the shim itself is
// what gets dynamically imported here and rendered without a client
// directive (plain server-rendered Astro component).
//
// A lens with no entry here has no bespoke rendering need — it gets
// DEFAULT_BODY_LOADER, the shared "browse lens family" body (see
// lens-registry.ts's own framing: Newest is just the default member of that
// family). Only genuinely bespoke lenses (home's day-seeded slots) need an
// entry.
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

export type LensBodyLoader = () => Promise<{ default: AstroComponentFactory }>;

export const LENS_BODY_LOADERS: Record<string, LensBodyLoader> = {
  home: () => import('../components/lens-renderers/HomeLensBody.astro'),
  editorial: () => import('../components/lens-renderers/EditorialLensBody.astro'),
  // Both history lenses (Seen and Unseen — issue #84) share one body; which of
  // the two it is comes from the lens's `config.readState`, not from a second
  // entry here. They are genuinely bespoke rather than browse-family: the pool
  // is narrowed and sorted by localStorage, which no server-side sort config
  // can express.
  history: () => import('../components/lens-renderers/HistoryLensBody.astro'),
  // The audit lens (issue #72) is devOnly, and its loader is gated on
  // import.meta.env.DEV as well as on isLensVisible(). Registry-level gating
  // alone only stops the *route* being emitted — the loader would still be in
  // the production module graph, dragging AuditLensBody's scoped CSS into the
  // shared stylesheet on every page. import.meta.env.DEV is substituted at
  // build time, so a production build dead-code-eliminates this entry and the
  // component is never bundled at all.
  ...(import.meta.env.DEV
    ? { audit: () => import('../components/lens-renderers/AuditLensBody.astro') }
    : {}),
};

export const DEFAULT_BODY_LOADER: LensBodyLoader = () =>
  import('../components/lens-renderers/BrowseLensBody.astro');
