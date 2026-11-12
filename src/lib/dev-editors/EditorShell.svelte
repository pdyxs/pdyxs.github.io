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
  let cards = $state<{ dir: string; valid: boolean }[]>([]);
  let folders = $state<string[]>([]);
  let showAll = $state(false);
  let dir = $state('');
  let data = $state<unknown>(null);
  let version = $state('');
  let status = $state('');
  let newFolder = $state('');
  let newTitle = $state('');

  const file = (d: string) => `${d}/index.json`;
  const post = (path: string, body: unknown) =>
    fetch(`${API}/${editorId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  async function loadCards() {
    cards = await (await fetch(`${API}/${editorId}/cards${showAll ? '?all=1' : ''}`)).json();
  }

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
    await loadCards();
    folders = await (await fetch(`${API}/folders`)).json();
    newFolder = folders[0] ?? '';
  });

  async function toggleAll(checked: boolean) {
    showAll = checked;
    await loadCards();
  }

  /** Make the card renderable (asking about any conflict), then load it. */
  async function choose(next: string) {
    dir = '';
    data = null;
    version = '';
    status = '';
    if (!next) return;
    const query = `open?path=${encodeURIComponent(next)}`;
    let res = await post(query, {});
    let body = await res.json();
    if (res.status === 409) {
      const lines = (body.conflicts as { property: string; old: string; new: string }[]).map((c) => `${c.property}: ${c.old} -> ${c.new}`);
      if (!confirm(`This card conflicts with the ${name} editor. Replace?\n${lines.join('\n')}`)) {
        status = 'not opened; nothing was changed';
        return;
      }
      res = await post(query, { confirm: true });
      body = await res.json();
    }
    if (!res.ok) {
      status = body.error ?? 'could not open';
      return;
    }
    const read = await fetch(`${API}/${editorId}/read?path=${encodeURIComponent(file(next))}`);
    const envelope = await read.json();
    if (!read.ok) {
      status = envelope.error ?? 'could not load';
      return;
    }
    dir = next;
    data = envelope.data;
    version = envelope.version;
    await loadCards();
  }

  async function create() {
    const res = await post('create', { parent: newFolder, title: newTitle });
    const body = await res.json();
    if (!res.ok) {
      status = body.error ?? 'could not create';
      return;
    }
    newTitle = '';
    await choose(body.dir);
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

  async function bump(kind: 'major' | 'minor' | 'patch') {
    status = 'committing the outgoing version…';
    const res = await post(`bump?path=${encodeURIComponent(dir)}&kind=${kind}`, {});
    const body = await res.json();
    if (!res.ok) {
      status = (body.errors ?? [body.error]).join('; ');
      return;
    }
    version = body.version;
    status = `bumped to ${body.version} (card flagged inspected: false)`;
  }
</script>

<h1>{name} editor</h1>
<label>
  Card
  <select class="cards" value={dir} onchange={(e) => choose(e.currentTarget.value)}>
    <option value="">Pick a card…</option>
    {#each cards as card (card.dir)}
      <option value={card.dir}>{card.dir}{card.valid ? '' : ' (not set up for this editor)'}</option>
    {/each}
  </select>
</label>
<label>
  <input type="checkbox" class="show-all" checked={showAll} onchange={(e) => toggleAll(e.currentTarget.checked)} />
  Show all cards
</label>

<fieldset>
  <legend>New card</legend>
  <label>
    Folder
    <select class="new-folder" value={newFolder} onchange={(e) => (newFolder = e.currentTarget.value)}>
      {#each folders as folder (folder)}
        <option value={folder}>{folder}</option>
      {/each}
    </select>
  </label>
  <label>
    Title
    <input type="text" class="new-title" value={newTitle} oninput={(e) => (newTitle = e.currentTarget.value)} />
  </label>
  <button class="create" onclick={create}>Create</button>
</fieldset>

{#if dir}
  <p><a class="page-link" href={`/card/${dir}`} target="_blank" rel="noopener">View this card on the site</a></p>
{/if}
{#if dir && version}
  <div class="version-bar">
    <span class="version">Version {version}</span>
    <button class="bump-major" onclick={() => bump('major')}>new major</button>
    <button class="bump-minor" onclick={() => bump('minor')}>new minor</button>
    <button class="bump-patch" onclick={() => bump('patch')}>new patch</button>
  </div>
{/if}
{#if Editor && data !== null}
  <div class="editor-pane">
    <Editor {data} readOnly={false} onChange={(next: unknown) => (data = next)} />
  </div>
  <button class="save" onclick={save}>Save</button>
{/if}
<p role="status">{status}</p>
