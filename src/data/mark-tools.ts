// The suspended mark's tools: what drops when the dot is clicked. Hand-edited.
//
// Every tool is a bauble on a string. A top-level tool hangs from one of the
// mark's threads (an index into MARK_RIG.threads, src/data/mark-rig.ts); a
// child hangs from its parent's bauble. Everything about how a tool LOOKS and
// HANGS is here, and nowhere else: string length, size, icon, label, order.
// What it DOES is its behaviour, in src/lib/site/mark-tools/.
//
// To add a tool:
//   1. Write its behaviour: a file in src/lib/site/mark-tools/ implementing
//      `ToolBehaviour` (types.ts), and one line in that folder's index.ts
//      registry naming it. (Skip this if an existing behaviour fits.)
//   2. If it needs a new icon, add one to src/data/mark-icons.ts.
//   3. Add an entry below. Order is drop order and Tab order.
//   `mark/tools.test.ts` checks the entries: unique ids, a thread in range for
//   every top-level tool, and an icon and a behaviour that exist.
//
// To tune one, change its numbers here: `string` is how far it drops, px;
// `radius` is the bauble's body, px (the hit target never drops below
// --mark-hit-min, whatever this is).

export interface ToolConfig {
  /** Unique across every tool, children included. Becomes `data-tool`. */
  id: string;
  /** Key into the behaviour registry (src/lib/site/mark-tools/index.ts). */
  behaviour: string;
  /** Top-level tools only: the thread it hangs from, an index into MARK_RIG.threads. */
  thread?: number;
  /** String length when dropped, px. */
  string: number;
  /** The bauble's body radius, px. */
  radius: number;
  /** Key into MARK_ICONS (src/data/mark-icons.ts). */
  icon: string;
  /** The bauble's accessible name. */
  label: string;
  /** Tools that hang from this one's bauble. */
  children?: ToolConfig[];
}

/** The production tools. Empty until the palette lands (slice 8 of docs/plans/suspended-mark.md). */
export const MARK_TOOLS: ToolConfig[] = [];
