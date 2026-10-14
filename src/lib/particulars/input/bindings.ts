import type { ForceSwitches } from '../scenario/types';

/** What the player can ask for in a step. */
export type Intent = { kind: 'change' } | { kind: 'explode' };

/** Raw inputs that can fire the player's action, after the view has told them apart. */
export type InputEvent = 'space' | 'tap-self';

/**
 * What a binding does: `action` is the scenario's one action (resolved by
 * `actionFor`); the rest pin a specific intent; `none` unbinds.
 */
export type Binding = 'action' | Intent['kind'] | 'none';
export type Bindings = Record<InputEvent, Binding>;

/**
 * THE bindings table: the one place input is wired to behaviour. The control
 * scheme is provisional, so changing it means editing this and nothing else.
 */
export const BINDINGS: Bindings = {
  space: 'action',
  'tap-self': 'action',
};

/** Pure: the scenario's one action, chosen by which forces are on. First available wins. */
export function actionFor(switches: ForceSwitches): Intent | null {
  if (switches.weak) return { kind: 'change' };
  if (switches.em || switches.strong) return { kind: 'explode' };
  return null;
}

/** Pure: `(input event, scenario) -> intent`. */
export function intentFor(event: InputEvent, switches: ForceSwitches, table: Bindings = BINDINGS): Intent | null {
  const binding = table[event];
  if (binding === 'none') return null;
  if (binding === 'action') return actionFor(switches);
  return { kind: binding };
}

/** Pure: which input event a key press is, if any. */
export function inputEventForKey(key: string): InputEvent | null {
  return key === ' ' ? 'space' : null;
}
