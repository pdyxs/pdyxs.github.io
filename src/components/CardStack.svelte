<script lang="ts">
  import { onMount, tick, untrack, flushSync } from 'svelte';
  import { get } from 'svelte/store';
  import { stackStore, pushToStack, activateCard as activateCardFn, replaceActiveSlot } from '../stores/card-stack-store';
  import { computeStackLayout, cardEntry, lensEntry, locationKind, presentationMode } from '../lib/stack-layout';
  import { serialiseStack, deserialiseStack } from '../lib/stack-codec';
  import type { ParamPairs } from '../lib/stack-codec';
  import { manifestLookup } from '../lib/stack-manifest-client';
  import { parseCollectionLink } from '../lib/collection-link';
  import { stackFromParams } from '../lib/browse-stack';
  import { filterUrlForTagValue } from '../lib/filters';
  import { markRead } from '../lib/card-view-state';
  import { extractLocationWidth } from '../lib/location-width';

  interface Props {
    activeUid?: string;
    activeHtml?: string | null;
  }

  let { activeUid, activeHtml }: Props = $props();

  // Keyed by LocationEntry.key (== uid for card locations, see stack-layout.ts).
  let cardHtmlCache = $state(new Map<string, string>());
  let cardParams = new Map<string, Record<string, string>>();
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
      cardHtmlCache.set(activeUid, activeHtml);
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
  // Not folded into cardHtmlCache reactivity: cardHtmlCache is a plain
  // `$state(new Map())`, which Svelte does not deep-proxy — a bare `.set()`
  // doesn't retrigger effects that only read via `.get()`. That's fine for
  // the common case (cache is populated before the store changes), but
  // pushCard's placeholder→real-content swap populates the cache with real
  // content *after* the store already changed, so that path calls this
  // explicitly once the real fragment lands (mirrors why that swap already
  // patches .stack-card-body-inner by hand rather than relying on reactivity).
  function applyMaxWidth(activeKey: string | null) {
    const stackEl = document.getElementById('card-stack');
    const width = activeKey ? extractLocationWidth(cardHtmlCache.get(activeKey)) : undefined;
    if (width) stackEl?.style.setProperty('--max-width', width);
    else stackEl?.style.removeProperty('--max-width');
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

  // Lens locations fetch their lean fragment; cards fetch their /card page.
  // Both return a `.stack-card` element we splice into the stack.
  function uidToFetchUrl(uid: string): string {
    if (uid.startsWith('lens/')) return `/fragment/lens/${uid.slice('lens/'.length)}`;
    return `/card/${uid}`;
  }

  function urlToUid(url: string): string {
    if (url.startsWith('/fragment/lens/')) return `lens/${url.slice('/fragment/lens/'.length)}`;
    if (url.startsWith('/lens/')) return `lens/${url.slice('/lens/'.length)}`;
    return url.startsWith('/card/') ? url.slice('/card/'.length) : url;
  }

  // Synchronously make the home lens the sole, active, page-mode entry — the
  // state `/` cold-loads into. Home must already be cached (see seedHomeActive).
  function applyHomeSeed() {
    stackStore.set({ entries: [lensEntry('home')], activeKey: HOME_UID });
  }

  // Seeds the home lens as the sole active entry, fetching it first if needed.
  // Used when a deep-linked card is closed down to empty, or on popstate to `/`.
  async function seedHomeActive(pushUrl = true) {
    const ok = await fetchAndCacheCard(HOME_UID);
    if (!ok) {
      window.location.href = '/';
      return;
    }
    applyHomeSeed();
    if (pushUrl) history.pushState(null, '', '/');
  }

  function getCardTitle(key: string): string {
    const html = cardHtmlCache.get(key);
    if (!html) return key;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.querySelector('.card-header-title')?.textContent?.trim() ?? key;
  }

  // Reads the data-content-hash the card's own page rendered (see
  // card/[...path].astro) and records the view-state transition to 'read'.
  // No-op if the card's HTML isn't cached yet or carries no hash (e.g. a
  // collection view has no single card identity to hash).
  function markReadIfKnown(key: string) {
    const html = cardHtmlCache.get(key);
    if (!html) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const hash = tmp.querySelector('.stack-card')?.getAttribute('data-content-hash');
    if (hash) markRead(key, hash);
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

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildPlaceholderHtml(uid: string, title: string): string {
    return `<div class="stack-card" data-uid="${escapeHtml(uid)}">` +
      `<div class="card-header">` +
      `<span class="card-header-title"><b>${escapeHtml(title)}</b></span>` +
      `<button class="stack-card-close" aria-label="Close">×</button>` +
      `</div>` +
      `<div class="body-wrapper"><div class="stack-card-body"><div class="stack-card-body-inner"></div></div></div>` +
      `</div>`;
  }

  async function fetchCardHtmlFromNetwork(uid: string): Promise<string | null> {
    const res = await fetch(uidToFetchUrl(uid));
    if (!res.ok) return null;
    const tmp = document.createElement('div');
    tmp.innerHTML = await res.text();
    return tmp.querySelector('.stack-card')?.outerHTML ?? null;
  }

  async function fetchAndCacheCard(uid: string): Promise<boolean> {
    if (cardHtmlCache.has(uid)) return true;
    const html = await fetchCardHtmlFromNetwork(uid);
    if (!html) return false;
    cardHtmlCache.set(uid, html);
    return true;
  }

  function updateUrl(method: 'push' | 'replace' = 'push') {
    const state = get(stackStore);
    const historyFn = method === 'replace' ? history.replaceState.bind(history) : history.pushState.bind(history);

    const paramsByKey = new Map<string, ParamPairs>();
    for (const [key, params] of cardParams) {
      const entries = Object.entries(params).filter(([, v]) => v != null) as ParamPairs;
      if (entries.length) paramsByKey.set(key, entries);
    }

    let { path, search } = serialiseStack(state, paramsByKey, manifestLookup);
    // `/` is the prettier address for the home lens as the sole entry.
    if (path === '/lens/home' && search === '') path = '/';
    historyFn(null, '', `${path}${search}`);
  }

  // `extraParams` (e.g. a serialised FilterState query string) rides along
  // for a replace that must carry the current filter selections into the new
  // slot — e.g. selecting a lens from a DimensionPanel while filters are
  // active (issue #25). Appended to the URL after the stack's own
  // serialisation so the new location's client-side filter state (which
  // reads window.location.search on mount) picks it up.
  async function replaceSlot(url: string, extraParams?: string) {
    const uid = urlToUid(url);
    const ok = await fetchAndCacheCard(uid);
    if (!ok) return;
    stackStore.update(s => replaceActiveSlot(s, cardEntry(uid)));
    updateUrl('replace');
    if (extraParams) {
      const carried = new URLSearchParams(extraParams);
      if ([...carried].length) {
        const target = new URL(window.location.href);
        for (const [k, v] of carried) target.searchParams.append(k, v);
        history.replaceState(null, '', `${target.pathname}?${target.searchParams.toString()}`);
      }
    }
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

    const alreadyCached = cardHtmlCache.has(uid);

    // Start network fetch immediately, before any VT
    const networkFetch: Promise<string | null> = alreadyCached
      ? Promise.resolve(null)
      : fetchCardHtmlFromNetwork(uid);

    // If we have a link to click and VT support, seed cache with a placeholder
    // so the VT can start immediately without waiting for the network
    const usePlaceholder = !alreadyCached && clickedLink != null && startVT != null;
    if (usePlaceholder) {
      const title = (clickedLink as Element).querySelector('.card-header-title')?.textContent?.trim() ?? uid;
      cardHtmlCache.set(uid, buildPlaceholderHtml(uid, title));
    } else if (!alreadyCached) {
      // No VT possible — wait for real content before showing anything
      const html = await networkFetch;
      if (!html) return;
      cardHtmlCache.set(uid, html);
    }

    const doUpdate = () => {
      // Consume the browse-page stack context on the first push from the filter page.
      // Runs inside flushSync (VT path) or directly, so both paths get the seeding.
      const toSeed = pendingBrowseStack;
      pendingBrowseStack = [];
      for (const pendingUid of toSeed) {
        if (!cardHtmlCache.has(pendingUid)) {
          cardHtmlCache.set(pendingUid, buildPlaceholderHtml(pendingUid, pendingUid));
        }
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
          cardHtmlCache.set(uid, html); // update cache for future navigations
          const card = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
          if (card) {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const realBodyInner = tmp.querySelector('.stack-card-body-inner');
            const existingBodyInner = card.querySelector('.stack-card-body-inner');
            if (realBodyInner && existingBodyInner) {
              existingBodyInner.innerHTML = realBodyInner.innerHTML;
            }
          }
          // The layout $effect already ran against the placeholder (no
          // data-width) when the store changed; the real fragment's width
          // only lands in cardHtmlCache now, so reapply explicitly.
          applyMaxWidth(uid);
        }
        // One rAF so the browser paints the closed card before we start opening it
        await new Promise<void>(r => requestAnimationFrame(r));
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
      const params: Record<string, string> = {};
      new URLSearchParams(url.slice(qIdx + 1)).forEach((v, k) => { params[k] = v; });
      cardParams.set(uid, params);
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

      const ok = await fetchAndCacheCard(HOME_UID);
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
    const { state: parsed, paramsByKey } = deserialiseStack(window.location.pathname, window.location.search, manifestLookup);
    if (parsed.entries.length <= 1) return;

    const activeIdxInParsed = parsed.entries.findIndex(e => e.key === parsed.activeKey);
    const fromLocations = parsed.entries.slice(0, activeIdxInParsed);
    const toLocations = parsed.entries.slice(activeIdxInParsed + 1);

    for (const location of fromLocations) {
      const ok = await fetchAndCacheCard(location.uid);
      if (ok) {
        const entryParams = paramsByKey.get(location.key);
        if (entryParams?.length) cardParams.set(location.key, Object.fromEntries(entryParams));
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
      const ok = await fetchAndCacheCard(location.uid);
      if (ok) {
        const entryParams = paramsByKey.get(location.key);
        if (entryParams?.length) cardParams.set(location.key, Object.fromEntries(entryParams));
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

    // Restore from/to context cards in URL
    initFromUrl();

    // If on the filter page with a browse stack, prefetch those cards so they're
    // ready to seed the store the moment the user opens their first card.
    const browseUids = stackFromParams(new URLSearchParams(window.location.search));
    if (browseUids.length > 0 && get(stackStore).entries.length === 0) {
      pendingBrowseStack = [...browseUids];
      browseUids.forEach(uid => fetchAndCacheCard(uid));
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

    function onCardParam(e: Event) {
      const { uid, params } = (e as CustomEvent<{ uid: string; params: Record<string, string | null> }>).detail;
      const filtered = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null)
      ) as Record<string, string>;
      if (Object.keys(filtered).length === 0) {
        cardParams.delete(uid);
      } else {
        cardParams.set(uid, filtered);
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
        const ok = await fetchAndCacheCard(uid);
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
        {@html cardHtmlCache.get(item.key) ?? ''}
      </div>
    {:else if item.kind === 'card'}
      {@html cardHtmlCache.get(item.key) ?? ''}
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
