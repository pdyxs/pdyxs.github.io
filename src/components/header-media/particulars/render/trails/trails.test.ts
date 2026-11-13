import { describe, expect, it } from 'vitest';
import { darken, lighten, trailColours } from './colour';
import { MIN_VERTEX_DISTANCE, POS_TRAIL_COLOUR, NEG_TRAIL_COLOUR, STRANDS, STRAND_DIE_SECONDS, type StrandDef } from './constants';
import { explosionRimAlpha, MarkTracker, MARK_FLOATS, SEGMENT_VERTS } from './perma';
import { Polyline } from './polyline';
import { evaluate, RibbonHistory, shouldSave, writeRibbon } from './ribbon';
import { PLAYER_KEY, trailSources, type TrailSource } from './sources';
import { sampleKeys, spinRate, TrailHistory, unityClamp, writeStrand } from './strands';
import { FLOATS_PER_VERTEX, StripWriter } from './strip';
import { markBufferSize } from './index';
import type { Snapshot } from '../../../../../lib/particulars/sim/snapshot';

const src = (key: number, x: number, y: number, extra: Partial<TrailSource> = {}): TrailSource => ({
  key, x, y, speed: 5, isPlayer: false, parity: 1, neutrino: false, ...extra,
});
/** A fixed "random" so rigs are deterministic. */
const half = () => 0.5;

describe('Polyline', () => {
  it('keeps one expired point so the tail can be clipped, and grows past its capacity', () => {
    const p = new Polyline(2);
    for (let i = 0; i < 10; i++) p.push(i, 0, i * 0.1);
    expect(p.length).toBe(10);
    p.expire(1.0, 0.35); // points at t ≤ 0.65 are too old; keep the newest of those (t=0.6)
    expect(p.t(0)).toBeCloseTo(0.6);
    expect(p.x(p.length - 1)).toBe(9);
  });
});

describe('colour', () => {
  it('matter trails are white, antimatter black, and inverse strands swap them', () => {
    expect(trailColours(false, 1)).toEqual({ main: POS_TRAIL_COLOUR, inverse: NEG_TRAIL_COLOUR });
    expect(trailColours(false, -1)).toEqual({ main: NEG_TRAIL_COLOUR, inverse: POS_TRAIL_COLOUR });
  });
  it('light theme swaps the roles: matter in graphite, antimatter pale, player a deeper blue', () => {
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const paper = 0xe3 / 255;
    const pos = trailColours(false, 1, 'light');
    const neg = trailColours(false, -1, 'light');
    expect(lum(pos.main)).toBeLessThan(0.3);
    expect(lum(neg.main)).toBeGreaterThan(paper);
    expect(pos.inverse).toEqual(neg.main);
    const player = trailColours(true, 1, 'light');
    // Reads on the paper: well darker than it, and still bluer than it is red.
    expect(lum(player.main)).toBeLessThan(0.5);
    expect(player.main[2]).toBeGreaterThan(player.main[0]);
    // Dark stays the original's.
    expect(trailColours(false, 1, 'dark').main).toEqual(POS_TRAIL_COLOUR);
    expect(trailColours(false, 1)).toEqual(trailColours(false, 1, 'dark'));
  });
  it('lighten/darken follow ColorUtils', () => {
    expect(darken([1, 0.5, 0, 1], 0.8)).toEqual([expect.closeTo(0.2), expect.closeTo(0.1), 0, 1]);
    expect(lighten([0.2, 0.2, 0.2, 1], 0.5)).toEqual([expect.closeTo(0.3), expect.closeTo(0.3), expect.closeTo(0.3), 1]);
    expect(lighten([1, 1, 1, 1], 0.95)).toEqual([1, 1, 1, 1]);
    const p = trailColours(true, 1);
    expect(Math.min(p.main[0], p.main[1], p.main[2])).toBeGreaterThan(0.5); // near-white tint
    expect(Math.max(p.inverse[0], p.inverse[1], p.inverse[2])).toBeLessThan(0.25); // near-black tint
  });
});

describe('strand rig maths', () => {
  it('unityClamp flips between min and max when min > max, like Mathf.Clamp', () => {
    expect(unityClamp(0.07, 0.1, 0.05)).toBe(0.1);
    expect(unityClamp(0.1, 0.1, 0.05)).toBe(0.05);
    expect(unityClamp(0, -1, 1)).toBe(0);
  });
  it('spin speeds up with velocity inside its clamp', () => {
    expect(spinRate(0, 500, 300, 900)).toBe(300);
    expect(spinRate(5, 500, 300, 900)).toBe(500);
    expect(spinRate(100, 500, 300, 900)).toBe(900);
  });
  it('sampleKeys interpolates evenly spaced keys', () => {
    expect(sampleKeys([0, 1, 0], 0.25)).toBeCloseTo(0.5);
    expect(sampleKeys([0, 1, 0], 1)).toBe(0);
    expect(sampleKeys([0, 1, 0], 2)).toBe(0);
  });
});

