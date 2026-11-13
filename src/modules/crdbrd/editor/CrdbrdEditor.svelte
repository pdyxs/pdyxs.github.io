<script lang="ts">
  // The crdbrd island the dev-editors shell mounts. It holds no game state:
  // `data` comes in, every edit is one pure op whose whole new game goes out
  // through `onChange`. The only state of its own is where you are, which
  // lives in the URL hash so a reload keeps your place.
  import type { Game } from '../model/types.ts';
  import { conceptPath, setPath } from '../model/query.ts';
  import { parseRoute, routeHash } from './route.ts';
  import GamePage from './GamePage.svelte';
  import ConceptPage from './ConceptPage.svelte';
  import SetPage from './SetPage.svelte';
  import EntityPage from './EntityPage.svelte';

  let { data, readOnly, onChange }: { data: Game; readOnly: boolean; onChange: (next: Game) => void } = $props();

  let hash = $state(location.hash);
  const route = $derived(parseRoute(hash));

  // What the route points at in `data`; a stale route (something deleted) falls back to the game page.
  const view = $derived.by(() => {
    if (route.page === 'game') return { page: 'game' as const };
    if (route.page === 'set') {
      const trail = setPath(data, route.set);
      const set = trail.at(-1);
      return set ? { page: 'set' as const, set, trail: trail.slice(0, -1) } : { page: 'game' as const };
    }
    const path = conceptPath(data, route.concept);
    const concept = path.at(-1);
    if (!concept) return { page: 'game' as const };
    if (route.page === 'concept') return { page: 'concept' as const, concept, trail: path.slice(0, -1) };
    const entity = concept.entities.find((e) => e.id === route.entity);
    if (!entity) return { page: 'game' as const };
    return { page: 'entity' as const, concept, entity, trail: path };
  });

  $effect(() => {
    const sync = () => (hash = location.hash);
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  });
</script>

<div class="crdbrd">
  <nav class="crumbs">
    <a href={routeHash({ page: 'game' })}>Game</a>
    {#if view.page !== 'game'}
      {#each view.trail as c (c.id)}
        <a href={view.page === 'set' ? routeHash({ page: 'set', set: c.id }) : routeHash({ page: 'concept', concept: c.id })}>{c.name}</a>
      {/each}
    {/if}
  </nav>
  {#if view.page === 'game'}
    <GamePage game={data} {readOnly} {onChange} />
  {:else if view.page === 'set'}
    <SetPage game={data} set={view.set} {readOnly} {onChange} />
  {:else if view.page === 'concept'}
    <ConceptPage game={data} concept={view.concept} {readOnly} {onChange} />
  {:else}
    <EntityPage game={data} concept={view.concept} entity={view.entity} {readOnly} {onChange} />
  {/if}
</div>
