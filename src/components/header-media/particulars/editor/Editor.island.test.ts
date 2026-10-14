// Client-mount test for the dev-only Particulars editor: pick a card, edit a
// wave in the form, and see the write endpoint and the live preview follow.
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Editor from './Editor.svelte';

const SCENARIO = {
  walls: { width: 20, height: 10 },
  player: { x: 0, y: 0, radius: 0.5 },
  waves: [{ id: 'ring', entries: [{ spawn: 'electron', telegraph: 1 }] }],
  triggers: [{ kind: 'time', at: 2, actions: [{ kind: 'spawn', wave: 'ring' }] }],
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let target: HTMLElement;
let component: ReturnType<typeof mount>;
let calls: { url: string; method: string; body?: any }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const body = url.includes('/cards') ? [{ dir: 'what/toys/a', hasScenario: true }] : url.includes('/scenario') && method === 'GET' ? SCENARIO : { ok: true };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(Editor as any, { target, props: { saveDelayMs: 10 } });
});
afterEach(() => {
  unmount(component);
  target.remove();
  vi.unstubAllGlobals();
});

async function pickCard() {
  await wait(20);
  const select = target.querySelector('select.card-picker') as HTMLSelectElement;
  select.value = 'what/toys/a';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(20);
  flushSync();
}

describe('Editor', () => {
  it('lists cards, loads the picked scenario into the form and previews it', async () => {
    await pickCard();
    const id = target.querySelector('input[data-field="waves.0.id"]') as HTMLInputElement;
    expect(id.value).toBe('ring');
    expect(target.querySelector('svg.particulars')!.getAttribute('data-entry')).toBe('what/toys/a');
  });

  it('shows the trigger time that fires each wave', async () => {
    await pickCard();
    const at = target.querySelector('input[data-field="triggers.0.at"]') as HTMLInputElement;
    expect(at.value).toBe('2');
  });

  it('editing a wave writes the scenario to the card and not before', async () => {
    await pickCard();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    const telegraph = target.querySelector('input[data-field="waves.0.entries.0.telegraph"]') as HTMLInputElement;
    telegraph.value = '3';
    telegraph.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(60);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toContain('path=what%2Ftoys%2Fa%2Findex.json');
    expect(put.body.waves[0].entries[0].telegraph).toBe(3);
  });

  it('an invalid scenario is reported and never written', async () => {
    await pickCard();
    const w = target.querySelector('input[data-field="walls.width"]') as HTMLInputElement;
    w.value = '-4';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(60);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(target.querySelector('.errors')!.textContent).toContain('walls');
  });

  it('creating a card posts its folder and title, then opens it', async () => {
    await wait(20);
    (target.querySelector('input[data-field="new.dir"]') as HTMLInputElement).value = 'what/toys/fresh';
    (target.querySelector('input[data-field="new.dir"]') as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('input[data-field="new.title"]') as HTMLInputElement).value = 'Fresh';
    (target.querySelector('input[data-field="new.title"]') as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
    (target.querySelector('button.create') as HTMLButtonElement).click();
    await wait(40);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ dir: 'what/toys/fresh', title: 'Fresh' });
  });
});
