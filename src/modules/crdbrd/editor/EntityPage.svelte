<script lang="ts">
  import type { Concept, Entity, Game } from '../model/types.ts';
  import { renameEntity, setEntityValue } from '../model/ops.ts';
  import ValueRows from './ValueRows.svelte';

  let { game, concept, entity, readOnly, onChange }: { game: Game; concept: Concept; entity: Entity; readOnly: boolean; onChange: (next: Game) => void } = $props();
</script>

<h2>Entity</h2>
<label>
  Name
  <input class="entity-name" type="text" value={entity.name} disabled={readOnly} oninput={(e) => onChange(renameEntity(game, entity.id, e.currentTarget.value))} />
</label>

<h3>Values</h3>
<ValueRows {game} properties={concept.properties} owner={entity} {readOnly} onSet={(p, v) => onChange(setEntityValue(game, entity.id, p, v))} />
