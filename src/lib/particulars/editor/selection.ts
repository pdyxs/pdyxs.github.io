// What is selected on the level view, which handles that gives it, and the Edit a
// drag on one of them makes. Both functions are pure: the view only draws what
// editorHandles() returns and hands pointer deltas to dragEdit().

import { formationFrames } from '../scenario/expand.ts';
import { dragFormation, dragWall, formationHandles, wallHandles } from './handles.ts';
import type { FormationHandleId, Frame, Vec, WallHandleId } from './handles.ts';
import type { Edit } from './edit.ts';
import type { Scenario } from '../scenario/types.ts';

export type Selection = { kind: 'entry'; wave: number; entry: number } | { kind: 'wall'; index: number } | null;

type Target =
  | { kind: 'entry-centre'; wave: number; entry: number }
  | { kind: 'formation'; name: string; handle: FormationHandleId; frame: Frame }
  | { kind: 'wall'; index: number; handle: WallHandleId };

export interface EditorHandle extends Vec {
  /** Unique within a selection; the view's each-key. */
  key: string;
  target: Target;
}

export function editorHandles(scenario: Scenario, selection: Selection): EditorHandle[] {
  if (!selection) return [];
  if (selection.kind === 'wall') {
    const wall = scenario.barriers?.[selection.index];
    if (!wall) return [];
    return wallHandles(wall).map((h) => ({
      key: h.id,
      x: h.x,
      y: h.y,
      target: { kind: 'wall', index: selection.index, handle: h.id as WallHandleId },
    }));
  }
  const entry = scenario.waves?.[selection.wave]?.entries[selection.entry];
  if (!entry) return [];
  const library = scenario.formations ?? {};
  const centre: EditorHandle = {
    key: 'centre',
    x: entry.position?.x ?? 0,
    y: entry.position?.y ?? 0,
    target: { kind: 'entry-centre', wave: selection.wave, entry: selection.entry },
  };
  const seen = new Map<string, number>();
  const formation = formationFrames(entry, library).flatMap(({ name, frame }) => {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return formationHandles(library[name], frame).map((h): EditorHandle => ({
      key: `${name}:${h.id}${n > 0 ? `#${n}` : ''}`,
      x: h.x,
      y: h.y,
      target: { kind: 'formation', name, handle: h.id as FormationHandleId, frame },
    }));
  });
  return [centre, ...formation];
}

/**
 * The Edit for dragging `handle` by `delta` (total pointer travel since the
 * drag began). `start` is the scenario as it was when the drag began.
 */
export function dragEdit(start: Scenario, handle: EditorHandle, delta: Vec): Edit {
  const t = handle.target;
  if (t.kind === 'wall') {
    return { kind: 'set', path: ['barriers', t.index], value: dragWall(start.barriers![t.index], t.handle, delta) };
  }
  if (t.kind === 'formation') {
    return { kind: 'set', path: ['formations', t.name], value: dragFormation(start.formations![t.name], t.handle, delta, t.frame) };
  }
  const p = start.waves![t.wave].entries[t.entry].position ?? { x: 0, y: 0 };
  const round = (n: number) => Math.round(n * 100) / 100 + 0;
  return {
    kind: 'set',
    path: ['waves', t.wave, 'entries', t.entry, 'position'],
    value: { x: round(p.x + delta.x), y: round(p.y + delta.y) },
  };
}
