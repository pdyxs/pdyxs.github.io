import { FORCE_NAMES } from './types';
import type { ForceSwitches, Scenario } from './types';

/** Pure: the scenario's authored switches with every omitted force off. */
export function resolveSwitches(authored: Scenario['forces']): ForceSwitches {
  return Object.fromEntries(FORCE_NAMES.map((n) => [n, authored?.[n] === true])) as ForceSwitches;
}
