<script lang="ts">
  // One image: a thumbnail, upload, and choose-existing. It stores nothing; the
  // filename goes out through `onPick`. Uses only the dev-editors asset helpers.
  import { assetUrl, listAssets, uploadAsset } from '../../../lib/dev-editors/asset-client.ts';

  let { editorId, dir, file, label, readOnly, onPick }: {
    editorId: string; dir: string; file: string | null; label: string; readOnly: boolean; onPick: (file: string | null) => void;
  } = $props();

  let existing = $state<string[]>([]);
  let error = $state('');

  async function refresh() {
    try {
      existing = await listAssets(editorId, dir);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  $effect(() => {
    if (editorId && dir) void refresh();
  });

  async function upload(e: Event & { currentTarget: HTMLInputElement }) {
    const picked = e.currentTarget.files?.[0];
    if (!picked) return;
    error = '';
    const result = await uploadAsset(editorId, dir, picked);
    if (result.ok) {
      onPick(result.filename);
      await refresh();
    } else {
      error = result.exists ? `${picked.name} already exists in this card; choose it from the list or rename the file` : result.error;
    }
  }
</script>

<div class="image-slot">
  <span class="slot-label">{label}</span>
  {#if file}
    <img class="thumb" src={assetUrl(editorId, dir, file)} alt={file} />
  {:else}
    <span class="thumb-empty">no image</span>
  {/if}
  <input class="image-upload" type="file" accept="image/*" disabled={readOnly} aria-label={`Upload ${label}`} onchange={upload} />
  <select class="image-choose" value={file ?? ''} disabled={readOnly} aria-label={`Choose ${label}`} onchange={(e) => onPick(e.currentTarget.value || null)}>
    <option value="">(none)</option>
    {#each existing as name (name)}<option value={name}>{name}</option>{/each}
  </select>
  {#if error}<span class="image-error" role="alert">{error}</span>{/if}
</div>
