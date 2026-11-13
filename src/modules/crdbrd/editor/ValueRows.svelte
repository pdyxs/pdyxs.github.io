<script lang="ts">
  // One editor per property, each showing the stored value or the type's default.
  import type { Game, Property, Value } from '../model/types.ts';
  import { valueOf, findConcept } from '../model/query.ts';

  import ImageSlot from './ImageSlot.svelte';
  import { bindingKey } from '../model/image.ts';

  let { game, properties, owner, readOnly, onSet, onSetSlot, editorId, dir }: {
    game: Game;
    properties: Property[];
    /** Whoever holds the values: an entity, or the game itself. */
    owner: { name: string; values: Record<string, Value> };
    readOnly: boolean;
    onSet: (property: string, value: Value) => void;
    /** Set one slot of a varies-by image: the entity of the varies-by concept, and the filename. */
    onSetSlot?: (property: string, bound: string, file: string | null) => void;
    /** Where images live: the open card's editor and folder. */
    editorId: string;
    dir: string;
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
      {:else if p.type.kind === 'image'}
        {@const concept = p.type.variesBy}
        {#if concept && onSetSlot}
          {@const slots = (typeof value === 'object' && value !== null ? value : {}) as Record<string, string>}
          <div class="image-slots">
            {#each findConcept(game, concept)?.entities ?? [] as e (e.id)}
              <ImageSlot {editorId} {dir} {readOnly} label={e.name} file={slots[bindingKey({ [concept]: e.id })] ?? null} onPick={(file) => onSetSlot(p.id, e.id, file)} />
            {/each}
          </div>
        {:else}
          <ImageSlot {editorId} {dir} {readOnly} label={p.name} file={typeof value === 'string' ? value : null} onPick={(file) => onSet(p.id, file)} />
        {/if}
      {:else}
        <select value={(value as string | null) ?? ''} disabled={readOnly} onchange={(e) => onSet(p.id, e.currentTarget.value || null)}>
          <option value="">(none)</option>
          {#each findConcept(game, p.type.concept)?.entities ?? [] as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
        </select>
      {/if}
    </li>
  {/each}
</ul>
