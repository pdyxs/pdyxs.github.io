// A stack location is a single slot in the card-stack navigation history.
// At this stage every location is a card, so `key` and `uid` are always
// equal — but they're modelled separately so future location types (which
// may not have a natural uid) can generate their own stable key without
// disturbing the DOM-keying / cache-lookup contract below.
export interface LocationEntry {
  key: string;  // stable identity within the stack — DOM keying, HTML cache, activeKey/findIndex all use this
  uid: string;  // fetchable card identity ("collection/id") — used to build /card/<uid> requests
}

/** Builds a card location entry. For card locations, key === uid. */
export function cardEntry(uid: string): LocationEntry {
  return { key: uid, uid };
}

export interface StackState {
  entries: LocationEntry[];
  activeKey: string | null;
}

export interface LayoutCard {
  key: string;
  stackIndex: number;
  isActive: boolean;
  isCollapsed: boolean;
  side: 'left' | 'right' | 'active';
}

export type RenderItem =
  | { kind: 'card'; key: string; stackIndex: number; isActive: boolean; side: 'left' | 'right' | 'active' }
  | { kind: 'fan-corner'; forKey: string; i: number; n: number }
  | { kind: 'overflow'; side: 'left' | 'right'; stackIndex: number; hiddenKeys: string[] };

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
  type LeftSlot = { kind: 'card'; key: string; stackIndex: number } | { kind: 'overflow'; stackIndex: number };
  const leftSlots: LeftSlot[] = [];
  const leftHiddenKeys: string[] = [];

  if (L === 1) {
    leftSlots.push({ kind: 'card', key: leftEntries[0].key, stackIndex: 0 });
  } else if (L === 2) {
    leftSlots.push({ kind: 'card', key: leftEntries[0].key, stackIndex: 0 });
    leftSlots.push({ kind: 'card', key: leftEntries[1].key, stackIndex: 1 });
  } else if (L >= 3) {
    leftSlots.push({ kind: 'card', key: leftEntries[0].key, stackIndex: 0 });
    leftSlots.push({ kind: 'overflow', stackIndex: 1 });
    leftHiddenKeys.push(...leftEntries.slice(1, L - 1).map(e => e.key));
    leftSlots.push({ kind: 'card', key: leftEntries[L - 1].key, stackIndex: 2 });
  }

  // Right visible slots: same shape, no fan corners
  type RightSlot = { kind: 'card'; key: string } | { kind: 'overflow' };
  const rightSlots: RightSlot[] = [];
  const rightHiddenKeys: string[] = [];

  if (R === 1) {
    rightSlots.push({ kind: 'card', key: rightEntries[0].key });
  } else if (R === 2) {
    rightSlots.push({ kind: 'card', key: rightEntries[0].key });
    rightSlots.push({ kind: 'card', key: rightEntries[1].key });
  } else if (R >= 3) {
    rightSlots.push({ kind: 'card', key: rightEntries[0].key });
    rightSlots.push({ kind: 'overflow' });
    rightHiddenKeys.push(...rightEntries.slice(1, R - 1).map(e => e.key));
    rightSlots.push({ kind: 'card', key: rightEntries[R - 1].key });
  }

  const numLeftCollapsed = leftSlots.length;
  const n = numLeftCollapsed;

  const renderItems: RenderItem[] = [];
  const visible: LayoutCard[] = [];

  // Left slots with fan corners before each
  leftSlots.forEach((slot, i) => {
    const fanForKey = slot.kind === 'overflow' ? 'overflow-left' : slot.key;
    renderItems.push({ kind: 'fan-corner', forKey: fanForKey, i, n });

    if (slot.kind === 'overflow') {
      renderItems.push({ kind: 'overflow', side: 'left', stackIndex: slot.stackIndex, hiddenKeys: leftHiddenKeys });
    } else {
      renderItems.push({ kind: 'card', key: slot.key, stackIndex: slot.stackIndex, isActive: false, side: 'left' });
      visible.push({ key: slot.key, stackIndex: slot.stackIndex, isActive: false, isCollapsed: true, side: 'left' });
    }
  });

  // Active card
  const activeKeyValue = entries[activeIdx].key;
  renderItems.push({ kind: 'card', key: activeKeyValue, stackIndex: numLeftCollapsed, isActive: true, side: 'active' });
  visible.push({ key: activeKeyValue, stackIndex: numLeftCollapsed, isActive: true, isCollapsed: false, side: 'active' });

  // Right slots (no fan corners)
  rightSlots.forEach((slot, rightIdx) => {
    if (slot.kind === 'overflow') {
      renderItems.push({ kind: 'overflow', side: 'right', stackIndex: rightIdx, hiddenKeys: rightHiddenKeys });
    } else {
      renderItems.push({ kind: 'card', key: slot.key, stackIndex: rightIdx, isActive: false, side: 'right' });
      visible.push({ key: slot.key, stackIndex: rightIdx, isActive: false, isCollapsed: true, side: 'right' });
    }
  });

  const overflowKeys = [...leftHiddenKeys, ...rightHiddenKeys];
  const needsOverflow = L > 2 || R > 2;

  return { visible, overflowKeys, needsOverflow, renderItems, numLeftCollapsed, numRightCollapsed: rightSlots.length };
}
