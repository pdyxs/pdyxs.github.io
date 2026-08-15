// Card view-state tracking — ONE seen concept: did the visitor open this card?
//
// There are two questions, and they are deliberately keyed differently
// (issue #83, decided in #68):
//
//   - **Unseen-ness** — keyed on (uid, contentHash). Editing a card changes its
//     hash and returns it to `unseen`: "this changed, look again" is the
//     feature, and it is what feeds the ranking chain's unseen-before-seen rung.
//   - **`readAt`** — keyed on uid ALONE. A card you definitely read vanishing
//     from your history because the author fixed a typo is a lie. The hash
//     affects *freshness*, not *whether it happened*.
//
// One stored entry serves both; only the read path differs in whether it
// compares the hash.
//
// The previous `displayed` tier ("appeared as an excerpt on the front page")
// is gone. It was largely self-cancelling — marking a card displayed removed it
// from the unseen tier, re-rolling the day-seeded pick, so the tier existed
// mainly to undo its own churn.
//
// Migration: entries written before this change are `{ hash, state:
// 'displayed' | 'read', displayedDate? }`. A `read` entry is still a read entry
// — it simply has no `readAt`, which sorts last (see compareReadAt), so history
// survives. A `displayed` entry decays to `unseen`, which is the honest reading
// of the collapsed concept: they were shown the card and didn't open it. Those
// keys are left in place rather than swept — a one-line guard in the parser
// costs less than a migration pass that has to be carried forever, and the key
// is overwritten the moment the card is actually read.
//
// Stored in localStorage under namespaced keys.

import { locationKind } from './stack-layout';

export type CardViewState = 'unseen' | 'read';

const LS_PREFIX = 'pdyxs:view-state:';

type StoredEntry = {
  /** The card's content hash as it stood when the card was read. */
  hash: string;
  state: 'read';
  /** ISO timestamp of the most recent read. Absent on pre-#83 entries. */
  readAt?: string;
};

function storageKey(uid: string): string {
  return `${LS_PREFIX}${uid}`;
}

/**
 * The stored entry for a card, or null when there is none, it can't be parsed,
 * or it is a pre-#83 `displayed` entry (which is not a read — see above).
 *
 * Hash-agnostic on purpose: the two public readers below differ only in whether
 * they go on to compare it.
 */
function readEntry(uid: string): StoredEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (raw === null) return null;
    const entry = JSON.parse(raw) as StoredEntry;
    if (entry?.state !== 'read') return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * Returns the current view state for a card.
 * Returns 'unseen' if no entry exists or if the stored hash doesn't match
 * (meaning the card's content has changed since it was read).
 */
export function getViewState(uid: string, contentHash: string): CardViewState {
  const entry = readEntry(uid);
  if (!entry || entry.hash !== contentHash) return 'unseen';
  return 'read';
}

/**
 * When the card was last read, as an ISO timestamp — or null if it never was.
 *
 * Keyed on uid alone: this answers "did this happen", which no later edit to
 * the card can undo. Null for a card read before #83, which is why every
 * consumer must sort a missing value last rather than treating it as epoch.
 */
export function getReadAt(uid: string): string | null {
  return readEntry(uid)?.readAt ?? null;
}

/** Whether the visitor has ever read this card, regardless of later edits. */
export function hasBeenRead(uid: string): boolean {
  return readEntry(uid) !== null;
}

/**
 * Orders two `readAt` values most-recent-first, with a missing timestamp last.
 *
 * Missing means "read, at an unknown time" (a pre-#83 entry), never "not read"
 * — so it belongs at the end of a history list rather than at the epoch end of
 * it, where it would claim to be the oldest thing the visitor ever read.
 */
export function compareReadAt(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

/**
 * Records that a card has been read (visitor opened the full card).
 *
 * `readAt` is the *most recent* read, not the first: re-opening a card after an
 * edit is a fresh act, and a history list is more useful ordered by when you
 * last looked at something.
 *
 * @param readAt - ISO timestamp; defaults to now. Parameterised for tests.
 */
export function markRead(uid: string, contentHash: string, readAt?: string): void {
  const entry: StoredEntry = {
    hash: contentHash,
    state: 'read',
    readAt: readAt ?? new Date().toISOString(),
  };
  localStorage.setItem(storageKey(uid), JSON.stringify(entry));
}

/**
 * The read to record for a location, given the HTML fragment rendered for it —
 * or null when there is nothing to record.
 *
 * The one decision behind every `markRead` call site, so the same rules hold on
 * a client-side stack push, a popstate, and a cold page load (#92):
 *
 *   - **Only card locations count.** A lens (`lens/<name>`) and a collection
 *     view (`posts`) are listings; they have no single card identity, and their
 *     fragments carry no `data-content-hash` for a hash-keyed entry anyway.
 *   - **Only a fragment that declares a hash counts.** The hash is rendered by
 *     `CardStackCard.astro`, and it must be byte-identical to the pool's or
 *     `getViewState` treats every later visit as changed content.
 *
 * Pure: it parses the fragment and decides; the caller does the writing.
 */
export function readToRecord(
  uid: string | null | undefined,
  html: string | null | undefined,
): { uid: string; hash: string } | null {
  if (!uid || !html) return null;
  if (locationKind(uid) !== 'card') return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const hash = tmp.querySelector('.stack-card')?.getAttribute('data-content-hash');
  return hash ? { uid, hash } : null;
}

/**
 * Clears all view state from localStorage. Intended for testing and manual reset.
 */
export function clearViewState(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(LS_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
