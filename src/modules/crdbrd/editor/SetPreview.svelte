<script lang="ts">
  // One instance of the set drawn with its cut line and bleed. The caller picks
  // the instance and owns selection; this only draws, highlights and reports
  // clicks. No instance yet (a set with no components) previews with an empty
  // one, so geometry can be designed before any piece exists.
  import type { ComponentSet, Game } from '../model/types.ts';
  import type { Instance } from '../model/expand.ts';
  import { resolve } from '../render/resolve.ts';
  import ComponentSvg from '../render/ComponentSvg.svelte';
  import { assetUrl } from '../../../lib/dev-editors/asset-client.ts';

  let { game, set, instance, highlight = null, onSelect, editorId, dir }: {
    game: Game; set: ComponentSet; instance?: Instance; highlight?: string | null; onSelect: (layerId: string) => void; editorId: string; dir: string;
  } = $props();

  const blankInstance: Instance = { component: '', index: 0, bound: {}, values: {} };
  const scene = $derived(resolve(set, instance ?? blankInstance, game));
</script>

<div class="set-preview" style:aspect-ratio="{scene.page.width} / {scene.page.height}" style:max-width="{scene.page.width * 4}px">
  <ComponentSvg {scene} {highlight} onselect={onSelect} imageUrl={(file) => assetUrl(editorId, dir, file)} maskId="set-preview-mask-{set.id}" />
</div>
