import { describe, it, expect, vi } from 'vitest';
import { parseCommand, dispatchCommand, listenCommands, COMMAND_EVENT } from './command';

describe('parseCommand', () => {
  it('accepts a uid and a button name', () => {
    expect(parseCommand({ uid: 'what/toys/particulars', button: 'ring' })).toEqual({ uid: 'what/toys/particulars', button: 'ring' });
  });

  it('rejects anything else', () => {
    for (const bad of [null, undefined, 'x', 3, {}, { uid: 'a' }, { button: 'b' }, { uid: '', button: 'b' }, { uid: 'a', button: 4 }]) {
      expect(parseCommand(bad)).toBeNull();
    }
  });
});

describe('dispatch and listen', () => {
  it('delivers a command to the listener for its uid only', () => {
    const target = new EventTarget();
    const mine = vi.fn();
    const other = vi.fn();
    listenCommands(target, 'a/one', mine);
    listenCommands(target, 'a/two', other);
    dispatchCommand(target, { uid: 'a/one', button: 'ring' });
    expect(mine).toHaveBeenCalledWith({ uid: 'a/one', button: 'ring' });
    expect(other).not.toHaveBeenCalled();
  });

  it('ignores malformed events, and stops after unsubscribing', () => {
    const target = new EventTarget();
    const fn = vi.fn();
    const stop = listenCommands(target, 'a/one', fn);
    target.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: 'junk' }));
    expect(fn).not.toHaveBeenCalled();
    stop();
    dispatchCommand(target, { uid: 'a/one', button: 'ring' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('dispatching with no listener is harmless', () => {
    expect(() => dispatchCommand(new EventTarget(), { uid: 'a', button: 'b' })).not.toThrow();
  });
});
