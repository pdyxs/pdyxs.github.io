import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import EditorShell from './EditorShell.svelte';

const settle = () => new Promise((r) => setTimeout(r, 80));

interface FakeOptions {
  /** Conflicts the first (unconfirmed) open answers with. */
  conflicts?: { property: string; old: string; new: string }[];
}

function fakeApi({ conflicts }: FakeOptions = {}) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const stored = { editor: 'demo', version: '1.0.0', data: { text: 'hi', count: 1 } };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
    if (url.endsWith('/editors')) return ok([{ id: 'demo', name: 'Demo', component: '/src/lib/dev-editors/demo/DemoEditor.svelte' }]);
    if (url.includes('/demo/cards?all=1')) return ok([{ dir: 'what/a', valid: true }, { dir: 'what/b', valid: false }]);
    if (url.includes('/demo/cards')) return ok([{ dir: 'what/a', valid: true }]);
    if (url.endsWith('/folders')) return ok(['what', 'what/projects']);
    if (url.includes('/demo/open')) {
      if (conflicts && !body?.confirm) return { ok: false, status: 409, json: async () => ({ conflicts }) } as Response;
      return ok({ ok: true, dir: new URL(url, 'http://x').searchParams.get('path') });
    }
    if (url.includes('/demo/create')) return ok({ ok: true, dir: 'what/projects/fresh' });
    if (url.includes('/demo/read')) return ok(stored);
    if (url.includes('/demo/write')) return ok({ ok: true });
    throw new Error(url);
  }) as any;
  return calls;
}

async function mountShell() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(EditorShell as any, { target, props: { editorId: 'demo' } });
  await settle();
  flushSync();
  return target;
}

async function pick(target: HTMLElement, dir: string) {
  const select = target.querySelector<HTMLSelectElement>('select.cards')!;
  select.value = dir;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  flushSync();
}

let component: ReturnType<typeof mount>;
afterEach(() => unmount(component));

describe('EditorShell', () => {
  it('picks a card, edits through the editor island, and saves { data }', async () => {
    const calls = fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');

    const inputs = target.querySelectorAll('.editor-pane input');
    expect((inputs[0] as HTMLInputElement).value).toBe('hi');
    (inputs[0] as HTMLInputElement).value = 'bye';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    (inputs[1] as HTMLInputElement).value = '7';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    target.querySelector<HTMLButtonElement>('button.save')!.click();
    await settle();

    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toContain('path=what%2Fa%2Findex.json');
    expect(put.body).toEqual({ data: { text: 'bye', count: 7 } });
  });

  it('shows only valid cards by default and every card with "show all"', async () => {
    fakeApi();
    const target = await mountShell();
    const options = () => [...target.querySelectorAll('select.cards option')].map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(options()).toEqual(['what/a']);
    const box = target.querySelector<HTMLInputElement>('input.show-all')!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    flushSync();
    expect(options()).toEqual(['what/a', 'what/b']);
  });

  it('on a conflict asks naming the property; no leaves the card unopened', async () => {
    const calls = fakeApi({ conflicts: [{ property: 'headerMedia', old: 'flash-game', new: 'demo' }] });
    const ask = vi.fn(() => false);
    vi.stubGlobal('confirm', ask);
    const target = await mountShell();
    await pick(target, 'what/a');
    expect(ask.mock.calls[0][0]).toContain('headerMedia');
    expect(ask.mock.calls[0][0]).toContain('flash-game');
    expect(ask.mock.calls[0][0]).toContain('demo');
    expect(calls.filter((c) => c.url.includes('/open'))).toHaveLength(1);
    expect(calls.some((c) => c.url.includes('/read'))).toBe(false);
    expect(target.querySelector('a.page-link')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('yes re-sends the open with confirm and then opens the card', async () => {
    const calls = fakeApi({ conflicts: [{ property: 'headerMedia', old: 'flash-game', new: 'demo' }] });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const target = await mountShell();
    await pick(target, 'what/a');
    const opens = calls.filter((c) => c.url.includes('/open'));
    expect(opens.map((o) => o.body)).toEqual([{}, { confirm: true }]);
    expect(calls.some((c) => c.url.includes('/read'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('an open card shows a new-tab link to its page on the site', async () => {
    fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');
    const link = target.querySelector<HTMLAnchorElement>('a.page-link')!;
    expect(link.getAttribute('href')).toBe('/card/what/a');
    expect(link.target).toBe('_blank');
  });

  it('creates a new card under a chosen folder and opens it', async () => {
    const calls = fakeApi();
    const target = await mountShell();
    const folder = target.querySelector<HTMLSelectElement>('select.new-folder')!;
    folder.value = 'what/projects';
    folder.dispatchEvent(new Event('change', { bubbles: true }));
    const title = target.querySelector<HTMLInputElement>('input.new-title')!;
    title.value = 'Fresh';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    target.querySelector<HTMLButtonElement>('button.create')!.click();
    await settle();
    flushSync();
    expect(calls.find((c) => c.url.includes('/create'))!.body).toEqual({ parent: 'what/projects', title: 'Fresh' });
    expect(target.querySelector<HTMLAnchorElement>('a.page-link')!.getAttribute('href')).toBe('/card/what/projects/fresh');
  });
});
