// The one scenario store. Form and (later) level view both read and write it;
// nothing else holds a copy. Subscribers receive the new scenario, not a delta.

import { applyEdit } from './edit.ts';
import type { Edit } from './edit.ts';
import type { Scenario } from '../scenario/types.ts';

export interface ScenarioStore {
  get(): Scenario;
  dispatch(edit: Edit): void;
  replace(scenario: Scenario): void;
  subscribe(fn: (scenario: Scenario) => void): () => void;
}

export function createScenarioStore(initial: Scenario): ScenarioStore {
  let current = initial;
  const listeners = new Set<(scenario: Scenario) => void>();
  const set = (next: Scenario) => {
    current = next;
    for (const fn of [...listeners]) fn(current);
  };
  return {
    get: () => current,
    dispatch: (edit) => set(applyEdit(current, edit)),
    replace: set,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
