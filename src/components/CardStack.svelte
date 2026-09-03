<script lang="ts">
  import { onMount, tick, untrack, flushSync } from 'svelte';
  import type { Snippet } from 'svelte';
  import { get } from 'svelte/store';
  import { stackStore, seedStackState, pushToStack, activateCard as activateCardFn, replaceActiveSlot, rekeyEntry } from '../stores/card-stack-store';
  import { cardEntry, lensEntry, locationKind, presentationMode, withFreeSlot, slotForKey, entryForSlot, activeEntry, planPush } from '../lib/stack-layout';
  import type { LocationEntry, StackState } from '../lib/stack-layout';
  import { geometryFor, scrollTargetFor, STACK_GEOMETRY } from '../lib/stack-geometry';
  import { scrollBehaviourFor, scrollSettleAction, transitionWillFire, widthTransitionOf, SCROLL_SETTLE_TIMEOUT_MS, STACK_RESIZING_ATTR } from '../lib/stack-motion';
  import { filtersForKey, isLensUid, lensNameForKey, splitLocationParams } from '../lib/lens-key';
  import { lensFilterStore, lensFiltersSynced } from '../stores/lens-filter-store';
  import { filterStateFromParams } from '../dimensions';
  import { serialiseStack, deserialiseStack, locationParamsFromSearch } from '../lib/stack-codec';
  import type { ParamPairs } from '../lib/stack-codec';
  import { paramsAfterSlotReplace } from '../lib/slot-params';
  import { manifestLookup } from '../lib/stack-manifest-client';
  import { tagManifestLookup } from '../lib/tag-manifest-client';
  import { parseCollectionLink } from '../lib/collection-link';
  import { stackFromParams } from '../lib/browse-stack';
  import { filterUrlForTagValue } from '../dimensions';
  import { hasAnyViewState, markRead, readToRecord } from '../lib/card-view-state';
  import { getLensDefinition } from '../lib/lens-registry';
  import {
    applyFiltersPending,
    clearFiltersPending,
    filtersPendingForTransition,
    hasFilterParamKey,
  } from '../lib/filters-pending';
  import { placeholderTitle } from '../lib/card-title';
  import { lensChromeForKey } from '../lib/lens-chrome';
  import { waitForTransition } from '../lib/transition-wait';
  import StackFragment from './StackFragment.svelte';
  import {
    createCardFragments,
    titleOfElement,
    uidToFetchUrl,
    urlToUid,
  } from '../lib/card-fragments';

  interface Props {
    activeUid?: string;
    /**
     * The active location's declared width, handed down by the route rather
     * than parsed out of its markup — see `initialWidth` below.
     */
    initialWidth?: string;
    /**
     * The SSR-rendered active location, as Astro SLOT content (issue #121).
     *
     * It used to arrive as an `activeHtml` string prop, which Astro serialised
     * into the island's `props` attribute — shipping the whole card twice, the
     * nested islands' own props included (757 KB of a 1.53 MB lens page). Slot
     * content is emitted as real DOM inside `<astro-slot>` and never enters
     * `props`.
     *
     * Its DOM must be hydration-ADOPTED, never re-created: `LensFilterShell`
     * and `BrowseLensBrowser` are nested `<astro-island>` elements inside it,
     * and a re-created subtree silently never hydrates. That is why this is a
     * snippet rendered in place and not a string read back at mount — Svelte 5
     * discards an `{@html}` range whose client value differs from the server's
     * (measured, issue #120).
     */
    children?: Snippet;
  }

  let { activeUid, initialWidth, children }: Props = $props();

  // Every fragment the stack renders, and every fact read out of one, lives in
  // this module (issue #97) — the component holds no HTML parsing of its own.
  // Keyed by LocationEntry.key (== uid for card locations, see stack-layout.ts).
  //
  // `onChange` is why no call site has to know that the cache triggers no
  // reactivity: a fragment landing for the *active* location (the placeholder→
  // real-content swap is the case that happens after the store already moved)
  // reapplies its declared width here, rather than pushCard remembering to.
  const fragments = createCardFragments({
    onChange: (slot) => {
      const state = get(stackStore);
      if (slot === state.activeSlot) applyMaxWidth(slot);
    },
  });
  // Per-location *side* params, keyed by identity key and stored as ordered
  // pairs so repeated keys survive the round-trip through serialiseStack —
  // a plain Record would collapse repeats.
  //
  // A lens's filter selection is NOT here (issue #100): filters are what a lens
  // location *is*, so they ride in its key. This map holds only params that a
  // location merely carries — a card's `tab=bio`, the browse page's `stack=`.
  // `splitLocationParams` is the one decision about which is which.
  let cardParams = new Map<string, ParamPairs>();
  // Keys to skip body-open in $effect during VT push (body opens after vt.finished)
  let skipBodyOpen = new Set<string>();
  // Pushes that have allocated a slot but not yet appended it (issue #112).
  // `pushCard` awaits before it mutates the store, so for that window the store
  // is not the whole truth about which slots are taken — these are the rest.
  // `planPush` reads both; this is only the bookkeeping, held here because the
  // component owns every stack mutation and therefore owns their lifetimes too.
  let pendingPushes: LocationEntry[] = [];
  // The one measured input to the geometry. Every card is the width of the
  // active one, and the ahead fan is placed off that width — but the width is
  // a CSS decision (`--stack-card-width`: the declared --max-width, capped by
  // what the viewport has left after both fans), so JS reads it rather than
  // re-deriving the formula and owning a second copy of it.
  //
  // No feedback loop: the slot counts the width is computed FROM depend only on
  // stack length and active index, never on the width itself.
  let innerEl = $state<HTMLElement | null>(null);
  let activeWidth = $state(0);
  let startVT: ((cb: () => void) => { finished: Promise<void> }) | undefined;
  // True while the stack is being RECONSTRUCTED rather than navigated — a cold
  // load or a popstate. Both splice entries in one fetch at a time, and every
  // splice ahead of the active card moves it down the page, so each one wants
  // a correcting scroll that must not be animated. See scrollBehaviourFor.
  let rebuilding = true;
  // The last stack shape we scrolled for. A store change is not by itself a
  // navigation: re-keying a lens when its filters change leaves the visitor
  // exactly where they were standing, and yanking the viewport for a filter
  // toggle is worse than not scrolling at all. Active slot plus depth is what
  // actually moves the active card — depth because an entry spliced in AHEAD
  // of it (initFromUrl's `from` restore) pushes it down without changing which
  // location is active.
  let lastScrollSignature: string | null = null;
  // UIDs from the browse-page `stack` URL param, consumed on the first card push
  let pendingBrowseStack: string[] = [];

  // Seed store from SSR prop once at mount — untrack to silence reactive-capture warning.
  //
  // The write is UNCONDITIONAL (issue #102). `stackStore` is module-level and
  // `astro build` prerenders every page in one process, so a render that seeds
  // nothing does not start empty — it inherits whatever the previous page's
  // render left behind. The home page, which has neither prop, was the one that
  // inherited. Every render therefore states its own initial stack, and a render
  // with no active location states the empty one; `seedStackState` is that
  // decision.
  //
  // The fragment CACHE is no longer seeded here: the markup is slot content, so
  // there is no string at init. It is adopted from the DOM in `onMount`
  // instead (`fragments.adopt`), which is the earliest point the nodes are
  // certainly there and still the latest point that is safe.
  const ssrSlot: string | null = untrack(() => {
    let entry: LocationEntry | null = null;
    if (activeUid && children) {
      // A lens cold-loaded with `?filter.…` is *that filtered location*, not the
      // bare lens that happens to have a query string beside it — so the entry
      // is built from the URL, not from the uid alone (issue #100).
      const search = typeof window === 'undefined' ? '' : window.location.search;
      entry = locationEntryFor(activeUid, paramsFromSearch(search));
    }
    stackStore.set(seedStackState(entry));
    // Which entry renders the slot content — a plain const, because it never
    // changes. Identical on both sides of hydration: the filters differ
    // between server (no query string) and client, but they ride in the KEY,
    // and a first allocation's slot is always its uid.
    return entry?.slot ?? null;
  });

  // Per-location responsive width (issue #27) is now a PROP, `initialWidth`.
  // It used to be read out of the SSR fragment string during init
  // (`extractLocationWidth(activeHtml)`); there is no such string any more, so
  // the two routes that already know the value — `card.width` / `lens.width`,
  // the very values that become `data-width` on the fragment — pass it down.
  // Rendered as a static inline style below so the correct --max-width is in
  // the very first paint, before hydration; the $effect further down keeps it
  // in sync as the stack changes thereafter.

  const geometry = $derived(geometryFor($stackStore, { ...STACK_GEOMETRY, activeWidth }));
  const hasCards = $derived($stackStore.entries.length > 0);

  // `--stack-card-width` is a CSS `min()` of the declared width and what the
  // viewport has left; this is the only way back out of CSS into the numbers
  // the ahead fan is measured off. A ResizeObserver rather than a read in the
  // layout effect: the width also changes on a plain window resize, which the
  // store knows nothing about.
  $effect(() => {
    const el = innerEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      activeWidth = e.contentRect.width;
      // `--stack-height` caps the sticky pile label so a stack shorter than the
      // viewport doesn't get a 100vh child forcing its own height. Guarded on
      // a real measurement: at mobile `.card-stack-inner` is `display:
      // contents` and measures 0, and a 0px cap would collapse the label.
      if (e.contentRect.height > 0) {
        document.getElementById('card-stack')
          ?.style.setProperty('--stack-height', `${e.contentRect.height}px`);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // The active location's declared width overrides --max-width for the whole
  // stack column (card mode's border-box and page mode's content + divider
  // width both derive from the same var — see global.css). No declared width
  // → remove the override and fall back to the :root default.
  //
  // Set on <html> rather than #card-stack: .site-footer (outside #card-stack,
  // a sibling in Base.astro) also reads --max-width so its divider line
  // stays the same width as the active card's — a descendant-only override
  // on #card-stack wouldn't reach that sibling.
  //
  // Called from two places, and neither is a call site's problem to remember:
  // the layout $effect below (whenever the store changes) and the fragment
  // store's `onChange` (whenever a fragment lands for the location that is
  // already active — pushCard's placeholder→real-content swap). See
  // card-fragments.ts for why the cache itself is not reactive.
  //
  // Written to BOTH <html> and #card-stack, and that is not redundant. The
  // server renders #card-stack with the *initial* location's width as an inline
  // style (see `initialWidth` below) so the first paint is correct before
  // hydration. An inline style on #card-stack beats an inherited value from
  // <html> for everything inside it — so a card pushed on top of, say, the
  // browse lens (960px) would keep wearing the lens's width no matter what this
  // wrote to <html>. Setting the element too replaces that stale SSR value
  // rather than leaving it to shadow every later navigation.
  function applyMaxWidth(activeSlot: string | null) {
    // The island is server-rendered too, and the fragment store's onChange can
    // fire there (the SSR seed above is a write). There is no document to apply
    // anything to on that pass — the first paint gets its width from the
    // `initialWidth` inline style instead.
    if (typeof document === 'undefined') return;
    // The `?? initialWidth` is the one window this covers, and it is real: the
    // fragment cache is seeded from the DOM in onMount, which runs AFTER the
    // layout effect's first pass. Without the fallback that first pass would
    // find no width for the SSR location and REMOVE the server-rendered inline
    // style — a wide lens (browse is 960px) snapping to the 680px default for
    // a frame on every cold load. Same value either way: the prop is what
    // became the fragment's own `data-width`.
    const width = activeSlot
      ? (fragments.factsFor(activeSlot).width ?? (activeSlot === ssrSlot ? initialWidth : undefined))
      : undefined;
    const stackEl = document.getElementById('card-stack');
    if (width) {
      document.documentElement.style.setProperty('--max-width', width);
      stackEl?.style.setProperty('--max-width', width);
    } else {
      document.documentElement.style.removeProperty('--max-width');
      stackEl?.style.removeProperty('--max-width');
    }
  }

  // The whole of the layout: one pure placement (`geometryFor`) written onto
  // persistent nodes as custom properties, and nothing else. There is no
  // `matchMedia` here and there must never be — the applier writes all five
  // geometry properties at both breakpoints and the CSS decides what to
  // consume. Desktop reads all of them; mobile reads only `--card-surface` and
  // stays in flow, which is why "mobile shows every collapsed header" is what
  // falls out rather than something to build (issue #109).
  $effect(() => {
    const stackEl = document.getElementById('card-stack');
    // The fans' widths, so CSS can subtract them from the viewport. Unitless
    // counts, not lengths: `--spine-width` is the length, declared once.
    stackEl?.style.setProperty('--behind-slots', String(geometry.behindSlots));
    stackEl?.style.setProperty('--ahead-slots', String(geometry.aheadSlots));
    // The VERTICAL reservation, and deliberately not the same numbers. A piled
    // card shares its slot's `left` but keeps climbing in `top`, so each fan
    // reaches further up/down than it does sideways.
    stackEl?.style.setProperty('--behind-rows', String(geometry.behindRows));
    stackEl?.style.setProperty('--ahead-rows', String(geometry.aheadRows));
    // The two settled lengths CSS needs, sourced from the same const the
    // placement was computed with rather than restated in the stylesheet.
    stackEl?.style.setProperty('--spine-width', `${STACK_GEOMETRY.collapsedWidth}px`);
    stackEl?.style.setProperty('--stack-stagger', `${STACK_GEOMETRY.stagger}px`);
    applyMaxWidth($stackStore.activeSlot);

    syncLensFilters(activeEntry($stackStore)?.key ?? null);

    const depth = $stackStore.entries.length;
    for (const card of geometry.cards) {
      const el = elFor(card.slot);
      if (!el) continue;
      const isActive = card.role === 'active';
      el.classList.toggle('stack-card--active', isActive);
      el.classList.toggle('stack-card--collapsed', !isActive);
      // Chrome is a pure function of stack position: a lens that is the sole
      // entry renders page-mode chrome, everything else card-mode.
      el.classList.toggle('stack-card--page', presentationMode(locationKind(card.slot), depth) === 'page');
      el.style.setProperty('--geo-left', `${card.left}px`);
      el.style.setProperty('--geo-top', `${card.top}px`);
      el.style.setProperty('--geo-z', String(card.z));
      el.style.setProperty('--geo-extra-height', `${card.extraHeight}px`);
      // CSS cannot index a token by number, so the level is resolved to the
      // token reference here. The +2 hover step is the flat-surface convention
      // (L0 → L2, L2 → L4) carried onto a ramp whose resting level varies per
      // card — a fixed hover level would read as a jump on half the stack.
      el.style.setProperty('--card-surface', `var(--dither-${card.dither})`);
      el.style.setProperty('--card-surface-hover', `var(--dither-${Math.min(16, card.dither + 2)})`);
      el.dataset.role = card.role;
      // A lens states its filters in its own name (see applyLensTitle). Here
      // because the layout effect is the store→DOM applier, and a re-key — what
      // a filter toggle does to the active lens — is a store change like any
      // other.
      applyLensTitle(card.slot);
      if (card.piled) el.dataset.piled = ''; else delete el.dataset.piled;
      const bw = el.querySelector<HTMLElement>('.body-wrapper');
      // A collapsed body is hidden but still LAID OUT — cropped by the spine on
      // desktop, `0fr` inside `overflow: hidden` on mobile — and neither takes
      // it out of the tab order or the accessibility tree the way the deleted
      // `display: none` did. Without this, tabbing off the active card walks
      // into every browse-card button and filter chip of the lens behind it.
      // On the wrapper, not the card: the header and spine must stay clickable,
      // since clicking them is how a collapsed card is re-activated.
      if (bw) bw.inert = !isActive;
      // EVERY card, unconditionally. Desktop collapse is a crop — a covered
      // card's body stays open and is occluded by the spine in front of it —
      // while mobile collapses by reflow. The island cannot tell the two apart
      // without the banned breakpoint detection, so the mobile block carries
      // `.stack-card--collapsed .body-wrapper.open { grid-template-rows: 0fr }`
      // instead. During a VT push the open is deferred until vt.finished.
      if (bw) bw.classList.toggle('open', !skipBodyOpen.has(card.slot));
    }
  });

  // Arms the geometry transitions one frame after the first layout pass.
  //
  // The applier writes `--geo-left`/`--geo-top` in an effect, so until it has
  // run once every card's placement is the CSS fallback of `0px`. With the
  // transition live from the start, a stack restored from a URL fans out from
  // the container's top-left corner on arrival — every card travelling from a
  // position it was never in. Two rAFs because one only guarantees the style
  // has been *set*, not that a layout has been performed against it; arming in
  // the same frame as the write still animates from the fallback.
  $effect(() => {
    const stackEl = document.getElementById('card-stack');
    if (!stackEl || stackEl.classList.contains('stack-motion')) return;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => stackEl.classList.add('stack-motion')),
    );
    return () => cancelAnimationFrame(raf);
  });

  // ── Scroll ownership (issue #110) ─────────────────────────────────
  //
  // ONE owner. Four `scrollIntoView({ block: 'nearest' })` call sites used to
  // share this job, and `nearest` is precisely the wrong primitive for a stack:
  // it does nothing when the target is already partly visible, which is the
  // normal case here — every card is on screen, the question is only which one
  // you are standing in front of.
  //
  // The rule: the active card's header sits at the top of the viewport, less a
  // peek. The arithmetic is `scrollTargetFor` (src/lib/stack-geometry.ts,
  // landed with the geometry in #107); this is the one-line applier around it.

  /**
   * The peek, in px, read back out of CSS.
   *
   * It differs by breakpoint — the stack above a desktop active card is an 8px
   * staircase, while on mobile it is a full collapsed header — and a JS
   * constant would need `matchMedia` to vary, which the CSS-first-responsive
   * rule forbids. Declared in `:root`, overridden in the desktop media block,
   * resolved to a number here. This is the sanctioned shape for a
   * breakpoint-varying value the applier needs, and the only one in the island.
   */
  function scrollPeek(): number {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--stack-scroll-peek');
    const px = parseFloat(raw);
    return Number.isFinite(px) ? px : 0;
  }

  /**
   * The debug slowdown multiplier, read from `--stack-motion-scale` in
   * `global.css` — the same knob every stack duration is a `calc()` of.
   *
   * The two JS timeouts below are SLACK against those CSS durations, not
   * durations themselves, so they have to scale with them: left at their
   * shipped values they would fire mid-animation the moment the knob goes
   * above 1, and the slowdown would silently truncate rather than slow.
   * Ships resolving to 1.
   */
  function motionScale(): number {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--stack-motion-scale');
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /**
   * Whether the visitor has asked for less motion.
   *
   * `matchMedia` here is the documented exception, not a breach of the
   * no-JS-breakpoint rule: this is a user preference, not a layout breakpoint,
   * and `window.scrollTo`'s `behavior` has no CSS-side equivalent to defer to
   * (a `scroll-behavior` declaration is overridden by an explicit `behavior`,
   * not consulted by it). Nothing about layout is decided from it.
   */
  function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Puts the active card's header at the top of the viewport, less the peek —
   * once the layout that decides where that is has stopped moving.
   *
   * The wait is the mobile half of the crop-vs-reflow asymmetry. Desktop
   * collapse is a crop, so the target is final the instant the store moves;
   * mobile collapse is a reflow, and the outgoing card's body animates to
   * nothing over 450ms, carrying the card being navigated to up the page with
   * it. Aimed at the start, a push out of a long lens landed 254px past its own
   * header. `scrollSettleAction` is the decision; this is the rAF loop around
   * it, and it costs desktop one frame because nothing is moving there to wait
   * for.
   *
   * `settleToken` cancels a loop still running when the next navigation starts:
   * two loops aiming at different cards would fight, and the older one would
   * win last.
   */
  let settleToken = 0;

  /**
   * Whether a transition that can move the active card is running in the stack.
   *
   * `grid-template-rows` only: that is the body collapse, and it is the one
   * transition that changes the DOCUMENT's height rather than a card's painted
   * position. `left`/`top` run on every desktop navigation and move nothing the
   * scroll target depends on, so waiting for them would be pure delay.
   *
   * Guarded because `getAnimations` does not exist in happy-dom, where the
   * island tests run — there it reports "nothing animating", which is the
   * correct answer for a document with no CSS.
   */
  function stackIsAnimating(): boolean {
    const stackEl = document.getElementById('card-stack');
    if (!stackEl || typeof stackEl.getAnimations !== 'function') return false;
    return stackEl.getAnimations({ subtree: true }).some(a =>
      (a as CSSTransition).transitionProperty === 'grid-template-rows'
      && a.playState === 'running');
  }

  function scrollActiveIntoView(behavior: ScrollBehavior) {
    const token = ++settleToken;
    const started = performance.now();
    let previousOffset: number | null = null;
    let framesSeen = 0;

    const step = () => {
      if (token !== settleToken) return;
      const elapsedMs = performance.now() - started;
      const el = elFor(get(stackStore).activeSlot);

      // The node may not be rendered yet — the store moves before Svelte
      // commits the `{#each}`. Keep waiting rather than giving up: bailing here
      // is silent, and what the visitor gets is wherever the browser's own
      // clamp left them as the page reflowed under the collapse.
      if (!el) {
        if (elapsedMs < SCROLL_SETTLE_TIMEOUT_MS * motionScale()) requestAnimationFrame(step);
        return;
      }

      framesSeen += 1;
      const currentOffset = el.getBoundingClientRect().top + window.scrollY;
      const action = scrollSettleAction({
        previousOffset,
        currentOffset,
        animating: stackIsAnimating(),
        framesSeen,
        elapsedMs,
        timeoutMs: SCROLL_SETTLE_TIMEOUT_MS * motionScale(),
      });
      if (action === 'wait') {
        previousOffset = currentOffset;
        requestAnimationFrame(step);
        return;
      }
      window.scrollTo({ top: scrollTargetFor(el.getBoundingClientRect().top, window.scrollY, scrollPeek()), behavior });
    };

    requestAnimationFrame(step);
  }

  // The only caller. Reactive rather than called from the navigation handlers,
  // for the same reason the layout is (see the CLAUDE.md invariant): the store
  // is what moved, and every handler that mutates it would otherwise have to
  // remember to scroll afterwards — which is exactly how there came to be four
  // of them.
  $effect(() => {
    const state = $stackStore;
    if (!state.activeSlot) return;
    const signature = `${state.activeSlot}@${state.entries.length}`;
    if (signature === lastScrollSignature) return;
    lastScrollSignature = signature;
    scrollActiveIntoView(scrollBehaviourFor(rebuilding, prefersReducedMotion()));
  });

  // ── Sticky active header (issue #110) ─────────────────────────────
  //
  // An IntersectionObserver on the 1px `.card-header-sentinel` at the card's
  // top edge (markup landed with the fragments in #108), NOT a scroll listener:
  // an observer fires once per threshold crossing where a listener writes
  // styles on every frame, and repaint is the scarce resource in a design whose
  // surfaces are all `background-attachment: fixed` dither.
  //
  // Only the active card is observed. A collapsed card's header is cropped away
  // behind the spine on desktop and closed on mobile, so there is nothing there
  // that could stick.
  $effect(() => {
    const slot = $stackStore.activeSlot;
    if (!slot || typeof IntersectionObserver === 'undefined') return;
    const card = elFor(slot);
    const sentinel = card?.querySelector<HTMLElement>('.card-header-sentinel');
    const header = card?.querySelector<HTMLElement>('.card-header');
    if (!sentinel || !header) return;

    const io = new IntersectionObserver(
      ([entry]) => header.classList.toggle('card-header--stuck', !entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(sentinel);
    return () => {
      io.disconnect();
      // A card that stops being active must not keep the compact state: it
      // would be wearing a scrolled appearance the next time it is opened.
      header.classList.remove('card-header--stuck');
    };
  });

  /**
   * The clip reveal for a card whose body has just arrived (#98: geometric clip
   * is the whole animation vocabulary — the dither dissolve shimmers and is
   * out).
   *
   * A CSS animation rather than a transition, so that nothing is clipped at
   * rest. `inset(0 0 100% 0)` does not interpolate to `none`, so a transition
   * would need the resting state to carry a permanent no-op `clip-path` on
   * every card body in the stack; a keyframed animation leaves the element with
   * no clip at all once it ends.
   *
   * Under reduced motion the animation is `none`, so `animationend` never
   * fires and the class simply stays — which is correct rather than leaky: with
   * no animation there is no clip to remove.
   */
  function revealBody(slot: string) {
    const card = elFor(slot);
    if (!card) return;
    card.classList.add('stack-card--revealing');
    card.addEventListener(
      'animationend',
      () => card.classList.remove('stack-card--revealing'),
      { once: true },
    );
  }

  // --- Helpers ---

  const HOME_UID = 'lens/home';

  /**
   * The element a push MORPHS INTO the new card — the "old" half of the
   * `panel-card-open` View Transition, and the thing whose absence makes
   * `performPush` take the instant-fallback branch.
   *
   * Two classes, because two components render a card-shaped link and neither
   * is a special case of the other: `.card-link` (`CardLink.astro`, plus the
   * front page's `FilterSlot` / `PinnedSlot`) and `.browse-card-link`
   * (`BrowseCard.svelte` — every lens result tile).
   *
   * Naming only the first meant every push from a RESULT GRID — the default
   * browse lens, every `See more ->`, every `collection:` / `tag:` landing —
   * resolved `clickedLink` to null and lost two things silently, with no
   * error and nothing in the DOM to show for it: the view transition never
   * started, and `usePlaceholder` (which is gated on the same value) went
   * false, so the push additionally sat on the network before showing
   * anything. The card simply appeared at its final size.
   *
   * A `[data-push-card]` element matching NEITHER is still perfectly
   * pushable; it just gets no morph, which is the right outcome for a link
   * that is not card-shaped — an inline `card:` link in prose has no card
   * geometry for the transition to start from.
   */
  const MORPH_SOURCE_SELECTOR = '.card-link, .browse-card-link';

  /** Safety net for the closing card's collapse, which `global.css` declares at
   *  450ms on `.body-wrapper` (`--stack-body-ms`). Slack, not a duration:
   *  `waitForTransition` resolves on the event and clears this, so it only ever
   *  fires when no `transitionend` arrives at all — which means it has to sit
   *  ABOVE that 450ms with room to spare, or it pre-empts the very transition
   *  it is insuring. Scaled by `motionScale()` at the call site for the same
   *  reason. */
  const BODY_COLLAPSE_FALLBACK_MS = 600;

  /**
   * The params a location owns, out of a query string. `from`/`to` are the
   * codec's own structural keys — they say where the location sits in the
   * stack, never what it is — so a location must never adopt them (issue #103).
   * `locationParamsFromSearch` in stack-codec.ts is that one decision, next to
   * the code that writes the keys; this is only its local name.
   */
  function paramsFromSearch(search: string): ParamPairs {
    return locationParamsFromSearch(search);
  }

  /**
   * The location a uid + its params names. A lens takes its filter params into
   * its key (that is its identity); everything else is side state, which the
   * caller stores in `cardParams` under the resulting key.
   */
  function locationEntryFor(uid: string, params: ParamPairs = []): LocationEntry {
    const { identity, other } = splitLocationParams(uid, params);
    const entry = isLensUid(uid) ? lensEntry(lensNameForKey(uid)!, identity) : cardEntry(uid);
    if (other.length) cardParams.set(entry.key, other);
    return entry;
  }

  /** The live `.stack-card` element for a location handle. */
  function elFor(slot: string | null): HTMLElement | null {
    if (!slot) return null;
    return document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(slot)}"]`);
  }

  /**
   * Mirrors the active lens location's filter set into the shared filter store
   * every lens body reads. The location's key is the single source of truth
   * for the selection now, so this is a thin, reactive applier — not a second
   * place filters are decided. LensFilterShell used to seed itself from
   * `window.location` on mount, which is exactly why an already-mounted lens
   * and the URL could disagree (issue #100).
   */
  let lastSyncedFilterQuery: string | null = null;
  function syncLensFilters(activeKey: string | null) {
    const query = new URLSearchParams(activeKey ? filtersForKey(activeKey) : []).toString();
    if (query !== lastSyncedFilterQuery) {
      lastSyncedFilterQuery = query;
      lensFilterStore.set(filterStateFromParams(new URLSearchParams(query)));
    }
    lensFiltersSynced.set(true);
  }

  // Synchronously make the home lens the sole, active, page-mode entry — the
  // state `/` cold-loads into. Home must already be cached (see seedHomeActive).
  function applyHomeSeed() {
    const entry = lensEntry('home');
    stackStore.set(seedStackState(entry));
  }

  // Seeds the home lens as the sole active entry, fetching it first if needed.
  // Used when a deep-linked card is closed down to empty, or on popstate to `/`.
  async function seedHomeActive(pushUrl = true) {
    const ok = await fragments.ensure(HOME_UID);
    if (!ok) {
      window.location.href = '/';
      return;
    }
    applyHomeSeed();
    if (pushUrl) history.pushState(null, '', '/');
  }

  // Records the view-state transition to 'read' for a location we hold the HTML
  // for. `readToRecord` owns the decision (card locations with a rendered
  // data-content-hash, nothing else); this is the thin write.
  // `uid` names what was read; `slot` is only where its HTML is cached. They
  // differ whenever a location holds a suffixed handle (`lens/x#2`), and read
  // state must never be keyed on one of those.
  /**
   * The title a location displays.
   *
   * For a CARD the fragment is the whole truth. For a LENS it is not: the
   * fragment is fetched by uid and therefore always renders the lens
   * unfiltered, while the location it mounts as carries its filter set in its
   * key (issue #100) — and that set is what tells two views of one lens apart,
   * both from each other and from the unfiltered lens they were narrowed from.
   * So a lens's title is derived from its key here rather than read out of its
   * HTML. `lensChromeForKey` is the decision; this picks which source applies.
   */
  function titleForSlot(slot: string): string | null {
    const entry = entryForSlot(get(stackStore), slot);
    const chrome = entry ? lensChromeForKey(entry.key) : null;
    return chrome ? chrome.cardTitle : fragments.factsFor(slot).title;
  }

  /**
   * Writes a lens location's filtered title into the two places a fragment
   * states its own name — its header and its spine.
   *
   * A no-op for a card. Called from the layout effect (so a re-key, which is
   * what a filter toggle does to the active lens, repaints its title) and again
   * after every `replaceBody`, whose `syncTitles` copies the *fetched*
   * fragment's unfiltered title onto the kept header.
   */
  function applyLensTitle(slot: string) {
    const entry = entryForSlot(get(stackStore), slot);
    const chrome = entry ? lensChromeForKey(entry.key) : null;
    const el = elFor(slot);
    if (!chrome || !el) return;
    const header = el.querySelector('.card-header-title');
    // The header title is `<span class="card-header-title"><b>…</b></span>`;
    // a placeholder's is the same shape. Write the innermost node so the
    // emphasis survives, and never the span itself — the footnote is a
    // sibling, but the `<b>` is not.
    const target = header?.querySelector('b') ?? header;
    if (target && target.textContent !== chrome.cardTitle) target.textContent = chrome.cardTitle;
    const spine = el.querySelector('.stack-card-spine-title');
    if (spine && spine.textContent !== chrome.cardTitle) spine.textContent = chrome.cardTitle;
  }

  /**
   * A band's label: the card's own title, or "N more" for the band that
   * absorbs everything past the cap. `count` is never 1 for a band that isn't
   * showing its own card (see `pileSections`), so this can't produce "1 more".
   *
   * Titles are read from the fragment cache, which is not reactive — but a
   * piled card is by definition one the visitor has already been on, so its
   * fragment landed long before it reached the pile.
   */
  function bandLabel(band: { slot: string; count: number }): string {
    if (band.count > 1) return `${band.count} more`;
    return titleForSlot(band.slot) ?? band.slot;
  }

  /**
   * Jump straight to a card buried in a pile. The whole point of the split:
   * without it a hidden card is several hops back through the stack, and the
   * hops are not even navigable — the cards between it and the visitor are the
   * ones the pile is hiding.
   *
   * Same three steps every activation takes (store, read state, URL), because
   * arriving here is arriving anywhere: `CardStack.svelte` owns the mutation.
   */
  function activateBand(slot: string) {
    const entry = entryForSlot(get(stackStore), slot);
    if (!entry) return;
    stackStore.update(s => activateCardFn(s, entry.slot));
    markReadIfKnown(entry.uid, entry.slot);
    updateUrl();
  }

  function markReadIfKnown(uid: string, slot: string = uid) {
    const record = readToRecord(uid, fragments.get(slot));
    if (record) markRead(record.uid, record.hash);
  }

  function updateUrl(method: 'push' | 'replace' = 'push') {
    const state = get(stackStore);
    const historyFn = method === 'replace' ? history.replaceState.bind(history) : history.pushState.bind(history);

    const paramsByKey = new Map<string, ParamPairs>();
    for (const [key, pairs] of cardParams) {
      if (pairs.length) paramsByKey.set(key, pairs);
    }

    let { path, search } = serialiseStack(state, paramsByKey, manifestLookup, tagManifestLookup);
    // `/` is the prettier address for the home lens as the sole entry.
    if (path === '/lens/home' && search === '') path = '/';
    historyFn(null, '', `${path}${search}`);
  }

  /**
   * Hold the incoming lens's results behind the #119/#123 skeleton for as long
   * as the ASSEMBLY is resizing (issue #126).
   *
   * A lens change animates the real box now: `.card-stack-inner`'s `width` is
   * transitioned over `--stack-motion-ms`, and that box is what the incoming
   * grid is laid out against. Measured at 1400x900, `/` -> What -> Art:
   * uncovered, `.fp-browse-list` (`repeat(auto-fill, minmax(280px, 1fr))`)
   * holds TWO columns from 680px to ~930px and then reflows to three, taking
   * the document height with it — which is exactly the churn #125 recorded and
   * suppressed the width transition to avoid. Covered, the results land once,
   * at the final width.
   *
   * The hold is ASKED, not predicted: the commit has just run, so forcing one
   * style+layout pass creates whatever transition it started, and
   * `widthTransitionOf` either finds it or does not. Three cases release
   * immediately and by the same route — two lenses that declare the same width
   * (every lens but home is 960px, so lens -> lens is a genuine no-op), mobile
   * (`.card-stack-inner` is `display: contents` and has no box to transition),
   * and reduced motion (`--stack-motion-ms` is 0ms, and a zero-duration
   * transition is never created at all). None of them can stall.
   *
   * `finished` rejects if a later navigation cancels the transition; the
   * attribute comes off either way, and off a node that may by then be
   * detached, which is harmless.
   */
  async function holdWhileAssemblyResizes(el: HTMLElement | null | undefined) {
    const inner = innerEl;
    if (!el || !inner || typeof inner.getAnimations !== 'function') return;
    // Load-bearing, and the mirror of the read `commitWithoutWidthMotion` made
    // for the opposite reason: without it the transition the commit started
    // does not exist yet to be found.
    void inner.offsetWidth;
    const resize = widthTransitionOf(inner.getAnimations());
    if (!resize) return;
    el.setAttribute(STACK_RESIZING_ATTR, '');
    try {
      await resize.finished;
    } catch {
      // Cancelled by the next navigation — release, and let that one hold.
    }
    el.removeAttribute(STACK_RESIZING_ATTR);
  }

  /**
   * Drop a cold load's <html>-level guard when the card it covered is about to
   * be destroyed (a replace takes the active card's node and its island with
   * it). Nothing would be left to clear it, and the 3s safety net would then
   * resolve it into a page-wide `stalled` — blanking the results the incoming
   * card is about to show. A push leaves the outgoing island alive, so it
   * clears its own host and this is not called there.
   */
  function dropRootGuard() {
    clearFiltersPending(document.documentElement);
  }

  /**
   * Hold an incoming lens's results behind the #119/#123 skeleton until its
   * island commits the order the CLIENT decides (issue #125).
   *
   * A fragment is fetched by uid, so the server always renders a lens
   * unfiltered and in the build-time half of the ranking chain. On a cold load
   * Base.astro's pre-paint script covers the gap between that and what the
   * browser decides; a client-side transition hydrates the same fragment IN
   * VIEW, and covered nothing — measured at ~400ms of churn ending in a 1877px
   * collapse as cards of different heights changed places.
   *
   * Flagged on the incoming CARD, never on <html>: the stack can hold a second
   * browse lens behind the active one. `filtersPendingForTransition` is the
   * decision (and returns null for a card, for an unfiltered date strip, and
   * for a first-time visitor's inert re-rank); this is the applier.
   */
  function guardIncomingLens(entry: LocationEntry, el: HTMLElement | null | undefined) {
    if (!el) return;
    const lensId = lensNameForKey(entry.key);
    const value = filtersPendingForTransition({
      isLens: lensId !== null,
      lensConfig: lensId ? getLensDefinition(lensId)?.config : null,
      hasFilterParams: hasFilterParamKey(filtersForKey(entry.key).map(([key]) => key)),
      hasReadHistory: hasAnyViewState(),
    });
    if (value !== null) applyFiltersPending(el, value);
  }

  // `extraParams` (e.g. a serialised FilterState query string) rides along
  // for a replace that must carry the current filter selections into the new
  // slot — e.g. selecting a lens from a DimensionPanel while filters are
  // active (issue #25). It becomes the incoming location's cardParams entry
  // *before* serialisation (the same route pushFilteredLens takes), rather
  // than being appended to the URL afterwards: cardParams stays the single
  // source of truth for a location's params, and a carried selection can't
  // land in the URL twice when the incoming uid already held one. See
  // paramsAfterSlotReplace for what happens to the outgoing location's params.
  async function replaceSlot(url: string, extraParams?: string) {
    const uid = urlToUid(url);
    const state = get(stackStore);
    const carried: ParamPairs = [];
    if (extraParams) new URLSearchParams(extraParams).forEach((v, k) => { carried.push([k, v]); });
    const { identity, other } = splitLocationParams(uid, carried);
    // A fresh handle, not the outgoing one's: the incoming location is a
    // different thing in that position, so it gets its own DOM node and its own
    // cache slot. Reusing the handle would hit the outgoing fragment in the
    // cache and never fetch.
    const incoming = withFreeSlot(
      state.entries,
      isLensUid(uid) ? lensEntry(lensNameForKey(uid)!, identity) : cardEntry(uid),
    );

    // A carried filter selection is part of the incoming lens's identity now,
    // so only genuine side params still route through paramsAfterSlotReplace.
    cardParams = paramsAfterSlotReplace(cardParams, activeEntry(state)?.key ?? null, incoming.key, other);

    // Fetch by uid, cache under the handle the DOM node will carry.
    const ok = await fragments.ensure(incoming.slot, uid);
    if (!ok) return;

    const commit = () => stackStore.update(s => replaceActiveSlot(s, incoming));

    // ── A lens change animates the REAL BOX, in both directions (issue #126)
    //
    // There is no view transition here any more, and that is the whole fix.
    // A VT paints SNAPSHOTS for its duration — the UA stylesheet stretches both
    // `::view-transition-old` and `::view-transition-new` to `inline-size: 100%`
    // of a group that is itself animating between the old and new rects — so
    // any real box animating underneath it is invisible, and what the viewer
    // sees is the header being scaled as a bitmap. Measured: the width snapped
    // 680px -> 960px in ONE frame while a `panel-card-replace` transition ran
    // for ~514ms over the top of it.
    //
    // Back does not do that. A popstate rebuilds through `initFromUrl`, the
    // surviving `.card-stack-inner` keeps its identity, and its `width`
    // transition simply runs — ~443ms over 28 frames of real layout. That is
    // the behaviour this path now takes, so a lens change has one vocabulary
    // whichever direction it is reached from.
    //
    // The fresh slot stays exactly as it was. It was never what made the VT
    // necessary: `.card-stack-inner` is OUTSIDE the keyed `{#each}`, so it
    // survives a node swap the same way it survives a popstate, and it is the
    // element the width transition runs on. Reusing the outgoing handle would
    // hit the outgoing fragment in the cache and never fetch (see above), and
    // buys nothing here.
    //
    // The cost, stated plainly: two lenses of the same width (every lens but
    // home declares 960px) now swap instantly instead of crossfading. That is
    // what Back between them already did, and one vocabulary was the ask.
    //
    // Committed synchronously so the incoming card's node exists to be flagged
    // in the same task, before the browser paints the fragment it just mounted.
    flushSync(commit);
    dropRootGuard();
    const incomingEl = elFor(incoming.slot);
    guardIncomingLens(incoming, incomingEl);
    // PUSH, not replace (issue #124). "Replace" names the STACK operation —
    // `replaceActiveSlot` does swap the active slot out — and says nothing
    // about history. Conflating the two left a lens transition with no history
    // entry at all, so Back from `/lens/interesting` skipped the home page the
    // visitor came from and left the site. A lens transition is a navigation;
    // only a filter toggle (onCardParam, which re-keys the active location
    // rather than moving to another one) is a replace.
    updateUrl();
    // ...and the results stay behind the skeleton until that box has stopped
    // moving, which is the half of #125 this must not undo.
    await holdWhileAssemblyResizes(incomingEl);
  }

  async function pushCard(url: string, clickedLink?: Element | null, params: ParamPairs = []) {
    const state = get(stackStore);
    const target = locationEntryFor(urlToUid(url), params);

    // Re-activate, do nothing, or push — one decision, in stack-layout.ts,
    // taken against the live stack AND the pushes already in flight (#112).
    const plan = planPush(state, pendingPushes, target);
    if (plan.kind === 'ignore') return;
    if (plan.kind === 'activate') {
      const existing = entryForSlot(state, plan.slot)!;
      stackStore.update(s => activateCardFn(s, existing.slot));
      markReadIfKnown(existing.uid, existing.slot);
      updateUrl();
      return;
    }

    const entry = plan.entry;
    // Reserved from here until the push settles. The release is in a `finally`
    // below rather than at each exit, because a push has several — a failed
    // fetch returns early, and a view transition can reject — and a reservation
    // that outlives its push would silently make the location unpushable.
    pendingPushes = [...pendingPushes, entry];
    try {
      await performPush(entry, clickedLink, state);
    } finally {
      pendingPushes = pendingPushes.filter(e => e !== entry);
    }
  }

  /** The push itself, once `planPush` has settled that there is one to do. */
  async function performPush(entry: LocationEntry, clickedLink: Element | null | undefined, state: StackState) {
    const uid = entry.uid;
    const slot = entry.slot;

    // Pushing the first card while home is the sole page-mode entry: the home
    // title + divider morph into the new card's header (issue #24). Detected
    // before the store mutates.
    const wasHomePageMode =
      state.entries.length === 1 &&
      state.entries[0].key === HOME_UID &&
      state.activeSlot === state.entries[0].slot;

    const alreadyCached = fragments.has(slot);

    // Start network fetch immediately, before any VT
    const networkFetch: Promise<string | null> = alreadyCached
      ? Promise.resolve(null)
      : fragments.load(uid);

    // If we have a link to click and VT support, seed cache with a placeholder
    // so the VT can start immediately without waiting for the network
    const usePlaceholder = !alreadyCached && clickedLink != null && startVT != null;
    if (usePlaceholder) {
      fragments.seedPlaceholder(slot, placeholderTitle(manifestLookup.titleForUid(uid), titleOfElement(clickedLink)));
    } else if (!alreadyCached) {
      // No VT possible — wait for real content before showing anything
      const html = await networkFetch;
      if (!html) return;
      fragments.seed(slot, html);
    }

    const doUpdate = () => {
      // Consume the browse-page stack context on the first push from the filter page.
      // Runs inside flushSync (VT path) or directly, so both paths get the seeding.
      const toSeed = pendingBrowseStack;
      pendingBrowseStack = [];
      for (const pendingUid of toSeed) {
        if (!fragments.has(pendingUid)) {
          fragments.seedPlaceholder(pendingUid, placeholderTitle(manifestLookup.titleForUid(pendingUid)));
        }
      }

      stackStore.update(s => {
        let state = s;
        for (const pendingUid of toSeed) {
          state = pushToStack(state, cardEntry(pendingUid));
        }
        const activeIdx = state.activeSlot
          ? state.entries.findIndex(e => e.slot === state.activeSlot)
          : state.entries.length - 1;
        const base = activeIdx >= 0 ? { ...state, entries: state.entries.slice(0, activeIdx + 1) } : state;
        return pushToStack(base, entry);
      });
    };

    const homepage = document.getElementById('homepage');

    if ((clickedLink || wasHomePageMode) && startVT) {
      // Phase 1: seed the outgoing VT names. From home page mode we morph the
      // page title/divider into the new card's header; otherwise the clicked
      // panel link morphs into the card header position.
      skipBodyOpen.add(slot);
      let homeTitle: HTMLElement | null = null;
      let homeDivider: HTMLElement | null = null;
      if (wasHomePageMode) {
        const homeEl = elFor(slotForKey(state, HOME_UID));
        homeTitle = homeEl?.querySelector<HTMLElement>('.page-title') ?? null;
        homeDivider = homeEl?.querySelector<HTMLElement>('.page-header') ?? null;
        if (homeTitle) homeTitle.style.viewTransitionName = 'home-title';
        if (homeDivider) homeDivider.style.viewTransitionName = 'home-divider';
      } else if (clickedLink) {
        (clickedLink as HTMLElement).style.viewTransitionName = 'panel-card-open';
      }

      const vt = startVT(() => {
        flushSync(doUpdate);
        const newCard = elFor(slot);
        // Before the new snapshot is captured. A placeholder push mounts with
        // no results at all, but `replaceBody` splices the fetched fragment's
        // unfiltered grid into this same node a few hundred ms later — the flag
        // is what stops that landing in view.
        guardIncomingLens(entry, newCard);
        if (wasHomePageMode) {
          const t = newCard?.querySelector<HTMLElement>('.card-header-title');
          const d = newCard?.querySelector<HTMLElement>('.card-header');
          if (t) t.style.viewTransitionName = 'home-title';
          if (d) d.style.viewTransitionName = 'home-divider';
        } else if (newCard) {
          newCard.style.viewTransitionName = 'panel-card-open';
          // Hand the name off rather than sharing it: unlike the home-page-mode
          // branch above (masked out of the new snapshot by `homepage.hidden`
          // below), `clickedLink` is an ordinary in-stack card-link — the card
          // it lives on stays visible after the push (a behind card is a CROP,
          // never removed — see the desktop-vs-mobile collapse note in
          // CLAUDE.md), so it would otherwise still carry this name into the
          // new snapshot alongside `newCard` and the browser aborts the whole
          // transition as "duplicate view-transition-name". Clearing it here,
          // inside the same synchronous callback and before the new snapshot
          // is captured, is what makes this pairing 1-old/1-new like every
          // other named transition on the site.
          if (clickedLink) (clickedLink as HTMLElement).style.viewTransitionName = '';
        }
        if (homepage) homepage.hidden = true;
      });

      await vt.finished;
      skipBodyOpen.delete(slot);
      if (homeTitle) homeTitle.style.viewTransitionName = '';
      if (homeDivider) homeDivider.style.viewTransitionName = '';
      if (clickedLink && !wasHomePageMode) (clickedLink as HTMLElement).style.viewTransitionName = '';
      const vtCard = elFor(slot);
      if (vtCard) {
        vtCard.style.viewTransitionName = '';
        const t = vtCard.querySelector<HTMLElement>('.card-header-title');
        const d = vtCard.querySelector<HTMLElement>('.card-header');
        if (t) t.style.viewTransitionName = '';
        if (d) d.style.viewTransitionName = '';
      }

      if (usePlaceholder) {
        // Phase 2: write real body content directly into the placeholder's DOM,
        // then open with the body-wrapper CSS transition
        const html = await networkFetch;
        if (html) {
          // Caches the real fragment for future navigations and patches its
          // body into the mounted placeholder. The width the layout $effect
          // couldn't see (it ran against the placeholder, which declares none)
          // is reapplied by the fragment store's onChange, not from here.
          fragments.replaceBody(slot, html, elFor(slot));
          // `syncTitles` just copied the fetched fragment's UNFILTERED title
          // onto this card's kept header — restate the location's own.
          applyLensTitle(slot);
        }
        // One rAF so the browser paints the closed card before we start opening it
        await new Promise<void>(r => requestAnimationFrame(() => r()));
      }

      elFor(slot)?.querySelector<HTMLElement>('.body-wrapper')?.classList.add('open');
    } else {
      // Instant fallback (no VT support or no clicked link)
      doUpdate();
      if (homepage) homepage.hidden = true;
      await tick();
      // `tick()` resolves after Svelte has written the DOM and before the
      // browser paints it, so the flag lands on the same frame the card does.
      guardIncomingLens(entry, elFor(slot));
    }

    markReadIfKnown(uid, slot);
    updateUrl();
    revealBody(slot);
  }

  // Pushes a browse-lens URL carrying a `filter.<dim>=...` query (built by
  // parseCollectionLink/filterUrlForTagValue) through the normal
  // fetch-and-splice stack model — "browse with filter X" is just another
  // lens location, never a full-page reload (issue #26).
  //
  // The query is the location's identity, so it goes to pushCard as params and
  // ends up in the pushed entry's key (issue #100). It used to ride a side map
  // keyed by the bare lens uid, which is why a differently-filtered link jumped
  // backwards to the lens already in the stack instead of pushing a new one.
  function pushFilteredLens(url: string) {
    const qIdx = url.indexOf('?');
    const path = qIdx === -1 ? url : url.slice(0, qIdx);
    pushCard(path, null, qIdx === -1 ? [] : paramsFromSearch(url.slice(qIdx + 1)));
  }

  async function closeCard(slot: string) {
    const state = get(stackStore);
    const idx = state.entries.findIndex(e => e.slot === slot);
    if (idx === -1) return;

    cardParams.delete(state.entries[idx].key);
    const newEntries = state.entries.slice(0, idx);

    if (newEntries.length === 0) {
      // Stack becomes empty (a deep-linked card closed) — return to the home
      // lens, which becomes the sole page-mode entry. Animate the closing card
      // shut first so the return reads as a collapse, not a jump.
      const el = elFor(slot);
      const bw = el?.querySelector<HTMLElement>('.body-wrapper');
      if (bw) {
        bw.classList.remove('open');
        // Only await a transition that can actually fire. Under reduced motion
        // the collapse is zero-duration, which starts nothing and dispatches no
        // `transitionend` — so awaiting it would sit through the whole fallback
        // and turn "instant" into a 400ms stall before the return to home. The
        // hazard is documented in transition-wait.ts; `transitionWillFire` is
        // the decision, and it reads the computed style rather than the
        // preference so it cannot drift from what the CSS actually resolves to.
        if (transitionWillFire(getComputedStyle(bw).transitionDuration)) {
          await waitForTransition(bw, 'grid-template-rows', BODY_COLLAPSE_FALLBACK_MS * motionScale());
        }
      }

      const ok = await fragments.ensure(HOME_UID);
      if (!ok) { window.location.href = '/'; return; }

      // URL first: home's re-inserted fragment mounts LensFilterShell, which
      // reads window.location.search on mount (see LensFilterShell.svelte's
      // syncFromUrl). If the URL still carried the closed card's filter.*
      // params at that point, home would briefly seed itself from them even
      // though it can't accept filters.
      history.pushState(null, '', '/');
      if (startVT) {
        const vt = startVT(() => { flushSync(applyHomeSeed); });
        await vt.finished;
      } else {
        applyHomeSeed();
      }
    } else {
      // Trim stack to entries before the closed card, activate the new last one
      const newActive = newEntries[newEntries.length - 1];
      stackStore.update(s => ({ ...s, entries: newEntries, activeSlot: newActive.slot }));
      updateUrl();
    }
  }

  /**
   * Drop the pre-paint fan skeleton (issue #122).
   *
   * Base.astro's head script draws one collapsed spine per `from`/`to` entry
   * before paint — the shape is knowable from the URL, the titles are not
   * (`stack-manifest.json` is a 46KB chunk that lands long after the HTML). It
   * lives as a separate layer appended AFTER `.card-stack-inner`, never into
   * it: that block is this component's keyed `{#each}`, and an unexpected node
   * inside it is a hydration mismatch — #120 measured Svelte 5 discarding and
   * re-creating the whole subtree, which takes the nested `<astro-island>`s in
   * the active card with it.
   *
   * Called at both of `initFromUrl`'s exits, and only there. Removing it any
   * earlier (at mount, say) would replace the drawn fan with an empty strip for
   * however long the store write takes — reintroducing the gap it exists to
   * cover, just later. Removing it at the point the REAL entries are in the DOM
   * is what makes the swap invisible.
   */
  function dismissSkeleton() {
    document.querySelector('.stack-skeleton')?.remove();
  }

  async function initFromUrl() {
    const { state: parsed, paramsByKey } = deserialiseStack(window.location.pathname, window.location.search, manifestLookup, tagManifestLookup);

    // Capture the active location's own side params even when it's the sole
    // entry — otherwise the first card push serialises without them. A lens's
    // filters are no longer among these: they are already in `parsed`'s key,
    // and the store was seeded from the same URL at mount (issue #100).
    const parsedActive = activeEntry(parsed);
    if (parsedActive) {
      const activeParams = paramsByKey.get(parsedActive.key);
      if (activeParams?.length) cardParams.set(parsedActive.key, activeParams);
    }

    if (parsed.entries.length <= 1) {
      // The URL carried a `from`/`to` the codec could not resolve into entries
      // (a retired short code, say). Nothing is coming, so the skeleton must
      // still go — a spine that never fills is worse than one that was never
      // drawn.
      dismissSkeleton();
      return;
    }

    const activeIdxInParsed = parsed.entries.findIndex(e => e.slot === parsed.activeSlot);
    const fromLocations = parsed.entries.slice(0, activeIdxInParsed);
    const toLocations = parsed.entries.slice(activeIdxInParsed + 1);
    const restored = [...fromLocations, ...toLocations];

    // ── The stack's SHAPE lands first, its contents afterwards (issue #101).
    //
    // This used to await each fragment and splice its entry in when the HTML
    // arrived, so a cold-loaded deep link painted the active card alone and
    // then grew a fan one card at a time, moving the card you came to read on
    // every step. Nothing about that wait was necessary: `deserialiseStack`
    // already knows every entry, and the manifest already ships to the client
    // for short-code decoding — so the browser knows each location's uid, and
    // now its title, before it knows anything else about it.
    //
    // A placeholder is not a different kind of thing. It is a card whose
    // content has not arrived: same fragment shape, same geometry, same spine.
    // For a `from`/`to` entry that is very nearly the whole card, because they
    // all arrive COLLAPSED — what shows is the spine title, which the manifest
    // supplies exactly (`resolveCardTitle`, the same function the real
    // fragment renders through), so the fill-in is invisible rather than a
    // second flash of change.
    const pending = new Set<string>();
    for (const location of restored) {
      const entryParams = paramsByKey.get(location.key);
      if (entryParams?.length) cardParams.set(location.key, entryParams);
      if (fragments.has(location.slot)) continue;
      // `placeholderTitle` is the one decision (issue #105); a restored entry
      // has no clicked link to offer, so the manifest is all there is.
      fragments.seedPlaceholder(location.slot, placeholderTitle(manifestLookup.titleForUid(location.uid)));
      pending.add(location.slot);
    }

    // ONE store write, so the fan is complete from the first hydrated frame —
    // and so the scroll effect sees a single shape change rather than one per
    // entry (its signature is activeSlot@depth).
    stackStore.update(s => {
      const activeIdx = s.entries.findIndex(e => e.slot === s.activeSlot);
      if (activeIdx < 0) return { ...s, entries: [...fromLocations, ...s.entries, ...toLocations] };
      return {
        ...s,
        entries: [
          ...s.entries.slice(0, activeIdx),
          ...fromLocations,
          s.entries[activeIdx],
          ...toLocations,
          ...s.entries.slice(activeIdx + 1),
        ],
      };
    });
    // The nodes have to exist before `replaceBody` can write into them.
    await tick();
    // ...and by the same token the real spines are now drawn, with their real
    // titles, exactly where the skeleton drew placeholders. This is the one
    // frame at which the swap costs nothing.
    dismissSkeleton();

    // Fetches run in PARALLEL now. They were sequential only because each one
    // gated the next entry's appearance; nothing gates anything any more, and a
    // six-deep stack was six round trips end to end.
    await Promise.all(restored.map(async location => {
      if (!pending.has(location.slot)) return;
      const html = await fragments.load(location.uid);
      if (!html) {
        // Drop it rather than leaving a placeholder that will never fill. The
        // shape was optimistic; a location whose fragment 404s is not in the
        // stack, which is exactly what the sequential version expressed by
        // never splicing it in.
        stackStore.update(s => ({ ...s, entries: s.entries.filter(e => e.slot !== location.slot) }));
        return;
      }
      // MUST be replaceBody, never a bare cache write: `StackFragment` reads
      // its html prop once, so once a location is mounted the cache no longer
      // reaches its DOM (see CLAUDE.md § Svelte islands). A `seed` here would
      // cache the real fragment and leave the card showing its skeleton for
      // the rest of the session.
      fragments.replaceBody(location.slot, html, elFor(location.slot));
      applyLensTitle(location.slot);
    }));
  }

  onMount(() => {
    // Recover the SSR location's markup into the fragment cache. It arrived as
    // DOM (slot content), and the cache still needs the string: `factsFor`
    // reads the declared width and the content hash out of it, and a location
    // closed and later re-pushed is mounted from it.
    //
    // FIRST, before anything below reads the cache — `markReadIfKnown` keys
    // read state on the content hash, and an empty cache would silently record
    // nothing. And it must be here rather than later: `astro-island` defers a
    // nested island's hydration until its ancestor fires `astro:hydrate`, so
    // right now the islands inside this card still carry their `ssr` attribute
    // and their props; snapshot them after that and a re-push would mount
    // inert markup.
    if (ssrSlot) fragments.adopt(ssrSlot, elFor(ssrSlot));

    startVT = (document as any).startViewTransition?.bind(document);
    const homepage = document.getElementById('homepage');

    // If SSR-seeded card present, hide homepage
    if (get(stackStore).entries.length > 0 && homepage) {
      homepage.hidden = true;
    }

    // Arriving at a card IS reading it (#92, and see CLAUDE.md). Every other
    // markRead call sits on a client-side navigation, so a visitor who lands
    // straight on /card/... from search, a shared link, RSS or an old-URL
    // redirect used to record nothing at all.
    //
    // Only the SSR-active location, and only when it's a card: the from/to
    // entries initFromUrl restores below arrive collapsed, which is the same
    // "shown but not opened" state the front page's slots are in.
    if (activeUid) markReadIfKnown(activeUid);

    // The stack owns the scroll position, so the browser must stop restoring
    // its own. A popstate rebuilds the whole stack asynchronously — entries are
    // re-fetched and spliced back in — so the offset the browser saved belongs
    // to a layout that does not exist yet when it applies it, and it lands
    // after our own scroll rather than before it. Verified in a browser rather
    // than assumed (the ticket's ask): without this, going back from a pushed
    // card leaves the viewport wherever the old entry had been.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // Restore from/to context cards in URL. `rebuilding` stays true until the
    // splicing settles, so each correcting scroll is instant — see
    // scrollBehaviourFor.
    initFromUrl().finally(() => { rebuilding = false; });

    // If on the filter page with a browse stack, prefetch those cards so they're
    // ready to seed the store the moment the user opens their first card.
    const browseUids = stackFromParams(new URLSearchParams(window.location.search));
    if (browseUids.length > 0 && get(stackStore).entries.length === 0) {
      pendingBrowseStack = [...browseUids];
      browseUids.forEach(uid => fragments.ensure(uid));
    }

    const cardStackEl = document.getElementById('card-stack')!;

    function onStackClick(e: MouseEvent) {
      const target = e.target as Element;

      const closeBtn = target.closest('.stack-card-close');
      if (closeBtn) {
        const card = closeBtn.closest<HTMLElement>('.stack-card');
        if (card?.dataset.uid) closeCard(card.dataset.uid);
        return;
      }

      const pushItem = target.closest<HTMLElement>('[data-push-card]');
      if (pushItem?.dataset.pushCard) {
        // A real <a href> carrying data-push-card (e.g. a card-backed tag
        // chip) still needs a working href for no-JS/new-tab — stop the
        // browser navigating away now that the SPA push is handling it.
        e.preventDefault();
        // Home's front-page slot links now live inside the stack; pass the
        // clicked card-shaped link so the push can morph it into the new card.
        pushCard(uidToFetchUrl(pushItem.dataset.pushCard), pushItem.closest(MORPH_SOURCE_SELECTOR));
        return;
      }

      const collapsedCard = target.closest<HTMLElement>('.stack-card--collapsed');
      if (collapsedCard?.dataset.uid) {
        const slot = collapsedCard.dataset.uid;
        const entry = entryForSlot(get(stackStore), slot);
        if (!entry) return;
        stackStore.update(s => activateCardFn(s, entry.slot));
        markReadIfKnown(entry.uid, entry.slot);
        updateUrl();
      }
    }
    cardStackEl.addEventListener('click', onStackClick);

    function onHomepageClick(e: MouseEvent) {
      const link = (e.target as Element).closest<HTMLElement>('[data-push-card]');
      if (link?.dataset.pushCard) {
        e.preventDefault();
        pushCard(uidToFetchUrl(link.dataset.pushCard), link.closest(MORPH_SOURCE_SELECTOR));
      }
    }
    homepage?.addEventListener('click', onHomepageClick);

    function onDocumentClick(e: MouseEvent) {
      // `[data-replace-slot]` is handled HERE, on the document, and not in
      // onStackClick beside the other stack mutations — because the one thing
      // that emits it most is NOT inside `#card-stack`. DimensionPanel portals
      // itself to <body> to escape the stack's clipping ancestors, taking its
      // lens list with it, so a listener bound to `#card-stack` never sees a
      // lens click and selecting a lens from the dimension bar did nothing at
      // all — silently, with no error, because a delegated handler that never
      // fires looks exactly like a click on nothing.
      //
      // The emitters are three and only one of them is in the stack: the
      // portaled panel's lens rows (DimensionPanel), the capped strip's
      // terminal tile (CardStrip) and the filter-fallthrough chip
      // (LensFilterShell). Containment was never the right test.
      const replaceItem = (e.target as Element).closest<HTMLElement>('[data-replace-slot]');
      if (replaceItem?.dataset.replaceSlot) {
        // Unlike the strip lens's terminal tile (a <button>, no default action
        // to suppress), a series card-link is a real <a href> — same reason as
        // the data-push-card branch: stop the browser's own navigation now that
        // the SPA replace is handling it, or the two race and the native
        // navigation wins, discarding the rest of the stack.
        e.preventDefault();
        replaceSlot(uidToFetchUrl(replaceItem.dataset.replaceSlot), replaceItem.dataset.replaceParams);
        return;
      }

      const tagLink = (e.target as Element).closest<HTMLAnchorElement>('a[href^="tag:"]');
      if (tagLink) {
        e.preventDefault();
        pushFilteredLens(filterUrlForTagValue(tagLink.getAttribute('href')!.slice(4)));
        return;
      }
      const cardLink = (e.target as Element).closest<HTMLAnchorElement>('a[href^="card:"]');
      if (cardLink) {
        e.preventDefault();
        pushCard(uidToFetchUrl(cardLink.getAttribute('href')!.slice(5)));
        return;
      }
      const colLink = (e.target as Element).closest<HTMLAnchorElement>('a[href^="collection:"]');
      if (colLink) {
        e.preventDefault();
        const colHref = colLink.getAttribute('href')!.slice(11);
        const action = parseCollectionLink(colHref);
        pushFilteredLens(action.url);
        return;
      }
    }
    document.addEventListener('click', onDocumentClick);

    // A location (currently the active lens's LensFilterShell) reports its full
    // current param set as ordered pairs; we replace what we hold for that uid
    // and re-serialise so the params live in the stack URL. Full replacement,
    // not a partial patch — the emitter always sends its complete param state.
    // A location reports its full current param set as ordered pairs. For a
    // lens that is its filter selection, which is what the location *is* — so
    // it re-keys the entry rather than landing in the side map (issue #100).
    // The DOM/cache handle is untouched, so the reporting island survives its
    // own report; only the identity moves.
    //
    // The event names a uid, and the active location is the only one whose
    // filter panel a click can reach (everything else in the stack is
    // collapsed), so it is applied to the active entry when the uid matches.
    function onCardParam(e: Event) {
      const { uid, params } = (e as CustomEvent<{ uid: string; params: ParamPairs }>).detail;
      const state = get(stackStore);
      const active = activeEntry(state);

      if (active && active.uid === uid && isLensUid(uid)) {
        const { identity, other } = splitLocationParams(uid, params);
        const nextKey = lensEntry(lensNameForKey(uid)!, identity).key;
        if (nextKey !== active.key) cardParams.delete(active.key);
        if (other.length) cardParams.set(nextKey, other);
        else cardParams.delete(nextKey);
        stackStore.update(st => rekeyEntry(st, active.slot, nextKey));
        updateUrl('replace');
        return;
      }

      if (params.length === 0) {
        cardParams.delete(uid);
      } else {
        cardParams.set(uid, params);
      }
      updateUrl('replace');
    }
    document.addEventListener('cardparam', onCardParam);

    async function onPopstate() {
      // A popstate rebuilds the WHOLE stack from the URL — `seedStackState(null)`
      // throws the entries away and `initFromUrl` reads them back. The side
      // params have to make the same round trip (issue #103): every one of them
      // was serialised into this URL by the `updateUrl` that wrote the history
      // entry, so the URL is the complete record, and anything left in the map
      // is a param belonging to the stack the visitor just navigated *out of*.
      // Kept, it would be re-attached the next time a same-keyed location
      // appeared — a `tab=bio` from a branch you left reappearing on the card
      // you came back to.
      cardParams = new Map();
      // A popstate is a REBUILD, not a navigation: the entries come back one
      // fetch at a time and each splice ahead of the active card moves it, so
      // the correcting scrolls must not animate. Reset for the duration.
      rebuilding = true;
      // ...and it must scroll even when it lands on a shape we have already
      // scrolled for. Going back can return the stack to exactly the depth and
      // active slot it held a moment ago while the viewport is somewhere else
      // entirely — the signature guard exists to ignore re-keys, not to ignore
      // history. Clearing it makes every popstate re-place the viewport.
      lastScrollSignature = null;
      stackStore.set(seedStackState(null));
      const path = window.location.pathname;
      if (path === '/' || path === '') {
        // `/` is the home lens as the sole page-mode entry.
        await seedHomeActive(false);
        await initFromUrl();
        rebuilding = false;
        return;
      }
      if (path.startsWith('/lens/') || path.startsWith('/card/')) {
        const uid = path.startsWith('/lens/')
          ? `lens/${path.slice('/lens/'.length)}`
          : path.slice('/card/'.length);
        const entry = locationEntryFor(uid, paramsFromSearch(window.location.search));
        const ok = await fragments.ensure(entry.slot, entry.uid);
        if (ok) {
          stackStore.update(s => pushToStack(s, entry));
          markReadIfKnown(entry.uid, entry.slot);
          await initFromUrl();
        }
      }
      rebuilding = false;
    }
    window.addEventListener('popstate', onPopstate);

    return () => {
      cardStackEl.removeEventListener('click', onStackClick);
      homepage?.removeEventListener('click', onHomepageClick);
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('cardparam', onCardParam);
      window.removeEventListener('popstate', onPopstate);
    };
  });
</script>

<div id="card-stack" hidden={!hasCards} style={initialWidth ? `--max-width: ${initialWidth};` : undefined}>
  <!-- ONE node per entry, in entries order, and every one of them a
       `.stack-card` — there is no second kind of thing in the stack any more.
       The active card is the only in-flow node (it gives the container its
       height); the rest are absolutely positioned siblings placed by
       `computeGeometry`, and painting order does the occlusion.

       Keyed by SLOT, not by identity key: a lens re-keys when its filters are
       edited, and keying the block on identity would destroy and re-create the
       fragment from its server markup on every toggle, resetting the filter
       panel's own open/drill state (issue #100). It would also break the whole
       premise of the geometry — a destroyed node mounts at its destination
       instead of travelling there, so nothing animates (issue #99). -->
  <div class="card-stack-inner" bind:this={innerEl}>
    {#each $stackStore.entries as entry (entry.slot)}
      {#if entry.slot === ssrSlot}
        <!-- The SSR-seeded location, rendered from Astro slot content rather
             than from the fragment cache (issue #121). It is the same kind of
             node in the same keyed block as every other entry — what differs
             is only where its markup came from, and that its DOM is ADOPTED by
             hydration rather than created, which is what keeps the nested
             `<astro-island>`s inside it (the lens filter panel, the browse
             results) alive to hydrate. The `<astro-slot>` wrapper Astro emits
             around it is `display: contents`, so it generates no box and the
             geometry places the card exactly as before. -->
        {@render children?.()}
      {:else}
        <StackFragment html={fragments.get(entry.slot) ?? ''} />
      {/if}
    {/each}

    <!-- The overflow representation (issue #111). Island-owned, NOT fragment
         markup: a fragment is a location rendered on its own and knows nothing
         about where it sits in the stack, and "how many cards are hidden behind
         me" is the most stack-positional fact there is.

         Keyed by SIDE, not by label slot. There is at most one pile per side,
         and its label card changes as the stack grows — keyed by slot the
         overlay would be destroyed and rebuilt on every push, mounting at its
         destination instead of travelling there, which is the same identity
         trap the cards themselves have (#99 trap 4).

         The label and the bands are BOTH always rendered and both in the tab
         order; hover and focus-within only swap which one is painted. Bands
         hidden with `display: none` could not be focused, and focus is how a
         keyboard reaches a hidden card at all. -->
    {#each geometry.piles as pile (pile.side)}
      <div
        class="stack-pile"
        data-side={pile.side}
        style="--geo-left: {pile.left}px; --geo-top: {pile.top}px; --geo-z: {pile.z}; --card-surface: var(--dither-{pile.dither});"
      >
        <div class="stack-pile-inner">
          <span class="stack-pile-label" aria-hidden="true">{pile.count} more</span>
          <div class="stack-pile-bands">
            {#each pile.bands as band (band.slot)}
              <button
                class="stack-pile-band"
                type="button"
                onclick={() => activateBand(band.slot)}
              >
                <span class="stack-pile-band-text">{bandLabel(band)}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
