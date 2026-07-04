<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveFrontPageSlots } from '../../lib/frontpage';
  import { markDisplayed } from '../../lib/card-view-state';
  import type { FrontPageConfig, ResolvedSlot, SerialisedCardFull } from '../../lib/frontpage';
  import FrontPageSlots from '../FrontPageSlots.svelte';

  interface Props {
    config: FrontPageConfig;
    cards: SerialisedCardFull[];
  }

  let { config, cards }: Props = $props();

  let resolvedSlots = $state<ResolvedSlot[]>([]);

  onMount(() => {
    const { slots, displayed } = resolveFrontPageSlots(config, cards, new Date());
    for (const d of displayed) markDisplayed(d.uid, d.contentHash);
    resolvedSlots = slots;
  });
</script>

<FrontPageSlots slots={resolvedSlots} />
