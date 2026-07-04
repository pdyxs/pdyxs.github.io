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

export function derivePathTags(collection: string, id: string): string[] {
  const parts = id.split('/');
  const dirSegments = parts.slice(0, -1);
  const path = [collection, ...dirSegments].join('/');
  return [`what:${path}`];
}
