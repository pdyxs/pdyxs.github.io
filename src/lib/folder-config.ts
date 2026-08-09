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
  /** Nearest-ancestor `_config.yaml` `navRenderer` (nav-shell renderer name), or undefined if none. */
  navRenderer?: string;
  /**
   * Nearest-ancestor `_config.yaml` `status` (publish-lifecycle value), or
   * undefined if no ancestor sets one — a card with neither a frontmatter nor
   * cascaded status resolves to `published` (see computeStatusVisibility /
   * getAllCards). Nearest-wins, like `renderer`.
   */
  status?: string;
  /** Cascade tags accumulated across every ancestor `_config.yaml` (union, order-preserving, dedup). */
  cascadeTags: string[];
  /**
   * Nearest-ancestor value for each requested override key (see the
   * `overrideKeys` param) — e.g. a generator's `location` override. Only keys
   * that appear in some ancestor `_config.yaml` are present. Nearest-wins, like
   * `renderer`.
   */
  overrides: Record<string, string>;
  /**
   * Nearest-ancestor `cardDescriptionParts` — a list of `{{field}}` templates
   * used to synthesise a fallback description for cards in this folder that
   * declare none (see resolveCardDescription). Nearest-wins, like `renderer`.
   */
  cardDescriptionParts?: string[];
  /**
   * Nearest-ancestor `dateLabel` — the declared meaning of a card's date
   * ("Published", "Released", …), which doubles as the switch for whether a
   * dateline shows at all (see resolveDateline in card-date.ts). Nearest-wins,
   * like `renderer`; the reserved value "none" suppresses an inherited label.
   */
  dateLabel?: string;
  /** This folder's own tag identity (name/description) — not inherited by descendants. */
  tagIdentity: { name?: string; description?: string };
};

type ConfigFile = {
  renderer?: string;
  navRenderer?: string;
  status?: string;
  tags?: string[];
  name?: string;
  description?: string;
  cardDescriptionParts?: string[];
  dateLabel?: string;
  [key: string]: unknown;
};

/**
 * Walks from the dimension root down to a file's own directory, reading
 * `_config.yaml` at every level. Unifies what used to be two separate,
 * half-wired mechanisms (a single-level renderer read and a multi-level tag
 * read) into one ancestor walk.
 *
 * Takes the file's full uid relative to `src/content` (e.g.
 * "what/projects/games/x") — every prefix of its directory portion is a
 * candidate ancestor, from the first path segment down to (and including)
 * the file's own containing directory. The file's own pseudo-directory
 * (its last path segment, whether that's a flat file's stem or a
 * card-as-folder's slug) is never itself a candidate — cascade only applies
 * to descendants of a config, not the file that config's directory holds.
 */
export async function resolveFolderCascade(
  uid: string,
  reader: (path: string) => Promise<string | null>,
  overrideKeys: string[] = []
): Promise<FolderCascade> {
  const parts = uid.split('/');
  const dirs = parts.slice(0, -1);

  const candidates = dirs.map((_, i) => dirs.slice(0, i + 1).join('/'));

  let renderer: string | undefined;
  let navRenderer: string | undefined;
  let status: string | undefined;
  let cardDescriptionParts: string[] | undefined;
  let dateLabel: string | undefined;
  const cascadeTags: string[] = [];
  const seenTags = new Set<string>();
  const overrides: Record<string, string> = {};
  let tagIdentity: { name?: string; description?: string } = {};

  for (let i = 0; i < candidates.length; i++) {
    const text = await reader(`${candidates[i]}/_config.yaml`);
    if (!text) continue;
    const parsed = (parseYaml(text) as ConfigFile | null) ?? {};

    if (parsed.renderer) renderer = parsed.renderer;
    if (parsed.navRenderer) navRenderer = parsed.navRenderer;
    if (parsed.status) status = parsed.status;
    if (parsed.dateLabel) dateLabel = parsed.dateLabel;
    if (Array.isArray(parsed.cardDescriptionParts)) {
      cardDescriptionParts = parsed.cardDescriptionParts.filter(
        (p): p is string => typeof p === 'string'
      );
    }

    if (parsed.tags) {
      for (const tag of parsed.tags) {
        if (!seenTags.has(tag)) {
          seenTags.add(tag);
          cascadeTags.push(tag);
        }
      }
    }

    // Override keys cascade nearest-wins, like `renderer`: a deeper candidate
    // overwrites a shallower one. Kept generic — this module owns no knowledge
    // of any specific generator's key.
    for (const key of overrideKeys) {
      const value = parsed[key];
      if (typeof value === 'string') overrides[key] = value;
    }

    // Tag identity belongs only to the file's own (nearest) directory — it
    // does not cascade to descendants — so only the last candidate counts.
    if (i === candidates.length - 1 && (parsed.name || parsed.description)) {
      tagIdentity = { name: parsed.name, description: parsed.description };
    }
  }

  return { renderer, navRenderer, status, cardDescriptionParts, dateLabel, cascadeTags, overrides, tagIdentity };
}
