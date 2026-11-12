<script lang="ts">
  // Test-only stand-in for the dev-editors EditorShell: holds the data, hands
  // the editor `data`, `readOnly` and `onChange`, and reports each change.
  import Editor from './Editor.svelte';

  let { initial, readOnly = false, changed }: { initial: any; readOnly?: boolean; changed: (next: any) => void } = $props();
  // svelte-ignore state_referenced_locally -- the starting data is fixed for the mount
  let data = $state.raw(initial);
</script>

<Editor {data} {readOnly} onChange={(next: any) => { data = next; changed(next); }} />
