export function mergeEffectiveTags(...arrays: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of arrays) {
    for (const tag of arr) {
      if (!seen.has(tag)) {
        seen.add(tag);
        result.push(tag);
      }
    }
  }
  return result;
}

/**
 * Derives a card's folder-derived tag from its dimension-rooted uid
 * ("<dimension>/<value...>/<slug>"). The first path segment is the filter
 * dimension; every remaining directory segment (i.e. everything between the
 * dimension and the file's own slug) is the tag value. A file always
 * expresses exactly one folder-derived tag.
 */
export function derivePathTags(uid: string): string[] {
  const parts = uid.split('/');
  const dimension = parts[0];
  const value = parts.slice(1, -1).join('/');
  return [`${dimension}:${value}`];
}
