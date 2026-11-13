import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ComponentSvg from './ComponentSvg.svelte';
import type { Scene } from './resolve.ts';

let mounted: ReturnType<typeof mount>;
afterEach(() => {
  unmount(mounted);
  document.body.innerHTML = '';
});

const scene = (items: Scene['items'] = []): Scene => ({
  size: { width: 60, height: 80 }, bleed: 3, page: { x: -3, y: -3, width: 66, height: 86 }, cutPath: 'M0 0H60V80H0Z', items,
});

function render(s: Scene, imageUrl = (f: string) => `/img/${f}`) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(ComponentSvg as any, { target, props: { scene: s, imageUrl, maskId: 'm' } });
  flushSync();
  return target;
}

describe('ComponentSvg: structure', () => {
  it('sets a viewBox in mm from the page, and draws the cut line over the bleed', () => {
    const t = render(scene());
    const svg = t.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('-3 -3 66 86');
    expect(t.querySelector('.cut-line')!.getAttribute('d')).toBe('M0 0H60V80H0Z');
    expect(t.querySelector('.bleed-area')).not.toBeNull();
  });

  it('builds the bleed mask from the cut path stroked at twice the bleed, and clips the items group to it', () => {
    const t = render(scene());
    const mask = t.querySelector('mask#m')!;
    const path = mask.querySelector('path')!;
    expect(path.getAttribute('d')).toBe('M0 0H60V80H0Z');
    expect(path.getAttribute('stroke-width')).toBe('6');
    expect(t.querySelector('g.items')!.getAttribute('mask')).toBe('url(#m)');
  });
});

describe('ComponentSvg: items', () => {
  it('draws a rect shape and an ellipse shape inside the clipped group', () => {
    const t = render(scene([
      { kind: 'shape', id: 'a', shape: 'rect', x: 1, y: 2, width: 3, height: 4, fill: '#f00', stroke: '#000', strokeWidth: 0.5 },
      { kind: 'shape', id: 'b', shape: 'ellipse', x: 10, y: 20, width: 30, height: 40, fill: null, stroke: null, strokeWidth: 0 },
    ]));
    const rect = t.querySelector('g.items rect')!;
    expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height'), rect.getAttribute('fill'), rect.getAttribute('stroke')]).toEqual(['1', '2', '3', '4', '#f00', '#000']);
    const ellipse = t.querySelector('g.items ellipse')!;
    expect([ellipse.getAttribute('cx'), ellipse.getAttribute('cy'), ellipse.getAttribute('rx'), ellipse.getAttribute('ry'), ellipse.getAttribute('fill')]).toEqual(['25', '40', '15', '20', 'none']);
  });
});

describe('ComponentSvg: text', () => {
  const anchors = { left: 'start', center: 'middle', right: 'end' } as const;
  const xs = { left: 10, center: 30, right: 50 };
  const text = (align: 'left' | 'center' | 'right'): Scene['items'][number] => ({
    kind: 'text', id: 't', x: 10, y: 20, width: 40, height: 10, anchor: anchors[align], size: 4, colour: '#123456',
    lines: [{ text: 'One', x: xs[align], y: 24 }, { text: 'Two', x: xs[align], y: 28 }],
  });

  it('draws one tspan per line, sized in mm and anchored by align', () => {
    const t = render(scene([text('center')]));
    const el = t.querySelector('g.items text')!;
    expect(el.getAttribute('font-size')).toBe('4');
    expect(el.getAttribute('fill')).toBe('#123456');
    expect(el.getAttribute('text-anchor')).toBe('middle');
    expect(el.getAttribute('x')).toBeNull();
    const lines = [...el.querySelectorAll('tspan')];
    expect(lines.map((l) => l.textContent)).toEqual(['One', 'Two']);
    expect(lines.map((l) => l.getAttribute('x'))).toEqual(['30', '30']);
    expect(lines.map((l) => l.getAttribute('y'))).toEqual(['24', '28']);
  });

  it('anchors left and right at the box edges', () => {
    expect(render(scene([text('left')])).querySelector('tspan')!.getAttribute('x')).toBe('10');
    unmount(mounted);
    expect(render(scene([text('right')])).querySelector('tspan')!.getAttribute('x')).toBe('50');
  });
});
