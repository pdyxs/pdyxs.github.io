// The card's credits section: one "made by …" button that folds a full listing
// open beneath it. The pure decisions (who the line names, how the listing
// groups) are credits.test.ts; this asserts only what the island does with them.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CreditsSection from '@components/credits/CreditsSection.svelte';

let target: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

const LISTING = [
  { rows: [{ role: 'Designer', entries: [{ name: 'Nick', personId: 'name:Nick' }] }] },
  { heading: 'Special thanks', rows: [{ entries: [{ name: 'the Academy' }, { name: 'Alison', personId: 'name:Alison', note: 'as Alison Scott' }] }] },
];

const GRAPH = {
  nodes: [
    { id: 'card', kind: 'card', label: 'This card', x: 0, y: 0 },
    { id: 'role:Designer', kind: 'role', label: 'Designer', x: 150, y: 0 },
    { id: 'name:Nick', kind: 'person', label: 'Nick', x: 300, y: 0 },
    { id: 'name:Alison', kind: 'person', label: 'Alison', x: -150, y: 0 },
  ],
  edges: [
    { from: 'card', to: 'role:Designer' }, { from: 'role:Designer', to: 'name:Nick' }, { from: 'card', to: 'name:Alison' },
  ],
};

function render(props: Record<string, unknown> = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(CreditsSection as any, {
    target,
    props: { line: { names: ['Nick'] }, listing: LISTING, graph: GRAPH, ...props },
  }) as Record<string, unknown>;
  return target;
}

afterEach(() => {
  if (app) unmount(app as any);
  target?.remove();
  app = null;
  target = null;
});

describe('CreditsSection line', () => {
  it('counts when the line carries a count', () => {
    const el = render({ line: { count: 11 } });
    expect(el.querySelector('.credits-by')!.textContent).toContain('made by 11 people');
  });

  it('names one, two and three people', () => {
    const by = (names: string[]) => render({ line: { names } }).querySelector('.credits-by')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(by(['Nick'])).toContain('made by Nick');
    unmount(app as any); target!.remove();
    expect(by(['Nick', 'Paul'])).toContain('made by Nick and Paul');
    unmount(app as any); target!.remove();
    expect(by(['Nick', 'Paul', 'Thomas'])).toContain('made by Nick, Paul and Thomas');
  });
});

describe('CreditsSection panel', () => {
  it('starts folded, opens on click and folds on a second click, tracking aria-expanded', () => {
    const el = render();
    const by = el.querySelector('.credits-by') as HTMLButtonElement;
    expect(by.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.credits-panel')).toBeNull();

    by.click(); flushSync();
    expect(by.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.credits-panel')).not.toBeNull();

    by.click(); flushSync();
    expect(by.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.credits-panel')).toBeNull();
  });

  it('folds on Esc from inside the panel and returns focus to the line', () => {
    const el = render();
    const by = el.querySelector('.credits-by') as HTMLButtonElement;
    by.click(); flushSync();
    const panel = el.querySelector('.credits-panel') as HTMLElement;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(el.querySelector('.credits-panel')).toBeNull();
    expect(by.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(by);
  });

  it('shows the full listing: groups, roles, names and notes in authored order', () => {
    const el = render();
    (el.querySelector('.credits-by') as HTMLButtonElement).click(); flushSync();
    (el.querySelector('.credits-view-toggle') as HTMLButtonElement).click(); flushSync();
    const sections = [...el.querySelectorAll('.credits-listing-section')];
    expect(sections).toHaveLength(2);
    expect(sections[0].querySelector('h3')).toBeNull();
    expect(sections[0].textContent).toContain('Designer');
    expect(sections[1].querySelector('h3')!.textContent).toBe('Special thanks');
    const names = [...el.querySelectorAll('.credits-listing-name')].map(n => n.textContent);
    expect(names).toEqual(['Nick', 'the Academy', 'Alison']);
    expect(el.querySelector('.credits-note')!.textContent).toContain('as Alison Scott');
  });
});

describe('CreditsSection map and listing', () => {
  const open = (el: HTMLElement) => { (el.querySelector('.credits-by') as HTMLButtonElement).click(); flushSync(); };
  const toggle = (el: HTMLElement) => el.querySelector('.credits-view-toggle') as HTMLButtonElement;

  it('opens on the map, with a button offering the full listing', () => {
    const el = render();
    open(el);
    expect(el.querySelector('.credits-map')).not.toBeNull();
    expect(el.querySelector('.credits-listing')).toBeNull();
    expect(toggle(el).textContent!.trim()).toBe('Full listing');
  });

  it('swaps the map for the listing and back, the button reading Map in between', () => {
    const el = render();
    open(el);
    toggle(el).click(); flushSync();
    expect(el.querySelector('.credits-map')).toBeNull();
    expect(el.querySelector('.credits-listing')).not.toBeNull();
    expect(toggle(el).textContent!.trim()).toBe('Map');
    toggle(el).click(); flushSync();
    expect(el.querySelector('.credits-map')).not.toBeNull();
    expect(toggle(el).textContent!.trim()).toBe('Full listing');
  });

  it('makes map-listed names buttons and listing-only names plain text', () => {
    const el = render();
    open(el); toggle(el).click(); flushSync();
    const names = [...el.querySelectorAll('.credits-listing-name')];
    expect(names.map(n => [n.textContent, n.tagName])).toEqual([['Nick', 'BUTTON'], ['the Academy', 'SPAN'], ['Alison', 'BUTTON']]);
  });

  it('opens the map on a person when their name is clicked in the listing', () => {
    const el = render();
    open(el); toggle(el).click(); flushSync();
    (el.querySelectorAll('button.credits-listing-name')[1] as HTMLButtonElement).click(); flushSync();
    expect(el.querySelector('.credits-map')).not.toBeNull();
    expect(el.querySelector('.credits-node.is-selected')!.getAttribute('data-id')).toBe('name:Alison');
  });

  it('Esc on a selected person returns to the card; Esc on the card folds the panel', () => {
    const el = render();
    open(el); toggle(el).click(); flushSync();
    (el.querySelector('button.credits-listing-name') as HTMLButtonElement).click(); flushSync();
    const svg = () => el.querySelector('svg.credits-map')!;
    svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); flushSync();
    expect(el.querySelector('.credits-panel')).not.toBeNull();
    expect(el.querySelector('.credits-node.is-selected')!.getAttribute('data-id')).toBe('card');
    svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); flushSync();
    expect(el.querySelector('.credits-panel')).toBeNull();
  });
});
