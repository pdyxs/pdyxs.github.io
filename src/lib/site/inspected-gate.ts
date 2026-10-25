import { FIVE_W_DIMENSIONS } from '../content/tags/five-w.ts';

/**
 * The `main`-only publish assertion (docs/plans/publishing-pipeline.md §6).
 *
 * Whole-tree: given every card, returns the uids whose `inspected` is not
 * exactly `true`. ABSENT counts as not inspected, matching audit.ts's
 * `not-inspected` detect and the `why:uninspected` facet, so the site has one
 * definition of inspected. A non-empty result fails CI before the build; it
 * never filters, because filtering would unpublish a live URL.
 */
export interface InspectableCard {
  uid: string;
  inspected?: unknown;
}

export function uninspectedCards(cards: readonly InspectableCard[]): string[] {
  return cards.filter(c => c.inspected !== true).map(c => c.uid);
}

/**
 * Sets `inspected: false` on a card's raw source, textually. A gray-matter
 * round-trip would rewrite the whole frontmatter block (quoting, comments,
 * key order); this touches one line. Rollback's step 2 (§7).
 */
export function setInspectedFalse(raw: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return `---\ninspected: false\n---\n${raw}`;
  const lines = match[1].split('\n');
  const idx = lines.findIndex(l => /^inspected\s*:/.test(l));
  if (idx === -1) lines.unshift('inspected: false');
  else lines[idx] = 'inspected: false';
  return raw.slice(0, match.index) + `---\n${lines.join('\n')}\n---` + raw.slice(match.index + match[0].length);
}

/** The card file a uid (`what/projects/foo`) lives at; throws on anything that is not a card uid. */
export function cardFileForUid(uid: string): string {
  const parts = uid.split('/');
  const valid =
    parts.length >= 2 &&
    (FIVE_W_DIMENSIONS as readonly string[]).includes(parts[0]) &&
    parts.every(p => p !== '' && !p.startsWith('.') && !p.startsWith('_'));
  if (!valid) throw new Error(`not a card uid: "${uid}"`);
  return `src/content/${uid}/index.md`;
}

export interface RollbackFacts {
  /** The card directory exists on `main` right now. */
  onMain: boolean;
  /** The last commit on `main` to touch the card is the one that added it. */
  addedByLastChange: boolean;
}

/** Rollback step 1 on `main`: restore the last-good version, or remove a card that is new. */
export function planRollbackStep(facts: RollbackFacts): 'restore' | 'remove' {
  if (!facts.onMain) throw new Error('refusing to roll back: card is not on main');
  return facts.addedByLastChange ? 'remove' : 'restore';
}
