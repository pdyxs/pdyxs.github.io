// Pure path → uid derivation, mirroring the id semantics of the Astro glob
// loaders configured in src/content.config.ts:
//   content: glob({ pattern: "**/[!_]*.{md,mdx}", base: "./src/content" })
//   tag:     glob({ pattern: "**/[!_]*.yaml", base: "./src/content/tag" })
//
// Used by scripts/generate-stack-manifest.mjs to enumerate uids without
// needing the astro:content runtime (which is only available inside an
// Astro dev/build process). Kept in sync with cards.ts's uid shape
// ("collection/id") by construction, not by re-deriving titles/metadata —
// this module only ever needs the identity string, never the content.

function stripIndexSuffix(idNoExt: string): string {
  if (idNoExt === 'index') return '';
  return idNoExt.endsWith('/index') ? idNoExt.slice(0, -'/index'.length) : idNoExt;
}

/**
 * Derives a content uid ("collection/id") from a path relative to
 * src/content, e.g. "projects/art-heist/index.md" -> "projects/art-heist".
 */
export function uidFromContentPath(relPath: string): string {
  const noExt = relPath.replace(/\.(md|mdx)$/i, '');
  return stripIndexSuffix(noExt);
}

/**
 * Derives a tag uid ("tag/id") from a path relative to src/content/tag,
 * e.g. "what/posts.yaml" -> "tag/what/posts".
 */
export function uidFromTagPath(relPath: string): string {
  const noExt = relPath.replace(/\.yaml$/i, '');
  return `tag/${stripIndexSuffix(noExt)}`;
}
