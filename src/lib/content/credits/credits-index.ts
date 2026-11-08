/**
 * Who appears on which cards: identity -> the map-credited cards they are on,
 * with what they did there. Pure. Called with the reachable cards only, so a
 * draft or withheld card is never offered.
 */
import { creditIdentity, type Credit } from './credits';

export type CreditsAppearance = { uid: string; title: string; roles: string[]; group?: string };
export type CreditsIndex = Map<string, CreditsAppearance[]>;

export function computeCreditsIndex(cards: { uid: string; title: string; credits?: Credit[] }[]): CreditsIndex {
  const index: CreditsIndex = new Map();
  for (const { uid, title, credits } of cards) {
    const here = new Map<string, CreditsAppearance>();
    for (const c of credits ?? []) {
      if (c.listed !== 'map') continue;
      const id = creditIdentity(c);
      let entry = here.get(id);
      if (!entry) {
        entry = { uid, title, roles: [] };
        here.set(id, entry);
      }
      if (c.role && !entry.roles.includes(c.role)) entry.roles.push(c.role);
      if (c.group && !entry.group) entry.group = c.group;
    }
    for (const [id, entry] of here) {
      if (entry.roles.length) delete entry.group; // the group only labels a role-less appearance
      index.set(id, [...(index.get(id) ?? []), entry]);
    }
  }
  return index;
}
