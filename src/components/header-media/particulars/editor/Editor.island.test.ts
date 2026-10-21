// Client-mount test for the dev-only Particulars editor: pick a card, edit a
// wave in the form, and see the write endpoint and the live preview follow.
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Editor from './Editor.svelte';

const SCENARIO = {
  walls: { width: 20, height: 10 },
  player: { x: 0, y: 0 },
  formations: { row: { kind: 'line', count: 5, distance: 1, contents: ['up'] } },
  barriers: [{ shape: 'rect', mode: 'all', x: 4, y: 2, width: 2, height: 1 }],
  waves: [
    { id: 'ring', entries: [{ spawn: 'electron', telegraph: 1 }] },
    { id: 'rows', entries: [{ spawn: 'row', position: { x: 1, y: 1 } }] },
    { id: 'extra', entries: [{ spawn: 'muon' }] },
  ],
  triggers: [
    { kind: 'time', at: 2, actions: [{ kind: 'spawn', wave: 'ring' }] },
    { kind: 'time', at: 9, actions: [{ kind: 'spawn', wave: 'rows' }] },
  ],
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
    expect(target.querySelector('svg.level-view')!.getAttribute('data-entry')).toBe('what/toys/a');
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

  describe('level view', () => {
    const field = (name: string) => target.querySelector(`input[data-field="${name}"]`) as HTMLInputElement;
    const click = (sel: string) => (target.querySelector(sel) as HTMLElement).click();
    /** One pixel is one world unit, offset by the view margin, so a drag is just coordinates. */
    function stubRect() {
      const svg = target.querySelector('svg.level-view') as SVGSVGElement;
      const vb = svg.getAttribute('viewBox')!.split(' ').map(Number);
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: vb[2], height: vb[3], right: vb[2], bottom: vb[3], x: 0, y: 0, toJSON() {} }) as DOMRect;
      return { svg, vb };
    }
    function dragHandle(key: string, by: { x: number; y: number }) {
      const { svg, vb } = stubRect();
      const handle = target.querySelector(`[data-handle="${key}"]`) as SVGElement;
      const h = { x: Number(handle.getAttribute('cx')), y: Number(handle.getAttribute('cy')) };
      const px = (p: { x: number; y: number }) => ({ clientX: p.x - vb[0], clientY: p.y - vb[1] });
      handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, ...px(h), bubbles: true }));
      svg.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, ...px({ x: h.x + by.x, y: h.y + by.y }), bubbles: true }));
      svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
      flushSync();
    }

    it('dragging a formation handle changes the matching form field and the saved JSON', async () => {
      await pickCard();
      click('button[data-select="entry-1-0"]');
      flushSync();
      dragHandle('row:spacing', { x: 1, y: 0 });
      // the handle sat on the last slot (x = 1 + 2); at x = 4 it is 3 from the centre over a half-extent of 2
      expect(JSON.parse((target.querySelector('textarea[data-field="formations.row"]') as HTMLTextAreaElement).value).distance).toBe(1.5);
      await wait(60);
      const put = calls.filter((c) => c.method === 'PUT').at(-1)!;
      expect(put.body.formations.row.distance).toBe(1.5);
    });

    it('dragging the centre handle moves the entry position fields', async () => {
      await pickCard();
      click('button[data-select="entry-1-0"]');
      flushSync();
      dragHandle('centre', { x: 2, y: 3 });
      expect(field('waves.1.entries.0.position.x').value).toBe('3');
      expect(field('waves.1.entries.0.position.y').value).toBe('4');
    });

    it('editing the form moves the handle', async () => {
      await pickCard();
      click('button[data-select="entry-1-0"]');
      flushSync();
      const x = field('waves.1.entries.0.position.x');
      x.value = '6';
      x.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      expect(target.querySelector('[data-handle="centre"]')!.getAttribute('cx')).toBe('6');
    });

    it('selecting a barrier offers its handles, and dragging one edits the barrier', async () => {
      await pickCard();
      click('button[data-select="barrier-0"]');
      flushSync();
      dragHandle('centre', { x: 1, y: 0 });
      expect(JSON.parse((target.querySelector('textarea[data-field="barriers.0"]') as HTMLTextAreaElement).value).x).toBe(5);
    });
  });

  describe('running waves in isolation', () => {
    const tick = (n: number) => new Promise((r) => setTimeout(r, n));
    async function runWaves(ids: string[]) {
      for (const id of ids) {
        const box = target.querySelector(`input[data-run-wave="${id}"]`) as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
      flushSync();
      (target.querySelector('button.run-waves') as HTMLButtonElement).click();
      flushSync();
      await tick(150);
    }

    it('pressing run mounts the toy with only the chosen waves', async () => {
      await pickCard();
      await runWaves(['rows']);
      const toy = target.querySelector('svg.particulars') as SVGElement;
      expect(toy.getAttribute('data-entry')).toBe('what/toys/a');
      // 5 particles from the one chosen wave; the ring wave (timed, 1 electron) has not been spawned
      expect(toy.querySelectorAll('.particle').length).toBe(5);
    });

    it('at most two waves can be chosen', async () => {
      await pickCard();
      for (const id of ['ring', 'rows']) {
        const box = target.querySelector(`input[data-run-wave="${id}"]`) as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
      flushSync();
      expect((target.querySelector('input[data-run-wave="extra"]') as HTMLInputElement).disabled).toBe(true);
    });

    it('stop returns to the level view', async () => {
      await pickCard();
      await runWaves(['rows']);
      (target.querySelector('button.stop-run') as HTMLButtonElement).click();
      flushSync();
      expect(target.querySelector('svg.particulars')).toBeNull();
      expect(target.querySelector('svg.level-view')).not.toBeNull();
    });
  });
});
