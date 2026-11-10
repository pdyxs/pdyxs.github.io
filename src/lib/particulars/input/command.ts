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

// ── force switches ──────────────────────────────────────────────────────────
// A checkbox in the prose turns a force on or off. Same shape as a button
// press (a command in, keyed by the card's uid); and the toy announces its
// switches back, so the prose can show them without reaching into the toy.

import { FORCE_NAMES } from '../scenario/types';
import type { ForceName, ForceSwitches } from '../scenario/types';

export const FORCE_COMMAND_EVENT = 'particulars:force';
export const FORCES_STATE_EVENT = 'particulars:forces';

/** Turn `force` on or off in the toy of card `uid`. */
export interface ForceCommand {
  uid: string;
  force: ForceName;
  on: boolean;
}

/** Which forces are on in the toy of card `uid`: the new state, not a delta. */
export interface ForcesState {
  uid: string;
  forces: ForceSwitches;
}

const isForceName = (v: unknown): v is ForceName => (FORCE_NAMES as readonly unknown[]).includes(v);

/** Pure: event detail to a ForceCommand, or null if it is not one. */
export function parseForceCommand(detail: unknown): ForceCommand | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { uid, force, on } = detail as Record<string, unknown>;
  if (typeof uid !== 'string' || uid === '' || !isForceName(force) || typeof on !== 'boolean') return null;
  return { uid, force, on };
}

export function dispatchForceCommand(target: EventTarget, command: ForceCommand): void {
  target.dispatchEvent(new CustomEvent(FORCE_COMMAND_EVENT, { detail: command }));
}

/** Calls `handler` for each force command addressed to `uid`; returns the unsubscribe. */
export function listenForceCommands(target: EventTarget, uid: string, handler: (c: ForceCommand) => void): () => void {
  const on = (e: Event) => {
    const command = parseForceCommand((e as CustomEvent).detail);
    if (command && command.uid === uid) handler(command);
  };
  target.addEventListener(FORCE_COMMAND_EVENT, on);
  return () => target.removeEventListener(FORCE_COMMAND_EVENT, on);
}

/** Pure: event detail to a ForcesState, or null. Every force must be a boolean. */
export function parseForcesState(detail: unknown): ForcesState | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { uid, forces } = detail as Record<string, unknown>;
  if (typeof uid !== 'string' || uid === '' || typeof forces !== 'object' || forces === null) return null;
  const f = forces as Record<string, unknown>;
  if (!FORCE_NAMES.every((n) => typeof f[n] === 'boolean')) return null;
  return { uid, forces: forces as ForceSwitches };
}

export function announceForces(target: EventTarget, state: ForcesState): void {
  target.dispatchEvent(new CustomEvent(FORCES_STATE_EVENT, { detail: state }));
}

/** Calls `handler` with every toy's forces as it announces them; returns the unsubscribe. */
export function listenForces(target: EventTarget, handler: (s: ForcesState) => void): () => void {
  const on = (e: Event) => {
    const state = parseForcesState((e as CustomEvent).detail);
    if (state) handler(state);
  };
  target.addEventListener(FORCES_STATE_EVENT, on);
  return () => target.removeEventListener(FORCES_STATE_EVENT, on);
}
