// The mark's tools, generically: which hang, which threads take the pull,
// where a child hangs from, where focus goes. Pure. The mark knows a tool by
// its config (src/data/mark-tools.ts) and whether it is shown; what a tool
// DOES is behind the registry (src/lib/site/mark-tools/), which nothing here
// imports.

import type { ToolConfig } from '@data/mark-tools';
import type { V } from '@site/mark/geometry';

/** One tool, flattened out of the config tree: depth-first, so a parent always comes before its children. */
export interface ToolNode {
  id: string;
  behaviour: string;
  /** The thread a top-level tool hangs from; null for a child. */
  thread: number | null;
  /** The tool whose bauble this one hangs from; null for a top-level tool. */
  parent: string | null;
  string: number;
  radius: number;
  icon: string;
  label: string;
}

/** The config tree as a list, parents first: drop order, draw order and Tab order. */
export function flattenTools(tools: readonly ToolConfig[], parent: string | null = null): ToolNode[] {
  return tools.flatMap((t) => [
    {
      id: t.id,
      behaviour: t.behaviour,
      thread: parent === null ? (t.thread ?? null) : null,
      parent,
      string: t.string,
      radius: t.radius,
      icon: t.icon,
      label: t.label,
    },
    ...flattenTools(t.children ?? [], t.id),
  ]);
}

/**
 * The tools that hang right now: those shown, whose parent hangs too (a child
 * has nothing to hang from without it). `shown` is the behaviour's `shown()`,
 * or true when it has none.
 */
export function visibleTools(nodes: readonly ToolNode[], shown: (n: ToolNode) => boolean): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if ((n.parent === null || out.has(n.parent)) && shown(n)) out.add(n.id);
  }
  return out;
}

/**
 * Whether a click on the dot only tugs: nothing would drop (no tools, or
 * none of the top-level ones shown), so the pull lapses (motion.ts `lapseTug`).
 */
export function isTug(nodes: readonly ToolNode[], visible: ReadonlySet<string>): boolean {
  return !nodes.some((n) => n.parent === null && visible.has(n.id));
}

/**
 * Which threads take the pull: those carrying a top-level tool in `ids` (the
 * ones dropping, or the ones being reeled in). A tug pulls every thread.
 */
export function tautThreads(nodes: readonly ToolNode[], ids: ReadonlySet<string> | null, threadCount: number): boolean[] {
  if (ids === null) return Array.from({ length: threadCount }, () => true);
  const taut = Array.from({ length: threadCount }, () => false);
  for (const n of nodes) if (n.thread !== null && ids.has(n.id) && n.thread < threadCount) taut[n.thread] = true;
  return taut;
}

/** How much string a tool has paid out: all of it while the tools are out and it is shown, else none. */
export function toolLength(n: ToolNode, toolsOut: boolean, visible: ReadonlySet<string>): number {
  return toolsOut && visible.has(n.id) ? n.string : 0;
}

/** Where a child hangs from: the bottom of its parent's body, which is scaled by `parentScale` as it grows. */
export function childPivot(parent: V, parentRadius: number, parentScale: number): V {
  return { x: parent.x, y: parent.y + parentRadius * parentScale };
}

/** The baubles in Tab order. The first is where focus goes when the tools are opened from the keyboard. */
export function focusOrder(nodes: readonly ToolNode[], visible: ReadonlySet<string>): string[] {
  return nodes.filter((n) => visible.has(n.id)).map((n) => n.id);
}

/**
 * Where focus goes when the tool `id` (or one it hangs from) is reeled in
 * while it has focus: the nearest tool it hangs from that is still hanging,
 * or null for the dot.
 */
export function focusFallback(nodes: readonly ToolNode[], id: string, visible: ReadonlySet<string>): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let p = byId.get(id)?.parent ?? null;
  while (p !== null && !visible.has(p)) p = byId.get(p)?.parent ?? null;
  return p;
}

/** What a config is checked against: the rig's thread count and the two registries' keys. */
export interface ToolRegistries {
  threads: number;
  icons: readonly string[];
  behaviours: readonly string[];
}

/** Everything wrong with a tools config, as messages; empty when it is sound. */
export function validateTools(tools: readonly ToolConfig[], reg: ToolRegistries): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly ToolConfig[], top: boolean) => {
    for (const t of list) {
      if (!t.id) errors.push('a tool has no id');
      else if (seen.has(t.id)) errors.push(`"${t.id}": id used twice`);
      seen.add(t.id);
      if (top) {
        if (t.thread === undefined || !Number.isInteger(t.thread) || t.thread < 0 || t.thread >= reg.threads) {
          errors.push(`"${t.id}": thread ${t.thread} is not one of the rig's ${reg.threads}`);
        }
      } else if (t.thread !== undefined) {
        errors.push(`"${t.id}": a child hangs from its parent, not a thread`);
      }
      if (!(t.string > 0)) errors.push(`"${t.id}": string must be positive`);
      if (!(t.radius > 0)) errors.push(`"${t.id}": radius must be positive`);
      if (!reg.icons.includes(t.icon)) errors.push(`"${t.id}": no icon "${t.icon}"`);
      if (!reg.behaviours.includes(t.behaviour)) errors.push(`"${t.id}": no behaviour "${t.behaviour}"`);
      if (!t.label.trim()) errors.push(`"${t.id}": no label`);
      walk(t.children ?? [], false);
    }
  };
  walk(tools, true);
  return errors;
}
