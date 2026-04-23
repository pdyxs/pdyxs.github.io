<script lang="ts">
  import { untrack } from 'svelte';
  import { stackStore } from '../stores/card-stack-store';
  import { computeStackLayout } from '../lib/stack-layout';

  interface Props {
    activeUid?: string;
    activeHtml?: string | null;
  }

  let { activeUid, activeHtml }: Props = $props();

  let cardHtmlCache = $state(new Map<string, string>());

  // Seed store from SSR prop once at mount — untrack to silence reactive-capture warning.
  untrack(() => {
    if (activeUid && activeHtml) {
      cardHtmlCache.set(activeUid, activeHtml);
      stackStore.set({ cards: [{ uid: activeUid }], activeUid });
    }
  });

  const layout = $derived(computeStackLayout($stackStore));
  const hasCards = $derived($stackStore.cards.length > 0);

  $effect(() => {
    for (const card of layout.visible) {
      const el = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(card.uid)}"]`);
      if (!el) continue;
      el.classList.toggle('stack-card--active', card.isActive);
      el.classList.toggle('stack-card--collapsed', card.isCollapsed);
      el.style.setProperty('--stack-index', String(card.stackIndex));
      const bw = el.querySelector<HTMLElement>('.body-wrapper');
      if (bw) bw.classList.toggle('open', card.isActive);
    }
  });
</script>

<div id="card-stack" hidden={!hasCards}>
  {#each layout.visible as card (card.uid)}
    {@html cardHtmlCache.get(card.uid) ?? ''}
  {/each}
</div>
