<script lang="ts">
  import { onMount, tick, untrack, flushSync } from 'svelte';
  import { get } from 'svelte/store';
  import { stackStore, pushToStack, activateCard as activateCardFn, replaceActiveSlot } from '../stores/card-stack-store';
  import { computeStackLayout, cardEntry } from '../lib/stack-layout';
  import { serialiseStack, deserialiseStack } from '../lib/stack-codec';
  import type { ParamPairs } from '../lib/stack-codec';
  import { manifestLookup } from '../lib/stack-manifest-client';
  import { parseCollectionLink } from '../lib/collection-link';
  import { appendStackToUrl, stackFromParams } from '../lib/browse-stack';
  import { filterUrlForTagValue } from '../lib/filters';
  import { markRead } from '../lib/card-view-state';

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

  const layout = $derived(computeStackLayout($stackStore));
  const hasCards = $derived($stackStore.entries.length > 0);

  $effect(() => {
    const stackEl = document.getElementById('card-stack');
    stackEl?.style.setProperty('--num-left-collapsed', String(layout.numLeftCollapsed));
    stackEl?.style.setProperty('--num-right-collapsed', String(layout.numRightCollapsed));

    for (const card of layout.visible) {
      const el = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(card.key)}"]`);
      if (!el) continue;
      el.classList.toggle('stack-card--active', card.isActive);
      el.classList.toggle('stack-card--collapsed', card.isCollapsed);
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

  function uidToFetchUrl(uid: string): string {
    return `/card/${uid}`;
  }

  function urlToUid(url: string): string {
    return url.startsWith('/card/') ? url.slice('/card/'.length) : url;
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

    const { path, search } = serialiseStack(state, paramsByKey, manifestLookup);
    historyFn(null, '', `${path}${search}`);
  }

  async function replaceSlot(url: string) {
    const uid = urlToUid(url);
    const ok = await fetchAndCacheCard(uid);
    if (!ok) return;
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

    if (clickedLink && startVT) {
      // Phase 1: panel link morphs into card header position immediately
      skipBodyOpen.add(uid);
      (clickedLink as HTMLElement).style.viewTransitionName = 'panel-card-open';

      const vt = startVT(() => {
        flushSync(doUpdate);
        const newCard = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
        if (newCard) newCard.style.viewTransitionName = 'panel-card-open';
        if (homepage) homepage.hidden = true;
      });

      await vt.finished;
      skipBodyOpen.delete(uid);
      (clickedLink as HTMLElement).style.viewTransitionName = '';
      const vtCard = document.querySelector<HTMLElement>(`[data-uid="${CSS.escape(uid)}"]`);
      if (vtCard) vtCard.style.viewTransitionName = '';

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

  async function closeCard(uid: string) {
    const state = get(stackStore);
    const idx = state.entries.findIndex(e => e.key === uid);
    if (idx === -1) return;

    cardParams.delete(uid);
    const newEntries = state.entries.slice(0, idx);
    const homepage = document.getElementById('homepage');

    if (newEntries.length === 0) {
      // Stack becomes empty — return to homepage
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

      // Fetch homepage content if empty (direct URL navigation)
      if (homepage && homepage.children.length === 0) {
        const res = await fetch('/');
        if (res.ok) {
          const tmp = document.createElement('div');
          tmp.innerHTML = await res.text();
          const fetched = tmp.querySelector('#homepage');
          if (fetched) homepage.innerHTML = fetched.innerHTML;
        }
      }

      const matchingLink = homepage?.querySelector<HTMLElement>(`.card-link[data-push-card="${uid}"]`);

      if (matchingLink && startVT && el) {
        el.style.viewTransitionName = 'panel-card-close';
        matchingLink.style.viewTransitionName = 'panel-card-close';

        const vt = startVT(() => {
          flushSync(() => stackStore.set({ entries: [], activeKey: null }));
          if (homepage) homepage.hidden = false;
          history.pushState(null, '', '/');
        });

        await vt.finished;
        matchingLink.style.viewTransitionName = '';
      } else {
        stackStore.set({ entries: [], activeKey: null });
        if (homepage) {
          homepage.hidden = false;
        } else {
          window.location.href = '/';
        }
        history.pushState(null, '', '/');
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
        replaceSlot(uidToFetchUrl(replaceItem.dataset.replaceSlot));
        return;
      }

      const pushItem = target.closest<HTMLElement>('[data-push-card]');
      if (pushItem?.dataset.pushCard) {
        pushCard(uidToFetchUrl(pushItem.dataset.pushCard));
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
        pushCard(filterUrlForTagValue(tagLink.getAttribute('href')!.slice(4)));
        return;
      }
      const colLink = (e.target as Element).closest<HTMLAnchorElement>('a[href^="collection:"]');
      if (colLink) {
        e.preventDefault();
        const colHref = colLink.getAttribute('href')!.slice(11);
        const action = parseCollectionLink(colHref);
        if (action.type === 'filter') {
          // Navigate to browse view with filter pre-applied, encoding the current stack
          // in the URL so the front page can render a breadcrumb trail back to here.
          const stackUids = get(stackStore).entries.map(e => e.uid);
          window.location.href = appendStackToUrl(stackUids, action.url);
        } else {
          if (action.params) cardParams.set(action.uid, action.params);
          pushCard(`/card/${action.uid}`);
        }
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
        if (homepage) homepage.hidden = false;
        return;
      }
      if (path.startsWith('/card/')) {
        const uid = path.slice('/card/'.length);
        const ok = await fetchAndCacheCard(uid);
        if (ok) {
          stackStore.update(s => pushToStack(s, cardEntry(uid)));
          markReadIfKnown(uid);
          if (homepage) homepage.hidden = true;
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

<div id="card-stack" hidden={!hasCards}>
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
