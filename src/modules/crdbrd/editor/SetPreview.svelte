<script lang="ts">
  // The first expanded instance of the set, drawn with its cut line and bleed.
  // A set with no components yet previews with an empty instance, so geometry
  // can be designed before any piece exists.
  import type { ComponentSet, Game } from '../model/types.ts';
  import { expand, type Instance } from '../model/expand.ts';
  import { resolve } from '../render/resolve.ts';
  import ComponentSvg from '../render/ComponentSvg.svelte';
  import { assetUrl } from '../../../lib/dev-editors/asset-client.ts';

  let { game, set, editorId, dir }: { game: Game; set: ComponentSet; editorId: string; dir: string } = $props();

  const blankInstance: Instance = { component: '', index: 0, bound: {}, values: {} };
  const scene = $derived(resolve(set, expand(game, set.id)[0] ?? blankInstance, game));
</script>

<div class="set-preview" style:aspect-ratio="{scene.page.width} / {scene.page.height}" style:max-width="{scene.page.width * 4}px">
  <ComponentSvg {scene} imageUrl={(file) => assetUrl(editorId, dir, file)} maskId="set-preview-mask-{set.id}" />
</div>
