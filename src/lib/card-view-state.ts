// Card view-state tracking.
//
// Each card has a view state: unseen (default), displayed (appeared as excerpt),
// or read (visitor opened the full card). State is keyed by (uid, contentHash)
// so that editing a card (changing its content) resets it to unseen.
//
// Stored in localStorage under namespaced keys.

export type CardViewState = 'unseen' | 'displayed' | 'read';

const LS_PREFIX = 'pdyxs:view-state:';

type StoredEntry = {
  hash: string;
  state: 'displayed' | 'read';
};

function storageKey(uid: string): string {
  return `${LS_PREFIX}${uid}`;
}

/**
 * Returns the current view state for a card.
 * Returns 'unseen' if no entry exists or if the stored hash doesn't match
 * (meaning the card's content has changed).
 */
export function getViewState(uid: string, contentHash: string): CardViewState {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (raw === null) return 'unseen';
    const entry: StoredEntry = JSON.parse(raw);
    if (entry.hash !== contentHash) return 'unseen';
    return entry.state;
  } catch {
    return 'unseen';
  }
}

/**
 * Records that a card has been displayed (appeared as an excerpt on the front page).
 * Does not downgrade an existing 'read' state.
 */
export function markDisplayed(uid: string, contentHash: string): void {
  const current = getViewState(uid, contentHash);
  if (current === 'read') return; // don't downgrade
  const entry: StoredEntry = { hash: contentHash, state: 'displayed' };
  localStorage.setItem(storageKey(uid), JSON.stringify(entry));
}

/**
 * Records that a card has been read (visitor opened the full card).
 */
export function markRead(uid: string, contentHash: string): void {
  const entry: StoredEntry = { hash: contentHash, state: 'read' };
  localStorage.setItem(storageKey(uid), JSON.stringify(entry));
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
