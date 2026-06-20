import { load as parseYaml } from 'js-yaml';

export async function loadDefaultsTags(
  collection: string,
  id: string,
  readFile: (path: string) => Promise<string | null>
): Promise<string[]> {
  const parts = id.split('/');
  const dirs = parts.slice(0, -1);

  // ancestor paths: collection root, then each subdirectory
  const candidates = [collection, ...dirs.map((_, i) => [collection, ...dirs.slice(0, i + 1)].join('/'))];

  const result: string[] = [];
  for (const dir of candidates) {
    const content = await readFile(`${dir}/_defaults.yaml`);
    if (!content) continue;
    const parsed = parseYaml(content) as { tags?: string[] } | null;
    if (parsed?.tags) result.push(...parsed.tags);
  }
  return result;
}

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
