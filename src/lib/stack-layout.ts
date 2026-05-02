export interface CardEntry {
  uid: string;
}

export interface StackState {
  cards: CardEntry[];
  activeUid: string | null;
}

export interface LayoutCard {
  uid: string;
  stackIndex: number;
  isActive: boolean;
  isCollapsed: boolean;
  side: 'left' | 'right' | 'active';
}

export type RenderItem =
  | { kind: 'card'; uid: string; stackIndex: number; isActive: boolean; side: 'left' | 'right' | 'active' }
  | { kind: 'fan-corner'; forUid: string; i: number; n: number }
  | { kind: 'overflow'; side: 'left' | 'right'; stackIndex: number; hiddenUids: string[] };

export interface LayoutResult {
  visible: LayoutCard[];
  overflowUids: string[];
  needsOverflow: boolean;
  renderItems: RenderItem[];
  numLeftCollapsed: number;
  numRightCollapsed: number;
}

export const STAGGER_PX = 8;

export function computeStackLayout(state: StackState): LayoutResult {
  const { cards, activeUid } = state;

  if (cards.length === 0) {
    return { visible: [], overflowUids: [], needsOverflow: false, renderItems: [], numLeftCollapsed: 0, numRightCollapsed: 0 };
  }

  let activeIdx = activeUid ? cards.findIndex(c => c.uid === activeUid) : -1;
  if (activeIdx === -1) activeIdx = cards.length - 1;

  const leftCards = cards.slice(0, activeIdx);
  const rightCards = cards.slice(activeIdx + 1);
  const L = leftCards.length;
  const R = rightCards.length;

  // Left visible slots: L=0→nothing, L=1→[card], L=2→[card,card], L≥3→[card,overflow,card]
  type LeftSlot = { kind: 'card'; uid: string; stackIndex: number } | { kind: 'overflow'; stackIndex: number };
  const leftSlots: LeftSlot[] = [];
  const leftHiddenUids: string[] = [];

  if (L === 1) {
    leftSlots.push({ kind: 'card', uid: leftCards[0].uid, stackIndex: 0 });
  } else if (L === 2) {
    leftSlots.push({ kind: 'card', uid: leftCards[0].uid, stackIndex: 0 });
    leftSlots.push({ kind: 'card', uid: leftCards[1].uid, stackIndex: 1 });
  } else if (L >= 3) {
    leftSlots.push({ kind: 'card', uid: leftCards[0].uid, stackIndex: 0 });
    leftSlots.push({ kind: 'overflow', stackIndex: 1 });
    leftHiddenUids.push(...leftCards.slice(1, L - 1).map(c => c.uid));
    leftSlots.push({ kind: 'card', uid: leftCards[L - 1].uid, stackIndex: 2 });
  }

  // Right visible slots: same shape, no fan corners
  type RightSlot = { kind: 'card'; uid: string } | { kind: 'overflow' };
  const rightSlots: RightSlot[] = [];
  const rightHiddenUids: string[] = [];

  if (R === 1) {
    rightSlots.push({ kind: 'card', uid: rightCards[0].uid });
  } else if (R === 2) {
    rightSlots.push({ kind: 'card', uid: rightCards[0].uid });
    rightSlots.push({ kind: 'card', uid: rightCards[1].uid });
  } else if (R >= 3) {
    rightSlots.push({ kind: 'card', uid: rightCards[0].uid });
    rightSlots.push({ kind: 'overflow' });
    rightHiddenUids.push(...rightCards.slice(1, R - 1).map(c => c.uid));
    rightSlots.push({ kind: 'card', uid: rightCards[R - 1].uid });
  }

  const numLeftCollapsed = leftSlots.length;
  const n = numLeftCollapsed;

  const renderItems: RenderItem[] = [];
  const visible: LayoutCard[] = [];

  // Left slots with fan corners before each
  leftSlots.forEach((slot, i) => {
    const fanForUid = slot.kind === 'overflow' ? 'overflow-left' : slot.uid;
    renderItems.push({ kind: 'fan-corner', forUid: fanForUid, i, n });

    if (slot.kind === 'overflow') {
      renderItems.push({ kind: 'overflow', side: 'left', stackIndex: slot.stackIndex, hiddenUids: leftHiddenUids });
    } else {
      renderItems.push({ kind: 'card', uid: slot.uid, stackIndex: slot.stackIndex, isActive: false, side: 'left' });
      visible.push({ uid: slot.uid, stackIndex: slot.stackIndex, isActive: false, isCollapsed: true, side: 'left' });
    }
  });

  // Active card
  const activeUidValue = cards[activeIdx].uid;
  renderItems.push({ kind: 'card', uid: activeUidValue, stackIndex: numLeftCollapsed, isActive: true, side: 'active' });
  visible.push({ uid: activeUidValue, stackIndex: numLeftCollapsed, isActive: true, isCollapsed: false, side: 'active' });

  // Right slots (no fan corners)
  rightSlots.forEach((slot, rightIdx) => {
    if (slot.kind === 'overflow') {
      renderItems.push({ kind: 'overflow', side: 'right', stackIndex: rightIdx, hiddenUids: rightHiddenUids });
    } else {
      renderItems.push({ kind: 'card', uid: slot.uid, stackIndex: rightIdx, isActive: false, side: 'right' });
      visible.push({ uid: slot.uid, stackIndex: rightIdx, isActive: false, isCollapsed: true, side: 'right' });
    }
  });

  const overflowUids = [...leftHiddenUids, ...rightHiddenUids];
  const needsOverflow = L > 2 || R > 2;

  return { visible, overflowUids, needsOverflow, renderItems, numLeftCollapsed, numRightCollapsed: rightSlots.length };
}
