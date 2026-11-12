<script lang="ts">
  // Shared dev-editor shell: owns card choice and save, and hands the editor
  // island `data`, `readOnly` and `onChange`. It knows no editor: the island is
  // loaded by the path the editor's definition names.
  import { onMount } from 'svelte';

  let { editorId }: { editorId: string } = $props();

  const API = '/__dev-editors';
  const loaders = import.meta.glob('/src/**/*.svelte') as Record<string, () => Promise<{ default: any }>>;

  let name = $state('');
  let Editor = $state<any>(null);
  let cards = $state<{ dir: string }[]>([]);
  let dir = $state('');
  let data = $state<unknown>(null);
  let status = $state('');

  const file = (d: string) => `${d}/index.json`;

  onMount(async () => {
    const editors: { id: string; name: string; component: string }[] = await (await fetch(`${API}/editors`)).json();
    const me = editors.find((e) => e.id === editorId);
    if (!me) {
      status = `no editor "${editorId}"`;
      return;
    }
    name = me.name;
    const load = loaders[me.component];
    if (!load) {
      status = `no component at ${me.component}`;
      return;
    }
    Editor = (await load()).default;
    cards = await (await fetch(`${API}/${editorId}/cards`)).json();
  });

  async function choose(next: string) {
    dir = next;
    data = null;
    status = '';
    if (!next) return;
    const res = await fetch(`${API}/${editorId}/read?path=${encodeURIComponent(file(next))}`);
    const body = await res.json();
    if (!res.ok) {
      status = body.error ?? 'could not load';
      return;
    }
    data = body.data;
  }

  async function save() {
    status = 'saving…';
    const res = await fetch(`${API}/${editorId}/write?path=${encodeURIComponent(file(dir))}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const body = await res.json();
    status = res.ok ? 'saved (card flagged inspected: false)' : (body.errors ?? [body.error]).join('; ');
  }
</script>

<h1>{name} editor</h1>
<label>
  Card
  <select value={dir} onchange={(e) => choose(e.currentTarget.value)}>
    <option value="">Pick a card…</option>
    {#each cards as card (card.dir)}
      <option value={card.dir}>{card.dir}</option>
    {/each}
  </select>
</label>

{#if Editor && data !== null}
  <Editor {data} readOnly={false} onChange={(next: unknown) => (data = next)} />
  <button class="save" onclick={save}>Save</button>
{/if}
<p role="status">{status}</p>
