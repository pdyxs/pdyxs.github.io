import { describe, it, expect } from 'vitest';
import { connectedIds, frameSelection } from './credits-camera';

// card -> role -> (a, b); an unrelated far-off branch c hangs off another role.
const graph = {
  nodes: [
    { id: 'card', kind: 'card' as const, label: 'Card', x: 0, y: 0 },
    { id: 'r1', kind: 'role' as const, label: 'Art', x: 150, y: 0 },
    { id: 'a', kind: 'person' as const, label: 'A', x: 300, y: -50 },
    { id: 'b', kind: 'person' as const, label: 'B', x: 300, y: 50 },
    { id: 'r2', kind: 'role' as const, label: 'Code', x: -150, y: 0 },
    { id: 'c', kind: 'person' as const, label: 'C', x: -4000, y: 0 },
  ],
  edges: [
    { from: 'card', to: 'r1' }, { from: 'r1', to: 'a' }, { from: 'r1', to: 'b' },
    { from: 'card', to: 'r2' }, { from: 'r2', to: 'c' },
  ],
};

describe('connectedIds', () => {
  it('is the node and its direct neighbours', () => {
    expect([...connectedIds(graph, 'r1')].sort()).toEqual(['a', 'b', 'card', 'r1']);
  });

  it('is everything when the card is selected', () => {
    expect(connectedIds(graph, 'card').size).toBe(graph.nodes.length);
  });
});

describe('frameSelection', () => {
  it('centres on the box around the node and its connections, so the node can sit off-centre', () => {
    const cam = frameSelection(graph, 'a', { phone: false });
    // a (300,-50) + r1 (150,0): box centre (225,-25)
    expect(cam.cx).toBeCloseTo(225);
    expect(cam.cy).toBeCloseTo(-25);
  });

  it('zooms out only as far as needed, never past 1 and never below 0.25', () => {
    expect(frameSelection(graph, 'a', { phone: false }).s).toBe(1);
    const wide = frameSelection(graph, 'card', { phone: false });
    expect(wide.s).toBe(0.25);
  });

  it('fits the connected box with room for labels when it is bigger than the view', () => {
    const mid = frameSelection({ ...graph, nodes: graph.nodes.map(n => (n.id === 'c' ? { ...n, x: -500 } : n)) }, 'card', { phone: false });
    expect(mid.s).toBeGreaterThan(0.25);
    expect(mid.s).toBeLessThan(1);
  });

  it('on a phone, opens the card zoomed in at 1.6 and centred on the node', () => {
    const cam = frameSelection(graph, 'card', { phone: true });
    expect(cam).toEqual({ cx: 0, cy: 0, s: 1.6 });
  });

  it('on a phone, still backs off further for a selection that needs it', () => {
    const cam = frameSelection(graph, 'a', { phone: true });
    expect(cam.s).toBe(1.6);
    expect(cam.cx).toBe(300);
  });
});
