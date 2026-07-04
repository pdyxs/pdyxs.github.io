// Per-location responsive width: a lens declares its width in the registry
// (lens-registry.ts); a card declares it in frontmatter. Neither source is
// reachable directly from CardStack.svelte (it has no access to
// astro:content, and importing the lens registry there would couple a client
// island to server-only modules) — so both LensStackCard.astro and
// CardStackCard.astro embed the declared width as a `data-width` attribute on
// the `.stack-card` root they render. This mirrors the existing
// `data-content-hash` pattern: location metadata travels as an attribute on
// the cached HTML fragment, not as a live object reference.
//
// extractLocationWidth is the pure decision half of that channel — parsing
// the attribute out of the fragment string. The thin effect that applies the
// result to `--max-width` lives in CardStack.svelte.

/**
 * Reads the declared width off a rendered `.stack-card` HTML fragment.
 * Returns undefined when the fragment has no `data-width` attribute (the
 * location has no declared width) or when no fragment is given yet (not
 * cached) — callers should fall back to the global --max-width default.
 */
export function extractLocationWidth(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const match = html.match(/\sdata-width="([^"]*)"/);
  return match ? match[1] : undefined;
}
