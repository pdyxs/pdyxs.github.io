/**
 * Build-time layout for the credits map: positions for the nodes of one card's
 * graph. Pure and deterministic (no `Math.random`, no iteration over anything
 * unordered), so two builds of the same content give byte-identical output.
 *
 * Ported from the force pass in the credits-graph prototype. A radial seed puts
 * each node on a ring by depth, in an angular slice proportional to its
 * subtree, then a force pass relaxes it. Label widths are estimated from
 * character counts; the browser never measures anything.
 *
 * Invariants the final pass enforces: a child is always radially further from
 * the card than every parent, and no two label boxes overlap.
 */
import type { CreditsGraph, CreditsNode, CreditsEdge } from './credits-graph';

export type PositionedNode = CreditsNode & { x: number; y: number };
export type PositionedGraph = { nodes: PositionedNode[]; edges: CreditsEdge[] };

/** Label-box half sizes, estimated from the character count. The dot sits inside the box. */
export function labelHalfSize(node: Pick<CreditsNode, 'kind' | 'label'>): { w: number; h: number } {
  return { w: Math.max(18, node.label.length * 3.6 + 10), h: 15 };
}

const RING_STEP = 120; // minimum radial gap between depths
const ARC_SPACING = 96; // arc length each node wants on its ring
const RADIAL_MARGIN = 40; // a child is at least this much further out than its parent
const GAP = 6; // clear space between label boxes
const EDGE_CLEAR = 22; // clear space between a node centre and a foreign edge
const STEPS = 300;

type P = { x: number; y: number };

