// The tool behaviour registry: config `behaviour` keys (src/data/mark-tools.ts)
// to the code that runs them. The mark imports this file and types.ts, and
// nothing else under mark-tools/ (mark/boundary.test.ts).
//
// Adding a behaviour: a file beside this one implementing `ToolBehaviour`,
// and one line in BUILT_IN below.

import type { ToolBehaviour } from './types';
import { palette } from './palette';

export type { ToolBehaviour, ViewportPoint } from './types';

/** The behaviours every page has. */
export const BUILT_IN: Readonly<Record<string, ToolBehaviour>> = {
  palette,
};

const registry = new Map<string, ToolBehaviour>(Object.entries(BUILT_IN));

/** The behaviour registered under `key`, if any. The mark looks it up each time it opens. */
export function toolBehaviour(key: string): ToolBehaviour | undefined {
  return registry.get(key);
}

/**
 * Add behaviours beyond the built-in ones. Production never calls this: it is
 * for a dev bench (/experiments/mark-tools) that hangs tools of its own on the
 * real mark without shipping them. A built-in key can't be replaced.
 */
export function registerToolBehaviours(extra: Readonly<Record<string, ToolBehaviour>>): void {
  for (const [key, b] of Object.entries(extra)) {
    if (key in BUILT_IN) throw new Error(`mark-tools: "${key}" is a built-in behaviour`);
    registry.set(key, b);
  }
}
