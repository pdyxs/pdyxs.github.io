<script lang="ts">
  import type { DemoData } from './definition.ts';

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
