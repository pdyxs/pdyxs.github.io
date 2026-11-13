import { describe, expect, it } from 'vitest';
import type { ParticleSnapshot, Snapshot } from '../../../../../lib/particulars/sim/snapshot';
import { ATLAS } from './atlas/atlas-map';
import { UNITY, UNITY_LIGHT } from './palette';
import { buildScene, type Draw } from './scene';
import { PLAYER_KEY, Tracker } from './tracker';

const has = (n: string) => n in ATLAS;

function snap(o: Partial<Snapshot> = {}, player: Partial<Snapshot['player']> = {}): Snapshot {
  return {
    tick: 0,
    walls: { width: 20, height: 10 },
    player: { x: 0, y: 0, radius: 0.5, type: 'up', colour: 'white', parity: 1, alive: true, vx: 0, vy: 0, steer: { x: 0, y: 0 }, ...player },
    particles: [],
    blackHoles: [],
    barriers: [],
    forces: { em: true, strong: false, weak: false, gravity: false },
    explosions: [],
    pickupsEnabled: false,
    pickups: [],
    collected: 0,
    ...o,
  } as Snapshot;
}

const particle = (o: Partial<ParticleSnapshot>): ParticleSnapshot => ({
  id: 1, type: 'down', colour: 'white', parity: 1, x: 5, y: 0, radius: 0.75, live: true, vx: 0, vy: 0, ...o,
});

const scene = (s: Snapshot, t: Tracker): Draw[] =>
  buildScene({ snapshot: s, palette: UNITY, has, state: (id) => t.get(id), cooldownLeft: t.cooldownLeft, indicator: true });
const sprites = (d: Draw[]) => d.filter((x) => x.kind === 'sprite').map((x) => (x.kind === 'sprite' ? x.sprite : ''));

describe('buildScene', () => {
  it('draws the player with its player sprites, and nothing once it has died', () => {
    const t = new Tracker(1);
    const s = snap();
    t.update(s, 0.016);
    expect(sprites(scene(s, t))).toEqual(['up0', 'up1', 'up2player', 'up5']);
    const dead = snap({}, { alive: false });
    t.update(dead, 0.016);
    expect(scene(dead, t)).toEqual([]);
  });

  it('telegraphs a particle that is not live yet: spinners, ring, then the particle growing', () => {
    const t = new Tracker(1);
    const s = snap({ particles: [particle({ live: false, parity: -1 })] });
    t.update(s, 0.016);
    for (let i = 0; i < 30; i++) t.update({ ...s, tick: i }, 0.02);
    const names = sprites(scene(s, t)).filter((n) => !n.startsWith('up'));
    expect(names.slice(0, 6)).toEqual(['s-black-spin-5', 's-black-spin-4', 's-black-spin-3', 's-black-spin-2', 's-black-spin-1', 's-black-ring-4']);
    expect(names).toContain('adown0');
  });

  it('puts the decay ring over the glow while the weak force is on', () => {
    const t = new Tracker(1);
    const s = snap({ forces: { em: true, strong: false, weak: true, gravity: false }, particles: [particle({ type: 'strange' })] });
    t.update(s, 0.016);
    const d = scene(s, t).filter((x) => x.kind === 'ring' || (x.kind === 'sprite' && x.sprite.startsWith('strange')));
    const order = d.map((x) => (x.kind === 'ring' ? 'ring' : x.sprite));
    expect(order.slice(0, 3)).toEqual(['strange0', 'strange1', 'ring']);
  });
});

describe('buildScene in light mode', () => {
  it('rims each body in ink, outside it and beneath its layers', () => {
    const t = new Tracker(1);
    const s = snap({ particles: [particle({})] });
    t.update(s, 0.016);
    const d = buildScene({ snapshot: s, palette: UNITY_LIGHT, has, state: (id) => t.get(id), cooldownLeft: 0, indicator: false });
    expect(d[0].kind).toBe('ring');
    if (d[0].kind === 'ring') expect(d[0].outer).toBeGreaterThan(0.75);
    expect(d[1].kind === 'sprite' && d[1].sprite).toBe('down0');
  });
});

describe('Tracker', () => {
  it("eases the player's layers toward the steering", () => {
    const t = new Tracker(1);
    for (let i = 0; i < 120; i++) t.update(snap({ tick: i }, { steer: { x: 1, y: 0 } }), 1 / 60);
    const eyes = t.get(PLAYER_KEY)!.eyes;
    expect(eyes[0]).toBe(0);
    expect(eyes[2 * 5]).toBeCloseTo(0.22, 2);
    expect(eyes[2 * 5 + 1]).toBeCloseTo(0);
  });

  it('runs a decay timer only while live and of a decaying type, across a change', () => {
    const t = new Tracker(1);
    t.update(snap({ tick: 0, particles: [particle({ type: 'strange' })] }), 0.02);
    t.update(snap({ tick: 10, particles: [particle({ type: 'strange' })] }), 0.2);
    expect(t.get(1)!.decayTicks).toBe(10);
    t.update(snap({ tick: 20, particles: [particle({ type: 'up' })] }), 0.2);
    expect(t.get(1)!.decayTicks).toBe(10);
    expect(t.get(1)!.prev?.type).toBe('strange');
  });

  it('forgets everything when the run restarts', () => {
    const t = new Tracker(1);
    t.update(snap({ tick: 50, particles: [particle({ type: 'strange' })] }), 0.02);
    t.update(snap({ tick: 60, particles: [particle({ type: 'strange' })] }), 0.02);
    t.update(snap({ tick: 0, particles: [particle({ type: 'strange' })] }), 0.02);
    expect(t.get(1)!.decayTicks).toBe(0);
  });

  it("starts the player's explosion cooldown when an explosion appears on the player", () => {
    const t = new Tracker(1);
    t.update(snap({ explosions: [{ id: 3, x: 0.1, y: 0, radius: 0.5, maxRadius: 4 }] }), 0.02);
    expect(t.cooldownLeft).toBeGreaterThan(0.9);
    t.update(snap({ explosions: [{ id: 4, x: 8, y: 0, radius: 0.5, maxRadius: 4 }] }), 0.5);
    expect(t.cooldownLeft).toBeCloseTo(0.5);
  });
});
