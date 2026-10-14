import { describe, it, expect } from 'vitest';
import { BINDINGS, intentFor, inputEventForKey } from './bindings';
import type { Bindings } from './bindings';
import { pressKind } from './pointer';

const switches = (on: Partial<Record<'strong' | 'weak' | 'em' | 'gravity', boolean>>) => ({
  strong: false, weak: false, em: false, gravity: false, ...on,
});

describe('bindings', () => {
  it('Space and a tap on yourself fire the same intent in a scenario', () => {
    const weak = switches({ weak: true });
    expect(intentFor('space', weak)).toEqual({ kind: 'change' });
    expect(intentFor('tap-self', weak)).toEqual(intentFor('space', weak));
  });

  it('each scenario chooses what the action does: change only with weak, explosion only with EM or strong', () => {
    expect(intentFor('space', switches({ em: true }))).toEqual({ kind: 'explode' });
    expect(intentFor('space', switches({ strong: true }))).toEqual({ kind: 'explode' });
    expect(intentFor('space', switches({ gravity: true }))).toBeNull();
  });

  it('with several options on, the first available wins', () => {
    expect(intentFor('space', switches({ weak: true, em: true }))).toEqual({ kind: 'change' });
  });

  it('changing the one table changes behaviour, with no other edit', () => {
    const weak = switches({ weak: true });
    const swapped: Bindings = { ...BINDINGS, space: 'none', 'tap-self': 'explode' };
    expect(intentFor('space', weak, swapped)).toBeNull();
    expect(intentFor('tap-self', weak, swapped)).toEqual({ kind: 'explode' });
  });

  it('keys map to input events', () => {
    expect(inputEventForKey(' ')).toBe('space');
    expect(inputEventForKey('Enter')).toBeNull();
  });
});

describe('pressKind', () => {
  it('a press on the player is a tap-self, anywhere else steers', () => {
    const player = { x: 1, y: 1, radius: 0.5 };
    expect(pressKind({ x: 1.2, y: 1 }, player)).toBe('tap-self');
    expect(pressKind({ x: 3, y: 1 }, player)).toBe('steer');
  });
});
