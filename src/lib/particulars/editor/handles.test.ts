import { describe, it, expect } from 'vitest';
import { formationHandles, dragFormation, wallHandles, dragWall } from './handles';
import type { Formation, WallDef } from '../scenario/types';

const ORIGIN = { x: 0, y: 0, angle: 0 };
const at = (hs: { id: string; x: number; y: number }[], id: string) => hs.find((h) => h.id === id)!;

describe('line handles', () => {
  const line: Formation = { kind: 'line', count: 5, distance: 1, contents: ['up'] };

  it('the spacing handle sits on the last slot and dragging it rescales distance', () => {
    const h = at(formationHandles(line, ORIGIN), 'spacing');
    expect([h.x, h.y]).toEqual([2, 0]);
    expect(dragFormation(line, 'spacing', { x: 1, y: 0 }, ORIGIN)).toEqual({ ...line, distance: 1.5 });
  });
});

describe('line rotation', () => {
  const line: Formation = { kind: 'line', count: 3, distance: 2, contents: ['up'] };

  it('the rotation handle sits off the line, and dragging it sets the formation angle', () => {
    const h = at(formationHandles(line, ORIGIN), 'rotation');
    expect([h.x, h.y]).toEqual([0, -1]);
    // pointer from (0,-1) to (1,0): the handle now points along +x, so the line is turned 90 degrees
    expect(dragFormation(line, 'rotation', { x: 1, y: 1 }, ORIGIN)).toEqual({ ...line, angle: 90 });
  });

  it('works in the nested frame: handles follow the enclosing angle and the stored angle is relative to it', () => {
    const frame = { x: 5, y: 5, angle: 30 };
    const h = at(formationHandles(line, frame), 'rotation');
    expect(h.x).toBeCloseTo(5 + Math.sin(rad(30)), 6);
    expect(h.y).toBeCloseTo(5 - Math.cos(rad(30)), 6);
    // pointing the handle's arm along +x again means total angle 90, so 60 relative to the frame
    const delta = { x: 6 - h.x, y: 5 - h.y };
    expect(dragFormation(line, 'rotation', delta, frame)).toEqual({ ...line, angle: 60 });
  });

  it('spacing in the nested frame measures along the stacked axis', () => {
    const f: Formation = { kind: 'line', count: 3, distance: 2, angle: 60, contents: ['up'] };
    const frame = { x: 0, y: 0, angle: 30 }; // total 90: the line runs down +y
    const h = at(formationHandles(f, frame), 'spacing');
    expect(h.x).toBeCloseTo(0, 6);
    expect(h.y).toBeCloseTo(2, 6);
    expect(dragFormation(f, 'spacing', { x: 0, y: 1 }, frame)).toEqual({ ...f, distance: 3 });
  });
});
const rad = (d: number) => (d * Math.PI) / 180;

describe('circle handles', () => {
  const ring: Formation = { kind: 'circle', count: 6, radius: 2, contents: ['up'] };

  it('the radius handle sits on slot 0 and dragging it sets the radius to its distance from the centre', () => {
    const h = at(formationHandles(ring, { x: 1, y: 1, angle: 0 }), 'radius');
    expect([h.x, h.y]).toEqual([3, 1]);
    expect(dragFormation(ring, 'radius', { x: 2, y: 0 }, { x: 1, y: 1, angle: 0 })).toEqual({ ...ring, radius: 4 });
  });

  it('the radius handle follows the stacked rotation', () => {
    const h = at(formationHandles({ ...ring, angle: 90 }, ORIGIN), 'radius');
    expect(h.x).toBeCloseTo(0, 6);
    expect(h.y).toBeCloseTo(2, 6);
  });

  it('the rotation handle sits beyond the ring and sets the angle', () => {
    const h = at(formationHandles(ring, ORIGIN), 'rotation');
    expect([h.x, h.y]).toEqual([0, -3]);
    expect(dragFormation(ring, 'rotation', { x: 3, y: 3 }, ORIGIN)).toEqual({ ...ring, angle: 90 });
  });
});

describe('single handles', () => {
  it('has none of its own: its position is the wave entry centre', () => {
    expect(formationHandles({ kind: 'single', contents: ['up'] }, ORIGIN)).toEqual([]);
  });
});

