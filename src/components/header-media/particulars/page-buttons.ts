// The prose side of commands: a button in a card's markdown body is plain HTML,
//   <button data-particulars-button="name">Label</button>
// and one delegated click listener turns a press into a Command for the toy of
// the card the button sits in (nearest ancestor with data-uid). It never
// touches the toy; the toy listens for the Command.
import { dispatchCommand } from '../../../lib/particulars/input/command';

export const BUTTON_ATTR = 'data-particulars-button';

/** Pure: the Command a click target stands for, or null. */
export function commandFor(target: EventTarget | null): { uid: string; button: string } | null {
  const el = (target as Element | null)?.closest?.(`[${BUTTON_ATTR}]`);
  const uid = el?.closest('[data-uid]')?.getAttribute('data-uid');
  const button = el?.getAttribute(BUTTON_ATTR);
  return uid && button ? { uid, button } : null;
}

let installs = 0;
const onClick = (e: Event) => {
  const command = commandFor(e.target);
  if (command) dispatchCommand(window, command);
};

/** Installs the one listener, shared by every toy on the page; returns the release. */
export function installPageButtons(): () => void {
  if (installs++ === 0) document.addEventListener('click', onClick);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--installs === 0) document.removeEventListener('click', onClick);
  };
}
