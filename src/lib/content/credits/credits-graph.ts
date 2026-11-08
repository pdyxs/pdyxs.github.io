/**
 * The credits map's topology for one card: card -> group -> role -> person.
 * Pure: plain credits in, plain nodes and edges out. Layout is a separate step
 * (`credits-layout.ts`).
 */
import { creditIdentity, type Credit } from './credits';

export type CreditsNodeKind = 'card' | 'group' | 'role' | 'person';
export type CreditsNode = { id: string; kind: CreditsNodeKind; label: string };
export type CreditsEdge = { from: string; to: string };
export type CreditsGraph = { nodes: CreditsNode[]; edges: CreditsEdge[] };

export const CARD_NODE = 'card';

export function buildCreditsGraph(credits: Credit[]): CreditsGraph {
  const nodes = new Map<string, CreditsNode>();
  const edges = new Map<string, CreditsEdge>();
  const node = (id: string, kind: CreditsNodeKind, label: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, label });
    return id;
  };
  const edge = (from: string, to: string) => {
    edges.set(`${from}\u0000${to}`, { from, to });
  };

  node(CARD_NODE, 'card', 'This card');
  for (const c of credits) {
    if (c.listed !== 'map') continue;
    let parent = CARD_NODE;
    if (c.group) {
      const g = node(`group:${c.group}`, 'group', c.group);
      edge(parent, g);
      parent = g;
    }
    if (c.role) {
      const r = node(`role:${c.group ?? ''}\u0000${c.role}`, 'role', c.role);
      edge(parent, r);
      parent = r;
    }
    edge(parent, node(creditIdentity(c), 'person', c.name));
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
