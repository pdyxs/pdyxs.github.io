/**
 * Commands into a toy from elsewhere on the page. Prose and the header slot
 * hold no reference to each other: the prose side dispatches a CustomEvent, the
 * toy listens, and the card uid keys which toy it is for. Commands in only.
 */

export const COMMAND_EVENT = 'particulars:command';

/** Press of a page button: `button` names a page-button trigger in the scenario. */
export interface Command {
  uid: string;
  button: string;
}

/** Pure: event detail to a Command, or null if it is not one. */
export function parseCommand(detail: unknown): Command | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { uid, button } = detail as Record<string, unknown>;
  if (typeof uid !== 'string' || uid === '' || typeof button !== 'string' || button === '') return null;
  return { uid, button };
}

export function dispatchCommand(target: EventTarget, command: Command): void {
  target.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: command }));
}

/** Calls `handler` for each command addressed to `uid`; returns the unsubscribe. */
export function listenCommands(target: EventTarget, uid: string, handler: (c: Command) => void): () => void {
  const on = (e: Event) => {
    const command = parseCommand((e as CustomEvent).detail);
    if (command && command.uid === uid) handler(command);
  };
  target.addEventListener(COMMAND_EVENT, on);
  return () => target.removeEventListener(COMMAND_EVENT, on);
}
