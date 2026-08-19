<script lang="ts">
  import { onMount, tick, untrack, flushSync } from 'svelte';
  import { get } from 'svelte/store';
  import { stackStore, pushToStack, activateCard as activateCardFn, replaceActiveSlot } from '../stores/card-stack-store';
  import { computeStackLayout, cardEntry, lensEntry, locationKind, presentationMode } from '../lib/stack-layout';
  import { serialiseStack, deserialiseStack } from '../lib/stack-codec';
  import type { ParamPairs } from '../lib/stack-codec';
  import { paramsAfterSlotReplace } from '../lib/slot-params';
  import { manifestLookup } from '../lib/stack-manifest-client';
  import { tagManifestLookup } from '../lib/tag-manifest-client';
  import { parseCollectionLink } from '../lib/collection-link';
  import { stackFromParams } from '../lib/browse-stack';
  import { filterUrlForTagValue } from '../dimensions';
  import { markRead, readToRecord } from '../lib/card-view-state';
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
    onChange: (key) => {
      if (key === get(stackStore).activeKey) applyMaxWidth(key);
    },
  });
  // Per-location URL params, stored as ordered pairs so repeated keys (e.g. a
  // lens's multi-value `filter.what=a&filter.what=b` selections) survive the
  // round-trip through serialiseStack — a plain Record would collapse repeats.
  let cardParams = new Map<string, ParamPairs>();
  // Keys to skip body-open in $effect during VT push (body opens after vt.finished)
  let skipBodyOpen = new Set<string>();
  let overflowElLeft = $state<HTMLElement | null>(null);
  let overflowElRight = $state<HTMLElement | null>(null);
  let overflowOpen = $state<'left' | 'right' | false>(false);
  let startVT: ((cb: () => void) => { finished: Promise<void> }) | undefined;
  // UIDs from the browse-page `stack` URL param, consumed on the first card push
  let pendingBrowseStack: string[] = [];

  // Seed store from SSR prop once at mount — untrack to silence reactive-capture warning.
  untrack(() => {
    if (activeUid && activeHtml) {
      fragments.seed(activeUid, activeHtml);
      stackStore.set({ entries: [cardEntry(activeUid)], activeKey: activeUid });
    }
  });

  // Per-location responsive width (issue #27): a plain, non-reactive value
  // captured once from the SSR-active location's rendered fragment. Rendered
  // as a static inline style below so the correct --max-width is present in
  // the very first paint, before hydration — the $effect further down keeps
  // it in sync as the stack changes thereafter (mirrors --num-left-collapsed
  // / --num-right-collapsed, which is also effect-owned post-mount).
  const initialWidth = untrack(() => activeUid ? extractLocationWidth(activeHtml ?? undefined) : undefined);

  const layout = $derived(computeStackLayout($stackStore));
  const hasCards = $derived($stackStore.entries.length > 0);

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
  function applyMaxWidth(activeKey: string | null) {
    // The island is server-rendered too, and the fragment store's onChange can
    // fire there (the SSR seed above is a write). There is no document to apply
    // anything to on that pass — the first paint gets its width from the
    // `initialWidth` inline style instead.
    if (typeof document === 'undefined') return;
    const width = activeKey ? fragments.factsFor(activeKey).width : undefined;
    const stackEl = document.getElementById('card-stack');
    if (width) {
      document.documentElement.style.setProperty('--max-width', width);
      stackEl?.style.setProperty('--max-width', width);
    } else {
      document.documentElement.style.removeProperty('--max-width');
      stackEl?.style.removeProperty('--max-width');
    }
  }

  $effect(() => {
    const stackEl = document.getElementById('card-stack');
    stackEl?.style.setProperty('--num-left-collapsed', String(layout.numLeftCollapsed));
    stackEl?.style.setProperty('--num-right-collapsed', String(layout.numRightCollapsed));
    applyMaxWidth($stackStore.activeKey);

    const depth = $stackStore.entries.length;
    for (const card of layout.visible) {
      const el = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(card.key)}"]`);
      if (!el) continue;
      el.classList.toggle('stack-card--active', card.isActive);
      el.classList.toggle('stack-card--collapsed', card.isCollapsed);
      // Chrome is a pure function of stack position: a lens that is the sole
      // entry renders page-mode chrome, everything else card-mode.
      el.classList.toggle('stack-card--page', presentationMode(locationKind(card.key), depth) === 'page');
      el.style.setProperty('--stack-index', String(card.stackIndex));
      el.dataset.side = card.side;
      const bw = el.querySelector<HTMLElement>('.body-wrapper');
      // During VT push, suppress body-open until vt.finished
      if (bw) bw.classList.toggle('open', card.isActive && !skipBodyOpen.has(card.key));
    }
  });

  $effect(() => {
    if (!overflowOpen) return;
    function dismissHandler(e: MouseEvent) {
      const path = e.composedPath();
      if (overflowElLeft && path.includes(overflowElLeft)) return;
      if (overflowElRight && path.includes(overflowElRight)) return;
      overflowOpen = false;
    }
    document.addEventListener('click', dismissHandler, { capture: true });
    return () => document.removeEventListener('click', dismissHandler, { capture: true });
  });

  // --- Helpers ---

  const HOME_UID = 'lens/home';

  // Synchronously make the home lens the sole, active, page-mode entry — the
  // state `/` cold-loads into. Home must already be cached (see seedHomeActive).
  function applyHomeSeed() {
    stackStore.set({ entries: [lensEntry('home')], activeKey: HOME_UID });
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

  function getCardTitle(key: string): string {
    return fragments.factsFor(key).title ?? key;
  }

  // Records the view-state transition to 'read' for a location we hold the HTML
  // for. `readToRecord` owns the decision (card locations with a rendered
  // data-content-hash, nothing else); this is the thin write.
  function markReadIfKnown(key: string) {
    const record = readToRecord(key, fragments.get(key));
    if (record) markRead(record.uid, record.hash);
  }

  function toggleOverflow(side: 'left' | 'right') {
    overflowOpen = overflowOpen === side ? false : side;
  }

  function activateHidden(key: string) {
    stackStore.update(s => activateCardFn(s, key));
    markReadIfKnown(key);
    overflowOpen = false;
    updateUrl();
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
    const ok = await fragments.ensure(uid);
    if (!ok) return;

    const carried: ParamPairs = [];
    if (extraParams) new URLSearchParams(extraParams).forEach((v, k) => { carried.push([k, v]); });
    cardParams = paramsAfterSlotReplace(cardParams, get(stackStore).activeKey, uid, carried);

    stackStore.update(s => replaceActiveSlot(s, cardEntry(uid)));
    updateUrl('replace');
  }

  async function pushCard(url: string, clickedLink?: Element | null) {
    const uid = urlToUid(url);
    const state = get(stackStore);

    // Already in stack → just activate
    if (state.entries.some(e => e.key === uid)) {
      stackStore.update(s => activateCardFn(s, uid));
      markReadIfKnown(uid);
      updateUrl();
      await tick();
      document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    // Pushing the first card while home is the sole page-mode entry: the home
    // title + divider morph into the new card's header (issue #24). Detected
    // before the store mutates.
    const wasHomePageMode =
      state.entries.length === 1 &&
      state.entries[0].key === HOME_UID &&
      state.activeKey === HOME_UID;

    const alreadyCached = fragments.has(uid);

    // Start network fetch immediately, before any VT
    const networkFetch: Promise<string | null> = alreadyCached
      ? Promise.resolve(null)
      : fragments.load(uid);

    // If we have a link to click and VT support, seed cache with a placeholder
    // so the VT can start immediately without waiting for the network
    const usePlaceholder = !alreadyCached && clickedLink != null && startVT != null;
    if (usePlaceholder) {
      fragments.seedPlaceholder(uid, titleOfElement(clickedLink) ?? uid);
    } else if (!alreadyCached) {
      // No VT possible — wait for real content before showing anything
      const html = await networkFetch;
      if (!html) return;
      fragments.seed(uid, html);
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
        const activeIdx = state.activeKey
          ? state.entries.findIndex(e => e.key === state.activeKey)
          : state.entries.length - 1;
        const base = activeIdx >= 0 ? { ...state, entries: state.entries.slice(0, activeIdx + 1) } : state;
        return pushToStack(base, cardEntry(uid));
      });
    };

    const homepage = document.getElementById('homepage');

    if ((clickedLink || wasHomePageMode) && startVT) {
      // Phase 1: seed the outgoing VT names. From home page mode we morph the
      // page title/divider into the new card's header; otherwise the clicked
      // panel link morphs into the card header position.
      skipBodyOpen.add(uid);
      let homeTitle: HTMLElement | null = null;
      let homeDivider: HTMLElement | null = null;
      if (wasHomePageMode) {
        const homeEl = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(HOME_UID)}"]`);
        homeTitle = homeEl?.querySelector<HTMLElement>('.page-title') ?? null;
        homeDivider = homeEl?.querySelector<HTMLElement>('.page-header') ?? null;
        if (homeTitle) homeTitle.style.viewTransitionName = 'home-title';
        if (homeDivider) homeDivider.style.viewTransitionName = 'home-divider';
      } else if (clickedLink) {
        (clickedLink as HTMLElement).style.viewTransitionName = 'panel-card-open';
      }

      const vt = startVT(() => {
        flushSync(doUpdate);
        const newCard = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
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
      skipBodyOpen.delete(uid);
      if (homeTitle) homeTitle.style.viewTransitionName = '';
      if (homeDivider) homeDivider.style.viewTransitionName = '';
      if (clickedLink && !wasHomePageMode) (clickedLink as HTMLElement).style.viewTransitionName = '';
      const vtCard = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
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
          fragments.replaceBody(uid, html, document.querySelector(`[data-uid="${CSS.escape(uid)}"]`));
        }
        // One rAF so the browser paints the closed card before we start opening it
        await new Promise<void>(r => requestAnimationFrame(() => r()));
      }

      document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`)
        ?.querySelector<HTMLElement>('.body-wrapper')?.classList.add('open');
    } else {
      // Instant fallback (no VT support or no clicked link)
      doUpdate();
      if (homepage) homepage.hidden = true;
      await tick();
    }

    markReadIfKnown(uid);
    updateUrl();
    document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Pushes a browse-lens URL carrying a `filter.<dim>=...` query (built by
  // parseCollectionLink/filterUrlForTagValue) through the normal
  // fetch-and-splice stack model — "browse with filter X" is just another
  // lens location, never a full-page reload (issue #26). The query rides as
  // cardParams on the clean lens uid rather than embedded in the uid itself,
  // reusing the same per-key params serialiseStack already supports.
  function pushFilteredLens(url: string) {
    const qIdx = url.indexOf('?');
    const path = qIdx === -1 ? url : url.slice(0, qIdx);
    const uid = urlToUid(path);
    if (qIdx !== -1) {
      const pairs: ParamPairs = [];
      new URLSearchParams(url.slice(qIdx + 1)).forEach((v, k) => { pairs.push([k, v]); });
      cardParams.set(uid, pairs);
    }
    pushCard(path);
  }

  async function closeCard(uid: string) {
    const state = get(stackStore);
    const idx = state.entries.findIndex(e => e.key === uid);
    if (idx === -1) return;

    cardParams.delete(uid);
    const newEntries = state.entries.slice(0, idx);

    if (newEntries.length === 0) {
      // Stack becomes empty (a deep-linked card closed) — return to the home
      // lens, which becomes the sole page-mode entry. Animate the closing card
      // shut first so the return reads as a collapse, not a jump.
      const el = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
      const bw = el?.querySelector<HTMLElement>('.body-wrapper');
      if (bw) {
        bw.classList.remove('open');
        await new Promise<void>(resolve => {
          const onEnd = (e: Event) => {
            if ((e as TransitionEvent).propertyName === 'grid-template-rows') {
              bw.removeEventListener('transitionend', onEnd);
              resolve();
            }
          };
          bw.addEventListener('transitionend', onEnd);
          setTimeout(resolve, 400);
        });
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
      const newActiveKey = newEntries[newEntries.length - 1].key;
      stackStore.update(s => ({ ...s, entries: newEntries, activeKey: newActiveKey }));
      updateUrl();
      await tick();
      document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(newActiveKey)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function initFromUrl() {
    const { state: parsed, paramsByKey } = deserialiseStack(window.location.pathname, window.location.search, manifestLookup, tagManifestLookup);

    // Capture the active location's own params (e.g. a lens's filter.* query on
    // a cold load or a shared link) even when it's the sole entry — otherwise
    // the first card push serialises the lens with no filters and drops them.
    if (parsed.activeKey) {
      const activeParams = paramsByKey.get(parsed.activeKey);
      if (activeParams?.length) cardParams.set(parsed.activeKey, activeParams);
    }

    if (parsed.entries.length <= 1) return;

    const activeIdxInParsed = parsed.entries.findIndex(e => e.key === parsed.activeKey);
    const fromLocations = parsed.entries.slice(0, activeIdxInParsed);
    const toLocations = parsed.entries.slice(activeIdxInParsed + 1);

    for (const location of fromLocations) {
      const ok = await fragments.ensure(location.uid);
      if (ok) {
        const entryParams = paramsByKey.get(location.key);
        if (entryParams?.length) cardParams.set(location.key, entryParams);
        stackStore.update(s => {
          const activeIdx = s.entries.findIndex(e => e.key === s.activeKey);
          const newEntries = activeIdx >= 0
            ? [...s.entries.slice(0, activeIdx), location, ...s.entries.slice(activeIdx)]
            : [location, ...s.entries];
          return { ...s, entries: newEntries };
        });
      }
    }
    for (const location of toLocations) {
      const ok = await fragments.ensure(location.uid);
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
        const key = collapsedCard.dataset.uid;
        stackStore.update(s => activateCardFn(s, key));
        markReadIfKnown(key);
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
    function onCardParam(e: Event) {
      const { uid, params } = (e as CustomEvent<{ uid: string; params: ParamPairs }>).detail;
      if (params.length === 0) {
        cardParams.delete(uid);
      } else {
        cardParams.set(uid, params);
      }
      updateUrl('replace');
    }
    document.addEventListener('cardparam', onCardParam);

    async function onPopstate() {
      stackStore.set({ entries: [], activeKey: null });
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
        const ok = await fragments.ensure(uid);
        if (ok) {
          const entry = uid.startsWith('lens/') ? lensEntry(uid.slice('lens/'.length)) : cardEntry(uid);
          stackStore.update(s => pushToStack(s, entry));
          markReadIfKnown(uid);
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
  <div class="card-stack-inner">
  {#each layout.renderItems as item (item.kind === 'card' ? 'card-' + item.key : item.kind === 'fan-corner' ? 'fc-' + item.forKey : 'overflow-' + item.side)}
    {#if item.kind === 'card' && item.side === 'active'}
      <div class="active-card-col">
        {@html fragments.get(item.key) ?? ''}
      </div>
    {:else if item.kind === 'card'}
      {@html fragments.get(item.key) ?? ''}
    {:else if item.kind === 'fan-corner'}
      <div class="fan-corner" style="--i:{item.i}; --n:{item.n}"></div>
    {:else if item.kind === 'overflow' && item.side === 'left'}
      <div
        class="stack-overflow stack-overflow--left"
        class:stack-overflow--expanded={overflowOpen === 'left'}
        style="--stack-index:{item.stackIndex}; --i:{item.stackIndex}; --n:{layout.numLeftCollapsed}"
        bind:this={overflowElLeft}
        role="button"
        tabindex="0"
        onclick={() => toggleOverflow('left')}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOverflow('left'); } }}
      >
        <span class="stack-overflow-label">⋯</span>
        {#if overflowOpen === 'left'}
          <div class="stack-overflow-panel">
            {#each item.hiddenKeys as key}
              <button class="stack-overflow-item" onclick={(e) => { e.stopPropagation(); activateHidden(key); }}>
                {getCardTitle(key)}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else if item.kind === 'overflow' && item.side === 'right'}
      <div
        class="stack-overflow stack-overflow--right"
        class:stack-overflow--expanded={overflowOpen === 'right'}
        style="--stack-index:{item.stackIndex}"
        bind:this={overflowElRight}
        role="button"
        tabindex="0"
        onclick={() => toggleOverflow('right')}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOverflow('right'); } }}
      >
        <span class="stack-overflow-label">⋯</span>
        {#if overflowOpen === 'right'}
          <div class="stack-overflow-panel">
            {#each item.hiddenKeys as key}
              <button class="stack-overflow-item" onclick={(e) => { e.stopPropagation(); activateHidden(key); }}>
                {getCardTitle(key)}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
  </div>
</div>
