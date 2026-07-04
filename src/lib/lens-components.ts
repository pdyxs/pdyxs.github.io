// Lens component loaders — the lazy-import boundary for lenses.
//
// This is the ONLY place a lens's Astro component is ever referenced, and
// only behind a dynamic import() inside a function. lens-registry.ts (the
// data) never imports this file, and this file is only imported by
// location-resolver.ts, which in turn is only reached from the /lens and
// /fragment/lens route files — so a lens's layout + data load only happen
// when that lens is actually navigated to, never as a side effect of
// importing the registry or enumerating the manifest.
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

export type LensComponentLoader = () => Promise<{ default: AstroComponentFactory }>;

export const LENS_COMPONENT_LOADERS: Record<string, LensComponentLoader> = {
  home: () => import('../components/lens-renderers/HomeLens.astro'),
  newest: () => import('../components/lens-renderers/NewestLens.astro'),
};
