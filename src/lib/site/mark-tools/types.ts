// What a mark tool does, as the mark sees it. The mark (SuspendedMark.astro)
// draws every tool the same way, from its config (src/data/mark-tools.ts),
// and calls these hooks; it knows nothing else about any tool. A behaviour
// knows nothing about the mark: it imports from this file and nowhere in
// src/lib/site/mark/ (mark/boundary.test.ts holds both sides to that).

/** A point in viewport (client) coordinates. */
export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ToolBehaviour {
  /** Drag (the palette) or press (revert). Decides the pointer wiring the mark sets up. */
  kind: 'drag' | 'press';
  /** Whether the bauble should be hanging right now; the mark drops/reels it on change. Absent: always. */
  shown?(): boolean;
  /** Tell the mark when `shown()` may have changed. Returns an unsubscribe. */
  subscribe?(changed: () => void): () => void;
  /** A press tool's action: a click, or Enter/Space on the focused bauble. */
  press?(): void;
  /** A drag tool's pointer, captured on the bauble, which follows it. */
  dragStart?(p: ViewportPoint): void;
  dragMove?(p: ViewportPoint): void;
  /** The drag is over: let go (`cancelled` false), or pointercancel / Escape (true). */
  dragEnd?(p: ViewportPoint, cancelled: boolean): void;
  /**
   * Keyboard on the focused bauble: arrows nudge, Enter commits, Escape
   * cancels (drag tools). Return true when the key was handled; Escape that
   * isn't handled closes the tools.
   */
  key?(e: KeyboardEvent): boolean;
}
