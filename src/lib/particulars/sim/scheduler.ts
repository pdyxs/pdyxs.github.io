import type { Scenario, SpawnSpec, TimeTrigger, Trigger } from '../scenario/types';
import { expand } from '../scenario/expand';

/** How many times each trigger (by index) has fired. Plain data, replaced wholesale each call. */
export interface ScheduleState {
  fired: number[];
}

export const initialSchedule = (): ScheduleState => ({ fired: [] });

const EPSILON = 1e-9;

/** Pure: how many firings of a trigger are due by `time`, counting the first. */
function firingsBy(t: TimeTrigger, time: number): number {
  if (time < t.at - EPSILON) return 0;
  if (t.every === undefined || t.every <= 0) return 1;
  const due = Math.floor((time - t.at) / t.every + EPSILON) + 1;
  return t.repeats === undefined ? due : Math.min(due, t.repeats + 1);
}

/** Pure: how many firings of any trigger are due, given the time and the buttons pressed this step. */
function firingsNow(t: Trigger, time: number, pressed: readonly string[], before: number): number {
  if (t.kind === 'page-button') return before + pressed.filter((b) => b === t.button).length;
  return firingsBy(t, time);
}

/**
 * Pure: the spawns due by `time` (seconds) that have not yet been handed out,
 * and the new state. `pressed` is the page buttons pressed since the last call.
 */
export function dueSpawns(
  scenario: Scenario,
  time: number,
  state: ScheduleState,
  pressed: readonly string[] = [],
): { spawns: SpawnSpec[]; state: ScheduleState } {
  const spawns: SpawnSpec[] = [];
  const fired = (scenario.triggers ?? []).map((t, i) => {
    const before = state.fired[i] ?? 0;
    const now = firingsNow(t, time, pressed, before);
    for (let n = before; n < now; n++) {
      for (const action of t.actions) {
        const wave = scenario.waves?.find((w) => w.id === action.wave);
        for (const entry of wave?.entries ?? []) spawns.push(...expand(entry, scenario.formations ?? {}));
      }
    }
    return Math.max(before, now);
  });
  return { spawns, state: { fired } };
}
