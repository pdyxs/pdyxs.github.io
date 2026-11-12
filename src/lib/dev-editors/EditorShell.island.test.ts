import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import EditorShell from './EditorShell.svelte';

const settle = () => new Promise((r) => setTimeout(r, 20));

function fakeApi() {
  const calls: { method: string; url: string; body?: any }[] = [];
  let stored = { editor: 'demo', version: '1.0.0', data: { text: 'hi', count: 1 } };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
    if (url.endsWith('/editors')) return ok([{ id: 'demo', name: 'Demo', component: '/src/lib/dev-editors/demo/DemoEditor.svelte' }]);
    if (url.endsWith('/demo/cards')) return ok([{ dir: 'what/a' }]);
    if (url.includes('/demo/read')) return ok(stored);
    if (url.includes('/demo/write')) return ok({ ok: true });
    throw new Error(url);
  }) as any;
  return calls;
}

let component: ReturnType<typeof mount>;
afterEach(() => unmount(component));

describe('EditorShell', () => {
  it('picks a card, edits through the editor island, and saves { data }', async () => {
    const calls = fakeApi();
    const target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(EditorShell as any, { target, props: { editorId: 'demo' } });
    await settle();
    flushSync();

    const select = target.querySelector('select')!;
    select.value = 'what/a';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    flushSync();

    const inputs = target.querySelectorAll('input');
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
});
