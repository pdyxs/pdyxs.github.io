// The credits map island: draws the positioned graph it is given and reacts to
// selection. Layout and camera maths are pure and tested elsewhere
// (credits-layout.test.ts, credits-camera.test.ts); this asserts only the
// classes, selection and keyboard behaviour the island adds.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CreditsMap from '@components/credits/CreditsMap.svelte';

let target: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

// card -> Art -> (ana, bo); card -> Code -> cy
const GRAPH = {
  nodes: [
    { id: 'card', kind: 'card', label: 'This card', x: 0, y: 0 },
    { id: 'role:Art', kind: 'role', label: 'Art', x: 150, y: 0 },
    { id: 'name:Ana', kind: 'person', label: 'Ana', x: 300, y: -50 },
    { id: 'name:Bo', kind: 'person', label: 'Bo', x: 300, y: 50 },
    { id: 'role:Code', kind: 'role', label: 'Code', x: -150, y: 0 },
    { id: 'name:Cy', kind: 'person', label: 'Cy', x: -300, y: 0 },
  ],
  edges: [
    { from: 'card', to: 'role:Art' }, { from: 'role:Art', to: 'name:Ana' }, { from: 'role:Art', to: 'name:Bo' },
    { from: 'card', to: 'role:Code' }, { from: 'role:Code', to: 'name:Cy' },
  ],
};

function render(props: Record<string, unknown> = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(CreditsMap as any, { target, props: { graph: GRAPH, selected: 'card', ...props } }) as Record<string, unknown>;
  flushSync(); // the camera effect runs after mount
  return target;
}
const node = (el: HTMLElement, id: string) => el.querySelector(`.credits-node[data-id="${id}"]`) as SVGGElement;

afterEach(() => {
  if (app) unmount(app as any);
  target?.remove();
  app = null;
  target = null;
});

