<script lang="ts">
  // Shared dev-editor shell: owns card choice and save, and hands the editor
  // island `data`, `readOnly` and `onChange`. It knows no editor: the island is
  // loaded by the path the editor's definition names.
  //
  // The open card lives in the URL (`/dev/editors/<id>/<card dir>`, see
  // routes.ts), so the dev server's reload after a save or bump reopens it.
  import { onMount } from 'svelte';
  import { editorUrl, parseEditorPath, EDITORS_ROUTE } from './routes.ts';
  import { searchCards } from './selector.ts';
  import { bump as bumpVersion, BUMP_KINDS, type BumpKind } from './bump.ts';

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
  /** The working file's data as last loaded or saved, serialised; what `dirty` compares against. */
  let saved = $state('');
  let version = $state('');
  let history = $state<{ version: string; commit: string; date: string }[]>([]);
  /** The commit being viewed read-only, or '' for the working file. */
  let viewing = $state('');
  let current = $state<{ data: unknown; version: string } | null>(null);
  let status = $state('');
  let busy = $state(false);
  let newOpen = $state(false);
  /** The line under the version: new version, restore, or neither. */
  let tool = $state<'' | 'bump' | 'restore'>('');
  /** The card search: its text, whether its list is open, and the highlighted match. */
  let query = $state('');
  let listOpen = $state(false);
  let active = $state(0);
  let newFolder = $state('');
  let newTitle = $state('');

  const dirty = $derived(dir !== '' && !viewing && data !== null && JSON.stringify(data) !== saved);
  const matches = $derived(searchCards(cards, query));
  const viewingEntry = $derived(history.find((h) => h.commit === viewing));

  const file = (d: string) => `${d}/index.json`;
  const post = (path: string, body: unknown) =>
    fetch(`${API}/${editorId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  // `history` is the version list; the browser's is reached through this.
  const history_ = globalThis.history;
  /** The card the address bar names, or '' for none. */
  const dirFromUrl = () => parseEditorPath(location.pathname, [editorId])?.dir ?? '';
  function syncUrl(d: string) {
    const url = editorUrl(editorId, d);
    if (location.pathname.replace(/\/+$/, '') !== url) history_.pushState(null, '', url);
  }

  async function loadCards() {
    cards = await (await fetch(`${API}/${editorId}/cards${showAll ? '?all=1' : ''}`)).json();
  }

  onMount(() => {
    const onPop = () => {
      const next = dirFromUrl();
      if (next !== dir) choose(next, { fromUrl: true });
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    addEventListener('beforeunload', onLeave);
    init();
    return () => {
      removeEventListener('popstate', onPop);
      removeEventListener('keydown', onKey);
      removeEventListener('beforeunload', onLeave);
    };
  });

  async function init() {
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
    const fromUrl = dirFromUrl();
    if (fromUrl) await choose(fromUrl, { fromUrl: true });
  }

  function openList() {
    query = '';
    listOpen = true;
    active = Math.max(0, cards.findIndex((c) => c.dir === dir));
  }

  function pickCard(next: string) {
    listOpen = false;
    query = '';
    (document.activeElement as HTMLElement | null)?.blur();
    if (next !== dir) choose(next);
  }

  function onComboKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!listOpen) return openList();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = Math.min(Math.max(active + step, 0), Math.max(matches.length - 1, 0));
      document.getElementById(`ed-card-${active}`)?.scrollIntoView?.({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[active]) pickCard(matches[active].dir);
    } else if (e.key === 'Escape') {
      listOpen = false;
      (e.currentTarget as HTMLElement).blur();
    }
  }

  const nextVersion = (kind: BumpKind) => {
    try {
      return bumpVersion(version, kind);
    } catch {
      return '';
    }
  };

  /** Open one tool line, or close it if it is already open. Leaving Restore returns to the working file. */
  function toggleTool(next: 'bump' | 'restore') {
    tool = tool === next ? '' : next;
    if (tool !== 'restore' && viewing) view('');
  }

  /** Copy the viewed version's data into the working file, as unsaved changes. */
  function restore() {
    if (!viewing || !current) return;
    const from = viewingEntry?.version ?? version;
    const restored = data;
    view('');
    data = restored;
    tool = '';
    status = `Restored ${from}; save to keep it.`;
  }

  async function toggleAll(checked: boolean) {
    showAll = checked;
    await loadCards();
  }

  function clear() {
    dir = '';
    data = null;
    saved = '';
    version = '';
    history = [];
    viewing = '';
    current = null;
    tool = '';
  }

  /** Make the card renderable (asking about any conflict), then load it. */
  async function choose(next: string, { fromUrl = false } = {}) {
    if (dirty && !confirm(`Discard unsaved changes to ${dir}?`)) {
      // Leave the picker (and, after Back, the address bar) on the open card.
      if (fromUrl) syncUrl(dir);
      return;
    }
    clear();
    status = '';
    if (!next) {
      if (!fromUrl) syncUrl('');
      return;
    }
    const query = `open?path=${encodeURIComponent(next)}`;
    let res = await post(query, {});
    let body = await res.json();
    if (res.status === 409) {
      const lines = (body.conflicts as { property: string; old: string; new: string }[]).map((c) => `${c.property}: ${c.old} -> ${c.new}`);
      if (!confirm(`This card conflicts with the ${name} editor. Replace?\n${lines.join('\n')}`)) {
        status = 'Not opened; nothing was changed.';
        if (fromUrl) syncUrl('');
        return;
      }
      res = await post(query, { confirm: true });
      body = await res.json();
    }
    if (!res.ok) {
      status = body.error ?? 'Could not open.';
      if (fromUrl) syncUrl('');
      return;
    }
    const read = await fetch(`${API}/${editorId}/read?path=${encodeURIComponent(file(next))}`);
    const envelope = await read.json();
    if (!read.ok) {
      status = envelope.error ?? 'Could not load.';
      return;
    }
    dir = next;
    data = envelope.data;
    saved = JSON.stringify(envelope.data);
    version = envelope.version;
    syncUrl(next);
    await Promise.all([loadCards(), loadHistory()]);
  }

  async function loadHistory() {
    const res = await fetch(`${API}/${editorId}/history?path=${encodeURIComponent(dir)}`);
    history = res.ok ? await res.json() : [];
  }

  /** Show a committed version read-only; '' returns to the working file. */
  async function view(commit: string) {
    if (commit === '') {
      if (current) ({ data, version } = current);
      current = null;
      viewing = '';
      return;
    }
    const res = await fetch(`${API}/${editorId}/at?path=${encodeURIComponent(dir)}&commit=${encodeURIComponent(commit)}`);
    const envelope = await res.json();
    if (!res.ok) {
      status = envelope.error ?? 'Could not load that version.';
      return;
    }
    current ??= { data, version };
    viewing = commit;
    data = envelope.data;
    version = envelope.version;
  }

  async function create(e?: SubmitEvent) {
    e?.preventDefault();
    const res = await post('create', { parent: newFolder, title: newTitle });
    const body = await res.json();
    if (!res.ok) {
      status = body.error ?? 'Could not create.';
      return;
    }
    newTitle = '';
    newOpen = false;
    await choose(body.dir);
  }

  async function save(): Promise<boolean> {
    if (viewing || busy) return false;
    busy = true;
    status = 'Saving…';
    const snapshot = JSON.stringify(data);
    const res = await fetch(`${API}/${editorId}/write?path=${encodeURIComponent(file(dir))}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const body = await res.json();
    busy = false;
    if (!res.ok) {
      status = (body.errors ?? [body.error]).join('; ');
      return false;
    }
    saved = snapshot;
    status = 'Saved. Card flagged inspected: false.';
    return true;
  }

  /** Commits the outgoing version, saving unsaved edits first so they are part of it. */
  async function bump(kind: BumpKind) {
    if (viewing || busy) return;
    if (dirty && !(await save())) return;
    busy = true;
    status = 'Committing the outgoing version…';
    const res = await post(`bump?path=${encodeURIComponent(dir)}&kind=${kind}`, {});
    const body = await res.json();
    busy = false;
    if (!res.ok) {
      status = (body.errors ?? [body.error]).join('; ');
      return;
    }
    version = body.version;
    tool = '';
    status = `Committed; now on ${body.version}. Card flagged inspected: false.`;
    await loadHistory();
  }
