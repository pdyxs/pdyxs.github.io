import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import InspectButton from './InspectButton.svelte';
import { stackStore } from '../../stores/card-stack-store.ts';

const settle = () => new Promise((r) => setTimeout(r, 30));
let comp: ReturnType<typeof mount> | undefined;

function page(cards: Record<string, boolean>) {
  document.body.innerHTML = Object.entries(cards)
    .map(([uid, ok]) => `<div class="stack-card" data-uid="${uid}" data-inspected="${ok}"></div>`)
    .join('');
}
function active(slot: string | null) {
  stackStore.set({ entries: [], activeSlot: slot });
}
async function start() {
  comp = mount(InspectButton, { target: document.body });
  flushSync();
  await settle();
}
const button = () => document.querySelector<HTMLButtonElement>('button.inspect-button');

afterEach(() => {
  if (comp) unmount(comp);
  comp = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('InspectButton', () => {
  it('shows "Mark inspected" for an uninspected active card', async () => {
    page({ 'what/a': false });
    active('what/a');
    await start();
    expect(button()?.textContent?.trim()).toBe('Mark inspected');
  });

  it('shows nothing when the active card is inspected, though another card in the stack is not', async () => {
    page({ 'what/a': true, 'what/b': false });
    active('what/a');
    await start();
    expect(button()).toBeNull();
  });

  it('follows the active slot', async () => {
    page({ 'what/a': true, 'what/b': false });
    active('what/a');
    await start();
    active('what/b');
    await settle();
    expect(button()).not.toBeNull();
  });

  it('POSTs the active card uid, and keeps no ticked state of its own', async () => {
    page({ 'what/a': false, 'what/b': false });
    active('what/b');
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    globalThis.fetch = fetchMock as any;
    await start();
    button()!.click();
    await settle();
    expect(fetchMock).toHaveBeenCalledWith('/__inspect', expect.objectContaining({ method: 'POST', body: JSON.stringify({ uid: 'what/b' }) }));
    // The file is the source of truth: until the reload says otherwise, the button stays.
    expect(button()).not.toBeNull();
  });
});
