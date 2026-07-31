import { writable } from 'svelte/store';
import type { FilterState } from '../dimensions';
import { emptyFilterState } from '../dimensions';

/**
 * Single source of truth for the active lens's filter selections. Astro's
 * client:* islands can't share live reactive props across independent
 * hydration boundaries, so LensFilterShell.svelte (the sole writer, synced
 * from the URL) and each lens body (a reader, deriving its own filtered view
 * via applyFilters) coordinate only through this store — same cross-island
 * pattern card-stack-store.ts already uses for stackStore.
 *
 * The five toggle/clear helpers that used to live here are gone: selection
 * algebra now belongs to each dimension (toggleValue / clearDimension in
 * src/dimensions/registry.ts), so there is nothing per-kind left to duplicate.
 */
export const lensFilterStore = writable<FilterState>(emptyFilterState());

/**
 * Flips to true once LensFilterShell has synced the filter selection from the
 * URL on mount. The pre-paint anti-FOUC guard (`data-filters-pending`, set by
 * the inline script in Base.astro) hides browse results until a lens body sees
 * this go true and clears the guard — so a filtered cold load never flashes the
 * full unfiltered set before reducing to the selection.
 */
export const lensFiltersSynced = writable(false);
