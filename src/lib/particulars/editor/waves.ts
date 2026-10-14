// What the form shows beside each wave: which triggers fire it. Derived from the
// scenario on demand, never stored alongside it.

import type { Scenario, Trigger } from '../scenario/types.ts';

export function triggersForWave(scenario: Scenario, waveId: string): { index: number; trigger: Trigger }[] {
  return (scenario.triggers ?? [])
    .map((trigger, index) => ({ index, trigger }))
    .filter(({ trigger }) => trigger.actions.some((a) => a.kind === 'spawn' && a.wave === waveId));
}
