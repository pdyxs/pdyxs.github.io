// The tools /experiments/mark-tools hangs on the real mark: no-ops that prove
// the framework (slice 7 of docs/plans/suspended-mark.md) without shipping
// anything. Config and behaviours both, because nothing outside the bench
// uses either. Production pages get MARK_TOOLS (src/data/mark-tools.ts).

import type { ToolConfig } from '@data/mark-tools';
import type { ToolBehaviour, ViewportPoint } from '@site/mark-tools/types';

export const PROOF_TOOLS: ToolConfig[] = [
  {
    id: 'proof-press',
    behaviour: 'proof-press',
    thread: 1,
    string: 80,
    radius: 12,
    icon: 'plus',
    label: 'Press me (logs)',
    children: [
      {
        id: 'proof-child',
        behaviour: 'proof-child',
        string: 28,
        radius: 8,
        icon: 'cross',
        label: 'Child of press (logs)',
      },
    ],
  },
  {
    id: 'proof-drag',
    behaviour: 'proof-drag',
    thread: 3,
    string: 170,
    radius: 14,
    icon: 'move',
    label: 'Drag me (reports the pointer)',
  },
  {
    id: 'proof-toggle',
    behaviour: 'proof-toggle',
    thread: 4,
    string: 24,
    radius: 10,
    icon: 'ring',
    label: 'Toggled from the page',
  },
];

/** Where the behaviours report to; the page sets it. */
let sink: (line: string) => void = (line) => console.info(line);
export function setProofLog(fn: (line: string) => void) {
  sink = fn;
}

/** The toggled tool's `shown()`, set by a button on the page. */
let toggled = true;
const listeners = new Set<() => void>();
export function setProofToggle(on: boolean) {
  toggled = on;
  for (const l of listeners) l();
}
export const proofToggle = () => toggled;

const pt = (p: ViewportPoint) => `${Math.round(p.x)},${Math.round(p.y)}`;

export const PROOF_BEHAVIOURS: Record<string, ToolBehaviour> = {
  'proof-press': {
    kind: 'press',
    press: () => sink('press'),
  },
  'proof-child': {
    kind: 'press',
    press: () => sink('press (child)'),
  },
  'proof-drag': {
    kind: 'drag',
    dragStart: (p) => sink(`dragStart ${pt(p)}`),
    dragMove: (p) => sink(`dragMove ${pt(p)}`),
    dragEnd: (p, cancelled) => sink(`dragEnd ${pt(p)}${cancelled ? ' (cancelled)' : ''}`),
    key: (e) => {
      if (!e.key.startsWith('Arrow')) return false;
      sink(`key ${e.key}`);
      return true;
    },
  },
  'proof-toggle': {
    kind: 'press',
    shown: () => toggled,
    subscribe: (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    press: () => sink('press (toggled tool)'),
  },
};