describe('TrailHistory', () => {
  it('builds one rig per source with every strand, and lays points only after MIN_VERTEX_DISTANCE', () => {
    const h = new TrailHistory(STRANDS, half);
    h.update([src(1, 0, 0)], 0, 1 / 60);
    const rig = h.rigs.get(1)!;
    expect(rig.strands).toHaveLength(STRANDS.length);
    const before = rig.strands.map((s) => s.points.length);
    h.update([src(1, MIN_VERTEX_DISTANCE / 10, 0, { speed: 0 })], 0.001, 0.001);
    // A hair's move (and almost no spin) lays nothing new.
    expect(rig.strands.map((s) => s.points.length)).toEqual(before);
    h.update([src(1, 1, 0)], 0.1, 0.1);
    expect(rig.strands.every((s, i) => s.points.length === before[i] + 1)).toBe(true);
  });

  it('expires points older than the strand time', () => {
    const def: StrandDef = { ...STRANDS[1], time: 0.5 };
    const h = new TrailHistory([def], half);
    for (let i = 0; i <= 100; i++) h.update([src(1, i * 0.2, 0)], i * 0.05, 0.05);
    const pts = h.rigs.get(1)!.strands[0].points;
    // ~0.5s of points at 20/s, plus the one kept for clipping.
    expect(pts.length).toBeLessThanOrEqual(12);
    expect(5 - pts.t(0)).toBeGreaterThanOrEqual(0.5);
    expect(5 - pts.t(1)).toBeLessThan(0.5);
  });

  it('keeps a vanished particle\'s trail frozen while it thins, then forgets it', () => {
    const h = new TrailHistory(STRANDS, half);
    for (let i = 0; i < 10; i++) h.update([src(1, i * 0.3, 0)], i * 0.05, 0.05);
    h.update([], 0.5, 0.05);
    expect(h.rigs.get(1)!.diedAt).toBe(0.5);
    const n = h.rigs.get(1)!.strands[0].points.length;
    h.update([], 1.0, 0.5);
    expect(h.rigs.get(1)!.strands[0].points.length).toBe(n);
    h.update([], 3, STRAND_DIE_SECONDS);
    expect(h.rigs.has(1)).toBe(false);
  });

  it('restarts a trail that teleports rather than streaking across', () => {
    const h = new TrailHistory(STRANDS, half);
    for (let i = 0; i < 5; i++) h.update([src(1, i * 0.3, 0)], i * 0.05, 0.05);
    h.update([src(1, 50, 50)], 0.3, 0.05);
    expect(h.rigs.get(1)!.strands[0].points.length).toBe(1);
  });

  it('writes each strand as left/right pairs, tapering in width and fading to the tail', () => {
    const def: StrandDef = { ...STRANDS[1], alphas: [1, 1, 1, 1, 0] };
    const h = new TrailHistory([def], half);
    for (let i = 0; i <= 20; i++) h.update([src(1, i * 0.5, 0, { speed: 0 })], i * 0.05, 0.05);
    const out = new StripWriter();
    const rig = h.rigs.get(1)!;
    writeStrand(out, rig.strands[0], rig, 1.0);
    expect(out.count % 2).toBe(0);
    const v = (i: number, k: number) => out.data[i * FLOATS_PER_VERTEX + k];
    const width = (pair: number) => Math.hypot(v(pair * 2, 0) - v(pair * 2 + 1, 0), v(pair * 2, 1) - v(pair * 2 + 1, 1));
    const last = out.count / 2 - 1;
    expect(width(last)).toBeCloseTo(def.startWidth, 2); // head
    expect(width(0)).toBeCloseTo(def.endWidth, 2); // clipped tail
    expect(v(0, 5)).toBeCloseTo(0, 2);
    expect(v(last * 2, 5)).toBeCloseTo(1, 2);
  });
});

describe('StripWriter', () => {
  it('joins strips with two degenerate vertices', () => {
    const w = new StripWriter();
    w.begin();
    for (let i = 0; i < 4; i++) w.vertex(i, 0, 1, 1, 1, 1);
    w.begin();
    for (let i = 0; i < 4; i++) w.vertex(10 + i, 0, 1, 1, 1, 1);
    expect(w.count).toBe(10);
    expect(w.data[4 * FLOATS_PER_VERTEX]).toBe(3); // repeat of the last
    expect(w.data[5 * FLOATS_PER_VERTEX]).toBe(10); // the next strip's first, twice
    expect(w.data[6 * FLOATS_PER_VERTEX]).toBe(10);
  });
});