export function layoutCreditsGraph(graph: CreditsGraph): PositionedGraph {
  const ids = graph.nodes.map(n => n.id);
  const parents = new Map<string, string[]>(ids.map(id => [id, []]));
  const children = new Map<string, string[]>(ids.map(id => [id, []]));
  for (const e of graph.edges) {
    parents.get(e.to)!.push(e.from);
    children.get(e.from)!.push(e.to);
  }

  const root = graph.nodes.find(n => n.kind === 'card')!.id;

  // Depth: the longest path from the card, so a node is deeper than every parent.
  const depth = new Map<string, number>(ids.map(id => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of graph.edges) {
      if (depth.get(e.to)! < depth.get(e.from)! + 1) {
        depth.set(e.to, depth.get(e.from)! + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const order = [...ids].sort((a, b) => depth.get(a)! - depth.get(b)! || ids.indexOf(a) - ids.indexOf(b));

  // Seed. The first parent owns a node for angular purposes; weights are leaf counts.
  const owned = new Map<string, string[]>(ids.map(id => [id, []]));
  for (const id of ids) if (id !== root) owned.get(parents.get(id)![0])!.push(id);
  const weight = new Map<string, number>();
  const weigh = (id: string): number => {
    const kids = owned.get(id)!;
    const w = kids.length ? kids.reduce((s, k) => s + weigh(k), 0) : 1;
    weight.set(id, w);
    return w;
  };
  weigh(root);
  const angle = new Map<string, number>();
  const slice = (id: string, from: number, to: number) => {
    angle.set(id, (from + to) / 2);
    let at = from;
    for (const k of owned.get(id)!) {
      const span = ((to - from) * weight.get(k)!) / weight.get(id)!;
      slice(k, at, at + span);
      at += span;
    }
  };
  slice(root, -Math.PI / 2, (3 * Math.PI) / 2);
  for (const id of order) { // a person with several parents sits at their mean direction
    const ps = parents.get(id)!;
    if (ps.length < 2) continue;
    const sx = ps.reduce((s, p) => s + Math.cos(angle.get(p)!), 0);
    const sy = ps.reduce((s, p) => s + Math.sin(angle.get(p)!), 0);
    angle.set(id, Math.atan2(sy, sx));
  }
  const maxDepth = Math.max(...depth.values());
  const ring = new Map<number, number>([[0, 0]]);
  for (let d = 1; d <= maxDepth; d++) {
    const count = ids.filter(id => depth.get(id) === d).length;
    ring.set(d, Math.max(ring.get(d - 1)! + RING_STEP, (count * ARC_SPACING) / (2 * Math.PI)));
  }
  const pos = new Map<string, P>();
  for (const id of ids) {
    const r = ring.get(depth.get(id)!)!;
    pos.set(id, { x: Math.cos(angle.get(id)!) * r, y: Math.sin(angle.get(id)!) * r });
  }
  const seed = new Map([...pos].map(([id, p]) => [id, { ...p }]));
  const rest = new Map(graph.edges.map(e => {
    const a = seed.get(e.from)!, b = seed.get(e.to)!;
    return [`${e.from}\u0000${e.to}`, Math.hypot(a.x - b.x, a.y - b.y)];
  }));

  const origin = pos.get(root)!;
  const rad = (id: string) => Math.hypot(pos.get(id)!.x - origin.x, pos.get(id)!.y - origin.y) || 1;
  const half = new Map(graph.nodes.map(n => [n.id, labelHalfSize(n)]));
  const free = ids.filter(id => id !== root);

  for (let it = 0; it < STEPS; it++) {
    const cool = Math.max(0.15, 1 - it / STEPS);
    const f = new Map(free.map(id => [id, { x: 0, y: 0 }]));
    const push = (id: string, x: number, y: number) => {
      const v = f.get(id);
      if (v) { v.x += x; v.y += y; }
    };
    const outward = (id: string, amt: number) => {
      const p = pos.get(id)!, r = rad(id);
      push(id, ((p.x - origin.x) / r) * amt, ((p.y - origin.y) / r) * amt);
    };
    for (const e of graph.edges) { // growth: a child sits further out than its parent
      const deficit = rad(e.from) + RADIAL_MARGIN * 1.5 - rad(e.to);
      if (deficit > 0) { outward(e.to, deficit * 0.5); outward(e.from, -deficit * 0.25); }
    }
    for (const e of graph.edges) { // springs
      const a = pos.get(e.from)!, b = pos.get(e.to)!;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const pull = (d - rest.get(`${e.from}\u0000${e.to}`)!) * 0.06;
      push(e.from, (dx / d) * pull, (dy / d) * pull);
      push(e.to, (-dx / d) * pull, (-dy / d) * pull);
    }
    for (const id of free) {
      const p = pos.get(id)!, hs = half.get(id)!;
      for (const oid of ids) {
        if (oid === id) continue;
        const q = pos.get(oid)!;
        const dx = p.x - q.x, dy = p.y - q.y, d2 = Math.max(dx * dx + dy * dy, 1), d = Math.sqrt(d2);
        if (d < 240) push(id, (dx / d) * (5200 / d2) * 10, (dy / d) * (5200 / d2) * 10);
      }
      for (const e of graph.edges) { // keep clear of edges that are not this node's own
        if (e.from === id || e.to === id) continue;
        const a = pos.get(e.from)!, b = pos.get(e.to)!;
        const ex = b.x - a.x, ey = b.y - a.y, len2 = ex * ex + ey * ey || 1;
        const t = ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2;
        if (t < 0.05 || t > 0.95) continue;
        const rx = p.x - (a.x + ex * t), ry = p.y - (a.y + ey * t), rd = Math.hypot(rx, ry) || 1;
        const clear = EDGE_CLEAR + hs.h;
        if (rd < clear) push(id, (rx / rd) * (clear - rd) * 0.5, (ry / rd) * (clear - rd) * 0.5);
      }
      outward(id, 0.8);
      const s = seed.get(id)!;
      push(id, (s.x - p.x) * 0.01, (s.y - p.y) * 0.01);
    }
    for (const id of free) {
      const p = pos.get(id)!, v = f.get(id)!;
      p.x += Math.max(-10, Math.min(10, v.x)) * cool;
      p.y += Math.max(-10, Math.min(10, v.y)) * cool;
    }
  }

  // Settle the hard invariants. Overlaps are resolved by moving the deeper node
  // outward-ish; then radial order is restored, shallowest first. Repeat to a fixpoint.
  for (let pass = 0; pass < 400; pass++) {
    let moved = false;
    for (const id of order) {
      if (id === root) continue;
      const need = Math.max(...parents.get(id)!.map(p => rad(p))) + RADIAL_MARGIN;
      const r = rad(id);
      if (r < need) {
        const p = pos.get(id)!;
        p.x = origin.x + ((p.x - origin.x) / r) * need;
        p.y = origin.y + ((p.y - origin.y) / r) * need;
        moved = true;
      }
    }
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = order[i], b = order[j]; // b is the deeper (or equal-depth later) node
        const pa = pos.get(a)!, pb = pos.get(b)!, ha = half.get(a)!, hb = half.get(b)!;
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const ox = ha.w + hb.w + GAP - Math.abs(dx), oy = ha.h + hb.h + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const share = a === root ? 1 : depth.get(a) === depth.get(b) ? 0.5 : 1;
        if (ox < oy) {
          pb.x += Math.sign(dx || 1) * ox * share;
          if (share < 1) pa.x -= Math.sign(dx || 1) * ox * (1 - share);
        } else {
          pb.y += Math.sign(dy || 1) * oy * share;
          if (share < 1) pa.y -= Math.sign(dy || 1) * oy * (1 - share);
        }
        moved = true;
      }
    }
    for (const id of free) { // and an edge that is not the node's own must not run through its box
      const p = pos.get(id)!, hs = half.get(id)!;
      for (const e of graph.edges) {
        if (e.from === id || e.to === id) continue;
        const a = pos.get(e.from)!, b = pos.get(e.to)!;
        const hit = segmentHitsBox(a, b, p, hs.w + GAP, hs.h + GAP);
        if (!hit) continue;
        const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
        const side = Math.sign((p.x - a.x) * -ey + (p.y - a.y) * ex) || 1;
        const nx = (-ey / len) * side, ny = (ex / len) * side;
        const amt = Math.abs(nx) * (hs.w + GAP) + Math.abs(ny) * (hs.h + GAP) + 1 - Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny);
        if (amt > 0) { p.x += nx * amt; p.y += ny * amt; moved = true; }
      }
    }
    if (!moved) break;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    nodes: graph.nodes.map(n => ({ ...n, x: round(pos.get(n.id)!.x), y: round(pos.get(n.id)!.y) })),
    edges: graph.edges,
  };
}

/** Whether the segment a-b passes through the box centred at c with the given half sizes (sampled; the boxes are small). */
function segmentHitsBox(a: P, b: P, c: P, hw: number, hh: number): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (Math.abs(a.x + (b.x - a.x) * t - c.x) < hw && Math.abs(a.y + (b.y - a.y) * t - c.y) < hh) return true;
  }
  return false;
}