describe('rect wall handles', () => {
  const wall: WallDef = { shape: 'rect', mode: 'all', x: 2, y: 1, width: 4, height: 2 };

  it('centre moves the wall by the pointer delta', () => {
    const h = at(wallHandles(wall), 'centre');
    expect([h.x, h.y]).toEqual([2, 1]);
    expect(dragWall(wall, 'centre', { x: 1, y: -0.5 })).toEqual({ ...wall, x: 3, y: 0.5 });
  });

  it('the size handle is the corner and sets width and height about the centre', () => {
    const h = at(wallHandles(wall), 'size');
    expect([h.x, h.y]).toEqual([4, 2]);
    expect(dragWall(wall, 'size', { x: 1, y: 1 })).toEqual({ ...wall, width: 6, height: 4 });
  });

  it('size is measured in the wall frame when it is rotated', () => {
    const turned: WallDef = { ...wall, x: 0, y: 0, angle: 90 };
    const h = at(wallHandles(turned), 'size');
    expect(h.x).toBeCloseTo(-1, 6);
    expect(h.y).toBeCloseTo(2, 6);
    expect(dragWall(turned, 'size', { x: 0, y: 1 })).toEqual({ ...turned, width: 6 });
  });

  it('the rotation handle sets the angle', () => {
    const h = at(wallHandles(wall), 'rotation');
    expect([h.x, h.y]).toEqual([2, -1]);
    expect(dragWall(wall, 'rotation', { x: 2, y: 2 })).toEqual({ ...wall, angle: 90 });
  });
});

describe('arc wall handles', () => {
  const arc: WallDef = { shape: 'arc', mode: 'all', x: 1, y: 1, radius: 4, thickness: 1, start: 0, sweep: 90 };
  const pos = (id: string) => {
    const h = at(wallHandles(arc), id);
    return [Math.round(h.x * 1e6) / 1e6, Math.round(h.y * 1e6) / 1e6];
  };

  it('centre moves the arc', () => {
    expect(dragWall(arc, 'centre', { x: 2, y: 0 })).toEqual({ ...arc, x: 3 });
  });

  it('start sits on the outer edge at the start angle and rotates the arc, keeping its sweep', () => {
    expect(pos('start')).toEqual([5, 1]);
    expect(dragWall(arc, 'start', { x: -4, y: 4 })).toEqual({ ...arc, start: 90 });
  });

  it('sweep sits mid-band at the far end and sets how far the arc runs', () => {
    expect(pos('sweep')).toEqual([1, 4.5]);
    expect(dragWall(arc, 'sweep', { x: 1, y: -2.5 })).toEqual({ ...arc, sweep: 45 });
  });

  it('radius and thickness sit on the outer and inner edge at the middle of the arc', () => {
    const mid = (r: number) => [1 + r * Math.cos(Math.PI / 4), 1 + r * Math.sin(Math.PI / 4)];
    expect(pos('radius')).toEqual(mid(4).map((n) => Math.round(n * 1e6) / 1e6));
    expect(pos('thickness')).toEqual(mid(3).map((n) => Math.round(n * 1e6) / 1e6));
    const r = at(wallHandles(arc), 'radius');
    // pull the outer edge out to distance 5, along the same ray
    const out = { x: (5 - 4) * Math.cos(Math.PI / 4), y: (5 - 4) * Math.sin(Math.PI / 4) };
    expect(dragWall(arc, 'radius', out)).toEqual({ ...arc, radius: 5 });
    const inward = { x: -(Math.cos(Math.PI / 4)), y: -(Math.sin(Math.PI / 4)) };
    expect(dragWall(arc, 'thickness', inward)).toEqual({ ...arc, thickness: 2 });
    expect(r).toBeDefined();
  });

  it('a full ring defaults to start 0 and sweep 360', () => {
    const ring: WallDef = { shape: 'arc', mode: 'all', x: 0, y: 0, radius: 4, thickness: 1 };
    expect(dragWall(ring, 'start', { x: -4, y: 4 })).toEqual({ ...ring, start: 90 });
    expect(dragWall(ring, 'radius', { x: 0, y: 0 })).toEqual({ ...ring, radius: 4 });
  });
});
