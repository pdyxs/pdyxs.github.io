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
// So: `key` is what `activeKey`, `findIndex` and the stack codec use; `slot`
// is what `data-uid`, the fragment cache, `querySelector` and the `{#each}`
// key use. Never conflate them at a call site.
import { lensKey, type KeyParamPairs } from './lens-key';

export interface LocationEntry {
  key: string;   // identity within the stack: activeKey / findIndex / serialisation
  uid: string;   // fetchable identity ("collection/id" or "lens/<name>")
  slot: string;  // stable DOM + fragment-cache handle; never changes once assigned
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

/** The DOM/cache handle for an identity key, or null when it isn't stacked. */
export function slotForKey(state: StackState, key: string | null): string | null {
  if (!key) return null;
  return state.entries.find(e => e.key === key)?.slot ?? null;
}

/** The identity key of the entry occupying `slot`, or null. */
export function keyForSlot(state: StackState, slot: string): string | null {
  return state.entries.find(e => e.slot === slot)?.key ?? null;
}

export interface StackState {
  entries: LocationEntry[];
  activeKey: string | null;
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

export interface LayoutCard {
  key: string;
  slot: string;
  stackIndex: number;
  isActive: boolean;
  isCollapsed: boolean;
  side: 'left' | 'right' | 'active';
}

/** A stacked location as the overflow menu needs it: identity plus handle. */
export interface HiddenRef {
  key: string;
  slot: string;
}

export type RenderItem =
  | { kind: 'card'; key: string; slot: string; stackIndex: number; isActive: boolean; side: 'left' | 'right' | 'active' }
  | { kind: 'fan-corner'; forKey: string; i: number; n: number }
  | { kind: 'overflow'; side: 'left' | 'right'; stackIndex: number; hidden: HiddenRef[] };

export interface LayoutResult {
  visible: LayoutCard[];
  overflowKeys: string[];
  needsOverflow: boolean;
  renderItems: RenderItem[];
  numLeftCollapsed: number;
  numRightCollapsed: number;
}

export const STAGGER_PX = 8;

export function computeStackLayout(state: StackState): LayoutResult {
  const { entries, activeKey } = state;

  if (entries.length === 0) {
    return { visible: [], overflowKeys: [], needsOverflow: false, renderItems: [], numLeftCollapsed: 0, numRightCollapsed: 0 };
  }

  let activeIdx = activeKey ? entries.findIndex(e => e.key === activeKey) : -1;
  if (activeIdx === -1) activeIdx = entries.length - 1;

  const leftEntries = entries.slice(0, activeIdx);
  const rightEntries = entries.slice(activeIdx + 1);
  const L = leftEntries.length;
  const R = rightEntries.length;

  // Left visible slots: L=0→nothing, L=1→[card], L=2→[card,card], L≥3→[card,overflow,card]
  type LeftSlot = { kind: 'card'; key: string; slot: string; stackIndex: number } | { kind: 'overflow'; stackIndex: number };
  const leftSlots: LeftSlot[] = [];
  const leftHidden: HiddenRef[] = [];
  const asCardSlot = (e: LocationEntry, stackIndex: number): LeftSlot =>
    ({ kind: 'card', key: e.key, slot: e.slot, stackIndex });

  if (L === 1) {
    leftSlots.push(asCardSlot(leftEntries[0], 0));
  } else if (L === 2) {
    leftSlots.push(asCardSlot(leftEntries[0], 0));
    leftSlots.push(asCardSlot(leftEntries[1], 1));
  } else if (L >= 3) {
    leftSlots.push(asCardSlot(leftEntries[0], 0));
    leftSlots.push({ kind: 'overflow', stackIndex: 1 });
    leftHidden.push(...leftEntries.slice(1, L - 1).map(e => ({ key: e.key, slot: e.slot })));
    leftSlots.push(asCardSlot(leftEntries[L - 1], 2));
  }

  // Right visible slots: same shape, no fan corners
  type RightSlot = { kind: 'card'; key: string; slot: string } | { kind: 'overflow' };
  const rightSlots: RightSlot[] = [];
  const rightHidden: HiddenRef[] = [];
  const asRightSlot = (e: LocationEntry): RightSlot => ({ kind: 'card', key: e.key, slot: e.slot });

  if (R === 1) {
    rightSlots.push(asRightSlot(rightEntries[0]));
  } else if (R === 2) {
    rightSlots.push(asRightSlot(rightEntries[0]));
    rightSlots.push(asRightSlot(rightEntries[1]));
  } else if (R >= 3) {
    rightSlots.push(asRightSlot(rightEntries[0]));
    rightSlots.push({ kind: 'overflow' });
    rightHidden.push(...rightEntries.slice(1, R - 1).map(e => ({ key: e.key, slot: e.slot })));
    rightSlots.push(asRightSlot(rightEntries[R - 1]));
  }

  const numLeftCollapsed = leftSlots.length;
  const n = numLeftCollapsed;

  const renderItems: RenderItem[] = [];
  const visible: LayoutCard[] = [];

  // Left slots with fan corners before each
  leftSlots.forEach((slot, i) => {
    const fanForKey = slot.kind === 'overflow' ? 'overflow-left' : slot.slot;
    renderItems.push({ kind: 'fan-corner', forKey: fanForKey, i, n });

    if (slot.kind === 'overflow') {
      renderItems.push({ kind: 'overflow', side: 'left', stackIndex: slot.stackIndex, hidden: leftHidden });
    } else {
      renderItems.push({ kind: 'card', key: slot.key, slot: slot.slot, stackIndex: slot.stackIndex, isActive: false, side: 'left' });
      visible.push({ key: slot.key, slot: slot.slot, stackIndex: slot.stackIndex, isActive: false, isCollapsed: true, side: 'left' });
    }
  });

  // Active card
  const activeEntry = entries[activeIdx];
  renderItems.push({ kind: 'card', key: activeEntry.key, slot: activeEntry.slot, stackIndex: numLeftCollapsed, isActive: true, side: 'active' });
  visible.push({ key: activeEntry.key, slot: activeEntry.slot, stackIndex: numLeftCollapsed, isActive: true, isCollapsed: false, side: 'active' });

  // Right slots (no fan corners)
  rightSlots.forEach((slot, rightIdx) => {
    if (slot.kind === 'overflow') {
      renderItems.push({ kind: 'overflow', side: 'right', stackIndex: rightIdx, hidden: rightHidden });
    } else {
      renderItems.push({ kind: 'card', key: slot.key, slot: slot.slot, stackIndex: rightIdx, isActive: false, side: 'right' });
      visible.push({ key: slot.key, slot: slot.slot, stackIndex: rightIdx, isActive: false, isCollapsed: true, side: 'right' });
    }
  });

  const overflowKeys = [...leftHidden, ...rightHidden].map(h => h.key);
  const needsOverflow = L > 2 || R > 2;

  return { visible, overflowKeys, needsOverflow, renderItems, numLeftCollapsed, numRightCollapsed: rightSlots.length };
}
