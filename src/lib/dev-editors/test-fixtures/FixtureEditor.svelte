<script lang="ts">
  type DemoData = { text: string; count: number };

  let { data, readOnly, onChange }: { data: DemoData; readOnly: boolean; onChange: (next: DemoData) => void } = $props();
</script>

<label>
  Text
  <input type="text" value={data.text} disabled={readOnly} oninput={(e) => onChange({ ...data, text: e.currentTarget.value })} />
</label>
<label>
  Count
  <input type="number" value={data.count} disabled={readOnly} oninput={(e) => onChange({ ...data, count: e.currentTarget.valueAsNumber })} />
</label>
