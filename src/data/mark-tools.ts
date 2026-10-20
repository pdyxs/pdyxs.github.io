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
//   3. Add an entry below. Order is drop order and Tab order. If the tool has
//      a keyboard path a label can't carry, say how in `description`.
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
  /** Optional: more on how to use it (the keyboard path, say), as the bauble's accessible description. */
  description?: string;
  /** Tools that hang from this one's bauble. */
  children?: ToolConfig[];
}

/** The production tools. */
export const MARK_TOOLS: ToolConfig[] = [
  {
    id: 'palette',
    behaviour: 'palette',
    thread: 1,
    string: 80,
    radius: 12,
    icon: 'palette',
    label: 'Colours: drag across the page to pick them',
    description: 'Or use the arrow keys to move through the colours (Shift for bigger steps), Enter to keep them, Escape to put them back.',
    children: [
      {
        id: 'palette-revert',
        behaviour: 'palette-revert',
        // Bauble centres 12 + 34 = 46px apart: the two --mark-hit-min (44px)
        // targets meet without overlapping. Shorter and the revert's (on top)
        // takes presses meant for the palette.
        string: 34,
        radius: 8,
        icon: 'cross',
        label: 'Revert colours',
      },
    ],
  },
];
