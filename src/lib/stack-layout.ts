// A stack location is a single slot in the card-stack navigation history.
// Three strings, and they are deliberately three (issue #100):
//
//   uid   what gets FETCHED   `what/puzzles/foo`, `lens/interesting`
//   key   what the location IS `lens/interesting?filter.what=puzzles`
//   slot  the DOM/cache HANDLE `lens/interesting`, `lens/interesting#2`
//
// For a card all three are equal, which is why they used to be two and then
// one. A *filtered lens* separates them: it is fetched as the bare lens
// (filtering is client-side), it is identified by the lens plus its filter
// set (see lens-key.ts), and it needs a handle that survives its identity
// changing — editing a filter re-keys the location, and the mounted islands
// inside its fragment (the filter panel's open/drill state, the browse
// body's revealed rows) must not be destroyed by that.
//
// So: `slot` is what ADDRESSES an entry — `activeSlot`, every `findIndex` in
// the store and the layout, `data-uid`, the fragment cache, `querySelector`
// and the `{#each}` key. `key` is what the entry *is*: it is serialised into
// the URL, and it is what push-matching compares to decide re-activate vs
// push. Never conflate them at a call site.
//
// Addressing by slot rather than by key is issue #106. A stack is the path you
// walked, and a path can pass the same place twice: clear the filters on a
// second view of a lens and it becomes the unfiltered view already sitting
// behind it. Both entries stay — an entry vanishing from your breadcrumb is
// worse than two that look alike — so keys are NOT unique, and anything that
// resolves an entry by key is ambiguous. Slots are unique by construction
// (`allocateSlot`), so addressing by slot makes the ambiguity unrepresentable
// rather than adjudicated.
import { lensKey, type KeyParamPairs } from './lens-key';

export interface LocationEntry {
  key: string;   // what the location IS: serialisation + push-matching. NOT unique.
  uid: string;   // fetchable identity ("collection/id" or "lens/<name>")
  slot: string;  // the entry's ADDRESS: unique, stable DOM + fragment-cache handle
}

/** Builds a card location entry. For card locations, key === uid === slot. */
export function cardEntry(uid: string): LocationEntry {
  return { key: uid, uid, slot: uid };
}

/**
 * Builds a lens location entry. The filter set rides in the key; the uid and
 * slot stay the bare `lens/<name>` (pass `slot` to place a second,
 * differently-filtered instance of the same lens — see allocateSlot).
 */
export function lensEntry(name: string, filters: KeyParamPairs = [], slot?: string): LocationEntry {
  const uid = `lens/${name}`;
  return { key: lensKey(name, filters), uid, slot: slot ?? uid };
}

/**
 * A slot not already taken by an entry in `entries`. Two differently-filtered
 * views of one lens both want `lens/<name>`; the second gets `lens/<name>#2`.
 * Pure and deterministic, so the same stack always allocates the same handle.
 */
export function allocateSlot(entries: readonly LocationEntry[], preferred: string): string {
  const taken = new Set(entries.map(e => e.slot));
  if (!taken.has(preferred)) return preferred;
  for (let n = 2; ; n++) {
    const candidate = `${preferred}#${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Returns `entry` with a slot guaranteed not to clash with `entries`. */
export function withFreeSlot(entries: readonly LocationEntry[], entry: LocationEntry): LocationEntry {
  const slot = allocateSlot(entries, entry.slot);
  return slot === entry.slot ? entry : { ...entry, slot };
}

/**
 * The DOM/cache handle of the FIRST entry holding an identity key, or null
 * when it isn't stacked. Keys are not unique (see the note at the top), so
 * this is only for looking up a location the caller knows is stacked once —
 * the home lens. Never use it to resolve "where the visitor is": that is
 * `state.activeSlot`, which is unambiguous.
 */
export function slotForKey(state: StackState, key: string | null): string | null {
  if (!key) return null;
  return state.entries.find(e => e.key === key)?.slot ?? null;
}

/** The entry occupying `slot`, or null. */
export function entryForSlot(state: StackState, slot: string | null): LocationEntry | null {
  if (!slot) return null;
  return state.entries.find(e => e.slot === slot) ?? null;
}

/** The entry the visitor is on, or null when the stack is empty. */
export function activeEntry(state: StackState): LocationEntry | null {
  return entryForSlot(state, state.activeSlot);
}

/** The identity key of the entry occupying `slot`, or null. */
export function keyForSlot(state: StackState, slot: string): string | null {
  return state.entries.find(e => e.slot === slot)?.key ?? null;
}

export interface StackState {
  entries: LocationEntry[];
  /** The SLOT of the active entry — its address, never its identity key. */
  activeSlot: string | null;
}

// ── Presentation mode ──────────────────────────────────────────────────
// A pure decision of stack position + location type: a lens that is the
// sole/root active entry (stack depth 1) presents in "page" mode (full-page
// chrome — no border, site-header title/subtitle/divider); everything else —
// cards always, and a lens once it sits deeper in the stack — presents as a
// bordered "card". This is the single source of truth for chrome-by-position;
// the reactive class toggle in CardStack.svelte just applies it.

export type LocationKind = 'card' | 'lens';
export type PresentationMode = 'page' | 'card';

const LENS_UID_PREFIX = 'lens/';

/** Classifies a location uid: "lens/<name>" is a lens, anything else a card. */
export function locationKind(uid: string): LocationKind {
  return uid.startsWith(LENS_UID_PREFIX) ? 'lens' : 'card';
}

/** Page mode iff a lens is the sole entry (depth 1); card mode otherwise. */
export function presentationMode(kind: LocationKind, stackDepth: number): PresentationMode {
  return kind === 'lens' && stackDepth === 1 ? 'page' : 'card';
}