</script>

<div class="ed">
  <header class="ed-head">
    <a class="ed-crumb" href={EDITORS_ROUTE}>Dev editors</a>
    <h1>{name || editorId} editor</h1>
  </header>

  <section class="ed-panel ed-picker">
    <div class="ed-row">
      <div class="ed-grow ed-combo">
        <label class="ed-label" for="ed-card-search">Card</label>
        <input
          id="ed-card-search"
          type="text"
          class="card-search"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          aria-expanded={listOpen}
          aria-controls="ed-card-list"
          aria-activedescendant={listOpen && matches[active] ? `ed-card-${active}` : undefined}
          placeholder={dir || 'Search cards…'}
          value={listOpen ? query : dir}
          onfocus={openList}
          oninput={(e) => {
            query = e.currentTarget.value;
            active = 0;
            listOpen = true;
          }}
          onkeydown={onComboKey}
          onblur={() => (listOpen = false)}
        />
        {#if listOpen}
          <ul id="ed-card-list" class="card-list" role="listbox">
            {#each matches as card, i (card.dir)}
              <li
                id={`ed-card-${i}`}
                role="option"
                tabindex="-1"
                class="card-option"
                class:ed-active={i === active}
                aria-selected={card.dir === dir}
                data-dir={card.dir}
                onmousedown={(e) => e.preventDefault()}
                onmousemove={() => (active = i)}
                onclick={() => pickCard(card.dir)}
                onkeydown={() => {}}
              >
                <span>{card.dir}</span>
                {#if !card.valid}<span class="ed-note">not set up</span>{/if}
              </li>
            {:else}
              <li class="ed-empty">No cards match “{query}”.</li>
            {/each}
          </ul>
        {/if}
      </div>
      <label class="ed-check">
        <input type="checkbox" class="show-all" checked={showAll} onchange={(e) => toggleAll(e.currentTarget.checked)} />
        Show all cards
      </label>
      <button type="button" class="ed-new-toggle" aria-expanded={newOpen} onclick={() => (newOpen = !newOpen)}>+ New card</button>
    </div>
    <form class="ed-row ed-new" hidden={!newOpen} onsubmit={create}>
      <label>
        <span class="ed-label">Folder</span>
        <select class="new-folder" value={newFolder} onchange={(e) => (newFolder = e.currentTarget.value)}>
          {#each folders as folder (folder)}
            <option value={folder}>{folder}</option>
          {/each}
        </select>
      </label>
      <label class="ed-grow">
        <span class="ed-label">Title</span>
        <input type="text" class="new-title" value={newTitle} oninput={(e) => (newTitle = e.currentTarget.value)} />
      </label>
      <button type="submit" class="create ed-primary">Create</button>
    </form>
  </section>

  {#if dir}
    <section class="ed-panel ed-card">
      <div class="ed-row">
        <code class="ed-path">{dir}</code>
        <a class="page-link" href={`/card/${dir}`} target="_blank" rel="noopener">View on site ↗</a>
      </div>
      {#if version}
        <div class="version-bar ed-row">
          <span class="version">v{version}</span>
          <button type="button" class="ed-tool new-version" aria-expanded={tool === 'bump'} disabled={busy} onclick={() => toggleTool('bump')} title="Commit this version and start a new one">+</button>
          <button type="button" class="ed-tool restore-toggle" aria-expanded={tool === 'restore'} disabled={busy || history.length === 0} onclick={() => toggleTool('restore')}>Restore</button>
        </div>
        {#if tool === 'bump'}
          <div class="ed-row ed-sub bump-line">
            <span class="ed-label">Commit v{version}, then start</span>
            <span class="ed-seg">
              {#each BUMP_KINDS as kind (kind)}
                <button type="button" class={`bump-${kind}`} disabled={busy} onclick={() => bump(kind)}>{kind} <span class="ed-next">{nextVersion(kind)}</span></button>
              {/each}
            </span>
          </div>
        {:else if tool === 'restore'}
          <div class="ed-row ed-sub restore-line">
            <select class="version-picker" value={viewing} onchange={(e) => view(e.currentTarget.value)}>
              <option value="">Pick a committed version…</option>
              {#each history as entry (entry.commit)}
                <option value={entry.commit}>{entry.version} ({entry.date.slice(0, 10)})</option>
              {/each}
            </select>
            <button type="button" class="restore ed-primary" disabled={!viewing} onclick={restore}>Restore this version</button>
          </div>
        {/if}
      {/if}
    </section>
  {/if}

  {#if viewing}
    <div class="ed-readonly">
      <span>Viewing {viewingEntry?.version ?? version}{viewingEntry ? ` from ${viewingEntry.date.slice(0, 10)}` : ''}, read-only.</span>
      <button type="button" class="back-to-current" onclick={() => view('')}>back to current</button>
    </div>
  {/if}

  {#if Editor && data !== null}
    <section class="ed-panel editor-pane" class:ed-pane-readonly={viewing !== ''}>
      <Editor {data} readOnly={viewing !== ''} onChange={(next: unknown) => (data = next)} />
    </section>
  {/if}

  <footer class="ed-foot" hidden={!dir && !status}>
    <p role="status" class="ed-status">{dirty && !busy ? 'Unsaved changes.' : status}</p>
    {#if dir && !viewing}
      <button type="button" class="save ed-primary" disabled={busy} onclick={save}>Save{dirty ? ' •' : ''}</button>
    {/if}
  </footer>
</div>

<style>
  .ed {
    max-width: 52rem;
    margin: 0 auto;
    padding: var(--space-xl) var(--space-md) 0;
    display: grid;
    gap: var(--space-md);
    font-family: var(--font-ui);
    font-size: var(--font-size-prose);
  }

  .ed-head h1 {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 400;
    font-size: clamp(2rem, 5vw, 2.75rem);
    line-height: 1.1;
  }
  .ed-crumb { font-size: 0.875rem; }

  .ed-panel {
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-sm) var(--space-md);
    display: grid;
    gap: var(--space-sm);
    background: var(--color-bg);
  }

  .ed-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm) var(--space-md);
  }
  .ed-row[hidden] { display: none; }
  .ed-grow { flex: 1 1 14rem; }

  .ed-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .version-bar { gap: var(--space-xs); }
  .ed-tool[aria-expanded='true'] { background: var(--color-selected-bg); color: var(--color-selected-fg); }
  .new-version { min-width: 2.25rem; font-size: 1.125rem; line-height: 1; }
  .ed-sub { padding-top: var(--space-sm); border-top: 1px dashed var(--color-border); align-items: center; }
  .ed-sub .ed-label { display: inline; }
  .ed-next { font-family: var(--font-mono); font-weight: 400; }

  .ed-combo { position: relative; }
  .card-search { width: 100%; }
  .card-list {
    position: absolute;
    z-index: 10;
    left: 0;
    right: 0;
    top: 100%;
    max-height: min(24rem, 60vh);
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--color-bg);
    border: var(--border-width) solid var(--color-border);
    border-top-width: 0;
  }
  .card-list li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    margin: 0;
    padding: 0.3rem var(--space-sm);
    line-height: 1.35;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
  .card-option { cursor: pointer; }
  .card-option[aria-selected='true'] { font-weight: 700; }
  .card-option.ed-active { background: var(--color-selected-bg); color: var(--color-selected-fg); }
  .ed-note { font-family: var(--font-ui); font-size: 0.75rem; font-style: italic; white-space: nowrap; }
  .ed-empty { font-style: italic; }

  .ed-check {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: 2.25rem;
  }
  .ed-new-toggle { margin-left: auto; }
  .ed-new { padding-top: var(--space-sm); border-top: 1px dashed var(--color-border); }

  .ed-card .ed-row { align-items: center; justify-content: space-between; }
  .ed-card :is(.version-bar, .ed-sub) { justify-content: flex-start; }
  .ed-path { font-family: var(--font-mono); font-size: 0.9375rem; overflow-wrap: anywhere; background: none; border: 0; padding: 0; }
  .version {
    font-family: var(--font-mono);
    font-weight: 700;
    padding: 0.125rem var(--space-xs);
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
  }

  /* Joined buttons: one border between neighbours. */
  .ed-seg { display: inline-flex; }
  .ed-seg button + button { border-left-width: 0; }

  .ed-readonly {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--dither-3);
    border: var(--border-width) solid var(--color-border);
    font-weight: 600;
  }
  .ed-readonly span { background: var(--color-bg); padding: 0 var(--space-xs); }
  .ed-pane-readonly { border-style: dashed; }

  .ed-foot {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    background: var(--color-bg);
    border-top: var(--border-width) solid var(--color-border);
  }
  .ed-foot[hidden] { display: none; }
  .ed-status { margin: 0; font-size: 0.875rem; }
  .ed-foot .save { margin-left: auto; }

  /* Controls, including those inside the editor island, so every editor
     inherits the same look without styling its own. */
  /* `:is()` takes its most specific argument, so the input rule is kept apart:
     inside the :is() it would outrank `.ed-primary` on buttons. */
  .ed :global(:is(button, select, textarea)),
  .ed :global(input:not([type='checkbox'], [type='radio'])) {
    font: inherit;
    font-weight: 400;
    font-size: 0.9375rem;
    color: var(--color-text);
    background: var(--color-bg);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius);
    min-height: 2.25rem;
    padding: 0.25rem var(--space-sm);
  }
  .ed :global(button) { cursor: pointer; font-weight: 600; }
  .ed :global(button:hover:not(:disabled)) { background: var(--color-bg-hover); }
  .ed :global(button:disabled),
  .ed :global(:is(input, select, textarea):disabled) { border-style: dashed; cursor: default; }
  .ed :global(:is(button, select, input, textarea):focus-visible) {
    outline: var(--border-width) solid var(--color-text);
    outline-offset: 2px;
  }
  .ed :global(input[type='checkbox']) { accent-color: var(--color-text); width: 1.1rem; height: 1.1rem; }
  .ed .ed-primary { background: var(--color-selected-bg); color: var(--color-selected-fg); }
  .ed .ed-primary:hover:not(:disabled) { background: var(--color-selected-bg-hover); }

  /* An editor's own label/field pairs stack, label above. */
  .editor-pane :global(label) { display: grid; gap: 0.25rem; font-weight: 600; font-size: 0.875rem; }
  .editor-pane { gap: var(--space-md); }
</style>
