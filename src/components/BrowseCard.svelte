<script lang="ts">
  import type { BrowseCardData } from '../lib/browse-helpers';
  import { displayFor } from '../lib/tag-display';
  import type { TagDisplay } from '../lib/tag-display';
  import type { FilterState } from '../dimensions';
  import { computeCardTagDisplay } from '../lib/card-tag-display';
  import { computeStatusBadge } from '../lib/status-badge';
  // Shared with GenericRenderer's dateline so a card's date reads identically
  // in a listing and on the card itself — see lib/card-date.ts.
  import { formatCardDate } from '../lib/card-date';

  interface Props {
    card: BrowseCardData;
    /** Flat value -> display-name map from the tag registry (see tag-registry.ts's flattenTagDisplay), serialised in from the server. */
    tagDisplay?: Record<string, TagDisplay>;
    /** Active filter selections — drives which tags are hidden/highlighted. */
    filterState?: FilterState;
    /**
     * This preview is the card you're already looking at (a series strip
     * includes the open card). Renders as a marked, non-navigating tile:
     * linking to where you already are is a dead click.
     */
    current?: boolean;
  }

  let { card, tagDisplay = {}, filterState = { }, current = false }: Props = $props();

  const tagChips = $derived(
    computeCardTagDisplay(card.tags, filterState, 4, tag => displayFor(tag, tagDisplay).name),
  );
  // Dev-only status pill (issue #51) — same pure decision as the open-card
  // header (CardHeader.astro). import.meta.env.DEV is the thin gate at the
  // template `{#if}` below, not here, so this stays a plain derivation.
  const statusBadge = $derived(computeStatusBadge(card.status, card.date ? new Date(card.date) : undefined));
</script>

