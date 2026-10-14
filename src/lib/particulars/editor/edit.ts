// Pure reducers for the scenario store: `(scenario, edit) -> scenario`.
//
// The form never builds a new scenario itself; it emits an Edit addressed by a
// path into the plain scenario data. That keeps the reducer shaped by the
// scenario format (shallow JSON) rather than by what the form happens to render.
// Imports are relative with `.ts` so the dev-server plugin (plain Node) can load it.

import type { Scenario } from '../scenario/types.ts';

export type Path = (string | number)[];

export type Edit =
  | { kind: 'set'; path: Path; value: unknown }
  | { kind: 'remove'; path: Path }
  /** Adds to the array at `path` (created if absent), at `index` or the end. */
  | { kind: 'insert'; path: Path; value: unknown; index?: number }
  /** Reorders within the array at `path`. */
  | { kind: 'move'; path: Path; from: number; to: number }
  /** Renames a wave and the trigger actions that spawn it, so references never dangle. */
  | { kind: 'rename-wave'; from: string; to: string };

type Json = any;

function setIn(node: Json, path: Path, value: unknown): Json {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const copy = Array.isArray(node) ? [...node] : { ...node };
  copy[head] = setIn(node?.[head], rest, value);
  return copy;
}

function removeIn(node: Json, path: Path): Json {
  const [head, ...rest] = path;
  if (rest.length > 0) return setIn(node, [head], removeIn(node?.[head], rest));
  if (Array.isArray(node)) return node.filter((_, i) => i !== head);
  const { [head]: _gone, ...others } = node;
  return others;
}

function getIn(node: Json, path: Path): Json {
  return path.reduce((n, k) => n?.[k], node);
}

export function applyEdit(scenario: Scenario, edit: Edit): Scenario {
  switch (edit.kind) {
    case 'set':
      return setIn(scenario, edit.path, edit.value);
    case 'remove':
      return removeIn(scenario, edit.path);
    case 'insert': {
      const items: unknown[] = [...(getIn(scenario, edit.path) ?? [])];
      items.splice(edit.index ?? items.length, 0, edit.value);
      return setIn(scenario, edit.path, items);
    }
    case 'rename-wave':
      return {
        ...scenario,
        waves: scenario.waves?.map((w) => (w.id === edit.from ? { ...w, id: edit.to } : w)),
        triggers: scenario.triggers?.map((t) => ({
          ...t,
          actions: t.actions.map((a) => (a.wave === edit.from ? { ...a, wave: edit.to } : a)),
        })),
      };
    case 'move': {
      const items: unknown[] = [...(getIn(scenario, edit.path) ?? [])];
      const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < items.length;
      if (!inRange(edit.from) || !inRange(edit.to)) return scenario;
      const [item] = items.splice(edit.from, 1);
      items.splice(edit.to, 0, item);
      return setIn(scenario, edit.path, items);
    }
  }
}
