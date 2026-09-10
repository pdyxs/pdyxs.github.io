// Card priority — the second rung of the ranking comparator (ranking.ts, #80).
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ `priority` is the ONE cascading key that ACCUMULATES.                     │
// │ `renderer`, `navRenderer`, `status`, `width`, `gallery`, `dateLabel` and   │
// │ `sort` are all nearest-wins: the deepest declaration replaces the ones     │
// │ above it. `priority` instead SUMS every declaration that applies.          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// A card's priority is the sum of:
//   - its own frontmatter `priority`
//   - every ancestor folder's `_config.yaml` `priority` (see resolveFolderCascade)
//   - the `priority` on every `<value>.tag.yaml` for a tag the card carries
//
// Negative values push a card down. Nothing about the name signals any of this,
// which is why it is stated here, in CLAUDE.md and in the schema comment.
//
// The magnitude convention — hundreds to move a folder as a block, ones to sort
// within it — is the author's, not the code's: nothing here enforces a scale.
//
// **A folder counts once, as an ancestor.** A card living in `what/puzzles`
// also carries `what:puzzles` as its path tag, so a `.tag.yaml` declaring a
// priority for that same value would otherwise be added twice — and tuning
// becomes unpredictable exactly where you are trying to tune. Ancestor
// declarations win that collision; the tag hop is skipped.
//
// Pure: no fs, no Astro. The maps arrive already read (getAllCards is the
// shell).

/** A card with no declaration anywhere sits at zero — the neutral rung. */
export const DEFAULT_PRIORITY = 0;

/** Declared priorities by filter value, e.g. `{ 'who:me': 200 }`. */
export type TagPriorities = Readonly<Record<string, number>>;

/**
 * The filter values of a card's ancestor folders — every directory between the
 * dimension root and the card's own slug, in colon form.
 *
 * Exactly the candidates resolveFolderCascade walks (folder-config.ts), which
 * is what makes "counted once, as an ancestor" decidable here: a tag in this
 * set has already contributed through the cascade.
 */
export function ancestorFolderValues(uid: string): string[] {
  const dirs = uid.split('/').slice(0, -1);
  const dimension = dirs[0];
  if (!dimension) return [];
  // Skip i = 0: a bare dimension root ("what") is not a filter value.
  return dirs.slice(1).map((_, i) => `${dimension}:${dirs.slice(1, i + 2).join('/')}`);
}

/**
 * The priority a card earns from the values it is tagged with, skipping any
 * value that is one of its own ancestor folders (already counted by the
 * cascade — see above).
 *
 * Split out from resolveCardPriority because affiliation tags land on a card
 * *after* it resolves (they are a fixed point over the whole pool — see
 * affiliations.ts), so getAllCards tops up the sum with the tags it merged in.
 */
export function tagPrioritySum(
  uid: string,
  tags: readonly string[],
  tagPriorities: TagPriorities,
): number {
  const counted = new Set(ancestorFolderValues(uid));
  let total = 0;
  for (const tag of tags) {
    if (counted.has(tag)) continue;
    // Deduped as we go: a tag repeated in the effective list is still one
    // declaration.
    counted.add(tag);
    total += tagPriorities[tag] ?? 0;
  }
  return total;
}

/** The frontmatter/`_config.yaml`/`.tag.yaml` key, spelled once. */
export const PRIORITY_KEY = 'priority';

/** Levenshtein distance, capped by nothing — the inputs are single keys. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Frontmatter keys that look like a misspelling of `priority` (`priorty`,
 * `Priority`, `prioirty`).
 *
 * Zod *strips* unknown frontmatter keys rather than rejecting them, so a typo
 * is silent: the card simply never gets its boost and nothing anywhere says so.
 * `imagePad` has the same hazard and answers it with a run summary from the
 * script that consumes it; nothing consumes `priority` at author time, so the
 * observable surface is a test that scans the real content tree
 * (priority-frontmatter.test.ts) — the audit lens can't do it, because by the
 * time content reaches the audit the offending key is already gone.
 */
export function suspectedPriorityTypos(keys: readonly string[]): string[] {
  return keys.filter(key => {
    if (key === PRIORITY_KEY) return false;
    return editDistance(key.toLowerCase(), PRIORITY_KEY) <= 2;
  });
}

/**
 * A card's build-time priority: frontmatter + ancestor folders + tag
 * declarations, summed.
 */
export function resolveCardPriority(
  input: {
    uid: string;
    /** The card's own frontmatter `priority`. */
    own?: number;
    /** The summed ancestor `_config.yaml` priorities (FolderCascade.priority). */
    cascade?: number;
    /** The card's effective tags. */
    tags: readonly string[];
  },
  tagPriorities: TagPriorities = {},
): number {
  return (
    (input.own ?? 0) +
    (input.cascade ?? 0) +
    tagPrioritySum(input.uid, input.tags, tagPriorities)
  );
}
