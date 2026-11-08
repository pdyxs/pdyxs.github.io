/**
 * The credits map's topology for one card: card -> group -> role -> person.
 * Pure: plain credits in, plain nodes and edges out. Layout is a separate step
 * (`credits-layout.ts`).
 */
import { creditIdentity, type Credit } from './credits';
import type { CreditsIndex } from './credits-index';

export type CreditsNodeKind = 'card' | 'group' | 'role' | 'person' | 'project';
/** A `project` node is another card a person worked on; `uid` is the card it pushes. */
export type CreditsNode = { id: string; kind: CreditsNodeKind; label: string; uid?: string };
export type CreditsEdge = { from: string; to: string; label?: string };
/**
 * `expansions` is keyed by person node id: the nodes and edges that appear
 * while that person is selected (their other projects). Absent without an index.
 */
export type CreditsGraph = {
  nodes: CreditsNode[];
  edges: CreditsEdge[];
  expansions?: Record<string, { nodes: CreditsNode[]; edges: CreditsEdge[] }>;
};

export const CARD_NODE = 'card';

/**
 * Pass `context` to add each person's other credited cards as expansions, and
 * `title` to name the centre node after the card (it falls back to "This card").
 */
export function buildCreditsGraph(credits: Credit[], context?: { uid: string; index: CreditsIndex; title?: string }): CreditsGraph {
  const nodes = new Map<string, CreditsNode>();
  const edges = new Map<string, CreditsEdge>();
  const node = (id: string, kind: CreditsNodeKind, label: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, label });
    return id;
  };
  const edge = (from: string, to: string) => {
    edges.set(`${from}\u0000${to}`, { from, to });
  };

  node(CARD_NODE, 'card', context?.title || 'This card');
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
  const graph: CreditsGraph = { nodes: [...nodes.values()], edges: [...edges.values()] };
  if (context) {
    const expansions: NonNullable<CreditsGraph['expansions']> = {};
    for (const person of graph.nodes) {
      if (person.kind !== 'person') continue;
      const others = (context.index.get(person.id) ?? []).filter(a => a.uid !== context.uid);
      if (!others.length) continue;
      expansions[person.id] = {
        nodes: others.map(a => ({ id: `project:${person.id}\u0000${a.uid}`, kind: 'project', label: a.title, uid: a.uid })),
        edges: others.map(a => {
          const label = a.roles.length ? a.roles.join(', ') : a.group;
          return { from: person.id, to: `project:${person.id}\u0000${a.uid}`, ...(label && { label }) };
        }),
      };
    }
    graph.expansions = expansions;
  }
  return graph;
}
