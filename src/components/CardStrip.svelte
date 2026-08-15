<script lang="ts">
  // A horizontal, clipped run of card previews with its own scrollbar.
  //
  // Same preview as everywhere else — BrowseCard — only the container differs:
  // BrowseResults lays cards out as a wrapping grid (a lens browsing hundreds),
  // this lays them out as one scrolling row (a card body's short related set,
  // which shouldn't grow the page vertically).
  //
  // The native scrollbar is hidden in favour of a control row: an arrow pinned
  // to each end with a custom scrollbar between them. That buys a track tall
  // enough to hit comfortably, and room to show a dot per card behind the thumb
  // so the whole set is legible at a glance. The track is therefore narrower
  // than the scrollable area, which is why every position is computed as a
  // percentage rather than in pixels.
  //
  // All the geometry is decided in src/lib/card-strip.ts; this file measures,
  // applies, and handles pointers.
  import type { BrowseCardData } from '../lib/browse-helpers';
  import type { TagDisplay } from '../lib/tag-display';
  import {
    computeStripDots,
    computeStripOverflow,
    computeThumbGeometry,
    scrollLeftForCard,
    scrollLeftForFraction,
    stripScrollStep,
    type CardExtent,
    type StripMetrics,
  } from '../lib/card-strip';
  import BrowseCard from './BrowseCard.svelte';

  interface Props {
    cards: BrowseCardData[];
    tagDisplay?: Record<string, TagDisplay>;
    /** Accessible name for the strip's scroll region. */
    label?: string;
    /**
     * uid of the card the reader is already on, when the strip includes it (a
     * series strip does). It renders as a non-navigating tile and the strip
     * opens scrolled to it.
     */
    currentUid?: string;
  }

  let { cards, tagDisplay = {}, label = 'Cards', currentUid }: Props = $props();

  // role="scrollbar" requires aria-controls naming the region it scrolls, and a
  // page can hold several strips (a series run plus "Cards about this"), so the
  // id has to be per-instance. $props.id() is the one generator that yields the
  // same value on the server and on hydration — crypto.randomUUID() would not.
  const scrollerId = $props.id();

  const currentIndex = $derived(currentUid ? cards.findIndex(c => c.uid === currentUid) : -1);

  let scroller = $state<HTMLElement | null>(null);
  let track = $state<HTMLElement | null>(null);
  let metrics = $state<StripMetrics>({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  let extents = $state<CardExtent[]>([]);

  const overflow = $derived(computeStripOverflow(metrics));
  const thumb = $derived(computeThumbGeometry(metrics));
  const dots = $derived(computeStripDots(extents, metrics));
  const overflowing = $derived(overflow.canScrollBack || overflow.canScrollOn);

  function measure() {
    if (!scroller) return;
    const { scrollLeft, scrollWidth, clientWidth } = scroller;
    metrics = { scrollLeft, scrollWidth, clientWidth };
    // Card extents are read from layout rather than derived from a card width:
    // the cards are natural-height/fixed-width flex items, and the scroller
    // carries inline padding, so offsetLeft is the only honest source.
    extents = [...scroller.children].map(child => {
      const el = child as HTMLElement;
      return { start: el.offsetLeft, end: el.offsetLeft + el.offsetWidth };
    });
  }

  function page(direction: -1 | 1) {
    if (!scroller) return;
    scroller.scrollBy({ left: direction * stripScrollStep(scroller.clientWidth), behavior: 'smooth' });
  }

  /** Scroll so the thumb's left edge lands at `fraction` of the track. */
  function scrollToFraction(fraction: number, smooth = false) {
    if (!scroller) return;
    scroller.scrollTo({
      left: scrollLeftForFraction(fraction, metrics),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  // Grab offset within the thumb, as a track fraction — without it the thumb
  // jumps so its left edge meets the pointer on the first move.
  let grabOffset = 0;

  function onTrackPointerDown(event: PointerEvent) {
    if (!track || !overflowing) return;
    const rect = track.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    const thumbStart = thumb.leftPct / 100;
    const thumbEnd = (thumb.leftPct + thumb.widthPct) / 100;

    if (fraction >= thumbStart && fraction <= thumbEnd) {
      grabOffset = fraction - thumbStart;
    } else {
      // Clicked the bare track: centre the thumb on the click.
      grabOffset = thumb.widthPct / 200;
      scrollToFraction(fraction - grabOffset, true);
    }
    track.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onTrackPointerMove(event: PointerEvent) {
    if (!track || !track.hasPointerCapture(event.pointerId)) return;
    const rect = track.getBoundingClientRect();
    scrollToFraction((event.clientX - rect.left) / rect.width - grabOffset);
  }

  function onTrackPointerUp(event: PointerEvent) {
    track?.releasePointerCapture(event.pointerId);
  }

  function onTrackKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') page(-1);
    else if (event.key === 'ArrowRight') page(1);
    else if (event.key === 'Home') scrollToFraction(0, true);
    else if (event.key === 'End') scrollToFraction(1, true);
    else return;
    event.preventDefault();
  }

  // Open on the current card. Deliberately once and only at mount: a later
  // resize must not yank the strip back after the reader has scrolled away.
  //
  // One frame late, and re-measuring first, because the geometry it centres on
  // is read from layout — measured during the same tick as mount, the flex
  // children have no widths yet, the strip doesn't overflow, and the clamp in
  // scrollLeftForCard correctly resolves that to 0.
  let openedOnCurrent = false;
  function openOnCurrent() {
    if (openedOnCurrent || !scroller || currentIndex < 0) return;
    openedOnCurrent = true;
    requestAnimationFrame(() => {
      if (!scroller) return;
      measure();
      scroller.scrollTo({ left: scrollLeftForCard(extents, currentIndex, metrics), behavior: 'auto' });
    });
  }

  // ResizeObserver as well as scroll: overflow, thumb size and card extents all
  // change when the card is resized (stack layout, viewport) with no scrolling.
  $effect(() => {
    if (!scroller) return;
    measure();
    openOnCurrent();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    return () => observer.disconnect();
  });
</script>

<div class="card-strip">
  <ul
    id={scrollerId}
    class="card-strip-track"
    aria-label={label}
    bind:this={scroller}
    onscroll={measure}
  >
    {#each cards as card (card.uid)}
      <BrowseCard {card} {tagDisplay} current={card.uid === currentUid} />
    {/each}
  </ul>

  {#if overflowing}
    <div class="card-strip-controls">
      <button
        type="button"
        class="card-strip-button"
        aria-label="Scroll back"
        disabled={!overflow.canScrollBack}
        onclick={() => page(-1)}
      >‹</button>

      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <div
        class="card-strip-bar"
        bind:this={track}
        role="scrollbar"
        tabindex="0"
        aria-label="{label} scrollbar"
        aria-controls={scrollerId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(thumb.leftPct)}
        onpointerdown={onTrackPointerDown}
        onpointermove={onTrackPointerMove}
        onpointerup={onTrackPointerUp}
        onpointercancel={onTrackPointerUp}
        onkeydown={onTrackKeyDown}
      >
        <!-- One dot per card, in the same percentage space as the thumb, so the
             thumb passes over exactly the dots whose cards are on screen. -->
        {#each dots as dot, i (i)}
          <span class="card-strip-dot" style:left="{dot.leftPct}%"></span>
        {/each}
        <span
          class="card-strip-thumb"
          style:left="{thumb.leftPct}%"
          style:width="{thumb.widthPct}%"
        ></span>
      </div>

      <button
        type="button"
        class="card-strip-button"
        aria-label="Scroll forward"
        disabled={!overflow.canScrollOn}
        onclick={() => page(1)}
      >›</button>
    </div>
  {/if}
</div>

<style>
  .card-strip {
    position: relative;
  }

  .card-strip-track {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    /* Flex, not a one-row grid: grid stretches every card to the tallest in the
       row, which left short previews trailing dead space. */
    align-items: flex-start;
    gap: var(--space-md);
    overflow-x: auto;
    scroll-snap-type: x proximity;
    /* Bleed to the card's edges (cancelling the body inset, then re-inserting
       it as padding so the first card still lines up with the prose). Without
       this the clip lands in the gutter between two cards and reads as "that's
       all there is" — the point of a clipped strip is a card visibly cut off. */
    margin-inline: calc(-1 * var(--body-inset-inline, 0px));
    padding-inline: var(--body-inset-inline, 0px);
    scroll-padding-inline: var(--body-inset-inline, 0px);
    /* The control row below IS the scrollbar — a native one underneath it would
       be a second, redundant control. */
    scrollbar-width: none;
  }

  .card-strip-track::-webkit-scrollbar {
    display: none;
  }

  /* Fixed width, natural height. Cards are the same width they'd be in the
     browse grid, so a preview looks identical whichever container holds it. */
  .card-strip-track > :global(.browse-card-item) {
    flex: 0 0 auto;
    width: min(280px, 80%);
    scroll-snap-align: start;
    margin: 0;
  }

  /* Arrows pinned to the ends, scrollbar taking the space between. */
  .card-strip-controls {
    display: flex;
    align-items: stretch;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .card-strip-button {
    flex: 0 0 auto;
    font-family: var(--font-ui);
    font-size: 1rem;
    line-height: 1;
    background: var(--color-bg);
    color: var(--color-text);
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-xs) var(--space-sm);
    cursor: pointer;
  }

  .card-strip-button:hover:not(:disabled) {
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
    /* Inherited stroke is paper-coloured, which fattens paper glyphs on an
       inverted surface instead of clearing dots behind them. */
    -webkit-text-stroke-color: var(--color-selected-bg);
  }

  .card-strip-button:disabled {
    cursor: default;
    /* No opacity — the palette has no grey. Disabled reads as an unfilled
       outline against the hover fill. */
    border-color: var(--color-border-light);
  }

  .card-strip-bar {
    flex: 1 1 auto;
    position: relative;
    /* Full height of the control row rather than a hairline: the whole band is
       the hit target, which is the point of replacing the native scrollbar. */
    border: var(--border-width) solid var(--color-border-light);
    cursor: pointer;
    touch-action: none;
    overflow: hidden;
  }

  .card-strip-bar:focus-visible {
    outline: 2px solid var(--color-text);
    outline-offset: 2px;
  }

  /* An ink disc inside a paper ring. Carrying both colours means the dot reads
     against the bare track AND against the solid-ink thumb without changing
     appearance — so nothing has to know whether it is currently covered, and
     "which cards are in view" is told purely by which dots the thumb is over. */
  .card-strip-dot {
    position: absolute;
    top: 50%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-text);
    box-shadow: 0 0 0 3px var(--color-bg);
    /* Centre the dot on its card's midpoint. */
    transform: translate(-50%, -50%);
    /* Above the thumb, not behind it — a dot painted underneath solid ink would
       simply disappear. */
    z-index: 1;
  }

  /* An ordinary moving box. It carries a dither and moves every frame while
     scrolling, which is exactly the case that used to shimmer — the dot grid is
     viewport-anchored now (background-attachment: fixed, see gen-dither.mjs), so
     the pattern stays put and only this element's window onto it moves. */
  .card-strip-thumb {
    position: absolute;
    top: 0;
    bottom: 0;
    /* A few steps down from solid ink (L16): the thumb is a passive indicator,
       not a selected control, so it shouldn't wear the full selected fill. It
       still reads as a solid block against the bare track and keeps enough
       contrast for the dots' paper rings to cut through it. */
    background: var(--dither-6);
    /* The bar itself owns the pointer handling, including drags that start on
       the thumb — see onTrackPointerDown. */
    pointer-events: none;
  }
</style>
