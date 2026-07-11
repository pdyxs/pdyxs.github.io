<script lang="ts">
  import { lensFilterStore } from '../../stores/lens-filter-store';
  import { applyFilters } from '../../lib/filters';
  import { sortCardsForBrowse } from '../../lib/browse-helpers';
  import type { SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import BrowseResults from '../BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
    config?: Record<string, unknown>;
  }

  let { cards, tagDisplay = {}, config }: Props = $props();

  // The generic body for any filter-accepting lens with no bespoke rendering
  // (the "browse lens family" — see lens-registry.ts). Filtering is derived
  // from the shared lensFilterStore (owned by LensFilterShell.svelte, a
  // sibling island) rather than owned locally — applyFilters is pure and
  // cheap, so re-deriving here is not a second copy of STATE, just a
  // computation from the single source of truth.
  const cardMetas = $derived(
    cards.map(c => ({ ...c, date: c.date ? new Date(c.date) : undefined }))
  );
  const filteredCards = $derived(applyFilters(cardMetas, $lensFilterStore));
  const sortedCards = $derived(sortCardsForBrowse(filteredCards, config));
</script>

<BrowseResults cards={sortedCards} {tagDisplay} filterState={$lensFilterStore} />
