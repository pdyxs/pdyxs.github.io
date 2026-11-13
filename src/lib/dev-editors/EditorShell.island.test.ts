import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import EditorShell from './EditorShell.svelte';

const settle = () => new Promise((r) => setTimeout(r, 80));

interface FakeOptions {
  /** Conflicts the first (unconfirmed) open answers with. */
  bumpFails?: boolean;
  conflicts?: { property: string; old: string; new: string }[];
}

function fakeApi({ conflicts, bumpFails }: FakeOptions = {}) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const stored = { editor: 'demo', version: '1.0.0', data: { text: 'hi', count: 1 } };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
    if (url.endsWith('/editors')) return ok([{ id: 'demo', name: 'Demo', component: '/src/lib/dev-editors/testing/TestEditor.svelte' }]);
    if (url.includes('/demo/cards?all=1')) return ok([{ dir: 'what/a', valid: true }, { dir: 'what/b', valid: false }]);
    if (url.includes('/demo/cards')) return ok([{ dir: 'what/a', valid: true }]);
    if (url.endsWith('/folders')) return ok(['what', 'what/projects']);
    if (url.includes('/demo/open')) {
      if (conflicts && !body?.confirm) return { ok: false, status: 409, json: async () => ({ conflicts }) } as Response;
      return ok({ ok: true, dir: new URL(url, 'http://x').searchParams.get('path'), inspected: true });
    }
    if (url.includes('/demo/create')) return ok({ ok: true, dir: 'what/projects/fresh' });
    if (url.includes('/demo/history')) {
      return ok([
        { version: '2.0.0', commit: 'c4', date: '2026-04-01T00:00:00Z' },
        { version: '1.1.0', commit: 'c3', date: '2026-03-01T00:00:00Z' },
        { version: '1.0.0', commit: 'c2', date: '2026-02-01T00:00:00Z' },
      ]);
    }
    if (url.includes('/demo/at')) {
      const commit = new URL(url, 'http://x').searchParams.get('commit');
      const old = { c2: ['1.0.0', 'second 1.0.0'], c3: ['1.1.0', 'one-one'], c4: ['2.0.0', 'two'] }[commit as string]!;
      return ok({ editor: 'demo', version: old[0], data: { text: old[1], count: 0 } });
    }
    if (url.includes('/demo/read')) return ok(stored);
    if (url.includes('/demo/write')) return ok({ ok: true, inspected: false });
    if (url.includes('/demo/bump')) {
      const kind = new URL(url, 'http://x').searchParams.get('kind');
      if (bumpFails) return { ok: false, status: 409, json: async () => ({ error: 'a merge is in progress' }) } as Response;
      stored.version = kind === 'minor' ? '1.1.0' : kind === 'major' ? '2.0.0' : '1.0.1';
      return ok({ ok: true, version: stored.version, inspected: false });
    }
    throw new Error(url);
  }) as any;
  return calls;
}

async function mountShell(props: { autosaveMs?: number } = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  // Autosave is off (an hour) unless a test turns it on, so saves happen only where a test asks.
  component = mount(EditorShell as any, { target, props: { editorId: 'demo', autosaveMs: 3_600_000, ...props } });
  await settle();
  flushSync();
  return target;
}

/** Focus the card search so its list opens. */
function openCardList(target: HTMLElement) {
  target.querySelector<HTMLInputElement>('input.card-search')!.dispatchEvent(new FocusEvent('focus'));
  flushSync();
}

async function pick(target: HTMLElement, dir: string) {
  openCardList(target);
  target.querySelector<HTMLElement>(`.card-list [data-dir="${dir}"]`)!.click();
  await settle();
  flushSync();
}

/** Open the new-version line, so the major/minor/patch buttons exist. */
function openBump(target: HTMLElement) {
  target.querySelector<HTMLButtonElement>('button.new-version')!.click();
  flushSync();
}

