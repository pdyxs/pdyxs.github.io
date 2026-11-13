<script lang="ts">
  let { label, disabled, onAdd, kind = '' }: { label: string; disabled: boolean; onAdd: (name: string) => void; kind?: string } = $props();
  let name = $state('');

  function submit(e: Event) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    name = '';
  }
</script>

<form class={`add-form ${kind}`} onsubmit={submit}>
  <input type="text" placeholder={label} aria-label={label} bind:value={name} {disabled} />
  <button type="submit" {disabled}>Add</button>
</form>
