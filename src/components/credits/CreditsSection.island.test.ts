// The card's credits section: one "made by …" button that folds a full listing
// open beneath it. The pure decisions (who the line names, how the listing
// groups) are credits.test.ts; this asserts only what the island does with them.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CreditsSection from '@components/credits/CreditsSection.svelte';

let target: HTMLElement | null = null;
let app: Record<string, unknown> | null = null;

const LISTING = [
  { rows: [{ role: 'Designer', entries: [{ name: 'Nick' }] }] },
  { heading: 'Special thanks', rows: [{ entries: [{ name: 'the Academy' }, { name: 'Alison', note: 'as Alison Scott' }] }] },
];

function render(props: Record<string, unknown> = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(CreditsSection as any, {
    target,
    props: { line: { names: ['Nick'] }, listing: LISTING, ...props },
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
