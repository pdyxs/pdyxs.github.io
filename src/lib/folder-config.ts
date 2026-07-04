import { load as parseYaml } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content');

/** A cached reader of files under src/content, shared by any caller that needs to read `_config.yaml`s (or other content-relative files) without re-reading the same path twice. */
export function makeFileReader() {
  const cache = new Map<string, string | null>();
  return async (path: string): Promise<string | null> => {
    if (cache.has(path)) return cache.get(path)!;
    try {
      const text = await readFile(resolve(CONTENT_DIR, path), 'utf-8');
      cache.set(path, text);
      return text;
    } catch {
      cache.set(path, null);
      return null;
    }
  };
}

export type FolderCascade = {
  /** Nearest-ancestor `_config.yaml` `renderer`, or undefined if no ancestor sets one. */
  renderer?: string;
  /** Cascade tags accumulated across every ancestor `_config.yaml` (union, order-preserving, dedup). */
  cascadeTags: string[];
  /** This folder's own tag identity (name/description) — not inherited by descendants. */
  tagIdentity: { name?: string; description?: string };
};

type ConfigFile = {
  renderer?: string;
  tags?: string[];
  name?: string;
  description?: string;
};

/**
 * Walks from the collection root down to a file's own directory, reading
 * `_config.yaml` at every level. Unifies what used to be two separate,
 * half-wired mechanisms (a single-level renderer read and a multi-level tag
 * read) into one ancestor walk.
 */
export async function resolveFolderCascade(
  collection: string,
  id: string,
  reader: (path: string) => Promise<string | null>
): Promise<FolderCascade> {
  const parts = id.split('/');
  const dirs = parts.slice(0, -1);

  // ancestor directories: collection root, then each nested subdirectory down
  // to (and including) the file's own containing directory.
  const candidates = [collection, ...dirs.map((_, i) => [collection, ...dirs.slice(0, i + 1)].join('/'))];

  let renderer: string | undefined;
  const cascadeTags: string[] = [];
  const seenTags = new Set<string>();
  let tagIdentity: { name?: string; description?: string } = {};

  for (let i = 0; i < candidates.length; i++) {
    const text = await reader(`${candidates[i]}/_config.yaml`);
    if (!text) continue;
    const parsed = (parseYaml(text) as ConfigFile | null) ?? {};

    if (parsed.renderer) renderer = parsed.renderer;

    if (parsed.tags) {
      for (const tag of parsed.tags) {
        if (!seenTags.has(tag)) {
          seenTags.add(tag);
          cascadeTags.push(tag);
        }
      }
    }

    // Tag identity belongs only to the file's own (nearest) directory — it
    // does not cascade to descendants — so only the last candidate counts.
    if (i === candidates.length - 1 && (parsed.name || parsed.description)) {
      tagIdentity = { name: parsed.name, description: parsed.description };
    }
  }

  return { renderer, cascadeTags, tagIdentity };
}