let component: ReturnType<typeof mount>;
afterEach(() => {
  unmount(component);
  history.replaceState(null, '', '/');
});

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

  it('opening a card puts it in the URL, mirroring its site path', async () => {
    fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');
    expect(location.pathname).toBe('/dev/editors/demo/what/a');
  });

  it('a card in the URL opens on load, so a reload keeps it open', async () => {
    const calls = fakeApi();
    history.replaceState(null, '', '/dev/editors/demo/what/a');
    const target = await mountShell();
    await settle();
    flushSync();
    expect(calls.some((c) => c.url.includes('/demo/read') && c.url.includes('what%2Fa'))).toBe(true);
    expect(target.querySelector<HTMLAnchorElement>('a.page-link')!.getAttribute('href')).toBe('/card/what/a');
  });

  it('shows the card\'s inspected state beside its site link, following each save', async () => {
    fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');
    const state = () => target.querySelector('.inspect-state')!.textContent!.trim();
    expect(state()).toContain('Inspected');

    const input = target.querySelector<HTMLInputElement>('.editor-pane input')!;
    input.value = 'edit';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    target.querySelector<HTMLButtonElement>('button.save')!.click();
    await settle();
    flushSync();
    expect(state()).toBe('Needs inspecting');
    expect(target.querySelector('button.mark-inspected')).toBeNull();
  });

  it('autosaves once edits sit idle, without a Save press', async () => {
    const calls = fakeApi();
    const target = await mountShell({ autosaveMs: 20 });
    await pick(target, 'what/a');
    const input = target.querySelector<HTMLInputElement>('.editor-pane input')!;
    input.value = 'typed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await settle();
    flushSync();
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({ data: { text: 'typed', count: 1 } });
    expect(target.querySelector('[role=status]')!.textContent).toContain('Saved');
  });

  it('a version bump saves unsaved edits first, so the commit includes them', async () => {
    const calls = fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');
    const input = target.querySelector<HTMLInputElement>('.editor-pane input')!;
    input.value = 'edited';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    openBump(target);
    target.querySelector<HTMLButtonElement>('.bump-patch')!.click();
    await settle();
    const order = calls.filter((c) => c.method === 'PUT' || c.url.includes('/demo/bump')).map((c) => c.method);
    expect(order).toEqual(['PUT', 'POST']);
  });

  it('shows only valid cards by default and every card with "show all"', async () => {
    fakeApi();
    const target = await mountShell();
    const options = () => {
      openCardList(target);
      return [...target.querySelectorAll<HTMLElement>('.card-list [data-dir]')].map((o) => o.dataset.dir);
    };
    expect(options()).toEqual(['what/a']);
    const box = target.querySelector<HTMLInputElement>('input.show-all')!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    flushSync();
    expect(options()).toEqual(['what/a', 'what/b']);
  });

  it('typing in the card search narrows the list, and Enter opens the highlighted card', async () => {
    fakeApi();
    const target = await mountShell();
    const box = target.querySelector<HTMLInputElement>('input.show-all')!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    openCardList(target);
    const search = target.querySelector<HTMLInputElement>('input.card-search')!;
    search.value = 'b';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect([...target.querySelectorAll<HTMLElement>('.card-list [data-dir]')].map((o) => o.dataset.dir)).toEqual(['what/b']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    flushSync();
    expect(target.querySelector<HTMLAnchorElement>('a.page-link')!.getAttribute('href')).toBe('/card/what/b');
  });

  it('on a conflict asks naming the property; no leaves the card unopened', async () => {
    const calls = fakeApi({ conflicts: [{ property: 'headerMedia', old: 'flash-game', new: 'demo' }] });
    const ask = vi.fn((_message: string) => false);
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

  it('shows the version, + and Restore; + toggles a line of major, minor and patch with their versions', async () => {
    fakeApi();
    const target = await mountShell();
    expect(target.querySelector('.version-bar')).toBeNull();
    await pick(target, 'what/a');
    expect(target.querySelector('.version')!.textContent).toContain('1.0.0');
    expect([...target.querySelectorAll('.version-bar button')].map((b) => b.textContent!.trim())).toEqual(['+', 'Restore']);
    expect(target.querySelector('.bump-line')).toBeNull();
    openBump(target);
    expect([...target.querySelectorAll('.bump-line button')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'major 2.0.0',
      'minor 1.1.0',
      'patch 1.0.1',
    ]);
    openBump(target);
    expect(target.querySelector('.bump-line')).toBeNull();
  });

  it('+ and Restore swap the line below between them', async () => {
    fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');
    openBump(target);
    target.querySelector<HTMLButtonElement>('button.restore-toggle')!.click();
    flushSync();
    expect(target.querySelector('.bump-line')).toBeNull();
    expect(target.querySelector('.restore-line')).not.toBeNull();
  });

  it('pressing new minor posts the bump and shows the new version', async () => {
    const calls = fakeApi();
    const target = await mountShell();
    await pick(target, 'what/a');
    openBump(target);
    target.querySelector<HTMLButtonElement>('.bump-minor')!.click();
    await settle();
    flushSync();
    const bumpCall = calls.find((c) => c.url.includes('/demo/bump'))!;
    expect(bumpCall.method).toBe('POST');
    expect(bumpCall.url).toContain('path=what%2Fa');
    expect(bumpCall.url).toContain('kind=minor');
    expect(target.querySelector('.version')!.textContent).toContain('1.1.0');
  });

  it('a refused bump shows the message and keeps the version', async () => {
    fakeApi({ bumpFails: true });
    const target = await mountShell();
    await pick(target, 'what/a');
    openBump(target);
    target.querySelector<HTMLButtonElement>('.bump-patch')!.click();
    await settle();
    flushSync();
    expect(target.querySelector('[role=status]')!.textContent).toContain('a merge is in progress');
    expect(target.querySelector('.version')!.textContent).toContain('1.0.0');
  });

  describe('version history', () => {
    const openRestore = (target: HTMLElement) => {
      target.querySelector<HTMLButtonElement>('button.restore-toggle')!.click();
      flushSync();
    };
    const pickVersion = async (target: HTMLElement, commit: string) => {
      if (!target.querySelector('select.version-picker')) openRestore(target);
      const select = target.querySelector<HTMLSelectElement>('select.version-picker')!;
      select.value = commit;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      flushSync();
    };
    const pickerOptions = (target: HTMLElement) =>
      [...target.querySelectorAll<HTMLOptionElement>('select.version-picker option')].map((o) => [o.value, o.textContent!.trim()]);

    it('lists every committed version newest first, after the working file', async () => {
      fakeApi();
      const target = await mountShell();
      await pick(target, 'what/a');
      expect(target.querySelector('select.version-picker')).toBeNull();
      openRestore(target);
      expect(pickerOptions(target).map(([v]) => v)).toEqual(['', 'c4', 'c3', 'c2']);
      expect(pickerOptions(target).slice(1).map(([, label]) => label)).toEqual([
        expect.stringContaining('2.0.0'),
        expect.stringContaining('1.1.0'),
        expect.stringContaining('1.0.0'),
      ]);
    });

    it('picking a version shows its data through the editor, read-only, with no save or bump', async () => {
      const calls = fakeApi();
      const target = await mountShell();
      await pick(target, 'what/a');
      await pickVersion(target, 'c2');

      const at = calls.find((c) => c.url.includes('/demo/at'))!;
      expect(at.url).toContain('path=what%2Fa');
      expect(at.url).toContain('commit=c2');
      const inputs = [...target.querySelectorAll<HTMLInputElement>('.editor-pane input')];
      expect(inputs[0].value).toBe('second 1.0.0');
      expect(inputs.every((i) => i.disabled)).toBe(true);
      expect(target.querySelector('button.save')).toBeNull();
      expect(target.querySelector('.bump-line')).toBeNull();
      expect(target.querySelector('.version')!.textContent).toContain('1.0.0');
      expect(calls.some((c) => c.method === 'PUT' || c.url.includes('/demo/bump'))).toBe(false);
    });

    it('back to current returns to the editable working file', async () => {
      fakeApi();
      const target = await mountShell();
      await pick(target, 'what/a');
      expect(target.querySelector('button.back-to-current')).toBeNull();
      await pickVersion(target, 'c3');
      target.querySelector<HTMLButtonElement>('button.back-to-current')!.click();
      await settle();
      flushSync();
      const inputs = [...target.querySelectorAll<HTMLInputElement>('.editor-pane input')];
      expect(inputs[0].value).toBe('hi');
      expect(inputs.some((i) => i.disabled)).toBe(false);
      expect(target.querySelector('button.save')).not.toBeNull();
      expect(target.querySelector('button.back-to-current')).toBeNull();
      expect(target.querySelector<HTMLSelectElement>('select.version-picker')!.value).toBe('');
    });

    it('Restore copies the viewed version into the editable working file as unsaved changes', async () => {
      const calls = fakeApi();
      const target = await mountShell();
      await pick(target, 'what/a');
      await pickVersion(target, 'c3');
      target.querySelector<HTMLButtonElement>('button.restore')!.click();
      flushSync();
      const inputs = [...target.querySelectorAll<HTMLInputElement>('.editor-pane input')];
      expect(inputs[0].value).toBe('one-one');
      expect(inputs.some((i) => i.disabled)).toBe(false);
      expect(target.querySelector('[role=status]')!.textContent).toContain('Editing');
      expect(calls.some((c) => c.method === 'PUT')).toBe(false);
      target.querySelector<HTMLButtonElement>('button.save')!.click();
      await settle();
      expect(calls.find((c) => c.method === 'PUT')!.body.data.text).toBe('one-one');
    });

    it('closing Restore returns to the working file', async () => {
      fakeApi();
      const target = await mountShell();
      await pick(target, 'what/a');
      await pickVersion(target, 'c3');
      target.querySelector<HTMLButtonElement>('button.restore-toggle')!.click();
      await settle();
      flushSync();
      expect(target.querySelector<HTMLInputElement>('.editor-pane input')!.value).toBe('hi');
      expect(target.querySelector('.ed-readonly')).toBeNull();
    });

    it('re-reads the history after a bump, so the committed version appears', async () => {
      const calls = fakeApi();
      const target = await mountShell();
      await pick(target, 'what/a');
      const before = calls.filter((c) => c.url.includes('/demo/history')).length;
      openBump(target);
    target.querySelector<HTMLButtonElement>('.bump-minor')!.click();
      await settle();
      expect(calls.filter((c) => c.url.includes('/demo/history')).length).toBe(before + 1);
    });
  });
});
