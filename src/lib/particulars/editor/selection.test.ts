import { describe, it, expect } from 'vitest';
import { editorHandles, dragEdit } from './selection';
import { applyEdit } from './edit';
import type { Scenario } from '../scenario/types';

const SCENARIO: Scenario = {
  walls: { width: 20, height: 10 },
  player: { x: 0, y: 0 },
  barriers: [{ shape: 'rect', mode: 'all', x: 2, y: 1, width: 4, height: 2 }],
  formations: {
    row: { kind: 'line', count: 3, distance: 2, contents: ['up'] },
    nest: { kind: 'line', count: 2, distance: 4, angle: 90, contents: ['row'] },
  },
  waves: [{ id: 'a', entries: [{ spawn: 'row', position: { x: 1, y: 1 } }, { spawn: 'nest' }, { spawn: 'electron' }] }],
};

const key = (hs: { key: string }[]) => hs.map((h) => h.key);

describe('editorHandles', () => {
  it('an entry gets a centre handle plus its formation handles', () => {
    const hs = editorHandles(SCENARIO, { kind: 'entry', wave: 0, entry: 0 });
    expect(key(hs)).toEqual(['centre', 'row:spacing', 'row:rotation']);
    expect([hs[0].x, hs[0].y]).toEqual([1, 1]);
  });

  it('a particle spawn has only a centre', () => {
    expect(key(editorHandles(SCENARIO, { kind: 'entry', wave: 0, entry: 2 }))).toEqual(['centre']);
  });

  it('a nested formation is handled in its own frame, once per placement', () => {
    const ks = key(editorHandles(SCENARIO, { kind: 'entry', wave: 0, entry: 1 }));
    expect(ks.filter((k) => k.startsWith('nest:'))).toEqual(['nest:spacing', 'nest:rotation']);
    expect(ks.filter((k) => k.startsWith('row:')).length).toBe(4); // two placements of row, two handles each
  });

  it('a wall gets its own handles', () => {
    expect(key(editorHandles(SCENARIO, { kind: 'wall', index: 0 }))).toEqual(['centre', 'size', 'rotation']);
  });

  it('nothing selected, nothing to drag', () => {
    expect(editorHandles(SCENARIO, null)).toEqual([]);
  });
});

describe('dragEdit', () => {
  const drag = (sel: Parameters<typeof editorHandles>[1], k: string, delta: { x: number; y: number }) => {
    const h = editorHandles(SCENARIO, sel).find((x) => x.key === k)!;
    return applyEdit(SCENARIO, dragEdit(SCENARIO, h, delta));
  };

  it('dragging the centre writes the entry position', () => {
    const next = drag({ kind: 'entry', wave: 0, entry: 0 }, 'centre', { x: 2, y: 3 });
    expect(next.waves![0].entries[0].position).toEqual({ x: 3, y: 4 });
  });

  it('dragging the centre of an entry with no position starts from the origin', () => {
    const next = drag({ kind: 'entry', wave: 0, entry: 2 }, 'centre', { x: 1, y: 0 });
    expect(next.waves![0].entries[2].position).toEqual({ x: 1, y: 0 });
  });

  it('dragging a formation handle rewrites that formation in the library', () => {
    const next = drag({ kind: 'entry', wave: 0, entry: 0 }, 'row:spacing', { x: 1, y: 0 });
    expect((next.formations!.row as { distance: number }).distance).toBe(3);
  });

  it('a nested handle edits the shared definition using the nested frame', () => {
    const sel = { kind: 'entry', wave: 0, entry: 1 } as const;
    const hs = editorHandles(SCENARIO, sel).filter((h) => h.key === 'row:spacing');
    // nest runs down +y, so each row stands on its own slot and runs along +y too
    // (nest.angle 90 stacked onto row.angle 0); dragging along +y lengthens it
    const next = applyEdit(SCENARIO, dragEdit(SCENARIO, hs[0], { x: 0, y: 1 }));
    expect((next.formations!.row as { distance: number }).distance).toBe(3);
  });

  it('dragging a wall handle rewrites that barrier', () => {
    const next = drag({ kind: 'wall', index: 0 }, 'centre', { x: 1, y: 0 });
    expect(next.barriers![0]).toMatchObject({ x: 3, y: 1 });
  });
});