<li class="browse-card-item" class:browse-card-item--current={current}>
  <!-- A real anchor: keyboard-focusable and cmd/middle-clickable. The delegated
       data-push-card handler in CardStack.svelte intercepts left-clicks and
       preventDefaults, doing the in-stack push instead of a full navigation.
       The current card renders the same tile as a plain element instead — no
       href and no data-push-card, so there is nothing to click or tab to. -->
  <svelte:element
    this={current ? 'div' : 'a'}
    class="browse-card-link"
    href={current ? undefined : `/card/${card.uid}`}
    data-push-card={current ? undefined : card.uid}
    aria-current={current ? 'true' : undefined}
  >
    {#if card.thumb && card.thumbKind === 'video'}
      <!-- No frame grab is generated for a video header — preload="metadata"
           gets the browser to paint the first frame for free, same as
           ImageGallery's video tiles. -->
      <video class="browse-card-thumb" src={card.thumb} muted preload="metadata"></video>
    {:else if card.thumb}
      <img
        class="browse-card-thumb"
        src={card.thumb}
        srcset={card.thumbSrcset}
        sizes="(max-width: 700px) 100vw, 300px"
        alt=""
        loading="lazy"
        onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
      />
    {/if}
    <div class="browse-card-content">
    <div class="browse-card-header">
      <p class="browse-card-title">
        {card.title}
        {#if card.collapsed}
          <span class="browse-card-badge">{card.collapsed.count} parts</span>
        {/if}
      </p>
      <span class="browse-card-header-meta">
        {#if import.meta.env.DEV && statusBadge}
          <span class="status-badge status-badge--{statusBadge.status}">
            {statusBadge.label}{statusBadge.dateLabel ? ` · ${statusBadge.dateLabel}` : ''}
          </span>
        {/if}
        {#if card.date}
          <time
            class="browse-card-date"
            datetime={new Date(card.date).toISOString()}
          >
            {formatCardDate(new Date(card.date))}
          </time>
        {/if}
      </span>
    </div>
    {#if card.description}
      <p class="browse-card-desc">{card.description}</p>
    {/if}
    {#if tagChips.tags.length > 0 || tagChips.overflow > 0}
      <ul class="browse-card-tags" aria-label="Tags">
        {#each tagChips.tags as chip}
          <li class="browse-card-tag" class:browse-card-tag--active={chip.active}>
            {displayFor(chip.value, tagDisplay).name}
          </li>
        {/each}
        {#if tagChips.overflow > 0}
          <li class="browse-card-tag browse-card-tag-overflow">+{tagChips.overflow}</li>
        {/if}
      </ul>
    {/if}
    </div>
  </svelte:element>
</li>

<style>
  .browse-card-item {
    border: var(--border-width) solid var(--color-border);
    background: var(--color-surface);
    transition: background 0.1s;
    /* Clip the bled-out thumbnail banner to the card's border box. */
    overflow: hidden;
  }

  .browse-card-item:hover {
    background: var(--color-bg-hover);
  }

  .browse-card-link {
    display: block;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  /* "You are here": the page inverted, same as any other selected control —
     see the --color-selected-* table in CLAUDE.md. The text stroke has to be
     restated because it is inherited and paper-coloured, which fattens glyphs
     on an inverted surface instead of clearing dots behind them. */
  .browse-card-item--current,
  .browse-card-item--current:hover {
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
    -webkit-text-stroke-color: var(--color-selected-bg);
  }

  .browse-card-item--current .browse-card-link {
    cursor: default;
  }

  /* The mirror of every muted rule in this component. --color-text-muted is an
     alias of the ink, so on the inverted surface the date, the summary and the
     tag chips would all be ink on ink — invisible. The chips carry the
     inversion through: paper text and border on the ink fill. */
  .browse-card-item--current .browse-card-date,
  .browse-card-item--current .browse-card-desc,
  .browse-card-item--current .browse-card-badge,
  .browse-card-item--current .browse-card-tag {
    color: var(--color-selected-fg);
  }

  .browse-card-item--current .browse-card-tag {
    border-color: var(--color-selected-fg);
    background: var(--color-selected-bg);
  }

  .browse-card-link:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: -2px;
  }

  /* Full-bleed banner: a direct child of the (unpadded) link, so it spans the
     whole card. max-width:none defeats the reset's `img { max-width: 100% }`. */
  .browse-card-thumb {
    display: block;
    width: 100%;
    max-width: none;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: var(--color-bg-stripes);
  }

  .browse-card-content {
    padding: var(--space-md);
  }

  .browse-card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
    /* The meta group (status badge + date) can be wider than the title's
       leftover space at the ~280px tile width (e.g. "Scheduled · 1 Aug
       2027") — wrapping drops it to its own line instead of overflowing
       the card, since neither child shrinks (see .browse-card-header-meta). */
    flex-wrap: wrap;
  }

  .browse-card-title {
    font-family: var(--font-heading);
    font-size: 1rem;
    margin: 0;
  }

  .browse-card-badge {
    display: inline-block;
    vertical-align: middle;
    margin-left: var(--space-xs);
    font-family: var(--font-ui);
    font-size: 0.65rem;
    font-weight: normal;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-bg-stripes);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .browse-card-header-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-shrink: 0;
    /* Keeps the meta group right-aligned whether it shares the title's line
       or wraps to its own (see .browse-card-header's flex-wrap). */
    margin-left: auto;
  }

  .browse-card-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .browse-card-desc {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-xs);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .browse-card-tags {
    list-style: none;
    margin: var(--space-xs) 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  /* Solid backing so the card's hover dither doesn't overpower these small
     chips. Uses the card's own rest background, so it's invisible until the
     dither appears behind it. The inherited .browse-card-item text-stroke is
     switched off: the opaque chip already does that job, and at this size a
     3px stroke would reach past the 1px vertical padding and eat into the
     chip's own border. */
  .browse-card-tag {
    font-size: 0.7rem;
    font-family: var(--font-ui);
    padding: 1px 6px;
    border: 1px solid var(--color-border-light);
    color: var(--color-text-muted);
    background: var(--color-surface);
    -webkit-text-stroke-width: 0;
  }

  /* An OR-matched tag (dimension with >1 active selection): stands out so the
     reader can see which branch this card matched. */
  .browse-card-tag--active {
    background: var(--color-tag-active-bg);
    border-color: var(--color-tag-active-border);
    color: var(--color-text);
  }

  .browse-card-tag-overflow {
    border-style: dashed;
  }
</style>
