<script lang="ts">
  // Test fixture: the minimal editor island EditorShell.island.test.ts mounts through the shell.
  type Data = { text: string; count: number };
  let { data, readOnly, onChange, editorId, dir }: { data: Data; readOnly: boolean; onChange: (next: Data) => void; editorId: string; dir: string } = $props();
</script>

<p class="where">{editorId}:{dir}</p>
<label>
  Text
  <input type="text" value={data.text} disabled={readOnly} oninput={(e) => onChange({ ...data, text: e.currentTarget.value })} />
</label>
<label>
  Count
  <input type="number" value={data.count} disabled={readOnly} oninput={(e) => onChange({ ...data, count: e.currentTarget.valueAsNumber })} />
</label>
