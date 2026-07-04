<script lang="ts">
  import { createFilterState } from '../../lib/use-filter-state.svelte';
  import type { SerialisedCardFull } from '../../lib/frontpage';
  import type { TagDisplay } from '../../lib/tag-display';
  import BrowseResults from '../BrowseResults.svelte';

  interface Props {
    cards: SerialisedCardFull[];
    tagDisplay?: Record<string, TagDisplay>;
  }

  let { cards, tagDisplay = {} }: Props = $props();

  // Re-derives the filter from the current URL on mount/popstate and narrows
  // `cards` with the same applyFilters() used everywhere else. `cards` here
  // may already be server-narrowed (see NewestLens.astro) — re-applying the
  // same filter to an already-filtered set is a no-op, so this stays correct
  // whether or not the server had access to the request's query string.
  const filter = createFilterState(() => cards);
</script>

<BrowseResults cards={filter.filteredCards} {tagDisplay} />
