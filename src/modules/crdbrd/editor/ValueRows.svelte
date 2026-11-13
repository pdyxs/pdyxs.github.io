<script lang="ts">
  // One editor per property, each showing the stored value or the type's default.
  import type { Game, Property, Value } from '../model/types.ts';
  import { valueOf, findConcept } from '../model/query.ts';

  let { game, properties, owner, readOnly, onSet }: {
    game: Game;
    properties: Property[];
    /** Whoever holds the values: an entity, or the game itself. */
    owner: { name: string; values: Record<string, Value> };
    readOnly: boolean;
    onSet: (property: string, value: Value) => void;
  } = $props();

  const num = (s: string, fallback: number) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : fallback);
</script>

<ul class="values">
  {#each properties as p (p.id)}
    {@const value = valueOf(owner, p)}
    <li class="value-row" data-prop={p.id}>
      <span class="value-name">{p.name}</span>
      {#if p.type.kind === 'number'}
        <input type="number" min={p.type.min} max={p.type.max} value={value as number} disabled={readOnly} oninput={(e) => onSet(p.id, num(e.currentTarget.value, p.type.kind === 'number' ? p.type.min : 0))} />
      {:else if p.type.kind === 'text'}
        <input type="text" value={value as string} disabled={readOnly} oninput={(e) => onSet(p.id, e.currentTarget.value)} />
      {:else if p.type.kind === 'colour'}
        <input type="color" value={value as string} disabled={readOnly} oninput={(e) => onSet(p.id, e.currentTarget.value)} />
      {:else if p.type.kind === 'boolean'}
        <input type="checkbox" checked={value as boolean} disabled={readOnly} onchange={(e) => onSet(p.id, e.currentTarget.checked)} />
      {:else}
        <select value={(value as string | null) ?? ''} disabled={readOnly} onchange={(e) => onSet(p.id, e.currentTarget.value || null)}>
          <option value="">(none)</option>
          {#each findConcept(game, p.type.concept)?.entities ?? [] as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
        </select>
      {/if}
    </li>
  {/each}
</ul>
