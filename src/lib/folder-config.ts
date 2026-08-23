import { load as parseYaml } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Explicit .ts extension: this module is loaded by Node build scripts via
// type stripping, which does no extension resolution.
import { assertContentRoot } from './content-root.ts';
import { normaliseAuthoredTags } from './five-w.ts';
import { parseFolderSort, type FolderSort } from './folder-sort.ts';

/** A cached reader of files under src/content, shared by any caller that needs to read `_config.yaml`s (or other content-relative files) without re-reading the same path twice. */
export function makeFileReader() {
  // Resolved (and verified) once per reader, never from this module's own
  // location — see content-root.ts for why that distinction is load-bearing.
  const contentRoot = assertContentRoot();
  const cache = new Map<string, string | null>();
  return async (path: string): Promise<string | null> => {
    if (cache.has(path)) return cache.get(path)!;
    try {
      const text = await readFile(resolve(contentRoot, path), 'utf-8');
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
   * `excludeTags` accumulated across every ancestor `_config.yaml` (union,
   * order-preserving, dedup) — see exclude-tags.ts.
   *
   * ACCUMULATES, like `cascadeTags` and unlike the nearest-wins scalars around
   * it. That follows the list-valued precedent rather than breaking the
   * nearest-wins rule: an exclusion is a statement about one tag, so a card
   * naming its own has not thereby withdrawn its folder's. `what/puzzles`
   * excludes `generated/location` for all 20 puzzles; a single puzzle adding
   * an exclusion of its own must not silently take every puzzle's location
   * derivation back.
   */
  excludeTags: string[];
  /**
   * Nearest-ancestor value for each requested override key (see the
   * `frontmatterKeys` param) — just `difficulty` now, since the two keys that
   * were true overrides (`location`, `era`) were retired in issue #116. Only
   * keys that appear in some ancestor `_config.yaml` are present. Nearest-wins,
   * like `renderer`.
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
  /**
   * Nearest-ancestor `width` — the per-location card width (a CSS length) every
   * card in the folder gets unless its own frontmatter overrides it. Cards in a
   * folder usually share a shape: puzzles are a square grid image and want a
   * narrower card than a page of prose. Nearest-wins, like `renderer`.
   */
  width?: string;
  /**
   * Nearest-ancestor `gallery` — `false` suppresses the card's image gallery.
   * The gallery exists to surface media the body doesn't show; a folder whose
   * cards *are* one image (puzzles: the grid, already the masthead) has nothing
   * left for it to add. Nearest-wins, like `renderer`.
   */
  gallery?: boolean;
  /**
   * The SUM of every ancestor `_config.yaml` `priority` — the one cascading key
   * that accumulates rather than nearest-wins, because a boost on `what` and a
   * boost on `what/puzzles` are two separate statements and the deeper one is
   * not a correction of the shallower. See priority.ts for the whole rule
   * (frontmatter and `.tag.yaml` declarations add on top of this) and CLAUDE.md
   * for why the name is kept anyway.
   *
   * Absent when no ancestor declares one, so a caller can tell "nothing said"
   * from a deliberate `priority: 0`.
   */
  priority?: number;
  /**
   * Nearest-ancestor `sort` — how this folder's cards order among themselves
   * once the ranking chain gets that far (rung 5). Parsed from `sort:
   * difficulty asc`; an unparseable value is treated as undeclared. Nearest-
   * wins, like `renderer` — NOT additive like `priority`.
   */
  sort?: FolderSort;
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
  width?: string;
  gallery?: boolean;
  priority?: number;
  sort?: string;
  excludeTags?: string[];
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
  frontmatterKeys: string[] = []
): Promise<FolderCascade> {
  const parts = uid.split('/');
  const dirs = parts.slice(0, -1);

  const candidates = dirs.map((_, i) => dirs.slice(0, i + 1).join('/'));

  let renderer: string | undefined;
  let navRenderer: string | undefined;
  let status: string | undefined;
  let cardDescriptionParts: string[] | undefined;
  let dateLabel: string | undefined;
  let width: string | undefined;
  let gallery: boolean | undefined;
  let priority: number | undefined;
  let sort: FolderSort | undefined;
  const cascadeTags: string[] = [];
  const seenTags = new Set<string>();
  const excludeTags: string[] = [];
  const seenExcludes = new Set<string>();
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
    if (parsed.width) width = parsed.width;
    // Explicit typeof check, not truthiness: `gallery: false` is the whole point.
    if (typeof parsed.gallery === 'boolean') gallery = parsed.gallery;
    // `priority` ACCUMULATES — every other key here replaces. See priority.ts.
    if (typeof parsed.priority === 'number') priority = (priority ?? 0) + parsed.priority;
    const parsedSort = parseFolderSort(parsed.sort);
    if (parsedSort) sort = parsedSort;
    if (Array.isArray(parsed.cardDescriptionParts)) {
      cardDescriptionParts = parsed.cardDescriptionParts.filter(
        (p): p is string => typeof p === 'string'
      );
    }

    if (parsed.tags) {
      // Same authored → canonical normalisation as the frontmatter `tags`
      // field in content.config.ts, so a folder default is written the same
      // way a card's own tag is. See normaliseAuthoredTag in five-w.ts.
      for (const tag of normaliseAuthoredTags(parsed.tags)) {
        if (!seenTags.has(tag)) {
          seenTags.add(tag);
          cascadeTags.push(tag);
        }
      }
    }

    if (Array.isArray(parsed.excludeTags)) {
      // Union, not replace — see the FolderCascade field comment. Left in the
      // AUTHORED form: parseExcludeTags owns the `generated/` interception and
      // the authored → canonical normalisation, and doing half of it here
      // would put a second copy of that boundary in this module.
      for (const entry of parsed.excludeTags) {
        if (typeof entry !== 'string') continue;
        if (seenExcludes.has(entry)) continue;
        seenExcludes.add(entry);
        excludeTags.push(entry);
      }
    }

    // Generator-read fields cascade nearest-wins, like `renderer`: a deeper
    // candidate overwrites a shallower one. Kept generic — this module owns no
    // knowledge of any specific generator's field.
    for (const key of frontmatterKeys) {
      const value = parsed[key];
      if (typeof value === 'string') overrides[key] = value;
    }

    // Tag identity belongs only to the file's own (nearest) directory — it
    // does not cascade to descendants — so only the last candidate counts.
    if (i === candidates.length - 1 && (parsed.name || parsed.description)) {
      tagIdentity = { name: parsed.name, description: parsed.description };
    }
  }

  return { renderer, navRenderer, status, cardDescriptionParts, dateLabel, width, gallery, priority, sort, cascadeTags, excludeTags, overrides, tagIdentity };
}
