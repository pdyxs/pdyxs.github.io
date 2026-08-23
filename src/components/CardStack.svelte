<script lang="ts">
  import { onMount, tick, untrack, flushSync } from 'svelte';
  import { get } from 'svelte/store';
  import { stackStore, seedStackState, pushToStack, activateCard as activateCardFn, replaceActiveSlot, rekeyEntry } from '../stores/card-stack-store';
  import { cardEntry, lensEntry, locationKind, presentationMode, withFreeSlot, slotForKey, entryForSlot, activeEntry } from '../lib/stack-layout';
  import type { LocationEntry } from '../lib/stack-layout';
  import { geometryFor, STACK_GEOMETRY } from '../lib/stack-geometry';
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
  import { markRead, readToRecord } from '../lib/card-view-state';
  import { waitForTransition } from '../lib/transition-wait';
  import StackFragment from './StackFragment.svelte';
  import {
    createCardFragments,
    extractLocationWidth,
    titleOfElement,
    uidToFetchUrl,
    urlToUid,
  } from '../lib/card-fragments';

  interface Props {
    activeUid?: string;
    activeHtml?: string | null;
  }

  let { activeUid, activeHtml }: Props = $props();

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
  untrack(() => {
    let entry: LocationEntry | null = null;
    if (activeUid && activeHtml) {
      fragments.seed(activeUid, activeHtml);
      // A lens cold-loaded with `?filter.…` is *that filtered location*, not the
      // bare lens that happens to have a query string beside it — so the entry
      // is built from the URL, not from the uid alone (issue #100).
      const search = typeof window === 'undefined' ? '' : window.location.search;
      entry = locationEntryFor(activeUid, paramsFromSearch(search));
    }
    stackStore.set(seedStackState(entry));
  });

  // Per-location responsive width (issue #27): a plain, non-reactive value
  // captured once from the SSR-active location's rendered fragment. Rendered
  // as a static inline style below so the correct --max-width is present in
  // the very first paint, before hydration — the $effect further down keeps
  // it in sync as the stack changes thereafter (mirrors --behind-slots /
  // --ahead-slots, which are also effect-owned post-mount).
  const initialWidth = untrack(() => activeUid ? extractLocationWidth(activeHtml ?? undefined) : undefined);

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
    const ro = new ResizeObserver(([e]) => { activeWidth = e.contentRect.width; });
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
    const width = activeSlot ? fragments.factsFor(activeSlot).width : undefined;
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

  // --- Helpers ---

  const HOME_UID = 'lens/home';

  /** Safety net for the closing card's collapse, which `global.css` declares at
   *  300ms on `.body-wrapper`. Slack, not a duration: `waitForTransition`
   *  resolves on the event and clears this, so it only ever fires when no
   *  `transitionend` arrives at all. */
  const BODY_COLLAPSE_FALLBACK_MS = 400;

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

    stackStore.update(s => replaceActiveSlot(s, incoming));
    updateUrl('replace');
  }

  async function pushCard(url: string, clickedLink?: Element | null, params: ParamPairs = []) {
    const state = get(stackStore);
    const target = locationEntryFor(urlToUid(url), params);

    // Already in stack → just activate. Identity, not uid: a lens filtered to
    // puzzles and the same lens filtered to Norway are two locations, so only
    // an identically-filtered link re-activates (issue #100).
    const existing = state.entries.find(e => e.key === target.key);
    if (existing) {
      stackStore.update(s => activateCardFn(s, existing.slot));
      markReadIfKnown(existing.uid, existing.slot);
      updateUrl();
      await tick();
      elFor(existing.slot)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const entry = withFreeSlot(state.entries, target);
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
      fragments.seedPlaceholder(slot, titleOfElement(clickedLink) ?? uid);
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
        if (!fragments.has(pendingUid)) fragments.seedPlaceholder(pendingUid, pendingUid);
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
        if (wasHomePageMode) {
          const t = newCard?.querySelector<HTMLElement>('.card-header-title');
          const d = newCard?.querySelector<HTMLElement>('.card-header');
          if (t) t.style.viewTransitionName = 'home-title';
          if (d) d.style.viewTransitionName = 'home-divider';
        } else if (newCard) {
          newCard.style.viewTransitionName = 'panel-card-open';
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
    }

    markReadIfKnown(uid, slot);
    updateUrl();
    elFor(slot)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        await waitForTransition(bw, 'grid-template-rows', BODY_COLLAPSE_FALLBACK_MS);
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
      await tick();
      elFor(newActive.slot)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

    if (parsed.entries.length <= 1) return;

    const activeIdxInParsed = parsed.entries.findIndex(e => e.slot === parsed.activeSlot);
    const fromLocations = parsed.entries.slice(0, activeIdxInParsed);
    const toLocations = parsed.entries.slice(activeIdxInParsed + 1);

    for (const location of fromLocations) {
      const ok = await fragments.ensure(location.slot, location.uid);
      if (ok) {
        const entryParams = paramsByKey.get(location.key);
        if (entryParams?.length) cardParams.set(location.key, entryParams);
        stackStore.update(s => {
          const activeIdx = s.entries.findIndex(e => e.slot === s.activeSlot);
          const newEntries = activeIdx >= 0
            ? [...s.entries.slice(0, activeIdx), location, ...s.entries.slice(activeIdx)]
            : [location, ...s.entries];
          return { ...s, entries: newEntries };
        });
      }
    }
    for (const location of toLocations) {
      const ok = await fragments.ensure(location.slot, location.uid);
      if (ok) {
        const entryParams = paramsByKey.get(location.key);
        if (entryParams?.length) cardParams.set(location.key, entryParams);
        stackStore.update(s => ({ ...s, entries: [...s.entries, location] }));
      }
    }
  }

  onMount(() => {
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

    // Restore from/to context cards in URL
    initFromUrl();

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

      const replaceItem = target.closest<HTMLElement>('[data-replace-slot]');
      if (replaceItem?.dataset.replaceSlot) {
        replaceSlot(uidToFetchUrl(replaceItem.dataset.replaceSlot), replaceItem.dataset.replaceParams);
        return;
      }

      const pushItem = target.closest<HTMLElement>('[data-push-card]');
      if (pushItem?.dataset.pushCard) {
        // A real <a href> carrying data-push-card (e.g. a card-backed tag
        // chip) still needs a working href for no-JS/new-tab — stop the
        // browser navigating away now that the SPA push is handling it.
        e.preventDefault();
        // Home's front-page slot links now live inside the stack; pass the
        // clicked `.card-link` so the push can morph it into the new card.
        pushCard(uidToFetchUrl(pushItem.dataset.pushCard), pushItem.closest('.card-link'));
        return;
      }

      const collapsedCard = target.closest<HTMLElement>('.stack-card--collapsed');
      if (collapsedCard?.dataset.uid) {
        const slot = collapsedCard.dataset.uid;
        const entry = entryForSlot(get(stackStore), slot);
        if (!entry) return;
        stackStore.update(s => activateCardFn(s, entry.slot));
        markReadIfKnown(entry.uid, entry.slot);
        collapsedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        updateUrl();
      }
    }
    cardStackEl.addEventListener('click', onStackClick);

    function onHomepageClick(e: MouseEvent) {
      const link = (e.target as Element).closest<HTMLElement>('[data-push-card]');
      if (link?.dataset.pushCard) {
        e.preventDefault();
        pushCard(uidToFetchUrl(link.dataset.pushCard), link.closest('.card-link'));
      }
    }
    homepage?.addEventListener('click', onHomepageClick);

    function onDocumentClick(e: MouseEvent) {
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
      stackStore.set(seedStackState(null));
      const path = window.location.pathname;
      if (path === '/' || path === '') {
        // `/` is the home lens as the sole page-mode entry.
        await seedHomeActive(false);
        await initFromUrl();
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
      <StackFragment html={fragments.get(entry.slot) ?? ''} />
    {/each}
  </div>
</div>
