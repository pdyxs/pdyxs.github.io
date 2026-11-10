// The prose side of commands: a button in a card's markdown body is plain HTML,
//   <button data-particulars-button="name">Label</button>
// and one delegated click listener turns a press into a Command for the toy of
// the card the button sits in (nearest ancestor with data-uid). It never
// touches the toy; the toy listens for the Command.
//
// A force checkbox works the same way,
//   <input type="checkbox" data-particulars-force="em">
// and the toy announces its switches back, so the checkbox shows what the toy
// has (the toy's state is the only copy).
import { dispatchCommand, dispatchForceCommand, listenForces } from '../../../lib/particulars/input/command';
import { FORCE_NAMES } from '../../../lib/particulars/scenario/types';
import type { ForceName } from '../../../lib/particulars/scenario/types';

export const BUTTON_ATTR = 'data-particulars-button';

/** Pure: the Command a click target stands for, or null. */
export function commandFor(target: EventTarget | null): { uid: string; button: string } | null {
  const el = (target as Element | null)?.closest?.(`[${BUTTON_ATTR}]`);
  const uid = el?.closest('[data-uid]')?.getAttribute('data-uid');
  const button = el?.getAttribute(BUTTON_ATTR);
  return uid && button ? { uid, button } : null;
}

export const FORCE_ATTR = 'data-particulars-force';

/** Pure: the force toggle a change event stands for, or null. */
export function forceToggleFor(target: EventTarget | null): { uid: string; force: ForceName; on: boolean } | null {
  const el = (target as HTMLInputElement | null)?.closest?.(`[${FORCE_ATTR}]`) as HTMLInputElement | null;
  const uid = el?.closest('[data-uid]')?.getAttribute('data-uid');
  const force = el?.getAttribute(FORCE_ATTR) as ForceName | null;
  return uid && force && (FORCE_NAMES as readonly string[]).includes(force) ? { uid, force, on: el!.checked } : null;
}

let installs = 0;
const onClick = (e: Event) => {
  const command = commandFor(e.target);
  if (command) dispatchCommand(window, command);
};
const onChange = (e: Event) => {
  const toggle = forceToggleFor(e.target);
  if (toggle) dispatchForceCommand(window, toggle);
};
let stopForces: (() => void) | null = null;

/** Replace each force checkbox of a card from the toy's announced switches. */
function showForces({ uid, forces }: { uid: string; forces: Record<ForceName, boolean> }): void {
  for (const card of document.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`)) {
    for (const box of card.querySelectorAll<HTMLInputElement>(`[${FORCE_ATTR}]`)) {
      const force = box.getAttribute(FORCE_ATTR) as ForceName;
      if (force in forces) box.checked = forces[force];
    }
  }
}

/** Installs the one set of listeners, shared by every toy on the page; returns the release. */
export function installPageButtons(): () => void {
  if (installs++ === 0) {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    stopForces = listenForces(window, showForces);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--installs === 0) {
      document.removeEventListener('click', onClick);
      document.removeEventListener('change', onChange);
      stopForces?.();
      stopForces = null;
    }
  };
}
