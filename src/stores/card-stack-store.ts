import { writable } from 'svelte/store';
import type { StackState, CardEntry } from '../lib/stack-layout';

export const stackStore = writable<StackState>({ cards: [], activeUid: null });

export function pushToStack(state: StackState, uid: string): StackState {
  return {
    cards: [...state.cards, { uid }],
    activeUid: uid,
  };
}

export function removeFromStack(state: StackState, uid: string): StackState {
  const index = state.cards.findIndex(c => c.uid === uid);
  const newCards = state.cards.filter(c => c.uid !== uid);
  let newActiveUid = state.activeUid;
  if (state.activeUid === uid) {
    newActiveUid = index > 0 ? state.cards[index - 1].uid : (newCards[0]?.uid ?? null);
  }
  return { cards: newCards, activeUid: newActiveUid };
}

export function activateCard(state: StackState, uid: string): StackState {
  return { ...state, activeUid: uid };
}

export function replaceActiveSlot(state: StackState, newUid: string): StackState {
  if (!state.activeUid) return state;
  const idx = state.cards.findIndex(c => c.uid === state.activeUid);
  if (idx === -1) return state;
  const newCards = [...state.cards];
  newCards[idx] = { uid: newUid };
  return { cards: newCards, activeUid: newUid };
}