describe('CreditsMap', () => {
  it('draws a node per graph node, typed by kind, and an edge per edge', () => {
    const el = render();
    expect(el.querySelector('svg.credits-map')).not.toBeNull();
    expect(el.querySelectorAll('.credits-node')).toHaveLength(6);
    expect(el.querySelectorAll('.credits-node[data-kind="person"]')).toHaveLength(3);
    expect(el.querySelectorAll('.credits-node[data-kind="role"]')).toHaveLength(2);
    expect(el.querySelectorAll('.credits-node[data-kind="card"]')).toHaveLength(1);
    expect(el.querySelectorAll('.credits-edge')).toHaveLength(5);
  });

  it('starts on the card: it is selected and nothing is faded', () => {
    const el = render();
    expect(node(el, 'card').classList.contains('is-selected')).toBe(true);
    expect(el.querySelectorAll('.is-faded')).toHaveLength(0);
  });

  it('selecting a person fades everything not connected to them, nodes and edges alike', () => {
    const el = render();
    node(el, 'name:Ana').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(node(el, 'name:Ana').classList.contains('is-selected')).toBe(true);
    expect(node(el, 'card').classList.contains('is-selected')).toBe(false);
    const faded = [...el.querySelectorAll('.credits-node.is-faded')].map(n => n.getAttribute('data-id')).sort();
    expect(faded).toEqual(['card', 'name:Bo', 'name:Cy', 'role:Code']);
    expect(el.querySelectorAll('.credits-edge')).toHaveLength(5);
    expect(el.querySelectorAll('.credits-edge.is-faded')).toHaveLength(4);
  });

  it('never softens with opacity at rest', () => {
    const el = render();
    node(el, 'name:Ana').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    for (const n of el.querySelectorAll('.credits-node, .credits-edge')) {
      expect(n.getAttribute('style') ?? '').not.toMatch(/opacity/);
    }
  });

  it('returns to the card on a click in empty space', () => {
    const el = render({ selected: 'name:Ana' });
    el.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(node(el, 'card').classList.contains('is-selected')).toBe(true);
  });

  it('does not treat a node click as empty space', () => {
    const el = render();
    node(el, 'name:Ana').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(node(el, 'name:Ana').classList.contains('is-selected')).toBe(true);
  });

  it('on Esc returns to the card', () => {
    const el = render({ selected: 'name:Ana' });
    el.querySelector('svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(node(el, 'card').classList.contains('is-selected')).toBe(true);
  });

  describe('a person\'s other projects', () => {
    const WITH_PROJECTS = {
      ...GRAPH,
      expansions: {
        'name:Bo': {
          nodes: [
            { id: 'project:name:Bo\u0000games/time-fight', kind: 'project', label: 'Time Fight', uid: 'games/time-fight', x: 450, y: 120 },
            { id: 'project:name:Bo\u0000art/heist', kind: 'project', label: 'Art Heist', uid: 'art/heist', x: 420, y: -10 },
          ],
          edges: [
            { from: 'name:Bo', to: 'project:name:Bo\u0000games/time-fight', label: 'Art, Concept' },
            { from: 'name:Bo', to: 'project:name:Bo\u0000art/heist' },
          ],
        },
      },
    };
    const projects = (el: HTMLElement) => [...el.querySelectorAll('a[data-push-card]')];

    it('shows nothing extra until the person is selected', () => {
      const el = render({ graph: WITH_PROJECTS });
      expect(projects(el)).toHaveLength(0);
      expect(el.querySelectorAll('.credits-node')).toHaveLength(6);
    });

    it('adds a project node per project when the person is selected, and removes them on deselect', () => {
      const el = render({ graph: WITH_PROJECTS });
      node(el, 'name:Bo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(projects(el)).toHaveLength(2);
      expect(el.querySelectorAll('.credits-node[data-kind="project"]')).toHaveLength(2);
      expect(el.querySelectorAll('.credits-edge')).toHaveLength(7);
      node(el, 'name:Ana').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(projects(el)).toHaveLength(0);
      expect(el.querySelectorAll('.credits-edge')).toHaveLength(5);
      node(el, 'name:Bo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(projects(el)).toHaveLength(2);
    });

    it('renders a project as the same link a tag chip is, so the stack can push it', () => {
      const el = render({ graph: WITH_PROJECTS, selected: 'name:Bo' });
      const link = projects(el).find(a => a.getAttribute('data-push-card') === 'games/time-fight')!;
      expect(link.getAttribute('href')).toBe('/card/games/time-fight');
      expect(link.textContent).toContain('Time Fight');
      expect(link.classList.contains('credits-node')).toBe(true);
    });

    it('labels each edge with what the person did there, and leaves a role-less one bare', () => {
      const el = render({ graph: WITH_PROJECTS, selected: 'name:Bo' });
      expect([...el.querySelectorAll('.credits-edge-label')].map(t => t.textContent)).toEqual(['Art, Concept']);
    });

    it('keeps the projects lit, and does not select a project when it is clicked', () => {
      const el = render({ graph: WITH_PROJECTS, selected: 'name:Bo' });
      expect(el.querySelector('.credits-node[data-kind="project"]')!.classList.contains('is-faded')).toBe(false);
      el.querySelector('a[data-push-card]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      flushSync();
      expect(node(el, 'name:Bo').classList.contains('is-selected')).toBe(true);
    });
  });

  describe('camera', () => {
    const world = (el: HTMLElement) => el.querySelector('.credits-world') as SVGGElement;
    const scale = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(world(el).getAttribute('style') ?? '')?.[1]);
    const translate = (el: HTMLElement) => /translate\((-?[\d.]+)px, (-?[\d.]+)px\) *;?$/.exec(world(el).style.transform) ?? [];

    it('frames the selection and its connections, centred on their box', () => {
      const el = render({ selected: 'name:Ana' });
      // Ana (300,-50) with Art (150,0): the box centre is (225,-25)
      expect(translate(el).slice(1, 3)).toEqual(['-225', '25']);
      expect(scale(el)).toBe(1);
    });

    it('re-aims when the selection changes', () => {
      const el = render();
      node(el, 'name:Cy').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      flushSync();
      expect(translate(el).slice(1, 3)).toEqual(['225', '0']);
    });

    it('opens zoomed in on the card at 1.6 when the map is narrower than 600px', () => {
      const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
      Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 390 });
      try {
        const el = render();
        expect(scale(el)).toBe(1.6);
        expect(translate(el).slice(1, 3)).toEqual(['0', '0']);
      } finally {
        if (desc) Object.defineProperty(Element.prototype, 'clientWidth', desc);
        else delete (Element.prototype as any).clientWidth;
      }
    });
  });
});
