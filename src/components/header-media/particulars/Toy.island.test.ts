// Client-mount test for the Particulars toy: DOM events in, Snapshot-driven SVG out.
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Toy from './Toy.svelte';
import type { Scenario } from '../../../lib/particulars/scenario/types';

const SCENARIO: Scenario = { walls: { width: 20, height: 10 }, player: { x: 0, y: 0, radius: 0.5 } };

let target: HTMLElement;
let component: ReturnType<typeof mount>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(Toy as any, { target, props: { entryId: 'what/toys/particulars', scenario: SCENARIO } });
  flushSync();
});
afterEach(() => {
  unmount(component);
  target.remove();
});

const player = () => target.querySelector('g.player')!;
const at = () => player().getAttribute('transform')!.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/)!;
const cx = () => Number(at()[1]);
const cy = () => Number(at()[2]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Toy', () => {
  it('draws the walls and the player from the snapshot', () => {
    expect(target.querySelector('svg.particulars')!.getAttribute('viewBox')).toBe('-10.5 -5.5 21 11');
    expect(cx()).toBe(0);
    expect(player().getAttribute('data-type')).toBe('down');
  });

  it('a held key moves the particle, and releasing it lets it settle', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await wait(300);
    expect(cx()).toBeGreaterThan(0.1);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    await wait(1500);
    const settled = cx();
    await wait(200);
    expect(cx()).toBeCloseTo(settled, 1);
  });

  it('a held pointer steers toward it; a press on the player does not', async () => {
    const svg = target.querySelector('svg')!;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 210, height: 110, right: 210, bottom: 110, x: 0, y: 0, toJSON() {} }) as DOMRect;
    // On the player (centre of the view): no steering.
    svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 105, clientY: 55, bubbles: true }));
    await wait(200);
    expect(cx()).toBe(0);
    svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));

    // Below and left of the player: moves that way.
    svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 20, clientY: 100, bubbles: true }));
    await wait(300);
    expect(cx()).toBeLessThan(-0.05);
    expect(cy()).toBeGreaterThan(0.05);
    svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true }));
  });
});

describe('Toy particles', () => {
  const WAVES: Scenario = {
    ...SCENARIO,
    waves: [
      {
        id: 'w',
        entries: [
          { spawn: { type: 'up', colour: 'red', parity: -1 }, position: { x: 5, y: 2 }, telegraph: 0.3 },
          { spawn: 'tau', position: { x: -5, y: -2 } },
        ],
      },
    ],
    triggers: [{ kind: 'time', at: 0, actions: [{ kind: 'spawn', wave: 'w' }] }],
  };
  let second: ReturnType<typeof mount>;
  let box: HTMLElement;

  beforeEach(() => {
    box = document.createElement('div');
    document.body.appendChild(box);
    second = mount(Toy as any, { target: box, props: { entryId: 'x', scenario: WAVES } });
    flushSync();
  });
  afterEach(() => {
    unmount(second);
    box.remove();
  });

  it('draws spawned particles with their type, colour and parity, telegraphing then live', async () => {
    await wait(100);
    const up = box.querySelector('.particle[data-type="up"]')!;
    expect(up.getAttribute('data-colour')).toBe('red');
    expect(up.getAttribute('data-parity')).toBe('-1');
    expect(up.getAttribute('data-live')).toBe('false');
    expect(up.querySelector('.telegraph')).not.toBeNull();
    expect(box.querySelector('.particle[data-type="tau"]')).not.toBeNull();
    await wait(600);
    const later = box.querySelector('.particle[data-type="up"]')!;
    expect(later.getAttribute('data-live')).toBe('true');
    expect(later.querySelector('.telegraph')).toBeNull();
  });
});


describe('Toy forces', () => {
  const FORCES: Scenario = {
    ...SCENARIO,
    forces: { em: true, gravity: false },
    blackHoles: [{ x: 4, y: 1, mass: 10 }],
  };
  let second: ReturnType<typeof mount>;
  let box: HTMLElement;

  beforeEach(() => {
    box = document.createElement('div');
    document.body.appendChild(box);
    second = mount(Toy as any, { target: box, props: { entryId: 'x', scenario: FORCES } });
    flushSync();
  });
  afterEach(() => {
    unmount(second);
    box.remove();
  });

  it('shows all four forces and whether each is on', () => {
    const items = [...box.querySelectorAll('.forces [data-force]')].map((e) => [
      e.getAttribute('data-force'),
      e.getAttribute('data-on'),
      e.textContent,
    ]);
    expect(items).toEqual([
      ['strong', 'false', 'strong off'],
      ['weak', 'false', 'weak off'],
      ['em', 'true', 'EM on'],
      ['gravity', 'false', 'gravity off'],
    ]);
  });

  it('draws black holes, marked dormant while gravity is off', () => {
    const hole = box.querySelector('circle.black-hole')!;
    expect(hole.getAttribute('cx')).toBe('4');
    expect(Number(hole.getAttribute('r'))).toBeCloseTo(Math.sqrt(10 / Math.PI), 5);
    expect(hole.getAttribute('data-active')).toBe('false');
  });
});

describe('Toy action', () => {
  const WEAK: Scenario = { ...SCENARIO, forces: { weak: true } };
  const mountWeak = () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const c = mount(Toy as any, { target: box, props: { entryId: 'x', scenario: WEAK } });
    flushSync();
    return { box, done: () => { unmount(c); box.remove(); } };
  };
  const typeOf = (box: HTMLElement) => box.querySelector('g.player')!.getAttribute('data-type');

  it('Space fires the scenario action: a weak-force player changes', async () => {
    const { box, done } = mountWeak();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    await wait(100);
    expect(typeOf(box)).toBe('up');
    done();
  });

  it('a tap on the particle fires the same action and does not steer', async () => {
    const { box, done } = mountWeak();
    const svg = box.querySelector('svg')!;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 210, height: 110, right: 210, bottom: 110, x: 0, y: 0, toJSON() {} }) as DOMRect;
    svg.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 105, clientY: 55, bubbles: true }));
    await wait(100);
    expect(typeOf(box)).toBe('up');
    done();
  });
});
