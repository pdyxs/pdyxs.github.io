<script lang="ts">
  // Dev-only "open in editor" link for the active card, shown when the card's
  // index.json belongs to a registered editor. Sits above "mark inspected" in
  // the dev dock. Asks the dev server rather than reading the page, so the
  // card's own file is the only record of which editor owns it.
  import { stackStore } from '../../stores/card-stack-store.ts';
  import { editorUrl } from './routes.ts';

  const activeSlot = $derived($stackStore.activeSlot);
  let editor = $state<string | null>(null);

  $effect(() => {
    const slot = activeSlot;
    editor = null;
    if (!slot) return;
    let stale = false;
    fetch(`/__dev-editors/editor-for?dir=${encodeURIComponent(slot)}`)
      .then((res) => (res.ok ? res.json() : { editor: null }))
      .then((body: { editor: string | null }) => {
        if (!stale) editor = body.editor ?? null;
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  });
</script>

{#if activeSlot && editor}
  <a class="open-in-editor" href={editorUrl(editor, activeSlot)}>Open in editor</a>
{/if}

<style>
  .open-in-editor {
    order: 1;
    padding: 0.5rem 0.9rem;
    font: inherit;
    color: var(--color-text);
    background: var(--color-bg);
    border: var(--border-width) solid var(--color-border);
    text-decoration: none;
  }
  .open-in-editor:hover {
    background: var(--color-bg-hover);
  }
</style>
