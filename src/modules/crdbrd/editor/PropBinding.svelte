<script lang="ts">
  // The literal-or-bound picker for one layer prop. It lists only what
  // `bindableSources` says fits; a stored binding the model no longer offers
  // shows as broken (the form's half of "bindings that outlive their target").
  import type { Binding, Game, Prop } from '../model/types.ts';
  import { accepts, bindableSources, findSource, type PropSpec } from '../model/bindings.ts';

  let { game, setId, spec, prop, readOnly, onBind }: {
    game: Game; setId: string; spec: PropSpec; prop: Prop<unknown>; readOnly: boolean; onBind: (binding: Binding | null) => void;
  } = $props();

  const options = $derived(bindableSources(game, setId).filter((s) => accepts(spec.want, s.type)));
  const broken = $derived.by(() => {
    if (prop.kind !== 'bound') return false;
    const source = findSource(game, setId, prop.source);
    return !source || !accepts(spec.want, source.type);
  });
  const key = (b: Binding) => JSON.stringify(b);
  const current = $derived(prop.kind === 'bound' ? key(prop.source) : '');
</script>

<select class="bind-source" value={current} disabled={readOnly} aria-label="Bind to" onchange={(e) => onBind(e.currentTarget.value ? (JSON.parse(e.currentTarget.value) as Binding) : null)}>
  <option value="">(literal)</option>
  {#each options as source (key(source.binding))}<option value={key(source.binding)}>{source.label}</option>{/each}
  {#if broken && prop.kind === 'bound'}<option value={current}>(missing source)</option>{/if}
</select>
{#if broken}<span class="binding-broken" role="alert">Bound to something that no longer exists or no longer fits; the preview shows a gap.</span>{/if}