describe('ribbon', () => {
  it('saves a control point on the timer, on distance, or on a turn — never when still', () => {
    const def = { saveTime: 0.5, saveDist: 0.6, saveDir: 0.9 } as Parameters<typeof shouldSave>[0];
    expect(shouldSave(def, 1, 0, 0)).toBe(false);
    expect(shouldSave(def, 0.6, 0.01, 1)).toBe(true);
    expect(shouldSave(def, 0, 0.5, 1)).toBe(true);
    expect(shouldSave(def, 0, 0.01, 0.5)).toBe(true);
    expect(shouldSave(def, 0, 0.01, 1)).toBe(false);
  });
  it('the spline passes through its middle control points', () => {
    const o = { x: 0, y: 0 };
    evaluate(0, 0, 1, 0, 2, 1, 3, 1, 0.4, 0, o);
    expect(o).toEqual({ x: 1, y: 0 });
    evaluate(0, 0, 1, 0, 2, 1, 3, 1, 0.4, 1, o);
    expect(o.x).toBeCloseTo(2);
    expect(o.y).toBeCloseTo(1);
  });
  it('draws three strips per trail, ending at the particle', () => {
    const h = new RibbonHistory();
    for (let i = 0; i <= 30; i++) h.update([src(1, i * 0.3, Math.sin(i) * 0.5)], i * 0.05, 0.05);
    const out = new StripWriter();
    writeRibbon(out, h.trails.get(1)!, 1.5);
    expect(out.count).toBeGreaterThan(20);
  });
});

describe('marks', () => {
  it('stamps one segment per moving source from where it was, none on its first frame or a jump', () => {
    const m = new MarkTracker(half);
    m.update([src(1, 0, 0), src(2, 5, 5)], 1 / 60);
    expect(m.count).toBe(0);
    m.update([src(1, 1, 0), src(2, 5, 5)], 1 / 60);
    expect(m.count).toBe(SEGMENT_VERTS);
    // Every vertex carries the source's fixed depth, and alpha is 0 on the outer edges.
    const depths = new Set<number>();
    for (let i = 0; i < m.count; i++) depths.add(m.data[i * MARK_FLOATS + 3]);
    expect(depths.size).toBe(1);
    expect([...depths][0]).toBeLessThan(1);
    m.update([src(1, 40, 40)], 1 / 60);
    expect(m.count).toBe(0);
  });
  it('neutrinos mark far darker than other particles', () => {
    const a = new MarkTracker(half);
    a.update([src(1, 0, 0, { neutrino: true })], 1 / 60);
    a.update([src(1, 1, 0, { neutrino: true })], 1 / 60);
    const b = new MarkTracker(half);
    b.update([src(1, 0, 0)], 1 / 60);
    b.update([src(1, 1, 0)], 1 / 60);
    const maxA = (m: MarkTracker) => Math.max(...Array.from({ length: m.count }, (_, i) => m.data[i * MARK_FLOATS + 2]));
    expect(maxA(a)).toBeGreaterThan(maxA(b) * 5);
  });
  it('an explosion wipes its inside and leaves only a faint rim at the very edge', () => {
    expect(explosionRimAlpha(0)).toBe(0);
    expect(explosionRimAlpha(0.5)).toBe(0);
    expect(explosionRimAlpha(0.995)).toBeGreaterThan(0.1);
    expect(explosionRimAlpha(1.2)).toBe(0);
  });
  it('the mark buffer is sized from the world, capped', () => {
    expect(markBufferSize({ x: 0, y: 0, width: 20, height: 10 })).toEqual({ width: 1280, height: 640 });
    expect(markBufferSize({ x: 0, y: 0, width: 100, height: 10 }).width).toBe(2048);
  });
});

describe('trailSources', () => {
  it('takes live particles and the living player, skipping telegraphs', () => {
    const snap = {
      player: { x: 1, y: 2, vx: 3, vy: 4, alive: true, parity: 1, type: 'electron' },
      particles: [
        { id: 7, x: 0, y: 0, vx: 0, vy: 0, live: true, parity: -1, type: 'muonNeutrino' },
        { id: 8, x: 0, y: 0, vx: 0, vy: 0, live: false, parity: 1, type: 'up' },
      ],
    } as unknown as Snapshot;
    const s = trailSources(snap);
    expect(s.map((x) => x.key)).toEqual([PLAYER_KEY, 7]);
    expect(s[0].speed).toBe(5);
    expect(s[1].neutrino).toBe(true);
  });
});
