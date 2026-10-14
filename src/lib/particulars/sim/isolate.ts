import type { Scenario } from '../scenario/types';

/**
 * Pure: the scenario as the editor previews chosen waves in isolation. Its
 * triggers are replaced by one that fires at time zero and spawns just the
 * chosen waves (in scenario order); everything else about the level stays.
 */
export function isolateWaves(scenario: Scenario, waveIds: readonly string[]): Scenario {
  const chosen = (scenario.waves ?? []).filter((w) => waveIds.includes(w.id));
  return {
    ...scenario,
    triggers: [{ kind: 'time', at: 0, actions: chosen.map((w) => ({ kind: 'spawn' as const, wave: w.id })) }],
  };
}
