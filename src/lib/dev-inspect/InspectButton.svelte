<script lang="ts">
  // Dev-only "mark inspected" button (issue #233). Mounted from Base.astro under
  // import.meta.env.DEV only. The decision is shouldShowInspect; this reads the
  // DOM into its input and applies the result. It keeps no ticked state: the
  // card file is the truth, and the dev server's reload brings the new
  // `data-inspected` that hides the button.
  import { onMount } from 'svelte';
  import { stackStore } from '../../stores/card-stack-store.ts';
  import { shouldShowInspect } from './should-show.ts';

  let inspectedByUid = $state<Record<string, boolean>>({});
  const activeSlot = $derived($stackStore.activeSlot);
  const show = $derived(shouldShowInspect(activeSlot, inspectedByUid));
  let failed = $state(false);

  function readDom() {
    const next: Record<string, boolean> = {};
    for (const el of document.querySelectorAll<HTMLElement>('[data-uid][data-inspected]')) {
      next[el.dataset.uid!] = el.dataset.inspected === 'true';
    }
    inspectedByUid = next;
  }

  onMount(() => {
    readDom();
    // Cards are pushed and replaced by CardStack, and a reload swaps the
    // markup, so re-read whenever the document's cards change.
    const observer = new MutationObserver(readDom);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-inspected', 'data-uid'] });
    return () => observer.disconnect();
  });

  async function mark() {
    failed = false;
    try {
      const res = await fetch('/__inspect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid: activeSlot }),
      });
      failed = !res.ok;
    } catch {
      failed = true;
    }
  }
</script>

{#if show}
  <button type="button" class="inspect-button" onclick={mark}>
    {failed ? 'Mark inspected (failed, retry)' : 'Mark inspected'}
  </button>
{/if}

<style>
  .inspect-button {
    position: fixed;
    right: var(--space-md);
    bottom: var(--space-md);
    z-index: 1000;
    padding: 0.5rem 0.9rem;
    font: inherit;
    color: var(--color-selected-fg);
    background: var(--color-selected-bg);
    border: 2px solid var(--color-selected-bg);
    cursor: pointer;
  }
</style>
