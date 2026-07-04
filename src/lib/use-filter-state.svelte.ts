import { filterStateFromParams, filterStateToParams, applyFilters } from './filters';
import type { FilterState, Dimension } from './filters';
import type { SerialisedCardFull } from './frontpage';

export function createFilterState(getCards: () => SerialisedCardFull[], basePath: string = '/') {
  let filterState = $state<FilterState>({ selections: {} });

  const cardMetas = $derived(
    getCards().map(c => ({ ...c, date: c.date ? new Date(c.date) : undefined }))
  );

  const filteredCards = $derived(applyFilters(cardMetas, filterState));

  const hasActiveFilters = $derived(
    Object.values(filterState.selections).some(v => v && v.length > 0)
  );

  function pushToUrl(state: FilterState) {
    const params = filterStateToParams(state);
    const query = params.toString();
    history.pushState(null, '', query ? `${basePath}?${query}` : basePath);
  }

  function toggle(dim: Dimension, value: string) {
    const existing = filterState.selections[dim] ?? [];
    const updated = existing.includes(value)
      ? existing.filter(v => v !== value)
      : [...existing, value];
    const newSelections = { ...filterState.selections };
    if (updated.length === 0) {
      delete newSelections[dim];
    } else {
      newSelections[dim] = updated;
    }
    filterState = { ...filterState, selections: newSelections };
    pushToUrl(filterState);
  }

  function clearDimension(dim: Dimension) {
    const newSelections = { ...filterState.selections };
    delete newSelections[dim];
    filterState = { ...filterState, selections: newSelections };
    pushToUrl(filterState);
  }

  function clearAll() {
    filterState = { selections: {} };
    pushToUrl(filterState);
  }

  $effect(() => {
    filterState = filterStateFromParams(new URLSearchParams(window.location.search));
    function onPopstate() {
      filterState = filterStateFromParams(new URLSearchParams(window.location.search));
    }
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  });

  return {
    get filterState() { return filterState; },
    get cardMetas() { return cardMetas; },
    get filteredCards() { return filteredCards; },
    get hasActiveFilters() { return hasActiveFilters; },
    toggle,
    clearDimension,
    clearAll,
  };
}
