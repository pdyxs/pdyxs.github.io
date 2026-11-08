/**
 * The credits map's camera: pure decisions about what is lit and how the view
 * frames a selection. The island applies the result; no DOM here. Type-only
 * import of the positioned graph keeps the island from reaching into content code.
 */
import type { PositionedGraph } from '@content/credits/credits-layout';

/** The SVG's user-space size; the island's viewBox is this, whatever the CSS size. */
export const VIEW = { width: 800, height: 480 } as const;
export const MIN_ZOOM = 0.25;
export const MAX_FIT_ZOOM = 1;
export const PHONE_ZOOM = 1.6;
/** Room left around the framed box for labels. */
const PAD = { x: 90, y: 55 };

export type Camera = { cx: number; cy: number; s: number };

/** The selected node and everything directly connected to it; with the card selected, everything. */
export function connectedIds(graph: PositionedGraph, id: string): Set<string> {
  if (graph.nodes.find(n => n.id === id)?.kind === 'card') return new Set(graph.nodes.map(n => n.id));
  const out = new Set([id]);
  for (const e of graph.edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}

/**
 * Frame the selection together with what it connects to, centred on that box.
 * Zoom is the fit, at most 1 and at least 0.25. On a phone the zoom holds at
 * 1.6 and the view centres on the node itself instead, the rest a pan away.
 */
export function frameSelection(graph: PositionedGraph, id: string, opts: { phone: boolean }): Camera {
  const lit = connectedIds(graph, id);
  const sel = graph.nodes.find(n => n.id === id)!;
  let x0 = sel.x, x1 = sel.x, y0 = sel.y, y1 = sel.y;
  for (const n of graph.nodes) {
    if (!lit.has(n.id)) continue;
    x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x);
    y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
  }
  const fit = Math.min(
    MAX_FIT_ZOOM,
    Math.max(MIN_ZOOM, Math.min((VIEW.width - 2 * PAD.x) / Math.max(1, x1 - x0), (VIEW.height - 2 * PAD.y) / Math.max(1, y1 - y0))),
  );
  if (opts.phone && PHONE_ZOOM > fit) return { cx: sel.x, cy: sel.y, s: PHONE_ZOOM };
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: fit };
}
