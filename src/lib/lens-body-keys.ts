// The legal set of bespoke lens body loaders — the names a lens may name in
// its `component:` field.
//
// This is a deliberate LEAF, for the same reason src/lib/home-slots.ts is one:
// scripts/generate-lens-registry.mjs validates against it at generation time,
// and a build script must not reach lens-components.ts, which imports .astro
// components behind dynamic import(). The list is the contract; the loader map
// is one consumer of it and the generator is the other.
//
// Why the generator is where this is enforced: `component` DEFAULTS TO THE
// LENS ID, so by the time the registry is generated, "the author wrote
// `component: histroy`" and "the author wrote nothing and the lens is called
// `newest`" look identical. The generator is the last point that can still
// tell them apart, which is exactly where parseHomeSlots is called for the
// same reason.
//
// The rule, therefore:
//
//   - `component:` DECLARED  -> must be one of these names, or it is a build error
//   - `component:` ABSENT    -> the browse-lens family (DEFAULT_BODY_LOADER)
//
// So `interesting`, `newest` and `oldest` declare nothing and legitimately
// fall through, while a typo in a declared name fails the build instead of
// silently rendering the default browse body — which looks plausible enough
// that nobody would notice (issue #174).
export const LENS_BODY_KEYS = ['home', 'editorial', 'history', 'audit'] as const;

export type LensBodyKey = (typeof LENS_BODY_KEYS)[number];

/** True if `name` is a registered bespoke lens body. */
export function isLensBodyKey(name: string): name is LensBodyKey {
  return (LENS_BODY_KEYS as readonly string[]).includes(name);
}
