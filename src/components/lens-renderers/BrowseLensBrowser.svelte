<script lang="ts">
  import { lensFilterStore, lensFiltersSynced } from '../../stores/lens-filter-store';
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

  // Clear the pre-paint anti-FOUC guard (set by Base.astro's inline script when
  // the URL carries filters) once the shell has synced the selection AND this
  // filtered view is committed. Reading sortedCards makes the effect re-run when
  // the reduced set lands, so we never reveal before the DOM reflects it. The
  // guard is on <html>, so a bare-cold no-filter load (guard never set) no-ops.
  $effect(() => {
    sortedCards;
    if ($lensFiltersSynced) {
      document.documentElement.removeAttribute('data-filters-pending');
    }
  });
</script>

<BrowseResults cards={sortedCards} {tagDisplay} filterState={$lensFilterStore} />
