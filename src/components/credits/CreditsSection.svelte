<script lang="ts">
  import type { MadeByLine, CreditListingSection } from '@content/credits/credits';

  let { line, listing }: { line: MadeByLine; listing: CreditListingSection[] } = $props();

  const text = $derived(
    'count' in line
      ? `${line.count} people`
      : line.names.length < 2
        ? line.names.join('')
        : `${line.names.slice(0, -1).join(', ')} and ${line.names[line.names.length - 1]}`,
  );

  let open = $state(false);
  let by: HTMLButtonElement;

  function onPanelKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    open = false;
    by.focus();
  }
</script>

<section class="credits">
  <button type="button" class="credits-by" bind:this={by} aria-expanded={open} onclick={() => (open = !open)}>made by {text}</button>
  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -- Esc is a shortcut on a focusable (tabindex -1) region; the toggle button is the real control -->
    <div class="credits-panel" role="group" aria-label="Full credits" tabindex="-1" onkeydown={onPanelKeydown}>
      <div class="credits-listing">
        {#each listing as section}
          <div class="credits-listing-section">
            {#if section.heading}<h3>{section.heading}</h3>{/if}
            <dl>
              {#each section.rows as row}
                {#if row.role}<dt>{row.role}</dt>{/if}
                {#each row.entries as entry}
                  <dd>
                    <span class="credits-listing-name">{entry.name}</span>
                    {#if entry.note}<span class="credits-note">{entry.note}</span>{/if}
                  </dd>
                {/each}
              {/each}
            </dl>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .credits {
    margin: var(--space-md) 0;
    padding: var(--space-sm) 0;
    text-align: center;
    border-top: var(--border-width) solid var(--color-border-light);
  }
  .credits-by {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0.2rem 0;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 4px;
  }
  .credits-by:focus-visible { text-decoration-style: solid; }
  @media (hover: hover) { .credits-by:hover { text-decoration-style: solid; } }
  .credits-panel {
    padding: var(--space-sm) 0;
    text-align: left;
    outline: none;
  }
  .credits-listing { columns: 16rem; column-gap: var(--space-lg); }
  .credits-listing-section { break-inside: avoid; margin-bottom: var(--space-md); }
  .credits-listing-section h3 { font-size: 1rem; margin: 0 0 0.2rem; }
  .credits-listing-section dl { margin: 0; }
  .credits-listing-section dt { color: var(--color-text-muted); font-size: 0.85rem; }
  .credits-listing-section dd { margin: 0 0 0.3rem; }
  .credits-note { color: var(--color-text-muted); font-size: 0.9em; }
</style>
