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
}

export interface LayoutResult {
  visible: LayoutCard[];
  overflowUids: string[];
  needsOverflow: boolean;
}

const MAX_VISIBLE = 5;

export function computeStackLayout(state: StackState): LayoutResult {
  const { cards, activeUid } = state;

  if (cards.length === 0) {
    return { visible: [], overflowUids: [], needsOverflow: false };
  }

  const overflowCount = Math.max(0, cards.length - MAX_VISIBLE);
  const visibleCards = cards.slice(overflowCount);
  const overflowUids = cards.slice(0, overflowCount).map(c => c.uid);

  const visible: LayoutCard[] = visibleCards.map((card, i) => ({
    uid: card.uid,
    stackIndex: i,
    isActive: card.uid === activeUid,
    isCollapsed: card.uid !== activeUid,
  }));

  return {
    visible,
    overflowUids,
    needsOverflow: overflowCount > 0,
  };
}
