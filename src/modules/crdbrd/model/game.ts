import type { Game } from './types.ts';

export function blank(): Game {
  return { name: '', properties: [], values: {}, concepts: [], sets: [] };
}
