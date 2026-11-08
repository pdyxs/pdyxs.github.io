import { describe, it, expect } from 'vitest';
import { buildCreditsGraph } from './credits-graph';
import { layoutCreditsGraph, layoutExpansion, labelHalfSize } from './credits-layout';
import { computeCreditsIndex } from './credits-index';
import type { Credit } from './credits';

const credit = (over: Partial<Credit> & { name: string }): Credit => ({ listed: 'map', ...over });

/** Unstoppabot-shaped: eleven people under roles, two of them holding two roles. */
const unstoppabot: Credit[] = [
  credit({ name: 'Nick Kolan', person: 'nick', role: 'Game Designer' }),
  credit({ name: 'Paul Sztajer', person: 'me', role: 'Lead Programmer' }),
  credit({ name: 'Paul Sztajer', person: 'me', role: 'Game Designer' }),
  credit({ name: 'Thomas Bowker', person: 'thomas', role: 'Programming' }),
  credit({ name: 'Thomas Bowker', person: 'thomas', role: 'Lead Programmer' }),
  ...['Ana Lee', 'Eli Cole', 'Mira Sol'].map(name => credit({ name, role: 'Art' })),
  ...['Pat Ellis', 'Quinn Marsh', 'Robin Vale', 'Sasha Doyle'].map(name => credit({ name, role: 'Music and Sound' })),
];

/** Several groups, uneven fan-out, a role-less person: enough shape to stress the layout. */
const big: Credit[] = [
  ...Array.from({ length: 9 }, (_, i) => credit({ name: `Voice ${i}`, group: 'Voice cast', role: 'Voice actor' })),
  ...Array.from({ length: 6 }, (_, i) => credit({ name: `Artist number ${i}`, group: 'Art', role: i % 2 ? 'Environment' : 'Characters' })),
  credit({ name: 'Voice 0', group: 'Art', role: 'Characters' }),
  credit({ name: 'Solo with a rather long name indeed' }),
  credit({ name: 'Group only', group: 'Misc' }),
];

const laid = (credits: Credit[]) => layoutCreditsGraph(buildCreditsGraph(credits));

describe('layoutCreditsGraph', () => {
  it('is deterministic: the same input gives byte-identical output', () => {
    expect(JSON.stringify(laid(big))).toBe(JSON.stringify(laid(big)));
  });

  it.each([['unstoppabot', unstoppabot], ['big', big]])('%s: every child sits radially further from the card than its parent', (_n, credits) => {
    const g = laid(credits);
    const card = g.nodes.find(n => n.kind === 'card')!;
    const r = (id: string) => { const n = g.nodes.find(m => m.id === id)!; return Math.hypot(n.x - card.x, n.y - card.y); };
    expect(g.edges.length).toBeGreaterThan(0);
    for (const e of g.edges) expect(r(e.to), `${e.from} -> ${e.to}`).toBeGreaterThan(r(e.from));
  });

  it.each([['unstoppabot', unstoppabot], ['big', big]])('%s: no two label boxes overlap', (_n, credits) => {
    const g = laid(credits);
    for (let i = 0; i < g.nodes.length; i++) {
      for (let j = i + 1; j < g.nodes.length; j++) {
        const a = g.nodes[i], b = g.nodes[j], ha = labelHalfSize(a), hb = labelHalfSize(b);
        const apart = Math.abs(a.x - b.x) >= ha.w + hb.w || Math.abs(a.y - b.y) >= ha.h + hb.h;
        expect(apart, `${a.label} / ${b.label}`).toBe(true);
      }
    }
  });

  it.each([['unstoppabot', unstoppabot], ['big', big]])('%s: no edge crosses a label box it does not touch', (_n, credits) => {
    const g = laid(credits);
    const at = (id: string) => g.nodes.find(n => n.id === id)!;
    for (const e of g.edges) {
      const a = at(e.from), b = at(e.to);
      for (const n of g.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        const h = labelHalfSize(n);
        let hit = false;
        for (let t = 0; t <= 1 && !hit; t += 0.01) {
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          hit = Math.abs(x - n.x) < h.w && Math.abs(y - n.y) < h.h;
        }
        expect(hit, `${e.from} -> ${e.to} through ${n.label}`).toBe(false);
      }
    }
  });
});

describe('layoutExpansion', () => {
  const titles = ['Time Fight', 'Art Heist', 'Art Heist (Exhibition)', 'Flatland', 'A Rather Long Project Title', 'Six'];
  const mkIndex = (who: string[]) => computeCreditsIndex([
    { uid: 'g/unstoppabot', title: 'Unstoppabot', credits: unstoppabot },
    ...titles.map((t, i) => ({
      uid: `g/p${i}`, title: t,
      credits: who.map(w => credit(unstoppabot.find(c => c.name === w)!.person ? { ...unstoppabot.find(c => c.name === w)!, role: 'Art' } : { name: w, role: 'Art' })),
    })),
  ]);
  const people = ['Paul Sztajer', 'Nick Kolan', 'Ana Lee'];
  const built = buildCreditsGraph(unstoppabot, { uid: 'g/unstoppabot', index: mkIndex(people) });
  const opening = layoutCreditsGraph(built);
  const nick = 'person:nick', me = 'person:me';
  const expansion = built.expansions![me];
  const laidOut = layoutExpansion(opening, expansion);
  const at = (id: string) => [...opening.nodes, ...laidOut.nodes].find(n => n.id === id)!;
  const r = (id: string) => { const c = at('card'); return Math.hypot(at(id).x - c.x, at(id).y - c.y); };

  it('returns only the new nodes, positioned, with their edges, and leaves the opening untouched', () => {
    const before = JSON.stringify(opening);
    const out = layoutExpansion(opening, expansion);
    expect(JSON.stringify(opening)).toBe(before);
    expect(out.nodes.map(n => n.id)).toEqual(expansion.nodes.map(n => n.id));
    expect(out.edges).toEqual(expansion.edges);
    expect(out.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('puts every project radially beyond the person', () => {
    for (const n of laidOut.nodes) expect(r(n.id), n.label).toBeGreaterThan(r(me) + 40);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(layoutExpansion(opening, expansion))).toBe(JSON.stringify(laidOut));
  });

  it('keeps clear of everything on screen, and of every edge', () => {
    const all = [...opening.nodes, ...laidOut.nodes];
    for (const n of laidOut.nodes) {
      for (const m of all) {
        if (m === n) continue;
        const a = labelHalfSize(n), b = labelHalfSize(m);
        expect(Math.abs(n.x - m.x) >= a.w + b.w || Math.abs(n.y - m.y) >= a.h + b.h, `${n.label} / ${m.label}`).toBe(true);
      }
    }
    const edges = [...opening.edges, ...laidOut.edges];
    for (const e of edges) {
      const a = at(e.from), b = at(e.to);
      for (const n of all) {
        if (n.id === e.from || n.id === e.to) continue;
        const h = labelHalfSize(n);
        let hit = false;
        for (let t = 0; t <= 1 && !hit; t += 0.01) {
          hit = Math.abs(a.x + (b.x - a.x) * t - n.x) < h.w && Math.abs(a.y + (b.y - a.y) * t - n.y) < h.h;
        }
        expect(hit, `${e.from} -> ${e.to} through ${n.label}`).toBe(false);
      }
    }
  });

  it('depends only on the opening: another person gets the same result however many others were laid out', () => {
    const nickEx = built.expansions![nick];
    const alone = layoutExpansion(opening, nickEx);
    layoutExpansion(opening, expansion);
    expect(JSON.stringify(layoutExpansion(opening, nickEx))).toBe(JSON.stringify(alone));
  });
});
